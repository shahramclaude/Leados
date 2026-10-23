import assert from "node:assert/strict";
import { test } from "node:test";
import { mulberry32, percentile, mean } from "../src/lib/rng";
import { detectChangePoints } from "../src/lib/causal";
import { wsjf } from "../src/lib/strategy";
import { fitLinearTrend } from "../src/lib/worldModel";

test("mulberry32 is deterministic given the same seed", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = Array.from({ length: 5 }, () => a());
  const seqB = Array.from({ length: 5 }, () => b());
  assert.deepEqual(seqA, seqB);
});

test("percentile returns the min/median/max correctly on a sorted array", () => {
  const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(sorted, 0), 1);
  assert.equal(percentile(sorted, 1), 10);
  assert.ok(Math.abs(percentile(sorted, 0.5) - 5.5) < 1e-9);
});

test("mean computes the arithmetic average", () => {
  assert.equal(mean([2, 4, 6]), 4);
});

test("detectChangePoints flags an injected step shock and ignores a stable series", () => {
  const stable = Array.from({ length: 20 }, (_, i) => ({ period: `p${i}`, value: 100 + (i % 2 === 0 ? 0.1 : -0.1) }));
  const stableFlags = detectChangePoints(stable);
  assert.equal(stableFlags.length, 0, "a near-constant series should not trigger a change point");

  const shocked = Array.from({ length: 20 }, (_, i) => ({ period: `p${i}`, value: i < 10 ? 100 : 160 }));
  const shockFlags = detectChangePoints(shocked);
  assert.ok(shockFlags.length > 0, "a sustained step shock must be detected");
});

test("wsjf formula matches (value + timeCriticality + riskReduction) / size", () => {
  const score = wsjf({ value: 8, timeCriticality: 6, riskReduction: 4, size: 6 });
  assert.ok(Math.abs(score - 18 / 6) < 1e-9);
});

test("wsjf guards against division by zero / near-zero size", () => {
  const score = wsjf({ value: 5, timeCriticality: 5, riskReduction: 5, size: 0 });
  assert.ok(Number.isFinite(score));
});

test("fitLinearTrend recovers a known slope on noise-free synthetic data", () => {
  const points = Array.from({ length: 12 }, (_, i) => ({ period: `p${i}`, value: 10 + 2 * i }));
  const fitted = fitLinearTrend(points);
  assert.ok(Math.abs(fitted.slope - 2) < 1e-9, `expected slope ~2, got ${fitted.slope}`);
  assert.ok(fitted.residualStd < 0.5, "noise-free data should fit with near-zero residual std");
});
