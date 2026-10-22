/**
 * Standalone fairness scan (Part 09's `test:fairness`, extended for change
 * metrics — Phase 3e). Run with: npx tsx scripts/fairness-scan.ts
 *
 * Scans:
 *  1. Every live group-readiness payload for k-anonymity disclosure risk.
 *  2. The actual input keys used by the readiness computation for any
 *     protected-attribute-shaped field.
 */
import { seedDatabase } from "../src/lib/change/repository";
import { getAllGroupReadiness } from "../src/lib/change/dashboard";
import { scanGroupPayloadsForDisclosureRisk, scanComputationInputKeys } from "../src/lib/change/fairnessScan";
import { readinessScore } from "../src/lib/change/readiness";

async function main() {
  await seedDatabase(new Date("2026-02-01"));
  const views = await getAllGroupReadiness(new Date("2026-02-01"));

  const payloads = views.map((v) => ({
    groupId: v.groupId,
    groupSize: v.readiness.ok ? v.readiness.groupSize : v.readiness.groupSize,
    suppressed: !v.readiness.ok,
    readiness: v.readiness.ok ? v.readiness.value.value : undefined,
  }));

  const disclosureFindings = scanGroupPayloadsForDisclosureRisk(payloads);

  const sampleScore = readinessScore({ trainingCompletionRate: 0.6, capacityHeadroom: 0.4, priorChangeLoad: 1 });
  const inputKeyFindings = scanComputationInputKeys(sampleScore.inputs);

  console.log("\nFairness scan — change metrics\n================================");
  console.log(`Groups scanned: ${payloads.length}`);
  for (const p of payloads) {
    console.log(`  - ${p.groupId}: groupSize=${p.groupSize} suppressed=${p.suppressed} readiness=${p.readiness ?? "n/a"}`);
  }

  console.log(`\nDisclosure-risk findings: ${disclosureFindings.length}`);
  disclosureFindings.forEach((f) => console.log(`  [${f.severity}] ${f.title}`));

  console.log(`\nProtected-attribute-input findings: ${inputKeyFindings.length}`);
  inputKeyFindings.forEach((f) => console.log(`  [${f.severity}] ${f.title}`));

  const allPass = disclosureFindings.length === 0 && inputKeyFindings.length === 0;
  console.log(`\nOverall: ${allPass ? "PASS" : "FAIL"}`);
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
