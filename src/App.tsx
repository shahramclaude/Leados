import { useCallback, useEffect, useMemo, useState } from "react";
import * as store from "./lib/core";
import { seedIfEmpty } from "./lib/seed";
import { project } from "./lib/core";
import { Shell } from "./components/Shell";
import { CommandPalette, type Route } from "./components/CommandPalette";
import { TodayView, DomainsView, LabView, HealthView, AboutView, LogView } from "./components/Views";
import { SynthesisView } from "./components/SynthesisView";

/**
 * Entry point for this delivery. See AI-SESSION-LOG.md / README.md for the
 * full verified-vs-fabricated disclosure. Short version: the real
 * github.com/wbweve/Leados App.tsx recognizes exactly
 * today/intelligence/data/health/about and falls back to "today" for
 * anything else — confirmed this session by raw-fetching that file.
 * #/synthesis below is this delivery's own addition, the one this brief
 * is actually about.
 */

const VALID_ROUTES: Route[] = ["today", "domains", "synthesis", "lab", "health", "about", "log"];

function routeFromHash(): Route {
  const h = window.location.hash.replace("#/", "") as Route;
  return VALID_ROUTES.includes(h) ? h : "today";
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash());
  const [events, setEvents] = useState<ReturnType<typeof store.load>>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [today] = useState(() => new Date());

  const reload = useCallback(() => {
    setEvents(store.load());
  }, []);

  useEffect(() => {
    seedIfEmpty();
    reload();
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("keydown", onKey);
    };
  }, [reload]);

  const P = useMemo(() => project(events), [events]);

  function navigate(r: Route) {
    window.location.hash = "#/" + r;
    setRoute(r);
  }

  return (
    <Shell route={route} navigate={navigate} onOpenPalette={() => setPaletteOpen(true)}>
      {route === "today" && <TodayView P={P} today={today} navigate={navigate} />}
      {route === "domains" && <DomainsView P={P} today={today} />}
      {route === "synthesis" && <SynthesisView P={P} today={today} reload={reload} />}
      {route === "lab" && <LabView P={P} reload={reload} />}
      {route === "health" && <HealthView P={P} />}
      {route === "about" && <AboutView />}
      {route === "log" && <LogView P={P} reload={reload} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} />
    </Shell>
  );
}
