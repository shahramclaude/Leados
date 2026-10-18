import { bayesian } from '../lib/bayesian';
import { engine, events } from '../lib/engine';
import { finIntel } from '../lib/finIntel';
import { healthScore } from '../lib/healthScore';
import type { AppState } from '../lib/types';
import { Badge, Card, Labeled, ProgressBar, SectionHeading } from './ui';

export function OverviewView({ state, today }: { state: AppState; today: number }) {
  const P = events.project(state);
  const findings = engine.run(P, today);
  const health = healthScore.compute(P, today);
  const runway = finIntel.runwayStatus(P, today);
  const beliefs = bayesian.computeAllBeliefs(P, today);

  return (
    <div className="space-y-8">
      <SectionHeading
        eyebrow="Today"
        title="Organizational snapshot"
        desc="Computed live from the event log below. Change data in the Signal Console tab and every number here, in Scenario Planning, and in Living Strategy recomputes."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Health score</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{health.overall}<span className="text-base font-medium text-slate-400">/100</span></div>
          <ProgressBar value={health.overall} colorClass={health.overall >= 70 ? 'bg-emerald-500' : health.overall >= 45 ? 'bg-amber-500' : 'bg-rose-500'} />
          <Labeled text={health.label} />
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Runway</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">
            {runway.runway_months ?? '—'}<span className="text-base font-medium text-slate-400"> mo</span>
          </div>
          <Badge variant={runway.status === 'HEALTHY' ? 'valid' : runway.status === 'TIGHT' ? 'degraded' : runway.status === 'CRITICAL' ? 'invalidated' : 'neutral'}>{runway.status}</Badge>
          <Labeled text={runway.label} />
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active findings</div>
          <div className="mt-1 text-3xl font-bold text-slate-900">{findings.findings.length}</div>
          <div className="text-sm text-slate-500">{findings.findings.filter((f) => f.sev >= 4).length} critical (sev ≥ 4)</div>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {findings.findings.slice(0, 3).map((f) => (
              <li key={f.id} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--sev-${f.sev})` }} />
                {f.title}
              </li>
            ))}
            {!findings.findings.length && <li className="text-slate-400">No active findings.</li>}
          </ul>
        </Card>
      </div>

      <div>
        <SectionHeading eyebrow="Bayesian beliefs" title="Uncertainty axes" desc={beliefs.label} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Object.entries(beliefs.beliefs).map(([key, b]: [string, any]) => (
            <Card key={key}>
              <div className="text-sm font-semibold text-slate-800">{b.question}</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900">{b.posteriorPct}%</span>
                <span className="text-xs text-slate-400">posterior (prior {Math.round(b.prior * 100)}%)</span>
              </div>
              <ProgressBar value={b.posteriorPct} colorClass={b.posteriorPct >= 60 ? 'bg-rose-500' : b.posteriorPct >= 35 ? 'bg-amber-500' : 'bg-emerald-500'} />
              <ul className="mt-3 space-y-1 text-xs text-slate-500">
                {b.signals.map((s: any) => (
                  <li key={s.name} className="flex justify-between">
                    <span>{s.name.replace(/_/g, ' ')}</span>
                    <span className="font-mono">{s.intensity}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
