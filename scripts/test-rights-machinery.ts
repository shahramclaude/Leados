// LEADOS — Part 56: rights machinery end-to-end test (Phase 4 gate 3).
// Produces a transcript proving: explanation access works for the right
// people and is denied for the wrong people (attempt matrix), and the
// contestation workflow runs end-to-end.
import "./lib/loadEnv";
import { pool } from "../src/db";
import { seedDatabase } from "../src/lib/accountability/seed";
import {
  AccessDeniedError,
  fileContestation,
  getContestationsForSubject,
  getDecisionsForSubject,
  getExplanationForDecision,
  requestOptOut,
  resolveContestation,
  resolveRequester,
} from "../src/lib/accountability/rights";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"} — ${label}`);
  if (!condition) failures++;
}

async function expectAllowed<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await fn();
    check(`${label} (expected ALLOW)`, true);
    return result;
  } catch (err) {
    check(`${label} (expected ALLOW, got DENY: ${(err as Error).message})`, false);
    return undefined;
  }
}

async function expectDenied(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
    check(`${label} (expected DENY, but it was ALLOWED)`, false);
  } catch (err) {
    check(`${label} (expected DENY)`, err instanceof AccessDeniedError);
  }
}

async function main() {
  console.log("=== Test: individual rights machinery (explanation / contest / opt-out) ===");
  await seedDatabase();

  const subj002 = resolveRequester("subj-002");
  const subj001 = resolveRequester("subj-001");
  const admin = resolveRequester("adm-001");
  const auditor = resolveRequester("aud-001");
  const reviewer = resolveRequester("rev-001");
  const engineer = resolveRequester("eng-001");

  const ben002Decisions = await getDecisionsForSubject(subj002, "subj-002");
  const fraudDecision = ben002Decisions.find((d) => d.systemKey === "fraud-anomaly-flagger-v1");
  if (!fraudDecision) throw new Error("Seed data missing expected fraud decision for subj-002");

  console.log("\n--- Attempt matrix: view explanation for subj-002's fraud hold ---");
  await expectAllowed("subj-002 (the subject) views their own explanation", () =>
    getExplanationForDecision(subj002, fraudDecision.id),
  );
  await expectAllowed("admin views subj-002's explanation (oversight role)", () =>
    getExplanationForDecision(admin, fraudDecision.id),
  );
  await expectAllowed("auditor views subj-002's explanation (oversight role)", () =>
    getExplanationForDecision(auditor, fraudDecision.id),
  );
  await expectAllowed("reviewer views subj-002's explanation (oversight role)", () =>
    getExplanationForDecision(reviewer, fraudDecision.id),
  );
  await expectDenied("subj-001 (a different person) views subj-002's explanation", () =>
    getExplanationForDecision(subj001, fraudDecision.id),
  );
  await expectDenied("engineer views subj-002's explanation (builder role, no oversight hat)", () =>
    getExplanationForDecision(engineer, fraudDecision.id),
  );

  console.log("\n--- Attempt matrix: list another subject's decisions ---");
  await expectDenied("subj-001 lists subj-002's decisions", () => getDecisionsForSubject(subj001, "subj-002"));
  await expectAllowed("subj-002 lists their own decisions", () => getDecisionsForSubject(subj002, "subj-002"));

  console.log("\n--- Contestation workflow (end to end) ---");
  const contestation = await expectAllowed("subj-002 files a contestation on their own hold", () =>
    fileContestation({
      decisionRecordId: fraudDecision.id,
      subjectId: "subj-002",
      reason: "This was a legitimate device change, not fraud.",
    }),
  );
  await expectDenied("subj-001 tries to file a contestation on subj-002's decision", () =>
    fileContestation({ decisionRecordId: fraudDecision.id, subjectId: "subj-001", reason: "not mine to contest" }),
  );

  if (contestation) {
    await expectDenied("subj-002 (not an oversight role) tries to resolve their own contestation", () =>
      resolveContestation({
        contestationId: contestation.id,
        requester: subj002,
        status: "overturned",
        resolutionNotes: "self-resolving, should be denied",
      }),
    );
    const resolved = await expectAllowed("auditor resolves the contestation (oversight role)", () =>
      resolveContestation({
        contestationId: contestation.id,
        requester: auditor,
        status: "overturned",
        resolutionNotes: "Confirmed legitimate device change via support ticket cross-reference; hold reversed.",
      }),
    );
    check("resolved contestation status is 'overturned'", resolved?.status === "overturned");
  }

  const subjectContestations = await getContestationsForSubject(subj002, "subj-002");
  check("subject can read back their own contestation history", subjectContestations.length >= 1);
  await expectDenied("subj-001 tries to read subj-002's contestation history", () =>
    getContestationsForSubject(subj001, "subj-002"),
  );

  console.log("\n--- Opt-out (policy-limited) ---");
  const deniedOptOut = await requestOptOut({
    systemKey: "fraud-anomaly-flagger-v1",
    subjectId: "subj-002",
    scope: "all_payouts",
  });
  check("opt-out from mandatory fraud controls is recorded as denied", deniedOptOut.status === "denied");
  check("denied opt-out carries a documented limitation note", deniedOptOut.limitationsNote.length > 0);

  const allowedOptOut = await requestOptOut({
    systemKey: "support-ticket-priority-scorer-v1",
    subjectId: "cust-001",
    scope: "all_tickets",
  });
  check("opt-out from priority scoring is recorded as active", allowedOptOut.status === "active");

  console.log(`\n=== Rights machinery test: ${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`} ===`);
  await pool.end();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error("Test crashed:", err);
  await pool.end();
  process.exit(1);
});
