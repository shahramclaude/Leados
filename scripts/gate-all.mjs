// npm run gate:all — the fast-tier quality gate for the whole product.
//
// Fast tier (this script, target < 20 min, typically < 2 min locally):
//   lint -> typecheck -> unit tests (all 6 seams) -> ledger:check
//
// Slow tier (not run here; run before any release/deploy):
//   npx next typegen && npm exec tsc -- --noEmit && npm run build && build_and_start
//
// Keeping build/typegen out of the fast tier is a deliberate, documented
// tradeoff (see docs/VERIFICATION-LOG.md) — they are slower and are already
// mandated as separate final-validation steps.
import { spawnSync } from "node:child_process";

const steps = [
  { name: "lint", cmd: "npm", args: ["run", "lint", "--silent"] },
  { name: "typecheck", cmd: "npm", args: ["run", "typecheck", "--silent"] },
  { name: "test", cmd: "npm", args: ["run", "test", "--silent"] },
  { name: "ledger:check", cmd: "npm", args: ["run", "ledger:check", "--silent"] },
];

const results = [];
const start = Date.now();

for (const step of steps) {
  const stepStart = Date.now();
  const result = spawnSync(step.cmd, step.args, { stdio: "inherit", shell: false });
  const durationMs = Date.now() - stepStart;
  results.push({ name: step.name, ok: result.status === 0, durationMs });
  if (result.status !== 0) break;
}

console.log("\n=== gate:all summary (fast tier) ===");
for (const r of results) {
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(14)} ${r.durationMs}ms`);
}
const totalMs = Date.now() - start;
console.log(`Total: ${totalMs}ms`);

const allRan = results.length === steps.length;
const allPassed = results.every((r) => r.ok);

if (!allRan || !allPassed) {
  console.error("\ngate:all FAILED");
  process.exit(1);
}
console.log("\ngate:all PASSED");
