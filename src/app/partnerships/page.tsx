"use client";

import { useEffect, useState } from "react";
import ModuleHeader, { StatCard } from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const partnerFields: FieldDef[] = [
  { name: "name", label: "Partner name", type: "text", required: true },
  { name: "kind", label: "Kind", type: "select", options: ["channel", "tech", "strategic", "supplier"], defaultValue: "channel" },
  { name: "jointValueThesis", label: "Joint value thesis", type: "textarea", required: true },
  { name: "sourcedRevenueUsd", label: "Sourced revenue (USD)", type: "number", defaultValue: 0 },
  { name: "influencedRevenueUsd", label: "Influenced revenue (USD)", type: "number", defaultValue: 0 },
  { name: "enablementCostUsd", label: "Enablement cost (USD)", type: "number", defaultValue: 0 },
  { name: "healthScore", label: "Health score (0-100)", type: "number", defaultValue: 0 },
];

const partnerColumns: ColumnDef[] = [
  { key: "name", label: "Partner" },
  { key: "kind", label: "Kind" },
  { key: "sourcedRevenueUsd", label: "Sourced rev.", render: (r) => `$${Number(r.sourcedRevenueUsd).toLocaleString()} (measured, attribution: sourced)` },
  { key: "influencedRevenueUsd", label: "Influenced rev.", render: (r) => `$${Number(r.influencedRevenueUsd).toLocaleString()} (modeled, attribution: influenced)` },
  { key: "healthScore", label: "Health" },
];

const econFields: FieldDef[] = [
  { name: "channel", label: "Channel", type: "text", required: true },
  { name: "cac", label: "CAC (USD)", type: "number", defaultValue: 0 },
  { name: "ltv", label: "LTV (USD)", type: "number", defaultValue: 0 },
  { name: "paybackMonths", label: "Payback (months)", type: "number", defaultValue: 0 },
  { name: "cannibalizationFactor", label: "Cannibalization factor (0-1 vs direct)", type: "number", step: "0.05", defaultValue: 0 },
  { name: "attributionMethod", label: "Attribution method", type: "select", options: ["first-touch", "multi-touch", "incrementality"], defaultValue: "first-touch" },
  { name: "honesty", label: "Honesty label", type: "select", options: ["measured", "modeled"], defaultValue: "modeled" },
];

const econColumns: ColumnDef[] = [
  { key: "channel", label: "Channel" },
  { key: "cac", label: "CAC" },
  { key: "ltv", label: "LTV" },
  { key: "paybackMonths", label: "Payback (mo)" },
  { key: "cannibalizationFactor", label: "Cannibalization" },
  { key: "attributionMethod", label: "Attribution method" },
  { key: "honesty", label: "Honesty label", render: (r) => <span className={r.honesty === "measured" ? "font-semibold text-emerald-700" : "font-medium text-amber-700"}>{String(r.honesty)}</span> },
];

interface Concentration {
  hhi: number;
  band: string;
  totalRevenueUsd: number;
  top1SharePct: number;
  partnerCount: number;
  method: string;
}

export default function PartnershipsPage() {
  const [concentration, setConcentration] = useState<Concentration | null>(null);

  useEffect(() => {
    fetch("/api/partnerships/concentration")
      .then((r) => r.json())
      .then(setConcentration)
      .catch(() => setConcentration(null));
  }, []);

  return (
    <div className="space-y-10">
      <ModuleHeader
        part="110"
        title="Partnerships, BD & Ecosystem Strategy"
        description="Every revenue number carries an attribution method and an honesty label (measured vs modeled) — never a guessed figure dressed up as fact. Concentration risk is tracked with HHI and top-1 share."
        produces="Sourced-vs-influenced revenue, HHI concentration; every number carries attribution method + honesty label"
      />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="HHI (concentration)" value={concentration ? String(concentration.hhi) : "unknown"} hint={concentration ? `band: ${concentration.band}` : "no partner revenue yet"} />
        <StatCard label="Top-1 partner share" value={concentration ? `${concentration.top1SharePct}%` : "unknown"} />
        <StatCard label="Total partner revenue" value={concentration ? `$${concentration.totalRevenueUsd.toLocaleString()}` : "unknown"} />
        <StatCard label="Partners tracked" value={concentration ? String(concentration.partnerCount) : "0"} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Partners</h2>
        <EntityManager endpoint="/api/partnerships/partners" fields={partnerFields} columns={partnerColumns} addLabel="Add partner" emptyMessage="No partners yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Channel economics</h2>
        <EntityManager endpoint="/api/partnerships/economics" fields={econFields} columns={econColumns} addLabel="Add channel economics" emptyMessage="No channel economics recorded." />
      </section>
    </div>
  );
}
