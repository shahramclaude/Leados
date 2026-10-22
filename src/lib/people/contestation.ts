// src/lib/people/contestation.ts
//
// The contestation workflow: every person-visible surface in this part must
// have a real way to say "this is wrong" that produces an auditable
// correction event AND visibly changes downstream outputs (not just a
// support ticket that disappears into a queue).
//
// Flow:
//   1. `fileContestation` — subject (or anyone on their behalf with consent)
//      describes what's wrong about a specific surface/evidence row. Writes
//      a `people.correction.filed` event. Status: "open".
//   2. A resolver (HR, or the endorser/manager who can verify) calls
//      `resolveContestation`. If accepted, the referenced evidence is
//      invalidated and (optionally) replaced with corrected evidence — this
//      is NOT a silent edit: the old evidence row stays in place with
//      `invalidated: true` and `supersededBy` pointing at the new row, and a
//      `people.correction.resolved` event is appended.
//   3. Any downstream computation (effective level, fit, succession
//      readiness, growth plan) that re-reads evidence after this point
//      reflects the correction automatically, because they are pure
//      functions of the evidence array — there is no cached "score" to
//      invalidate separately.

import { randomUUID } from "crypto";
import type { EventLog, PeopleEvent } from "../events/eventLog";
import type { SkillEvidence } from "./types";

export const CONTESTATION_EVENT_TYPES = {
  FILED: "people.correction.filed",
  RESOLVED: "people.correction.resolved",
} as const;

export type CorrectionStatus = "open" | "accepted" | "rejected";

export interface CorrectionRecord {
  id: string;
  subjectId: string;
  surface: string;
  claim: string;
  evidenceRef?: string;
  targetEvidenceId?: string;
  status: CorrectionStatus;
  resolverId?: string;
  resolutionNote?: string;
  filedEventId: string;
  resolvedEventId?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface FileContestationInput {
  subjectId: string;
  actorId: string; // usually === subjectId; may be a delegate acting with consent
  surface: string; // e.g. "skills-matrix", "succession-view", "compensation-bands"
  claim: string;
  evidenceRef?: string;
  targetEvidenceId?: string;
}

export async function fileContestation(log: EventLog, input: FileContestationInput): Promise<CorrectionRecord> {
  const id = randomUUID();
  const event = await log.append({
    type: CONTESTATION_EVENT_TYPES.FILED,
    subjectId: input.subjectId,
    actorId: input.actorId,
    purpose: "contestation-filed",
    payload: { correctionId: id, surface: input.surface, claim: input.claim, evidenceRef: input.evidenceRef, targetEvidenceId: input.targetEvidenceId },
  });
  return {
    id,
    subjectId: input.subjectId,
    surface: input.surface,
    claim: input.claim,
    evidenceRef: input.evidenceRef,
    targetEvidenceId: input.targetEvidenceId,
    status: "open",
    filedEventId: event.id,
    createdAt: event.createdAt,
  };
}

export interface ResolveContestationInput {
  correction: CorrectionRecord;
  resolverId: string;
  outcome: "accepted" | "rejected";
  resolutionNote: string;
  /** If accepted and a specific evidence row was contested, the corrected replacement (optional — some corrections just invalidate bad evidence with no replacement). */
  correctedEvidence?: Omit<SkillEvidence, "id" | "invalidated" | "supersededBy">;
}

export interface ResolveContestationResult {
  correction: CorrectionRecord;
  event: PeopleEvent;
  updatedEvidence: SkillEvidence[];
}

/**
 * Applies the resolution to an in-memory evidence array and returns the
 * updated array (pure, so callers decide how to persist it — DB-backed API
 * routes write it back to `person_skill_evidence`, the test suite just keeps
 * it in memory and re-runs the people computations against it).
 */
export async function resolveContestation(log: EventLog, evidence: SkillEvidence[], input: ResolveContestationInput): Promise<ResolveContestationResult> {
  const event = await log.append({
    type: CONTESTATION_EVENT_TYPES.RESOLVED,
    subjectId: input.correction.subjectId,
    actorId: input.resolverId,
    purpose: "contestation-resolved",
    payload: { correctionId: input.correction.id, outcome: input.outcome, resolutionNote: input.resolutionNote },
  });

  let updatedEvidence = evidence;
  if (input.outcome === "accepted" && input.correction.targetEvidenceId) {
    const newId = randomUUID();
    updatedEvidence = evidence.map((e) => (e.id === input.correction.targetEvidenceId ? { ...e, invalidated: true, supersededBy: input.correctedEvidence ? newId : undefined } : e));
    if (input.correctedEvidence) {
      updatedEvidence = [...updatedEvidence, { ...input.correctedEvidence, id: newId }];
    }
  }

  const correction: CorrectionRecord = {
    ...input.correction,
    status: input.outcome,
    resolverId: input.resolverId,
    resolutionNote: input.resolutionNote,
    resolvedEventId: event.id,
    resolvedAt: event.createdAt,
  };

  return { correction, event, updatedEvidence };
}
