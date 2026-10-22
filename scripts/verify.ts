// LEADOS — Part 38: `npm run verify`
//
// Runs every Phase 4 measurement gate against the real database and prints
// a transcript. Exits non-zero if any gate fails.

import "dotenv/config";
import { db } from "@/db";
import { metricObservations, remediationActions } from "@/db/schema";
import { like } from "drizzle-orm";
// NOTE: `like` is used only for cleaning up harness-prefixed metric rows at
// the end of this script (see cleanupHarnessData) — not for equality checks.
import { fullBootstrap } from "@/lib/assurance/sync";
import { CHECK_REGISTRY, VALIDATED_REGISTRY } from "@/lib/assurance/registry";
import { assertCoverage } from "@/lib/assurance/coverage";
import { runDriftInjectionHarness } from "./driftInjectionHarness";
import { runCheckForCycle } from "@/lib/assurance/runner";
import { revertRemediation } from "@/lib/assurance/remediation";
import { generateNightlyReport, lintReportForFiller, buildNightlyReportContent } from "@/lib/assurance/report";
import { seedLearningLoopHistory } from "@/lib/learningLoop";
import { seedFairnessHistory, FAIRNESS_DPD_KEY, FAIRNESS_EOD_KEY } from "@/lib/fairness";
import { getFlag } from "@/lib/featureFlags";
import { verifyAuditChain } from "@/lib/audit";

let failures = 0;

function gate(name: string, pass: boolean, detail?: string) {
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"} — ${name}${detail ? `\n       ${detail}` : ""}`);
  if (!pass) failures += 1;
}

async function gate1_driftInjection() {
  console.log("\n--- Gate 1: Drift-injection harness ---");
  const results = await runDriftInjectionHarness();
  for (const r of results) {
    gate(
      `${r.mode} detected within declared latency`,
      r.pass,
      `injected@${r.driftInjectedAtCycle} detected@${r.detectedAtCycle ?? "never"} latency=${r.latencyCycles ?? "n/a"} (max ${r.declaredLatencyCycles})`,
    );
  }
}

async function gate2_autoRemediation() {
  console.log("\n--- Gate 2: Auto-remediation (seeded failure -> auto-fix -> audited -> reversible) ---");
  const check = CHECK_REGISTRY.find((c) => c.id === "learning-loop-regression")!;
  await seedLearningLoopHistory(12, 6); // force a regression breach

  const cycleKey = `verify-autofix-${Date.now()}`;
  const outcome = await runCheckForCycle(check, cycleKey);
  gate("Seeded breach detected", outcome.status === "breach", `status=${outcome.status}`);
  gate(
    "Remediation tier applied is safe_auto_fix",
    outcome.remediation?.tier === "safe_auto_fix",
    `tier=${outcome.remediation?.tier} status=${outcome.remediation?.status}`,
  );

  const latestAction = (await db.select().from(remediationActions))
    .filter((a) => a.checkId === check.id)
    .sort((a, b) => b.id - a.id)[0];

  gate("Remediation action persisted", Boolean(latestAction), JSON.stringify(latestAction));
  gate("Remediation action is reversible", Boolean(latestAction?.reversible));

  if (latestAction) {
    const reverted = await revertRemediation(latestAction.id, "verify-script");
    gate("Remediation action reverted successfully", reverted.status === "reverted", `status=${reverted.status}`);
  }

  const audit = await verifyAuditChain();
  gate("Audit chain still intact after remediation + revert", audit.ok, JSON.stringify(audit));
}

async function gate3_nightlyReport() {
  console.log("\n--- Gate 3: Nightly report with mandatory blind-spot appendix ---");
  const reportDate = new Date().toISOString().slice(0, 10);
  const content = await buildNightlyReportContent(reportDate);
  const lintProblems = lintReportForFiller(content);
  gate("Zero-filler lint passes on generated content", lintProblems.length === 0, lintProblems.join("; "));
  gate(
    "Blind-spot appendix present and non-empty",
    content.blindSpotAppendix.perCheck.length > 0 && content.blindSpotAppendix.systemLevel.length > 0,
    `perCheck=${content.blindSpotAppendix.perCheck.length} systemLevel=${content.blindSpotAppendix.systemLevel.length}`,
  );
  const report = await generateNightlyReport(reportDate);
  gate("Report persisted (versioned)", report.version >= 1, `version=${report.version}`);
}

async function gate4_featureDegrade() {
  console.log("\n--- Gate 4: Feature-degrade on drift + visible notice + restore ---");
  const check = CHECK_REGISTRY.find((c) => c.id === "fairness-parity-decay")!;
  await seedFairnessHistory(30, 20); // force a breach

  const cycleKey = `verify-degrade-${Date.now()}`;
  const outcome = await runCheckForCycle(check, cycleKey);
  gate("Seeded fairness breach detected", outcome.status === "breach", `status=${outcome.status}`);
  gate(
    "Remediation tier applied is degrade",
    outcome.remediation?.tier === "degrade",
    `tier=${outcome.remediation?.tier} status=${outcome.remediation?.status}`,
  );

  const flag = await getFlag(check.featureFlagKey!);
  gate("Feature flag is now degraded with a reason (visible notice)", Boolean(flag?.degraded && flag.degradedReason));

  const { restoreFlag } = await import("@/lib/featureFlags");
  const restored = await restoreFlag(check.featureFlagKey!, "verify-script");
  gate("Feature flag restore path works", restored.enabled === true && restored.degraded === false);

  void FAIRNESS_DPD_KEY;
  void FAIRNESS_EOD_KEY;
}

async function gate5_registryCompleteness() {
  console.log("\n--- Gate 5: Registry completeness (coverage table) ---");
  gate("Every check has non-empty blindSpots", VALIDATED_REGISTRY.length === CHECK_REGISTRY.length);

  const coverage = assertCoverage();
  console.log("\n  Coverage table:");
  console.log("  | metric | related part | monitored by check | blind-spot note |");
  for (const entry of coverage.entries) {
    console.log(
      `  | ${entry.metricKey} | ${entry.relatedPart} | ${entry.monitoredByCheckId ?? "—"} | ${
        entry.blindSpotIfUnmonitored ? "yes (authored)" : "—"
      } |`,
    );
  }
  gate(
    "Every declared metric has a monitoring check OR an explicit blind-spot note",
    coverage.ok,
    coverage.gaps.map((g) => g.metricKey).join(", "),
  );
}

async function cleanupHarnessData() {
  await db.delete(metricObservations).where(like(metricObservations.metricKey, "harness.%"));
}

async function main() {
  console.log("=== LEADOS Part 38 — npm run verify ===");
  await fullBootstrap();

  await gate1_driftInjection();
  await gate2_autoRemediation();
  await gate3_nightlyReport();
  await gate4_featureDegrade();
  await gate5_registryCompleteness();

  await cleanupHarnessData();

  console.log(`\n=== Summary: ${failures === 0 ? "ALL GATES PASSED" : `${failures} GATE(S) FAILED`} ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
