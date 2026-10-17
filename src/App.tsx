import { useState } from "react";
import { Shell } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { LandscapeView } from "./components/LandscapeView";
import { WargameView } from "./components/WargameView";
import { RegistersView } from "./components/RegistersView";
import { IntelLogView } from "./components/IntelLogView";
import { EventLogView } from "./components/EventLogView";
import { AboutView } from "./components/AboutView";
import { useHashRoute } from "./lib/useHashRoute";
import { loadState } from "./lib/store";
import type { AppState } from "./lib/types";

export default function App() {
  const [route, navigate] = useHashRoute("/today");
  const [state, setState] = useState<AppState>(() => loadState());

  return (
    <Shell route={route} navigate={navigate}>
      {route === "/today" && <TodayView state={state} navigate={navigate} />}
      {route === "/landscape" && <LandscapeView state={state} />}
      {route === "/wargame" && <WargameView state={state} setState={setState} />}
      {route === "/registers" && <RegistersView state={state} />}
      {route === "/log" && <IntelLogView state={state} setState={setState} />}
      {route === "/events" && <EventLogView state={state} setState={setState} />}
      {route === "/about" && <AboutView />}
    </Shell>
  );
}
