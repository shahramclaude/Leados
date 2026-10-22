// Proper scoring rule identity tests + "no path to inflate score" test for
// the forecasting tournament. Run via `npm run test:scoring`.
//
// This is NOT a full unit test framework (none is installed in this
// template); it is a small set of mathematical identity checks that fail
// loudly (non-zero exit code) if the scoring/leaderboard logic regresses.

import { brierScore, logLoss, extremize, clampProbability, MIN_P, MAX_P } from "../src/lib/sensing/scoring";
import { buildLeaderboard, MIN_RESOLVED_FOR_RANKING, type ResolvedForecastRecord } from "../src/lib/sensing/tournament";
import { mulberry32 } from "../src/lib/sensing/rng";

let failures = 0;

function assert(cond: boolean, message: string) {
  if (!cond) {
    failures++;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`ok: ${message}`);
  }
}

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps;
}

// --- 1. Clamping identity: probabilities never leave [MIN_P, MAX_P] -------
assert(clampProbability(0) === MIN_P, "clampProbability(0) floors to MIN_P");
assert(clampProbability(1) === MAX_P, "clampProbability(1) ceils to MAX_P");
assert(clampProbability(0.5) === 0.5, "clampProbability(0.5) is unchanged");

// --- 2. Brier score bounds and worked examples ----------------------------
assert(brierScore(0.5, true) === 0.25, "brierScore(0.5, true) = 0.25");
assert(approxEqual(brierScore(MAX_P, true), (1 - MAX_P) ** 2), "brierScore caps reward at MAX_P, not 0");
assert(approxEqual(brierScore(MIN_P, true), (1 - MIN_P) ** 2), "brierScore caps punishment at MIN_P, not 1");
assert(brierScore(0.9, true) < brierScore(0.5, true), "higher confidence correct forecast scores better");
assert(brierScore(0.9, false) > brierScore(0.5, false), "higher confidence wrong forecast scores worse");

// --- 3. Log loss never reaches +Infinity because of clamping --------------
assert(Number.isFinite(logLoss(0, true)), "logLoss stays finite even if caller passes an unclamped 0 on a win");
assert(Number.isFinite(logLoss(1, false)), "logLoss stays finite even if caller passes an unclamped 1 on a loss");

// --- 4. Properness: reporting the true probability minimizes expected score
// (Monte Carlo check: for outcomes drawn with P(true)=q, the candidate p=q
// should have the lowest average Brier score among a grid of candidates.)
function expectedBrier(q: number, p: number, rng: () => number, trials = 20000): number {
  let total = 0;
  for (let i = 0; i < trials; i++) {
    const outcome = rng() < q;
    total += brierScore(p, outcome);
  }
  return total / trials;
}

{
  const rng = mulberry32(42);
  const q = 0.7;
  const candidates = [0.1, 0.3, 0.5, 0.6, 0.7, 0.8, 0.9];
  const scores = candidates.map((p) => ({ p, score: expectedBrier(q, p, rng) }));
  const best = scores.reduce((a, b) => (b.score < a.score ? b : a));
  assert(best.p === 0.7, `properness: best candidate among grid minimizing expected Brier is p=0.7 (got p=${best.p}, scores=${JSON.stringify(scores.map((s) => s.score.toFixed(4)))})`);
}

// --- 5. Extremizing: documented formula p' = clip(p^a / (p^a + (1-p)^a)) --
assert(approxEqual(extremize(0.5), 0.5), "extremize(0.5) stays at 0.5 regardless of a");
assert(extremize(0.7) > 0.7, "extremize pushes a >0.5 probability further from 0.5 (a=1.5 default)");
assert(extremize(0.3) < 0.3, "extremize pushes a <0.5 probability further from 0.5 (a=1.5 default)");
assert(extremize(0.99) <= MAX_P, "extremize output stays within MAX_P");
assert(extremize(0.01) >= MIN_P, "extremize output stays within MIN_P");

// --- 6. No path to inflate score: a reckless always-extreme forecaster does
// NOT top the leaderboard over a calibrated forecaster across many
// questions with genuinely mixed base rates, because ranking uses MEAN
// Brier (not sum, so volume doesn't help) plus a calibration tie-break.
{
  const rng = mulberry32(7);
  const questionCount = 40;
  const records: ResolvedForecastRecord[] = [];

  for (let q = 0; q < questionCount; q++) {
    // True base rate for this question varies; outcome drawn from it.
    const trueP = 0.2 + rng() * 0.6; // somewhere in [0.2, 0.8]
    const outcome = rng() < trueP;

    // Calibrated forecaster reports something close to the true base rate
    // (small noise to simulate imperfect but honest estimation).
    const calibratedP = clampProbability(trueP + (rng() - 0.5) * 0.1);
    records.push({ forecaster: "calibrated", isModel: false, probability: calibratedP, outcome, questionId: q });

    // Reckless extremizer always reports a near-certain probability in the
    // direction of a naive guess (whichever side of 0.5 the noisy prior
    // looked like), regardless of actual confidence.
    const recklessP = rng() < 0.5 ? MAX_P : MIN_P;
    records.push({ forecaster: "reckless-extremizer", isModel: false, probability: recklessP, outcome, questionId: q });

    // A single lucky extreme forecaster who only forecasts on a handful of
    // questions (below MIN_RESOLVED_FOR_RANKING) and happens to get them
    // right -- should land in the provisional list, not rank #1.
    if (q < MIN_RESOLVED_FOR_RANKING - 1) {
      records.push({ forecaster: "lucky-few", isModel: false, probability: outcome ? MAX_P : MIN_P, outcome, questionId: q });
    }
  }

  const leaderboard = buildLeaderboard(records);
  const calibratedEntry = leaderboard.find((e) => e.forecaster === "calibrated")!;
  const recklessEntry = leaderboard.find((e) => e.forecaster === "reckless-extremizer")!;
  const luckyEntry = leaderboard.find((e) => e.forecaster === "lucky-few")!;

  assert(calibratedEntry.avgBrier < recklessEntry.avgBrier, `calibrated forecaster beats reckless extremizer on mean Brier (${calibratedEntry.avgBrier.toFixed(4)} < ${recklessEntry.avgBrier.toFixed(4)})`);
  assert((calibratedEntry.rank ?? Infinity) < (recklessEntry.rank ?? Infinity), `calibrated forecaster outranks reckless extremizer (${calibratedEntry.rank} < ${recklessEntry.rank})`);
  assert(luckyEntry.rank === null, `a forecaster below MIN_RESOLVED_FOR_RANKING (${MIN_RESOLVED_FOR_RANKING}) is provisional, not ranked`);
  assert(calibratedEntry.calibrationError < recklessEntry.calibrationError, "calibrated forecaster has lower calibration error than the reckless extremizer");

  console.log(
    `\nleaderboard snapshot: calibrated avgBrier=${calibratedEntry.avgBrier.toFixed(4)} rank=${calibratedEntry.rank}, ` +
      `reckless avgBrier=${recklessEntry.avgBrier.toFixed(4)} rank=${recklessEntry.rank}, lucky-few rank=${luckyEntry.rank}`,
  );
}

if (failures > 0) {
  console.error(`\ntest:scoring: ${failures} assertion(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("\ntest:scoring: all assertions PASSED");
}
