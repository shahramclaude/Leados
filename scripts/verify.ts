// Part 55 full verification: board-cycle transcript (materials -> meeting ->
// resolutions -> oversight), resolution-implementation enforcement,
// board-tier access matrix, completeness red-flag detector, pre-read/
// oversight metrics, and audit-chain integrity. Exits non-zero on any
// failed assertion.

import "dotenv/config";
import { db } from "../src/db";
import {
  resetGovernanceData,
  seedBoard,
} from "../src/lib/governance/seed";
import { upsertCadence, scheduleNextMeeting, reviewDeadlineEscalation } from "../src/lib/governance/boardCycle";
import {
  createPack,
  addSection,
  freezeNumbers,
  runCompletenessCheck,
} from "../src/lib/governance/packAssembly";
import { recordPackOpened, recordPackAcknowledged, aggregatePreReadMetric } from "../src/lib/governance/preRead";
import { declareConflict } from "../src/lib/governance/conflicts";
import {
  draftResolution,
  castVote,
  decideResolution,
  linkImplementationTask,
  createImplementationTask,
  findUnlinkedResolutions,
  recordEffectivenessReview,
  UndeclaredConflictError,
} from "../src/lib/governance/resolutions";
import {
  getOrCreateMinutes,
  addVerbatimExcerpt,
  setGeneratedSummary,
  finalizeMinutes,
  FinalizationNotAllowedError,
} from "../src/lib/governance/minutes";
import {
  raiseInformationRequest,
  respondToRequest,
  closeRequest,
  informationRequestMetrics,
} from "../src/lib/governance/informationRequests";
import { submitReport, listReportsForTier } from "../src/lib/governance/whistleblower";
import { allCombinations, AccessDeniedError } from "../src/lib/governance/access";
import { boardEffectivenessSummary, assertIndividualScoringPolicyEnabled, IndividualScoringNotAuthorizedError } from "../src/lib/governance/metrics";
import { verifyChain, appendAuditEntry } from "../src/lib/governance/auditChain";
import { auditLog, oversightMilestones } from "../src/db/schema";
import { eq } from "drizzle-orm";

let failures = 0;
let passes = 0;

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passes += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log("        detail:", JSON.stringify(detail));
  }
}

async function main() {
  section("PHASE 0 — reset & seed demo board");
  await resetGovernanceData();
  const { byEmail } = await seedBoard();
  const chair = byEmail["chair@leados.example"];
  const cosec = byEmail["cosec@leados.example"];
  const david = byEmail["director.david@leados.example"];
  const helena = byEmail["director.helena@leados.example"];
  const auditChairUser = byEmail["audit.chair@leados.example"];
  const auditMember = byEmail["audit.member@leados.example"];
  const management = byEmail["cfo@leados.example"];
  console.log(`  seeded ${Object.keys(byEmail).length} users`);

  // ---------------------------------------------------------------------
  section("BOARD CYCLE: cadence -> materials deadline -> pack assembly");
  // ---------------------------------------------------------------------
  const firstMeeting = new Date();
  firstMeeting.setDate(firstMeeting.getDate() + 14);
  await upsertCadence({
    tier: "main_board",
    cadenceDays: 90,
    materialsLeadDays: 7,
    firstMeetingDate: firstMeeting,
  });
  const meeting = await scheduleNextMeeting("main_board");
  check("meeting scheduled with materials deadline before meeting date", meeting.materialsDeadline < meeting.scheduledAt);

  const escalatedEarly = await reviewDeadlineEscalation(meeting.id, new Date());
  check("escalation level low when deadline is far away", escalatedEarly.escalationLevel === 0, escalatedEarly);

  const nearDeadline = new Date(meeting.materialsDeadline);
  nearDeadline.setHours(nearDeadline.getHours() + 6); // simulate past the deadline
  const escalatedLate = await reviewDeadlineEscalation(meeting.id, nearDeadline);
  check("escalation breaches to level 3 once deadline passes", escalatedLate.escalationLevel === 3, escalatedLate);
  check("meeting status flips to materials_due on breach", escalatedLate.status === "materials_due", escalatedLate);

  const pack = await createPack(meeting.id);
  await addSection(pack.id, {
    sectionType: "financial_highlights",
    title: "Financial Highlights",
    content: "Q cumulative revenue, margin bridge, cash position.",
    required: true,
    sourcePart: "part37_consolidation",
  });
  await addSection(pack.id, {
    sectionType: "risk_and_controls",
    title: "Risk & Controls Report",
    content: "Principal risk register movements and controls testing results.",
    required: true,
    sourcePart: "part29_risk",
  });
  await addSection(pack.id, {
    sectionType: "compliance_attestations",
    title: "Compliance Attestations",
    content: "Management attestations of compliance with obligations register.",
    required: true,
    sourcePart: "part29_risk",
  });
  await addSection(pack.id, {
    sectionType: "minutes_prior_meeting",
    title: "Minutes of Prior Meeting",
    content: "Approved minutes from the previous board meeting.",
    required: true,
    sourcePart: "part42_artifacts",
  });
  await addSection(pack.id, {
    sectionType: "resolutions_proposed",
    title: "Resolutions Proposed for This Meeting",
    content: "Draft resolutions for board consideration.",
    required: true,
    sourcePart: "part23_decisions",
  });
  await freezeNumbers(pack.id, { revenue: 48250000, netMargin: 0.182, cash: 11250000 });

  const completenessGood = await runCompletenessCheck(pack.id);
  check("complete pack with all mandatory sections raises zero red flags", completenessGood.flags.length === 0, completenessGood.flags);
  check("pack completeness status is 'complete'", completenessGood.pack.completenessStatus === "complete");

  // ---------------------------------------------------------------------
  section("RED-FLAG DETECTOR: 'what the board doesn't see' (seeded suppression)");
  // ---------------------------------------------------------------------
  const meeting2 = await scheduleNextMeeting("main_board");
  const suppressedPack = await createPack(meeting2.id);
  await addSection(suppressedPack.id, {
    sectionType: "financial_highlights",
    title: "Financial Highlights",
    content: "Revenue and margin summary.",
    required: true,
    sourcePart: "part37_consolidation",
  });
  // Management omits the risk & controls section without citing any policy
  // exception — this is the seeded suppression scenario.
  await addSection(suppressedPack.id, {
    sectionType: "risk_and_controls",
    title: "Risk & Controls Report",
    content: "",
    required: true,
    included: false,
    omittedReason: "Management judged it not material this quarter.",
    sourcePart: "part29_risk",
  });
  await addSection(suppressedPack.id, {
    sectionType: "compliance_attestations",
    title: "Compliance Attestations",
    content: "",
    required: true,
    included: false,
    omittedReason: "Pending legal sign-off.",
    omittedPolicyRef: "POLICY-ATT-EXCEPTION-2026-03", // documented exception → should NOT flag
    sourcePart: "part29_risk",
  });
  await addSection(suppressedPack.id, {
    sectionType: "minutes_prior_meeting",
    title: "Minutes of Prior Meeting",
    content: "Approved minutes.",
    required: true,
    sourcePart: "part42_artifacts",
  });
  // resolutions_proposed section entirely missing from assembly.

  const suppressedCheck = await runCompletenessCheck(suppressedPack.id);
  const flagTypes = suppressedCheck.flags.map((f) => f.flagType + ":" + f.sectionType);
  check(
    "undocumented omission of risk_and_controls is flagged as omitted_without_policy",
    flagTypes.includes("omitted_without_policy:risk_and_controls"),
    flagTypes,
  );
  check(
    "documented policy exception for compliance_attestations is NOT flagged",
    !flagTypes.some((f) => f.endsWith(":compliance_attestations")),
    flagTypes,
  );
  check(
    "entirely missing mandatory section (resolutions_proposed) is flagged",
    flagTypes.includes("missing_mandatory:resolutions_proposed"),
    flagTypes,
  );
  check("pack with red flags is marked 'red_flag'", suppressedCheck.pack.completenessStatus === "red_flag");

  // ---------------------------------------------------------------------
  section("PRE-READ TRACKING (aggregate governance metric)");
  // ---------------------------------------------------------------------
  await recordPackOpened(pack.id, chair.id);
  await recordPackAcknowledged(pack.id, chair.id, 1200);
  await recordPackOpened(pack.id, david.id);
  await recordPackAcknowledged(pack.id, david.id, 900);
  await recordPackOpened(pack.id, helena.id);
  // Helena opens but does not acknowledge — simulates incomplete pre-read.
  const preReadMetric = await aggregatePreReadMetric(pack.id, 4); // 4 expected readers
  check("pre-read completion rate reflects 2 of 4 acknowledged", Math.abs(preReadMetric.completionRate - 0.5) < 1e-9, preReadMetric);
  console.log("  pre-read metric:", JSON.stringify(preReadMetric));

  // ---------------------------------------------------------------------
  section("RESOLUTIONS: draft -> conflict hard-stop -> vote -> decide");
  // ---------------------------------------------------------------------
  const resolutionA = await draftResolution({
    meetingId: meeting.id,
    text: "Approve the Related-Party Supply Agreement with Helena Cruz's affiliated entity.",
    type: "binding",
    matterRef: "Related-Party Supply Agreement",
    proposedBy: chair.id,
  });
  const resolutionB = await draftResolution({
    meetingId: meeting.id,
    text: "Endorse the updated Executive Travel Policy.",
    type: "advisory",
    matterRef: "Executive Travel Policy Update",
    proposedBy: chair.id,
  });

  await declareConflict({
    directorId: helena.id,
    matter: "Related-Party Supply Agreement",
    natureOfInterest: "Director's affiliated entity is the counterparty.",
    recusalRequired: true,
  });

  let blockedVoteCaught = false;
  try {
    await castVote({ resolutionId: resolutionA.id, directorId: helena.id, vote: "for" });
  } catch (err) {
    blockedVoteCaught = err instanceof UndeclaredConflictError;
  }
  check("vote blocked when conflicted director has not declared conflict at vote time", blockedVoteCaught);

  await castVote({ resolutionId: resolutionA.id, directorId: helena.id, vote: "recused" });
  await castVote({ resolutionId: resolutionA.id, directorId: chair.id, vote: "for" });
  await castVote({ resolutionId: resolutionA.id, directorId: david.id, vote: "for" });
  await castVote({ resolutionId: resolutionA.id, directorId: auditChairUser.id, vote: "for" });

  await castVote({ resolutionId: resolutionB.id, directorId: chair.id, vote: "for" });
  await castVote({ resolutionId: resolutionB.id, directorId: david.id, vote: "for" });
  await castVote({ resolutionId: resolutionB.id, directorId: helena.id, vote: "against" });

  const decidedA = await decideResolution(resolutionA.id);
  const decidedB = await decideResolution(resolutionB.id);
  check("resolution A (related-party, properly recused) passed", decidedA.status === "passed", decidedA);
  check("resolution B (advisory) passed", decidedB.status === "passed", decidedB);

  const milestonesA = await db.select().from(oversightMilestones).where(eq(oversightMilestones.resolutionId, resolutionA.id));
  check("oversight milestone auto-scheduled on passage", milestonesA.length === 1, milestonesA);

  // ---------------------------------------------------------------------
  section("IMPLEMENTATION LINKAGE: unlinked resolution must be flagged");
  // ---------------------------------------------------------------------
  const taskA = await createImplementationTask({ title: "Execute related-party supply agreement", owner: "Legal" });
  await linkImplementationTask({ resolutionId: resolutionA.id, taskId: taskA.id, linkedBy: cosec.id });
  // Resolution B is deliberately left unlinked to exercise the detector.

  const futureCheckDate = new Date();
  futureCheckDate.setDate(futureCheckDate.getDate() + 10); // past the 7-day grace period
  const unlinked = await findUnlinkedResolutions(futureCheckDate);
  const unlinkedIds = unlinked.map((r) => r.id);
  check("linked resolution A is NOT flagged as unlinked", !unlinkedIds.includes(resolutionA.id), unlinkedIds);
  check("unlinked resolution B IS flagged after grace period", unlinkedIds.includes(resolutionB.id), unlinkedIds);

  // ---------------------------------------------------------------------
  section("OVERSIGHT REVIEW (effectiveness review on milestone)");
  // ---------------------------------------------------------------------
  const review = await recordEffectivenessReview({
    resolutionId: resolutionA.id,
    milestoneId: milestonesA[0].id,
    outcome: "effective",
    notes: "Agreement executed on schedule; related-party terms independently reviewed.",
    reviewedBy: auditChairUser.id,
  });
  check("effectiveness review recorded", review.outcome === "effective");
  const [milestoneAfter] = await db.select().from(oversightMilestones).where(eq(oversightMilestones.id, milestonesA[0].id));
  check("milestone marked reviewed after effectiveness review", milestoneAfter.status === "reviewed");

  // ---------------------------------------------------------------------
  section("MINUTES: verbatim/generated separation + finalization hard stop");
  // ---------------------------------------------------------------------
  await getOrCreateMinutes(meeting.id);
  await addVerbatimExcerpt(meeting.id, {
    speaker: "Chair",
    quote: "The chair noted Helena Cruz's declared conflict and recusal on the related-party item.",
    timestampLabel: "10:04",
  });
  await setGeneratedSummary(
    meeting.id,
    "The board reviewed Q financials, the risk & controls report, and approved two resolutions; one director recused from a related-party vote.",
  );

  let finalizeBlocked = false;
  try {
    await finalizeMinutes({ meetingId: meeting.id, finalizedBy: david.id, finalizedByTier: "director" });
  } catch (err) {
    finalizeBlocked = err instanceof FinalizationNotAllowedError;
  }
  check("minutes finalization blocked for non-company-secretary/chair tier", finalizeBlocked);

  const finalized = await finalizeMinutes({ meetingId: meeting.id, finalizedBy: cosec.id, finalizedByTier: "company_secretary" });
  check("minutes finalized by company secretary", finalized.finalized === true);
  check("finalized minutes carry a hash", Boolean(finalized.hash));

  // ---------------------------------------------------------------------
  section("DIRECTORS' INFORMATION RIGHTS");
  // ---------------------------------------------------------------------
  const infoReq = await raiseInformationRequest({
    requesterId: david.id,
    subject: "Detail behind margin bridge assumption",
    requestText: "Please provide the underlying assumptions for the Q margin bridge shown in the pack.",
    targetTier: "management",
    dueInDays: 5,
  });
  await respondToRequest({
    requestId: infoReq.id,
    responseText: "Assumptions memo attached; FX and input cost sensitivity included.",
    respondedBy: management.id,
  });
  await closeRequest(infoReq.id, cosec.id);
  const infoMetrics = await informationRequestMetrics();
  check("information request closure rate > 0 after closing", infoMetrics.closureRate > 0, infoMetrics);
  console.log("  information-request metrics:", JSON.stringify(infoMetrics));

  // ---------------------------------------------------------------------
  section("WHISTLEBLOWER / AUDIT-COMMITTEE SAFE CHANNEL");
  // ---------------------------------------------------------------------
  const { reportId } = await submitReport({
    subject: "Possible expense policy breach",
    body: "Anonymous report describing a pattern of unapproved executive expenses.",
  });
  const visibleToAuditChair = await listReportsForTier("audit_committee_chair");
  check("audit committee chair can see whistleblower report", visibleToAuditChair.some((r) => r.id === reportId));

  let managementDenied = false;
  try {
    await listReportsForTier("management");
  } catch (err) {
    managementDenied = err instanceof AccessDeniedError;
  }
  check("management tier is denied access to whistleblower channel", managementDenied);

  let directorDenied = false;
  try {
    await listReportsForTier("director");
  } catch (err) {
    directorDenied = err instanceof AccessDeniedError;
  }
  check("ordinary director tier is denied access to whistleblower channel (audit-committee-only)", directorDenied);

  // ---------------------------------------------------------------------
  section("BOARD-TIER ACCESS ATTEMPT MATRIX");
  // ---------------------------------------------------------------------
  const matrix = allCombinations();
  check("access matrix is non-empty", matrix.length > 0);
  const managementCannotReadFullPack = !matrix.some(
    (m) => m.tier === "management" && m.resource === "board_pack_full" && m.expected === true,
  );
  check("management is never granted board_pack_full access", managementCannotReadFullPack);
  const observerCannotWriteAnything = !matrix.some(
    (m) => m.tier === "observer" && m.action === "write" && m.expected === true,
  );
  check("observer tier is never granted any write access", observerCannotWriteAnything);
  const individualScoringNeverGrantedByMatrix = !matrix.some(
    (m) => m.resource === "governance_metrics_individual" && m.expected === true,
  );
  check(
    "no tier is statically granted individual-director-scoring access (policy-gated only)",
    individualScoringNeverGrantedByMatrix,
  );
  const whistleblowerOnlyAuditAndChair = matrix
    .filter((m) => m.resource === "whistleblower_channel" && m.expected === true)
    .every((m) => ["chair", "audit_committee_chair", "audit_committee"].includes(m.tier));
  check("whistleblower channel access limited to chair + audit committee tiers", whistleblowerOnlyAuditAndChair);
  console.log(`  access matrix size: ${matrix.length} combinations checked`);

  // ---------------------------------------------------------------------
  section("GOVERNANCE METRICS: board-level only, individual scoring hard stop");
  // ---------------------------------------------------------------------
  let individualBlocked = false;
  try {
    await assertIndividualScoringPolicyEnabled();
  } catch (err) {
    individualBlocked = err instanceof IndividualScoringNotAuthorizedError;
  }
  check("individual director scoring blocked by default (no board policy adopted)", individualBlocked);

  const summary = await boardEffectivenessSummary();
  check("board effectiveness summary computed", Boolean(summary.decisionLatency));
  check("board effectiveness summary is explicitly scoped to board-level aggregates", summary.scope.includes("board-level aggregate"));
  console.log("  board effectiveness summary:", JSON.stringify(summary, null, 2));

  // ---------------------------------------------------------------------
  section("AUDIT CHAIN INTEGRITY (Part 19)");
  // ---------------------------------------------------------------------
  const chainBefore = await verifyChain();
  check("audit chain verifies intact after full cycle", chainBefore.ok, chainBefore);
  check("audit chain has recorded entries for the cycle", chainBefore.length > 10, chainBefore);

  const [someEntry] = await db.select().from(auditLog).limit(1);
  const originalPayload = someEntry.payload;
  await db.update(auditLog).set({ payload: { tampered: true } }).where(eq(auditLog.id, someEntry.id));
  const chainTampered = await verifyChain();
  check("tampering with a historical audit entry is detected", chainTampered.ok === false, chainTampered);
  // restore
  await db.update(auditLog).set({ payload: originalPayload }).where(eq(auditLog.id, someEntry.id));
  const chainRestored = await verifyChain();
  check("audit chain verifies intact again after restoring the tampered entry", chainRestored.ok, chainRestored);

  // Sanity: appendAuditEntry still works after all this.
  await appendAuditEntry({ action: "verify.completed", entityType: "system", payload: { failures } });

  // ---------------------------------------------------------------------
  section("RESULT");
  // ---------------------------------------------------------------------
  console.log(`\n${passes} passed, ${failures} failed.`);
  if (failures > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Verification script crashed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { pool } = await import("../src/db");
    await pool.end();
  });
