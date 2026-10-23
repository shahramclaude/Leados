"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const fitnessFields: FieldDef[] = [
  { name: "name", label: "Fitness function", type: "text", required: true },
  { name: "kind", label: "Kind", type: "select", options: ["structure", "complexity", "duplication", "coupling", "test-strength", "perf", "a11y", "ai-provenance"], defaultValue: "structure" },
  { name: "measure", label: "Measure (executable query/script)", type: "text", placeholder: "e.g. npm run fitness -- cycles" },
  { name: "threshold", label: "Threshold", type: "number", required: true },
  { name: "direction", label: "Direction", type: "select", options: ["max", "min"], defaultValue: "max" },
  { name: "enforcement", label: "Enforcement", type: "select", options: ["block", "ratchet", "warn"], defaultValue: "ratchet" },
  { name: "currentValue", label: "Current measured value", type: "number", required: true },
];

const fitnessColumns: ColumnDef[] = [
  { key: "name", label: "Function" },
  { key: "kind", label: "Kind" },
  { key: "currentValue", label: "Current" },
  { key: "bestValue", label: "Best (ratchet)" },
  { key: "threshold", label: "Threshold" },
  { key: "enforcement", label: "Enforcement" },
  { key: "ratchetOk", label: "Ratchet status", render: (r) => (r.ratchetOk ? <span className="font-semibold text-emerald-700">holding</span> : <span className="font-semibold text-rose-700">regressed</span>) },
];

const debtFields: FieldDef[] = [
  { name: "className", label: "Debt class", type: "text", required: true },
  { name: "surface", label: "Surface", type: "text", required: true },
  { name: "interestPerWeek", label: "Interest / week (est. cost of not fixing)", type: "number", defaultValue: 0 },
  { name: "principal", label: "Principal (fix effort)", type: "number", defaultValue: 1 },
  { name: "exitCriteria", label: "Exit criteria", type: "textarea" },
];

const debtColumns: ColumnDef[] = [
  { key: "className", label: "Class" },
  { key: "surface", label: "Surface" },
  { key: "interestPerWeek", label: "Interest/wk" },
  { key: "principal", label: "Principal" },
  { key: "priority", label: "Priority (interest × age ÷ principal)", render: (r) => Number(r.priority).toFixed(2) },
];

export default function ArchitecturePage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="117"
        title="Self-Evolving Architecture"
        description="Fitness functions ratchet: a reported value may only improve relative to the historical best, and 'block'-tier functions reject regressions outright. Tech-debt priority = interest × age(weeks) ÷ principal, so the most expensive-to-ignore debt always rises to the top."
        produces="Executable fitness functions with ratchet enforcement; debt priority computed from interest × age ÷ principal"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Fitness functions</h2>
        <EntityManager endpoint="/api/architecture/fitness" fields={fitnessFields} columns={fitnessColumns} addLabel="Register fitness function" emptyMessage="No fitness functions registered yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Tech-debt burn-down</h2>
        <EntityManager endpoint="/api/architecture/debt" fields={debtFields} columns={debtColumns} addLabel="Log debt item" emptyMessage="No debt items logged yet." />
      </section>
    </div>
  );
}
