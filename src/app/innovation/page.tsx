"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const fields: FieldDef[] = [
  { name: "title", label: "Idea title", type: "text", required: true },
  { name: "kind", label: "Kind", type: "select", options: ["incremental", "adjacent", "transformational"], defaultValue: "incremental" },
  { name: "thesis", label: "Falsifiable thesis", type: "textarea", required: true, placeholder: "For X, Y will move Z by N% by date" },
  { name: "stage", label: "Stage", type: "select", options: ["ideate", "discover", "validate", "build", "scale"], defaultValue: "ideate" },
  { name: "trl", label: "TRL (1-9)", type: "number", defaultValue: 1 },
  { name: "costToDateUsd", label: "Cost to date (USD)", type: "number", defaultValue: 0 },
  { name: "remainingCostUsd", label: "Remaining cost (USD)", type: "number", defaultValue: 0 },
  { name: "npvUsd", label: "NPV if successful (USD)", type: "number", defaultValue: 0 },
  { name: "probTechnical", label: "P(technical success) 0-1", type: "number", step: "0.05", defaultValue: 0.5 },
  { name: "probCommercial", label: "P(commercial success) 0-1", type: "number", step: "0.05", defaultValue: 0.5 },
  { name: "killMetric", label: "Kill criterion metric", type: "text", placeholder: "e.g. activation rate" },
  { name: "killThreshold", label: "Kill threshold", type: "text", placeholder: "e.g. < 5%" },
  { name: "killByDate", label: "Kill by date", type: "date" },
];

const columns: ColumnDef[] = [
  { key: "title", label: "Idea" },
  { key: "kind", label: "Kind" },
  { key: "stage", label: "Stage", render: (r) => <StagePill stage={String(r.stage)} /> },
  { key: "trl", label: "TRL" },
  { key: "ecv", label: "ECV (USD)", render: (r) => fmtUsd(Number(r.ecv)) },
  { key: "realOptionValue", label: "Real option value", render: (r) => fmtUsd(Number(r.realOptionValue)) },
  { key: "hasKillCriteria", label: "Kill criteria", render: (r) => (r.hasKillCriteria ? "✅ pre-committed" : "⚠️ missing") },
  { key: "killRationale", label: "Kill rationale", render: (r) => (r.killRationale ? String(r.killRationale) : "—") },
];

function fmtUsd(n: number) {
  if (Number.isNaN(n)) return "unknown";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function StagePill({ stage }: { stage: string }) {
  const tone =
    stage === "killed" ? "bg-rose-100 text-rose-700" : stage === "graduated" || stage === "scale" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{stage}</span>;
}

const rowActions: RowAction[] = [
  {
    label: "Promote → build",
    buildUrl: (r) => `/api/innovation/${r.id}`,
    method: "PATCH",
    body: () => ({ stage: "build" }),
    showIf: (r) => r.stage !== "build" && r.stage !== "killed" && r.stage !== "graduated",
    tone: "primary",
  },
  {
    label: "Kill",
    buildUrl: (r) => `/api/innovation/${r.id}`,
    method: "PATCH",
    body: () => ({ action: "kill" }),
    confirm: "Kill this bet? A human can un-kill later with a recorded rationale.",
    showIf: (r) => r.stage !== "killed",
    tone: "danger",
  },
  {
    label: "Un-kill (rationale)",
    buildUrl: (r) => `/api/innovation/${r.id}`,
    method: "PATCH",
    body: () => {
      const rationale = window.prompt("Rationale for un-killing this bet (required):") || "";
      return { action: "unkill", rationale };
    },
    showIf: (r) => r.stage === "killed",
  },
];

export default function InnovationPage() {
  return (
    <div>
      <ModuleHeader
        part="108"
        title="Innovation & R&D Portfolio Intelligence"
        description="Stage-gate engine with real-option valuation and ambidexterity tracking. Promotion to 'build' is blocked without pre-committed kill criteria. The engine kills on breach; only a human can un-kill, and only with a recorded rationale — never the reverse."
        produces="Stage-gates with auto-kill on pre-committed criteria (human may un-kill with recorded rationale)"
      />
      <EntityManager endpoint="/api/innovation" fields={fields} columns={columns} rowActions={rowActions} addLabel="Add idea" emptyMessage="No ideas in the portfolio yet." />
    </div>
  );
}
