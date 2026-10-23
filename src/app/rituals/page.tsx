"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef, RowAction } from "@/components/leados/EntityManager";

const ritualFields: FieldDef[] = [
  { name: "name", label: "Ritual name", type: "text", required: true },
  { name: "cadence", label: "Cadence", type: "select", options: ["daily", "weekly", "monthly", "quarterly", "annual"], defaultValue: "weekly" },
  { name: "owner", label: "Owner", type: "text", required: true },
  { name: "humanMinutesBudget", label: "Human-minutes budget", type: "number", defaultValue: 60 },
  { name: "onTimeRate", label: "On-time rate (0-1)", type: "number", step: "0.05", defaultValue: 1 },
  { name: "outputQuality", label: "Output quality (0-5)", type: "number", step: "0.5", defaultValue: 4 },
];

const ritualColumns: ColumnDef[] = [
  { key: "name", label: "Ritual" },
  { key: "cadence", label: "Cadence" },
  { key: "owner", label: "Owner" },
  { key: "humanMinutesBudget", label: "Minutes budget" },
  { key: "onTimeRate", label: "On-time rate" },
  { key: "outputQuality", label: "Output quality" },
];

const policyFields: FieldDef[] = [
  { name: "name", label: "Policy name", type: "text", required: true },
  { name: "reviewEveryDays", label: "Review every (days)", type: "number", defaultValue: 90 },
  { name: "evidenceOfEffect", label: "Evidence of effect (blank = none yet)", type: "textarea" },
  { name: "sunsetTrigger", label: "Sunset trigger condition", type: "text" },
];

const STATE_FLOW: Record<string, string> = {
  draft: "testing",
  testing: "adopted",
  adopted: "review-due",
  "review-due": "sunset",
  sunset: "retired",
};

const policyColumns: ColumnDef[] = [
  { key: "name", label: "Policy" },
  { key: "state", label: "State", render: (r) => <StatePill state={String(r.state)} /> },
  { key: "evidenceOfEffect", label: "Evidence of effect", render: (r) => (r.evidenceOfEffect ? String(r.evidenceOfEffect) : "none on file") },
  { key: "reviewEveryDays", label: "Review cycle (days)" },
];

function StatePill({ state }: { state: string }) {
  const tone = state === "adopted" ? "bg-emerald-100 text-emerald-700" : state === "sunset" || state === "retired" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{state}</span>;
}

const policyActions: RowAction[] = [
  {
    label: "Advance",
    buildUrl: (r) => `/api/rituals/policies`,
    method: "PATCH",
    body: (r) => ({ id: r.id, to: STATE_FLOW[String(r.state)] }),
    showIf: (r) => Boolean(STATE_FLOW[String(r.state)]),
    tone: "primary",
  },
  {
    label: "Sunset now",
    buildUrl: () => `/api/rituals/policies`,
    method: "PATCH",
    body: (r) => ({ id: r.id, to: "sunset" }),
    confirm: "Sunset this policy?",
    showIf: (r) => r.state === "review-due" || r.state === "adopted",
    tone: "danger",
  },
];

export default function RitualsPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="118"
        title="The Management System on a Loop"
        description="Rituals carry a human-minutes budget so the operating system's own cost is visible. Policies move through an enforced lifecycle (draft → testing → adopted → review-due → sunset → retired); a policy with no recorded evidence of effect cannot re-adopt itself at review — it must earn its keep or sunset."
        produces="Self-maintaining rituals + policy sunset rules enforced as legal state transitions"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Ritual registry</h2>
        <EntityManager endpoint="/api/rituals/rituals" fields={ritualFields} columns={ritualColumns} addLabel="Add ritual" emptyMessage="No rituals registered yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Policy lifecycle</h2>
        <EntityManager endpoint="/api/rituals/policies" fields={policyFields} columns={policyColumns} rowActions={policyActions} addLabel="Add policy" emptyMessage="No policies tracked yet." />
      </section>
    </div>
  );
}
