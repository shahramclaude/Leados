import { events } from '../lib/engine';
import { scenarios as scenariosLib } from '../lib/scenarios';
import type { AppState } from '../lib/types';
import { Badge, Card, Labeled, ProgressBar, SectionHeading } from './ui';

export function ScenariosView({ state, today }: { state: AppState; today: number }) {
  const P = events.project(state);
  const result = scenariosLib.buildScenarioSet(P, today);

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Part 2 — Federated Scenario Planning"
        title="A distribution of futures, each fully modeled"
        desc="Not one forecast: a 2×2 matrix built from your two highest-uncertainty Bayesian beliefs, each corner fully simulated through the findings engine and health score."
      />

      {result.axes && (result as any).axisBeliefs && (
        <Card className="bg-indigo-50/50">
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase text-indigo-500">Primary axis</div>
              <div className="font-medium text-slate-800">{(result as any).axisBeliefs.primary.question}</div>
              <div className="text-slate-500">{(result as any).axisBeliefs.primary.posteriorPct}% posterior — the most uncertain belief we hold</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-indigo-500">Secondary axis</div>
              <div className="font-medium text-slate-800">{(result as any).axisBeliefs.secondary.question}</div>
              <div className="text-slate-500">{(result as any).axisBeliefs.secondary.posteriorPct}% posterior — the second most uncertain belief</div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {result.scenarios.map((s: any) => (
          <Card key={s.name} className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: s.color }} />
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{s.name.replace(/_/g, ' ')}</div>
                <div className="mt-1 text-sm font-medium text-slate-800">{s.label}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">{s.probability}%</div>
                <div className="text-[11px] text-slate-400">directional probability</div>
              </div>
            </div>
            <ProgressBar value={s.probability} colorClass="bg-slate-800" />

            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-lg font-semibold text-slate-900">{s.organizationalState.healthScore}</div>
                <div className="text-[10px] uppercase text-slate-400">health</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-lg font-semibold text-slate-900">{s.organizationalState.findingCount}</div>
                <div className="text-[10px] uppercase text-slate-400">findings</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2">
                <div className="text-lg font-semibold text-slate-900">{s.organizationalState.criticalFindings}</div>
                <div className="text-[10px] uppercase text-slate-400">critical</div>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Top finding in this future: <span className="font-medium text-slate-700">{s.organizationalState.topFinding}</span></p>

            {!!s.requiredActions.length && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-400">Required actions</div>
                <ul className="mt-1 space-y-2">
                  {s.requiredActions.map((a: any, i: number) => (
                    <li key={i} className="rounded-lg border border-slate-100 bg-white p-2 text-xs">
                      <Badge variant={a.priority === 'IMMEDIATE' ? 'invalidated' : a.priority === 'THIS_WEEK' ? 'degraded' : 'neutral'}>{a.priority}</Badge>
                      <div className="mt-1 font-medium text-slate-700">{a.action}</div>
                      <div className="text-slate-400">{a.rationale}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!!s.leadingIndicators.length && (
              <div className="mt-4">
                <div className="text-xs font-semibold uppercase text-slate-400">Leading indicators to watch</div>
                <ul className="mt-1 space-y-1 text-xs text-slate-600">
                  {s.leadingIndicators.map((li: any, i: number) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{li.indicator}</span>
                      <span className="shrink-0 text-slate-400">{li.checkFrequency}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        ))}
      </div>

      <Labeled text={result.label} />
    </div>
  );
}
