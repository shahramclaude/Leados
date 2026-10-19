// src/lib/intelligence/goldenDataset.ts
//
// ⚠️ SYNTHETIC DATA — clearly labeled as required by the standing order.
// Nothing in this file is real customer/account data. It is a deterministic
// (seeded) generator of *realistic-shaped* data used as the "golden
// dataset" for:
//   1. Rule calibration backtests (ruleCalibration.ts, calibrateRules.ts,
//      autoCalibrate.ts) — predictions vs. known ground-truth outcomes.
//   2. Causal inference regression tests (causalInference.ts) — data with a
//      deliberately-planted confounder so tests can assert the engine
//      refuses to call a confounded relationship "causal".
//   3. Forecast backtests (monteCarlo.ts accuracyFromHistory).
// Re-running generators with the same seed always produces the same
// dataset, so `npm run eval:intelligence` and the regression tests are
// reproducible and a calibration change cannot silently change the "truth".
import { mulberry32 } from "./monteCarlo";
import { DEFAULT_RULES, evaluateRule, Rule } from "./ruleEngine";
import type { CausalDataRow } from "./causalInference";
import type { ForecastHistoryPoint } from "./monteCarlo";

export const GOLDEN_DATASET_SEED = 1337;
export const GOLDEN_DATASET_LABEL = "SYNTHETIC — leados-golden-v1";

export interface LabeledPrediction {
  ruleId: string;
  domain: string;
  predictedProbability: number;
  outcome: 0 | 1;
  timestamp: string;
  features: Record<string, number>;
}

function sampleBernoulli(rng: () => number, p: number): 0 | 1 {
  return rng() < p ? 1 : 0;
}

function sampleFeatures(rule: Rule, rng: () => number): Record<string, number> {
  const features: Record<string, number> = {};
  for (const cond of rule.conditions) {
    // Sample around the condition's threshold so roughly half of rows fire
    // each condition, producing a realistic mix of fired/unfired rules.
    const spread = Math.abs(cond.threshold) > 1 ? Math.abs(cond.threshold) * 0.8 : 0.5;
    features[cond.feature] = cond.threshold + (rng() - 0.5) * 2 * spread;
  }
  return features;
}

/** Deliberate miscalibration factors applied to the "true" outcome
 * probability relative to what the uncalibrated rule (weight=1) predicts.
 * This simulates real rules that are over/under-confident, which
 * autoCalibrate.ts must detect and correct. Factor 1.0 = perfectly
 * calibrated rule (used as a control case in tests). */
const TRUE_MISCALIBRATION_FACTOR: Record<string, number> = {
  "rule.deal.stalled": 1.35, // rule under-predicts: true outcomes happen more often
  "rule.account.churnRisk": 0.7, // rule over-predicts: it's over-confident
  "rule.forecast.slipRisk": 1.0, // well-calibrated control case
};

/** Generates a labeled calibration dataset for one rule: N rows of sampled
 * features, the rule's own predicted probability (at weight=1, i.e. before
 * any calibration), and a Bernoulli-sampled outcome drawn from a "true"
 * probability that is a documented, deliberate miscalibration of the rule's
 * raw prediction. */
export function generateRuleCalibrationDataset(
  rule: Rule,
  n = 400,
  seed = GOLDEN_DATASET_SEED,
): LabeledPrediction[] {
  const rng = mulberry32(seed ^ hashString(rule.id));
  const uncalibrated: Rule = { ...rule, weight: 1 };
  const factor = TRUE_MISCALIBRATION_FACTOR[rule.id] ?? 1.0;
  const rows: LabeledPrediction[] = [];
  const start = Date.UTC(2024, 0, 1);
  for (let i = 0; i < n; i++) {
    const features = sampleFeatures(rule, rng);
    const result = evaluateRule(uncalibrated, features);
    const trueProbability = Math.min(1, Math.max(0, 0.5 + (result.rawProbability - 0.5) * factor));
    const outcome = sampleBernoulli(rng, trueProbability);
    rows.push({
      ruleId: rule.id,
      domain: rule.domain,
      predictedProbability: result.rawProbability,
      outcome,
      timestamp: new Date(start + i * 86_400_000).toISOString(),
      features,
    });
  }
  return rows;
}

export function generateAllCalibrationDatasets(seed = GOLDEN_DATASET_SEED): Record<string, LabeledPrediction[]> {
  const out: Record<string, LabeledPrediction[]> = {};
  for (const rule of DEFAULT_RULES) {
    out[rule.id] = generateRuleCalibrationDataset(rule, 400, seed);
  }
  return out;
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Synthetic GTM dataset with a planted confounder (marketDemand) that
 * drives both `headcount` and `pipelineGenerated`. When `includeConfounder`
 * is false, the returned rows omit the `marketDemand` column entirely,
 * simulating the realistic case where it isn't tracked anywhere — this is
 * the case causalInference.ts must refuse to call causal. */
export function generateCausalGoldenDataset(
  n = 300,
  seed = GOLDEN_DATASET_SEED,
  includeConfounder = true,
): CausalDataRow[] {
  const rng = mulberry32(seed ^ hashString("causal"));
  const rows: CausalDataRow[] = [];
  for (let i = 0; i < n; i++) {
    const marketDemand = 50 + (rng() - 0.5) * 2 * 15;
    // headcount is only PARTLY driven by marketDemand (coefficient 0.3) with
    // substantial independent noise (range +/-10) so headcount and
    // marketDemand are correlated (confounded, corr ~0.4) but not
    // collinear — this keeps the back-door-adjustment regression
    // well-conditioned, which any real adjustment-formula estimator needs.
    const headcountNoise = (rng() - 0.5) * 2 * 10;
    const headcount = Math.max(1, 10 + 0.3 * (marketDemand - 50) + headcountNoise);
    // Outcome noise is kept modest relative to headcount's effect on
    // pipeline so the planted 1.8 coefficient is actually recoverable from
    // a few hundred samples — a noise/signal ratio this extreme would make
    // ANY estimator (causal or not) unable to recover the true effect, which
    // would not usefully test the adjustment formula.
    const pipelineNoise = (rng() - 0.5) * 2 * 70;
    // Ground truth: pipelineGenerated = 2000 + 1.8*headcount + 40*(marketDemand-50) + noise
    const pipelineGenerated = 2000 + 1.8 * headcount + 40 * (marketDemand - 50) + pipelineNoise;
    const row: CausalDataRow = { headcount, pipelineGenerated };
    if (includeConfounder) row.marketDemand = marketDemand;
    rows.push(row);
  }
  return rows;
}

export const CAUSAL_GOLDEN_TRUE_EFFECT = 1.8;

/** Synthetic forecast backtest history: p50 predictions vs. what actually
 * happened, used to compute accuracyFromHistory() (Part 3 §5) and the
 * `coverage`/latency parts of the eval scorecard. */
export function generateForecastHistory(n = 24, seed = GOLDEN_DATASET_SEED): ForecastHistoryPoint[] {
  const rng = mulberry32(seed ^ hashString("forecast-history"));
  const history: ForecastHistoryPoint[] = [];
  for (let i = 0; i < n; i++) {
    const predictedP50 = 100_000 + i * 2_000;
    const actual = predictedP50 * (1 + (rng() - 0.5) * 0.18);
    history.push({ predictedP50, actual });
  }
  return history;
}
