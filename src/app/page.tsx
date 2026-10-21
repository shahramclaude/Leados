import { db } from "@/db";
import { sql } from "drizzle-orm";
import { MetricTile } from "@/components/insight/MetricTile";
import { InsightCard } from "@/components/insight/InsightCard";
import { DecisionTimeline } from "@/components/insight/DecisionTimeline";
import { CategoricalLegend } from "@/components/charts/CategoricalLegend";
import { explain } from "@/lib/explain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await db.execute(sql`select 1`);

  const revenueInsight = explain(482_000, {
    claim: "Net revenue retention is trending up for the third consecutive quarter, driven by expansion in the mid-market segment.",
    confidence: "corroborated",
    evidence: [
      { id: "billing", label: "Billing ledger Q1–Q3" },
      { id: "cohort", label: "Cohort retention model" },
      { id: "cs-notes", label: "CS renewal notes" },
    ],
    method: "NRR = (starting ARR + expansion − contraction − churn) / starting ARR, computed per cohort-month and rolled up quarterly.",
    caveats: ["Mid-market segment boundary changed in Q2; comparison re-based."],
    asOf: "2026-01-15",
  });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-[var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Overview</p>
        <h1 className="text-[var(--text-3xl)] font-semibold leading-[var(--leading-tight)] text-[var(--text-primary)]">
          Cross-domain summary
        </h1>
        <p className="measure text-[var(--text-base)] text-[var(--text-secondary)]">
          Chunked into three groups per Miller&rsquo;s law: headline metrics, the top insight needing a decision, and recent
          decisions. See <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-[var(--text-sm)]">/styleguide</code>{" "}
          for the full component specification.
        </p>
        <CategoricalLegend className="mt-2" />
      </header>

      {/* Chunk 1 of 3: headline metrics */}
      <section aria-labelledby="metrics-heading" className="flex flex-col gap-3">
        <h2 id="metrics-heading" className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
          Headline metrics
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricTile
            label="Net revenue retention"
            value="112.4%"
            comparison={{ value: 0.038, label: "QoQ" }}
            trend={[98, 101, 104, 103, 107, 109, 112]}
            provenance="Source: billing ledger, refreshed nightly at 02:00 UTC."
          />
          <MetricTile
            label="Runway"
            value="17.2 mo"
            interval="± 1.4 mo"
            comparison={{ value: -0.05, label: "QoQ" }}
            trend={[21, 20, 19.5, 18.7, 18, 17.6, 17.2]}
            provenance="Modeled from current burn rate and committed pipeline."
          />
          <MetricTile
            label="Open risk items"
            value="6"
            comparison={{ value: -0.2, label: "vs last review" }}
            trend={[11, 10, 9, 8, 7, 7, 6]}
            provenance="Risk register, items with status = open or mitigating."
          />
        </div>
      </section>

      {/* Chunk 2 of 3: top insight */}
      <section aria-labelledby="insight-heading" className="flex flex-col gap-3">
        <h2 id="insight-heading" className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
          Needs a decision
        </h2>
        <InsightCard title="Revenue retention" insight={revenueInsight} className="max-w-2xl" />
      </section>

      {/* Chunk 3 of 3: recent decisions */}
      <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
        <h2 id="timeline-heading" className="text-[var(--text-lg)] font-semibold text-[var(--text-primary)]">
          Recent decisions
        </h2>
        <DecisionTimeline
          events={[
            {
              id: "evt-1",
              date: "2026-01-10",
              title: "Approved mid-market pricing pilot",
              description: "Pilot runs Q1, re-evaluate at 90 days using the retention model above.",
              domain: "strategy",
              confidence: "corroborated",
            },
            {
              id: "evt-2",
              date: "2025-12-18",
              title: "Closed two open compliance findings",
              domain: "risk",
              confidence: "observed",
            },
            {
              id: "evt-3",
              date: "2025-12-02",
              title: "Hired VP Operations",
              domain: "people",
              confidence: "observed",
            },
          ]}
        />
      </section>
    </div>
  );
}
