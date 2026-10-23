"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const fields: FieldDef[] = [
  { name: "title", label: "Case title", type: "text", required: true },
  { name: "counterpartyName", label: "Counterparty", type: "text", required: true },
  { name: "ourInterests", label: "Our interests (not positions)", type: "textarea" },
  { name: "theirInterests", label: "Their likely interests (counterparty view)", type: "textarea" },
  { name: "ourReservation", label: "Our reservation value", type: "number", required: true },
  { name: "ourTarget", label: "Our target value", type: "number", required: true },
  { name: "theirReservationEstimate", label: "Their reservation estimate (leave blank if unknown)", type: "number" },
  { name: "batnaEvidence", label: "BATNA evidence (leave blank = renders 'unknown')", type: "textarea" },
  { name: "currency", label: "Currency", type: "text", defaultValue: "USD" },
  { name: "deadline", label: "Deadline", type: "date" },
];

const columns: ColumnDef[] = [
  { key: "title", label: "Case" },
  { key: "counterpartyName", label: "Counterparty" },
  { key: "theirInterests", label: "Counterparty view (mandatory)", render: (r) => (r.theirInterests ? String(r.theirInterests) : "⚠️ missing — add before negotiating") },
  { key: "batnaStatus", label: "BATNA status", render: (r) => (r.batnaStatus === "unknown" ? <span className="font-semibold text-amber-700">unknown</span> : <span className="text-emerald-700">evidenced</span>) },
  {
    key: "zopa",
    label: "ZOPA",
    render: (r) => {
      const z = r.zopa as { low: number; high: number } | string;
      if (z === "unknown") return "unknown";
      if (z === "no-deal-zone") return "no deal zone";
      if (typeof z === "object") return `${z.low.toLocaleString()} – ${z.high.toLocaleString()}`;
      return "unknown";
    },
  },
];

export default function NegotiationPage() {
  return (
    <div className="space-y-6">
      <ModuleHeader
        part="114"
        title="Negotiation & Stakeholder Strategy Workbench"
        description="ZOPA is computed from both parties' reservation values; an unevidenced BATNA renders as 'unknown' rather than an invented number. A manipulation-pattern denylist blocks deceptive or exploitative tactics at write time, and every case is expected to carry the counterparty's likely view."
        produces="ZOPA math, unevidenced BATNAs render 'unknown', manipulation-pattern denylist"
      />
      <EntityManager endpoint="/api/negotiation/cases" fields={fields} columns={columns} addLabel="Add negotiation case" emptyMessage="No negotiation cases yet." />
    </div>
  );
}
