import type { AppState } from '../lib/types';
import { computeDecisionVelocity, computeTeamEngagement, computeVelocityMean } from '../lib/metrics';
import { generateFromAnomalies, evaluateOpenHypotheses, learnFromResults } from '../lib/hypothesis';
import { detectBehaviorChangePoints, detectFrequencyAnomalies, detectTemporalClustering } from '../lib/emergent';
import type { CognitiveLoadResult } from '../lib/cognitiveLoad';
import { Panel, Stat, Label } from './Shell';

export function TodayView({ state, today, cognitiveLoad }: { state: AppState; today: Date; cognitiveLoad: CognitiveLoadResult }) {
  const events = state.events;
  const velocity = computeVelocityMean(events, today);
  const engagement = computeTeamEngagement(events, today);
  const decisionVelocity = computeDecisionVelocity(events, today);

  const hyp = generateFromAnomalies(events, today);
  const open = evaluateOpenHypotheses(events, today);
  const learning = learnFromResults(events);
  const freq = detectFrequencyAnomalies(events, today);
  const temporal = detectTemporalClustering(events);
  const behavior = detectBehaviorChangePoints(events, state.roster, today);

  return (
    <div className="space-y-6">
      <Panel title="Session snapshot" subtitle={`Computed live from ${events.length} events in your log, as of ${today.toDateString()}.`}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="30d velocity" value={velocity ?? '—'} tone={velocity !== null && velocity < 8 ? 'warn' : 'ok'} />
          <Stat label="30d engagement" value={engagement ?? '—'} tone={engagement !== null && engagement < 5 ? 'bad' : 'ok'} />
          <Stat label="Decisions / 30d" value={decisionVelocity} />
          <Stat label="Cognitive load" value={`${cognitiveLoad.level} (${cognitiveLoad.score})`} tone={cognitiveLoad.level === 'HIGH' ? 'bad' : cognitiveLoad.level === 'MEDIUM' ? 'warn' : 'ok'} />
        </div>
        <Label>{cognitiveLoad.label}</Label>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Hypothesis Engine" subtitle="Freshly generated from current anomalies">
          <div className="space-y-2 text-sm">
            <div>Un-logged candidates: <strong>{hyp.hypotheses.length}</strong></div>
            <div>Open &amp; tracked: <strong>{open.length}</strong></div>
            <div>Resolved: <strong>{learning.total}</strong> ({learning.confirmed} confirmed / {learning.refuted} refuted)</div>
          </div>
          <Label>{hyp.label}</Label>
        </Panel>
        <Panel title="Emergent Pattern Detector" subtitle="Not tied to any predefined rule">
          <div className="space-y-2 text-sm">
            <div>Frequency anomalies: <strong>{freq.anomalies.length}</strong></div>
            <div>Temporal co-occurrence clusters: <strong>{temporal.clusters.length}</strong></div>
            <div>Behavioral change points: <strong>{behavior.changePoints.length}</strong></div>
          </div>
          <Label>Methods: Poisson z-score, co-occurrence ratio, CUSUM control chart.</Label>
        </Panel>
        <Panel title="Autonomous Agent" subtitle="Three-level authority model">
          <div className="space-y-2 text-sm">
            <p>Go to the <strong>Autonomous Agent</strong> tab and run the loop to see Level 1 (autonomous), Level 2 (needs your confirmation), and Level 3 (escalated) tasks in action.</p>
          </div>
          <Label>Nothing is ever written to your data without explicit confirmation for Level 2+ actions.</Label>
        </Panel>
      </div>

      <Panel title="How to read this build" dense subtitle="One honest paragraph instead of marketing copy">
        <p className="text-sm text-slate-600">
          This is a synthetic sandbox: the roster and the ~{events.length}-event log were generated deterministically on
          first load (see <em>Event Log</em>) with a few deliberate anomalies seeded in, so the Hypothesis Engine and
          Emergent Pattern Detector have real signal to find instead of flat noise. Every number on this page is computed
          live from that log — nothing is hard-coded or pre-rendered.
        </p>
      </Panel>
    </div>
  );
}
