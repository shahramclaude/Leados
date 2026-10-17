import { useEffect, useMemo, useState } from "react";
import { Shell, type Route } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { DomainsView } from "./components/DomainsView";
import { DecisionsView } from "./components/DecisionsView";
import { AestheticsView } from "./components/AestheticsView";
import { HealthView } from "./components/HealthView";
import { LogView } from "./components/LogView";
import { AboutView } from "./components/AboutView";
import {
  appendEvent,
  loadState,
  nextId,
  project,
  seedIfEmpty,
  type DomainKey,
  type StoreState,
} from "./lib/core";
import { resetFamiliarity } from "./lib/familiarity";
import { chromaticAdaptation, type DensityMode } from "./lib/aesthetics";

function routeFromHash(): Route {
  const h = window.location.hash.replace("#/", "") as Route;
  const valid: Route[] = ["today", "domains", "decisions", "aesthetics", "health", "log", "about"];
  return valid.includes(h) ? h : "today";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [state, setState] = useState<StoreState>(() => seedIfEmpty(loadState()));

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Time-of-day chromatic adaptation filter applied to the whole app, recomputed on load only.
  useEffect(() => {
    const chroma = chromaticAdaptation();
    document.body.style.filter = chroma.filterCss;
  }, []);

  const projection = useMemo(() => project(state), [state]);

  function navigate(r: Route) {
    window.location.hash = `/${r}`;
    setRoute(r);
  }

  function handleLogDecision(d: { domain: DomainKey; title: string; impact: number; reversibility: number }) {
    setState((prev) => {
      const id = nextId(prev, "ev");
      const decisionId = nextId(prev, "dec");
      return appendEvent(prev, {
        id,
        type: "decision.logged",
        ts: Date.now(),
        domain: d.domain,
        decisionId,
        title: d.title,
        impact: d.impact,
        reversibility: d.reversibility,
      });
    });
  }

  function handleDensityChange(mode: DensityMode) {
    setState((prev) => {
      const next = { ...prev, meta: { ...prev.meta, densityMode: mode } };
      localStorage.setItem("leados-pt-j:data", JSON.stringify(next));
      return next;
    });
  }

  function handleResetFamiliarity() {
    resetFamiliarity();
    setState((prev) => ({ ...prev }));
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "leados-pt-j-export.json";
    a.click();
  }

  function handleWipe() {
    if (!window.confirm("Wipe all local data and reseed?")) return;
    localStorage.removeItem("leados-pt-j:data");
    const fresh = seedIfEmpty(loadState());
    setState(fresh);
  }

  return (
    <Shell
      route={route}
      onNavigate={navigate}
      densityMode={state.meta.densityMode}
      onDensityChange={handleDensityChange}
      onResetFamiliarity={handleResetFamiliarity}
    >
      {route === "today" && <TodayView findings={projection.findings} />}
      {route === "domains" && <DomainsView scores={projection.domainScores} />}
      {route === "decisions" && <DecisionsView decisions={projection.decisions} onLog={handleLogDecision} />}
      {route === "aesthetics" && <AestheticsView densityMode={state.meta.densityMode} />}
      {route === "health" && <HealthView />}
      {route === "log" && <LogView events={state.events} onExport={handleExport} onWipe={handleWipe} />}
      {route === "about" && <AboutView />}
    </Shell>
  );
}
