import { useEffect, useState } from "react";
import { IntelligenceView } from "./components/IntelligenceView";
import { PROJECTION, TODAY } from "./lib/sampleData";

function useHashRoute(defaultRoute: string) {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, "") || defaultRoute);

  useEffect(() => {
    if (!window.location.hash) window.location.hash = defaultRoute;
    const onHashChange = () => setRoute(window.location.hash.replace(/^#/, "") || defaultRoute);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [defaultRoute]);

  return route;
}

export default function App() {
  const route = useHashRoute("/intelligence");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <TopBar route={route} />
      <main>
        {route === "/intelligence" ? (
          <IntelligenceView P={PROJECTION} today={TODAY} />
        ) : (
          <IntelligenceView P={PROJECTION} today={TODAY} />
        )}
      </main>
    </div>
  );
}

function TopBar({ route }: { route: string }) {
  return (
    <header
      className="sticky top-0 z-40 border-b backdrop-blur"
      style={{ borderColor: "var(--line)", background: "rgba(7,9,12,.82)" }}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg font-mono-ui text-sm font-bold"
            style={{ background: "rgba(110,168,254,.12)", color: "var(--accent)", border: "1px solid rgba(110,168,254,.3)" }}
          >
            L
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight" style={{ color: "var(--text)" }}>
              LEADOS
            </div>
            <div className="font-mono-ui text-[10px] uppercase tracking-[0.16em]" style={{ color: "var(--text-dim)" }}>
              Organizational Physics
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          <a
            href="#/intelligence"
            className="rounded-lg border px-3 py-1.5 font-mono-ui text-xs"
            style={{
              borderColor: route === "/intelligence" ? "var(--line2)" : "transparent",
              background: route === "/intelligence" ? "var(--panel)" : "transparent",
              color: route === "/intelligence" ? "var(--text)" : "var(--text-muted)",
            }}
          >
            ⟶ Intelligence
          </a>
        </nav>
      </div>
    </header>
  );
}
