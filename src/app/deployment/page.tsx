"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const tenantFields: FieldDef[] = [
  { name: "name", label: "Tenant name", type: "text", required: true },
  { name: "isolation", label: "Isolation model", type: "select", options: ["row-level", "schema", "database"], defaultValue: "row-level" },
  { name: "usersLimit", label: "Users limit", type: "number", defaultValue: 100 },
  { name: "storageGbLimit", label: "Storage limit (GB)", type: "number", defaultValue: 50 },
  { name: "agentRunsPerDayLimit", label: "Agent runs/day limit", type: "number", defaultValue: 1000 },
  { name: "dataResidency", label: "Data residency", type: "text", defaultValue: "us" },
];

const tenantColumns: ColumnDef[] = [
  { key: "name", label: "Tenant" },
  { key: "isolation", label: "Isolation" },
  { key: "usersLimit", label: "Users limit" },
  { key: "storageGbLimit", label: "Storage (GB)" },
  { key: "dataResidency", label: "Residency" },
];

const waveFields: FieldDef[] = [
  { name: "tenantId", label: "Tenant ID", type: "number" },
  { name: "waveNumber", label: "Wave #", type: "number", defaultValue: 1 },
  { name: "cohortName", label: "Cohort", type: "text", required: true },
  { name: "users", label: "Users", type: "number", defaultValue: 0 },
  { name: "dataReady", label: "Data ready", type: "checkbox" },
  { name: "trained", label: "Trained", type: "checkbox" },
  { name: "pilotPassed", label: "Pilot passed", type: "checkbox" },
  { name: "rollbackReady", label: "Rollback ready", type: "checkbox" },
];

const waveColumns: ColumnDef[] = [
  { key: "cohortName", label: "Cohort" },
  { key: "waveNumber", label: "Wave" },
  { key: "users", label: "Users" },
  { key: "entryReady", label: "Entry criteria", render: (r) => (r.entryReady ? <span className="font-semibold text-emerald-700">ready</span> : <span className="font-semibold text-amber-700">not ready</span>) },
  { key: "status", label: "Status" },
  { key: "adoptionPct", label: "Adoption %" },
];

const waveActions: RowAction[] = [
  {
    label: "Start wave",
    buildUrl: () => `/api/deployment/waves`,
    method: "PATCH",
    body: (r) => ({ id: r.id, action: "start" }),
    showIf: (r) => r.status === "planned",
    tone: "primary",
  },
];

export default function DeploymentPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="119"
        title="Enterprise Deployment & Multi-Tenant Scale"
        description="Tenants declare their isolation model, limits, and data residency. A rollout wave cannot start until all four entry criteria (data ready, trained, pilot passed, rollback ready) are true — enforced server-side, not left to a project manager's judgment call."
        produces="Rollout waves gated on entry criteria + tenant isolation/limits configuration"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Tenants</h2>
        <EntityManager endpoint="/api/deployment/tenants" fields={tenantFields} columns={tenantColumns} addLabel="Add tenant" emptyMessage="No tenants provisioned yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Rollout waves</h2>
        <EntityManager endpoint="/api/deployment/waves" fields={waveFields} columns={waveColumns} rowActions={waveActions} addLabel="Plan wave" emptyMessage="No rollout waves planned yet." />
      </section>
    </div>
  );
}
