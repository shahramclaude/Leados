import type { Commitment, Viewer } from "../../domain/types";
import { canView, effectiveRole } from "../../domain/people/privacy";
import { oneOnOneRepository } from "../../platform/db/oneOnOneRepository";
import { peopleRepository } from "../../platform/db/peopleRepository";
import { accessAuditRepository } from "../../platform/db/accessAuditRepository";
import { eventsRepository } from "../../platform/db/eventsRepository";
import { scoreFollowThrough, suggestTalkingPoints } from "../../domain/people/oneOnOne";
import { buildRecentSignals } from "./signals";

export async function listOneOnOnes(viewer: Viewer, personId: number) {
  const role = effectiveRole(viewer, personId);
  const allowed = canView(viewer, personId, "oneOnOneShared") || viewer.id === personId;
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "oneOnOne.list",
    fieldsRedacted: allowed ? [] : ["all"],
    allowed,
    reason: allowed ? `Viewer role "${role}" may see shared 1:1 content.` : "Viewer lacks 1:1 visibility for this person.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const oneOnOnes = await oneOnOneRepository.listForPerson(personId);
  const followThrough = scoreFollowThrough(oneOnOnes.flatMap((o) => o.commitments));
  return { ok: true as const, oneOnOnes, followThrough };
}

export async function scheduleOneOnOne(viewer: Viewer, personId: number, managerId: number, scheduledAt: string) {
  const allowed = viewer.role === "manager" || viewer.role === "hr";
  await accessAuditRepository.log({
    viewer,
    subjectId: personId,
    resource: "oneOnOne.schedule",
    fieldsRedacted: [],
    allowed,
    reason: allowed ? "Manager/HR may schedule 1:1s." : "Only a manager or HR may schedule a 1:1.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const person = await peopleRepository.getById(personId);
  if (!person) return { ok: false as const, error: "not_found" };

  const signals = await buildRecentSignals(person);
  const suggestions = suggestTalkingPoints(signals);

  const created = await oneOnOneRepository.create({
    personId,
    managerId,
    scheduledAt,
    talkingPointSuggestions: suggestions,
  });

  await eventsRepository.record({
    type: "oneonone.scheduled",
    version: 1,
    subjectId: personId,
    actorId: viewer.id,
    payload: { oneOnOneId: created.id, personId, managerId, scheduledAt },
  });

  return { ok: true as const, oneOnOne: created };
}

export async function completeOneOnOne(
  viewer: Viewer,
  oneOnOneId: number,
  patch: { sharedSummary?: string; commitments?: Commitment[]; privateManagerNotes?: string },
) {
  const existing = await oneOnOneRepository.getById(oneOnOneId);
  if (!existing) return { ok: false as const, error: "not_found" };

  const isAuthoringManager = viewer.id === existing.managerId;
  const allowed = isAuthoringManager || viewer.role === "hr";
  await accessAuditRepository.log({
    viewer,
    subjectId: existing.personId,
    resource: "oneOnOne.complete",
    fieldsRedacted: [],
    allowed,
    reason: allowed ? "Authoring manager or HR may complete a 1:1." : "Only the authoring manager or HR may complete this 1:1.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const updated = await oneOnOneRepository.complete(oneOnOneId, patch);
  if (!updated) return { ok: false as const, error: "not_found" };

  await eventsRepository.record({
    type: "oneonone.completed",
    version: 1,
    subjectId: existing.personId,
    actorId: viewer.id,
    payload: {
      oneOnOneId,
      personId: existing.personId,
      managerId: existing.managerId,
      commitmentCount: patch.commitments?.length ?? existing.commitments.length,
    },
  });

  return { ok: true as const, oneOnOne: updated };
}

export async function resolveCommitment(
  viewer: Viewer,
  oneOnOneId: number,
  commitmentId: string,
  status: "done" | "missed",
) {
  const existing = await oneOnOneRepository.getById(oneOnOneId);
  if (!existing) return { ok: false as const, error: "not_found" };

  // Either participant (the person or their manager) can mark a commitment
  // resolved; this is a shared artifact, not a private one.
  const allowed = viewer.id === existing.personId || viewer.id === existing.managerId || viewer.role === "hr";
  await accessAuditRepository.log({
    viewer,
    subjectId: existing.personId,
    resource: "oneOnOne.commitment.resolve",
    fieldsRedacted: [],
    allowed,
    reason: allowed ? "Participant or HR may resolve a shared commitment." : "Only a 1:1 participant or HR may resolve this commitment.",
  });
  if (!allowed) return { ok: false as const, error: "forbidden" };

  const updated = await oneOnOneRepository.updateCommitment(oneOnOneId, commitmentId, status);
  if (!updated) return { ok: false as const, error: "not_found" };

  await eventsRepository.record({
    type: "oneonone.commitment_resolved",
    version: 1,
    subjectId: existing.personId,
    actorId: viewer.id,
    payload: { oneOnOneId, commitmentId, status },
  });

  return { ok: true as const, oneOnOne: updated };
}

export async function getPrivateNotes(viewer: Viewer, oneOnOneId: number) {
  const existing = await oneOnOneRepository.getById(oneOnOneId);
  if (!existing) return { ok: false as const, error: "not_found" };
  const notes = await oneOnOneRepository.getPrivateNotes(oneOnOneId, viewer);
  const allowed = notes !== null;
  await accessAuditRepository.log({
    viewer,
    subjectId: existing.personId,
    resource: "oneOnOne.privateNotes",
    fieldsRedacted: allowed ? [] : ["privateManagerNotes"],
    allowed,
    reason: allowed
      ? "Viewer is the authoring manager or HR."
      : "Private manager notes are never exposed outside the authoring manager and HR.",
  });
  return { ok: true as const, notes };
}
