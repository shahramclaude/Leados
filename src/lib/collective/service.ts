// Part 44 — Service layer: wires the pure aggregation/Delphi/market/wisdom math to
// PostgreSQL via Drizzle. API routes under src/app/api/collective/** call ONLY this
// module — never raw SQL — so the honesty rules (minority preservation, no mutation of
// dissenting records) are enforced in one place.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  aggregates,
  collectiveQuestions,
  delphiConvergence,
  delphiEstimates,
  delphiRounds,
  forecasters,
  forecasts,
  integrityFlags,
  marketMakers,
  marketPositions,
  marketTrades,
  wisdomStats,
} from "@/db/schema";
import {
  aggregateForecasts,
  DEFAULT_EXTREMIZATION_A,
  DEFAULT_MINORITY_THRESHOLD,
} from "./aggregation";
import {
  DEFAULT_DISSENT_THRESHOLD,
  evaluateStoppingRule,
  summarizeRound,
  type DelphiEstimateInput,
} from "./delphi";
import {
  checkPositionLimit,
  compareBeliefToPrice,
  detectWashTrades,
  lmsrPriceYes,
  maxOperatorLoss,
  quoteTrade,
  type TradeRecord,
} from "./market";
import { compareCrowdVsModel, computeDispersionStats } from "./wisdom";
import type { AggregationMethod, RawForecast } from "./types";

const DEFAULT_LIQUIDITY_B = 20;
const DEFAULT_POSITION_LIMIT = 150; // play-money shares
const WASH_WINDOW_MS = 10 * 60 * 1000;

function toNum(v: string | number | null | undefined, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  return typeof v === "number" ? v : parseFloat(v);
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export async function listQuestions() {
  return db.select().from(collectiveQuestions).orderBy(desc(collectiveQuestions.createdAt));
}

export async function createQuestion(input: {
  title: string;
  description?: string;
  questionClass?: string;
  modelProbability?: number;
}) {
  const [row] = await db
    .insert(collectiveQuestions)
    .values({
      title: input.title,
      description: input.description ?? "",
      questionClass: input.questionClass ?? "general",
      modelProbability:
        typeof input.modelProbability === "number" ? input.modelProbability.toFixed(5) : null,
    })
    .returning();
  // Every registered question gets a market maker seeded at 50/50 so the Market Floor
  // is always available alongside forecasts/Delphi (Part 12/24 registration contract).
  await db.insert(marketMakers).values({ questionId: row.id, liquidityB: DEFAULT_LIQUIDITY_B.toFixed(4) });
  return row;
}

export async function getQuestion(questionId: string) {
  const [row] = await db.select().from(collectiveQuestions).where(eq(collectiveQuestions.id, questionId));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Forecasters
// ---------------------------------------------------------------------------

export async function listForecasters() {
  return db.select().from(forecasters).orderBy(desc(forecasters.calibrationScore));
}

export async function ensureForecaster(input: {
  displayName: string;
  anonymousTag: string;
  isAuthoritySignal?: boolean;
  calibrationScore?: number;
  brierScore?: number;
}) {
  const existing = await db.select().from(forecasters).where(eq(forecasters.anonymousTag, input.anonymousTag));
  if (existing[0]) return existing[0];
  const [row] = await db
    .insert(forecasters)
    .values({
      displayName: input.displayName,
      anonymousTag: input.anonymousTag,
      isAuthoritySignal: input.isAuthoritySignal ?? false,
      calibrationScore: (input.calibrationScore ?? 0.5).toFixed(5),
      brierScore: (input.brierScore ?? 0.25).toFixed(5),
    })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------
// Judgment aggregation (Collective View)
// ---------------------------------------------------------------------------

export async function submitForecast(input: {
  questionId: string;
  forecasterId: string;
  probability: number;
  rationale?: string;
}) {
  const [row] = await db
    .insert(forecasts)
    .values({
      questionId: input.questionId,
      forecasterId: input.forecasterId,
      probability: input.probability.toFixed(5),
      rationale: input.rationale ?? "",
    })
    .onConflictDoUpdate({
      target: [forecasts.questionId, forecasts.forecasterId],
      set: { probability: input.probability.toFixed(5), rationale: input.rationale ?? "", createdAt: new Date() },
    })
    .returning();
  return row;
}

export interface CollectiveViewResult {
  question: typeof collectiveQuestions.$inferSelect;
  methods: Record<AggregationMethod, ReturnType<typeof aggregateForecasts>>;
  rawForecasts: Array<{
    forecasterId: string;
    anonymousTag: string;
    displayName: string;
    probability: number;
    rationale: string;
  }>;
  crowdVsModel: { crowd: number; model: number | null; gap: number | null };
}

/**
 * Builds the full "Collective View" payload for a question: every aggregation method,
 * computed WITH minority reports attached (never without), raw per-forecaster positions
 * for "who thinks what", and a crowd-vs-model comparison against the Part 11 ensemble
 * snapshot stored on the question.
 */
export async function getCollectiveView(questionId: string): Promise<CollectiveViewResult | null> {
  const question = await getQuestion(questionId);
  if (!question) return null;

  const rows = await db
    .select({
      forecasterId: forecasts.forecasterId,
      probability: forecasts.probability,
      rationale: forecasts.rationale,
      anonymousTag: forecasters.anonymousTag,
      displayName: forecasters.displayName,
      calibrationScore: forecasters.calibrationScore,
      brierScore: forecasters.brierScore,
    })
    .from(forecasts)
    .innerJoin(forecasters, eq(forecasts.forecasterId, forecasters.id))
    .where(eq(forecasts.questionId, questionId));

  const rawInputs: RawForecast[] = rows.map((r) => ({
    forecasterId: r.forecasterId,
    probability: toNum(r.probability),
    rationale: r.rationale ?? "",
    calibrationScore: toNum(r.calibrationScore),
    brierScore: toNum(r.brierScore),
  }));

  const methods: AggregationMethod[] = ["mean", "extremized", "calibration_weighted"];
  const results = Object.fromEntries(
    methods.map((method) => [
      method,
      aggregateForecasts(rawInputs, {
        method,
        extremizationA: DEFAULT_EXTREMIZATION_A,
        minorityThreshold: DEFAULT_MINORITY_THRESHOLD,
      }),
    ]),
  ) as Record<AggregationMethod, ReturnType<typeof aggregateForecasts>>;

  // Persist the calibration-weighted aggregate as the "headline" aggregate snapshot.
  const headline = results.calibration_weighted;
  await db.insert(aggregates).values({
    questionId,
    method: headline.method,
    value: headline.value.toFixed(5),
    params: headline.params,
    minorityReportIds: headline.minorityReports.map((r) => r.forecasterId),
  });

  const modelProb = question.modelProbability !== null ? toNum(question.modelProbability) : null;

  return {
    question,
    methods: results,
    rawForecasts: rows.map((r) => ({
      forecasterId: r.forecasterId,
      anonymousTag: r.anonymousTag,
      displayName: r.displayName,
      probability: toNum(r.probability),
      rationale: r.rationale ?? "",
    })),
    crowdVsModel: {
      crowd: headline.value,
      model: modelProb,
      gap: modelProb !== null ? headline.value - modelProb : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Delphi engine
// ---------------------------------------------------------------------------

export async function startDelphiRound(questionId: string, anonymityMode: "anonymous_delayed" | "open" = "anonymous_delayed") {
  const existing = await db
    .select()
    .from(delphiRounds)
    .where(eq(delphiRounds.questionId, questionId))
    .orderBy(desc(delphiRounds.roundNumber));
  const nextRoundNumber = (existing[0]?.roundNumber ?? 0) + 1;
  // Close any still-open prior round before starting a new one.
  if (existing[0] && existing[0].status === "open") {
    await db.update(delphiRounds).set({ status: "closed", closedAt: new Date() }).where(eq(delphiRounds.id, existing[0].id));
  }
  const [row] = await db
    .insert(delphiRounds)
    .values({ questionId, roundNumber: nextRoundNumber, anonymityMode })
    .returning();
  await db.update(collectiveQuestions).set({ status: "delphi" }).where(eq(collectiveQuestions.id, questionId));
  return row;
}

export async function submitDelphiEstimate(input: {
  roundId: string;
  forecasterId: string;
  estimate: number;
  rationale: string;
}) {
  const [round] = await db.select().from(delphiRounds).where(eq(delphiRounds.id, input.roundId));
  if (!round) throw new Error("Delphi round not found");
  if (round.status !== "open") throw new Error("Delphi round is closed");

  const [row] = await db
    .insert(delphiEstimates)
    .values({
      roundId: input.roundId,
      forecasterId: input.forecasterId,
      estimate: input.estimate.toFixed(5),
      rationale: input.rationale,
    })
    .onConflictDoUpdate({
      target: [delphiEstimates.roundId, delphiEstimates.forecasterId],
      set: { estimate: input.estimate.toFixed(5), rationale: input.rationale, createdAt: new Date() },
    })
    .returning();
  return row;
}

/**
 * Closes the round, computes controlled feedback + convergence, flags dissenters
 * (preserved, not deleted), and evaluates the stopping rule for the panel chair.
 */
export async function closeDelphiRoundAndSummarize(roundId: string) {
  const [round] = await db.select().from(delphiRounds).where(eq(delphiRounds.id, roundId));
  if (!round) throw new Error("Delphi round not found");

  const estimateRows = await db
    .select({
      forecasterId: delphiEstimates.forecasterId,
      estimate: delphiEstimates.estimate,
      rationale: delphiEstimates.rationale,
      anonymousTag: forecasters.anonymousTag,
    })
    .from(delphiEstimates)
    .innerJoin(forecasters, eq(delphiEstimates.forecasterId, forecasters.id))
    .where(eq(delphiEstimates.roundId, roundId));

  const inputs: DelphiEstimateInput[] = estimateRows.map((r) => ({
    forecasterId: r.forecasterId,
    anonymousTag: r.anonymousTag,
    estimate: toNum(r.estimate),
    rationale: r.rationale ?? "",
  }));

  const summary = summarizeRound(round.roundNumber, inputs, DEFAULT_DISSENT_THRESHOLD);

  const dissentIds = new Set(summary.dissenters.map((d) => d.anonymousTag));
  for (const row of estimateRows) {
    if (dissentIds.has(row.anonymousTag)) {
      await db
        .update(delphiEstimates)
        .set({ isDissent: true })
        .where(and(eq(delphiEstimates.roundId, roundId), eq(delphiEstimates.forecasterId, row.forecasterId)));
    }
  }

  const priorConvergenceRows = await db
    .select()
    .from(delphiConvergence)
    .where(eq(delphiConvergence.questionId, round.questionId))
    .orderBy(delphiConvergence.roundNumber);

  const priorStdDev = priorConvergenceRows[priorConvergenceRows.length - 1]
    ? toNum(priorConvergenceRows[priorConvergenceRows.length - 1].stdDev)
    : null;
  const stdDevDelta = priorStdDev === null ? null : summary.stdDev - priorStdDev;

  // Stopping rule is evaluated from the full round-over-round convergence series
  // persisted so far (see `computeConvergence` for the pure-function equivalent used
  // in tests) plus this round's freshly computed summary.
  const stopping = evaluateStoppingRule(
    [
      ...priorConvergenceRows.map((r) => ({
        roundNumber: r.roundNumber,
        mean: toNum(r.mean),
        stdDev: toNum(r.stdDev),
        stdDevDelta: r.stdDevDelta !== null ? toNum(r.stdDevDelta) : null,
        dissentCount: r.dissentCount,
      })),
      {
        roundNumber: round.roundNumber,
        mean: summary.mean,
        stdDev: summary.stdDev,
        stdDevDelta,
        dissentCount: summary.dissenters.length,
      },
    ],
  );

  await db.insert(delphiConvergence).values({
    questionId: round.questionId,
    roundNumber: round.roundNumber,
    mean: summary.mean.toFixed(5),
    stdDev: summary.stdDev.toFixed(5),
    stdDevDelta: stdDevDelta !== null ? stdDevDelta.toFixed(5) : null,
    dissentCount: summary.dissenters.length,
    stopped: stopping.stop,
    stopReason: stopping.reason,
  });

  await db.update(delphiRounds).set({ status: "closed", closedAt: new Date() }).where(eq(delphiRounds.id, roundId));

  return { summary, stopping };
}

export async function getDelphiWorkspace(questionId: string) {
  const rounds = await db
    .select()
    .from(delphiRounds)
    .where(eq(delphiRounds.questionId, questionId))
    .orderBy(delphiRounds.roundNumber);
  const convergence = await db
    .select()
    .from(delphiConvergence)
    .where(eq(delphiConvergence.questionId, questionId))
    .orderBy(delphiConvergence.roundNumber);

  const roundsWithEstimates = await Promise.all(
    rounds.map(async (round) => {
      const estimateRows = await db
        .select({
          forecasterId: delphiEstimates.forecasterId,
          estimate: delphiEstimates.estimate,
          rationale: delphiEstimates.rationale,
          isDissent: delphiEstimates.isDissent,
          anonymousTag: forecasters.anonymousTag,
        })
        .from(delphiEstimates)
        .innerJoin(forecasters, eq(delphiEstimates.forecasterId, forecasters.id))
        .where(eq(delphiEstimates.roundId, round.id));
      return {
        ...round,
        estimates: estimateRows.map((r) => ({
          ...r,
          estimate: toNum(r.estimate),
        })),
      };
    }),
  );

  return { rounds: roundsWithEstimates, convergence };
}

// ---------------------------------------------------------------------------
// Internal prediction market (LMSR)
// ---------------------------------------------------------------------------

export async function getMarketState(questionId: string) {
  const [maker] = await db.select().from(marketMakers).where(eq(marketMakers.questionId, questionId));
  if (!maker) return null;
  const state = { b: toNum(maker.liquidityB), qYes: toNum(maker.qYes), qNo: toNum(maker.qNo) };
  const price = lmsrPriceYes(state);
  const trades = await db
    .select()
    .from(marketTrades)
    .where(eq(marketTrades.questionId, questionId))
    .orderBy(marketTrades.createdAt);
  const positions = await db.select().from(marketPositions).where(eq(marketPositions.questionId, questionId));
  const flags = await db.select().from(integrityFlags).where(eq(integrityFlags.questionId, questionId));
  return {
    liquidityB: state.b,
    maxOperatorLoss: maxOperatorLoss(state.b),
    price,
    priceHistory: trades.map((t) => ({
      createdAt: t.createdAt,
      priceAfter: toNum(t.priceAfter),
      side: t.side,
      shares: toNum(t.shares),
    })),
    trades,
    positions,
    integrityFlags: flags,
  };
}

export interface MarketTradeInput {
  questionId: string;
  traderId: string;
  side: "YES" | "NO";
  shares: number;
  positionLimit?: number;
}

export interface MarketTradeOutcome {
  accepted: boolean;
  reason: string;
  trade?: typeof marketTrades.$inferSelect;
  flags: string[];
}

/**
 * Executes a trade against the LMSR market maker with manipulation guards applied
 * BEFORE any state mutation: position-limit check, then wash-trade scan against the
 * recent tape (self round-trips and paired wash patterns). Flagged trades are still
 * recorded (for transparency/audit) but marked and reported via integrityFlags; trades
 * that breach the hard position limit are rejected outright.
 */
export async function executeMarketTrade(input: MarketTradeInput): Promise<MarketTradeOutcome> {
  const [maker] = await db.select().from(marketMakers).where(eq(marketMakers.questionId, input.questionId));
  if (!maker) return { accepted: false, reason: "market not found", flags: [] };

  const [trader] = await db.select().from(forecasters).where(eq(forecasters.id, input.traderId));
  if (!trader) return { accepted: false, reason: "trader not found", flags: [] };

  const [position] = await db
    .select()
    .from(marketPositions)
    .where(and(eq(marketPositions.questionId, input.questionId), eq(marketPositions.traderId, input.traderId)));
  const currentYes = toNum(position?.yesShares, 0);
  const currentNo = toNum(position?.noShares, 0);

  const limitCheck = checkPositionLimit(
    currentYes,
    currentNo,
    input.side,
    input.shares,
    input.positionLimit ?? DEFAULT_POSITION_LIMIT,
  );
  if (!limitCheck.allowed) {
    await db.insert(integrityFlags).values({
      questionId: input.questionId,
      traderId: input.traderId,
      type: "position_limit",
      detail: limitCheck.reason,
    });
    return { accepted: false, reason: limitCheck.reason, flags: ["position_limit"] };
  }

  const state = { b: toNum(maker.liquidityB), qYes: toNum(maker.qYes), qNo: toNum(maker.qNo) };
  const result = quoteTrade(state, input.side, input.shares);

  const [row] = await db
    .insert(marketTrades)
    .values({
      questionId: input.questionId,
      traderId: input.traderId,
      side: input.side,
      shares: input.shares.toFixed(6),
      cost: result.costOfTrade.toFixed(6),
      priceBefore: result.priceBefore.toFixed(5),
      priceAfter: result.priceAfter.toFixed(5),
    })
    .returning();

  await db
    .update(marketMakers)
    .set({ qYes: result.newState.qYes.toFixed(6), qNo: result.newState.qNo.toFixed(6) })
    .where(eq(marketMakers.id, maker.id));

  if (position) {
    await db
      .update(marketPositions)
      .set({
        yesShares: (currentYes + (input.side === "YES" ? input.shares : 0)).toFixed(6),
        noShares: (currentNo + (input.side === "NO" ? input.shares : 0)).toFixed(6),
        netInvested: (toNum(position.netInvested) + result.costOfTrade).toFixed(6),
      })
      .where(eq(marketPositions.id, position.id));
  } else {
    await db.insert(marketPositions).values({
      questionId: input.questionId,
      traderId: input.traderId,
      yesShares: (input.side === "YES" ? input.shares : 0).toFixed(6),
      noShares: (input.side === "NO" ? input.shares : 0).toFixed(6),
      netInvested: result.costOfTrade.toFixed(6),
    });
  }

  await db
    .update(forecasters)
    .set({ playMoneyBalance: (toNum(trader.playMoneyBalance, 1000) - result.costOfTrade).toFixed(2) })
    .where(eq(forecasters.id, input.traderId));

  // Manipulation guard: wash-trade scan over the recent tape (including this trade).
  const recentTrades = await db
    .select()
    .from(marketTrades)
    .where(eq(marketTrades.questionId, input.questionId))
    .orderBy(marketTrades.createdAt);
  const tape: TradeRecord[] = recentTrades.map((t) => ({
    id: t.id,
    traderId: t.traderId,
    side: t.side as "YES" | "NO",
    shares: toNum(t.shares),
    createdAt: new Date(t.createdAt).getTime(),
  }));
  const washFlags = detectWashTrades(tape, { windowMs: WASH_WINDOW_MS });
  const flagsForThisTrade = washFlags.filter((f) => f.tradeIds.includes(row.id));
  if (flagsForThisTrade.length > 0) {
    await db.update(marketTrades).set({ flaggedWashTrade: true }).where(eq(marketTrades.id, row.id));
    for (const f of flagsForThisTrade) {
      await db.insert(integrityFlags).values({
        questionId: input.questionId,
        traderId: input.traderId,
        type: "wash_trade",
        detail: f.detail,
      });
    }
  }

  return {
    accepted: true,
    reason: "trade executed",
    trade: row,
    flags: flagsForThisTrade.map((f) => f.type),
  };
}

export async function getBeliefVsPrice(questionId: string) {
  const market = await getMarketState(questionId);
  const view = await getCollectiveView(questionId);
  if (!market || !view) return null;
  return compareBeliefToPrice(market.price, view.methods.calibration_weighted.value);
}

// ---------------------------------------------------------------------------
// Wisdom dashboard
// ---------------------------------------------------------------------------

export async function getWisdomDashboard() {
  const stats = await db.select().from(wisdomStats).orderBy(desc(wisdomStats.periodEnd));
  return stats;
}

export async function recomputeWisdomStats() {
  const resolved = await db
    .select()
    .from(collectiveQuestions)
    .where(eq(collectiveQuestions.status, "resolved"));

  const samples = [];
  for (const q of resolved) {
    if (q.resolutionValue === null) continue;
    const view = await getCollectiveView(q.id);
    const market = await getMarketState(q.id);
    if (!view) continue;
    samples.push({
      questionClass: q.questionClass,
      crowdProbability: view.methods.calibration_weighted.value,
      modelProbability: view.crowdVsModel.model ?? view.methods.mean.value,
      marketProbability: market?.price,
      outcome: (toNum(q.resolutionValue) >= 0.5 ? 1 : 0) as 0 | 1,
    });
  }

  const comparisons = compareCrowdVsModel(samples);
  const now = new Date();
  const results = [];
  for (const c of comparisons) {
    const classSamples = samples.filter((s) => s.questionClass === c.questionClass);
    const diversity = computeDispersionStats(classSamples.map((s) => s.crowdProbability)).diversityIndex;
    const [row] = await db
      .insert(wisdomStats)
      .values({
        questionClass: c.questionClass,
        periodStart: now,
        periodEnd: now,
        crowdBrier: c.crowdBrier.toFixed(5),
        modelBrier: c.modelBrier.toFixed(5),
        marketBrier: c.marketBrier !== null ? c.marketBrier.toFixed(5) : null,
        diversityIndex: diversity.toFixed(5),
        sampleSize: c.sampleSize,
        winner: c.winner,
      })
      .returning();
    results.push(row);
  }
  return results;
}

export async function resolveQuestion(questionId: string, outcome: 0 | 1) {
  await db
    .update(collectiveQuestions)
    .set({ status: "resolved", resolutionValue: outcome.toFixed(5), resolvedAt: new Date() })
    .where(eq(collectiveQuestions.id, questionId));
  return recomputeWisdomStats();
}
