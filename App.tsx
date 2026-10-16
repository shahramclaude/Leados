import { useState } from "react";
import { Catalog } from "./dashboards/Catalog";
import { FinanceDashboard } from "./dashboards/FinanceDashboard";
import { PeopleDashboard } from "./dashboards/PeopleDashboard";
import { IntelligenceDashboard } from "./dashboards/IntelligenceDashboard";
import { SelfDashboard } from "./dashboards/SelfDashboard";
import { cn } from "./utils/cn";

type View = "catalog" | "finance" | "roster" | "intelligence" | "self" | "provenance";

const NAV: { id: View; label: string; hash: string }[] = [
  { id: "catalog", label: "Catalog", hash: "#/catalog" },
  { id: "finance", label: "Finance", hash: "#/finance" },
  { id: "roster", label: "People", hash: "#/roster" },
  { id: "intelligence", label: "Intelligence", hash: "#/intelligence" },
  { id: "self", label: "Self", hash: "#/self" },
  { id: "provenance", label: "Provenance", hash: "#/provenance" },
];

function ProvenanceView() {
  return (
    <div className="space-y-4" style={{ fontSize: "var(--text-sm)", color: "var(--ink-1)" }}>
      <h2 className="font-semibold">What was actually inspected before this was built</h2>
      <p>
        <code className="font-mono-ui">github.com/wbweve/Leados</code> was read directly this session (GitHub Git
        Trees API at <code className="font-mono-ui">main</code>, plus raw-file fetches) rather than trusted from
        memory. Findings:
      </p>
      <table className="w-full font-mono-ui" style={{ fontSize: "var(--text-xs)" }}>
        <thead>
          <tr style={{ color: "var(--ink-2)" }}>
            <th className="text-left font-normal">Claim</th>
            <th className="text-left font-normal">Status</th>
          </tr>
        </thead>
        <tbody>
          {[
            [
              "Repo tree at main (22 entries incl. App.tsx, main.tsx, vite.config.ts, package.json, index.html, store.js, events.js, engine.js, health.js, ui.js, playbooks.js, rules.js)",
              "VERIFIED via Git Trees API, truncated:false",
            ],
            [
              "The repo is itself a React + Vite + Tailwind + vite-plugin-singlefile project (identical toolchain to this sandbox)",
              "VERIFIED — package.json & vite.config.ts fetched and read in full",
            ],
            [
              "store.js (14,941 B): window.LeadOS namespace, single localStorage key, SCHEMA_VERSION=5, LINEAGE_TAG='pt-6'",
              "UNVERIFIED THIS SESSION — reported by a prior session's log; not re-fetched here (budget). Treat as hearsay.",
            ],
            [
              "engine.js / health.js / ui.js / playbooks.js internal logic",
              "NOT READ THIS SESSION — no claim made about their contents",
            ],
            [
              "A js/viz.js module exists in the live repo implementing this pt-C brief",
              "VERIFIED ABSENT — no path containing 'viz' appears anywhere in the fetched tree",
            ],
            [
              "Root index.html (65,239 B) is the built vite-plugin-singlefile output, not the dev template",
              "VERIFIED — raw fetch is dominated by a large inlined bundle; readability extraction only surfaced a static provenance banner",
            ],
          ].map(([claim, status]) => (
            <tr key={claim} style={{ borderTop: "1px solid var(--surface-2)" }}>
              <td className="py-1.5 pr-3">{claim}</td>
              <td style={{ color: status.startsWith("VERIFIED") ? "var(--sev-1)" : "var(--sev-4)" }}>{status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Conclusion:</strong> there is no real <code className="font-mono-ui">viz.js</code> to port. This
        build implements the pt-C brief's specification text as new React/SVG/Canvas components against clearly
        labeled sample data, inside this platform's mandatory React + Vite project shape (not the brief's literal
        "loose <code className="font-mono-ui">.js</code> files, zero build step" shape — this sandbox requires
        <code className="font-mono-ui"> src/App.tsx</code> + <code className="font-mono-ui">npm run build</code>).
        See <code className="font-mono-ui">AI-SESSION-LOG.md</code> for the full audit and every disclosed
        deviation.
      </p>
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("catalog");

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-2)" }}>
      <header className="border-b bg-white" style={{ borderColor: "var(--line)" }}>
        <div className="mx-auto max-w-[1180px] px-5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-semibold tracking-tight" style={{ fontSize: 16, color: "var(--ink-1)" }}>
                LeadOS <span style={{ color: "var(--accent)" }}>pt-C</span> — Data Visualization Engine
              </h1>
              <p className="font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
                Pure SVG + Canvas · zero charting library · zero CDN · every chart sourced
              </p>
            </div>
            <nav className="flex gap-1">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => setView(n.id)}
                  className={cn(
                    "rounded px-2.5 py-1.5 font-mono-ui transition-colors",
                    view === n.id ? "text-white" : ""
                  )}
                  style={{
                    fontSize: "var(--text-xs)",
                    background: view === n.id ? "var(--accent)" : "transparent",
                    color: view === n.id ? "white" : "var(--ink-2)",
                  }}
                >
                  {n.label}
                </button>
              ))}
            </nav>
          </div>
        </div>
        <div
          className="border-t px-5 py-1.5 text-center font-mono-ui"
          style={{ borderColor: "var(--line)", fontSize: "var(--text-2xs)", color: "var(--ink-3)", background: "var(--surface-1)" }}
        >
          This build independently inspected github.com/wbweve/Leados (Git Trees API + raw file reads) — no
          js/viz.js exists there. See the "Provenance" tab for the full audit.
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-5 py-5">
        {view === "catalog" && <Catalog />}
        {view === "finance" && <FinanceDashboard />}
        {view === "roster" && <PeopleDashboard />}
        {view === "intelligence" && <IntelligenceDashboard />}
        {view === "self" && <SelfDashboard />}
        {view === "provenance" && <ProvenanceView />}
      </main>

      <footer className="mx-auto max-w-[1180px] px-5 pb-8 pt-2 font-mono-ui" style={{ fontSize: "var(--text-2xs)", color: "var(--ink-3)" }}>
        All data on this page is fabricated sample data, clearly labeled as such in every chart caption. No network
        calls are made at runtime.
      </footer>
    </div>
  );
}
