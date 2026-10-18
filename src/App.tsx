import { useEffect, useState } from "react";
import { Shell, type TabId } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { SignalBoardView } from "./components/SignalBoardView";
import { BeliefsView } from "./components/BeliefsView";
import { AboutView } from "./components/AboutView";
import { loadState, saveState } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [tab, setTab] = useState<TabId>("today");
  const [state, setState] = useState<AppState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  return (
    <Shell active={tab} onNavigate={setTab}>
      {tab === "today" && <TodayView state={state} onNavigate={setTab} />}
      {tab === "signals" && <SignalBoardView state={state} onChange={setState} />}
      {tab === "beliefs" && <BeliefsView state={state} />}
      {tab === "about" && <AboutView />}
    </Shell>
  );
}
