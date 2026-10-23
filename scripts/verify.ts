// Part 46 verification harness — runs real assertions against real Postgres
// via Drizzle (no mocks). Run with `npm run verify` (which seeds first).
//
// Gates covered (PHASE 4):
//  1. Safe-channel confidentiality: every unauthorized access attempt denied + alerted.
//  2. Dual-control: single-actor T4 attempts all blocked; legitimate 2-person flow executes.
//  3. Red-flag detectors catch every seeded ethical hazard (+ a clean control case).
//  4. Dissent preservation: anonymous input cannot be suppressed by any single role.
//  5. Proximity-warning correctness on the seeded stakeholder graph.

import "dotenv/config";
import { db } from "@/db";
import {
  decisions,
  people,
  safeChannelAlerts,
  safeChannelAccessLog,
  dissentSuggestions,
  dualControlActions,
} from "@/db/schema";
import { eq } from "drizzle-orm";

import { submitReport, revealIdentity, getCaseForRole, SafeChannelAccessDenied } from "@/lib/safeChannel/store";
import { requestAction, approveAction } from "@/lib/powerActions";
import { runEthicalReview } from "@/lib/ethics/lensEngine";
import { submitSuggestion, attemptSuppress, listSuggestions } from "@/lib/dissent";
import { computeHops, peopleWithinHops } from "@/lib/stakeholderGraph";
import { declareConflict, checkProximity } from "@/lib/conflictOfInterest";
import { ROLES, Actor } from "@/lib/roles";

let passCount = 0;
let failCount = 0;

function check(name: string, condition: boolean, details?: unknown) {
  if (condition) {
    passCount++;
    console.log(`  \u2705 ${name}`);
  } else {
    failCount++;
    console.log(`  \u274c ${name}`);
    if (details !== undefined) console.log(`     details: ${JSON.stringify(details)}`);
  }
}

async function getPersonIdByName(name: string): Promise<number> {
  const [row] = await db.select().from(people).where(eq(people.name, name));
  if (!row) throw new Error(`Seed person not found: ${name}`);
  return row.id;
}

async function getDecisionIdByTitle(title: string): Promise<number> {
  const [row] = await db.select().from(decisions).where(eq(decisions.title, title));
  if (!row) throw new Error(`Seed decision not found: ${title}`);
  return row.id;
}

async function section1_safeChannelConfidentiality() {
  console.log("\n[1] Safe-channel confidentiality (absolute bar)");

  const casey = await getPersonIdByName("Casey CEO");
  const adrian = await getPersonIdByName("Adrian Admin");
  const mo = await getPersonIdByName("Mo Manager");
  const priya = await getPersonIdByName("Priya HR");
  const blair = await getPersonIdByName("Blair BoardLiaison");
  const oma = await getPersonIdByName("Oma Ombudsman");
  const eli = await getPersonIdByName("Eli EthicsOfficer");

  const original = "Jordan Reporter <jordan.reporter@leados.example>";
  const { caseRef, caseId } = await submitReport({
    category: "harassment",
    body: "A confidential report body describing the incident in detail.",
    reporterIdentity: original,
  });
  check("report submitted and case ref issued", typeof caseRef === "string" && caseRef.startsWith("SC-"));

  const alertsBefore = await db.select().from(safeChannelAlerts);

  const unauthorizedAttempts: Actor[] = [
    { personId: casey, role: ROLES.CEO },
    { personId: adrian, role: ROLES.ADMIN },
    { personId: mo, role: ROLES.MANAGER },
    { personId: priya, role: ROLES.HR_MANAGER },
    { personId: blair, role: ROLES.BOARD_LIAISON },
  ];

  for (const actor of unauthorizedAttempts) {
    let denied = false;
    try {
      await revealIdentity(caseId, actor);
    } catch (err) {
      denied = err instanceof SafeChannelAccessDenied;
    }
    check(`identity access denied for role "${actor.role}"`, denied);
  }

  const alertsAfter = await db.select().from(safeChannelAlerts);
  check(
    `every unauthorized attempt raised an alert (expected +${unauthorizedAttempts.length})`,
    alertsAfter.length - alertsBefore.length === unauthorizedAttempts.length,
    { before: alertsBefore.length, after: alertsAfter.length },
  );

  // Authorized roles succeed and decrypt correctly.
  for (const actor of [
    { personId: oma, role: ROLES.OMBUDSMAN } as Actor,
    { personId: eli, role: ROLES.ETHICS_OFFICER } as Actor,
  ]) {
    const result = await revealIdentity(caseId, actor);
    check(`identity access granted + decrypted correctly for role "${actor.role}"`, result.identity === original);
  }

  const alertsAfterAuthorized = await db.select().from(safeChannelAlerts);
  check(
    "authorized access did not raise any new alerts",
    alertsAfterAuthorized.length === alertsAfter.length,
  );

  const accessLogRows = await db.select().from(safeChannelAccessLog).where(eq(safeChannelAccessLog.caseId, caseId));
  check(
    "every single access attempt (granted or denied) was logged",
    accessLogRows.length === unauthorizedAttempts.length + 2,
    { logged: accessLogRows.length, expected: unauthorizedAttempts.length + 2 },
  );

  // Case metadata/body access is separately role-gated (not identity-gated).
  let caseAccessDenied = false;
  try {
    await getCaseForRole(caseId, { personId: casey, role: ROLES.CEO });
  } catch (err) {
    caseAccessDenied = err instanceof SafeChannelAccessDenied;
  }
  check("case metadata access denied for CEO (not a case-handling role)", caseAccessDenied);

  const caseForOmbudsman = await getCaseForRole(caseId, { personId: oma, role: ROLES.OMBUDSMAN });
  check("case metadata access granted for ombudsman", caseForOmbudsman.caseRef === caseRef);
}

async function section2_dualControl() {
  console.log("\n[2] Dual control (power checks)");

  const casey = await getPersonIdByName("Casey CEO");
  const priya = await getPersonIdByName("Priya HR");

  const action = await requestAction({
    actionType: "evaluation_policy_change",
    payload: { note: "verify script seeded request" },
    requestedByPersonId: casey,
    requestedByRole: ROLES.CEO,
  });
  check("T4 action request created as pending", action.status === "pending");

  const selfApprove = await approveAction({ actionId: action.id, approverPersonId: casey, approverRole: ROLES.CEO });
  check("single-actor self-approval blocked", selfApprove.status === "blocked");

  const [stillPending] = await db.select().from(dualControlActions).where(eq(dualControlActions.id, action.id));
  check("action remains pending after blocked self-approval", stillPending.status === "pending");

  const distinctApprove = await approveAction({ actionId: action.id, approverPersonId: priya, approverRole: ROLES.HR_MANAGER });
  check("distinct second approver executes the action", distinctApprove.status === "executed");

  let rejectedNonT4 = false;
  try {
    await requestAction({
      actionType: "not_a_real_t4_action",
      payload: {},
      requestedByPersonId: casey,
      requestedByRole: ROLES.CEO,
    });
  } catch {
    rejectedNonT4 = true;
  }
  check("non-T4 action type is rejected at request time", rejectedNonT4);
}

interface ExpectedFlags {
  title: string;
  expectCodes: string[];
  expectAbsentCodes?: string[];
}

async function section3_redFlagCorpus() {
  console.log("\n[3] Ethical red-flag detector corpus");

  const casey = await getPersonIdByName("Casey CEO");
  const vik = await getPersonIdByName("Vik VP-Eng");

  // Set up the COI proximity scenario before running its review.
  const promotionId = await getDecisionIdByTitle("Promote Ivy IC1 to senior engineer");
  const declaration = await declareConflict({
    personId: vik,
    interestDescription: "Vik mentors Ivy informally and has an outside financial interest tied to her team's success.",
    relatedEntity: "Ivy IC1 promotion",
  });
  const proximity = await checkProximity(vik, promotionId);
  check("COI proximity check finds 2 hops for seeded graph (Vik -> Mo -> Ivy)", proximity.hops === 2 && proximity.warningCreated === true, proximity);

  const cases: ExpectedFlags[] = [
    {
      title: "Process performance scores from new monitoring tool",
      expectCodes: ["PEOPLE_DATA_NO_VISIBILITY"],
    },
    {
      title: "Grant org-wide dashboard read access",
      expectCodes: ["BULK_VISIBILITY_GRANT"],
    },
    {
      title: "Change performance evaluation policy weights",
      expectCodes: ["UNILATERAL_HIGH_POWER"],
    },
    {
      title: "Decommission legacy identity infrastructure",
      expectCodes: ["IRREVERSIBLE_HIGH_IMPACT"],
    },
    {
      title: "Ship accelerated product launch timeline",
      expectCodes: ["SUPPRESSED_DISSENT"],
    },
    {
      title: "Promote Ivy IC1 to senior engineer",
      expectCodes: ["COI_PROXIMITY_UNRESOLVED"],
    },
    {
      title: "Rotate team standup time by 30 minutes",
      expectCodes: [],
    },
  ];

  for (const c of cases) {
    const decisionId = await getDecisionIdByTitle(c.title);
    const review = await runEthicalReview(decisionId, casey);
    const codes = review.redFlags.map((f) => f.code).sort();
    const expected = [...c.expectCodes].sort();
    const matches = JSON.stringify(codes) === JSON.stringify(expected);
    check(`"${c.title}" -> red flags ${JSON.stringify(expected)}`, matches, { got: codes });
    check(`"${c.title}" -> decisionSupportNote present (never a bare verdict)`, review.decisionSupportNote.includes("decision support"));
  }

  // Fairness scan integration: the structured-criteria decision should report ran:true with a flagged disparity.
  const peopleDataDecisionId = await getDecisionIdByTitle("Process performance scores from new monitoring tool");
  const review = await runEthicalReview(peopleDataDecisionId, casey);
  const fairness = review.fairnessScan.value as { ran: boolean; disparities: Array<{ flagged: boolean }> };
  check(
    "fairness scan ran on structured criteria and flagged the seeded disparity",
    fairness.ran === true && fairness.disparities.some((d) => d.flagged),
    fairness,
  );

  const cleanDecisionId = await getDecisionIdByTitle("Rotate team standup time by 30 minutes");
  const cleanReview = await runEthicalReview(cleanDecisionId, casey);
  check("clean control decision's fairness scan correctly reports not-machine-readable", cleanReview.fairnessScan.value.ran === false);

  void declaration;
}

async function section4_dissentPreservation() {
  console.log("\n[4] Dissent preservation (anti-suppression attempt matrix)");

  const { id: suggestionId } = await submitSuggestion({
    body: "I think the new on-call rotation is unsafe and nobody is listening.",
    category: "safety",
  });

  const attackers: Actor[] = [
    { personId: await getPersonIdByName("Mo Manager"), role: ROLES.MANAGER },
    { personId: await getPersonIdByName("Priya HR"), role: ROLES.HR_MANAGER },
    { personId: await getPersonIdByName("Casey CEO"), role: ROLES.CEO },
    { personId: await getPersonIdByName("Adrian Admin"), role: ROLES.ADMIN },
    { personId: await getPersonIdByName("Eli EthicsOfficer"), role: ROLES.ETHICS_OFFICER },
    { personId: await getPersonIdByName("Oma Ombudsman"), role: ROLES.OMBUDSMAN },
    { personId: await getPersonIdByName("Blair BoardLiaison"), role: ROLES.BOARD_LIAISON },
  ];

  for (const actor of attackers) {
    for (const action of ["delete", "hide", "suppress"] as const) {
      const result = await attemptSuppress({ suggestionId, attemptedAction: action, actor });
      check(`suppression ("${action}") by role "${actor.role}" is blocked`, result.blocked === true);
    }
  }

  const [row] = await db.select().from(dissentSuggestions).where(eq(dissentSuggestions.id, suggestionId));
  check("suggestion status is unchanged (still open) after every attack", row.status === "open");

  const stillListed = (await listSuggestions()).some((s) => s.id === suggestionId);
  check("suggestion remains visible in the public listing after every attack", stillListed);
}

async function section5_proximityGraph() {
  console.log("\n[5] Proximity-warning correctness on the seeded stakeholder graph");

  const vik = await getPersonIdByName("Vik VP-Eng");
  const ivy = await getPersonIdByName("Ivy IC1");
  const mo = await getPersonIdByName("Mo Manager");
  const imran = await getPersonIdByName("Imran IC2");
  const ira = await getPersonIdByName("Ira IC3");
  const oma = await getPersonIdByName("Oma Ombudsman");
  const sana = await getPersonIdByName("Sana VP-Sales");

  const vikToIvy = await computeHops(vik, ivy);
  check("hops(Vik, Ivy) === 2 via Mo", vikToIvy?.hops === 2, vikToIvy);

  const omaToIvy = await computeHops(oma, ivy);
  check("hops(Oma, Ivy) is unreachable (null) on the seeded graph", omaToIvy === null, omaToIvy);

  const neighborsOfMo = await peopleWithinHops(mo, 1);
  const neighborIds = neighborsOfMo.map((n) => n.personId).sort((a, b) => a - b);
  const expectedNeighbors = [vik, ivy, imran, ira].sort((a, b) => a - b);
  check("1-hop neighborhood of Mo matches Vik/Ivy/Imran/Ira", JSON.stringify(neighborIds) === JSON.stringify(expectedNeighbors), neighborIds);

  const promotionId = await getDecisionIdByTitle("Promote Ivy IC1 to senior engineer");
  const sanaProximity = await checkProximity(sana, promotionId);
  check(
    "distant declarant (Sana, 4 hops) does not trigger a proximity warning",
    sanaProximity.warningCreated === false && (sanaProximity.hops ?? 99) > 2,
    sanaProximity,
  );
}

async function main() {
  console.log("=== LEADOS Part 46 — Ethics, Safe Channels & Power Checks: verification ===");
  await section1_safeChannelConfidentiality();
  await section2_dualControl();
  await section3_redFlagCorpus();
  await section4_dissentPreservation();
  await section5_proximityGraph();

  console.log(`\n=== RESULT: ${passCount} passed, ${failCount} failed ===`);
  if (failCount > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("verify.ts crashed:", err);
  process.exit(1);
});
