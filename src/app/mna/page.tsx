"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const planFields: FieldDef[] = [
  { name: "dealName", label: "Deal name", type: "text", required: true },
  { name: "archetype", label: "Archetype", type: "select", options: ["tuck-in", "merger-of-equals-lite", "carve-out"], defaultValue: "tuck-in" },
  { name: "day1ChecklistTotal", label: "Day-1 checklist items (total)", type: "number", defaultValue: 40 },
  { name: "day1ChecklistDone", label: "Day-1 checklist items (done)", type: "number", defaultValue: 0 },
  { name: "rollbackPlan", label: "Rollback plan", type: "textarea" },
  { name: "status", label: "Status", type: "select", options: ["planning", "active", "complete"], defaultValue: "planning" },
];

const planColumns: ColumnDef[] = [
  { key: "dealName", label: "Deal" },
  { key: "archetype", label: "Archetype" },
  {
    key: "day1",
    label: "Day-1 checklist",
    render: (r) => `${r.day1ChecklistDone}/${r.day1ChecklistTotal}${Number(r.day1ChecklistTotal) < 40 ? " ⚠️ below 40-item minimum" : ""}`,
  },
  { key: "status", label: "Status" },
];

const synergyFields: FieldDef[] = [
  { name: "planId", label: "Plan ID", type: "number" },
  { name: "label", label: "Synergy label", type: "text", required: true },
  { name: "kind", label: "Kind", type: "select", options: ["revenue", "cost", "capital"], defaultValue: "cost" },
  { name: "plannedRunRateUsd", label: "Planned run-rate (USD)", type: "number", defaultValue: 0 },
  { name: "achievedRunRateUsd", label: "Achieved run-rate (USD)", type: "number", defaultValue: 0 },
  { name: "oneTimeCostsUsd", label: "One-time costs (USD)", type: "number", defaultValue: 0 },
  { name: "confidence", label: "Confidence (0-1)", type: "number", step: "0.05", defaultValue: 0.5 },
];

const synergyColumns: ColumnDef[] = [
  { key: "label", label: "Synergy" },
  { key: "kind", label: "Kind" },
  { key: "plannedRunRateUsd", label: "Planned", render: (r) => `$${Number(r.plannedRunRateUsd).toLocaleString()}` },
  { key: "achievedRunRateUsd", label: "Achieved (reported)", render: (r) => `$${Number(r.achievedRunRateUsd).toLocaleString()}` },
  {
    key: "countableUsd",
    label: "Countable toward target",
    render: (r) => (
      <span className={Number(r.countableUsd) > 0 ? "font-semibold text-emerald-700" : "font-medium text-rose-600"}>
        {Boolean(r.financeVerified) ? `$${Number(r.countableUsd).toLocaleString()}` : "$0 — unverified"}
      </span>
    ),
  },
  { key: "variancePct", label: "Variance vs plan", render: (r) => `${Number(r.variancePct).toFixed(1)}%` },
  { key: "financeVerified", label: "Finance verified", render: (r) => (r.financeVerified ? "✅" : "❌") },
];

const synergyActions: RowAction[] = [
  {
    label: "Finance verify",
    buildUrl: (r) => `/api/mna/synergies/${r.id}`,
    method: "PATCH",
    body: () => ({ action: "verify" }),
    showIf: (r) => !r.financeVerified,
    tone: "primary",
  },
  {
    label: "Un-verify",
    buildUrl: (r) => `/api/mna/synergies/${r.id}`,
    method: "PATCH",
    body: () => ({ action: "unverify" }),
    showIf: (r) => Boolean(r.financeVerified),
  },
];

export default function MnaPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="111"
        title="M&A Integration Execution"
        description="Day-1 checklist workflows (≥ 40 enumerated items per plan) and a run-rate synergy ledger. Unverified synergies cannot count toward targets — enforced in the API, not left to spreadsheet convention."
        produces="Day-1 checklist workflows + run-rate synergy ledger with finance-verified-only countable totals"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Integration plans</h2>
        <EntityManager endpoint="/api/mna/plans" fields={planFields} columns={planColumns} addLabel="Add integration plan" emptyMessage="No integration plans yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Synergy ledger</h2>
        <EntityManager endpoint="/api/mna/synergies" fields={synergyFields} columns={synergyColumns} rowActions={synergyActions} addLabel="Log synergy" emptyMessage="No synergies logged." />
      </section>
    </div>
  );
}
