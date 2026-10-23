// `npm run verify` — orchestrates a full re-seed plus every Phase 4 gate for
// Part 43's development & coaching surfaces.
import "./_env";
import { seedAll } from "./seedData";
import { run as runDevGraph } from "./test-dev-graph";
import { run as runConfidentiality } from "./test-confidentiality";
import { run as runCoachingEval } from "./test-coaching-eval";
import { run as runSymmetry } from "./test-symmetry";
import { run as runFairness } from "./test-fairness";

async function main() {
  console.log("### LEADOS Part 43 verification run ###\n");
  console.log("--- Seeding deterministic fixture data ---");
  await seedAll();

  const gates: Array<[string, () => Promise<boolean>]> = [
    ["dev-graph (growth-path citation)", runDevGraph],
    ["confidentiality (feedback attribution attempts)", runConfidentiality],
    ["coaching-eval (GROW rubric)", runCoachingEval],
    ["symmetry (manager/person parity)", runSymmetry],
    ["fairness (coaching + feedback audits)", runFairness],
  ];

  const results: Array<{ name: string; ok: boolean }> = [];
  for (const [name, fn] of gates) {
    console.log(`\n----------------------------------------------------`);
    const ok = await fn();
    results.push({ name, ok });
  }

  console.log(`\n### Summary ###`);
  let allOk = true;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.name}`);
    if (!r.ok) allOk = false;
  }

  if (!allOk) {
    console.error("\nverify: FAILED");
    process.exit(1);
  }
  console.log("\nverify: ALL GATES PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
