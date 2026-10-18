"use client";

import { useState } from "react";
import { useIntelligence } from "@/hooks/useIntelligence";
import OverviewView from "./views/OverviewView";
import PeopleView from "./views/PeopleView";
import ActivityView from "./views/ActivityView";
import WorkQueueView from "./views/WorkQueueView";
import GrowthPlansView from "./views/GrowthPlansView";
import PlaybooksView from "./views/PlaybooksView";
import MetricsView from "./views/MetricsView";

const NAV = [
  { id: "overview", icon: "🧭", label: "Overview" },
  { id: "people", icon: "👥", label: "People" },
  { id: "activity", icon: "🗂️", label: "Activity Log" },
  { id: "work", icon: "✅", label: "Work Queue" },
  { id: "growth", icon: "🌱", label: "Growth Plans" },
  { id: "plays", icon: "📋", label: "Playbooks" },
  { id: "metrics", icon: "📊", label: "Metrics" },
] as const;

type ViewId = (typeof NAV)[number]["id"];

export default function Shell() {
  const [view, setView] = useState<ViewId>("overview");
  const intelligence = useIntelligence();

  const criticalCount = intelligence.data?.counts.critical ?? 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="flex w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-6 px-2">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">LeadOS</p>
            <h1 className="text-lg font-semibold text-white">Leadership Intelligence</h1>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                className={`flex items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                  view === item.id
                    ? "bg-indigo-500/20 text-indigo-200"
                    : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                }`}
              >
                <span className="flex items-center gap-2">
                  <span>{item.icon}</span>
                  {item.label}
                </span>
                {item.id === "overview" && criticalCount > 0 && (
                  <span className="rounded-full bg-rose-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {criticalCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-500">
            <p>Generated: {intelligence.data ? new Date(intelligence.data.generatedAt).toLocaleTimeString() : "—"}</p>
            <p className="mt-1">Findings: {intelligence.data?.counts.findings ?? "—"}</p>
            <p className="mt-1">Active playbooks: {intelligence.data?.activePlaybooks ?? "—"}</p>
          </div>
        </aside>

        <main className="flex-1 overflow-y-auto p-8">
          {view === "overview" && <OverviewView intelligence={intelligence} />}
          {view === "people" && <PeopleView onChanged={intelligence.refetch} />}
          {view === "activity" && <ActivityView onChanged={intelligence.refetch} />}
          {view === "work" && <WorkQueueView intelligence={intelligence} />}
          {view === "growth" && <GrowthPlansView onChanged={intelligence.refetch} />}
          {view === "plays" && <PlaybooksView intelligence={intelligence} />}
          {view === "metrics" && <MetricsView onChanged={intelligence.refetch} />}
        </main>
      </div>
    </div>
  );
}
