import { useState } from 'react';
import { events } from '../lib/engine';
import { livingDocs } from '../lib/livingDocs';
import type { AppState, Assumption } from '../lib/types';
import { Badge, Card, Labeled, SectionHeading } from './ui';

const METRIC_OPTIONS = ['win_rate', 'headcount', 'gross_margin_pct', 'nps_score', 'velocity', 'runway_months', 'team_engagement', 'attrition_count_90d'];

function emptyAssumption(n: number): Assumption {
  return { id: `A${n}`, statement: '', metric: 'win_rate', threshold: 0.4, operator: 'gte', critical: false };
}

export function LivingDocsView({
  state,
  today,
  onAddDoc,
}: {
  state: AppState;
  today: number;
  onAddDoc: (data: any) => void;
}) {
  const P = events.project(state);
  const evaluations = livingDocs.evaluateAll(P, today);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [objectives, setObjectives] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [assumptions, setAssumptions] = useState<Assumption[]>([emptyAssumption(1)]);

  const validity = (v: string): 'valid' | 'degraded' | 'invalidated' => (v === 'VALID' ? 'valid' : v === 'DEGRADED' ? 'degraded' : 'invalidated');

  function submit() {
    if (!title.trim() || !assumptions.length) return;
    onAddDoc({
      title: title.trim(),
      version: 1,
      ownerId: null,
      objectives: objectives.split('\n').map((s) => s.trim()).filter(Boolean),
      validUntil: validUntil ? new Date(validUntil).toISOString() : new Date(today + 90 * 864e5).toISOString(),
      assumptions: assumptions.filter((a) => a.statement.trim()),
    });
    setTitle('');
    setObjectives('');
    setValidUntil('');
    setAssumptions([emptyAssumption(1)]);
    setShowForm(false);
  }

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Part 3 — Living Strategy Documents"
        title="Strategy that checks itself against reality"
        desc="Each document's assumptions are re-tested against the live event log on every render. A strategy can be declared VALID, DEGRADED, or INVALIDATED — never silently assumed true."
      />

      <div className="flex justify-end">
        <button onClick={() => setShowForm((v) => !v)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">
          {showForm ? 'Cancel' : '+ New strategy document'}
        </button>
      </div>

      {showForm && (
        <Card className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase text-slate-400">Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. H1 Expansion Strategy" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-slate-400">Objectives (one per line)</label>
            <textarea value={objectives} onChange={(e) => setObjectives(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase text-slate-400">Valid until</label>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase text-slate-400">Assumptions</label>
            {assumptions.map((a, i) => (
              <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
                <input
                  className="sm:col-span-3 rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Statement, e.g. Win rate remains above 40%"
                  value={a.statement}
                  onChange={(e) => setAssumptions((arr) => arr.map((x, idx) => (idx === i ? { ...x, statement: e.target.value } : x)))}
                />
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={a.metric}
                  onChange={(e) => setAssumptions((arr) => arr.map((x, idx) => (idx === i ? { ...x, metric: e.target.value } : x)))}
                >
                  {METRIC_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={a.operator}
                  onChange={(e) => setAssumptions((arr) => arr.map((x, idx) => (idx === i ? { ...x, operator: e.target.value as Assumption['operator'] } : x)))}
                >
                  <option value="gte">≥</option>
                  <option value="lte">≤</option>
                  <option value="eq">=</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="rounded border border-slate-300 px-2 py-1 text-sm"
                  value={a.threshold}
                  onChange={(e) => setAssumptions((arr) => arr.map((x, idx) => (idx === i ? { ...x, threshold: parseFloat(e.target.value) || 0 } : x)))}
                />
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={!!a.critical}
                    onChange={(e) => setAssumptions((arr) => arr.map((x, idx) => (idx === i ? { ...x, critical: e.target.checked } : x)))}
                  />
                  critical
                </label>
              </div>
            ))}
            <button
              onClick={() => setAssumptions((arr) => [...arr, emptyAssumption(arr.length + 1)])}
              className="text-xs font-semibold text-indigo-600 hover:underline"
            >
              + add assumption
            </button>
          </div>
          <button onClick={submit} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Save strategy document
          </button>
        </Card>
      )}

      {!evaluations.length && <Card className="text-sm text-slate-500">No strategy documents logged yet. Add one above.</Card>}

      <div className="space-y-5">
        {evaluations.map((ev) => (
          <Card key={ev.docId}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-base font-semibold text-slate-900">{ev.title} <span className="text-xs font-normal text-slate-400">v{ev.version}</span></div>
                <div className="text-xs text-slate-400">Written {ev.daysSinceWritten}d ago · valid until {new Date(ev.validUntil).toLocaleDateString()}</div>
              </div>
              <Badge variant={validity(ev.validity)}>{ev.validity}</Badge>
            </div>

            {!!ev.objectives.length && (
              <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                {ev.objectives.map((o: string, i: number) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase text-slate-400">
                    <th className="py-1 pr-3">Assumption</th>
                    <th className="py-1 pr-3">Metric</th>
                    <th className="py-1 pr-3">Threshold</th>
                    <th className="py-1 pr-3">Current</th>
                    <th className="py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ev.assumptionResults.map((r: any) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2 pr-3 text-slate-700">{r.statement}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">{r.metric}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-500">
                        {r.operator} {r.threshold}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-700">{r.currentValue ?? '—'}</td>
                      <td className="py-2">
                        {r.insufficient_data ? (
                          <Badge variant="neutral">UNKNOWN</Badge>
                        ) : r.violated ? (
                          <Badge variant={r.critical ? 'invalidated' : 'degraded'}>VIOLATED{r.critical ? ' · critical' : ''}</Badge>
                        ) : (
                          <Badge variant="valid">PASSING</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className={`mt-4 rounded-lg p-3 text-sm font-medium ${ev.validity === 'VALID' ? 'bg-emerald-50 text-emerald-700' : ev.validity === 'DEGRADED' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
              {ev.requiredAction}
            </p>
            <Labeled text={ev.label} />
          </Card>
        ))}
      </div>
    </div>
  );
}
