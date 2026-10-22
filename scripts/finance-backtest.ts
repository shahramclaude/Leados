// Part 08 — `npm run finance:backtest`.
// Prints the rolling-origin forecast calibration table and fails (exit 1)
// if overall P80 coverage falls outside [72%, 88%].

import { runBacktest } from "../src/lib/finance/backtest";

const { perDriver, overall } = runBacktest();

console.log("\n=== Forecast Backtest: P80 (P10-P90) Coverage ===\n");
console.log("driver".padEnd(26) + "trials".padStart(8) + "covered".padStart(10) + "coverage%".padStart(12));
for (const row of perDriver) {
  console.log(row.driver.padEnd(26) + String(row.trials).padStart(8) + String(row.covered).padStart(10) + row.coveragePct.toFixed(1).padStart(11) + "%");
}
console.log("-".repeat(56));
console.log(overall.driver.padEnd(26) + String(overall.trials).padStart(8) + String(overall.covered).padStart(10) + overall.coveragePct.toFixed(1).padStart(11) + "%");

const GATE_MIN = 72;
const GATE_MAX = 88;
if (overall.coveragePct < GATE_MIN || overall.coveragePct > GATE_MAX) {
  console.error(`\nFAILED: overall coverage ${overall.coveragePct.toFixed(1)}% is outside the [${GATE_MIN}, ${GATE_MAX}] gate.`);
  process.exit(1);
} else {
  console.log(`\nPASSED: overall coverage ${overall.coveragePct.toFixed(1)}% is within the [${GATE_MIN}, ${GATE_MAX}] gate.`);
}
