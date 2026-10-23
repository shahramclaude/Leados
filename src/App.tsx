import { lazy, Suspense, useEffect, useState } from "react";
import { MethodologyPage } from "@/components/MethodologyPage";
import type { SpatialRouteId } from "@/components/spatial/SpatialRoutes";

// Lazy-loaded: the entire spatial rendering layer (projection math, layout
// engines, canvas renderer, scene data) only downloads once a spatial route
// is visited. See docs/part49-spatial-analytics.md §Phase 3(a) and the
// bundle-budget measurement in scripts/verify.ts.
const SpatialRoutes = lazy(() => import("@/components/spatial/SpatialRoutes"));

type Route = "overview" | SpatialRouteId | "methodology";

const NAV: { id: Route; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "ecosystem", label: "Ecosystem space" },
  { id: "scenario-landscape", label: "Scenario landscape" },
  { id: "org-structure", label: "Org structure" },
  { id: "methodology", label: "Methodology" },
];

function routeFromUrl(): Route {
  const params = new URLSearchParams(window.location.search);
  const scene = params.get("scene");
  if (scene === "ecosystem" || scene === "scenario-landscape" || scene === "org-structure") return scene;
  if (window.location.hash === "#methodology") return "methodology";
  return "overview";
}

function SceneLoadingSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-live="polite">
      <p className="text-xs text-slate-500">Loading spatial layer (progressive level-of-detail)…</p>
      <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" />
      <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => (typeof window !== "undefined" ? routeFromUrl() : "overview"));

  useEffect(() => {
    if (route === "methodology") {
      window.location.hash = "methodology";
    } else if (route !== "overview") {
      window.history.replaceState(null, "", `?scene=${route}`);
    } else {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [route]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">
        Skip to main content
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">L</div>
            <div>
              <p className="text-sm font-semibold text-slate-900">LEADOS · Spatial Analytics</p>
              <p className="text-xs text-slate-500">Part 49 — ecosystem, scenario & org spatial views</p>
            </div>
          </div>
          <nav aria-label="Primary" className="flex flex-wrap gap-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={route === item.id ? "page" : undefined}
                onClick={() => setRoute(item.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 ${
                  route === item.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-6xl px-6 py-6">
        {route === "overview" && <Overview onNavigate={setRoute} />}
        {route === "methodology" && <MethodologyPage />}
        {(route === "ecosystem" || route === "scenario-landscape" || route === "org-structure") && (
          <Suspense fallback={<SceneLoadingSkeleton />}>
            <SpatialRoutes route={route} />
          </Suspense>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-xs text-slate-400">
        Depth encodes categorical separation only — never magnitude (mechanically enforced, see Methodology → Phase 4).
      </footer>
    </div>
  );
}

function Overview({ onNavigate }: { onNavigate: (r: Route) => void }) {
  const cards: { id: Route; title: string; body: string; badge: string }[] = [
    {
      id: "ecosystem",
      title: "Ecosystem & Dependency Space",
      body: "64 services, ~110 dependency edges. 3D orbit separates edge-crossings a flat layout can't. Includes a guided tour.",
      badge: "3D primary",
    },
    {
      id: "scenario-landscape",
      title: "Scenario Comparison Landscape",
      body: "48 twin-modeled scenarios across two drivers and an outcome axis — all three held as true position channels.",
      badge: "3D primary",
    },
    {
      id: "org-structure",
      title: "Org Structure Space",
      body: "~500-person hierarchy. A 2D icicle is the primary, information-complete view; 3D is an opt-in decorative toggle.",
      badge: "2D primary",
    },
  ];
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Spatial Analytics Engine</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Three scenes, each shipped with a mandatory 2D chart, sortable data table, and plain-language description.
          Every spatial encoding is declared up front and mechanically linted — magnitude data is never mapped to a
          depth cue. See the <button className="underline" onClick={() => onNavigate("methodology")}>Methodology</button> page
          for the full discovery → build → measurement record.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.id}
            onClick={() => onNavigate(c.id)}
            className="flex flex-col items-start gap-2 rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:border-indigo-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-600">{c.badge}</span>
            <span className="text-base font-semibold text-slate-900">{c.title}</span>
            <span className="text-sm text-slate-500">{c.body}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
