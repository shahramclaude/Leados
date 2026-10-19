// boardPackService — gathers data across every Part 6 domain (OKRs,
// finance, scenarios, execution, decisions, indicators) and assembles the
// deterministic board pack. Shared by `/api/strategic/board-pack` and
// `/api/export` so both produce byte-identical output for the same data.
import { db } from "@/db";
import {
  okrObjectives,
  okrKeyResults,
  okrInitiatives,
  financeAssumptions,
  financialEvents,
  scenarios,
  execProjects,
  execMilestones,
  execBlockers,
  decisions,
  indicatorReadings,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { rollUpObjective, buildCascadeMap, type Objective, type KeyResult, type Initiative } from "@/lib/okr";
import { buildMonthlyPnL, computeBurnTrend, runMonteCarloRunway, computeFundraisingReadiness, computeCovenantStatus, type FinancialEventRecord } from "@/lib/financialOS";
import { compareScenarios } from "@/lib/scenarioEngine";
import { analyzeProject, type ExecBlocker, type ExecMilestone, type ExecProjectRecord } from "@/lib/executionEngine";
import { DEFAULT_INDICATORS, synthesizeStateOfBusiness, type IndicatorReading } from "@/lib/indicators";
import { generateBoardPack, type BoardPack } from "@/lib/strategicReport";
import type { Decision } from "@/lib/decisionTypes";

export function periodLabel(d: Date): string {
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${d.getUTCFullYear()}-Q${q}`;
}

export interface BuiltBoardPack {
  pack: BoardPack;
  inputsSnapshot: Record<string, number>;
  periodLabel: string;
}

/** Pulls every input the board pack needs and runs it through `generateBoardPack`. */
export async function buildBoardPack(now: Date): Promise<BuiltBoardPack> {
  const [assumptionsRow] = await db.select().from(financeAssumptions).orderBy(desc(financeAssumptions.id)).limit(1);
  const eventRows = await db.select().from(financialEvents);
  const objectiveRows = await db.select().from(okrObjectives);
  const keyResultRows = await db.select().from(okrKeyResults);
  const initiativeRows = await db.select().from(okrInitiatives);
  const scenarioRows = await db.select().from(scenarios).orderBy(desc(scenarios.createdAt)).limit(5);
  const projectRows = await db.select().from(execProjects);
  const milestoneRows = await db.select().from(execMilestones);
  const blockerRows = await db.select().from(execBlockers);
  const decisionRows = await db.select().from(decisions);
  const readingRows = await db.select().from(indicatorReadings);

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
  const fundraising = computeFundraisingReadiness(runway, assumptions.baselineRevenueGrowthRate, burnTrend);
  const covenant = computeCovenantStatus(assumptions, runway);

  const objectives: Objective[] = objectiveRows.map((o) => ({ id: o.id, title: o.title, description: o.description, level: o.level as Objective["level"], owner: o.owner, parentId: o.parentId, period: o.period, weight: o.weight }));
  const keyResults: KeyResult[] = keyResultRows.map((k) => ({ id: k.id, objectiveId: k.objectiveId, title: k.title, metricKey: k.metricKey, startValue: k.startValue, targetValue: k.targetValue, currentValue: k.currentValue, unit: k.unit, weight: k.weight, confidence: k.confidence, checkInCadence: k.checkInCadence as KeyResult["checkInCadence"], lastCheckInAt: k.lastCheckInAt }));
  const initiatives: Initiative[] = initiativeRows.map((i) => ({ id: i.id, keyResultId: i.keyResultId, title: i.title, status: i.status as Initiative["status"], contributionWeight: i.contributionWeight, executionProjectId: i.executionProjectId }));
  const objectiveHealths = objectives.map((o) => rollUpObjective(o, keyResults, now));
  const { misalignments } = buildCascadeMap(objectives, keyResults, initiatives, now);

  const scenarioComparisons = compareScenarios(
    scenarioRows.map((s) => ({ id: s.id, name: s.name, results: s.results as { monthsToBankruptcy: { p10: number; p50: number; p90: number }; bankruptcyRiskWithin12Months: number } })),
  );

  const executionReports = projectRows.map((p) => {
    const project: ExecProjectRecord = { id: p.id, name: p.name, status: p.status, startDate: p.startDate, targetDate: p.targetDate };
    const milestones: ExecMilestone[] = milestoneRows.filter((m) => m.projectId === p.id).map((m) => ({ id: m.id, projectId: m.projectId, title: m.title, durationDays: m.durationDays, durationP90Days: m.durationP90Days, dependsOn: (m.dependsOn as number[]) ?? [], dueDate: m.dueDate, status: m.status as ExecMilestone["status"], completedAt: m.completedAt ? m.completedAt.toISOString() : null }));
    const blockers: ExecBlocker[] = blockerRows.filter((b) => b.projectId === p.id).map((b) => ({ id: b.id, projectId: b.projectId, milestoneId: b.milestoneId, title: b.title, severity: b.severity as ExecBlocker["severity"], impactDays: b.impactDays, raisedAt: b.raisedAt.toISOString(), resolvedAt: b.resolvedAt ? b.resolvedAt.toISOString() : null }));
    return analyzeProject(project, milestones, blockers, now);
  });

  const decisionModels: Decision[] = decisionRows.map((d) => ({
    id: d.id,
    title: d.title,
    domain: d.domain as Decision["domain"],
    status: d.status as Decision["status"],
    context: d.context,
    doorType: d.doorType as Decision["doorType"],
    impact: d.impact,
    deadline: d.deadline,
    preMortem: Array.isArray(d.preMortem) ? d.preMortem : [],
    chosenOptionId: d.chosenOptionId,
    retrospectiveScore: d.retrospectiveScore,
    retrospectiveNotes: d.retrospectiveNotes,
    retrospectiveDueAt: d.retrospectiveDueAt ? d.retrospectiveDueAt.toISOString() : null,
  }));

  const readingsByKey = new Map<string, IndicatorReading[]>();
  for (const def of DEFAULT_INDICATORS) {
    readingsByKey.set(def.key, readingRows.filter((r) => r.indicatorKey === def.key).map((r) => ({ indicatorKey: r.indicatorKey, value: r.value, recordedAt: r.recordedAt })));
  }
  const stateOfBusiness = synthesizeStateOfBusiness(DEFAULT_INDICATORS, readingsByKey);

  const evidenceLinks = [
    { label: "OKR cascade (/api/okr)", href: "/api/okr" },
    { label: "Financial operating system (/api/financial)", href: "/api/financial" },
    { label: "Execution command (/api/execution)", href: "/api/execution" },
    { label: "Early-warning indicators (/api/strategic/indicators)", href: "/api/strategic/indicators" },
    { label: "Decisions (/api/decisions)", href: "/api/decisions" },
  ];

  const pack = generateBoardPack({
    periodLabel: periodLabel(now),
    generatedAt: now,
    objectiveHealths,
    misalignments,
    financial: { currentCash: assumptions.currentCashBalance, runway, fundraising, covenant, burnTrend },
    scenarios: scenarioComparisons,
    executionReports,
    decisions: decisionModels,
    stateOfBusiness,
    evidenceLinks,
  });

  const inputsSnapshot = { objectiveCount: objectives.length, projectCount: projectRows.length, decisionCount: decisionRows.length, scenarioCount: scenarioRows.length };
  return { pack, inputsSnapshot, periodLabel: periodLabel(now) };
}
