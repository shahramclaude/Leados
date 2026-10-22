// `npm run verify` — the single command referenced throughout the Part 42
// standing order. Runs typecheck, lint, and the conversational/meeting-
// copilot eval slice (which itself asserts the Phase 4 gates) and exits
// non-zero if any step fails.
import { execSync } from "node:child_process";

function run(label: string, cmd: string) {
  console.log(`\n--- ${label} ---`);
  try {
    execSync(cmd, { stdio: "inherit" });
    console.log(`✓ ${label} passed`);
  } catch {
    console.error(`✗ ${label} failed`);
    process.exit(1);
  }
}

run("typecheck", "npx tsc --noEmit");
run("lint", "npx eslint .");
run("conversational + meeting-copilot eval slice", "npx tsx scripts/eval-llm.ts");

console.log("\nAll verification steps passed.");
