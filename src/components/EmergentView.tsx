import type { AppState } from '../lib/types';
import { detectBehaviorChangePoints, detectFrequencyAnomalies, detectTemporalClustering } from '../lib/emergent';
import { Panel, Label } from './Shell';

export function EmergentView({ state, today }: { state: AppState; today: Date }) {
  const freq = detectFrequencyAnomalies(state.events, today);
  const temporal = detectTemporalClustering(state.events);
  const behavior = detectBehaviorChangePoints(state.events, state.roster, today);

  return (
    <div className="space-y-6">
      <Panel title="Frequency anomalies" subtitle="Poisson z-score: recent 30d vs. prior-90d baseline, per event type">
        {freq.anomalies.length === 0 ? (
          <Label>No frequency anomalies at |z| ≥ 2.0 right now.</Label>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-4">Event type</th>
                  <th className="pb-2 pr-4">Recent 30d</th>
                  <th className="pb-2 pr-4">Baseline</th>
                  <th className="pb-2 pr-4">z-score</th>
                  <th className="pb-2 pr-4">Direction</th>
                  <th className="pb-2">Severity</th>
                </tr>
              </thead>
              <tbody>
                {freq.anomalies.map((a) => (
                  <tr key={a.eventType} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-mono text-xs">{a.eventType}</td>
                    <td className="py-2 pr-4">{a.recent30d}</td>
                    <td className="py-2 pr-4">{a.baseline30d}</td>
                    <td className="py-2 pr-4">{a.zScore}</td>
                    <td className="py-2 pr-4">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.direction === 'SPIKE' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
                        {a.direction}
                      </span>
                    </td>
                    <td className="py-2">{a.severity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              {freq.anomalies.map((a) => (
                <li key={a.eventType}>• {a.interpretation}</li>
              ))}
            </ul>
          </div>
        )}
        <Label>{freq.label}</Label>
      </Panel>

      <Panel title="Temporal co-occurrence clusters" subtitle="Event-type pairs that co-occur within 7 days far more than chance would predict">
        {temporal.clusters.length === 0 ? (
          <Label>No qualifying co-occurrence clusters right now (need ratio &gt; 2× expected and ≥ 2 co-occurrences).</Label>
        ) : (
          <div className="space-y-3">
            {temporal.clusters.map((c) => (
              <div key={c.typeA + c.typeB} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-mono text-xs text-indigo-600">{c.typeA} ⟷ {c.typeB}</div>
                <p className="mt-1 text-slate-700">{c.interpretation}</p>
                <p className="mt-1 text-slate-500">{c.hypothesis}</p>
                <p className="mt-1 text-xs text-slate-400">observed {c.coOccurrences} · expected ≈ {c.expectedRate} · ratio {c.ratio}×</p>
              </div>
            ))}
          </div>
        )}
        <Label>{temporal.label}</Label>
      </Panel>

      <Panel title="Behavioral change points" subtitle="CUSUM control chart on weekly event-frequency bins, per person">
        {behavior.changePoints.length === 0 ? (
          <Label>No sustained per-person frequency shifts detected right now.</Label>
        ) : (
          <div className="space-y-3">
            {behavior.changePoints.map((c) => (
              <div key={c.person.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium text-slate-900">{c.person.name} <span className="text-slate-400">· {c.person.role}, {c.person.team}</span></div>
                <p className="mt-1 text-slate-700">
                  Weekly event frequency shifted from ~{c.preMean}/wk to ~{c.postMean}/wk (
                  <span className={c.direction === 'INCREASE' ? 'text-rose-600' : 'text-blue-600'}>{c.direction}</span>) starting around week {c.changeWeek}.
                </p>
              </div>
            ))}
          </div>
        )}
        <Label>{behavior.label} Labeled: a change point indicates a shift in event frequency, not its meaning — investigate before acting.</Label>
      </Panel>
    </div>
  );
}
