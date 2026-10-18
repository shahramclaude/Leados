import type { Projection } from '../lib/types';
import { run } from '../lib/engine';
import { computeFlightRisk } from '../lib/flightRisk';
import { buildCausalGraph } from '../lib/causal';
import { Card, SectionTitle, RiskPill, Tag, Callout } from './ui';

export function TodayView({ P, today, navigate }: { P: Projection; today: string; navigate: (r: string) => void }) {
  const findings = run(P, today).findings;
  const flight = computeFlightRisk(P, today);
  const graph = buildCausalGraph(P, today);
  const confirmed = graph.edges.filter((e) => e.type === 'CONFIRMED').length;
  const evidenced = graph.edges.filter((e) => e.type === 'EVIDENCED').length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Today"
        subtitle={`Demo org snapshot \u2014 ${P.people.length} active people, ${P.state.events.length} logged events. All data is synthetic.`}
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Active findings</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{findings.length}</div>
          <div className="mt-1 text-xs text-slate-500">Rule-based, disclosed-fabricated (engine.ts)</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">High flight risk</div>
          <div className="mt-2 text-3xl font-bold text-rose-600">{flight.highRisk.length}</div>
          <div className="mt-1 text-xs text-slate-500">of {flight.scores.length} people \u00b7 model quality {flight.modelQuality}</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Causal edges</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{graph.edges.length}</div>
          <div className="mt-1 text-xs text-slate-500">{evidenced} evidenced \u00b7 {confirmed} confirmed by you</div>
        </Card>
        <Card>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Historical departures</div>
          <div className="mt-2 text-3xl font-bold text-slate-900">{flight.historicalDepartures}</div>
          <div className="mt-1 text-xs text-slate-500">Used to calibrate the flight-risk signature</div>
        </Card>
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900">Highest flight-risk people</h3>
          <button onClick={() => navigate('/roster')} className="text-xs font-semibold text-indigo-600 hover:underline">
            View full roster \u2192
          </button>
        </div>
        <div className="space-y-2">
          {flight.scores.slice(0, 5).map((s) => (
            <div key={s.person.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-slate-800">{s.person.name}</div>
                <div className="text-xs text-slate-400">{s.person.title} \u00b7 {s.person.team}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">{Math.round(s.riskScore * 100)}%</span>
                <RiskPill level={s.riskLevel} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h3 className="mb-2 font-semibold text-slate-900">Active findings</h3>
        {findings.length === 0 ? (
          <p className="text-sm text-slate-500">No findings right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {findings.map((f) => (
              <li key={f.id} className="flex items-center gap-2 text-sm text-slate-700">
                <span className={`h-2 w-2 rounded-full ${f.severity === 'high' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                {f.label}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Callout tone="amber">
        <Tag kind="DISCLOSED GAP" /> <span className="ml-1">This build implements the two fully-specified pt-Q engines (Causal Model, Flight Risk) plus three original lightweight additions
        (High Potential, Power Network, Meeting Intelligence). Several other named pt-Q capabilities are not implemented \u2014 see About / Provenance for the full list and why.</span>
      </Callout>
    </div>
  );
}
