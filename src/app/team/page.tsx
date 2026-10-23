"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const diagFields: FieldDef[] = [
  { name: "teamName", label: "Team", type: "text", required: true },
  {
    name: "dimension",
    label: "Dimension",
    type: "select",
    options: ["decision-quality", "information-sharing", "conflict-constructiveness", "commitment-clarity", "accountability", "learning-cadence"],
    defaultValue: "decision-quality",
  },
  { name: "score", label: "Score (0-100)", type: "number", required: true },
  { name: "method", label: "Method", type: "select", options: ["decision-audit", "meeting-metrics", "consent-survey", "behavioral-proxy"], defaultValue: "consent-survey" },
  { name: "sampleSizeN", label: "Sample size (n, min 10)", type: "number", required: true, defaultValue: 10 },
  { name: "ciLow", label: "CI low", type: "number" },
  { name: "ciHigh", label: "CI high", type: "number" },
];

const diagColumns: ColumnDef[] = [
  { key: "teamName", label: "Team" },
  { key: "dimension", label: "Dimension" },
  { key: "score", label: "Score" },
  { key: "method", label: "Method" },
  { key: "sampleSizeN", label: "n (k-anon ≥ 10)" },
];

const scorecardFields: FieldDef[] = [
  { name: "decisionTitle", label: "Decision", type: "text", required: true },
  { name: "optionsConsidered", label: "Options considered", type: "number", defaultValue: 0 },
  { name: "dissentSought", label: "Dissent sought", type: "checkbox" },
  { name: "assumptionsLabeled", label: "Assumptions labeled", type: "checkbox" },
  { name: "predictionsMade", label: "Predictions made", type: "checkbox" },
  { name: "reviewScheduled", label: "Review scheduled", type: "checkbox" },
  { name: "outcomeScored", label: "Outcome scored", type: "checkbox" },
];

const scorecardColumns: ColumnDef[] = [
  { key: "decisionTitle", label: "Decision" },
  { key: "optionsConsidered", label: "Options" },
  { key: "score", label: "Quality score (0-100, from fields)", render: (r) => <strong>{String(r.score)}</strong> },
];

export default function TeamPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="113"
        title="Executive Team Effectiveness"
        description="Team diagnostics are aggregate-only: records below n=10 are rejected at the API, not merely hidden in the UI. No code path in this product emits an individual team-member score — dignity is enforced architecturally, not by convention."
        produces="Decision-quality scorecards computed from record fields; no individual-scoring API exists anywhere"
      />
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        k-anonymity is enforced server-side: attempts to submit a diagnostic with n &lt; 10 are rejected with an error, never silently stored.
      </div>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Team diagnostics (aggregate-only)</h2>
        <EntityManager endpoint="/api/team/diagnostics" fields={diagFields} columns={diagColumns} addLabel="Record diagnostic" emptyMessage="No team diagnostics yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Decision-quality scorecards</h2>
        <EntityManager endpoint="/api/team/scorecards" fields={scorecardFields} columns={scorecardColumns} addLabel="Add decision record" emptyMessage="No decision records yet." />
      </section>
    </div>
  );
}
