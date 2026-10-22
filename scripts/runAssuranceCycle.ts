// LEADOS — Part 38: `npm run assurance:run`
// Runs one full, idempotent, budgeted nightly assurance cycle directly
// (without going through the HTTP API) — useful for CI/cron invocation on
// Part 10's scheduler.

import "dotenv/config";
import { fullBootstrap } from "@/lib/assurance/sync";
import { runAllChecks } from "@/lib/assurance/runner";
import { claimCycle, completeCycle, dailyCycleKey, failCycle } from "@/lib/scheduler";
import { generateNightlyReport } from "@/lib/assurance/report";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";

async function main() {
  console.log("=== LEADOS Part 38 — Nightly Assurance Cycle ===\n");
  await fullBootstrap();

  const cycleKey = process.argv[2] ?? dailyCycleKey();
  const budget = CHECK_REGISTRY.length;

  const claim = await claimCycle("assurance:nightly", cycleKey, budget);
  if (!claim.claimed) {
    console.log(`Cycle '${cycleKey}' already ${claim.reason} — idempotent no-op (job id ${claim.jobId}).`);
    return;
  }

  try {
    const outcomes = await runAllChecks(cycleKey, budget);
    for (const outcome of outcomes) {
      console.log(
        `  ${outcome.checkId}: ${outcome.status}${outcome.remediation ? ` -> remediation: ${outcome.remediation.tier} (${outcome.remediation.status})` : ""}`,
      );
    }
    const report = await generateNightlyReport(cycleKey);
    await completeCycle(claim.jobId!, outcomes.length, { outcomes: outcomes.length, reportId: report.id });
    console.log(`\nCycle complete. Nightly report v${report.version} generated for ${cycleKey} (report id ${report.id}).`);
  } catch (err) {
    await failCycle(claim.jobId!, 0, { error: err instanceof Error ? err.message : String(err) });
    console.error("Cycle failed:", err);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
