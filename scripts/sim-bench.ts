/**
 * scripts/sim-bench.ts — `npm run sim:bench`
 *
 * Benchmarks the forecast ensemble two ways on the same seeded workload:
 *   BEFORE: single-threaded, in-process, chunked engine (src/lib/simulation.ts)
 *            — this is what the HTTP route actually uses.
 *   AFTER:  multi-core worker pool (src/lib/monteCarloPool.ts +
 *            src/workers/monteCarloWorker.ts) — this is the throughput
 *            ceiling if/when a route ever needs more than one process's
 *            worth of CPU for a single forecast.
 *
 * All numbers printed are measurements of THIS machine running THIS engine
 * on a fixed, seeded workload — not a claim about production hardware.
 */
import { runForecastEnsemble } from "../src/lib/simulation";
import { runPooled } from "../src/lib/monteCarloPool";

const REPLICATIONS = Number(process.env.SIM_BENCH_REPLICATIONS ?? 2000);
const HORIZON_WEEKS = 26;
const HEADCOUNT = 1500; // matches the x10 seeded people count
const AVG_RISK = 0.35;

function fmtMs(ms: number) {
  return `${(ms / 1000).toFixed(2)}s`;
}

async function benchSingleThreaded() {
  const start = Date.now();
  const result = await runForecastEnsemble({
    tenantId: "bench",
    scenarioKey: "bench",
    inputsHash: "bench-fixed-seed",
    headcount: HEADCOUNT,
    avgRisk: AVG_RISK,
    horizonWeeks: HORIZON_WEEKS,
    replications: REPLICATIONS,
  });
  const wallMs = Date.now() - start;
  console.log(`\n--- BEFORE: single-threaded chunked engine (in-process, used by /api/forecast) ---`);
  console.log(`  replications: ${result.replicationsCompleted}/${REPLICATIONS}`);
  console.log(`  engine-reported duration: ${fmtMs(result.durationMs)}`);
  console.log(`  wall-clock duration:      ${fmtMs(wallMs)}`);
  console.log(`  throughput: ${(REPLICATIONS / (wallMs / 1000)).toFixed(0)} replications/sec`);
  return wallMs;
}

async function benchPooled() {
  const start = Date.now();
  const result = await runPooled({
    seed: 0xc0ffee,
    replications: REPLICATIONS,
    headcount: HEADCOUNT,
    avgRisk: AVG_RISK,
    horizonWeeks: HORIZON_WEEKS,
  });
  const wallMs = Date.now() - start;
  console.log(`\n--- AFTER: ${result.workerCount}-worker pool (offline CLI only, not in request path) ---`);
  console.log(`  replications: ${result.finals.length}/${REPLICATIONS}`);
  console.log(`  worker count: ${result.workerCount}`);
  console.log(`  wall-clock duration: ${fmtMs(result.wallMs)}`);
  console.log(`  throughput: ${(REPLICATIONS / (wallMs / 1000)).toFixed(0)} replications/sec`);
  return wallMs;
}

async function main() {
  console.log(`LEADOS sim:bench — ${REPLICATIONS} replications, ${HORIZON_WEEKS}w horizon, headcount=${HEADCOUNT} (x10 seeded scale)`);
  const beforeMs = await benchSingleThreaded();
  const afterMs = await benchPooled();

  console.log("\n=== SUMMARY ===");
  console.log(`single-threaded: ${fmtMs(beforeMs)}`);
  console.log(`worker pool:     ${fmtMs(afterMs)}`);
  console.log(`speedup: ${(beforeMs / afterMs).toFixed(2)}x`);

  const GATE_MS = 5000; // the HTTP route's own gate: single-threaded 2000-rep run must stay under 5s
  const pass = beforeMs <= GATE_MS;
  console.log(`\ngate: single-threaded ${REPLICATIONS}-run ensemble must complete in <= ${fmtMs(GATE_MS)} (this is what /api/forecast pays on a cold cache)`);
  console.log(pass ? "GATE PASS" : "GATE FAIL");
  process.exit(pass ? 0 : 1);
}

main();
