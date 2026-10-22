// Triggers a full, idempotent, budgeted nightly (or weekly) cycle: sync
// registry -> ensure demo history -> run all checks for the cycle key ->
// generate the nightly report. Safe to call multiple times for the same
// cycle; later calls are no-ops thanks to scheduler.claimCycle().

import { fullBootstrap } from "@/lib/assurance/sync";
import { runAllChecks } from "@/lib/assurance/runner";
import { claimCycle, completeCycle, dailyCycleKey, failCycle } from "@/lib/scheduler";
import { generateNightlyReport } from "@/lib/assurance/report";
import { CHECK_REGISTRY } from "@/lib/assurance/registry";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cycleKey: string = body.cycleKey ?? dailyCycleKey();
  const budget: number = body.budget ?? CHECK_REGISTRY.length;

  await fullBootstrap();

  const claim = await claimCycle("assurance:nightly", cycleKey, budget);
  if (!claim.claimed) {
    return Response.json({ cycleKey, claimed: false, reason: claim.reason });
  }

  try {
    const outcomes = await runAllChecks(cycleKey, budget);
    const report = await generateNightlyReport(cycleKey);
    await completeCycle(claim.jobId!, outcomes.length, { outcomes: outcomes.length, reportId: report.id });
    return Response.json({ cycleKey, claimed: true, outcomes, reportId: report.id, reportVersion: report.version });
  } catch (err) {
    await failCycle(claim.jobId!, 0, { error: err instanceof Error ? err.message : String(err) });
    return Response.json(
      { cycleKey, claimed: true, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
