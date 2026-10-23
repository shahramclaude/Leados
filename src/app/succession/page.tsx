"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const roleFields: FieldDef[] = [
  { name: "roleTitle", label: "Critical role", type: "text", required: true },
  { name: "critical", label: "Critical", type: "checkbox", defaultValue: true },
  { name: "coverageStatus", label: "Coverage status", type: "select", options: ["covered", "thin", "gap"], defaultValue: "gap" },
];

const roleColumns: ColumnDef[] = [
  { key: "roleTitle", label: "Role" },
  { key: "critical", label: "Critical", render: (r) => (r.critical ? "✅" : "—") },
  {
    key: "coverageStatus",
    label: "Coverage",
    render: (r) => {
      const tone = r.coverageStatus === "covered" ? "text-emerald-700" : r.coverageStatus === "thin" ? "text-amber-700" : "text-rose-700";
      return <span className={`font-semibold ${tone}`}>{String(r.coverageStatus)}</span>;
    },
  },
];

const successorFields: FieldDef[] = [
  { name: "benchRoleId", label: "Role ID", type: "number", required: true },
  { name: "personName", label: "Successor name", type: "text", required: true },
  { name: "readiness", label: "Claimed readiness", type: "select", options: ["ready-now", "ready-1yr", "ready-2yr", "ready-3yr+"], defaultValue: "ready-3yr+" },
  { name: "evidenceNotes", label: "Evidence (performance / assessment / stretch-role) — blank renders 'unknown'", type: "textarea" },
  { name: "developmentGaps", label: "Development gaps", type: "textarea" },
];

const successorColumns: ColumnDef[] = [
  { key: "benchRoleId", label: "Role ID" },
  { key: "personName", label: "Successor" },
  { key: "readiness", label: "Claimed readiness" },
  {
    key: "effectiveReadiness",
    label: "Effective readiness (evidence-gated)",
    render: (r) => (r.effectiveReadiness === "unknown" ? <span className="font-semibold text-amber-700">unknown — no evidence on file</span> : <span className="font-semibold text-emerald-700">{String(r.effectiveReadiness)}</span>),
  },
  { key: "developmentGaps", label: "Dev gaps" },
];

export default function SuccessionPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="115"
        title="Succession & Leadership Pipeline"
        description="Readiness without evidence renders as 'unknown', no matter what is claimed — sponsorship cannot manufacture readiness. Mark every role 'critical' that must always carry an emergency slate."
        produces="Three-layer readiness evidence; emergency slates for critical roles; sponsorship without evidence cannot create readiness"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Critical roles (bench)</h2>
        <EntityManager endpoint="/api/succession/roles" fields={roleFields} columns={roleColumns} addLabel="Add critical role" emptyMessage="No critical roles defined yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Successors</h2>
        <EntityManager endpoint="/api/succession/successors" fields={successorFields} columns={successorColumns} addLabel="Add successor" emptyMessage="No successors recorded yet." />
      </section>
    </div>
  );
}
