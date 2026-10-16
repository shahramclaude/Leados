import { useEffect, useMemo, useRef, useState } from "react";
import * as store from "./lib/store";
import { project } from "./lib/engine";
import { useRoute } from "./lib/router";
import { Shell } from "./components/Shell";
import { CommandPalette } from "./components/CommandPalette";
import { EventTracerPanel, RuleExplainerPanel } from "./components/OverlayPanels";
import { TodayView } from "./views/TodayView";
import { RosterView } from "./views/RosterView";
import { PlaybooksView } from "./views/PlaybooksView";
import { FinanceView, IntelligenceView, SelfView } from "./views/DomainViews";
import { HealthView } from "./views/HealthView";
import { DataView } from "./views/DataView";
import { DigestView, ReviewView, SearchResultsView } from "./views/MiscViews";

function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), []);
  return store.getStore();
}

export default function App() {
  const storeState = useStore();
  const route = useRoute();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sessionAccessed = useRef<Set<string>>(new Set()).current;
  const today = useMemo(() => new Date(), [storeState]);
  const P = useMemo(() => project(storeState, today), [storeState, today]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", storeState.meta.theme === "dark");
  }, [storeState.meta.theme]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA";
      if (isK || isSlash) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = () => {}; // store subscription already drives re-render

  const basePath = route.path[0] || "today";
  const isOverlay = basePath === "trace" || basePath === "explain";

  function renderBase(path: string) {
    switch (path) {
      case "today":
        return <TodayView P={P} storeState={storeState} query={route.query} onChange={refresh} />;
      case "roster":
        return <RosterView P={P} storeState={storeState} personId={route.path[1]} />;
      case "playbooks":
        return <PlaybooksView P={P} storeState={storeState} playId={route.path[1]} personId={route.path[2]} />;
      case "finance":
        return <FinanceView P={P} storeState={storeState} />;
      case "intelligence":
        return <IntelligenceView P={P} storeState={storeState} />;
      case "self":
        return <SelfView P={P} storeState={storeState} />;
      case "health":
        return <HealthView P={P} storeState={storeState} query={route.query} />;
      case "data":
        return <DataView P={P} storeState={storeState} query={route.query} refresh={refresh} />;
      case "digest":
        return <DigestView P={P} storeState={storeState} refresh={refresh} />;
      case "review":
        return <ReviewView P={P} storeState={storeState} refresh={refresh} />;
      case "search":
        return <SearchResultsView P={P} storeState={storeState} rawQuery={route.path.slice(1).join("/") || ""} />;
      default:
        return <TodayView P={P} storeState={storeState} query={route.query} onChange={refresh} />;
    }
  }

  // For overlay routes (trace/explain) we keep rendering the last "real" base
  // route underneath, exactly like the brief's "opens over current view".
  const lastBase = useRef(basePath);
  if (!isOverlay) lastBase.current = basePath;

  return (
    <>
      <Shell
        currentPath={isOverlay ? lastBase.current : basePath}
        onOpenSearch={() => setPaletteOpen(true)}
        storeState={storeState}
        focusMode={focusMode}
      >
        {renderBase(isOverlay ? lastBase.current : basePath)}
      </Shell>

      {basePath === "trace" && route.path[1] && (
        <EventTracerPanel eventId={route.path[1]} P={P} storeState={storeState} onClose={() => (location.hash = `#/${lastBase.current}`)} />
      )}
      {basePath === "explain" && route.path[1] && (
        <RuleExplainerPanel ruleId={route.path[1]} P={P} storeState={storeState} onClose={() => (location.hash = `#/${lastBase.current}`)} />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        P={P}
        storeState={storeState}
        sessionAccessed={sessionAccessed}
        currentDomain={route.query.get("domain") || undefined}
        onNotify={setToast}
        onToggleFocus={() => setFocusMode((f) => !f)}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}

      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed bottom-4 right-4 z-50 rounded-full bg-violet-600 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-violet-700"
        >
          Exit focus mode
        </button>
      )}
    </>
  );
}
