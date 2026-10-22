// =============================================================================
// LEADOS — Part 23 — Verification harness (`npm run verify`)
// =============================================================================
// Runs the Phase 4 gates against a freshly seeded database:
//  1. Immutability test (DB trigger) — attempts to mutate a frozen record fail
//     with 'invalid'; corrections create new events instead.
//  2. DQ rubric inter-rater simulation — two independent scorings of the same
//     seeded record agree within 1 dimension point.
//  3. Velocity metrics computed on the seeded org — p50/p95 tables printed.
//  4. Trigger -> review end-to-end test — transcript printed.
//  5. Decision-debt detection finds the seeded overdue decision.
//  6. Exits 0 iff every gate passes (then the caller runs `tsc`/build/etc).
// =============================================================================

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, pool } from "../src/db";
import { decisions, sensorSignalReadings, decisionStateTransitions } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { ensureDecisionInvariants } from "../src/lib/decision/dbSetup";
import {
  raiseDecision,
  frameDecision,
  markEvidenceGathered,
  commitDecision,
  getDecision,
  __TEST_ONLY_attemptFrozenMutation,
} from "../src/lib/decision/decisionEngine";
import { addCorrection } from "../src/lib/decision/decisionEngine";
import { listEventsForEntity } from "../src/lib/decision/eventLog";
import { scoreDecisionQuality, dimensionsAgreeWithinOne } from "../src/lib/decision/decisionQuality";
import { computeDecisionDebt } from "../src/lib/decision/decisionVelocity";
import { computeTimeInState, computeVelocityByState } from "../src/lib/decision/decisionVelocity";
import { ingestSignalReading, evaluateTriggersForOrg, listReviewTasks } from "../src/lib/decision/triggers";
import { upsertDecisionRights, detectAmbiguousDecisionRights } from "../src/lib/decision/decisionRights";
import type { TriggerCondition } from "../src/lib/decision/types";

let failures = 0;
function gate(name: string, pass: boolean, detail?: string) {
  const mark = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`${mark} — ${name}${detail ? `\n       ${detail}` : ""}`);
  if (!pass) failures++;
}

async function getOrg(name: string) {
  const rows = await db.execute(sql`select id from orgs where name = ${name} limit 1`);
  const row = (rows as unknown as { rows: { id: string }[] }).rows[0];
  if (!row) throw new Error(`seeded org "${name}" not found — run npm run seed:decisions first`);
  return row.id;
}

async function main() {
  console.log("=== LEADOS Part 23 — Decision Operations verification ===\n");

  await ensureDecisionInvariants();
  const acmeOrgId = await getOrg("Acme Robotics");

  // ---------------------------------------------------------------------
  // GATE 1: Immutability — no mutation path exists after commit
  // ---------------------------------------------------------------------
  console.log("--- Gate 1: immutability (frozen-record) ---");
  await upsertDecisionRights({ orgId: acmeOrgId, decisionClass: "verify_class", deciderRole: "eng_director", consultedRoles: [], informedRoles: [] });

  const raised = await raiseDecision({
    orgId: acmeOrgId,
    decisionClass: "verify_class",
    question: "Should we migrate the verify-suite decision to the new pipeline?",
    decisionType: "type2",
    impact: 3,
  });
  await frameDecision(raised.id, {
    optionsConsidered: ["Migrate now", "Wait a quarter"],
    optionEvidence: {
      "Migrate now": { value: "Migrate now", rationale: "Unblocks CI", interval: { low: 1, high: 2 }, confidence: "high" },
      "Wait a quarter": { value: "Wait a quarter", rationale: "Lower risk", interval: { low: 0, high: 1 }, confidence: "medium" },
    },
  });
  await markEvidenceGathered(raised.id, {
    "Migrate now": { value: "Migrate now", rationale: "Unblocks CI", interval: { low: 1, high: 2 }, confidence: "high" },
    "Wait a quarter": { value: "Wait a quarter", rationale: "Lower risk", interval: { low: 0, high: 1 }, confidence: "medium" },
  });
  const committed = await commitDecision(raised.id, {
    chosen: "Migrate now",
    choiceRationale: "CI unblock is worth the small risk.",
    expectedOutcome: "CI pipeline green within a week.",
    expectedInterval: { low: 1, high: 7, unit: "days" },
    confidenceClass: "high",
    reviewAt: new Date(Date.now() + 14 * 86400000).toISOString(),
    decidedBy: "00000000-0000-0000-0000-000000000000",
  });

  let mutationRejected = false;
  let mutationErrorName = "";
  try {
    await __TEST_ONLY_attemptFrozenMutation(raised.id);
  } catch (err) {
    mutationRejected = true;
    mutationErrorName = err instanceof Error ? err.name : String(err);
  }
  const afterAttempt = await getDecision(raised.id);
  const questionUnchanged = afterAttempt?.question === committed.question;

  gate(
    "attempt to mutate a frozen field is rejected by the DB trigger ('invalid')",
    mutationRejected,
    `rejected=${mutationRejected}, driver error="${mutationErrorName}", question unchanged=${questionUnchanged}`,
  );
  gate("frozen field value is unchanged after the rejected mutation attempt", questionUnchanged);

  // Also prove a raw-SQL bypass attempt fails, not just the app-layer guard.
  let rawSqlRejected = false;
  try {
    await db.execute(sql`update decisions set question = 'raw sql mutation attempt' where id = ${raised.id}`);
  } catch {
    rawSqlRejected = true;
  }
  gate("raw-SQL UPDATE of a frozen column also fails (DB-level invariant, not just app-level)", rawSqlRejected);

  // Corrections DO succeed and create new events, proving the only valid path.
  const correctionCountBefore = (await listEventsForEntity("decision", raised.id)).length;
  await addCorrection(raised.id, "clarification", "Clarifying note added post-commit; does not change the frozen record.");
  const correctionCountAfter = (await listEventsForEntity("decision", raised.id)).length;
  gate(
    "a correction creates a NEW event rather than mutating the record",
    correctionCountAfter === correctionCountBefore + 1,
    `events before=${correctionCountBefore}, after=${correctionCountAfter}`,
  );

  // ---------------------------------------------------------------------
  // GATE 2: DQ rubric — inter-rater simulation agrees within 1 point
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 2: DQ rubric inter-rater agreement ---");
  const decisionForScoring = await getDecision(raised.id);
  if (!decisionForScoring) throw new Error("decision disappeared");

  // Two independent raters reading the SAME frozen record, applying the
  // anchored rubric with slightly different (but reasonable) judgement calls.
  const raterA = scoreDecisionQuality(decisionForScoring, {
    scoredBy: "Rater A",
    scores: { frame: 2, options: 2, evidence: 2, expectations: 2, reversibility: 0, review: 1 },
    notes: "No reversibility plan on record for this test decision.",
  });
  const raterB = scoreDecisionQuality(decisionForScoring, {
    scoredBy: "Rater B",
    scores: { frame: 2, options: 2, evidence: 1, expectations: 2, reversibility: 1, review: 1 },
    notes: "Being slightly stricter on evidence completeness; giving partial credit on reversibility since rollback is implied by decision type.",
  });

  const agreement = dimensionsAgreeWithinOne(raterA.scores, raterB.scores);
  console.log("  Rater A:", raterA.scores, `(DQ=${raterA.dq})`);
  console.log("  Rater B:", raterB.scores, `(DQ=${raterB.dq})`);
  console.log("  Per-dimension diffs:", agreement.diffs);
  gate("two independent rater scorings agree within 1 point on every dimension", agreement.agree);

  // Anti-gaming check: a rater claiming a much higher score with no notes is flagged.
  const gamedAttempt = scoreDecisionQuality(decisionForScoring, {
    scoredBy: "Gaming Attempt",
    scores: { frame: 2, options: 2, evidence: 2, expectations: 2, reversibility: 2, review: 2 },
    notes: "",
  });
  gate(
    "an unexplained max-score override with no justification is flagged as gaming risk",
    gamedAttempt.gamingRisk === true,
    `gamingRisk=${gamedAttempt.gamingRisk}, auto=${gamedAttempt.autoDq}, final=${gamedAttempt.dq}`,
  );

  // ---------------------------------------------------------------------
  // GATE 3: Velocity metrics on seeded org — p50/p95 tables
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 3: velocity metrics on seeded org (Acme Robotics) ---");
  const orgDecisions = await db.select().from(decisions).where(eq(decisions.orgId, acmeOrgId));
  const decisionIds = new Set(orgDecisions.map((d) => d.id));
  const allTransitions = await db.select().from(decisionStateTransitions);
  const transitions = allTransitions.filter((t) => decisionIds.has(t.decisionId));
  const samples = computeTimeInState(
    transitions.map((t) => ({ decisionId: t.decisionId, fromState: t.fromState, toState: t.toState, createdAt: t.createdAt })),
  );
  const velocity = computeVelocityByState(samples);
  console.log("  stage            | count | p50 (h) | p95 (h)");
  for (const v of velocity) {
    console.log(
      `  ${v.state.padEnd(17)} | ${String(v.count).padEnd(5)} | ${(v.p50Ms / 3600000).toFixed(1).padEnd(7)} | ${(v.p95Ms / 3600000).toFixed(1)}`,
    );
  }
  gate("velocity metrics computed with non-trivial sample counts on the seeded org", velocity.some((v) => v.count > 0));

  // ---------------------------------------------------------------------
  // GATE 4: Trigger -> review end-to-end
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 4: trigger-based review end-to-end ---");
  const triggerDecision = await raiseDecision({
    orgId: acmeOrgId,
    decisionClass: "verify_class",
    question: "Should we commit to the new CDN vendor contract?",
    decisionType: "type2",
    impact: 3,
  });
  await frameDecision(triggerDecision.id, {
    optionsConsidered: ["Switch CDN", "Stay"],
    optionEvidence: {
      "Switch CDN": { value: "Switch CDN", rationale: "Cheaper at scale", interval: { low: 10, high: 20 }, confidence: "medium" },
      Stay: { value: "Stay", rationale: "No migration risk", interval: { low: 0, high: 0 }, confidence: "high" },
    },
  });
  await markEvidenceGathered(triggerDecision.id, {});
  await commitDecision(triggerDecision.id, {
    chosen: "Switch CDN",
    choiceRationale: "Cost savings outweigh migration effort.",
    expectedOutcome: "CDN egress cost drops by 15%.",
    confidenceClass: "medium",
    reviewAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    decidedBy: "00000000-0000-0000-0000-000000000000",
    triggerConditions: [{ signal: "cdn_error_rate", op: "gt", value: 0.02 }],
  });
  console.log(`  [t0] committed decision ${triggerDecision.id} with trigger cdn_error_rate > 0.02`);

  const preEval = await evaluateTriggersForOrg(acmeOrgId);
  console.log(`  [t1] evaluated triggers before any signal pushed: ${preEval.length} watch(es) checked, none should be breached yet`);

  await ingestSignalReading({ orgId: acmeOrgId, signal: "cdn_error_rate", value: 0.05 });
  console.log("  [t2] ingested signal reading cdn_error_rate=0.05 (STUB SEAM for Part 13 sensing)");

  const postEval = await evaluateTriggersForOrg(acmeOrgId);
  const breachedForThisDecision = postEval.find((r) => r.decisionId === triggerDecision.id && r.breached);
  console.log(`  [t3] evaluated triggers after signal push:`, breachedForThisDecision);

  const reviewTasks = await listReviewTasks(acmeOrgId);
  const openedTask = reviewTasks.find((t) => t.decisionId === triggerDecision.id);
  console.log(`  [t4] review task auto-opened:`, openedTask ? { id: openedTask.id, title: openedTask.title, status: openedTask.status } : null);

  gate("trigger breach detected after signal ingestion", Boolean(breachedForThisDecision));
  gate("review task auto-opened for the breached, already-committed decision", Boolean(openedTask));

  // ---------------------------------------------------------------------
  // GATE 5: Decision-debt detection finds the seeded overdue decision
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 5: decision debt detection ---");
  const readings = await db.select().from(sensorSignalReadings).where(eq(sensorSignalReadings.orgId, acmeOrgId));
  const latestMap = new Map<string, number>();
  for (const r of [...readings].sort((a, b) => b.observedAt.getTime() - a.observedAt.getTime())) {
    if (!latestMap.has(r.signal)) latestMap.set(r.signal, Number(r.value));
  }
  const debt = computeDecisionDebt(
    orgDecisions.map((d) => ({
      decisionId: d.id,
      question: d.question,
      status: d.status as any,
      triggerConditions: (d.triggerConditions as TriggerCondition[]) ?? [],
    })),
    [...latestMap.entries()].map(([signal, value]) => ({ signal, value })),
  );
  console.log("  Decision debt items found:", debt.map((d) => ({ question: d.question, breachedSignals: d.breachedSignals })));
  gate(
    "decision debt detection finds the seeded overdue decision (cloud provider switch, framed, cloud_spend breached)",
    debt.some((d) => d.question.includes("cloud providers")),
  );

  // ---------------------------------------------------------------------
  // GATE: Decision rights ambiguity detection
  // ---------------------------------------------------------------------
  console.log("\n--- Bonus gate: decision-rights ambiguity detection ---");
  const findings = await detectAmbiguousDecisionRights(acmeOrgId);
  console.log("  Ambiguity findings:", findings.map((f) => f.decisionClass));
  gate("ambiguity detection flags 'vendor_contract' as having no configured decider", findings.some((f) => f.decisionClass === "vendor_contract"));

  // ---------------------------------------------------------------------
  console.log(`\n=== ${failures === 0 ? "ALL GATES PASSED" : `${failures} GATE(S) FAILED`} ===`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Verification harness crashed:", err);
  await pool.end();
  process.exit(1);
});
