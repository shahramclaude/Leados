// LEADOS — Part 56: conformity export test (Phase 4 gate 4).
// Confirms the exporter produces a schema-valid, non-empty, honestly-scoped
// bundle for every supported frame, and that known seeded gaps (the FAILING
// monitoring check and FAILING fairness report) show up in bundle.gaps
// rather than being smoothed over.
import "./lib/loadEnv";
import { pool } from "../src/db";
import { seedDatabase } from "../src/lib/accountability/seed";
import { buildConformityBundle, validateConformityBundle, SUPPORTED_FRAMES } from "../src/lib/accountability/conformity";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

async function main() {
  console.log("=== Test: conformity evidence export ===");
  await seedDatabase();

  for (const frame of SUPPORTED_FRAMES) {
    console.log(`\n--- Frame: ${frame} ---`);
    const bundle = await buildConformityBundle(frame);
    const validation = validateConformityBundle(bundle);
    check(`${frame}: bundle is schema-valid`, validation.success);
    check(`${frame}: scope statement is present and non-trivial`, bundle.scope.statement.length > 20);
    check(`${frame}: notCertified list is non-empty (no unscoped compliance claim)`, bundle.scope.notCertified.length > 0);
    check(`${frame}: registry includes all 5 seeded systems`, bundle.registry.length === 5);
    check(`${frame}: every registry row has tier-consistency info`, bundle.registry.every((r) => "ok" in r.tierConsistency));
    check(
      `${frame}: gaps include the known-failing performance predictor accuracy check`,
      bundle.gaps.some((g) => g.includes("mon-perf-accuracy-01")),
    );
    check(
      `${frame}: gaps include the known-failing fraud-flagger fairness report`,
      bundle.gaps.some((g) => g.toLowerCase().includes("fairness report") && g.includes("fraud-anomaly-flagger-v1")),
    );
    check(
      `${frame}: audit chain is reported valid for every system`,
      bundle.auditChain.every((a) => a.valid),
    );
  }

  console.log(`\n=== Conformity export test: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test crashed:", err);
  await pool.end();
  process.exit(1);
});
