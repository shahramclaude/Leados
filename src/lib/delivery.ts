// C. Probabilistic delivery dates. Milestones -> critical path -> Monte Carlo
// over (optimistic, likely, pessimistic) durations -> p50/p80 delivery dates,
// reported as `Explain<Probability>` so the confidence number always carries
// its drivers (scope churn, key-person risk, WIP, dependency count).
import { db } from "@/db";
import { execProjects, execMilestones, execBlockers, deliveryForecasts, deliveryBacktests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { num, addDays, isoDate, round2 } from "@/lib/format";
import { explain, type Explain } from "@/lib/explain";
import { makeRng, sampleTriangular, percentile } from "@/lib/simulation";
import { computeCPM, type CpmNode } from "@/lib/criticalPath";
import { recordCalibration } from "@/lib/calibration";

async function loadProjectGraph(projectId: number) {
  const [project] = await db.select().from(execProjects).where(eq(execProjects.id, projectId));
  const milestones = await db.select().from(execMilestones).where(eq(execMilestones.projectId, projectId));
  const blockers = await db.select().from(execBlockers).where(eq(execBlockers.projectId, projectId));
  return { project, milestones, blockers };
}

function openBlockerImpactByMilestone(blockers: Awaited<ReturnType<typeof loadProjectGraph>>["blockers"]) {
  const map = new Map<number, number>();
  for (const b of blockers) {
    if (b.resolvedAt) continue; // only unresolved blockers push out the forecast
    if (b.milestoneId == null) continue;
    map.set(b.milestoneId, (map.get(b.milestoneId) ?? 0) + num(b.impactDays));
  }
  return map;
}

/** Today's deterministic critical path (using the "likely" duration estimate). */
export async function criticalPathToday(projectId: number) {
  const { milestones, blockers } = await loadProjectGraph(projectId);
  const blockerImpact = openBlockerImpactByMilestone(blockers);
  const nodes: CpmNode[] = milestones.map((m) => ({
    id: m.id,
    duration: num(m.likelyDays) + (blockerImpact.get(m.id) ?? 0),
    dependsOn: (m.dependsOn as number[]) ?? [],
  }));
  return computeCPM(nodes);
}

function runTrials(
  milestones: Awaited<ReturnType<typeof loadProjectGraph>>["milestones"],
  blockerImpact: Map<number, number>,
  multipliers: { scopeChurn: number; keyPerson: number; wip: number },
  trials: number,
  seed: number,
): number[] {
  const rng = makeRng(seed);
  const finishes: number[] = [];
  for (let t = 0; t < trials; t++) {
    const nodes: CpmNode[] = milestones.map((m) => {
      const extra = blockerImpact.get(m.id) ?? 0;
      const opt = num(m.optimisticDays) * multipliers.scopeChurn * multipliers.keyPerson * multipliers.wip;
      const like = (num(m.likelyDays) + extra) * multipliers.scopeChurn * multipliers.keyPerson * multipliers.wip;
      const pess = (num(m.pessimisticDays) + extra) * multipliers.scopeChurn * multipliers.keyPerson * multipliers.wip;
      const duration = sampleTriangular(Math.min(opt, like), like, Math.max(pess, like), rng);
      return { id: m.id, duration, dependsOn: (m.dependsOn as number[]) ?? [] };
    });
    finishes.push(computeCPM(nodes).finish);
  }
  return finishes;
}

function riskMultipliers(project: { scopeChurnCount: number; keyPersonRisk: string | number; wipCount: number }) {
  return {
    scopeChurn: 1 + 0.05 * project.scopeChurnCount,
    keyPerson: 1 + 0.2 * num(project.keyPersonRisk),
    wip: 1 + 0.04 * Math.max(0, project.wipCount - 1),
  };
}

/** D/C: Monte Carlo delivery-date distribution for a project, persisted so it can be backtested later. */
export async function forecastDelivery(projectId: number, trials = 3000, seed = 99) {
  const { project, milestones, blockers } = await loadProjectGraph(projectId);
  if (!project) return null;
  const blockerImpact = openBlockerImpactByMilestone(blockers);
  const mult = riskMultipliers(project);
  const finishes = runTrials(milestones, blockerImpact, mult, trials, seed).sort((a, b) => a - b);

  const p50Days = percentile(finishes, 50);
  const p80Days = percentile(finishes, 80);
  const start = new Date(project.startDate);
  const p50Date = isoDate(addDays(start, p50Days));
  const p80Date = isoDate(addDays(start, p80Days));

  const assumptions = {
    trials,
    seed,
    scopeChurnCount: project.scopeChurnCount,
    keyPersonRisk: num(project.keyPersonRisk),
    wipCount: project.wipCount,
    openBlockerDays: [...blockerImpact.values()].reduce((a, b) => a + b, 0),
  };

  // Marginal contribution of each risk factor: rerun with that factor neutralised, one at a time.
  const neutralBase = runTrials(milestones, blockerImpact, { scopeChurn: 1, keyPerson: 1, wip: 1 }, trials, seed);
  const p50Neutral = percentile([...neutralBase].sort((a, b) => a - b), 50);
  const withoutScopeChurn = runTrials(milestones, blockerImpact, { ...mult, scopeChurn: 1 }, trials, seed);
  const withoutKeyPerson = runTrials(milestones, blockerImpact, { ...mult, keyPerson: 1 }, trials, seed);
  const withoutWip = runTrials(milestones, blockerImpact, { ...mult, wip: 1 }, trials, seed);
  const dependencyCount = milestones.reduce((a, m) => a + ((m.dependsOn as number[])?.length ?? 0), 0);

  const blockerDaysTotal = [...blockerImpact.values()].reduce((a, b) => a + b, 0);
  const driverContributions = {
    scopeChurnDays: round2(p50Days - percentile([...withoutScopeChurn].sort((a, b) => a - b), 50)),
    keyPersonDays: round2(p50Days - percentile([...withoutKeyPerson].sort((a, b) => a - b), 50)),
    wipDays: round2(p50Days - percentile([...withoutWip].sort((a, b) => a - b), 50)),
    blockerDays: round2(blockerDaysTotal),
    dependencyCount,
    p50VsNeutralDays: round2(p50Days - p50Neutral),
  };

  const [row] = await db
    .insert(deliveryForecasts)
    .values({ projectId, p50Date, p80Date, assumptions, driverContributions })
    .returning();

  return { forecast: row, finishesDaysSorted: finishes };
}

/** `Explain<Probability>` of hitting the project's stated due date. */
export async function deliveryConfidence(projectId: number): Promise<Explain<number> | null> {
  const result = await forecastDelivery(projectId, 2000, 101);
  if (!result) return null;
  const { project } = await loadProjectGraph(projectId);
  const due = new Date(project.dueDate);
  const start = new Date(project.startDate);
  const dueDays = (due.getTime() - start.getTime()) / 86400000;
  const hit = result.finishesDaysSorted.filter((d) => d <= dueDays).length;
  const probability = hit / result.finishesDaysSorted.length;

  const dc = result.forecast.driverContributions as { scopeChurnDays: number; keyPersonDays: number; wipDays: number; dependencyCount: number; blockerDays: number };

  return explain(round2(probability), {
    confidence: 0.75,
    method: `Monte Carlo CPM: fraction of ${result.finishesDaysSorted.length} simulated completions on/before due date ${project.dueDate}`,
    drivers: [
      { name: "scope churn", contribution: -dc.scopeChurnDays, direction: dc.scopeChurnDays > 0 ? "negative" : "neutral", note: `${project.scopeChurnCount} scope changes recorded` },
      { name: "key-person risk", contribution: -dc.keyPersonDays, direction: dc.keyPersonDays > 0 ? "negative" : "neutral", note: `risk score ${project.keyPersonRisk}` },
      { name: "work-in-progress", contribution: -dc.wipDays, direction: dc.wipDays > 0 ? "negative" : "neutral", note: `${project.wipCount} concurrent workstreams` },
      { name: "dependency count", contribution: -dc.dependencyCount, direction: dc.dependencyCount > 2 ? "negative" : "neutral", note: `${dc.dependencyCount} milestone dependencies on critical path graph` },
      { name: "open blockers", contribution: -dc.blockerDays, direction: dc.blockerDays > 0 ? "negative" : "neutral" },
    ],
    assumptionsUsed: ["scope_churn_penalty_pct", "key_person_penalty_pct", "wip_penalty_pct"],
    evidence: [{ table: "exec_projects", id: projectId }, { table: "delivery_forecasts", id: result.forecast.id }],
    caveats: ["Driver contributions are marginal effects (factor neutralised one at a time), so they will not sum exactly to the total swing when factors interact."],
  });
}

/** Quarterly backtest: compare a past forecast to what actually happened, log to calibration ledger. */
export async function backtestProject(projectId: number) {
  const { project, milestones } = await loadProjectGraph(projectId);
  if (!project) return null;
  const lastForecast = (await db.select().from(deliveryForecasts).where(eq(deliveryForecasts.projectId, projectId))).sort((a, b) => a.id - b.id).at(-1);
  if (!lastForecast) return null;

  const lastMilestone = [...milestones].sort((a, b) => b.sequence - a.sequence)[0];
  if (!lastMilestone?.actualDate) return { status: "not_yet_complete" as const };

  const actualDate = new Date(lastMilestone.actualDate);
  const predictedP50 = new Date(lastForecast.p50Date);
  const predictedP80 = new Date(lastForecast.p80Date);
  const errorDaysP50 = round2((actualDate.getTime() - predictedP50.getTime()) / 86400000);
  const withinP80 = actualDate.getTime() <= predictedP80.getTime();

  const [row] = await db
    .insert(deliveryBacktests)
    .values({
      projectId,
      forecastId: lastForecast.id,
      predictedP50: lastForecast.p50Date,
      predictedP80: lastForecast.p80Date,
      actualCompletionDate: isoDate(actualDate),
      errorDaysP50: String(errorDaysP50),
      withinP80,
    })
    .returning();

  await recordCalibration({
    domain: "delivery",
    refType: "exec_project",
    refId: projectId,
    predictedP50: lastForecast.p50Date,
    predictedDistribution: { p50: lastForecast.p50Date, p80: lastForecast.p80Date },
    actualValue: isoDate(actualDate),
    actualDate: isoDate(actualDate),
    errorValue: errorDaysP50,
  });

  return { status: "backtested" as const, row };
}
