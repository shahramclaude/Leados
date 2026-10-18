"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useIntelligence } from "@/hooks/useIntelligence";
import { ProactiveRail } from "@/components/leados/ProactiveRail";
import { CommandPalette } from "@/components/leados/CommandPalette";
import { TodayView } from "@/components/leados/views/TodayView";
import { RosterView } from "@/components/leados/views/RosterView";
import { IntelligenceView } from "@/components/leados/views/IntelligenceView";
import { SimulationView } from "@/components/leados/views/SimulationView";
import { AttentionView } from "@/components/leados/views/AttentionView";
import { DecisionsView } from "@/components/leados/views/DecisionsView";
import { WorkQueueView } from "@/components/leados/views/WorkQueueView";
import { HypothesesView } from "@/components/leados/views/HypothesesView";
import { HealthView } from "@/components/leados/views/HealthView";
import { AuditView } from "@/components/leados/views/AuditView";
import { SettingsView } from "@/components/leados/views/SettingsView";

export type ViewKey =
  | "today"
  | "roster"
  | "intelligence"
  | "simulation"
  | "attention"
  | "decisions"
  | "queue"
  | "hypotheses"
  | "health"
  | "audit"
  | "settings";

const NAV: { key: ViewKey; icon: string; label: string }[] = [
  { key: "today", icon: "🧭", label: "Today" },
  { key: "roster", icon: "👥", label: "People" },
  { key: "intelligence", icon: "🧠", label: "Intel" },
  { key: "simulation", icon: "🔮", label: "Simulate" },
  { key: "attention", icon: "🎯", label: "Plan" },
  { key: "decisions", icon: "⚖️", label: "Decide" },
  { key: "queue", icon: "📦", label: "Queue" },
  { key: "hypotheses", icon: "🔬", label: "Hypotheses" },
  { key: "health", icon: "🏥", label: "Health" },
  { key: "audit", icon: "🧾", label: "Audit" },
  { key: "settings", icon: "⚙️", label: "Settings" },
];

const MODE_COLORS: Record<string, string> = {
  REACTIVE: "bg-red-600/20 text-red-400 border-red-700/50",
  STRUCTURAL_STRESS: "bg-amber-600/20 text-amber-400 border-amber-700/50",
  STRATEGIC_DRIFT: "bg-cyan-600/20 text-cyan-400 border-cyan-700/50",
  BALANCED: "bg-green-600/20 text-green-400 border-green-700/50",
};

export function Shell() {
  const { data, loading, error, refetch } = useIntelligence();
  const [view, setView] = useState<ViewKey>("today");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [pendingG, setPendingG] = useState(false);
  const [expandPersonId, setExpandPersonId] = useState<number | null>(null);

  const navigate = useCallback((v: ViewKey, personId?: number) => {
    setView(v);
    if (typeof personId === "number") setExpandPersonId(personId);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      if (isTyping) return;

      if (pendingG) {
        setPendingG(false);
        if (e.key.toLowerCase() === "t") navigate("today");
        else if (e.key.toLowerCase() === "r") navigate("roster");
        else if (e.key.toLowerCase() === "i") navigate("intelligence");
        else if (e.key.toLowerCase() === "s") navigate("simulation");
        else if (e.key.toLowerCase() === "a") navigate("attention");
        return;
      }
      if (e.key.toLowerCase() === "g") {
        setPendingG(true);
        setTimeout(() => setPendingG(false), 1200);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingG, navigate]);

  const lastUpdated = useMemo(() => {
    if (!data?.generatedAt) return "";
    return new Date(data.generatedAt).toLocaleTimeString();
  }, [data?.generatedAt]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0c10] text-slate-200">
      {error && (
        <div className="shrink-0 border-b border-red-900/60 bg-red-950/60 px-4 py-1.5 text-center text-sm text-red-300">
          ⚠ API error — retrying in 30s
        </div>
      )}

      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-800 bg-[#0d1016] px-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
          <span className="font-semibold tracking-tight text-slate-100">LeadOS</span>
          {data && (
            <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs font-mono text-slate-400">
              {data.findings.length} findings
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {data && (
            <>
              <span className="text-2xl font-bold text-slate-100">{data.healthScore.overall}</span>
              <span className="rounded border border-slate-700 px-1.5 py-0.5 text-xs font-mono text-slate-400">
                {data.healthScore.grade}
              </span>
              <span className="text-sm text-slate-500">
                {data.healthScore.trend === "up" ? "▲" : data.healthScore.trend === "down" ? "▼" : "▬"}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200"
          >
            ⌘K
          </button>
          {data && (
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-mono ${MODE_COLORS[data.temporalMode] ?? "border-slate-700 text-slate-400"}`}
            >
              {data.temporalMode}
            </span>
          )}
          <span className="font-mono text-xs text-slate-500">{lastUpdated}</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-row">
        {/* Left rail */}
        <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-800 bg-[#0d1016] py-3">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.key)}
              title={item.label}
              className={`flex h-11 w-11 flex-col items-center justify-center rounded-xl text-[10px] leading-tight transition-colors ${
                view === item.key ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="mt-0.5">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main */}
        <main className="min-h-0 flex-1 overflow-auto p-6">
          {loading && !data ? (
            <div className="flex h-full w-full items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-slate-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />
                <span>Computing intelligence…</span>
              </div>
            </div>
          ) : data ? (
            <ViewRouter
              view={view}
              data={data}
              refetch={refetch}
              navigate={navigate}
              expandPersonId={expandPersonId}
              setExpandPersonId={setExpandPersonId}
            />
          ) : null}
        </main>

        {/* Right rail */}
        <aside className="w-72 shrink-0 overflow-auto border-l border-slate-800 bg-[#0d1016]">
          {data && <ProactiveRail data={data} navigate={navigate} refetch={refetch} />}
        </aside>
      </div>

      {paletteOpen && data && (
        <CommandPalette
          data={data}
          navigate={navigate}
          onClose={() => setPaletteOpen(false)}
          refetch={refetch}
        />
      )}
    </div>
  );
}

import type { IntelligenceData } from "@/lib/intelligence";

function ViewRouter({
  view,
  data,
  refetch,
  navigate,
  expandPersonId,
  setExpandPersonId,
}: {
  view: ViewKey;
  data: IntelligenceData;
  refetch: () => Promise<void>;
  navigate: (v: ViewKey, personId?: number) => void;
  expandPersonId: number | null;
  setExpandPersonId: (id: number | null) => void;
}) {
  switch (view) {
    case "today":
      return <TodayView data={data} navigate={navigate} />;
    case "roster":
      return (
        <RosterView
          data={data}
          refetch={refetch}
          expandPersonId={expandPersonId}
          setExpandPersonId={setExpandPersonId}
        />
      );
    case "intelligence":
      return <IntelligenceView data={data} refetch={refetch} />;
    case "simulation":
      return <SimulationView data={data} />;
    case "attention":
      return <AttentionView data={data} refetch={refetch} />;
    case "decisions":
      return <DecisionsView data={data} refetch={refetch} />;
    case "queue":
      return <WorkQueueView />;
    case "hypotheses":
      return <HypothesesView />;
    case "health":
      return <HealthView data={data} />;
    case "audit":
      return <AuditView />;
    case "settings":
      return <SettingsView />;
    default:
      return null;
  }
}
