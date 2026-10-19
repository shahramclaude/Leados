import { db } from "@/db";
import { indicatorReadings, financeAssumptions, financialEvents, execProjects, execMilestones, execBlockers, okrObjectives, okrKeyResults, decisions, wargames } from "@/db/schema";
import { desc } from "drizzle-orm";
import { jsonError } from "@/lib/api";
import { DEFAULT_INDICATORS, synthesizeStateOfBusiness, type IndicatorReading } from "@/lib/indicators";
import { buildMonthlyPnL, computeBurnTrend, runMonteCarloRunway, computeCovenantStatus, type FinancialEventRecord } from "@/lib/financialOS";
import { analyzeProject, type ExecBlocker, type ExecMilestone, type ExecProjectRecord } from "@/lib/executionEngine";
import { rollUpObjective, type Objective, type KeyResult } from "@/lib/okr";

export const dynamic = "force-dynamic";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Computes today's live value for every default indicator from the other engines, then records a reading. */
export async function GET() {
  try {
    const [assumptionsRow] = await db.select().from(financeAssumptions).orderBy(desc(financeAssumptions.id)).limit(1);
    const eventRows = await db.select().from(financialEvents);
    const projectRows = await db.select().from(execProjects);
    const milestoneRows = await db.select().from(execMilestones);
    const blockerRows = await db.select().from(execBlockers);
    const objectiveRows = await db.select().from(okrObjectives);
    const keyResultRows = await db.select().from(okrKeyResults);
    const decisionRows = await db.select().from(decisions);
    const wargameRows = await db.select().from(wargames).orderBy(desc(wargames.createdAt)).limit(1);

    const liveValues = new Map<string, number>();

    const assumptions = assumptionsRow ?? { currentCashBalance: 1000000, baselineMonthlyRevenue: 50000, baselineRevenueGrowthRate: 0.03, grossMarginPct: 0.72, covenantMinCashMonths: 3, covenantMinCashBalance: 250000 };
    const events: FinancialEventRecord[] = eventRows.map((e) => ({ date: e.date, type: e.type as FinancialEventRecord["type"], domain: e.domain, team: e.team, amount: e.amount, category: e.category, description: e.description }));
    const pnl = buildMonthlyPnL(events);
    const burnTrend = computeBurnTrend(pnl);
    const lastPnl = pnl[pnl.length - 1];
    const runway = runMonteCarloRunway({
      currentCash: assumptions.currentCashBalance,
      baselineMonthlyBurn: burnTrend.trailingAvgMonthlyBurn || 100000,
      baselineMonthlyRevenue: lastPnl?.revenue ?? assumptions.baselineMonthlyRevenue,
      revenueGrowthRate: assumptions.baselineRevenueGrowthRate,
    });
    const covenant = computeCovenantStatus(assumptions, runway);
    liveValues.set("runway_months_p50", runway.monthsToBankruptcy.p50);
    liveValues.set("burn_trend_pct", Math.max(0, burnTrend.trendPct));
    liveValues.set("covenant_headroom_pct", covenant.headroomPct);

    const reports = projectRows.map((p) => {
      const project: ExecProjectRecord = { id: p.id, name: p.name, status: p.status, startDate: p.startDate, targetDate: p.targetDate };
      const milestones: ExecMilestone[] = milestoneRows.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, projectId: m.projectId, title: m.title, durationDays: m.durationDays, durationP90Days: m.durationP90Days, dependsOn: (m.dependsOn as number[]) ?? [], dueDate: m.dueDate, status: m.status as ExecMilestone["status"], completedAt: m.completedAt ? m.completedAt.toISOString() : null }));
      const blockers: ExecBlocker[] = blockerRows.filter((b) => b.projectId === p.id).map((b) => ({ id: b.id, projectId: b.projectId, milestoneId: b.milestoneId, title: b.title, severity: b.severity as ExecBlocker["severity"], impactDays: b.impactDays, raisedAt: b.raisedAt.toISOString(), resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null }));
      return analyzeProject(project, milestones, blockers);
    });
    const avgDeliveryConfidence = reports.length ? reports.reduce((s, r) => s + r.deliveryConfidence.score, 0) / reports.length : 0.6;
    liveValues.set("delivery_confidence_avg", avgDeliveryConfidence);
    liveValues.set("open_critical_blockers", blockerRows.filter((b) => !b.resolvedAt && b.severity === "critical").length);

    const objectives: Objective[] = objectiveRows.map((o) => ({ id: o.id, title: o.title, description: o.description, level: o.level as Objective["level"], owner: o.owner, parentId: o.parentId, period: o.period, weight: o.weight }));
    const keyResults: KeyResult[] = keyResultRows.map((k) => ({ id: k.id, objectiveId: k.objectiveId, title: k.title, metricKey: k.metricKey, startValue: k.startValue, targetValue: k.targetValue, currentValue: k.currentValue, unit: k.unit, weight: k.weight, confidence: k.confidence, checkInCadence: k.checkInCadence as KeyResult["checkInCadence"], lastCheckInAt: k.lastCheckInAt }));
    const healths = objectives.map((o) => rollUpObjective(o, keyResults));
    const offTrackShare = healths.length ? healths.filter((h) => h.status === "off_track").length / healths.length : 0;
    liveValues.set("okr_off_track_share", offTrackShare);

    const now = new Date();
    const overdueDecisions = decisionRows.filter((d) => (d.status === "proposed" || d.status === "deferred") && d.deadline && new Date(d.deadline).getTime() < now.getTime()).length;
    liveValues.set("decision_backlog_overdue", overdueDecisions);

    const latestWargame = wargameRows[0];
    const outcome = latestWargame?.outcome as { outcomeDistribution?: { winProbability?: number } } | undefined;
    liveValues.set("competitor_win_rate_against_us", 1 - (outcome?.outcomeDistribution?.winProbability ?? 0.55));

    // Record today's reading for each indicator (idempotent per day — delete+insert).
    const today = todayKey();
    for (const [key, value] of liveValues) {
      const existing = await db.select().from(indicatorReadings);
      const alreadyToday = existing.some((r) => r.indicatorKey === key && r.recordedAt.toISOString().slice(0, 10) === today);
      if (!alreadyToday) {
        await db.insert(indicatorReadings).values({ indicatorKey: key, value });
      }
    }

    const allReadings = await db.select().from(indicatorReadings);
    const readingsByKey = new Map<string, IndicatorReading[]>();
    for (const def of DEFAULT_INDICATORS) {
      readingsByKey.set(
        def.key,
        allReadings.filter((r) => r.indicatorKey === def.key).map((r) => ({ indicatorKey: r.indicatorKey, value: r.value, recordedAt: r.recordedAt })),
      );
    }

    const synthesis = synthesizeStateOfBusiness(DEFAULT_INDICATORS, readingsByKey);
    return Response.json({ synthesis, liveValues: Object.fromEntries(liveValues) });
  } catch (err) {
    return jsonError((err as Error).message, 500);
  }
}
