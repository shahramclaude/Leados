import { useState } from 'react';
import type { Projection } from '../lib/types';
import { computeFlightRisk } from '../lib/flightRisk';
import { Card, SectionTitle, RiskPill, Callout, Tag } from './ui';

export function RosterView({ P, today }: { P: Projection; today: string }) {
  const flight = computeFlightRisk(P, today);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <SectionTitle title="Roster & Flight Risk" subtitle={flight.label} />
      <div className="space-y-3">
        {flight.scores.map((s) => (
          <Card key={s.person.id} className="cursor-pointer" >
            <div className="flex items-center justify-between" onClick={() => setOpenId(openId === s.person.id ? null : s.person.id)}>
              <div>
                <div className="font-semibold text-slate-900">{s.person.name}</div>
                <div className="text-xs text-slate-400">{s.person.title} \u00b7 {s.person.team} \u00b7 {s.person.level}</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-sm font-bold text-slate-800">{Math.round(s.riskScore * 100)}%</div>
                  <div className="text-[10px] uppercase text-slate-400">data: {s.dataQuality.level}</div>
                </div>
                <RiskPill level={s.riskLevel} />
              </div>
            </div>

            {openId === s.person.id && (
              <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                <Callout>{s.label}</Callout>
                {s.dataQuality.missingData.length > 0 && (
                  <Callout tone="amber">Missing data: {s.dataQuality.missingData.join(', ')}</Callout>
                )}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Fact label="Mean mood (60d)" value={s.signal.meanMood !== null ? s.signal.meanMood.toFixed(1) + '/10' : '\u2014'} />
                  <Fact label="Mood trend" value={s.signal.moodTrend !== null ? (s.signal.moodTrend * 10).toFixed(2) + '/wk' : '\u2014'} />
                  <Fact label="1:1 cadence ratio" value={s.signal.cadenceRatio.toFixed(2) + '\u00d7'} />
                  <Fact label="Feedback balance" value={s.signal.feedbackBalance !== null ? Math.round(s.signal.feedbackBalance * 100) + '% positive' : '\u2014'} />
                  <Fact label="Growth plan" value={s.signal.hasGrowthPlan ? 'Active' : 'None'} />
                  <Fact label="Conflicts (60d)" value={String(s.signal.recentConflicts)} />
                </div>
                {s.signalComponents.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Contributing factors</div>
                    <ul className="space-y-1.5">
                      {s.signalComponents.map((c, i) => (
                        <li key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-slate-700">{c.factor}</span>
                            <Tag kind={c.contribution === 'HIGH' ? 'CONFIRMED' : 'ASSUMED'} />
                          </div>
                          <div className="mt-1 text-slate-500">{c.value}</div>
                          <div className="mt-1 text-slate-600 italic">{c.action}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
