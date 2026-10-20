/**
 * goldenData.ts — SYNTHETIC golden datasets for `npm run eval:intelligence`.
 *
 * Every dataset here is clearly synthetic (there is no real customer data in
 * this program) but constructed to be *realistic*: known ground-truth
 * probabilities, known source reliabilities, and Bernoulli/Gaussian sampling
 * noise comparable to what a real evidence source would produce. Everything
 * is generated deterministically from `makeRng`/`deriveSeed` (see
 * `prng.ts`) so the scorecard this program prints is bit-for-bit
 * reproducible — required by standing order G.
 */

import { deriveSeed, makeRng } from "../domain/intelligence/prng";
import { sigmoid } from "../domain/intelligence/stats";
import type { EvidenceRef } from "../domain/intelligence/types";
import type { Rule, RuleInput } from "../domain/intelligence/ruleTypes";

export const GOLDEN_SEED = 42; // the one root seed for every golden dataset

// ---------------------------------------------------------------------------
// 1. Belief-pooling golden set
// ---------------------------------------------------------------------------

export type BeliefGoldenCase = {
  id: string;
  trueP: number;
  actualOutcome: 0 | 1;
  evidenceItems: { sourceId: string; p: number; reliability: number; correlationGroup?: string; evidence: EvidenceRef }[];
};

/** `n` independent synthetic propositions. Each has a true probability
 * drawn from U(0.05, 0.95), 3 evidence sources whose reported probability
 * is the true probability passed through source-specific Bernoulli-flip
 * noise (reliability controls flip rate), and a sampled actual outcome used
 * to score Brier/log-loss/ECE of the pooled posterior. */
export function buildBeliefGoldenSet(n = 300): BeliefGoldenCase[] {
  const rng = makeRng(deriveSeed(GOLDEN_SEED, "belief-golden"));
  const sources = [
    { sourceId: "hr-system", reliability: 0.9 },
    { sourceId: "survey-vendor", reliability: 0.7 },
    { sourceId: "social-scrape", reliability: 0.45, correlationGroup: "external-scrapes" },
    { sourceId: "news-scrape", reliability: 0.4, correlationGroup: "external-scrapes" },
  ];
  const cases: BeliefGoldenCase[] = [];
  for (let i = 0; i < n; i++) {
    const trueP = rng.range(0.05, 0.95);
    const actualOutcome: 0 | 1 = rng.next() < trueP ? 1 : 0;
    const evidenceItems = sources.map((s) => {
      // noisy report: with prob = reliability, report near-truth; else report noise
      const reportsTruth = rng.next() < s.reliability;
      const p = reportsTruth ? clampProb(trueP + rng.gaussian(0, 0.08)) : clampProb(rng.range(0.05, 0.95));
      return {
        sourceId: s.sourceId,
        p,
        reliability: s.reliability,
        correlationGroup: s.correlationGroup,
        evidence: {
          id: `${i}:${s.sourceId}`,
          kind: "metric" as const,
          sourceId: s.sourceId,
          correlationGroup: s.correlationGroup,
          weightApplied: 0,
          observedAt: new Date(2026, 0, 1).toISOString(),
          description: `synthetic report from ${s.sourceId}`,
        },
      };
    });
    cases.push({ id: `belief-${i}`, trueP, actualOutcome, evidenceItems });
  }
  return cases;
}

function clampProb(p: number): number {
  return Math.min(0.99, Math.max(0.01, p));
}

// ---------------------------------------------------------------------------
// 2. Rule-engine golden set
// ---------------------------------------------------------------------------

export type RuleGoldenCase = { features: RuleInput; label: 0 | 1 };

/** A synthetic "flight risk" domain: a hidden linear-in-logit true process
 * over 3 observable features, 3 rules of varying quality that each look at
 * a noisy subset of those features. */
export function buildRuleGoldenSet(n = 400): { cases: RuleGoldenCase[]; rules: Rule[] } {
  const rng = makeRng(deriveSeed(GOLDEN_SEED, "rule-golden"));
  const cases: RuleGoldenCase[] = [];
  for (let i = 0; i < n; i++) {
    const tenureYears = rng.range(0, 15);
    const engagementScore = rng.range(0, 1);
    const compaRatio = rng.range(0.7, 1.3);
    const trueLogit = -1.2 - 0.15 * tenureYears + -3.0 * engagementScore + -1.5 * (compaRatio - 1);
    const trueP = sigmoid(trueLogit);
    const label: 0 | 1 = rng.next() < trueP ? 1 : 0;
    cases.push({ features: { tenureYears, engagementScore, compaRatio }, label });
  }

  const rules: Rule[] = [
    {
      id: "rule.low-engagement",
      domain: "flight-risk",
      ruleClass: "engagement-rules",
      description: "Low engagement score predicts flight risk",
      weight: 0.4,
      evaluate: (input) => {
        const e = Number(input.engagementScore);
        const p = clampProb(1 - e);
        return { p, evidence: [], firedFeatures: ["engagementScore"] };
      },
    },
    {
      id: "rule.short-tenure",
      domain: "flight-risk",
      ruleClass: "tenure-rules",
      description: "Short tenure predicts flight risk",
      weight: 0.35,
      evaluate: (input) => {
        const t = Number(input.tenureYears);
        const p = clampProb(sigmoid(1 - t / 3));
        return { p, evidence: [], firedFeatures: ["tenureYears"] };
      },
    },
    {
      id: "rule.below-market-pay",
      domain: "flight-risk",
      ruleClass: "compensation-rules",
      description: "Below-market compa-ratio predicts flight risk",
      weight: 0.3,
      evaluate: (input) => {
        const c = Number(input.compaRatio);
        const p = clampProb(sigmoid((1 - c) * 4));
        return { p, evidence: [], firedFeatures: ["compaRatio"] };
      },
    },
  ];

  return { cases, rules };
}

// ---------------------------------------------------------------------------
// 3. Forecast golden set
// ---------------------------------------------------------------------------

export type ForecastGoldenCase = {
  id: string;
  trueMu: number;
  trueSigma: number;
  actualOutcome: number;
};

/** `n` synthetic forecasting scenarios: a known Normal(mu, sigma) "truth",
 * with one realized outcome drawn from that same truth to backtest CRPS
 * against (a well-specified forecaster should average close to the
 * closed-form CRPS of the generating distribution itself). */
export function buildForecastGoldenSet(n = 60): ForecastGoldenCase[] {
  const rng = makeRng(deriveSeed(GOLDEN_SEED, "forecast-golden"));
  const cases: ForecastGoldenCase[] = [];
  for (let i = 0; i < n; i++) {
    const trueMu = rng.range(50, 150);
    const trueSigma = rng.range(5, 25);
    const actualOutcome = rng.gaussian(trueMu, trueSigma);
    cases.push({ id: `forecast-${i}`, trueMu, trueSigma, actualOutcome });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// 4. Signal-fusion noisy trace (hysteresis stress test)
// ---------------------------------------------------------------------------

/** A score trace that spends a long stretch oscillating in a tight band
 * straddling the sev5 "up" threshold (0.92) with small noise, specifically
 * designed to try to make a naive (non-hysteretic) state machine flap. */
export function buildHysteresisNoisyTrace(length = 500): number[] {
  // Centered exactly at the midpoint of the sev5 up/down band (0.92 / 0.85)
  // with enough amplitude (±0.05) to cross BOTH thresholds repeatedly —
  // the adversarial case the hysteresis state machine must survive without
  // flapping (standing order E, acceptance gate #3).
  const rng = makeRng(deriveSeed(GOLDEN_SEED, "hysteresis-trace"));
  const center = (0.92 + 0.85) / 2;
  const trace: number[] = [];
  for (let i = 0; i < length; i++) {
    trace.push(center + rng.range(-0.05, 0.05));
  }
  return trace;
}
