import { useMemo, useState } from 'react';
import { Shell } from './components/Shell';
import { TodayView } from './components/TodayView';
import { RosterView } from './components/RosterView';
import { CausalView } from './components/CausalView';
import { CounterfactualView } from './components/CounterfactualView';
import { HighPotentialView } from './components/HighPotentialView';
import { PowerNetworkView } from './components/PowerNetworkView';
import { MeetingView } from './components/MeetingView';
import { AboutView } from './components/AboutView';
import { useHashRoute } from './lib/useHashRoute';
import { loadState, resetState, appendEvent, project } from './lib/store';
import type { AppState } from './lib/types';

export default function App() {
  const [route, navigate] = useHashRoute('/today');
  const [state, setState] = useState<AppState>(() => loadState());
  const today = useMemo(() => new Date().toISOString(), []);
  const P = useMemo(() => project(state), [state]);

  const handleReset = () => setState(resetState());
  const handleAnnotate = (cause: string, effect: string, direction: 'DIRECT' | 'INVERSE', strength: number, note: string) => {
    setState(appendEvent(state, 'causal.annotation', { cause, effect, direction, strength, note }));
  };

  return (
    <Shell route={route} navigate={navigate} onReset={handleReset}>
      {route === '/today' && <TodayView P={P} today={today} navigate={navigate} />}
      {route === '/roster' && <RosterView P={P} today={today} />}
      {route === '/causal' && <CausalView P={P} today={today} onAnnotate={handleAnnotate} />}
      {route === '/counterfactual' && <CounterfactualView P={P} today={today} />}
      {route === '/highpotential' && <HighPotentialView P={P} today={today} />}
      {route === '/network' && <PowerNetworkView P={P} />}
      {route === '/meetings' && <MeetingView P={P} />}
      {route === '/about' && <AboutView />}
    </Shell>
  );
}
