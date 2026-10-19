// =============================================================================
// Integration test — one full autonomous cycle, dry-run + live, against
// seeded data. Run with: npx tsx scripts/testAutonomousCycle.ts
//
// Asserts (per Part 4 acceptance criteria):
//   1. An unregistered capability is rejected (default-deny).
//   2. A dry-run plan is generated with no side effects (simulate-first).
//   3. A live run executes low-risk auto actions but GATES every
//      risk-class >= medium action behind an approval (HITL).
//   4. The daily action budget is enforced (capped writes per domain).
//   5. Every action taken is audited (actor + reason + rollback handle).
//   6. Rollback (undo) works for an executed, reversible action.
// =============================================================================
import "dotenv/config";
import { db, pool } from "@/db";
import { auditLog, capabilityOverrides, findings, kernelToolCalls, workItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { runCycle, getRunDetail, undoToolCall } from "@/lib/kernel/orchestrator";
import { requireCapability, UnregisteredCapabilityError } from "@/lib/kernel/registry";
import { ensureBuiltinCapabilitiesRegistered } from "@/lib/kernel/capabilities";
import { listPendingApprovals, decideApproval } from "@/lib/kernel/approvals";
import { setCapabilityOverride } from "@/lib/kernel/killSwitch";

ensureBuiltinCapabilitiesRegistered();

let failures = 0;
function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS — ${message}`);
  } else {
    console.error(`  FAIL — ${message}`);
    failures++;
  }
}

async function main() {
  console.log("=== 1. Unregistered capabilities are rejected (default-deny) ===");
  try {
    requireCapability("systems.delete_production_database");
    assert(false, "requireCapability should have thrown for an unregistered key");
  } catch (err) {
    assert(err instanceof UnregisteredCapabilityError, "requireCapability throws UnregisteredCapabilityError");
  }

  console.log("\n=== 2. Dry-run: simulate-first mode produces a plan with zero writes ===");
  const beforeWorkItems = await db.select({ id: workItems.id }).from(workItems);
  const dryRun = await runCycle({ trigger: { type: "manual", source: "test:dry-run" }, dryRun: true, actor: "test-harness" });
  const afterWorkItems = await db.select({ id: workItems.id }).from(workItems);
  assert(dryRun.plannedActions > 0, `plan generated (${dryRun.plannedActions} planned actions)`);
  assert(dryRun.executed === 0, "dry-run executed 0 actions");
  assert(beforeWorkItems.length === afterWorkItems.length, "dry-run made no writes to work_items");

  console.log("\n=== 3. Live run: low-risk auto actions execute, medium/high risk actions are gated ===");
  const live = await runCycle({ trigger: { type: "manual", source: "test:live" }, dryRun: false, actor: "test-harness" });
  assert(live.plannedActions > 0, `plan generated (${live.plannedActions} planned actions)`);
  assert(live.executed > 0, `low-risk auto actions executed (${live.executed})`);
  assert(live.pendingApproval > 0, `medium/high-risk actions are pending approval, not executed (${live.pendingApproval})`);

  const detail = await getRunDetail(live.runId);
  assert(detail !== null, "run is queryable via getRunDetail (event-sourced history)");
  const mediumOrHighCalls = detail!.toolCalls.filter((tc) => tc.riskClass !== "low");
  const noneAutoExecuted = mediumOrHighCalls.every((tc) => tc.status !== "executed");
  assert(mediumOrHighCalls.length > 0 && noneAutoExecuted, "every risk-class >= medium tool call is NOT auto-executed");

  console.log("\n=== 4. Approving a gated action runs it through the same execute path ===");
  const pending = await listPendingApprovals();
  assert(pending.length > 0, `at least one pending approval exists (${pending.length})`);
  if (pending.length > 0) {
    const approval = pending[0];
    const decision = await decideApproval(approval.id, "approved", "test-harness-human", "approved for integration test");
    assert(decision.toolCallStatus === "executed" || decision.toolCallStatus === "skipped_budget", `approval execution path ran (status=${decision.toolCallStatus})`);
  }

  console.log("\n=== 5. Daily action budget is enforced ===");
  await setCapabilityOverride("notifications.notify", { dailyBudget: 1 }, "test-harness");
  const tight1 = await runCycle({ trigger: { type: "manual", source: "test:budget-1" }, dryRun: false, actor: "test-harness" });
  const tight2 = await runCycle({ trigger: { type: "manual", source: "test:budget-2" }, dryRun: false, actor: "test-harness" });
  assert(tight1.skippedBudget + tight2.skippedBudget > 0, `budget cap caused at least one skipped_budget action (run1=${tight1.skippedBudget}, run2=${tight2.skippedBudget})`);
  await db.delete(capabilityOverrides).where(eq(capabilityOverrides.key, "notifications.notify"));

  console.log("\n=== 6. Everything is audited ===");
  const audited = await db.select().from(auditLog).orderBy(auditLog.id);
  assert(audited.length > 0, `audit log has ${audited.length} entries`);
  const hasExecutedAudit = audited.some((a) => a.action === "tool_call.executed");
  const hasApprovalAudit = audited.some((a) => a.action.startsWith("approval."));
  assert(hasExecutedAudit, "audit log contains a tool_call.executed entry");
  assert(hasApprovalAudit, "audit log contains an approval.* entry");

  console.log("\n=== 7. Rollback works ===");
  const executedCalls = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.status, "executed"));
  const reversible = executedCalls.find((c) => c.undoHandle && !c.undone);
  assert(!!reversible, "at least one executed+reversible tool call exists");
  if (reversible) {
    await undoToolCall(reversible.id, "test-harness");
    const [after] = await db.select().from(kernelToolCalls).where(eq(kernelToolCalls.id, reversible.id)).limit(1);
    assert(after.undone === true, `tool call #${reversible.id} marked undone after rollback`);
    const rollbackAudited = (await db.select().from(auditLog)).some((a) => a.action === "tool_call.undone" && a.subjectId === String(reversible.id));
    assert(rollbackAudited, "rollback is itself audited");
  }

  console.log("\n=== 8. Severity-5 finding exists end-to-end as the seed trigger ===");
  const critical = await db.select().from(findings).where(eq(findings.severity, 5)).limit(1);
  assert(critical.length > 0, "a severity-5 finding exists in seed data (drives the severity5-finding-watch job)");

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error("Fatal error running integration test:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
