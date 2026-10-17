import { useEffect, useMemo, useState, useCallback } from "react";
import * as store from "./lib/store";
import { seedIfEmpty } from "./lib/seed";
import { project } from "./lib/engine";
import type { LeadosEvent } from "./lib/types";
import { Shell, type Route } from "./components/Shell";
import { TodayView } from "./components/TodayView";
import { IntelligenceView } from "./components/IntelligenceView";
import { DataView } from "./components/DataView";
import { HealthView } from "./components/HealthView";
import { AboutView } from "./components/AboutView";

function routeFromHash(): Route {
  const h = window.location.hash.replace("#/", "") as Route;
  return (["today", "intelligence", "data", "health", "about"] as Route[]).includes(h) ? h : "today";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [events, setEvents] = useState<LeadosEvent[]>([]);
  const [today] = useState<Date>(() => new Date());

  const reload = useCallback(() => {
    setEvents(store.load());
  }, []);

  useEffect(() => {
    seedIfEmpty();
    reload();
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [reload]);

  const P = useMemo(() => project(events), [events]);

  function navigate(r: Route) {
    window.location.hash = "#/" + r;
    setRoute(r);
  }

  return (
    <Shell route={route} onNavigate={navigate}>
      {route === "today" && <TodayView P={P} today={today} />}
      {route === "intelligence" && <IntelligenceView P={P} today={today} />}
      {route === "data" && <DataView events={events} onChange={reload} />}
      {route === "health" && <HealthView events={events} today={today} />}
      {route === "about" && <AboutView />}
    </Shell>
  );
}
