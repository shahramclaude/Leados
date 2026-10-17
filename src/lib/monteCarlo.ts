// monteCarlo.ts — pure, seedable Monte Carlo simulation over a decision's
// weighted scenarios. ORIGINAL to this build (reconstructed from the
// general concept named in the pasted brief; no monte_carlo.js source was
// found in wbweve/Leados's real tree — see AI-SESSION-LOG.md).
//
// Deliberately pure functions only (no DOM/localStorage), so the exact same
// code can run on the main thread OR inside a Web Worker via postMessage.
// A mulberry32 PRNG is used instead of Math.random() specifically so that
// the same seed always reproduces the same result (required for the
// reproducibility guarantee called out in the brief).

import type { MonteCarloResult, Scenario } from "./types";

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(
  scenarios: Scenario[],
  iterations: number,
  seed: number
): Omit<MonteCarloResult, "computedVia" | "ms"> {
  const rand = mulberry32(seed);
  const totalProb = scenarios.reduce((s, sc) => s + sc.probability, 0) || 1;
  const cumulative: { upTo: number; sc: Scenario }[] = [];
  let acc = 0;
  for (const sc of scenarios) {
    acc += sc.probability / totalProb;
    cumulative.push({ upTo: acc, sc });
  }

  const outcomes: number[] = new Array(iterations);
  for (let i = 0; i < iterations; i++) {
    const r = rand();
    const picked = cumulative.find((c) => r <= c.upTo)?.sc ?? scenarios[scenarios.length - 1];
    const noise = (rand() * 2 - 1) * picked.spread;
    outcomes[i] = picked.impact + noise;
  }
  outcomes.sort((a, b) => a - b);

  const mean = outcomes.reduce((s, v) => s + v, 0) / iterations;
  const pct = (p: number) => outcomes[Math.min(iterations - 1, Math.floor(p * iterations))];
  const median = pct(0.5);
  const p10 = pct(0.1);
  const p90 = pct(0.9);
  const probPositive = outcomes.filter((v) => v > 0).length / iterations;

  const min = outcomes[0];
  const max = outcomes[outcomes.length - 1];
  const bucketCount = 10;
  const span = max - min || 1;
  const buckets = new Array(bucketCount).fill(0);
  for (const v of outcomes) {
    let idx = Math.floor(((v - min) / span) * bucketCount);
    if (idx >= bucketCount) idx = bucketCount - 1;
    buckets[idx]++;
  }
  const histogram = buckets.map((count, i) => ({
    bucket: `${(min + (i * span) / bucketCount).toFixed(0)}`,
    pct: +((count / iterations) * 100).toFixed(2),
  }));

  return { iterations, seed, mean, median, p10, p90, probPositive, histogram };
}
