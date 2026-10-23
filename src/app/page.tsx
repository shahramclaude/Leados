import Link from "next/link";
import { db } from "@/db";
import {
  decisions,
  signals,
  risks,
  agents,
  cadenceItems,
  boardPacks,
  fitnessMetrics,
  interventions,
} from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [
    [decisionCount],
    [openSignalCount],
    [openRiskCount],
    [agentCount],
    recentDecisions,
    recentSignals,
    topRisks,
    fitness,
    pendingInterventions,
    upcomingCadence,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(decisions),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(signals)
      .where(eq(signals.status, "open")),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(risks)
      .where(sql`${risks.status} != 'closed'`),
    db.select({ count: sql<number>`count(*)::int` }).from(agents),
    db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(5),
    db.select().from(signals).orderBy(desc(signals.detectedAt)).limit(5),
    db.select().from(risks).orderBy(desc(risks.createdAt)).limit(5),
    db.select().from(fitnessMetrics).orderBy(desc(fitnessMetrics.measuredAt)).limit(6),
    db.select().from(interventions).orderBy(desc(interventions.createdAt)).limit(4),
    db.select().from(cadenceItems).orderBy(cadenceItems.nextOccurrence).limit(5),
  ]);

  const avgFitness =
    fitness.length > 0 ? Math.round(fitness.reduce((sum, f) => sum + f.score, 0) / fitness.length) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Part 00 · Cockpit"
        title="Executive Cockpit"
        description="Live read across decisions, signals, risk, autonomy, and organizational fitness."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Decisions" value={decisionCount.count} hint="total tracked" />
        <StatCard label="Open Signals" value={openSignalCount.count} hint="awaiting triage" />
        <StatCard label="Active Risks" value={openRiskCount.count} hint="not yet closed" />
        <StatCard label="Org Fitness" value={avgFitness ?? "—"} hint="avg score / 100" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Decisions</h2>
            <Link href="/decisions" className="text-xs text-cyan-400 hover:underline">
              View all →
            </Link>
          </div>
          {recentDecisions.length === 0 ? (
            <p className="text-sm text-slate-500">No decisions logged yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentDecisions.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <Link href={`/decisions/${d.id}`} className="truncate text-sm font-medium text-slate-100 hover:text-cyan-300">
                      {d.title}
                    </Link>
                    <p className="text-xs text-slate-500">{d.owner} · {d.category}</p>
                  </div>
                  <Badge value={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Recent Signals</h2>
            <Link href="/signals" className="text-xs text-cyan-400 hover:underline">
              View all →
            </Link>
          </div>
          {recentSignals.length === 0 ? (
            <p className="text-sm text-slate-500">No signals detected yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentSignals.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{s.title}</p>
                    <p className="text-xs text-slate-500">{s.source} · {s.category}</p>
                  </div>
                  <Badge value={s.severity} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Top Risks</h2>
            <Link href="/risks" className="text-xs text-cyan-400 hover:underline">
              View all →
            </Link>
          </div>
          {topRisks.length === 0 ? (
            <p className="text-sm text-slate-500">Risk register is empty.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {topRisks.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{r.title}</p>
                    <p className="text-xs text-slate-500">{r.category} · owner {r.owner}</p>
                  </div>
                  <Badge value={r.impactLevel} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Upcoming Cadence</h2>
            <Link href="/cadence" className="text-xs text-cyan-400 hover:underline">
              View all →
            </Link>
          </div>
          {upcomingCadence.length === 0 ? (
            <p className="text-sm text-slate-500">No cadence items scheduled.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {upcomingCadence.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{c.title}</p>
                    <p className="text-xs text-slate-500">
                      {c.cadence} · {c.nextOccurrence ? new Date(c.nextOccurrence).toLocaleDateString() : "unscheduled"}
                    </p>
                  </div>
                  <Badge value={c.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Recommended Interventions
            </h2>
            <Link href="/interventions" className="text-xs text-cyan-400 hover:underline">
              View all →
            </Link>
          </div>
          {pendingInterventions.length === 0 ? (
            <p className="text-sm text-slate-500">No interventions proposed yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pendingInterventions.map((i) => (
                <div key={i.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{i.title}</p>
                    <Badge value={i.status} />
                  </div>
                  <p className="text-xs text-slate-500">
                    impact {i.impactScore} · effort {i.effortScore} · {i.category}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
