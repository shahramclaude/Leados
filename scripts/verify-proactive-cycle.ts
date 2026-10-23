// npm run verify
//
// End-to-end verification for Part 48 (LEADOS proactive workflow architect):
//   A. Pure-logic gates (deterministic, no DB): extraction precision/recall,
//      delegation checks blocking seeded violations, nag-guard budget
//      assertion, renegotiation history integrity.
//   B. DB-backed full-cycle integration transcript: detect → draft →
//      delegate → follow up → close, against the real schema via Drizzle.
//
// Exits 0 only if every gate passes.

import "dotenv/config";

import {
  EXTRACTION_REVIEW_THRESHOLD,
  extractFromActionItems,
} from "../src/lib/commitmentExtraction";
import { computeFollowThrough, renegotiate } from "../src/lib/commitmentLedger";
import type { Commitment } from "../src/lib/types";
import {
  checkAuthority,
  checkCapacity,
  evaluateDelegation,
  findStaleDelegations,
} from "../src/lib/delegationEngine";
import { defaultRightsRules } from "../src/lib/authorityRights";
import {
  buildSoftBacklog,
  buildWorstCaseBacklog,
  DELEGATION_FIXTURES,
  LABELLED_ACTION_ITEMS,
} from "../src/lib/seedFixtures";
import { queueWithBudget, detectAllMoments } from "../src/lib/proactiveDraftEngine";
import { defaultBudget } from "../src/lib/interruptBudget";
import { computeLoopHealth, isWellFormed, type Loop } from "../src/lib/loopClosure";

type GateResult = { name: string; passed: boolean; details: string };
const results: GateResult[] = [];
function gate(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  console.log(`${passed ? "✅ PASS" : "❌ FAIL"} — ${name}\n    ${details}`);
}

async function main() {
  console.log("================================================================");
  console.log("LEADOS Part 48 — Proactive Workflow Architect — Verification Run");
  console.log("================================================================\n");

  // ---------------------------------------------------------------------
  // GATE 2: commitment extraction accuracy on seeded, labelled artifacts
  // ---------------------------------------------------------------------
  console.log("--- Gate 2: Commitment extraction precision/recall -------------");
  const extracted = extractFromActionItems(
    LABELLED_ACTION_ITEMS,
    { sourceType: "meeting", sourceId: "fixture", surface: "test" },
    new Date("2026-03-01"),
  );
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (let i = 0; i < LABELLED_ACTION_ITEMS.length; i++) {
    const label = LABELLED_ACTION_ITEMS[i].isActualCommitment;
    const predicted = extracted[i].confidence >= EXTRACTION_REVIEW_THRESHOLD;
    if (label && predicted) tp++;
    else if (!label && predicted) fp++;
    else if (label && !predicted) fn++;
    else tn++;
  }
  const precision = tp / (tp + fp || 1);
  const recall = tp / (tp + fn || 1);
  console.log(`    confusion matrix: TP=${tp} FP=${fp} FN=${fn} TN=${tn}`);
  console.log(`    precision=${(precision * 100).toFixed(1)}%  recall=${(recall * 100).toFixed(1)}%`);
  gate(
    "Extraction precision >= 90% and recall >= 80% on labelled fixture set",
    precision >= 0.9 && recall >= 0.8,
    `precision=${(precision * 100).toFixed(1)}%, recall=${(recall * 100).toFixed(1)}% over ${LABELLED_ACTION_ITEMS.length} labelled items`,
  );

  // ---------------------------------------------------------------------
  // GATE 3: delegation checks block seeded violations
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 3: Delegation checks block seeded violations ----------");
  const rules = defaultRightsRules();

  const cleanAuthority = checkAuthority({ delegateRole: DELEGATION_FIXTURES.clean.delegateRole, actionClassKey: DELEGATION_FIXTURES.clean.actionClassKey, rules });
  const cleanCapacity = checkCapacity({ snapshot: DELEGATION_FIXTURES.clean.capacity, estimatedHours: DELEGATION_FIXTURES.clean.estimatedHours });
  const cleanDecision = evaluateDelegation(
    { delegateRole: DELEGATION_FIXTURES.clean.delegateRole, actionClassKey: DELEGATION_FIXTURES.clean.actionClassKey, rules },
    { snapshot: DELEGATION_FIXTURES.clean.capacity, estimatedHours: DELEGATION_FIXTURES.clean.estimatedHours },
    { goal: undefined, taskSkillTags: [], timeRows: [], weekOf: DELEGATION_FIXTURES.clean.capacity.weekOf },
  );
  gate("Clean delegation (manager approving budget, has capacity) is NOT blocked", !cleanDecision.blocked, `authority passed=${cleanAuthority.passed}, capacity passed=${cleanCapacity.passed}`);

  const wrongAuthDecision = evaluateDelegation(
    { delegateRole: DELEGATION_FIXTURES.wrongAuthority.delegateRole, actionClassKey: DELEGATION_FIXTURES.wrongAuthority.actionClassKey, rules },
    { snapshot: DELEGATION_FIXTURES.wrongAuthority.capacity, estimatedHours: DELEGATION_FIXTURES.wrongAuthority.estimatedHours },
    { goal: undefined, taskSkillTags: [], timeRows: [], weekOf: DELEGATION_FIXTURES.wrongAuthority.capacity.weekOf },
  );
  gate("Wrong-authority delegation (IC approving budget) IS blocked", wrongAuthDecision.blocked && !wrongAuthDecision.authority.passed, wrongAuthDecision.blockReasons.join(" | "));

  const overCapDecision = evaluateDelegation(
    { delegateRole: DELEGATION_FIXTURES.overCapacity.delegateRole, actionClassKey: DELEGATION_FIXTURES.overCapacity.actionClassKey, rules },
    { snapshot: DELEGATION_FIXTURES.overCapacity.capacity, estimatedHours: DELEGATION_FIXTURES.overCapacity.estimatedHours },
    { goal: undefined, taskSkillTags: [], timeRows: [], weekOf: DELEGATION_FIXTURES.overCapacity.capacity.weekOf },
  );
  gate("Over-capacity delegation (10h task, 2h free) IS blocked", overCapDecision.blocked && !overCapDecision.capacity.passed, overCapDecision.blockReasons.join(" | "));

  // ---------------------------------------------------------------------
  // GATE 4: nag-guard — nudge volume respects budget even in worst-case backlog
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 4: Nag-guard under seeded worst-case backlog -----------");
  const now = new Date("2026-03-10T10:00:00Z");
  const promisor = "person-overloaded";
  const promisee = "person-other";

  const soft = buildSoftBacklog(promisor, promisee, now);
  const softCandidates = detectAllMoments({
    commitments: soft,
    decisions: [],
    meetings: [],
    metrics: [],
    delegations: [],
    now,
  });
  const budgetMap = new Map([[promisor, defaultBudget(promisor, now.toISOString().slice(0, 10))]]);
  const queuedSoft = queueWithBudget(softCandidates, budgetMap, now);
  const individualSoft = queuedSoft.filter((q) => q.queuePosition === "immediate").length;
  const digestSoft = queuedSoft.filter((q) => q.draftType === "digest").length;
  console.log(`    soft backlog: ${softCandidates.length} candidates -> ${individualSoft} immediate + ${digestSoft} digest (vs cap=${budgetMap.get(promisor)!.cap})`);
  gate(
    "20-item soft backlog collapses into <= cap individual items + 1 digest (not 20 individual nudges)",
    individualSoft <= budgetMap.get(promisor)!.cap && queuedSoft.length < softCandidates.length,
    `${softCandidates.length} candidates produced only ${queuedSoft.length} queue entries (${individualSoft} immediate, ${digestSoft} digest)`,
  );

  const worst = buildWorstCaseBacklog(promisor, promisee, now);
  const worstCandidates = detectAllMoments({ commitments: worst, decisions: [], meetings: [], metrics: [], delegations: [], now });
  const budgetMap2 = new Map([[promisor, defaultBudget(promisor, now.toISOString().slice(0, 10))]]);
  const queuedWorst = queueWithBudget(worstCandidates, budgetMap2, now);
  console.log(`    worst-case (all overdue=critical) backlog: ${worstCandidates.length} candidates -> ${queuedWorst.length} queue entries (critical bypasses budget by design)`);
  gate(
    "Critical (overdue) items are never silently dropped — each still surfaces exactly once",
    queuedWorst.length === worstCandidates.length,
    `${worstCandidates.length} overdue commitments -> ${queuedWorst.length} queue entries (1:1, critical bypasses batching but is never duplicated or lost)`,
  );

  // ---------------------------------------------------------------------
  // GATE 5: renegotiation history intact
  // ---------------------------------------------------------------------
  console.log("\n--- Gate 5: Renegotiation leaves a distinct, intact trace -------");
  const original: Commitment = {
    id: "c-original",
    promisorId: "p1",
    promiseeId: "p2",
    content: "Ship the report",
    dueAt: new Date("2026-03-05"),
    context: { sourceType: "manual" },
    status: "open",
    confirmed: true,
    renegotiatedFromId: null,
    createdAt: new Date("2026-02-20"),
    updatedAt: new Date("2026-02-20"),
  };
  const { closedOriginal, newCommitment, event } = renegotiate(original, new Date("2026-03-12"), "p1", "needed more time for QA");
  const renegOk =
    closedOriginal.status === "renegotiated" &&
    newCommitment.status === "open" &&
    newCommitment.renegotiatedFromId === original.id &&
    event.type === "renegotiated" &&
    event.fromDueAt?.getTime() === original.dueAt.getTime() &&
    event.toDueAt?.getTime() === newCommitment.dueAt.getTime();
  gate(
    "Renegotiated commitment: original marked 'renegotiated' (not deleted/overwritten), new row linked, event logged",
    renegOk,
    `original.status=${closedOriginal.status}, new.status=${newCommitment.status}, new.renegotiatedFromId=${newCommitment.renegotiatedFromId}`,
  );

  // Now prove broken != renegotiated in aggregate metrics.
  const brokenOne: Commitment = { ...original, id: "c-broken", status: "broken" };
  const scope = [closedOriginal, newCommitment, brokenOne];
  const metrics = computeFollowThrough("test-scope", scope);
  const distinctOk = metrics.broken === 1 && metrics.renegotiatedThenKept === 0 && metrics.stillOpenAfterRenegotiation === 1;
  gate(
    "Follow-through metrics count 'broken' and 'renegotiated-then-still-open' as distinct buckets",
    distinctOk,
    `broken=${metrics.broken}, stillOpenAfterRenegotiation=${metrics.stillOpenAfterRenegotiation}, renegotiatedThenKept=${metrics.renegotiatedThenKept}`,
  );

  // ---------------------------------------------------------------------
  // Delegation follow-up loop (delegated-without-checking)
  // ---------------------------------------------------------------------
  console.log("\n--- Extra: delegation follow-up loop (delegated-without-checking) ---");
  const staleDelegation = { id: "d1", delegatorId: "amara", delegateId: "ben", task: "Draft vendor memo", status: "accepted", createdAt: new Date("2026-03-01"), lastCheckinAt: null };
  const stale = findStaleDelegations([staleDelegation], new Date("2026-03-06"), 3);
  gate("Delegation with no check-in for > 3 days is flagged stale", stale.length === 1, `${stale.length} stale delegation(s) found after 5 days with no check-in`);

  // ---------------------------------------------------------------------
  // Loop closure invariant
  // ---------------------------------------------------------------------
  console.log("\n--- Extra: loop-closure invariant -------------------------------");
  const loops: Loop[] = [
    { id: "l1", surfaceType: "commitment", surfaceRef: {}, ownerId: "ben", nextStep: "send contract", status: "open", parkedReason: null, parkedUntil: null, openedAt: new Date(), closedAt: null },
    { id: "l2", surfaceType: "decision", surfaceRef: {}, ownerId: null, nextStep: null, status: "open", parkedReason: null, parkedUntil: null, openedAt: new Date(), closedAt: null },
    { id: "l3", surfaceType: "meeting", surfaceRef: {}, ownerId: "amara", nextStep: null, status: "parked", parkedReason: "waiting on vendor", parkedUntil: null, openedAt: new Date(), closedAt: null },
  ];
  const violations = loops.filter((l) => !isWellFormed(l));
  const report = computeLoopHealth(loops, new Date());
  gate(
    "Open loop missing both next-step and owner is flagged as an invariant violation",
    violations.length === 1 && violations[0].id === "l2" && report.violationCount === 1,
    `violations=[${violations.map((v) => v.id).join(",")}], report.violationCount=${report.violationCount}`,
  );

  // ---------------------------------------------------------------------
  // Full-cycle integration transcript against the real database
  // ---------------------------------------------------------------------
  await runDbBackedTranscript();

  // ---------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------
  console.log("\n================================================================");
  const failed = results.filter((r) => !r.passed);
  console.log(`SUMMARY: ${results.length - failed.length}/${results.length} gates passed.`);
  if (failed.length > 0) {
    console.log("FAILED GATES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.details}`);
    process.exitCode = 1;
  } else {
    console.log("ALL GATES PASSED.");
  }
  console.log("================================================================");
}

async function runDbBackedTranscript() {
  console.log("\n--- Gate 1 + Full-cycle transcript: DETECT -> DRAFT -> DELEGATE -> FOLLOW UP -> CLOSE (against live DB) ---");
  const { db } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const { sql } = await import("drizzle-orm");
  const { seedDemoData } = await import("../src/lib/db/seed");
  const { ensureActionClasses } = await import("../src/lib/db/autonomyRepo");
  const { runDetectionCycle, listDrafts, approveDraft } = await import("../src/lib/db/proactiveRepo");
  const { proposeDelegation, acceptDelegation, findStale } = await import("../src/lib/db/delegationRepo");
  const { syncLoopsFromSurfaces, health, parkLoop, closeLoop, listLoops } = await import("../src/lib/db/loopRepo");
  const { listPeople } = await import("../src/lib/db/peopleRepo");
  const { runExtractionFromArtifacts, confirmCommitment, listCommitments } = await import("../src/lib/db/commitmentRepo");

  try {
    await db.execute(sql`select 1`);
  } catch (e) {
    gate("Database reachable for full-cycle transcript", false, String(e));
    return;
  }

  // Clean slate so the transcript is deterministic and re-runnable.
  for (const table of [
    schema.policyAudit,
    schema.commitmentEvents,
    schema.delegationChecks,
    schema.proactiveDrafts,
    schema.loops,
    schema.delegations,
    schema.commitments,
    schema.oneOnOnes,
    schema.meetingArtifacts,
    schema.decisions,
    schema.metricSeries,
    schema.cadenceTicks,
    schema.interruptBudget,
    schema.capacityTwin,
    schema.growthGoals,
    schema.timeAllocations,
    schema.authorityRights,
    schema.delegatedPermissions,
    schema.actionClasses,
    schema.people,
  ]) {
    await db.delete(table);
  }
  console.log("    [setup] cleared tables for a deterministic run");

  await seedDemoData();
  await ensureActionClasses();
  const people = await listPeople();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? id;
  console.log(`    [setup] seeded ${people.length} people + fixture commitments/decisions/meetings`);

  // DETECT + extraction (meeting/1:1 artifacts -> draft commitments)
  const extracted = await runExtractionFromArtifacts(async (name) => {
    const p = people.find((pp) => pp.name === name);
    return p?.id ?? null;
  });
  console.log(`    [DETECT/extract] extracted ${extracted.length} candidate commitment(s) from meeting/1:1 artifacts (confirmed=false)`);
  gate("Extraction produced at least one unconfirmed draft commitment", extracted.length > 0 && extracted.every((c) => !c.confirmed), `${extracted.length} extracted, all confirmed=false pending human review`);

  for (const c of extracted) {
    await confirmCommitment(c.id, people[0].id);
  }
  console.log(`    [confirm] human confirmed ${extracted.length} extracted commitment(s)`);

  // DRAFT: run the proactive detection cycle
  const cycle = await runDetectionCycle(new Date());
  const drafts = await listDrafts("queued");
  console.log(`    [DRAFT] detection cycle found ${cycle.candidates.length} moment(s) -> ${cycle.queued.length} queue entries persisted, ${drafts.length} currently queued`);
  for (const d of drafts.slice(0, 5)) {
    console.log(`        - [${d.triggerType}] -> ${nameOf(d.targetPersonId)} (${d.stakes}/${d.autonomyTier}): "${d.draftContent.slice(0, 90)}"`);
  }
  gate("Detection cycle drafted at least one proactive intervention, all starting as T1 queued drafts", drafts.length > 0 && drafts.every((d) => d.autonomyTier === "T1" && d.status === "queued"), `${drafts.length} queued, all T1`);

  if (drafts.length > 0) {
    await approveDraft(drafts[0].id, people[0].id);
    console.log(`    [follow up / act] approved draft "${drafts[0].draftContent.slice(0, 60)}" on behalf of ${nameOf(people[0].id)} (human tap required — no auto-send occurred)`);
  }

  // DELEGATE: propose a clean delegation and a blocked one
  const manager = people.find((p) => p.role === "manager")!;
  const ic = people.find((p) => p.role === "ic")!;
  const director = people.find((p) => p.role === "director")!;

  const good = await proposeDelegation({
    delegatorId: director.id,
    delegateId: manager.id,
    task: "Approve the Q2 vendor budget",
    actionClassKey: "approve.budget_request",
    estimatedHours: 1,
    weekOf: new Date().toISOString().slice(0, 10),
    skillTags: ["vendor_management"],
  });
  console.log(`    [DELEGATE] proposed "${good.delegation.task}" ${nameOf(director.id)} -> ${nameOf(manager.id)}: status=${good.delegation.status} (blocked=${good.decision.blocked})`);

  const bad = await proposeDelegation({
    delegatorId: manager.id,
    delegateId: ic.id,
    task: "Approve the Q2 vendor budget",
    actionClassKey: "approve.budget_request", // ICs lack authority
    estimatedHours: 1,
    weekOf: new Date().toISOString().slice(0, 10),
    skillTags: [],
  });
  console.log(`    [DELEGATE] proposed "${bad.delegation.task}" ${nameOf(manager.id)} -> ${nameOf(ic.id)}: status=${bad.delegation.status} (blocked=${bad.decision.blocked}, reasons=${bad.decision.blockReasons.join("; ")})`);
  gate("Delegation engine accepted the authorized delegation and blocked the unauthorized one", good.delegation.status !== "blocked" && bad.delegation.status === "blocked", `good=${good.delegation.status}, bad=${bad.delegation.status}`);

  await acceptDelegation(good.delegation.id);
  console.log(`    [DELEGATE] ${nameOf(manager.id)} accepted the delegation`);

  // FOLLOW UP: simulate time passing with no check-in, detect staleness
  const futureNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  const stale = await findStale(futureNow, 3);
  console.log(`    [FOLLOW UP] ${stale.length} delegation(s) flagged stale (accepted, no check-in for 3+ days) as of simulated t+5d`);
  gate("Delegation follow-up loop flags the accepted-but-unchecked delegation", stale.some((s) => s.id === good.delegation.id), `stale ids: ${stale.map((s) => s.id).join(",")}`);

  // CLOSE: sync + close/park loops
  const createdLoopCount = await syncLoopsFromSurfaces();
  const allLoops = await listLoops();
  const openLoop = allLoops.find((l) => l.status === "open");
  if (openLoop) {
    if (openLoop.nextStep && openLoop.ownerId) {
      await closeLoop(openLoop.id, people[0].id);
      console.log(`    [CLOSE] closed loop ${openLoop.id} (${openLoop.surfaceType}) — had a next step and owner`);
    } else {
      await parkLoop(openLoop.id, "needs more context before a next step can be set", people[0].id);
      console.log(`    [CLOSE] parked loop ${openLoop.id} (${openLoop.surfaceType}) — explicitly parked rather than left silently open`);
    }
  }
  const finalHealth = await health();
  console.log(`    [CLOSE] loop health after cycle: open=${finalHealth.totalOpen}, parked=${finalHealth.totalParked}, violations=${finalHealth.violationCount}`);
  gate("Loop sync created trackable loops from live surfaces and at least one was closed or parked", createdLoopCount > 0 && (finalHealth.totalParked > 0 || finalHealth.bySurface.commitment.closed + finalHealth.bySurface.decision.closed + finalHealth.bySurface.meeting.closed + finalHealth.bySurface.delegation.closed > 0), `createdLoopCount=${createdLoopCount}, parked=${finalHealth.totalParked}`);

  const finalCommitments = await listCommitments();
  console.log(`    [transcript complete] final commitment count: ${finalCommitments.length}, final draft queue size: ${(await listDrafts("queued")).length}`);
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error("Verification run crashed:", err);
    process.exit(1);
  });
