// LEADOS — Part 35: `npm run verify` resilience gate check.
//
// Runs the full chaos suite + a continuity drill + the coverage map, then
// scores the Phase 4 measurement gates from the brief. Individual experiment
// failures (notably the naive clock-skew run, which is EXPECTED to fail) do
// not fail verify — only violations of the meta-gates do, e.g. "fewer than 8
// experiments ran", "nothing ever failed" (too-weak-injections signal),
// "circuit breaker test wasn't green", "coverage map has no explicit gaps
// section", "recovery re-verification didn't catch the seeded corruption".
//
// Run with: npx tsx scripts/verify-resilience.ts
// (invoked by `npm run verify`, after seeding and typechecking)

import "dotenv/config";
import { EXPERIMENTS, executeExperiment, markHardeningTaskDone, computeFailureDomainCoverage } from "../src/lib/resilience";
import { DRILL_SCENARIOS, startDrill, completeDrill, seedContinuity } from "../src/lib/continuity";

type GateResult = { name: string; pass: boolean; detail: string };

async function main() {
  const gates: GateResult[] = [];
  console.log("LEADOS Part 35 — resilience verification run\n" + "=".repeat(78));

  // --- Run the full chaos suite -------------------------------------------
  const outcomes: { key: string; outcome: string; thunderingHerdChecked: boolean; runId: number; hardeningTask?: boolean }[] = [];

  for (const def of EXPERIMENTS) {
    if (def.key === "exp-clock-skew") {
      const naive = await executeExperiment(def.key, { environment: "test", clockSkewStrategy: "naive" });
      console.log(`\n[run] ${def.key} (naive)   -> ${naive.result.outcome}`);
      console.log(`      observed: ${naive.result.observed}`);
      outcomes.push({ key: `${def.key}:naive`, outcome: naive.result.outcome, thunderingHerdChecked: false, runId: naive.run.id, hardeningTask: !!naive.result.hardeningTask });
      if (naive.result.hardeningTask) await markHardeningTaskDone(naive.run.id);

      const hardened = await executeExperiment(def.key, { environment: "test", clockSkewStrategy: "hardened" });
      console.log(`[run] ${def.key} (hardened) -> ${hardened.result.outcome}`);
      console.log(`      observed: ${hardened.result.observed}`);
      outcomes.push({ key: `${def.key}:hardened`, outcome: hardened.result.outcome, thunderingHerdChecked: false, runId: hardened.run.id });
      continue;
    }

    const { run, result } = await executeExperiment(def.key, { environment: "test" });
    console.log(`\n[run] ${def.key.padEnd(28)} -> ${result.outcome}`);
    console.log(`      observed: ${result.observed}`);
    outcomes.push({ key: def.key, outcome: result.outcome, thunderingHerdChecked: result.thunderingHerdChecked, runId: run.id });
  }

  const totalRuns = outcomes.length;
  const failedRuns = outcomes.filter((o) => o.outcome === "failed");
  const passedRuns = outcomes.filter((o) => o.outcome === "passed");

  gates.push({
    name: "Gate 1: >=8 chaos experiments executed, with >=1 genuine failure that produced a hardening fix",
    pass: totalRuns >= 8 && failedRuns.length >= 1 && outcomes.some((o) => o.hardeningTask),
    detail: `${totalRuns} runs executed (${passedRuns.length} passed, ${failedRuns.length} failed). Failed: [${failedRuns.map((f) => f.key).join(", ") || "none"}].`,
  });

  if (failedRuns.length === 0) {
    console.log(
      "\n*** WARNING: zero experiments failed. In a real chaos program this means injections were too weak. " +
        "This suite expects exp-clock-skew:naive to fail — investigate if it did not. ***",
    );
  }

  // --- Circuit breaker gate -------------------------------------------------
  const providerRun = outcomes.find((o) => o.key === "exp-provider-error-rate");
  gates.push({
    name: "Gate 2: circuit breaker green (outage -> degraded -> recovery without thundering herd)",
    pass: !!providerRun && providerRun.outcome === "passed" && providerRun.thunderingHerdChecked,
    detail: providerRun
      ? `exp-provider-error-rate outcome=${providerRun.outcome}, thunderingHerdChecked=${providerRun.thunderingHerdChecked}`
      : "exp-provider-error-rate did not run",
  });

  // --- Continuity drill gate --------------------------------------------------
  await seedContinuity();
  const scenario = DRILL_SCENARIOS[1]; // finance-system-offline-month-end
  const drill = await startDrill(scenario.key, "resilience-lab verify run, finance ops (scripted dry-run)");
  const completed = await completeDrill({
    drillId: drill.id,
    timerSeconds: 1,
    afterActionNotes: "Automated verify-run dry-run of the tabletop tooling; see scripts/continuity-drill.ts for the richer narrative version.",
    actionItems: [{ owner: "Process owner", item: "Validate this scripted drill with real participants.", dueInDays: 30 }],
  });
  gates.push({
    name: "Gate 3: continuity tabletop drill completed with after-action items recorded",
    pass: completed?.outcome === "completed" && Array.isArray(completed?.actionItems) && (completed.actionItems as unknown[]).length > 0,
    detail: `drill ${completed?.id} outcome=${completed?.outcome}, actionItems=${Array.isArray(completed?.actionItems) ? (completed.actionItems as unknown[]).length : 0}`,
  });

  // --- Recovery re-verification gate ------------------------------------------
  const fatFingerRun = outcomes.find((o) => o.key === "exp-operator-fat-finger");
  gates.push({
    name: "Gate 4: recovery re-verification catches a seeded post-recovery inconsistency",
    pass: !!fatFingerRun && fatFingerRun.outcome === "passed",
    detail: fatFingerRun
      ? `exp-operator-fat-finger outcome=${fatFingerRun.outcome} (passed means the seeded corruption WAS detected)`
      : "exp-operator-fat-finger did not run",
  });

  // --- Coverage map gate -------------------------------------------------------
  const coverage = await computeFailureDomainCoverage();
  const excludedDomains = coverage.filter((c) => !c.chaosTestable);
  const testableGaps = coverage.filter((c) => c.chaosTestable && c.gap);
  console.log("\nFAILURE-DOMAIN COVERAGE MAP");
  for (const c of coverage) {
    const tag = !c.chaosTestable ? "EXCLUDED (not chaos-testable)" : c.gap ? "GAP (zero experiments)" : "covered";
    console.log(`  ${c.domainKey.padEnd(26)} experiments=${c.experimentCount} runs=${c.runCount} everFailed=${c.everFailed}  [${tag}]`);
  }
  gates.push({
    name: "Gate 5: failure-domain coverage map published with gaps explicitly listed",
    pass: excludedDomains.length > 0, // the program must name its own blind spots
    detail: `${excludedDomains.length} domain(s) explicitly excluded from chaos coverage: [${excludedDomains.map((d) => d.domainKey).join(", ")}]; ${testableGaps.length} testable-but-uncovered domain(s): [${testableGaps.map((d) => d.domainKey).join(", ") || "none"}].`,
  });

  // --- Report -------------------------------------------------------------
  console.log("\n" + "=".repeat(78));
  console.log("GATE REPORT");
  let allPass = true;
  for (const g of gates) {
    console.log(`  [${g.pass ? "PASS" : "FAIL"}] ${g.name}\n        ${g.detail}`);
    if (!g.pass) allPass = false;
  }

  console.log("\n" + "=".repeat(78));
  if (allPass) {
    console.log("RESULT: all resilience gates satisfied. Exiting 0.");
    process.exit(0);
  } else {
    console.log("RESULT: one or more resilience gates FAILED. Exiting 1.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify-resilience crashed:", err);
  process.exit(1);
});
