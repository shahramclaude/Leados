"use client";
import { useEffect, useState } from "react";
import { useIntelligence } from "@/hooks/useIntelligence";
import { HealthWidget } from "./HealthWidget";
import { ProactiveRail } from "./ProactiveRail";
import { CommandPalette } from "./CommandPalette";
import { TodayView } from "./views/TodayView";
import { RosterView } from "./views/RosterView";
import { IntelligenceView } from "./views/IntelligenceView";
import { SimulationView } from "./views/SimulationView";
import { AttentionView } from "./views/AttentionView";
import { DecisionsView } from "./views/DecisionsView";
import { WorkQueueView } from "./views/WorkQueueView";
import { HypothesesView } from "./views/HypothesesView";
import { HealthWallView } from "./views/HealthWallView";
import { AuditView } from "./views/AuditView";
import { SettingsView } from "./views/SettingsView";

type Route =
  | "today"
  | "roster"
  | "intelligence"
  | "simulation"
  | "attention"
  | "decisions"
  | "work-queue"
  | "hypotheses"
  | "health"
  | "audit"
  | "settings";

const NAV: Array<{ id: Route; icon: string; label: string }> = [
  { id: "today", icon: "🧭", label: "Today" },
  { id: "roster", icon: "👥", label: "People" },
  { id: "intelligence", icon: "🧠", label: "Intel" },
  { id: "simulation", icon: "🔮", label: "Simulate" },
  { id: "attention", icon: "🎯", label: "Plan" },
  { id: "decisions", icon: "⚖️", label: "Decisions" },
  { id: "work-queue", icon: "📦", label: "Queue" },
  { id: "hypotheses", icon: "🔬", label: "Hypotheses" },
  { id: "health", icon: "🏥", label: "Health" },
  { id: "audit", icon: "🧾", label: "Audit" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

export function Shell() {
  const [route, setRoute] = useState<Route>("today");
  const [cmdOpen, setCmdOpen] = useState(false);
  const { data, loading, error, lastUpdated, refetch } = useIntelligence();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
      if (e.key === "Escape") setCmdOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const routeView = () => {
    if (!data) return null;
    switch (route) {
      case "today":
        return <TodayView data={data} onNavigate={(r: string) => setRoute(r as Route)} />;
      case "roster":
        return <RosterView data={data} />;
      case "intelligence":
        return <IntelligenceView data={data} />;
      case "simulation":
        return <SimulationView data={data} />;
      case "attention":
        return <AttentionView data={data} />;
      case "decisions":
        return <DecisionsView data={data} onRefetch={refetch} />;
      case "work-queue":
        return <WorkQueueView data={data} onRefetch={refetch} />;
      case "hypotheses":
        return <HypothesesView data={data} onRefetch={refetch} />;
      case "health":
        return <HealthWallView data={data} />;
      case "audit":
        return <AuditView />;
      case "settings":
        return <SettingsView data={data} onRefetch={refetch} />;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ background: "#0a0c10", color: "#e2e8f0" }}>
      {/* HEADER */}
      <header
        className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-800"
        style={{ background: "#0d1016" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-600 flex items-center justify-center font-bold text-xs text-white">
            L
          </div>
          <div>
            <div className="font-semibold text-slate-100 leading-tight">LeadOS</div>
            <div className="text-[10px] text-slate-500 leading-tight font-mono">
              {data ? `${data.findings.length} findings · ${data.eventCount} events` : "loading…"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCmdOpen(true)}
            className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300"
          >
            Ask / command…
            <kbd className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">⌘K</kbd>
          </button>

          {data && <HealthWidget healthScore={data.healthScore} />}

          <div className="text-[10px] text-slate-600 font-mono">{lastUpdated ? lastUpdated.toLocaleTimeString() : "—"}</div>

          {error && <div className="text-[10px] text-red-400 bg-red-950/30 px-2 py-1 rounded">⚠ {error}</div>}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* NAV RAIL */}
        <nav className="w-16 shrink-0 flex flex-col items-center py-3 gap-1 border-r border-slate-800 overflow-y-auto" style={{ background: "#0d1016" }}>
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setRoute(n.id)}
              className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center text-[9px] gap-0.5 transition-colors ${
                route === n.id ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:bg-slate-900 hover:text-slate-300"
              }`}
              title={n.label}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        {/* MAIN CONTENT */}
        <main className="flex-1 min-w-0 overflow-auto">
          {loading && !data && (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <div className="text-3xl mb-2">⟳</div>
                <div className="text-sm">Loading intelligence…</div>
              </div>
            </div>
          )}
          {data && <div className="p-5">{routeView()}</div>}
        </main>

        {/* PROACTIVE RAIL */}
        {data && (
          <ProactiveRail
            highestLeverageAction={data.highestLeverageAction}
            attentionPlan={data.attentionPlan}
            beliefs={data.beliefs}
            flightRisk={data.flightRisk}
            temporalMode={data.temporalMode}
          />
        )}
      </div>

      {cmdOpen && data && (
        <CommandPalette data={data} onClose={() => setCmdOpen(false)} onNavigate={(r) => { setRoute(r as Route); setCmdOpen(false); }} />
      )}
    </div>
  );
}
