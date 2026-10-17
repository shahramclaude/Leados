import { useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { SignalBoardView } from "./components/SignalBoardView";
import { ThermodynamicsView } from "./components/ThermodynamicsView";
import { CasView } from "./components/CasView";
import { RiskView } from "./components/RiskView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState, saveState } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [state, setStateRaw] = useState<AppState>(() => loadState());

  const setState = (next: AppState) => {
    setStateRaw(next);
    saveState(next);
  };

  // Keep localStorage in sync if state is set elsewhere (defensive; setState above already persists).
  useEffect(() => {
    saveState(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Shell route={route} navigate={navigate}>
      {route === "/today" && <TodayView state={state} setState={setState} navigate={navigate} />}
      {route === "/signals" && <SignalBoardView state={state} setState={setState} />}
      {route === "/thermodynamics" && <ThermodynamicsView state={state} />}
      {route === "/cas" && <CasView state={state} />}
      {route === "/risk" && <RiskView state={state} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
