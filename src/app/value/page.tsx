"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const hypoFields: FieldDef[] = [
  { name: "capability", label: "Capability", type: "text", required: true },
  { name: "beneficiary", label: "Beneficiary", type: "text" },
  { name: "mechanism", label: "Mechanism (how value accrues)", type: "textarea", required: true },
  { name: "metricName", label: "Metric", type: "text" },
  { name: "baseline", label: "Baseline", type: "number", defaultValue: 0 },
  { name: "target", label: "Target", type: "number", defaultValue: 0 },
  { name: "method", label: "Method", type: "select", options: ["rct", "diff-in-diff", "matched-pairs", "time-series", "self-report"], defaultValue: "self-report" },
  { name: "status", label: "Status", type: "select", options: ["hypothesized", "measuring", "validated", "refuted", "unknown"], defaultValue: "hypothesized" },
];

const hypoColumns: ColumnDef[] = [
  { key: "capability", label: "Capability" },
  { key: "mechanism", label: "Mechanism" },
  { key: "method", label: "Method" },
  {
    key: "confidenceLabel",
    label: "Language allowed",
    render: (r) => {
      const tone = r.confidenceLabel === "causal" ? "text-emerald-700" : r.confidenceLabel === "associational" ? "text-amber-700" : "text-slate-500";
      return <span className={`font-semibold ${tone}`}>{String(r.confidenceLabel)}</span>;
    },
  },
  {
    key: "status",
    label: "Status",
    render: (r) => (r.status === "refuted" ? <span className="font-semibold text-rose-700">refuted (visible, not buried)</span> : String(r.status)),
  },
];

const realFields: FieldDef[] = [
  { name: "hypothesisId", label: "Hypothesis ID", type: "number", required: true },
  { name: "measured", label: "Measured value", type: "number", required: true },
  { name: "ciLow", label: "CI low", type: "number" },
  { name: "ciHigh", label: "CI high", type: "number" },
  { name: "realizedValueUsd", label: "Realized value (USD)", type: "number", defaultValue: 0 },
];

const realColumns: ColumnDef[] = [
  { key: "hypothesisId", label: "Hypothesis ID" },
  { key: "measured", label: "Measured" },
  { key: "realizedValueUsd", label: "Realized (USD)" },
  { key: "confidenceLabel", label: "Confidence label" },
  {
    key: "roi",
    label: "ROI distribution (Monte Carlo, decision support)",
    render: (r) => {
      const roi = r.roi as { p10: number; p50: number; p90: number } | undefined;
      if (!roi) return "unknown";
      return `p10 ${(roi.p10 * 100).toFixed(0)}% · p50 ${(roi.p50 * 100).toFixed(0)}% · p90 ${(roi.p90 * 100).toFixed(0)}%`;
    },
  },
];

export default function ValuePage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="121"
        title="Value Realization & ROI Proof"
        description="Every benefit number carries a method and a language-matched confidence label — only RCT / diff-in-diff / matched-pairs results may use causal language. ROI renders as a Monte Carlo distribution (p10/p50/p90), never a single false-precision number. Refuted hypotheses stay visible, never buried."
        produces="Benefit tracking with honest attribution; no ROI claims without a reconstructable derivation"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Value hypotheses</h2>
        <EntityManager endpoint="/api/value/hypotheses" fields={hypoFields} columns={hypoColumns} addLabel="Add hypothesis" emptyMessage="No value hypotheses registered yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Benefit realizations</h2>
        <EntityManager endpoint="/api/value/realizations" fields={realFields} columns={realColumns} addLabel="Record realization" emptyMessage="No benefit realizations recorded yet." />
      </section>
    </div>
  );
}
