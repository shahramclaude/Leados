// LEADOS — Part 38: drift-injection test harness.
//
// Seeds synthetic, reproducible drift into isolated "harness.*" metric
// series (never the production metric keys, so this is repeatable and does
// not pollute real history) for each drift mode, then runs the exact same
// detector used in production (src/lib/drift.ts detectDrift) and asserts
// detection within the declared latency (cycles after the injected shift).
//
// Run with: npm run drift:inject

import "dotenv/config";
import { db } from "@/db";
import { metricObservations } from "@/db/schema";
import { like } from "drizzle-orm";
import { recordObservation, getRecentSeries } from "@/lib/metrics";
import { detectDrift } from "@/lib/drift";
import { brierScore, type PredictionOutcome } from "@/lib/calibration";
import { demographicParityDifference, type GroupOutcome } from "@/lib/fairness";

function seededNoise(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

interface DriftMode {
  name: string;
  metricKey: string;
  baseline: number;
  cycles: number;
  driftFromCycle: number;
  declaredLatencyCycles: number;
  generateSeries: () => number[];
}

function calibrationSeries(cycles: number, driftFromCycle: number): number[] {
  const values: number[] = [];
  for (let day = 0; day < cycles; day++) {
    const driftActive = day >= driftFromCycle;
    const samples: PredictionOutcome[] = Array.from({ length: 200 }, (_, i) => {
      const predicted = Math.min(0.99, Math.max(0.01, seededNoise(day * 1000 + i)));
      const trueP = driftActive ? Math.max(0, predicted - 0.22) : predicted;
      const outcome: 0 | 1 = seededNoise(day * 2000 + i * 7) < trueP ? 1 : 0;
      return { predictedProbability: predicted, outcome };
    });
    values.push(brierScore(samples));
  }
  return values;
}

function fairnessSeries(cycles: number, driftFromCycle: number): number[] {
  const values: number[] = [];
  for (let day = 0; day < cycles; day++) {
    const decayActive = day >= driftFromCycle;
    const samples: GroupOutcome[] = Array.from({ length: 300 }, (_, i) => {
      const noise = seededNoise(day * 500 + i);
      const group = noise < 0.5 ? "group_a" : "group_b";
      const biasShift = decayActive && group === "group_b" ? 0.18 : 0;
      const predictedPositive = seededNoise(day * 900 + i * 3) < 0.45 + biasShift;
      const actualPositive = seededNoise(day * 1300 + i * 5) < 0.45;
      return { group, predictedPositive, actualPositive };
    });
    values.push(demographicParityDifference(samples));
  }
  return values;
}

function costSeries(cycles: number, driftFromCycle: number): number[] {
  const values: number[] = [];
  for (let day = 0; day < cycles; day++) {
    const spikeActive = day >= driftFromCycle;
    const jitter = (seededNoise(day * 31) - 0.5) * 0.3;
    values.push(4.2 + jitter + (spikeActive ? 2.1 : 0));
  }
  return values;
}

function retrievalDecaySeries(cycles: number, driftFromCycle: number): number[] {
  const values: number[] = [];
  for (let w = 0; w < cycles; w++) {
    const decayActive = w >= driftFromCycle;
    const jitter = (seededNoise(w * 17) - 0.5) * 0.03;
    const decayPenalty = decayActive ? 0.03 * (w - driftFromCycle + 1) : 0;
    values.push(Math.max(0.3, 0.82 + jitter - decayPenalty));
  }
  return values;
}

function dataQualityDecaySeries(cycles: number, driftFromCycle: number): number[] {
  const values: number[] = [];
  for (let day = 0; day < cycles; day++) {
    const decayActive = day >= driftFromCycle;
    const jitter = (seededNoise(day * 61) - 0.5) * 0.01;
    const decayPenalty = decayActive ? 0.02 * (day - driftFromCycle + 1) : 0;
    values.push(Math.max(0.5, 0.97 + jitter - decayPenalty));
  }
  return values;
}

const MODES: DriftMode[] = [
  {
    name: "calibration (overconfidence shift)",
    metricKey: "harness.calibration.brier",
    baseline: 0.08,
    cycles: 30,
    driftFromCycle: 20,
    declaredLatencyCycles: 6,
    generateSeries: () => calibrationSeries(30, 20),
  },
  {
    name: "fairness (demographic parity decay)",
    metricKey: "harness.fairness.dpd",
    baseline: 0.05,
    cycles: 30,
    driftFromCycle: 20,
    declaredLatencyCycles: 6,
    generateSeries: () => fairnessSeries(30, 20),
  },
  {
    name: "cost (spend spike)",
    metricKey: "harness.cost.usd_per_1k",
    baseline: 4.2,
    cycles: 30,
    driftFromCycle: 20,
    declaredLatencyCycles: 3,
    generateSeries: () => costSeries(30, 20),
  },
  {
    name: "retrieval (index/embedding decay)",
    metricKey: "harness.retrieval.precision",
    baseline: 0.82,
    cycles: 20,
    driftFromCycle: 12,
    declaredLatencyCycles: 5,
    generateSeries: () => retrievalDecaySeries(20, 12),
  },
  {
    name: "data quality (completeness decay)",
    metricKey: "harness.dataquality.completeness",
    baseline: 0.97,
    cycles: 30,
    driftFromCycle: 20,
    declaredLatencyCycles: 6,
    generateSeries: () => dataQualityDecaySeries(30, 20),
  },
];

interface HarnessResult {
  mode: string;
  metricKey: string;
  driftInjectedAtCycle: number;
  detectedAtCycle: number | null;
  latencyCycles: number | null;
  declaredLatencyCycles: number;
  pass: boolean;
}

async function runMode(mode: DriftMode): Promise<HarnessResult> {
  await db.delete(metricObservations).where(like(metricObservations.metricKey, mode.metricKey));

  const series = mode.generateSeries();
  const now = Date.now();
  for (let i = 0; i < series.length; i++) {
    await recordObservation({
      metricKey: mode.metricKey,
      domain: "test",
      value: series[i],
      observedAt: new Date(now - (series.length - i) * 86400000),
      windowLabel: `harness-cycle-${i}`,
    });
  }

  // Walk forward cycle-by-cycle, re-running the production detector on the
  // series available "as of" that cycle, exactly like the real runner would
  // see progressively more data each day.
  let detectedAtCycle: number | null = null;
  for (let cycle = mode.driftFromCycle; cycle < series.length; cycle++) {
    const windowSeries = series.slice(0, cycle + 1);
    const verdict = detectDrift(windowSeries, mode.baseline);
    if (verdict.flagged) {
      detectedAtCycle = cycle;
      break;
    }
  }

  const latencyCycles = detectedAtCycle === null ? null : detectedAtCycle - mode.driftFromCycle;
  const pass = latencyCycles !== null && latencyCycles <= mode.declaredLatencyCycles;

  return {
    mode: mode.name,
    metricKey: mode.metricKey,
    driftInjectedAtCycle: mode.driftFromCycle,
    detectedAtCycle,
    latencyCycles,
    declaredLatencyCycles: mode.declaredLatencyCycles,
    pass,
  };
}

export async function runDriftInjectionHarness(): Promise<HarnessResult[]> {
  const results: HarnessResult[] = [];
  for (const mode of MODES) {
    results.push(await runMode(mode));
  }
  return results;
}

async function main() {
  console.log("=== LEADOS Part 38 — Drift Injection Harness ===\n");
  const results = await runDriftInjectionHarness();

  console.log(
    "| Mode | Injected @ cycle | Detected @ cycle | Latency (cycles) | Declared max | Verdict |",
  );
  console.log("|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(
      `| ${r.mode} | ${r.driftInjectedAtCycle} | ${r.detectedAtCycle ?? "NOT DETECTED"} | ${r.latencyCycles ?? "—"} | ${r.declaredLatencyCycles} | ${r.pass ? "PASS" : "FAIL"} |`,
    );
  }

  const allPass = results.every((r) => r.pass);
  console.log(`\nOverall: ${allPass ? "PASS — all seeded drift modes detected within declared latency." : "FAIL"}`);

  if (!allPass) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
