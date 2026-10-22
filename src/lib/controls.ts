// src/lib/controls.ts
//
// Control library (typed preventive/detective/corrective, manual/automated)
// plus the "Part 10" test-execution hook. Part 10 (an automated test-runner
// service) is not present in this sandbox; we implement a documented stand-in
// `runProcedure()` registry keyed by `testProcedureKey` so that swapping in
// the real Part 10 runner later is a one-line change in `executeControlTest`.
//
// Automated procedures here execute against REAL evidence already in the
// hash-chained audit log (src/lib/audit.ts) — e.g. "access review completed
// quarterly" is verified by checking that an `attestation` or
// `control_test` category event exists in the relevant window, NOT by
// trusting a free-text claim. Manual procedures require a human-entered
// result plus an evidence note, which is itself written to the chain.

import { db } from "@/db";
import { controls, riskControls, controlTests } from "@/db/schema";
import { eq, and, gte, lte, isNull } from "drizzle-orm";
import { appendAuditEvent, getEntityEvidence } from "./audit";
import { updateBeta, type BetaBelief } from "./beta";

export type ControlType = "preventive" | "detective" | "corrective";
export type ControlMechanism = "manual" | "automated";

export interface ControlDefinition {
  code: string;
  name: string;
  description: string;
  type: ControlType;
  mechanism: ControlMechanism;
  testProcedure: string;
  testProcedureKey: string;
  cadenceDays: number;
  owner: string;
}

export async function createControl(def: ControlDefinition) {
  const [row] = await db.insert(controls).values(def).returning();
  return row;
}

export async function listControls() {
  return db.select().from(controls);
}

// ---------------------------------------------------------------------------
// Automated test-procedure registry (the "Part 10" execution surface)
// ---------------------------------------------------------------------------

export interface ProcedureContext {
  riskControlId: number;
  controlCode: string;
  windowStart: Date;
  windowEnd: Date;
}

export interface ProcedureOutcome {
  result: "pass" | "fail";
  detail: string;
}

type Procedure = (ctx: ProcedureContext) => Promise<ProcedureOutcome>;

/**
 * "access_review_quarterly": passes only if an audit-chain event exists in the
 * category 'control_test' or 'attestation' for this riskControlId within the window.
 * This is the concrete implementation of the spec example:
 * "access review completed quarterly — verify from the audit chain".
 */
const accessReviewQuarterly: Procedure = async (ctx) => {
  const events = await getEntityEvidence("risk_control", String(ctx.riskControlId));
  const inWindow = events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return (
      (e.category === "control_test" || e.category === "attestation") &&
      e.action === "access_review_completed" &&
      t >= ctx.windowStart.getTime() &&
      t <= ctx.windowEnd.getTime()
    );
  });
  return inWindow.length > 0
    ? { result: "pass", detail: `Found ${inWindow.length} access-review evidence event(s) in window.` }
    : { result: "fail", detail: "No access-review evidence event found in the test window." };
};

/** "backup_restore_test": pass if a successful restore-test evidence event exists in window. */
const backupRestoreTest: Procedure = async (ctx) => {
  const events = await getEntityEvidence("risk_control", String(ctx.riskControlId));
  const inWindow = events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return (
      e.category === "control_test" &&
      e.action === "restore_test_succeeded" &&
      t >= ctx.windowStart.getTime() &&
      t <= ctx.windowEnd.getTime()
    );
  });
  return inWindow.length > 0
    ? { result: "pass", detail: `Found ${inWindow.length} successful restore-test event(s).` }
    : { result: "fail", detail: "No successful restore-test evidence found in the test window." };
};

/** Generic fallback: manual attestation-only procedure (requires the caller to supply a result). */
const manualAttestation: Procedure = async () => ({
  result: "fail",
  detail: "Manual procedure requires a human-supplied result; none was provided to the automated runner.",
});

const PROCEDURE_REGISTRY: Record<string, Procedure> = {
  access_review_quarterly: accessReviewQuarterly,
  backup_restore_test: backupRestoreTest,
  manual_attestation: manualAttestation,
};

export interface ControlTestRunResult {
  controlTestId: number;
  result: "pass" | "fail";
  detail: string;
  evidenceAuditEventId: number;
  updatedEffectiveness: BetaBelief;
}

/**
 * Execute (or record a manual result for) a scheduled control test:
 *   1. Run the test procedure (automated) or accept the supplied manual result.
 *   2. Append an immutable evidence event to the hash chain.
 *   3. Update the control's effectiveness Beta belief (conjugate update).
 *   4. Persist the control_tests row + bump riskControls.lastTestedAt/nextTestDueAt.
 */
export async function executeControlTest(params: {
  controlTestId: number;
  actor: string;
  manualResult?: "pass" | "fail";
  manualNote?: string;
}): Promise<ControlTestRunResult> {
  const [test] = await db.select().from(controlTests).where(eq(controlTests.id, params.controlTestId));
  if (!test) throw new Error(`control test ${params.controlTestId} not found`);

  const [rc] = await db.select().from(riskControls).where(eq(riskControls.id, test.riskControlId));
  if (!rc) throw new Error(`risk_control ${test.riskControlId} not found`);

  const [ctrl] = await db.select().from(controls).where(eq(controls.id, rc.controlId));
  if (!ctrl) throw new Error(`control ${rc.controlId} not found`);

  let outcome: ProcedureOutcome;
  if (ctrl.mechanism === "automated") {
    const windowStart = new Date(new Date(test.scheduledFor).getTime() - ctrl.cadenceDays * 86400000);
    const proc = PROCEDURE_REGISTRY[ctrl.testProcedureKey] ?? manualAttestation;
    outcome = await proc({
      riskControlId: rc.id,
      controlCode: ctrl.code,
      windowStart,
      windowEnd: new Date(test.scheduledFor),
    });
  } else {
    if (!params.manualResult) {
      throw new Error("manual control test requires manualResult");
    }
    outcome = { result: params.manualResult, detail: params.manualNote ?? "Manually attested result." };
  }

  const evidence = await appendAuditEvent({
    category: "control_test",
    entityType: "control_test",
    entityId: String(test.id),
    action: outcome.result === "pass" ? "control_test_passed" : "control_test_failed",
    payload: { controlCode: ctrl.code, riskControlId: rc.id, detail: outcome.detail },
    actor: params.actor,
  });

  const updatedBelief = updateBeta(rc.effectiveness, outcome.result);
  const now = new Date();
  const nextDue = new Date(now.getTime() + ctrl.cadenceDays * 86400000);

  await db
    .update(controlTests)
    .set({
      executedAt: now.toISOString(),
      result: outcome.result,
      findings: outcome.detail,
      evidenceAuditEventId: evidence.id,
      overdue: false,
    })
    .where(eq(controlTests.id, test.id));

  await db
    .update(riskControls)
    .set({ effectiveness: updatedBelief, lastTestedAt: now.toISOString(), nextTestDueAt: nextDue.toISOString() })
    .where(eq(riskControls.id, rc.id));

  return {
    controlTestId: test.id,
    result: outcome.result,
    detail: outcome.detail,
    evidenceAuditEventId: evidence.id,
    updatedEffectiveness: updatedBelief,
  };
}

/** Schedule the next test for a risk-control pairing (idempotent-ish: creates a new row each call). */
export async function scheduleControlTest(riskControlId: number, scheduledFor: Date) {
  const [row] = await db
    .insert(controlTests)
    .values({ riskControlId, scheduledFor: scheduledFor.toISOString() })
    .returning();
  return row;
}

/** Mark any control test whose scheduledFor has passed without execution as overdue, and return them. */
export async function detectOverdueControlTests(now = new Date()) {
  const rows = await db
    .select()
    .from(controlTests)
    .where(and(lte(controlTests.scheduledFor, now.toISOString()), isNull(controlTests.executedAt)));
  const newlyOverdue = rows.filter((r) => !r.overdue);
  for (const r of newlyOverdue) {
    await db.update(controlTests).set({ overdue: true }).where(eq(controlTests.id, r.id));
  }
  return newlyOverdue;
}

export async function controlTestsDueBetween(start: Date, end: Date) {
  return db
    .select()
    .from(controlTests)
    .where(and(gte(controlTests.scheduledFor, start.toISOString()), lte(controlTests.scheduledFor, end.toISOString())));
}
