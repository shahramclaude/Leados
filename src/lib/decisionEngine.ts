// D. Decision intelligence workspace — structured decision records, EV with
// uncertainty (distributions, not points), reversibility classification,
// pre-mortems, a hard "look at the downside before you decide" gate, and
// automatic retrospectives at the review date.
import { db } from "@/db";
import { decisions, decisionOptions, decisionCriteria, decisionOutcomes, decisionRetrospectives } from "@/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";
import { num, round2 } from "@/lib/format";
import { explain, type Explain } from "@/lib/explain";
import { makeRng, sampleTriangular, distributionSummary } from "@/lib/simulation";
import { recordCalibration } from "@/lib/calibration";
import { PRE_MORTEM_PROMPTS_CORE, PRE_MORTEM_PROMPTS_ONE_WAY_DOOR, type Reversibility } from "@/lib/decisionTypes";

export async function listDecisions() {
  return db.select().from(decisions);
}

export async function getDecisionDetail(decisionId: number) {
  const [decision] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!decision) return null;
  const options = await db.select().from(decisionOptions).where(eq(decisionOptions.decisionId, decisionId));
  const criteria = await db.select().from(decisionCriteria).where(eq(decisionCriteria.decisionId, decisionId));
  const outcomeRows = await Promise.all(options.map((o) => db.select().from(decisionOutcomes).where(eq(decisionOutcomes.optionId, o.id))));
  const outcomesByOption = new Map<number, (typeof outcomeRows)[number]>();
  options.forEach((o, i) => outcomesByOption.set(o.id, outcomeRows[i]));
  const retro = await db.select().from(decisionRetrospectives).where(eq(decisionRetrospectives.decisionId, decisionId));
  return { decision, options, criteria, outcomesByOption, retro: retro[0] ?? null };
}

/** Multi-criteria weighted score (0-10 scale per criterion). */
export function criteriaScore(scores: Record<string, number>, criteria: { id: number; weight: number }[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of criteria) {
    const s = scores[String(c.id)] ?? scores[c.id as unknown as string];
    if (s == null) continue;
    weighted += s * c.weight;
    totalWeight += c.weight;
  }
  return totalWeight > 0 ? weighted / totalWeight : 0;
}

/**
 * EV with uncertainty: for each trial, draw which scenario occurs (weighted by
 * probability) THEN sample a triangular payoff within that scenario's
 * low/base/high. Returns a distribution, not a single number.
 */
export function expectedValueDistribution(
  outcomes: { scenarioLabel: string; probability: number; payoffLow: number; payoffBase: number; payoffHigh: number }[],
  trials = 5000,
  seed = 17,
): Explain<{ p10: number; p50: number; p90: number; mean: number }> {
  const rng = makeRng(seed);
  const totalProb = outcomes.reduce((a, o) => a + o.probability, 0) || 1;
  const cumulative: { upTo: number; outcome: (typeof outcomes)[number] }[] = [];
  let acc = 0;
  for (const o of outcomes) {
    acc += o.probability / totalProb;
    cumulative.push({ upTo: acc, outcome: o });
  }

  const samples: number[] = [];
  for (let t = 0; t < trials; t++) {
    const u = rng();
    const bucket = cumulative.find((c) => u <= c.upTo) ?? cumulative[cumulative.length - 1];
    samples.push(sampleTriangular(bucket.outcome.payoffLow, bucket.outcome.payoffBase, bucket.outcome.payoffHigh, rng));
  }

  const summary = distributionSummary(samples);
  return explain(
    { p10: round2(summary.p10), p50: round2(summary.p50), p90: round2(summary.p90), mean: round2(summary.mean) },
    {
      confidence: outcomes.length >= 2 ? 0.7 : 0.4,
      method: `Monte Carlo (${trials} trials): draw scenario by probability weight, then triangular(low/base/high) payoff within it`,
      drivers: outcomes.map((o) => ({ name: o.scenarioLabel, contribution: round2(o.payoffBase * (o.probability / totalProb)), direction: o.payoffBase >= 0 ? "positive" : "negative" })),
      caveats: outcomes.length < 2 ? ["Only one scenario supplied — this is not a real probability-weighted EV, just that scenario's own distribution."] : [],
    },
  );
}

export function preMortemPrompts(reversibility: Reversibility) {
  return reversibility === "one-way-door" ? [...PRE_MORTEM_PROMPTS_CORE, ...PRE_MORTEM_PROMPTS_ONE_WAY_DOOR] : PRE_MORTEM_PROMPTS_CORE;
}

export class DecisionGateError extends Error {}

/**
 * The "decide" action. Deliberately HARD-GATES on `downsideAcknowledged` to
 * counter the #1 usability trap identified in self-review: an executive under
 * time pressure anchoring on the headline EV number and skipping the p10 tail.
 */
export async function decide(decisionId: number, chosenOptionId: number, downsideAcknowledged: boolean, reviewInDays = 90) {
  if (!downsideAcknowledged) {
    throw new DecisionGateError("Cannot record a decision without acknowledging the downside (p10) case. Review the EV distribution's low tail first.");
  }
  const reviewDate = new Date();
  reviewDate.setDate(reviewDate.getDate() + reviewInDays);
  const [row] = await db
    .update(decisions)
    .set({ status: "decided", decidedAt: new Date(), chosenOptionId, downsideAcknowledged: true, reviewDate: reviewDate.toISOString().slice(0, 10) })
    .where(eq(decisions.id, decisionId))
    .returning();
  return row;
}

/** Automation mandate: decisions past their review date automatically open a retrospective. */
export async function openDueRetrospectives() {
  const today = new Date().toISOString().slice(0, 10);
  const due = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.status, "decided"), lte(decisions.reviewDate, today)));

  const opened: number[] = [];
  for (const d of due) {
    const existing = await db.select().from(decisionRetrospectives).where(eq(decisionRetrospectives.decisionId, d.id));
    if (existing.length > 0) continue;
    const detail = d.chosenOptionId ? await getDecisionDetail(d.id) : null;
    const outcomes = detail && d.chosenOptionId ? detail.outcomesByOption.get(d.chosenOptionId) ?? [] : [];
    const predictedEv = outcomes.length
      ? expectedValueDistribution(outcomes.map((o) => ({ scenarioLabel: o.scenarioLabel, probability: num(o.probability), payoffLow: num(o.payoffLow), payoffBase: num(o.payoffBase), payoffHigh: num(o.payoffHigh) })))
      : null;
    await db.insert(decisionRetrospectives).values({
      decisionId: d.id,
      dueAt: d.reviewDate!,
      predicted: { chosenOptionId: d.chosenOptionId, evDistribution: predictedEv?.value ?? null },
    });
    await db.update(decisions).set({ status: "retrospective_due" }).where(eq(decisions.id, d.id));
    opened.push(d.id);
  }
  return opened;
}

export async function completeRetrospective(decisionId: number, actual: { whatHappened: string; actualPayoff: number }, lessons: string) {
  const [retro] = await db.select().from(decisionRetrospectives).where(eq(decisionRetrospectives.decisionId, decisionId));
  if (!retro) return null;
  const predicted = retro.predicted as { evDistribution: { p50: number } | null };
  const predictedP50 = predicted?.evDistribution?.p50 ?? 0;
  const errorValue = round2(actual.actualPayoff - predictedP50);

  const [row] = await db
    .update(decisionRetrospectives)
    .set({ completedAt: new Date(), actual, lessons, calibrationErrorNotes: `Predicted EV p50 ${predictedP50}, actual ${actual.actualPayoff}, error ${errorValue}` })
    .where(eq(decisionRetrospectives.decisionId, decisionId))
    .returning();

  await recordCalibration({
    domain: "decision",
    refType: "decision",
    refId: decisionId,
    predictedP50: String(predictedP50),
    predictedDistribution: predicted?.evDistribution ?? {},
    actualValue: String(actual.actualPayoff),
    actualDate: new Date().toISOString().slice(0, 10),
    errorValue,
  });

  await db.update(decisions).set({ status: "reviewed" }).where(eq(decisions.id, decisionId));
  return row;
}
