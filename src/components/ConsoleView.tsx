import { useState } from 'react';
import type { AppState, Person } from '../lib/types';
import { Card, SectionHeading } from './ui';

export function ConsoleView({ state, onAddEvent }: { state: AppState; onAddEvent: (type: any, data: any) => void }) {
  const people = state.people.filter((p) => !p.archived);
  const [personId, setPersonId] = useState(people[0]?.id ?? '');
  const [moodScore, setMoodScore] = useState(5);
  const [kpiMetric, setKpiMetric] = useState('cash_balance');
  const [kpiValue, setKpiValue] = useState(0);

  const recent = [...state.events].sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 25);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Signal Console"
        title="Inject real events, watch beliefs / scenarios / strategy react"
        desc="Everything in Overview, Scenario Planning, and Living Strategy is recomputed live from this event log — nothing is cached per-tab."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="space-y-3">
          <div className="text-sm font-semibold text-slate-800">Log attrition</div>
          <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
            {people.map((p: Person) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => onAddEvent('hr.attrition.logged', { personId, reason: 'voluntary:console' })}
            className="w-full rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Log departure
          </button>
        </Card>

        <Card className="space-y-3">
          <div className="text-sm font-semibold text-slate-800">Log pulse mood</div>
          <input type="range" min={1} max={10} value={moodScore} onChange={(e) => setMoodScore(+e.target.value)} className="w-full" />
          <div className="text-xs text-slate-500">Score: {moodScore}/10</div>
          <button
            onClick={() => onAddEvent('pulse.mood.logged', { personId, score: moodScore })}
            className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Log pulse for selected person
          </button>
        </Card>

        <Card className="space-y-3">
          <div className="text-sm font-semibold text-slate-800">Log deal outcome</div>
          <div className="flex gap-2">
            <button onClick={() => onAddEvent('sales.deal.won', { dealId: `console-${Date.now()}`, amount: 15000, cycleDays: 30 })} className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700">
              Deal won
            </button>
            <button onClick={() => onAddEvent('sales.deal.lost', { dealId: `console-${Date.now()}`, reason: 'price', cycleDays: 30 })} className="flex-1 rounded-lg bg-slate-600 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">
              Deal lost
            </button>
          </div>
        </Card>

        <Card className="space-y-3 sm:col-span-3">
          <div className="text-sm font-semibold text-slate-800">Log financial KPI</div>
          <div className="flex flex-wrap gap-2">
            <select value={kpiMetric} onChange={(e) => setKpiMetric(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {['cash_balance', 'monthly_burn', 'gross_margin_pct', 'revenue_vs_target', 'nps_score'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input type="number" value={kpiValue} onChange={(e) => setKpiValue(+e.target.value)} className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
            <button onClick={() => onAddEvent('fin.kpi.logged', { metric: kpiMetric, value: kpiValue })} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
              Log KPI
            </button>
          </div>
        </Card>
      </div>

      <div>
        <SectionHeading title="Recent events" desc="Most recent 25, newest first." />
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="px-4 py-2">Time</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Data</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => (
                <tr key={e.id} className="border-b border-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-400">{new Date(e.ts).toLocaleString()}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-slate-600">{e.type}</td>
                  <td className="px-4 py-2 font-mono text-slate-500">{JSON.stringify(e.data)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
