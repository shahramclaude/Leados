"use client";

import { useState } from "react";
import { EcosystemMapView } from "./EcosystemMapView";
import { ConcentrationDashboard } from "./ConcentrationDashboard";
import { AlertsPanel } from "./AlertsPanel";
import { StakeholderWorkspace } from "./StakeholderWorkspace";
import { PartnerScorecards } from "./PartnerScorecards";
import { postJson } from "../lib/api";

type Tab = "map" | "concentration" | "alerts" | "stakeholders" | "scorecards";

const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Ecosystem Map" },
  { id: "concentration", label: "Concentration Dashboard" },
  { id: "alerts", label: "Key-Dependency Alerts" },
  { id: "stakeholders", label: "Stakeholder Workspace" },
  { id: "scorecards", label: "Partner Scorecards" },
];

export function NetworkDashboard() {
  const [tab, setTab] = useState<Tab>("map");
  const [seeding, setSeeding] = useState(false);
  const [seedMessage, setSeedMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  async function seed() {
    setSeeding(true);
    setSeedMessage(null);
    try {
      const result = await postJson<{ nodeCount: number }>("/api/network/seed");
      setSeedMessage(`Seeded demo ecosystem: ${result.nodeCount} nodes.`);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setSeedMessage(e instanceof Error ? e.message : "seeding failed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">LEADOS · Part 31</p>
          <h1 className="text-2xl font-semibold text-slate-950">Ecosystem Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Dependency graph, concentration risk, key-dependency alerts, and stakeholder management for the
            internal + external ecosystem. Network metrics describe structure — never individual worth or
            influence over people.
          </p>
        </div>
        <div className="text-right">
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm disabled:opacity-40"
          >
            {seeding ? "Seeding…" : "Seed demo ecosystem data"}
          </button>
          {seedMessage && <p className="mt-1 text-xs text-slate-500">{seedMessage}</p>}
        </div>
      </header>

      <nav aria-label="Ecosystem Intelligence surfaces" className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium ${
              tab === t.id
                ? "border-b-2 border-blue-700 text-blue-700"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section key={`${tab}-${refreshKey}`}>
        {tab === "map" && <EcosystemMapView />}
        {tab === "concentration" && <ConcentrationDashboard />}
        {tab === "alerts" && <AlertsPanel />}
        {tab === "stakeholders" && <StakeholderWorkspace />}
        {tab === "scorecards" && <PartnerScorecards />}
      </section>
    </div>
  );
}
