import { useState } from 'react';
import { AboutView } from './components/AboutView';
import { ConsoleView } from './components/ConsoleView';
import { LivingDocsView } from './components/LivingDocsView';
import { OverviewView } from './components/OverviewView';
import { ScenariosView } from './components/ScenariosView';
import { Shell, type Tab } from './components/Shell';
import { useStore } from './lib/store';

export default function App() {
  const { state, addEvent, reset } = useStore();
  const [tab, setTab] = useState<Tab>('overview');
  const today = Date.now();

  return (
    <Shell active={tab} onChange={setTab} onReset={reset}>
      {tab === 'overview' && <OverviewView state={state} today={today} />}
      {tab === 'scenarios' && <ScenariosView state={state} today={today} />}
      {tab === 'living-docs' && <LivingDocsView state={state} today={today} onAddDoc={(data) => addEvent('strategy.doc', data)} />}
      {tab === 'console' && <ConsoleView state={state} onAddEvent={addEvent} />}
      {tab === 'about' && <AboutView />}
    </Shell>
  );
}
