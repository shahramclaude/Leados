"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const fields: FieldDef[] = [
  { name: "targetEngine", label: "Target engine", type: "text", required: true },
  { name: "currentName", label: "Current method", type: "text", defaultValue: "incumbent" },
  { name: "currentEvalScore", label: "Current eval score (0-1)", type: "number", step: "0.01", defaultValue: 0.7 },
  { name: "proposedName", label: "Proposed method", type: "text", required: true },
  { name: "proposedEvalScore", label: "Proposed eval score (0-1)", type: "number", step: "0.01" },
  { name: "evidenceGrade", label: "Evidence grade", type: "select", options: ["peer-reviewed", "preprint", "practitioner", "anecdotal"], defaultValue: "practitioner" },
  { name: "decision", label: "Decision", type: "select", options: ["pilot", "reject", "adopt", "defer"], defaultValue: "pilot" },
  { name: "rationale", label: "Rationale", type: "textarea" },
];

const columns: ColumnDef[] = [
  { key: "targetEngine", label: "Engine" },
  { key: "currentName", label: "Current" },
  { key: "proposedName", label: "Proposed" },
  { key: "evidenceGrade", label: "Evidence grade", render: (r) => (r.evidenceGrade === "anecdotal" ? <span className="font-semibold text-rose-700">anecdotal — cannot adopt alone</span> : String(r.evidenceGrade)) },
  { key: "significant", label: "Statistically significant gain", render: (r) => (r.significant ? "✅" : "not yet shown") },
  { key: "decision", label: "Decision" },
];

export default function ResearchPage() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        part="122"
        title="Continuous Methodology Research Layer"
        description="Candidates are graded by evidence class; anecdote-grade evidence cannot adopt a method into production on its own — the API downgrades such attempts to 'defer'. A head-to-head significance test (two-proportion z) flags whether the proposed method actually beats the incumbent."
        produces="Experiment registry + adoption gates that block weak-evidence adoption"
      />
      <EntityManager endpoint="/api/research/candidates" fields={fields} columns={columns} addLabel="Log method candidate" emptyMessage="No method candidates tracked yet." />
    </div>
  );
}
