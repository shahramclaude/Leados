import { useEffect, useMemo, useState } from 'react';
import { Shell, Tab } from './components/Shell';
import { OnboardingBanner } from './components/OnboardingBanner';
import { TodayView } from './components/TodayView';
import { RosterView } from './components/RosterView';
import { DocsView } from './components/DocsView';
import { MemoryView } from './components/MemoryView';
import { ImproveView } from './components/ImproveView';
import { AboutView } from './components/AboutView';
import { AppState, EventType, Settings } from './lib/types';
import { loadState, saveState, resetState, addPerson, appendEvent, updateSettings, dismissFinding, markPlaybookCompleted } from './lib/store';
import { seedSampleData } from './lib/seed';
import { run, filterActive } from './lib/engine';

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [tab, setTab] = useState<Tab>('today');
  const today = useMemo(() => new Date().toISOString(), []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const findings = useMemo(() => {
    const all = run(state, today);
    return filterActive(all, state.dismissed, today);
  }, [state, today]);

  return (
    <Shell active={tab} onChange={setTab}>
      {tab === 'today' && <OnboardingBanner state={state} findings={findings} onNavigate={setTab} />}
      <div className="mt-6">
        {tab === 'today' && (
          <TodayView
            state={state}
            findings={findings}
            today={today}
            onCapture={(type: EventType, data, personId) => setState((s) => appendEvent(s, type, data, personId))}
            onCompletePlaybook={(playId, personId) => setState((s) => markPlaybookCompleted(s, playId, personId))}
            onDismiss={(key, mode) => setState((s) => dismissFinding(s, key, mode))}
            onSeed={() => setState((s) => seedSampleData(s))}
            onReset={() => setState(() => resetState())}
          />
        )}
        {tab === 'roster' && (
          <RosterView state={state} onAdd={(name, role, reportsTo) => setState((s) => addPerson(s, name, role, reportsTo))} />
        )}
        {tab === 'docs' && <DocsView state={state} findings={findings} today={today} />}
        {tab === 'memory' && <MemoryView state={state} today={today} />}
        {tab === 'improve' && (
          <ImproveView
            state={state}
            findings={findings}
            today={today}
            onApplySettings={(patch: Partial<Settings>) => setState((s) => updateSettings(s, patch))}
          />
        )}
        {tab === 'about' && <AboutView />}
      </div>
    </Shell>
  );
}
