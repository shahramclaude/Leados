// src/lib/selfTest.ts
//
// Pure, dependency-light self-test / runtime-assertion helpers. Every
// import below has no @/db dependency so this module can run anywhere
// (server or client).

import { noisyOrPosterior, evidenceConfidence } from "./bayesianNetwork";
import { clampWeight, nudgeWeight, computeBrierScore } from "./selfImprove";

export interface SelfTestCase {
  name: string;
  passed: boolean;
  actual: unknown;
  expected: unknown;
}

export interface SelfTestResult {
  passed: number;
  failed: number;
  tests: SelfTestCase[];
}

function test(name: string, actual: unknown, expected: unknown, passed: boolean): SelfTestCase {
  return { name, actual, expected, passed };
}

/**
 * Splits text into sentences using a simple period/question/exclamation
 * boundary heuristic (good enough for the short, machine-generated
 * executive summaries this is applied to — no abbreviations expected).
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Runtime assertion: throws if `text` does not contain exactly `n`
 * sentences. Used to enforce the morning briefing's 3-sentence
 * executiveSummary contract. */
export function assertExactSentenceCount(text: string, n: number, label = "text"): void {
  const sentences = splitSentences(text);
  if (sentences.length !== n) {
    throw new Error(
      `assertExactSentenceCount: expected ${label} to have exactly ${n} sentences, got ${sentences.length}: "${text}"`,
    );
  }
}

function testNoisyOrBounded(): SelfTestCase {
  const p = noisyOrPosterior(0.05, [
    { q: 0.5, p: 0.8 },
    { q: 0.3, p: 0.6 },
  ]);
  const passed = p >= 0 && p <= 1;
  return test("NOISY_OR_BOUNDED", p, "within [0,1]", passed);
}

function testEvidenceConfidenceExtremes(): SelfTestCase {
  const high = evidenceConfidence([0, 1, 0, 1]);
  const low = evidenceConfidence([0.5, 0.5]);
  const passed = high === 1 && low === 0;
  return test("EVIDENCE_CONFIDENCE_EXTREMES", { high, low }, { high: 1, low: 0 }, passed);
}

function testWeightClamping(): SelfTestCase {
  const low = clampWeight(-5);
  const high = clampWeight(100);
  const passed = low === 0.1 && high === 2.5;
  return test("WEIGHT_CLAMPING", { low, high }, { low: 0.1, high: 2.5 }, passed);
}

function testNudgeWeightBoundedPerCycle(): SelfTestCase {
  const up = nudgeWeight(1, 2); // factor way above 1.1, should be clamped to 1.1
  const down = nudgeWeight(1, 0.1); // factor way below 0.9, should be clamped to 0.9
  const passed = Math.abs(up - 1.1) < 1e-9 && Math.abs(down - 0.9) < 1e-9;
  return test("NUDGE_WEIGHT_BOUNDED_PER_CYCLE", { up, down }, { up: 1.1, down: 0.9 }, passed);
}

function testBrierScorePerfect(): SelfTestCase {
  const score = computeBrierScore([
    { predicted: 1, outcome: true },
    { predicted: 0, outcome: false },
  ]);
  return test("BRIER_SCORE_PERFECT_PREDICTIONS", score, 0, score === 0);
}

function testSentenceCountAssertion(): SelfTestCase {
  let threw = false;
  try {
    assertExactSentenceCount("One. Two.", 3);
  } catch {
    threw = true;
  }
  return test("SENTENCE_COUNT_ASSERTION_THROWS_ON_MISMATCH", threw, true, threw);
}

export function runSelfTests(): SelfTestResult {
  const tests: SelfTestCase[] = [
    testNoisyOrBounded(),
    testEvidenceConfidenceExtremes(),
    testWeightClamping(),
    testNudgeWeightBoundedPerCycle(),
    testBrierScorePerfect(),
    testSentenceCountAssertion(),
  ];
  return {
    passed: tests.filter((t) => t.passed).length,
    failed: tests.filter((t) => !t.passed).length,
    tests,
  };
}
