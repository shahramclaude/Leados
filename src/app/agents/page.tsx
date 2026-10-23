"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const roleFields: FieldDef[] = [
  { name: "title", label: "Agent role title", type: "text", required: true },
  { name: "responsibilities", label: "Responsibilities", type: "textarea" },
  { name: "forbidden", label: "Forbidden actions", type: "textarea" },
  { name: "riskCeiling", label: "Risk ceiling", type: "select", options: ["T0", "T1", "T2"], defaultValue: "T1" },
  { name: "humanAccountable", label: "Human accountable (required)", type: "text", required: true },
  { name: "evalSuiteId", label: "Eval suite ID", type: "text" },
  { name: "supervisionSlaHours", label: "Supervision review SLA (hours)", type: "number", defaultValue: 24 },
];

const roleColumns: ColumnDef[] = [
  { key: "title", label: "Agent role" },
  { key: "riskCeiling", label: "Risk ceiling" },
  { key: "humanAccountable", label: "Human accountable", render: (r) => <strong>{String(r.humanAccountable)}</strong> },
  { key: "evalSuiteId", label: "Eval suite" },
  { key: "active", label: "Active", render: (r) => (r.active ? "✅" : "paused") },
];

const delegationFields: FieldDef[] = [
  { name: "agentRoleId", label: "Agent role ID", type: "number", required: true },
  { name: "fromPerson", label: "Delegating human", type: "text", required: true },
  { name: "task", label: "Task", type: "textarea", required: true },
  { name: "budgetUsd", label: "Budget (USD)", type: "number", defaultValue: 0 },
  { name: "windowLabel", label: "Time window", type: "text", placeholder: "e.g. this sprint" },
  { name: "grantedTools", label: "Granted tools", type: "text" },
];

const delegationColumns: ColumnDef[] = [
  { key: "agentRoleId", label: "Role ID" },
  { key: "fromPerson", label: "Delegated by" },
  { key: "task", label: "Task" },
  { key: "budgetUsd", label: "Budget" },
  { key: "toolAccessActive", label: "Tool access", render: (r) => (r.toolAccessActive ? <span className="font-semibold text-emerald-700">active</span> : <span className="font-semibold text-rose-700">revoked</span>) },
];

const delegationActions: RowAction[] = [
  {
    label: "Revoke now",
    buildUrl: (r) => `/api/agents/delegations/${r.id}/revoke`,
    method: "POST",
    confirm: "Revoke this delegation immediately? Tool access is denied instantly.",
    showIf: (r) => Boolean(r.toolAccessActive),
    tone: "danger",
  },
];

export default function AgentsPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="116"
        title="Digital Coworkers — Supervised Agent Teams"
        description="Every agent role requires a human accountable owner — enforced at creation, not by convention. Risk ceiling is capped at T0-T2: anything higher routes to a human. Revocation is immediate and auditable."
        produces="Agent role contracts with DB-enforced human accountability; revocation in effect immediately"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Agent role registry</h2>
        <EntityManager endpoint="/api/agents/roles" fields={roleFields} columns={roleColumns} addLabel="Add agent role" emptyMessage="No agent roles defined yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Delegations</h2>
        <EntityManager endpoint="/api/agents/delegations" fields={delegationFields} columns={delegationColumns} rowActions={delegationActions} addLabel="Delegate task" emptyMessage="No delegations yet." />
      </section>
    </div>
  );
}
