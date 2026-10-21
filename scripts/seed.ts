// Master seed script: run with `npm run seed`.
// 1. Loads scripts/seed_financial.sql (assumptions, actual ledger lines, covenants).
// 2. Derives `reported_actuals` by aggregating those same ledger lines — this
//    is the reconciliation ground truth (see financialOS.ts reconcile()).
// 3. Seeds OKRs, execution projects/milestones/blockers, decisions + trees,
//    scenarios + wargame branches, and early-warning indicators + readings.
// 4. Produces one delivery forecast + backtest so the calibration ledger has
//    a real data point on first run.
import "dotenv/config";
import { execSync } from "node:child_process";
import { db, pool } from "../src/db";
import {
  financialEvents,
  reportedActuals,
  okrObjectives,
  okrKeyResults,
  okrInitiatives,
  execProjects,
  execMilestones,
  execBlockers,
  decisions,
  decisionOptions,
  decisionCriteria,
  decisionOutcomes,
  decisionTreeNodes,
  scenarios,
  wargameMoves,
  indicators,
  indicatorReadings,
} from "../src/db/schema";
import { monthKey, num, round2 } from "../src/lib/format";
import { forecastDelivery, backtestProject } from "../src/lib/delivery";
import { sql } from "drizzle-orm";

async function truncateNonFinancialTables() {
  await db.execute(sql`TRUNCATE TABLE
    okr_initiatives, okr_key_results, okr_objectives,
    exec_blockers, delivery_backtests, delivery_forecasts, exec_milestones, exec_projects,
    decision_tree_nodes, decision_outcomes, decision_criteria, decision_options, decision_retrospectives, decisions,
    wargame_moves, scenarios,
    indicator_readings, indicators,
    calibration_records, board_packs, job_runs
    RESTART IDENTITY CASCADE`);
}

function runSqlFile(path: string) {
  const databaseUrl = process.env.DATABASE_URL;
  execSync(`psql "${databaseUrl}" -v ON_ERROR_STOP=1 -f ${path}`, { stdio: "inherit" });
}

async function deriveReportedActuals() {
  const rows = await db.select().from(financialEvents);
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.category === "headcount") continue;
    const key = `${monthKey(r.eventDate)}::${r.category}`;
    map.set(key, round2((map.get(key) ?? 0) + num(r.amount)));
  }
  for (const [key, amount] of map.entries()) {
    const [month, category] = key.split("::");
    await db.insert(reportedActuals).values({
      periodMonth: `${month}-01`,
      category,
      amount: String(amount),
      note: "Derived from aggregated financial_events at seed time — stands in for an accounting-system ledger close export.",
    });
  }
  console.log(`Seeded ${map.size} reported_actuals rows (reconciliation ground truth).`);
}

async function seedOkrAndExecution() {
  // --- Execution projects --------------------------------------------------
  const [projA] = await db
    .insert(execProjects)
    .values({ title: "Enterprise outbound motion", owner: "Dana Reyes", startDate: "2025-11-01", dueDate: "2026-02-15", status: "in_progress", scopeChurnCount: 4, keyPersonRisk: "0.60", wipCount: 3 })
    .returning();
  const [projB] = await db
    .insert(execProjects)
    .values({ title: "Incident response & uptime program", owner: "Tariq Haddad", startDate: "2025-10-01", dueDate: "2026-01-20", status: "in_progress", scopeChurnCount: 1, keyPersonRisk: "0.15", wipCount: 1 })
    .returning();
  const [projC] = await db
    .insert(execProjects)
    .values({ title: "Billing platform migration", owner: "Sam Osei", startDate: "2025-07-01", dueDate: "2025-10-01", status: "done", scopeChurnCount: 2, keyPersonRisk: "0.20", wipCount: 2 })
    .returning();

  const [a1] = await db.insert(execMilestones).values({ projectId: projA.id, title: "ICP refresh", sequence: 1, dependsOn: [], optimisticDays: "3", likelyDays: "5", pessimisticDays: "9", plannedDate: "2025-11-10", actualDate: "2025-11-14", status: "done" }).returning();
  const [a2] = await db.insert(execMilestones).values({ projectId: projA.id, title: "Outbound sequence build", sequence: 2, dependsOn: [a1.id], optimisticDays: "5", likelyDays: "8", pessimisticDays: "14", plannedDate: "2025-11-25", actualDate: "2025-12-04", status: "done" }).returning();
  const [a3] = await db.insert(execMilestones).values({ projectId: projA.id, title: "Pilot cohort live", sequence: 3, dependsOn: [a2.id], optimisticDays: "7", likelyDays: "12", pessimisticDays: "20", plannedDate: "2025-12-20", actualDate: null, status: "in_progress" }).returning();
  await db.insert(execMilestones).values({ projectId: projA.id, title: "Scale to 10 reps", sequence: 4, dependsOn: [a3.id], optimisticDays: "10", likelyDays: "18", pessimisticDays: "30", plannedDate: "2026-02-10", actualDate: null, status: "pending" });
  await db.insert(execBlockers).values({ projectId: projA.id, milestoneId: a3.id, description: "Legal review delay on outbound compliance language", raisedAt: "2025-12-05", resolvedAt: null, impactDays: "8" });

  const [b1] = await db.insert(execMilestones).values({ projectId: projB.id, title: "Runbook v1 published", sequence: 1, dependsOn: [], optimisticDays: "4", likelyDays: "6", pessimisticDays: "10", plannedDate: "2025-10-15", actualDate: "2025-10-14", status: "done" }).returning();
  const [b2] = await db.insert(execMilestones).values({ projectId: projB.id, title: "On-call rotation + paging overhaul", sequence: 2, dependsOn: [b1.id], optimisticDays: "6", likelyDays: "9", pessimisticDays: "15", plannedDate: "2025-11-15", actualDate: "2025-11-13", status: "done" }).returning();
  const [b3] = await db.insert(execMilestones).values({ projectId: projB.id, title: "SLO dashboards live", sequence: 3, dependsOn: [b2.id], optimisticDays: "5", likelyDays: "8", pessimisticDays: "12", plannedDate: "2025-12-20", actualDate: "2025-12-22", status: "done" }).returning();
  await db.insert(execMilestones).values({ projectId: projB.id, title: "Quarterly game-day review", sequence: 4, dependsOn: [b3.id], optimisticDays: "3", likelyDays: "5", pessimisticDays: "8", plannedDate: "2026-01-18", actualDate: null, status: "in_progress" });

  const [c1] = await db.insert(execMilestones).values({ projectId: projC.id, title: "Vendor selection", sequence: 1, dependsOn: [], optimisticDays: "10", likelyDays: "14", pessimisticDays: "21", plannedDate: "2025-07-20", actualDate: "2025-07-18", status: "done" }).returning();
  const [c2] = await db.insert(execMilestones).values({ projectId: projC.id, title: "Data migration dry run", sequence: 2, dependsOn: [c1.id], optimisticDays: "14", likelyDays: "20", pessimisticDays: "30", plannedDate: "2025-08-20", actualDate: "2025-08-29", status: "done" }).returning();
  await db.insert(execMilestones).values({ projectId: projC.id, title: "Cutover & reconciliation", sequence: 3, dependsOn: [c2.id], optimisticDays: "10", likelyDays: "16", pessimisticDays: "25", plannedDate: "2025-09-25", actualDate: "2025-10-09", status: "done" });

  // --- OKRs -----------------------------------------------------------------
  const [obj1] = await db.insert(okrObjectives).values({ title: "Win market leadership in mid-market segment", description: "Out-grow and out-retain the two incumbent competitors in our core segment.", owner: "CEO — Elena Marsh", period: "2026-Q1", weight: "1" }).returning();
  const [obj2] = await db.insert(okrObjectives).values({ title: "Ship platform reliability & scale", description: "Make reliability a competitive advantage, not a support cost.", owner: "VP Engineering — Tariq Haddad", period: "2026-Q1", weight: "1" }).returning();
  await db.insert(okrObjectives).values({ title: "Operational efficiency", description: "Reduce cost-to-serve ahead of the Series B raise.", owner: "COO — Alicia Chen", period: "2026-Q1", weight: "0.75" }); // deliberately left WITHOUT key results — tests "uncovered objective" detection

  const [kr11] = await db
    .insert(okrKeyResults)
    .values({ objectiveId: obj1.id, title: "Grow net-new ARR to $2.4M", metric: "ARR ($)", direction: "increase", startValue: "1800000", targetValue: "2400000", currentValue: "2050000", unit: "$", weight: "2", selfReportedStatus: "green", selfReportedConfidence: "0.85", ownerId: "Dana Reyes", lastCheckIn: new Date() })
    .returning();
  const [kr12] = await db
    .insert(okrKeyResults)
    .values({ objectiveId: obj1.id, title: "Maintain gross margin at or above 76%", metric: "Gross margin (%)", direction: "increase", startValue: "74", targetValue: "76", currentValue: "75.5", unit: "%", weight: "1", selfReportedStatus: "yellow", selfReportedConfidence: "0.8", ownerId: "Marcus Webb", lastCheckIn: new Date() })
    .returning();
  const [kr21] = await db
    .insert(okrKeyResults)
    .values({ objectiveId: obj2.id, title: "Reduce P1 incidents to 2 or fewer per quarter", metric: "P1 incident count", direction: "decrease", startValue: "6", targetValue: "2", currentValue: "3", unit: "count", weight: "1.5", selfReportedStatus: "yellow", selfReportedConfidence: "0.75", ownerId: "Tariq Haddad", lastCheckIn: new Date() })
    .returning();
  const [kr22] = await db
    .insert(okrKeyResults)
    .values({ objectiveId: obj2.id, title: "Achieve 99.95% uptime", metric: "Uptime (%)", direction: "increase", startValue: "99.80", targetValue: "99.95", currentValue: "99.93", unit: "%", weight: "1", selfReportedStatus: "green", selfReportedConfidence: "0.9", ownerId: "Tariq Haddad", lastCheckIn: new Date() })
    .returning();

  await db.insert(okrInitiatives).values({ keyResultId: kr11.id, title: "Enterprise outbound motion", weight: "1", projectId: projA.id });
  await db.insert(okrInitiatives).values({ keyResultId: kr11.id, title: "Partner channel pilot", weight: "1", projectId: null }); // orphan: no linked execution project
  await db.insert(okrInitiatives).values({ keyResultId: kr12.id, title: "Billing platform margin efficiency", weight: "1", projectId: projC.id });
  await db.insert(okrInitiatives).values({ keyResultId: kr21.id, title: "Incident response runbook rollout", weight: "1", projectId: projB.id });
  await db.insert(okrInitiatives).values({ keyResultId: kr22.id, title: "Uptime SLO program", weight: "1", projectId: projB.id });

  return { projA, projB, projC };
}

async function seedDecisions() {
  const decidedAt = new Date();
  decidedAt.setDate(decidedAt.getDate() - 150);
  const reviewDatePast = new Date();
  reviewDatePast.setDate(reviewDatePast.getDate() - 60);

  // Decision 1: open, one-way-door — EU market entry.
  const [d1] = await db
    .insert(decisions)
    .values({ title: "EU market entry mode", context: "We have inbound demand from EU enterprise accounts but no legal entity, data residency, or local support coverage. Need to pick an entry mode for FY26 GTM planning.", status: "open", reversibility: "one-way-door", ownerId: "CEO — Elena Marsh" })
    .returning();

  const criteriaRows = await db
    .insert(decisionCriteria)
    .values([
      { decisionId: d1.id, label: "Speed to revenue", weight: "0.30" },
      { decisionId: d1.id, label: "Control over customer experience", weight: "0.25" },
      { decisionId: d1.id, label: "Capital required", weight: "0.20" },
      { decisionId: d1.id, label: "Regulatory complexity", weight: "0.25" },
    ])
    .returning();
  const [cSpeed, cControl, cCapital, cReg] = criteriaRows;

  const [optSub] = await db
    .insert(decisionOptions)
    .values({ decisionId: d1.id, label: "Open EU subsidiary", description: "Incorporate a local entity, hire local GM + support.", scores: { [cSpeed.id]: 4, [cControl.id]: 9, [cCapital.id]: 3, [cReg.id]: 3 } })
    .returning();
  const [optPartner] = await db
    .insert(decisionOptions)
    .values({ decisionId: d1.id, label: "Partner with regional reseller", description: "Signed reseller agreement, no local entity.", scores: { [cSpeed.id]: 8, [cControl.id]: 4, [cCapital.id]: 8, [cReg.id]: 7 } })
    .returning();
  const [optDelay] = await db
    .insert(decisionOptions)
    .values({ decisionId: d1.id, label: "Delay 2 quarters", description: "Wait for Series B close and more data before committing.", scores: { [cSpeed.id]: 2, [cControl.id]: 6, [cCapital.id]: 10, [cReg.id]: 9 } })
    .returning();

  await db.insert(decisionOutcomes).values([
    { optionId: optSub.id, scenarioLabel: "Strong EU demand materializes", probability: "0.30", payoffLow: "500000", payoffBase: "1200000", payoffHigh: "2000000" },
    { optionId: optSub.id, scenarioLabel: "Moderate demand", probability: "0.50", payoffLow: "100000", payoffBase: "500000", payoffHigh: "900000" },
    { optionId: optSub.id, scenarioLabel: "Weak demand / regulatory friction", probability: "0.20", payoffLow: "-800000", payoffBase: "-300000", payoffHigh: "0" },
    { optionId: optPartner.id, scenarioLabel: "Strong partner execution", probability: "0.35", payoffLow: "200000", payoffBase: "450000", payoffHigh: "700000" },
    { optionId: optPartner.id, scenarioLabel: "Moderate partner execution", probability: "0.45", payoffLow: "50000", payoffBase: "200000", payoffHigh: "400000" },
    { optionId: optPartner.id, scenarioLabel: "Weak partner fit", probability: "0.20", payoffLow: "-150000", payoffBase: "-50000", payoffHigh: "50000" },
    { optionId: optDelay.id, scenarioLabel: "Market still open in 2 quarters", probability: "0.60", payoffLow: "0", payoffBase: "150000", payoffHigh: "300000" },
    { optionId: optDelay.id, scenarioLabel: "Competitor captures the share instead", probability: "0.40", payoffLow: "-200000", payoffBase: "-100000", payoffHigh: "0" },
  ]);

  // Decision tree mirroring the same choice, for the interactive tree tool.
  const [root] = await db.insert(decisionTreeNodes).values({ decisionId: d1.id, parentId: null, nodeType: "decision", label: "Choose EU entry mode" }).returning();
  const [chanceSub] = await db.insert(decisionTreeNodes).values({ decisionId: d1.id, parentId: root.id, nodeType: "chance", label: "Open subsidiary" }).returning();
  const [chancePartner] = await db.insert(decisionTreeNodes).values({ decisionId: d1.id, parentId: root.id, nodeType: "chance", label: "Partner reseller" }).returning();
  const [chanceDelay] = await db.insert(decisionTreeNodes).values({ decisionId: d1.id, parentId: root.id, nodeType: "chance", label: "Delay 2 quarters" }).returning();
  await db.insert(decisionTreeNodes).values([
    { decisionId: d1.id, parentId: chanceSub.id, nodeType: "outcome", label: "Strong demand", probability: "0.30", payoff: "1200000" },
    { decisionId: d1.id, parentId: chanceSub.id, nodeType: "outcome", label: "Moderate demand", probability: "0.50", payoff: "500000" },
    { decisionId: d1.id, parentId: chanceSub.id, nodeType: "outcome", label: "Weak demand", probability: "0.20", payoff: "-300000" },
    { decisionId: d1.id, parentId: chancePartner.id, nodeType: "outcome", label: "Strong partner", probability: "0.35", payoff: "450000" },
    { decisionId: d1.id, parentId: chancePartner.id, nodeType: "outcome", label: "Moderate partner", probability: "0.45", payoff: "200000" },
    { decisionId: d1.id, parentId: chancePartner.id, nodeType: "outcome", label: "Weak partner", probability: "0.20", payoff: "-50000" },
    { decisionId: d1.id, parentId: chanceDelay.id, nodeType: "outcome", label: "Market still open", probability: "0.60", payoff: "150000" },
    { decisionId: d1.id, parentId: chanceDelay.id, nodeType: "outcome", label: "Competitor captures share", probability: "0.40", payoff: "-100000" },
  ]);

  // Decision 2: already decided, review date in the past -> automatic retrospective sweep will open it.
  const [d2] = await db
    .insert(decisions)
    .values({
      title: "Replatform core billing to usage-based pricing engine",
      context: "Current flat-fee billing can't support the usage-based packages Sales is already promising for Q2. Build vs. buy vs. hybrid.",
      status: "decided",
      reversibility: "two-way-door",
      ownerId: "CFO — Marcus Webb",
      decidedAt,
      reviewDate: reviewDatePast.toISOString().slice(0, 10),
      downsideAcknowledged: true,
    })
    .returning();
  const [optBuy] = await db.insert(decisionOptions).values({ decisionId: d2.id, label: "Buy a metering/billing vendor", description: "Integrate a third-party usage-metering platform.", scores: {} }).returning();
  await db.insert(decisionOptions).values({ decisionId: d2.id, label: "Build in-house", description: "Extend our own billing service.", scores: {} });
  await db.insert(decisionOptions).values({ decisionId: d2.id, label: "Hybrid: buy metering, keep invoicing in-house", description: "", scores: {} });
  await db.insert(decisionOutcomes).values([
    { optionId: optBuy.id, scenarioLabel: "Fast integration, low breakage", probability: "0.55", payoffLow: "150000", payoffBase: "320000", payoffHigh: "500000" },
    { optionId: optBuy.id, scenarioLabel: "Integration overruns / data migration pain", probability: "0.45", payoffLow: "-200000", payoffBase: "-50000", payoffHigh: "100000" },
  ]);
  await db.update(decisions).set({ chosenOptionId: optBuy.id }).where(sql`${decisions.id} = ${d2.id}`);

  // Decision 3: smaller, open, two-way-door — for variety in the workspace list.
  await db.insert(decisions).values({ title: "Hire VP Marketing now vs. after Series B", context: "Marketing is currently run by a director; a VP would unlock category positioning work but adds $340k/yr fully loaded before the raise closes.", status: "open", reversibility: "two-way-door", ownerId: "CEO — Elena Marsh" });

  return { d1, d2 };
}

async function seedScenariosAndWargame(objectiveId: number, indicatorIds: { nrr: number; winRate: number }) {
  const [scenCompPrice] = await db
    .insert(scenarios)
    .values({ title: "Key competitor cuts list price 20%", description: "Competitor X has cut entry-tier pricing 20% in our core segment; expect both a growth headwind and elevated churn risk.", category: "competitive", source: "strategic", probability: "0.35", driverDeltas: { price_increase_annual: -0.5, revenue_growth_monthly: -0.3 }, earlyWarningIndicatorIds: [indicatorIds.winRate], linkedObjectiveId: objectiveId })
    .returning();

  await db.insert(scenarios).values({
    title: "Enterprise segment accelerates (AI tailwind)",
    description: "Enterprise buyers are pulling forward budget for AI-adjacent tooling faster than planned.",
    category: "market",
    source: "strategic",
    probability: "0.25",
    driverDeltas: { revenue_growth_monthly: 0.4, hiring_plan_net_adds_monthly: 0.5 },
    earlyWarningIndicatorIds: [],
    linkedObjectiveId: objectiveId,
  });

  const [scenWargame] = await db
    .insert(scenarios)
    .values({
      title: "Rival launches aggressive mid-market land-grab",
      description: "Wargame output: Rival Corp is likely to respond to our Q1 push with a discount-and-switch campaign targeting our installed base.",
      category: "competitive",
      source: "wargame",
      probability: "0.30",
      driverDeltas: { gross_churn_monthly: 0.4, revenue_growth_monthly: -0.25 },
      earlyWarningIndicatorIds: [indicatorIds.nrr, indicatorIds.winRate],
      linkedObjectiveId: objectiveId,
    })
    .returning();

  await db.insert(wargameMoves).values([
    { scenarioId: scenWargame.id, round: 1, actor: "Rival Corp", move: "Announces 30% discount for customers switching from us.", ourResponse: "Accelerate loyalty pricing lock-in for top 20% of accounts by ARR.", impact: "Estimated 2-4% incremental churn risk over 2 quarters if unaddressed." },
    { scenarioId: scenWargame.id, round: 2, actor: "us", move: "Counter-bundle with free migration credits + 90-day price match.", ourResponse: "", impact: "CS pipeline modeling suggests this blunts ~40% of the switching risk." },
  ]);

  return { scenCompPrice };
}

async function seedIndicators() {
  const [nrr] = await db
    .insert(indicators)
    .values({ name: "Net Revenue Retention", domain: "financial", metric: "NRR (%)", direction: "below_is_bad", threshold: "95", unit: "%", currentValue: "94", status: "ok" })
    .returning();
  const nrrSeries = [102, 101, 99.5, 98, 97, 96, 95, 94];
  await db.insert(indicatorReadings).values(nrrSeries.map((v, i) => ({ indicatorId: nrr.id, date: isoWeeksAgo(nrrSeries.length - i), value: String(v) })));

  const [winRate] = await db
    .insert(indicators)
    .values({ name: "Competitive win rate", domain: "market", metric: "% deals won vs. named competitor", direction: "below_is_bad", threshold: "25", unit: "%", currentValue: "24", status: "ok" })
    .returning();
  const winSeries = [34, 32, 31, 29, 28, 26, 25, 24];
  await db.insert(indicatorReadings).values(winSeries.map((v, i) => ({ indicatorId: winRate.id, date: isoWeeksAgo(winSeries.length - i), value: String(v) })));

  const [schedule] = await db
    .insert(indicators)
    .values({ name: "Critical-path schedule slippage", domain: "delivery", metric: "median days behind plan, active projects", direction: "above_is_bad", threshold: "10", unit: "days", currentValue: "9", status: "ok" })
    .returning();
  const scheduleSeries = [2, 3, 4, 5, 6, 7, 8, 9];
  await db.insert(indicatorReadings).values(scheduleSeries.map((v, i) => ({ indicatorId: schedule.id, date: isoWeeksAgo(scheduleSeries.length - i), value: String(v) })));

  const [attrition] = await db
    .insert(indicators)
    .values({ name: "Regretted attrition, key roles", domain: "people", metric: "% key roles lost, trailing 90d", direction: "above_is_bad", threshold: "15", unit: "%", currentValue: "7", status: "ok" })
    .returning();
  const attritionSeries = [6, 7, 6, 8, 7, 6, 7, 7];
  await db.insert(indicatorReadings).values(attritionSeries.map((v, i) => ({ indicatorId: attrition.id, date: isoWeeksAgo(attritionSeries.length - i), value: String(v) })));

  return { nrr: nrr.id, winRate: winRate.id };
}

function isoWeeksAgo(weeks: number): string {
  const d = new Date();
  d.setDate(d.getDate() - weeks * 7);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Seeding financial domain from scripts/seed_financial.sql ...");
  runSqlFile("scripts/seed_financial.sql");

  console.log("Truncating non-financial domain tables ...");
  await truncateNonFinancialTables();

  console.log("Deriving reported_actuals (reconciliation ground truth) ...");
  await deriveReportedActuals();

  console.log("Seeding OKRs + execution projects/milestones/blockers ...");
  const { projA, projB, projC } = await seedOkrAndExecution();

  console.log("Seeding decisions + decision tree ...");
  await seedDecisions();

  console.log("Seeding early-warning indicators ...");
  const indicatorIds = await seedIndicators();

  console.log("Seeding scenarios + wargame branches ...");
  const objectives = await db.select().from(okrObjectives);
  await seedScenariosAndWargame(objectives[0].id, indicatorIds);

  console.log("Generating an initial delivery forecast + backtest for the completed project ...");
  await forecastDelivery(projC.id);
  const backtest = await backtestProject(projC.id);
  console.log("Backtest result:", backtest);

  await forecastDelivery(projA.id);
  await forecastDelivery(projB.id);

  console.log("Seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
