// eval:worldmodel — the honest, DB-free calibration gate for Part 59.
//
// Generates N synthetic series with known ground truth (trend + Gaussian
// noise, several of them pure noise / zero-slope as a sanity check), runs
// the sliding in-memory backtest across each, and reports the empirical
// coverage of the 80% (P10–P90) interval against the accept band
// [72%, 88%]. This is run with `npm run eval:worldmodel` and prints a
// pass/fail verdict with the real measured number — it does not assume the
// gate passes.
import { backtestSeriesInMemory } from "@/lib/worldModelCore";
import { generateSyntheticSeries } from "@/lib/syntheticData";

interface SeriesSpec {
  name: string;
  intercept: number;
  slope: number;
  noiseStd: number;
  seed: number;
}

const SERIES: SeriesSpec[] = [
  { name: "steady-growth", intercept: 1000, slope: 25, noiseStd: 40, seed: 1 },
  { name: "steady-decline", intercept: 2000, slope: -15, noiseStd: 60, seed: 2 },
  { name: "flat-noisy", intercept: 500, slope: 0, noiseStd: 30, seed: 3 },
  { name: "steep-growth", intercept: 100, slope: 12, noiseStd: 8, seed: 4 },
  { name: "pure-noise-a", intercept: 300, slope: 0, noiseStd: 50, seed: 5 },
  { name: "pure-noise-b", intercept: 800, slope: 0, noiseStd: 90, seed: 6 },
  { name: "slow-decline", intercept: 1500, slope: -4, noiseStd: 20, seed: 7 },
  { name: "volatile-growth", intercept: 400, slope: 20, noiseStd: 100, seed: 8 },
  { name: "high-base-flat", intercept: 10000, slope: 0, noiseStd: 300, seed: 9 },
  { name: "mild-growth", intercept: 250, slope: 3, noiseStd: 12, seed: 10 },
  { name: "mild-decline", intercept: 900, slope: -2, noiseStd: 15, seed: 11 },
  { name: "sharp-growth", intercept: 50, slope: 30, noiseStd: 60, seed: 12 },
];

const N_PERIODS = 48;
const HORIZON = 3;
const TRIALS = 1500;

function main() {
  let totalWithin = 0;
  let totalBacktests = 0;
  const perSeries: { name: string; total: number; within: number; coverage: number }[] = [];

  for (const spec of SERIES) {
    const points = generateSyntheticSeries({
      n: N_PERIODS,
      intercept: spec.intercept,
      slope: spec.slope,
      noiseStd: spec.noiseStd,
      seed: spec.seed,
    });
    const results = backtestSeriesInMemory(points, HORIZON, TRIALS, spec.seed * 97 + 11);
    const within = results.filter((r) => r.withinInterval).length;
    totalWithin += within;
    totalBacktests += results.length;
    perSeries.push({ name: spec.name, total: results.length, within, coverage: within / results.length });
  }

  const coverage = totalWithin / totalBacktests;
  const acceptLow = 0.72;
  const acceptHigh = 0.88;
  const pass = coverage >= acceptLow && coverage <= acceptHigh;

  console.log("=== eval:worldmodel — calibration gate (Part 59) ===");
  console.log(`series: ${SERIES.length}, periods/series: ${N_PERIODS}, horizon: ${HORIZON} steps, trials/backtest: ${TRIALS}`);
  console.log(`total backtests: ${totalBacktests}`);
  console.log("");
  console.log("per-series coverage:");
  for (const s of perSeries) {
    console.log(`  ${s.name.padEnd(18)} n=${String(s.total).padEnd(3)} within=${String(s.within).padEnd(3)} coverage=${(s.coverage * 100).toFixed(1)}%`);
  }
  console.log("");
  console.log(`TOTAL 80% interval coverage: ${(coverage * 100).toFixed(2)}% (accept band [${acceptLow * 100}%, ${acceptHigh * 100}%])`);
  console.log(`GATE: ${pass ? "PASS" : "FAIL"}`);

  if (!pass) {
    console.log("NOTE: reporting honestly — the gate failed. Do not treat this as success.");
    process.exitCode = 1;
  }
}

main();
