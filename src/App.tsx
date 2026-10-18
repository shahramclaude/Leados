import { useCallback, useMemo, useState } from 'react';
import * as store from './lib/store';
import type { AgentProposal } from './lib/agent';
import { evaluateOpenHypotheses, generateFromAnomalies } from './lib/hypothesis';
import { detectBehaviorChangePoints, detectFrequencyAnomalies, detectTemporalClustering } from './lib/emergent';
import { computeCognitiveLoad } from './lib/cognitiveLoad';
import { Shell, type Route } from './components/Shell';
import { TodayView } from './components/TodayView';
import { HypothesisView } from './components/HypothesisView';
import { EmergentView } from './components/EmergentView';
import { AgentView } from './components/AgentView';
import { EventLogView } from './components/EventLogView';
import { AboutView } from './components/AboutView';

const TODAY = new Date();

export default function App() {
  const [route, setRoute] = useState<Route>('today');
  const [state, setState] = useState(() => store.load(TODAY));
  const [pendingProposals, setPendingProposals] = useState<AgentProposal[]>([]);

  const appendEvent = useCallback((type: string, data: Record<string, any>) => {
    setState((prev) => store.appendEvent(prev, { ts: new Date().toISOString(), type, data }));
  }, []);

  const handleLogHypothesis = useCallback(
    (hypothesisId: string) => {
      const preview = generateFromAnomalies(state.events, TODAY);
      const h = preview.hypotheses.find((x) => x.id === hypothesisId);
      if (!h) return;
      appendEvent('hypothesis.generated', h);
    },
    [state.events, appendEvent]
  );

  const handleLogResult = useCallback(
    (hypothesisId: string, outcome: 'confirmed' | 'refuted' | 'inconclusive', implication: string) => {
      appendEvent('hypothesis.result', { hypothesisId, outcome, implication });
    },
    [appendEvent]
  );

  const handleAuditEvents = useCallback(
    (types: string[]) => {
      types.forEach((t) => appendEvent('agent.executed', { task: t, authority: 1 }));
    },
    [appendEvent]
  );

  const handleAcceptProposal = useCallback(
    (p: AgentProposal) => {
      setState((prev) => {
        const withSetting = store.updateSettings(prev, { [p.setting]: p.proposedValue });
        return store.appendEvent(withSetting, {
          ts: new Date().toISOString(),
          type: 'agent.proposal.accepted',
          data: p,
        });
      });
    },
    []
  );

  const handleRejectProposal = useCallback((p: AgentProposal) => {
    appendEvent('agent.proposal.rejected', p);
  }, [appendEvent]);

  const handleReset = useCallback(() => {
    setState(store.resetToSeed(TODAY));
  }, []);

  const cognitiveLoad = useMemo(() => {
    const openHyp = evaluateOpenHypotheses(state.events, TODAY);
    const freq = detectFrequencyAnomalies(state.events, TODAY);
    const temporal = detectTemporalClustering(state.events);
    const behavior = detectBehaviorChangePoints(state.events, state.roster, TODAY);
    return computeCognitiveLoad({
      openFindings: freq.anomalies.length + temporal.clusters.length,
      openHypotheses: openHyp.length,
      emergentAnomalies: freq.anomalies.length + temporal.clusters.length + behavior.changePoints.length,
      pendingProposals: pendingProposals.length,
    });
  }, [state.events, state.roster, pendingProposals.length]);

  return (
    <Shell route={route} onNavigate={setRoute} cognitiveLoad={cognitiveLoad}>
      {route === 'today' && <TodayView state={state} today={TODAY} cognitiveLoad={cognitiveLoad} />}
      {route === 'hypothesis' && (
        <HypothesisView state={state} today={TODAY} onLogHypothesis={handleLogHypothesis} onLogResult={handleLogResult} />
      )}
      {route === 'emergent' && <EmergentView state={state} today={TODAY} />}
      {route === 'agent' && (
        <AgentView
          state={state}
          today={TODAY}
          onAuditEvents={handleAuditEvents}
          onAcceptProposal={(p) => {
            handleAcceptProposal(p);
            setPendingProposals((prev) => prev.filter((x) => x.id !== p.id));
          }}
          onRejectProposal={(p) => {
            handleRejectProposal(p);
            setPendingProposals((prev) => prev.filter((x) => x.id !== p.id));
          }}
          onProposalsChanged={setPendingProposals}
        />
      )}
      {route === 'log' && <EventLogView state={state} onReset={handleReset} />}
      {route === 'about' && <AboutView />}
    </Shell>
  );
}
