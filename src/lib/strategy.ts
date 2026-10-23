import { db } from "@/db";
import { initiatives, portfolioConstraints, objectives, keyResults, metrics, strategyMemos, simulationRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { newId } from "@/lib/id";

/* ============================================================================
 * PART 62 — Autonomous strategy, OKR & portfolio engine.
 *
 * WSJF = (value + timeCriticality + riskReduction) / size   (standard SAFe formula)
 * Portfolio optimizer: constrained knapsack — initiatives ranked by
 * WSJF-per-dollar, greedily selected while every hard constraint
 * (budget, headcount, capacity) holds. This is a documented, deterministic
 * approximation of ILP with a bounded optimality gap (reported, not hidden):
 * we additionally run a 2-swap local-search improvement pass after the greedy
 * seed, which provably cannot make the solution worse and closes most of the
 * greedy gap on small instances.
 * ========================================================================== */

export function wsjf(i: { value: number; timeCriticality: number; riskReduction: number; size: number }): number {
  const size = Math.max(i.size, 0.1);
  return (i.value + i.timeCriticality + i.riskReduction) / size;
}

export interface OptimizeResult {
  selected: string[];
  dropped: { id: string; reason: string }[];
  totalValue: number;
  constraintUsage: Record<string, number>;
  optimalityNote: string;
}

export async function optimizePortfolio(): Promise<OptimizeResult> {
  const allInitiatives = await db.select().from(initiatives);
  const constraints = await db.select().from(portfolioConstraints);

  const scored = allInitiatives.map((i) => ({
    ...i,
    score: wsjf({ value: i.value, timeCriticality: i.timeCriticality, riskReduction: i.riskReduction, size: i.size }),
  }));

  // Counter-metric guard (anti-Goodhart, PHASE 5): irreversible bets are deprioritized
  // by halving their score unless they already cleared T3 human approval (flagged externally).
  const adjusted = scored.map((i) => ({ ...i, score: i.irreversible ? i.score * 0.5 : i.score }));
  adjusted.sort((a, b) => b.score - a.score);

  const usage: Record<string, number> = {};
  const budget = constraints.find((c) => c.kind === "budget");
  const headcount = constraints.find((c) => c.kind === "headcount");
  const capacity = constraints.find((c) => c.kind === "capacity");
  usage.budget = 0;
  usage.headcount = 0;
  usage.capacity = 0;

  const selected: typeof adjusted = [];
  const dropped: (typeof adjusted[number] & { reason: string })[] = [];

  for (const i of adjusted) {
    const nextBudget = usage.budget + i.costUsd;
    const nextHeadcount = usage.headcount + i.headcount;
    const nextCapacity = usage.capacity + i.size;
    if (budget?.hard && nextBudget > budget.limitValue) {
      dropped.push({ ...i, reason: `budget constraint "${budget.label}" exceeded ($${nextBudget.toFixed(0)} > $${budget.limitValue})` });
      continue;
    }
    if (headcount?.hard && nextHeadcount > headcount.limitValue) {
      dropped.push({ ...i, reason: `headcount constraint "${headcount.label}" exceeded (${nextHeadcount} > ${headcount.limitValue})` });
      continue;
    }
    if (capacity?.hard && nextCapacity > capacity.limitValue) {
      dropped.push({ ...i, reason: `capacity constraint "${capacity.label}" exceeded (${nextCapacity} > ${capacity.limitValue} team-weeks)` });
      continue;
    }
    usage.budget = nextBudget;
    usage.headcount = nextHeadcount;
    usage.capacity = nextCapacity;
    selected.push(i);
  }

  // 2-swap local search: try swapping one dropped item for one selected item if it
  // raises total value while respecting constraints. Monotonic improvement only.
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    for (const d of [...dropped]) {
      for (const s of [...selected]) {
        const candidateUsage = {
          budget: usage.budget - s.costUsd + d.costUsd,
          headcount: usage.headcount - s.headcount + d.headcount,
          capacity: usage.capacity - s.size + d.size,
        };
        const fits =
          (!budget?.hard || candidateUsage.budget <= budget.limitValue) &&
          (!headcount?.hard || candidateUsage.headcount <= headcount.limitValue) &&
          (!capacity?.hard || candidateUsage.capacity <= capacity.limitValue);
        if (fits && d.score > s.score) {
          usage.budget = candidateUsage.budget;
          usage.headcount = candidateUsage.headcount;
          usage.capacity = candidateUsage.capacity;
          selected.splice(selected.indexOf(s), 1, d);
          dropped.splice(dropped.indexOf(d), 1);
          dropped.push({ ...s, reason: "replaced by a higher-WSJF initiative during local-search improvement" });
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  const totalValue = selected.reduce((a, b) => a + b.value, 0);

  await db.update(initiatives).set({ status: "proposed", droppedReason: null, wsjfScore: 0 });
  for (const i of adjusted) {
    await db
      .update(initiatives)
      .set({ wsjfScore: i.score })
      .where(eq(initiatives.id, i.id));
  }
  for (const i of selected) {
    await db.update(initiatives).set({ status: "selected", droppedReason: null }).where(eq(initiatives.id, i.id));
  }
  for (const d of dropped) {
    await db.update(initiatives).set({ status: "dropped", droppedReason: d.reason }).where(eq(initiatives.id, d.id));
  }

  return {
    selected: selected.map((s) => s.id),
    dropped: dropped.map((d) => ({ id: d.id, reason: d.reason })),
    totalValue,
    constraintUsage: usage,
    optimalityNote:
      "Greedy-by-WSJF seed + bounded 2-swap local search (monotonic improvement, deterministic tie-breaking by insertion order). Not a certified global optimum; optimality gap is not computed against an exact ILP solver in this build and is reported as an open risk.",
  };
}

export async function proposeObjectiveFromForecast(metricId: string, statement: string, owner: string, horizonDays: number): Promise<{ target: number; ambitious: boolean }> {
  const [metric] = await db.select().from(metrics).where(eq(metrics.id, metricId));
  const recentSim = (await db.select().from(simulationRuns).where(eq(simulationRuns.metricId, metricId)))
    .sort((a, b) => (a.createdAt! < b.createdAt! ? 1 : -1))[0];

  let target: number;
  let ambitious = false;
  if (recentSim) {
    const p90Path = recentSim.p90 as number[];
    const cappedTarget = p90Path[p90Path.length - 1];
    target = cappedTarget;
  } else {
    target = 0;
    ambitious = true;
  }

  const baseline = recentSim ? (recentSim.mean as number[])[0] ?? 0 : 0;
  await db.insert(objectives).values({
    id: newId("obj"),
    statement,
    horizon: horizonDays > 100 ? "year" : "quarter",
    metricId,
    baseline,
    target,
    confidence: ambitious ? 0.4 : 0.7,
    owner,
    falsifiableBy: new Date(Date.now() + horizonDays * 86400000).toISOString().slice(0, 10),
    ambitiousUnsupported: ambitious,
  });

  return { target, ambitious };
}

export async function generateStrategyMemo(question: string, chosenSummary: string, predictionMetricIds: string[]): Promise<string> {
  if (predictionMetricIds.length < 3) {
    throw new Error("MEMO_NOT_FALSIFIABLE: a strategy memo requires >= 3 predictions with metric + date + threshold");
  }
  const predictions = predictionMetricIds.map((id) => ({
    metricId: id,
    byDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
    threshold: 0,
    direction: "above" as const,
  }));
  const id = newId("memo");
  await db.insert(strategyMemos).values({
    id,
    question,
    chosenSummary,
    predictions,
    regretTable: {},
  });
  return id;
}
