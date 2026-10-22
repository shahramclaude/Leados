// scripts/sim-bench.ts
//
// `npm run sim:bench` — benchmarks the standard 2,000-run ensemble, before
// and after variance-reduction (antithetic + control variate), and reports
// whether it meets the Phase 4 gate: "2,000-run ensemble of the standard
// scenario completes <= 30s on the bench profile".
//
// All numbers printed are MODEL ESTIMATES of the engine's own performance
// and variance; this script measures the simulator, not any real
// organisation.

import { DEFAULT_SCENARIO } from "../src/lib/twin/simulationScenario";
import { runEnsemble } from "../src/lib/twin/ensemble";

const STANDARD_RUNS = 2000;
const GATE_MS = 30_000;

function fmtMs(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function bench(label: string, useAntithetic: boolean, useControlVariate: boolean) {
  const scenario = { ...DEFAULT_SCENARIO, ensembleRuns: STANDARD_RUNS };
  const wallStart = Date.now();
  const result = runEnsemble(scenario, {
    runs: STANDARD_RUNS,
    seedBase: scenario.seedBase,
    useAntithetic,
    useControlVariate,
  });
  const wallMs = Date.now() - wallStart;
  console.log(`\n--- ${label} ---`);
  console.log(`  runs requested/completed: ${result.runsRequested}/${result.runsCompleted}`);
  console.log(`  engine-reported duration: ${fmtMs(result.durationMs)}`);
  console.log(`  wall-clock duration:      ${fmtMs(wallMs)}`);
  if (result.controlVariateDiagnostics) {
    console.log(
      `  control-variate variance reduction on cumulativeNetValue mean: ${result.controlVariateDiagnostics.varianceReductionPct.toFixed(2)}% ` +
        `(stdErr ${result.controlVariateDiagnostics.rawStdErr.toFixed(0)} -> ${result.controlVariateDiagnostics.adjustedStdErr.toFixed(0)})`,
    );
  }
  if (result.antitheticDiagnostics) {
    console.log(
      `  antithetic variance reduction on cumulativeNetValue mean: ${result.antitheticDiagnostics.varianceReductionPct.toFixed(2)}% ` +
        `(stdErr ${result.antitheticDiagnostics.independentStdErr.toFixed(0)} -> ${result.antitheticDiagnostics.pairedStdErr.toFixed(0)})`,
    );
  }
  return wallMs;
}

console.log(`LEADOS sim:bench — standard scenario "${DEFAULT_SCENARIO.name}", horizon ${DEFAULT_SCENARIO.horizonWeeks}w, ${STANDARD_RUNS} runs`);

const beforeMs = bench("BEFORE (no antithetic, no control variate)", false, false);
const afterMs = bench("AFTER (antithetic + control variate enabled)", true, true);

console.log("\n=== SUMMARY ===");
console.log(`before: ${fmtMs(beforeMs)}  |  after: ${fmtMs(afterMs)}`);
console.log(`gate: 2,000-run ensemble must complete in <= ${fmtMs(GATE_MS)}`);
const pass = afterMs <= GATE_MS;
console.log(pass ? "GATE PASS" : "GATE FAIL");
process.exit(pass ? 0 : 1);
