import { useCallback, useEffect, useState } from "react";
import { Shell } from "./components/Shell";
import { ComingSoon } from "./components/ComingSoon";
import { TodayView } from "./views/TodayView";
import { IntelligenceView } from "./views/IntelligenceView";
import { generateDataset } from "./lib/mockData";
import { PALETTE_ROUTES, type RouteKey } from "./components/routes";
import type { OrgDataset } from "./lib/types";

// ─────────────────────────────────────────────────────────────
// App — entry point. Hash-based routing across the 10 Leados
// modules (+ settings). Today and Intelligence are instrumented;
// everything else renders ComingSoon with its scheduled part.
// ─────────────────────────────────────────────────────────────

function readRoute(): RouteKey {
  const hash = window.location.hash.replace("#", "") as RouteKey;
  const valid = PALETTE_ROUTES.some((r) => r.key === hash);
  return valid ? hash : "today";
}

export default function App() {
  const [route, setRoute] = useState<RouteKey>(readRoute());
  const [dataset, setDataset] = useState<OrgDataset>(() => generateDataset(42));
  const [isRunning, setIsRunning] = useState(false);
  const [seed, setSeed] = useState(42);

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const navigate = useCallback((r: RouteKey) => {
    window.location.hash = r;
    setRoute(r);
  }, []);

  const runAnalysis = useCallback(() => {
    setIsRunning(true);
    window.setTimeout(() => {
      const nextSeed = seed + 1;
      setSeed(nextSeed);
      setDataset(generateDataset(nextSeed));
      setIsRunning(false);
    }, 1400);
  }, [seed]);

  return (
    <Shell dataset={dataset} route={route} onNavigate={navigate} isRunning={isRunning} onRunAnalysis={runAnalysis}>
      <RouteOutlet route={route} dataset={dataset} />
    </Shell>
  );
}

function RouteOutlet({ route, dataset }: { route: RouteKey; dataset: OrgDataset }) {
  switch (route) {
    case "today":
      return <TodayView dataset={dataset} />;
    case "intelligence":
      return <IntelligenceView dataset={dataset} />;
    case "people":
      return <ComingSoon name="People" plannedPart="Part 5" />;
    case "strategy":
      return <ComingSoon name="Strategy" plannedPart="Part 4" />;
    case "finance":
      return <ComingSoon name="Finance" plannedPart="Part 3" />;
    case "execution":
      return <ComingSoon name="Execution" plannedPart="Part 6" />;
    case "signals":
      return <ComingSoon name="Signal Board" plannedPart="Part 7" />;
    case "knowledge":
      return <ComingSoon name="Knowledge" plannedPart="Part 9" />;
    case "data":
      return <ComingSoon name="Data" plannedPart="Part 10" />;
    case "health":
      return <ComingSoon name="Org Health" plannedPart="Part 8" />;
    case "settings":
      return <ComingSoon name="Settings" plannedPart="Part 11" />;
    default:
      return <TodayView dataset={dataset} />;
  }
}
