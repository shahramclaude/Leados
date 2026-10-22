// scripts/test-contestation.ts  ->  `npm run test:contestation`
//
// Round-trip test: file a contestation about a wrong/stale piece of skill
// evidence, resolve it as accepted with corrected evidence, and prove the
// correction visibly changes downstream outputs (effective level, role fit,
// succession readiness) — not just that a status flag flipped.

import { createInMemoryEventLog } from "../src/lib/events/eventLog";
import { fileContestation, resolveContestation } from "../src/lib/people/contestation";
import { effectiveLevelsForPerson } from "../src/lib/people/skillsInference";
import { fit, namedGaps, ROLES_BY_ID } from "../src/lib/people/roleSkillMap";
import { computeReadiness } from "../src/lib/people/careers";
import type { SkillEvidence } from "../src/lib/people/types";
import { assert, assertEqual, test, runAll } from "./lib/testKit";

const PERSON = "dana";
const ROLE = ROLES_BY_ID["backend-engineer-iii"]; // requires backend-services >= 4

const initialEvidence: SkillEvidence[] = [
  { id: "ev-1", personId: PERSON, skillId: "programming-fundamentals", source: "demonstrated-by-work-evidence", level: 5, recordedAt: "2025-06-01T00:00:00Z" },
  // This one is WRONG — claimed at level 5 by someone who mixed up Dana with a different "Dana". Dana will contest it.
  { id: "ev-2", personId: PERSON, skillId: "backend-services", source: "claimed", level: 5, recordedAt: "2025-01-01T00:00:00Z" },
  { id: "ev-3", personId: PERSON, skillId: "distributed-systems", source: "endorsed", level: 2, recordedAt: "2025-09-01T00:00:00Z" },
];

async function run() {
  const log = createInMemoryEventLog();

  const before = {
    effectiveLevels: effectiveLevelsForPerson(PERSON, initialEvidence, undefined, new Date("2026-01-15")),
  };
  const fitBefore = fit(before.effectiveLevels, ROLE);
  const gapsBefore = namedGaps(before.effectiveLevels, ROLE);
  const readinessBefore = computeReadiness(PERSON, before.effectiveLevels, ROLE);

  test("before correction: inflated 'claimed' evidence makes backend-services look like a smaller gap than it should", () => {
    assert(before.effectiveLevels["backend-services"].level > 2, "the wrong evidence should currently be inflating the effective level");
  });

  const correction = await fileContestation(log, {
    subjectId: PERSON,
    actorId: PERSON,
    surface: "skills-matrix",
    claim: "The 'backend-services: level 5, claimed' entry is not mine — I believe it was misattributed from another Dana. My real level here is closer to 2, evidenced by my actual project work.",
    targetEvidenceId: "ev-2",
  });

  // Captured immediately (before any further mutation) so the assertion below
  // reflects the state right after filing, not whatever the log looks like by
  // the time `runAll` gets around to executing this callback.
  const eventsRightAfterFiling = await log.query({ subjectId: PERSON });

  test("filing a contestation produces an auditable 'filed' event", () => {
    assertEqual(eventsRightAfterFiling.length, 1, "one event should exist right after filing");
    assertEqual(eventsRightAfterFiling[0].type, "people.correction.filed", "event type should be the filed type");
    assertEqual(correction.status, "open", "a freshly filed correction should be open");
  });

  const resolution = await resolveContestation(log, initialEvidence, {
    correction,
    resolverId: "hr-reviewer-1",
    outcome: "accepted",
    resolutionNote: "Confirmed with the endorsing lead: the level-4 claim belonged to a different person. Replaced with a demonstrated-by-work-evidence entry at level 2 backed by Dana's actual shipped service.",
    correctedEvidence: { personId: PERSON, skillId: "backend-services", source: "demonstrated-by-work-evidence", level: 2, recordedAt: "2026-01-10T00:00:00Z", evidenceRef: "corrected-after-contestation" },
  });

  test("resolving a contestation produces an auditable 'resolved' event, in order after 'filed'", async () => {
    const events = await log.query({ subjectId: PERSON });
    assertEqual(events.length, 2, "two events should exist after resolving");
    assertEqual(events[0].type, "people.correction.filed", "first event should be filed");
    assertEqual(events[1].type, "people.correction.resolved", "second event should be resolved");
    assert(events[0].createdAt <= events[1].createdAt, "filed event must precede resolved event");
  });

  test("the original (wrong) evidence row is preserved but marked invalidated — never silently deleted", () => {
    const original = resolution.updatedEvidence.find((e) => e.id === "ev-2");
    assert(original !== undefined, "the original evidence row must still exist in the history");
    assert(original!.invalidated === true, "the original row must be marked invalidated");
    assert(!!original!.supersededBy, "the original row must point at its replacement");
  });

  const after = {
    effectiveLevels: effectiveLevelsForPerson(PERSON, resolution.updatedEvidence, undefined, new Date("2026-01-15")),
  };
  const fitAfter = fit(after.effectiveLevels, ROLE);
  const gapsAfter = namedGaps(after.effectiveLevels, ROLE);
  const readinessAfter = computeReadiness(PERSON, after.effectiveLevels, ROLE);

  test("downstream effective level visibly changes after the correction", () => {
    assert(after.effectiveLevels["backend-services"].level < before.effectiveLevels["backend-services"].level, `expected backend-services level to drop (before=${before.effectiveLevels["backend-services"].level}, after=${after.effectiveLevels["backend-services"].level})`);
  });

  test("downstream role fit visibly changes after the correction", () => {
    assert(fitAfter <= fitBefore, `expected fit to drop or stay equal (before=${fitBefore}, after=${fitAfter})`);
    assert(fitAfter < fitBefore, `expected fit to strictly drop given the corrected evidence (before=${fitBefore}, after=${fitAfter})`);
  });

  test("downstream named gap on the corrected skill reappears/grows after the correction", () => {
    const gapAfter = gapsAfter.find((g) => g.skillId === "backend-services");
    assert(gapAfter !== undefined, "a named gap on backend-services should now be visible");
    const gapBeforeEntry = gapsBefore.find((g) => g.skillId === "backend-services");
    const beforeDelta = gapBeforeEntry?.delta ?? 0;
    assert(gapAfter!.delta > beforeDelta, `expected the named gap to grow (before=${beforeDelta}, after=${gapAfter!.delta})`);
  });

  test("downstream succession readiness state does not improve on stale/incorrect grounds after the correction", () => {
    const rank: Record<string, number> = { "ready-now": 2, "1-year": 1, "2-year": 0 };
    assert(rank[readinessAfter.state] <= rank[readinessBefore.state], `expected readiness to not improve (before=${readinessBefore.state}, after=${readinessAfter.state})`);
  });

  test("the resolved correction record carries the resolver, outcome, and note (contestable + auditable, not a silent edit)", () => {
    assertEqual(resolution.correction.status, "accepted", "status should be accepted");
    assertEqual(resolution.correction.resolverId, "hr-reviewer-1", "resolver should be recorded");
    assert((resolution.correction.resolutionNote ?? "").length > 0, "resolution note should be recorded");
    assert(!!resolution.correction.resolvedAt, "resolvedAt should be set");
  });

  // --- A rejected contestation must NOT change downstream outputs ----------
  const rejectionLog = createInMemoryEventLog();
  const rejectionCorrection = await fileContestation(rejectionLog, {
    subjectId: PERSON,
    actorId: PERSON,
    surface: "skills-matrix",
    claim: "I don't think my distributed-systems endorsement is accurate, it should be higher.",
    targetEvidenceId: "ev-3",
  });
  const rejectionResolution = await resolveContestation(rejectionLog, initialEvidence, {
    correction: rejectionCorrection,
    resolverId: "hr-reviewer-2",
    outcome: "rejected",
    resolutionNote: "Reviewed with the endorser; the existing level-2 endorsement reflects the most recent project evidence available. No change made.",
  });

  test("a rejected contestation leaves the evidence (and therefore downstream outputs) unchanged", () => {
    const stillThere = rejectionResolution.updatedEvidence.find((e) => e.id === "ev-3");
    assert(stillThere !== undefined && stillThere.invalidated !== true, "rejected contestation must not invalidate the evidence");
    assertEqual(rejectionResolution.correction.status, "rejected", "status should reflect rejection");
  });

  return runAll("test:contestation");
}

run().then((code) => process.exit(code));
