import { useState } from "react";
import { Shell } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { TalentView } from "./components/TalentView";
import { FinancialView } from "./components/FinancialView";
import { RegulatoryView } from "./components/RegulatoryView";
import { NarrativeView } from "./components/NarrativeView";
import { PhysicsView } from "./components/PhysicsView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [state, setState] = useState<AppState>(() => loadState());

  return (
    <Shell route={route} navigate={navigate}>
      {route === "/today" && <TodayView state={state} setState={setState} />}
      {route === "/talent" && <TalentView state={state} />}
      {route === "/financial" && <FinancialView state={state} />}
      {route === "/regulatory" && <RegulatoryView state={state} />}
      {route === "/narrative" && <NarrativeView state={state} />}
      {route === "/physics" && <PhysicsView state={state} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
