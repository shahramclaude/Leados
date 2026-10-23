import { db } from "@/db";
import { boardItems, cadenceItems, decisions, initiatives, riskItems, signals } from "@/db/schema";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, StatCard, fmtDate } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CockpitPage() {
  const [
    openDecisionsCount,
    activeSignals,
    criticalSignalsCount,
    upcomingCadence,
    pendingBoardCount,
    openRisks,
    activeInitiatives,
    recentDecisions,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(decisions)
      .where(inArray(decisions.status, ["proposed", "under_review", "committed"])),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(signals)
      .where(inArray(signals.status, ["new", "investigating"])),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(signals)
      .where(and(eq(signals.severity, "critical"), inArray(signals.status, ["new", "investigating"]))),
    db
      .select()
      .from(cadenceItems)
      .where(eq(cadenceItems.status, "active"))
      .orderBy(asc(cadenceItems.nextOccurrence))
      .limit(5),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(boardItems)
      .where(inArray(boardItems.status, ["draft", "circulated"])),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(riskItems)
      .where(inArray(riskItems.status, ["open", "mitigating"])),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(initiatives)
      .where(inArray(initiatives.status, ["planned", "active", "at_risk"])),
    db.select().from(decisions).orderBy(desc(decisions.createdAt)).limit(5),
  ]);

  return (
    <div>
      <PageHeader
        title="Executive Cockpit"
        description="A single pane of glass across decisions, signals, cadence, board governance, risk, and strategy."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Open decisions" value={openDecisionsCount[0]?.count ?? 0} tone="indigo" />
        <StatCard
          label="Active signals"
          value={activeSignals[0]?.count ?? 0}
          hint={`${criticalSignalsCount[0]?.count ?? 0} critical`}
          tone="rose"
        />
        <StatCard label="Cadence (active)" value={upcomingCadence.length} tone="emerald" />
        <StatCard label="Board items pending" value={pendingBoardCount[0]?.count ?? 0} tone="amber" />
        <StatCard label="Open risks" value={openRisks[0]?.count ?? 0} tone="rose" />
        <StatCard label="Initiatives in flight" value={activeInitiatives[0]?.count ?? 0} tone="indigo" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Recent decisions</h2>
            <Link href="/decisions" className="text-sm font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {recentDecisions.length === 0 ? (
            <EmptyState message="No decisions logged yet." />
          ) : (
            <ul className="space-y-3">
              {recentDecisions.map((decision) => (
                <li key={decision.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{decision.title}</p>
                    <p className="text-xs text-slate-500">Owner: {decision.owner}</p>
                  </div>
                  <Badge value={decision.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Upcoming cadence</h2>
            <Link href="/cadence" className="text-sm font-medium text-indigo-600 hover:underline">
              View all →
            </Link>
          </div>
          {upcomingCadence.length === 0 ? (
            <EmptyState message="No active cadence items." />
          ) : (
            <ul className="space-y-3">
              {upcomingCadence.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 capitalize">
                      {item.type} · {item.frequency}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{fmtDate(item.nextOccurrence)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
