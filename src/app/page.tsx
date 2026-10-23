import { db } from "@/db";
import { approvals, initiatives, metrics, objectives } from "@/db/schema";
import { DEFAULT_ORG_ID } from "@/lib/org";
import { applyTable, metricSeverityTable } from "@/lib/rules";
import { Badge, Card, EmptyState, PageHeader, ProgressBar, StatBlock } from "@/components/ui";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";

export const dynamic = "force-dynamic";

const severityTone = { good: "success", watch: "warning", critical: "danger" } as const;

export default async function HomePage() {
  const [metricRows, objectiveRows, initiativeRows, pendingApprovals] = await Promise.all([
    db.select().from(metrics).where(eq(metrics.orgId, DEFAULT_ORG_ID)),
    db.select().from(objectives).where(eq(objectives.orgId, DEFAULT_ORG_ID)),
    db.select().from(initiatives).where(eq(initiatives.orgId, DEFAULT_ORG_ID)),
    db
      .select()
      .from(approvals)
      .where(eq(approvals.orgId, DEFAULT_ORG_ID))
      .orderBy(desc(approvals.createdAt)),
  ]);

  const pending = pendingApprovals.filter((a) => a.status === "pending");

  // Narrative intelligence (lite): one observation per metric, fact-locked
  // to the metric row itself (no external numbers invented).
  const insights = metricRows
    .map((m) => {
      const pctOfTarget = m.target ? (m.value / m.target) * 100 : 100;
      const trace = applyTable(metricSeverityTable, { pctOfTarget });
      const deltaPct = m.previousValue ? ((m.value - m.previousValue) / Math.abs(m.previousValue)) * 100 : 0;
      return {
        metric: m,
        severity: trace.output.severity,
        because: trace.explanation,
        deltaPct,
      };
    })
    .sort((a, b) => (a.severity === "critical" ? -1 : 1) - (b.severity === "critical" ? -1 : 1))
    .slice(0, 3);

  return (
    <div>
      <PageHeader
        eyebrow="Today"
        title="Executive Home"
        description="Everything that needs your attention, with the data behind every number one click away."
      />

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricRows.length === 0 ? (
          <div className="col-span-full">
            <EmptyState title="No metrics yet" description="Seed data has not loaded. Run the seed script." />
          </div>
        ) : (
          metricRows.map((m) => {
            const deltaPct = m.previousValue ? ((m.value - m.previousValue) / Math.abs(m.previousValue)) * 100 : 0;
            return (
              <StatBlock
                key={m.id}
                label={m.name}
                value={m.value.toLocaleString()}
                unit={m.unit}
                delta={`${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs prior`}
                tone={deltaPct >= 0 ? "success" : "danger"}
              />
            );
          })
        )}
      </section>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Narrative intelligence</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            Ranked by severity. Every claim here cites the metric row it was computed from.
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {insights.length === 0 ? (
              <EmptyState title="No insights yet" description="Metrics will generate insights once seeded." />
            ) : (
              insights.map((i) => (
                <li key={i.metric.id} className="rounded-[var(--radius-md)] border border-[var(--border-default)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="m-0 text-[14px] font-medium text-[var(--text-primary)]">
                      {i.metric.name} is {i.deltaPct >= 0 ? "up" : "down"} {Math.abs(i.deltaPct).toFixed(1)}% vs the
                      prior reading, {i.because.toLowerCase()}
                    </p>
                    <Badge tone={severityTone[i.severity]}>{i.severity}</Badge>
                  </div>
                  <p className="mt-2 m-0 text-[12px] text-[var(--text-muted)]">
                    Source: metrics · as of {new Date(i.metric.asOf).toLocaleDateString()}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card>
          <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Needs your attention</h2>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">{pending.length} pending approvals</p>
          <ul className="mt-4 flex flex-col gap-3">
            {pending.length === 0 ? (
              <EmptyState title="Queue is clear" />
            ) : (
              pending.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-[14px]">
                  <span className="truncate text-[var(--text-primary)]">{a.title}</span>
                  <Badge tone="warning">{a.riskTier}</Badge>
                </li>
              ))
            )}
          </ul>
          <Link
            href="/approvals"
            className="mt-4 inline-block text-[13px] font-medium text-[var(--brand-600)] hover:underline"
          >
            Open approval queue →
          </Link>
        </Card>
      </div>

      <section className="mt-8">
        <h2 className="m-0 text-[18px] font-semibold text-[var(--text-primary)]">Objectives in flight</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {objectiveRows.length === 0 ? (
            <div className="col-span-full">
              <EmptyState title="No objectives yet" description="Create one from the Plan module." />
            </div>
          ) : (
            objectiveRows.map((o) => {
              const related = initiativeRows.filter((i) => i.objectiveId === o.id);
              const avgProgress = related.length
                ? Math.round(related.reduce((s, i) => s + i.progressPct, 0) / related.length)
                : 0;
              return (
                <Card key={o.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="m-0 text-[14px] font-semibold text-[var(--text-primary)]">{o.title}</p>
                    <Badge tone={o.status === "on_track" ? "success" : o.status === "at_risk" ? "warning" : "danger"}>
                      {o.status.replace("_", " ")}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <ProgressBar pct={avgProgress} />
                  </div>
                  <p className="mt-2 m-0 text-[12px] text-[var(--text-muted)]">
                    {avgProgress}% average progress across {related.length} initiative(s)
                  </p>
                </Card>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
