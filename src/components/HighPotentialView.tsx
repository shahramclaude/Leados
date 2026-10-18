import type { Projection } from '../lib/types';
import { identifyHighPotential } from '../lib/extras';
import { Card, SectionTitle, Tag, Callout } from './ui';

export function HighPotentialView({ P, today }: { P: Projection; today: string }) {
  const results = identifyHighPotential(P, today);
  return (
    <div className="space-y-6">
      <SectionTitle title="High-Potential Identification" subtitle="Original, simplified heuristic (not a trained model) combining feedback balance, engagement, growth-plan activity, and low conflict." />
      <Callout tone="amber"><Tag kind="ASSUMED" /> <span className="ml-1">Weights are illustrative, not empirically fit to this org's actual promotion/performance outcomes \u2014 there isn't enough data in this demo for that.</span></Callout>
      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.person.id}>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-900">{r.person.name}</div>
                <div className="text-xs text-slate-400">{r.person.title} \u00b7 {r.person.team}</div>
              </div>
              <div className="text-2xl font-bold text-indigo-600">{Math.round(r.score * 100)}</div>
            </div>
            {r.reasons.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {r.reasons.map((reason, i) => (
                  <li key={i} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs text-indigo-700">{reason}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
