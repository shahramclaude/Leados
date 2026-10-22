// LEADOS — Part 35: chaos experiment runner (CLI).
//
// Runs the full experiment suite against blastRadius=test and prints a full
// transcript for each run (hypothesis -> injection -> observed -> conclusion).
// The clock-skew experiment is deliberately run TWICE: once with the original
// ("naive") strategy — which genuinely fails — and once with the hardened
// strategy produced in response to that failure, so the transcript shows the
// real anti-fragility loop rather than asserting it happened.
//
// Run with: npx tsx scripts/chaos-run.ts

import "dotenv/config";
import { EXPERIMENTS, executeExperiment, markHardeningTaskDone } from "../src/lib/resilience";

function printTranscript(def: (typeof EXPERIMENTS)[number], run: Awaited<ReturnType<typeof executeExperiment>>["run"], result: Awaited<ReturnType<typeof executeExperiment>>["result"]) {
  console.log("\n" + "=".repeat(78));
  console.log(`EXPERIMENT  ${def.key} — ${def.title}`);
  console.log(`DOMAIN      ${def.domainKey}`);
  console.log(`HYPOTHESIS  ${def.hypothesis}`);
  console.log(`INJECTION   type=${def.injectionType} detail=${JSON.stringify(result.injectionDetail)}`);
  console.log(`BEFORE      ${JSON.stringify(result.steadyStateBefore)}`);
  console.log(`DURING      ${JSON.stringify(result.steadyStateDuring)}`);
  console.log(`AFTER       ${JSON.stringify(result.steadyStateAfter)}`);
  console.log(`OBSERVED    ${result.observed}`);
  console.log(`CONCLUSION  ${result.conclusion}`);
  console.log(`OUTCOME     ${result.outcome.toUpperCase()}  (run id ${run.id}, rolledBack=${result.rolledBack}, thunderingHerdChecked=${result.thunderingHerdChecked})`);
  if (result.hardeningTask) {
    console.log(`HARDENING   OPENED: ${result.hardeningTask.title}`);
  }
}

async function main() {
  const summary: { key: string; outcome: string }[] = [];

  for (const def of EXPERIMENTS) {
    if (def.key === "exp-clock-skew") {
      // Historical first run: the naive (pre-hardening) implementation — this is the one that breaks.
      const naive = await executeExperiment(def.key, { environment: "test", clockSkewStrategy: "naive" });
      printTranscript(def, naive.run, naive.result);
      summary.push({ key: `${def.key} (naive, pre-hardening)`, outcome: naive.result.outcome });

      // Hardening fix already implemented in src/lib/latestRecordStrategy.ts — mark the task done
      // and re-run with the hardened strategy to prove the fix.
      await markHardeningTaskDone(naive.run.id);
      const hardened = await executeExperiment(def.key, { environment: "test", clockSkewStrategy: "hardened" });
      printTranscript(def, hardened.run, hardened.result);
      summary.push({ key: `${def.key} (hardened, post-fix)`, outcome: hardened.result.outcome });
      continue;
    }

    const { run, result } = await executeExperiment(def.key, { environment: "test" });
    printTranscript(def, run, result);
    summary.push({ key: def.key, outcome: result.outcome });
  }

  console.log("\n" + "=".repeat(78));
  console.log("SUMMARY");
  for (const s of summary) {
    console.log(`  ${s.outcome.padEnd(8)} ${s.key}`);
  }
  const failed = summary.filter((s) => s.outcome === "failed").length;
  const passed = summary.filter((s) => s.outcome === "passed").length;
  console.log(`\n${passed} passed, ${failed} failed, ${summary.length} total runs.`);
  if (failed === 0) {
    console.log(
      "WARNING: a chaos program where every experiment passes usually means the injections were too weak. " +
        "This suite's exp-clock-skew (naive) run is expected to FAIL — if it did not, investigate.",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
