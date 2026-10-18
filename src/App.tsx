import { useCallback, useEffect, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { RosterView } from "./components/RosterView";
import { WorkspaceView } from "./components/WorkspaceView";
import { RiskView } from "./components/RiskView";
import { HealthView } from "./components/HealthView";
import { DataView } from "./components/DataView";
import { ProvenanceView } from "./components/ProvenanceView";
import { save, seedIfEmpty } from "./lib/store";
import type { AppState } from "./lib/types";

const VALID: Route[] = ["today", "roster", "workspace", "risk", "health", "data", "about"];

function routeFromHash(): Route {
  const h = window.location.hash.replace("#/", "") as Route;
  return VALID.includes(h) ? h : "today";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [state, setState] = useState<AppState>(() => seedIfEmpty());

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((r: Route) => {
    window.location.hash = "#/" + r;
    setRoute(r);
  }, []);

  const replaceState = useCallback((next: AppState) => {
    save(next);
    setState(next);
  }, []);

  return (
    <Shell route={route} onNavigate={navigate}>
      {route === "today" && <TodayView state={state} onReplace={replaceState} />}
      {route === "roster" && <RosterView state={state} onChange={replaceState} />}
      {route === "workspace" && <WorkspaceView state={state} onChange={replaceState} />}
      {route === "risk" && <RiskView state={state} />}
      {route === "health" && <HealthView />}
      {route === "data" && <DataView state={state} onReplace={replaceState} />}
      {route === "about" && <ProvenanceView />}
    </Shell>
  );
}
