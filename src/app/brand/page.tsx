"use client";

import ModuleHeader from "@/components/leados/ModuleHeader";
import EntityManager, { ColumnDef, FieldDef } from "@/components/leados/EntityManager";

const mediaFields: FieldDef[] = [
  { name: "source", label: "Source", type: "text", required: true },
  { name: "sourceReliability", label: "Source reliability (0-1)", type: "number", step: "0.05", defaultValue: 0.5 },
  { name: "reach", label: "Reach", type: "number", defaultValue: 0 },
  { name: "sentiment", label: "Sentiment (-1..1)", type: "number", step: "0.1", defaultValue: 0 },
  { name: "topics", label: "Topics", type: "text" },
  { name: "verified", label: "Evidence class", type: "select", options: ["primary", "secondary", "unverified"], defaultValue: "unverified" },
  { name: "mentionsUs", label: "Mentions us", type: "checkbox", defaultValue: true },
];

const mediaColumns: ColumnDef[] = [
  { key: "source", label: "Source" },
  { key: "verified", label: "Evidence class" },
  { key: "sourceReliability", label: "Reliability" },
  { key: "reach", label: "Reach" },
  { key: "sentiment", label: "Sentiment" },
  { key: "exposure", label: "Exposure (reach × reliability)", render: (r) => Number(r.exposure).toFixed(1) },
];

const healthFields: FieldDef[] = [
  { name: "metric", label: "Metric", type: "select", options: ["awareness", "consideration", "preference", "trust", "nps"], defaultValue: "awareness" },
  { name: "segment", label: "Segment", type: "text", defaultValue: "overall" },
  { name: "value", label: "Value", type: "number", required: true },
  { name: "method", label: "Method", type: "select", options: ["survey", "social-listening", "search-share", "panel"], defaultValue: "survey" },
  { name: "sampleSize", label: "Sample size", type: "number", defaultValue: 0 },
  { name: "ciLow", label: "CI low", type: "number" },
  { name: "ciHigh", label: "CI high", type: "number" },
  { name: "trend", label: "Trend", type: "select", options: ["up", "flat", "down"], defaultValue: "flat" },
];

const healthColumns: ColumnDef[] = [
  { key: "metric", label: "Metric" },
  { key: "segment", label: "Segment" },
  { key: "value", label: "Value" },
  { key: "method", label: "Method (never merged across methods)" },
  { key: "sampleSize", label: "n" },
  { key: "trend", label: "Trend" },
];

export default function BrandPage() {
  return (
    <div className="space-y-10">
      <ModuleHeader
        part="109"
        title="Brand & Reputation Intelligence"
        description="Media monitoring with tracked source reliability, multi-method brand health (method-labeled series, never merged), and the reputation risk formula: exposure × severity × velocity. Every number names its measurement method."
        produces="Crisis state machine + source reliability (Beta-style updates); honest reporting of adversarial failure modes"
      />
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Media monitoring</h2>
        <EntityManager endpoint="/api/brand/media" fields={mediaFields} columns={mediaColumns} addLabel="Log media item" emptyMessage="No media items ingested yet." />
      </section>
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">Brand health (method-labeled)</h2>
        <EntityManager endpoint="/api/brand/health" fields={healthFields} columns={healthColumns} addLabel="Record measurement" emptyMessage="No brand health measurements yet." />
      </section>
    </div>
  );
}
