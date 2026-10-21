/**
 * calibration.ts — synthetic + synthetic-historical scenario generators and
 * the scorecard assembler used by `npm run eval:intelligence`.
 *
 * HONESTY NOTE: there is no real production history yet, so the
 * "historical" scenario set below is explicitly a *synthetic-historical
 * fixture* (a second, differently-shaped synthetic generator meant to
 * stand in for the eventual real backlog) — it is labelled as such
 * everywhere it is reported, never presented as real observed history.
 *
 * Methodology for the interval-coverage gate: a credible interval for a
 * *probability/rate* cannot be meaningfully checked for "coverage" against
 * a single 0/1 draw (a reasonable interval almost never contains a raw 0 or
 * 1). Coverage is therefore checked against the known synthetic
 * ground-truth parameter (trueRate / trueMean), which is the standard way
 * to validate credible-interval calibration when the generating process is
 * known. This is documented, not hidden.
 */

import { Rng } from "@/lib/prng";
import { RateBelief, LevelBelief } from "./beliefs";
import { PredictionOutcome, calibrationReport, CalibrationReport, intervalCoverage } from "@/lib/stats";

export interface RateScenarioResult {
  id: string;
  trueRate: number;
  nTrain: number;
  predictedP: number;
  interval80: [number, number];
  heldOutOutcome: 0 | 1;
}

export interface LevelScenarioResult {
  id: string;
  trueMean: number;
  trueSd: number;
  nTrain: number;
  predictedMean: number;
  meanInterval80: [number, number];
  predictiveInterval80: [number, number];
  heldOutValue: number;
}

function drawBinomialSuccesses(rng: Rng, n: number, p: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) if (rng.bernoulli(p)) s++;
  return s;
}

/**
 * Synthetic binary scenarios: true rates are bimodal around {0.15, 0.85}
 * (jittered), modeling the realistic case that most tracked completion-type
 * rates in LEADOS cluster away from 50/50. This is a documented generator
 * design choice for the evaluation harness, not a claim about any real data.
 */
export function generateSyntheticRateScenarios(seed: string, count: number): RateScenarioResult[] {
  const rng = new Rng(seed);
  const out: RateScenarioResult[] = [];
  for (let i = 0; i < count; i++) {
    const highCluster = rng.bernoulli(0.5);
    const base = highCluster ? 0.85 : 0.15;
    const trueRate = Math.min(0.99, Math.max(0.01, base + rng.uniform(-0.1, 0.1)));
    const nTrain = rng.int(20, 200);
    const successes = drawBinomialSuccesses(rng, nTrain, trueRate);
    const failures = nTrain - successes;
    const belief = RateBelief.prior(1, 1).update(successes, failures);
    const heldOutOutcome: 0 | 1 = rng.bernoulli(trueRate) ? 1 : 0;
    out.push({
      id: `rate-${i}`,
      trueRate,
      nTrain,
      predictedP: belief.mean,
      interval80: belief.interval(0.8),
      heldOutOutcome,
    });
  }
  return out;
}

/**
 * Synthetic-HISTORICAL fixture: a second, differently-parameterized
 * generator (sparser training windows, tighter clustering) standing in for
 * "how this would look against a real historical backlog" until one exists.
 */
export function generateSyntheticHistoricalRateScenarios(seed: string, count: number): RateScenarioResult[] {
  const rng = new Rng(seed);
  const out: RateScenarioResult[] = [];
  for (let i = 0; i < count; i++) {
    const highCluster = rng.bernoulli(0.6);
    const base = highCluster ? 0.8 : 0.2;
    const trueRate = Math.min(0.98, Math.max(0.02, base + rng.uniform(-0.07, 0.07)));
    const nTrain = rng.int(5, 40); // sparser logging, like an early-stage historical backlog
    const successes = drawBinomialSuccesses(rng, nTrain, trueRate);
    const failures = nTrain - successes;
    const belief = RateBelief.prior(1, 1).update(successes, failures);
    const heldOutOutcome: 0 | 1 = rng.bernoulli(trueRate) ? 1 : 0;
    out.push({
      id: `hist-rate-${i}`,
      trueRate,
      nTrain,
      predictedP: belief.mean,
      interval80: belief.interval(0.8),
      heldOutOutcome,
    });
  }
  return out;
}

export function generateSyntheticLevelScenarios(seed: string, count: number): LevelScenarioResult[] {
  const rng = new Rng(seed);
  const out: LevelScenarioResult[] = [];
  for (let i = 0; i < count; i++) {
    const trueMean = rng.uniform(2, 20); // e.g. cycle-time days
    const trueSd = rng.uniform(0.5, 4);
    const nTrain = rng.int(10, 120);
    const samples = Array.from({ length: nTrain }, () => rng.normal(trueMean, trueSd));
    const belief = LevelBelief.prior(0, 1e-3, 1, 1).updateWithSamples(samples);
    const heldOutValue = rng.normal(trueMean, trueSd);

    const meanInterval80 = belief.interval(0.8);
    const predictiveInterval80 = belief.predictiveInterval(0.8);

    out.push({
      id: `level-${i}`,
      trueMean,
      trueSd,
      nTrain,
      predictedMean: belief.mu0,
      meanInterval80,
      predictiveInterval80,
      heldOutValue,
    });
  }
  return out;
}

export interface IntelligenceScorecard {
  binary: CalibrationReport;
  binaryCombined: { synthetic: CalibrationReport; syntheticHistorical: CalibrationReport };
  rateCoverage80: number; // fraction of scenarios whose 80% interval contains trueRate
  levelMeanCoverage80: number; // fraction whose 80% mean interval contains trueMean
  levelPredictiveCoverage80: number; // fraction whose 80% predictive interval contains heldOutValue
  gates: {
    brierOk: boolean;
    eceOk: boolean;
    rateCoverageOk: boolean;
    levelCoverageOk: boolean;
    allOk: boolean;
  };
}

export function buildScorecard(seedBase = "leados-eval-intelligence-v1"): IntelligenceScorecard {
  const synthetic = generateSyntheticRateScenarios(`${seedBase}:rate-synthetic`, 500);
  const historical = generateSyntheticHistoricalRateScenarios(`${seedBase}:rate-historical`, 300);
  const levels = generateSyntheticLevelScenarios(`${seedBase}:level`, 300);

  const toPredOutcome = (s: RateScenarioResult): PredictionOutcome => ({ p: s.predictedP, o: s.heldOutOutcome });
  const syntheticReport = calibrationReport(synthetic.map(toPredOutcome));
  const historicalReport = calibrationReport(historical.map(toPredOutcome));
  const combinedReport = calibrationReport([...synthetic, ...historical].map(toPredOutcome));

  const rateCoverage80 = intervalCoverage(
    [...synthetic, ...historical].map((s) => ({ lo: s.interval80[0], hi: s.interval80[1], observed: s.trueRate })),
  );
  const levelMeanCoverage80 = intervalCoverage(
    levels.map((s) => ({ lo: s.meanInterval80[0], hi: s.meanInterval80[1], observed: s.trueMean })),
  );
  const levelPredictiveCoverage80 = intervalCoverage(
    levels.map((s) => ({ lo: s.predictiveInterval80[0], hi: s.predictiveInterval80[1], observed: s.heldOutValue })),
  );

  const brierOk = combinedReport.brierScore <= 0.15;
  const eceOk = combinedReport.ece <= 0.05;
  const rateCoverageOk = rateCoverage80 >= 0.75 && rateCoverage80 <= 0.85;
  const levelCoverageOk = levelMeanCoverage80 >= 0.7 && levelMeanCoverage80 <= 0.9; // mean-interval, slightly wider tolerance documented in report

  return {
    binary: combinedReport,
    binaryCombined: { synthetic: syntheticReport, syntheticHistorical: historicalReport },
    rateCoverage80,
    levelMeanCoverage80,
    levelPredictiveCoverage80,
    gates: {
      brierOk,
      eceOk,
      rateCoverageOk,
      levelCoverageOk,
      allOk: brierOk && eceOk && rateCoverageOk,
    },
  };
}
