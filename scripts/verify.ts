// Part 28 — standalone verification harness (no DB required).
//
// Run with: npx tsx scripts/verify.ts
//
// NOTE ON "npm run verify": per platform policy for this session we may not
// edit package.json directly, so this script isn't wired to an npm script
// name. Functionally it is the verification suite the standing order calls
// "npm run verify" — see AI-SESSION-LOG.md for the exact command used.
import { reconstructCases } from "../src/lib/processMining/caseReconstruction";
import { discoverProcessModel } from "../src/lib/processMining/discovery";
import { checkConformanceAgainstDeclared } from "../src/lib/processMining/conformance";
import { analyzeBottlenecks } from "../src/lib/processMining/bottleneck";
import { computeQueueingStats } from "../src/lib/processMining/queueing";
import { scoreAutomationOpportunity } from "../src/lib/processMining/automationScoring";
import {
  BENCHMARK_PROCESS_NAME,
  BENCHMARK_STEPS,
  generateBenchmarkWorld,
  generateSteadyStateQueueWorld,
  generateVolumeLog,
} from "../src/lib/processMining/simulate";

let failures = 0;
function check(label: string, condition: boolean, detail?: string) {
  const status = condition ? "PASS" : "FAIL";
  console.log(`[${status}] ${label}${detail ? " — " + detail : ""}`);
  if (!condition) failures += 1;
}

function section(title: string) {
  console.log("\n==================================================");
  console.log(title);
  console.log("==================================================");
}

async function main() {
  // ---------------------------------------------------------------------
  // Gate 1: planted-bottleneck recovery (recall/precision in top-3)
  // ---------------------------------------------------------------------
  section("GATE 1 — Planted-bottleneck benchmark");
  const world = generateBenchmarkWorld();
  const startActivities = new Set([BENCHMARK_STEPS[0]]);
  const endActivities = new Set([BENCHMARK_STEPS[BENCHMARK_STEPS.length - 1]]);
  const { cases, report: reconReport } = reconstructCases(world.events, { startActivities, endActivities });
  console.log(
    `Reconstructed ${reconReport.totalCases} cases from ${reconReport.totalRawEvents} raw events (ambiguous=${reconReport.ambiguousCases}, open=${reconReport.openCases}).`,
  );

  const bottlenecks = analyzeBottlenecks(cases);
  const top3 = bottlenecks.slice(0, 3).map((b) => b.activity);
  const groundTruth = world.groundTruth.plantedBottlenecks;
  const matched = groundTruth.filter((g) => top3.includes(g));
  const recall = matched.length / groundTruth.length;
  const precision = matched.length / top3.length;
  console.log(`Ranked bottlenecks (p85 queue wait desc): ${bottlenecks.map((b) => `${b.activity}=${Math.round(b.p85QueueMs / 60000)}m`).join(", ")}`);
  console.log(`Top-3: [${top3.join(", ")}] vs ground truth [${groundTruth.join(", ")}]`);
  console.log(`Recall@3=${recall.toFixed(2)}  Precision@3=${precision.toFixed(2)}`);
  check("planted bottleneck 'Approve' ranked in top-3", top3.includes("Approve"));
  check("planted bottleneck 'Review' ranked in top-3", top3.includes("Review"));
  check("recall@3 == 1.0", recall === 1);

  // ---------------------------------------------------------------------
  // Gate 2: conformance engine detects all seeded deviations
  // ---------------------------------------------------------------------
  section("GATE 2 — Conformance engine seeded-deviation test corpus");
  const conformance = checkConformanceAgainstDeclared(cases, world.definition);
  const byCaseId = new Map(conformance.results.map((r) => [r.caseId, r]));

  let skipDetected = 0;
  for (const caseId of world.groundTruth.skipCaseIds) {
    const r = byCaseId.get(caseId);
    if (r && r.deviations.some((d) => d.type === "skip" && d.severity === "rule")) skipDetected += 1;
  }
  check(
    `all ${world.groundTruth.skipCaseIds.length} seeded 'skip Triage' cases detected`,
    skipDetected === world.groundTruth.skipCaseIds.length,
    `${skipDetected}/${world.groundTruth.skipCaseIds.length}`,
  );

  let reorderDetected = 0;
  for (const caseId of world.groundTruth.reorderCaseIds) {
    const r = byCaseId.get(caseId);
    if (r && r.deviations.some((d) => d.type === "reorder" && d.severity === "rule")) reorderDetected += 1;
  }
  check(
    `all ${world.groundTruth.reorderCaseIds.length} seeded reorder cases detected`,
    reorderDetected === world.groundTruth.reorderCaseIds.length,
    `${reorderDetected}/${world.groundTruth.reorderCaseIds.length}`,
  );

  let reworkDetected = 0;
  for (const caseId of world.groundTruth.reworkCaseIds) {
    const r = byCaseId.get(caseId);
    if (r && r.deviations.some((d) => d.type === "rework")) reworkDetected += 1;
  }
  check(
    `all ${world.groundTruth.reworkCaseIds.length} seeded rework cases detected (statistical, not rule)`,
    reworkDetected === world.groundTruth.reworkCaseIds.length,
    `${reworkDetected}/${world.groundTruth.reworkCaseIds.length}`,
  );
  const reworkFlaggedAsRuleViolation = world.groundTruth.reworkCaseIds.filter((id) => byCaseId.get(id)?.conformant === false);
  check(
    "rework alone never flips a case to non-conformant (over-standardization guard)",
    reworkFlaggedAsRuleViolation.length === 0,
  );

  let illegalDetected = 0;
  for (const caseId of world.groundTruth.illegalTransitionCaseIds) {
    const r = byCaseId.get(caseId);
    if (r && r.deviations.some((d) => d.type === "unseen_transition" && d.severity === "rule") && r.conformant === false)
      illegalDetected += 1;
  }
  check(
    `all ${world.groundTruth.illegalTransitionCaseIds.length} seeded illegal-transition cases detected`,
    illegalDetected === world.groundTruth.illegalTransitionCaseIds.length,
    `${illegalDetected}/${world.groundTruth.illegalTransitionCaseIds.length}`,
  );

  const falsePositives = world.groundTruth.cleanCaseIds.filter((id) => byCaseId.get(id)?.conformant === false);
  check("zero false positives among clean cases (rule severity)", falsePositives.length === 0, `${falsePositives.length} false positives`);

  // ---------------------------------------------------------------------
  // Gate 3: Little's Law consistency within 2% on a steady-state simulation
  // ---------------------------------------------------------------------
  section("GATE 3 — Little's Law validation (steady-state M/M/1)");
  const steadyEvents = generateSteadyStateQueueWorld(7, 6000, 10, 14); // rho = 10/14 ~ 0.714, stable
  const { cases: steadyCases } = reconstructCases(steadyEvents, {});
  const queueStats = computeQueueingStats(steadyCases);
  const serviceStat = queueStats.find((q) => q.activity === "Service");
  if (!serviceStat) {
    check("Little's Law stat computed for 'Service' activity", false);
  } else {
    console.log(
      `lambda=${serviceStat.lambdaPerHour.toFixed(2)}/hr  mu=${serviceStat.muPerHour.toFixed(2)}/hr  rho=${serviceStat.utilization.toFixed(3)}  L=${serviceStat.wipTimeAverage.toFixed(3)}  W_measured=${(serviceStat.wMeasuredMs / 60000).toFixed(2)}m  W_little=${(serviceStat.wLittleMs / 60000).toFixed(2)}m  delta=${serviceStat.littlesLawDeltaPct.toFixed(3)}%`,
    );
    check("Little's Law delta within 2%", serviceStat.littlesLawDeltaPct < 2, `${serviceStat.littlesLawDeltaPct.toFixed(3)}%`);
    check("utilization < 1 (stable queue)", serviceStat.utilization < 1, serviceStat.utilization.toFixed(3));
  }

  // ---------------------------------------------------------------------
  // Gate 4: automation score matches hand computation on a fixture case
  // ---------------------------------------------------------------------
  section("GATE 4 — Automation scoring fixture check");
  const fixtureInput = {
    processName: "fixture_proc",
    activity: "ManualDataEntry",
    occurrences: 1000,
    periodMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    avgHandlingTimeMs: 6 * 60 * 1000, // 6 minutes
    observedErrorRate: 0.08,
    observedRuleBasedFraction: 0.65,
    sampleEventIds: ["e1", "e2", "e3"],
  };
  const costModel = { baseCost: 5000 };
  const result = scoreAutomationOpportunity(fixtureInput, costModel);

  const periodYears = fixtureInput.periodMs / (365 * 24 * 60 * 60 * 1000);
  const expectedVolumeAnnualized = fixtureInput.occurrences / periodYears;
  const expectedHandlingHours = fixtureInput.avgHandlingTimeMs / 3_600_000;
  const expectedScore =
    (expectedVolumeAnnualized * expectedHandlingHours * fixtureInput.observedErrorRate * fixtureInput.observedRuleBasedFraction) /
    costModel.baseCost;

  const scoreDeltaPct = (Math.abs(result.score.value - expectedScore) / expectedScore) * 100;
  console.log(`Hand-computed score=${expectedScore.toFixed(6)}  Engine score=${result.score.value.toFixed(6)}  delta=${scoreDeltaPct.toFixed(4)}%`);
  check("automation score matches hand computation within 0.01%", scoreDeltaPct < 0.01, `${scoreDeltaPct.toFixed(6)}%`);
  check("confidence marked 'measured' when both inputs instrumented", result.score.confidence === "measured");

  // estimated-fallback path
  const fixtureEstimated = { ...fixtureInput, observedErrorRate: null, observedRuleBasedFraction: null };
  const estimatedResult = scoreAutomationOpportunity(fixtureEstimated, costModel);
  check("confidence marked 'estimated' when inputs are heuristic fallbacks", estimatedResult.score.confidence === "estimated");
  check("estimated-input notes are surfaced to the caller", (estimatedResult.score.notes?.length ?? 0) >= 2);

  // ---------------------------------------------------------------------
  // Gate 5: performance — mining 100k events < 60s
  // ---------------------------------------------------------------------
  section("GATE 5 — Performance (100k events)");
  const volumeEvents = generateVolumeLog(100_000);
  console.log(`Generated ${volumeEvents.length} events for performance test.`);
  const t0 = Date.now();
  const { cases: volumeCases } = reconstructCases(volumeEvents, {});
  const volumeModel = discoverProcessModel(volumeCases);
  const volumeBottlenecks = analyzeBottlenecks(volumeCases);
  const volumeQueueing = computeQueueingStats(volumeCases);
  const elapsedMs = Date.now() - t0;
  console.log(
    `Pipeline (reconstruct -> discover -> bottlenecks -> queueing) over ${volumeEvents.length} events took ${elapsedMs}ms. Model has ${volumeModel.activities.length} activities, ${volumeBottlenecks.length} bottleneck rows, ${volumeQueueing.length} queueing rows.`,
  );
  check("mining 100k events completes in < 60,000ms", elapsedMs < 60_000, `${elapsedMs}ms`);

  // ---------------------------------------------------------------------
  section("SUMMARY");
  console.log(`benchmark_flow process name used for DB seeding: ${BENCHMARK_PROCESS_NAME}`);
  if (failures > 0) {
    console.log(`\n${failures} check(s) FAILED.`);
    process.exit(1);
  } else {
    console.log("\nAll checks PASSED.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("verify.ts crashed:", err);
  process.exit(1);
});
