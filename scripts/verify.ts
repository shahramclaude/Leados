// LEADOS — Part 45 verification entrypoint (`npm run verify`).
//
// Order matters: the integration test needs the demo org seeded first.
import "dotenv/config";
import { spawnSync } from "node:child_process";

function run(cmd: string, args: string[], label: string): boolean {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    console.error(`\n✗ ${label} FAILED (exit code ${result.status})`);
    return false;
  }
  console.log(`✓ ${label} passed`);
  return true;
}

async function main() {
  let ok = true;

  ok = run("npx", ["tsx", "scripts/seed-time-economics.ts"], "Seed demo org (fixtures for integration tests)") && ok;

  ok =
    run(
      "npx",
      [
        "tsx",
        "--test",
        "src/lib/time-economics/__tests__/meetingCost.test.ts",
        "src/lib/time-economics/__tests__/privacyMatrix.test.ts",
        "src/lib/time-economics/__tests__/optimizer.test.ts",
        "src/lib/time-economics/__tests__/attentionModels.test.ts",
        "src/lib/time-economics/__tests__/classificationUncertaintyLint.test.ts",
        "src/lib/time-economics/__tests__/outcomeDensityIntegration.test.ts",
      ],
      "Time-Economics test suite (cost fixtures, privacy matrix, optimizer feasibility, attention models, classification lint, outcome-density integration)",
    ) && ok;

  if (!ok) {
    console.error("\nnpm run verify: FAILED");
    process.exit(1);
  }
  console.log("\nnpm run verify: all checks passed.");
}

main();
