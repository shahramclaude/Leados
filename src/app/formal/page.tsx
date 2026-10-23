"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const fields: FieldDef[] = [
  { name: "name", label: "Process spec name", type: "text", required: true },
  { name: "statesList", label: "States (comma-separated, first = start)", type: "text", required: true, placeholder: "idle, pending, approved, double-spend" },
  { name: "transitions", label: "Transitions (from>to; separated)", type: "textarea", placeholder: "idle>pending; pending>approved; pending>double-spend" },
  { name: "invariants", label: "Forbidden-state patterns (comma-separated)", type: "text", placeholder: "double-spend, deadlock" },
  { name: "maxBoundedStates", label: "Max bounded states", type: "number", defaultValue: 5000 },
];

const columns: ColumnDef[] = [
  { key: "name", label: "Spec" },
  { key: "statesList", label: "States" },
  {
    key: "verdict",
    label: "Verdict",
    render: (r) => {
      const tone = r.verdict === "verified" ? "text-emerald-700" : r.verdict === "violated" ? "text-rose-700" : "text-amber-700";
      return <span className={`font-semibold ${tone}`}>{String(r.verdict)}</span>;
    },
  },
  { key: "statesExplored", label: "States explored" },
  { key: "counterexamples", label: "Counterexample path (replayable)", render: (r) => (r.counterexamples ? String(r.counterexamples) : "—") },
];

const actions: RowAction[] = [
  {
    label: "Run model check",
    buildUrl: (r) => `/api/formal/specs/${r.id}/check`,
    method: "POST",
    tone: "primary",
  },
];

export default function FormalPage() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        part="120"
        title="Formal Methods for Management Processes"
        description="A real bounded breadth-first exploration over a declared finite-state graph. Checking one invariant class — no reachable state may match a forbidden pattern — with a replayable counterexample path when it fails. Exceeding the bound returns 'inconclusive-bound' honestly, never a false 'verified'."
        produces="Model-checked workflows; counterexamples render as a human-readable, replayable state path"
      />
      <EntityManager endpoint="/api/formal/specs" fields={fields} columns={columns} rowActions={actions} addLabel="Add process spec" emptyMessage="No process specs defined yet." />
    </div>
  );
}
