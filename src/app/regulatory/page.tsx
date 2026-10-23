"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const itemFields: FieldDef[] = [
  { name: "jurisdiction", label: "Jurisdiction", type: "text", required: true },
  { name: "domain", label: "Domain", type: "text", required: true },
  { name: "status", label: "Status", type: "select", options: ["proposed", "consultation", "enacted", "effective"], defaultValue: "proposed" },
  { name: "evidenceClass", label: "Evidence class", type: "select", options: ["primary-source", "official-summary", "reputable-press", "analyst"], defaultValue: "reputable-press" },
  { name: "probability", label: "Probability (0-1)", type: "number", step: "0.05", defaultValue: 0.5 },
  { name: "impactUsd", label: "Impact (USD)", type: "number", defaultValue: 0 },
  { name: "proximityDays", label: "Days to effective date", type: "number", defaultValue: 365 },
];

const itemColumns: ColumnDef[] = [
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "domain", label: "Domain" },
  {
    key: "status",
    label: "Status",
    render: (r) => (
      <span className={r.status === "enacted" || r.status === "effective" ? "font-semibold text-emerald-700" : "text-slate-700"}>
        {String(r.status)}
      </span>
    ),
  },
  {
    key: "evidenceClass",
    label: "Evidence class",
    render: (r) => {
      const strong = r.evidenceClass === "primary-source" || r.evidenceClass === "official-summary";
      return <span className={strong ? "text-emerald-700" : "text-amber-700"}>{String(r.evidenceClass)}</span>;
    },
  },
  { key: "impactScore", label: "Impact score (p × impact × decay)", render: (r) => Number(r.impactScore).toLocaleString(undefined, { maximumFractionDigits: 0 }) },
];

const obligationFields: FieldDef[] = [
  { name: "regulatoryItemId", label: "Regulatory item ID", type: "number" },
  { name: "clause", label: "Clause", type: "textarea", required: true },
  { name: "controlRefs", label: "Control references", type: "text" },
  { name: "status", label: "Coverage status", type: "select", options: ["covered", "partial", "gap"], defaultValue: "gap" },
  { name: "owner", label: "Owner", type: "text", defaultValue: "unassigned" },
];

const obligationColumns: ColumnDef[] = [
  { key: "clause", label: "Clause" },
  { key: "controlRefs", label: "Control refs" },
  {
    key: "status",
    label: "Coverage",
    render: (r) => {
      const tone = r.status === "covered" ? "text-emerald-700" : r.status === "partial" ? "text-amber-700" : "text-rose-700";
      return <span className={`font-semibold ${tone}`}>{String(r.status)}</span>;
    },
  },
  { key: "owner", label: "Owner" },
];

export default function RegulatoryPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="112"
        title="Regulatory Affairs & Public Policy Intelligence"
        description="Evidence-class state machine: an item can only be marked 'enacted' from a primary source or official summary — press coverage alone is blocked. Obligations map clauses to controls, and gaps are visible, not hidden."
        produces="Evidence-class state machine (press alone ≠ enacted); clause→obligation→control mapping; gaps stay visible"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Horizon items</h2>
        <EntityManager endpoint="/api/regulatory/items" fields={itemFields} columns={itemColumns} addLabel="Log horizon item" emptyMessage="No regulatory items tracked yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Obligation → control mapping</h2>
        <EntityManager endpoint="/api/regulatory/obligations" fields={obligationFields} columns={obligationColumns} addLabel="Add obligation" emptyMessage="No obligations mapped yet." />
      </section>
    </div>
  );
}
