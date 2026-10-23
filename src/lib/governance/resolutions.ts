// Resolution workflow: draft -> vote (with conflict hard-stop) -> decide ->
// implementation linkage (flagged if missing) -> oversight milestones ->
// effectiveness review.

import { db } from "@/db";
import {
  resolutions,
  resolutionVotes,
  resolutionImplementationLinks,
  oversightMilestones,
  effectivenessReviews,
  tasks,
} from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { appendAuditEntry } from "./auditChain";
import { findActiveConflict } from "./conflicts";
import type { ResolutionType, VoteValue } from "./types";
import { DEFAULT_OVERSIGHT_HORIZON_DAYS, IMPLEMENTATION_LINK_GRACE_DAYS } from "./types";

export class UndeclaredConflictError extends Error {
  constructor(directorId: number, matterRef: string) {
    super(
      `Director ${directorId} has an active, undeclared-at-vote conflict matching matter "${matterRef}". Vote blocked until the conflict is declared on the record or waived by the board.`,
    );
    this.name = "UndeclaredConflictError";
  }
}

export async function draftResolution(params: {
  meetingId: number;
  text: string;
  type: ResolutionType;
  matterRef: string;
  proposedBy: number;
}) {
  const [row] = await db
    .insert(resolutions)
    .values({
      meetingId: params.meetingId,
      text: params.text,
      type: params.type,
      matterRef: params.matterRef,
      proposedBy: params.proposedBy,
      status: "proposed",
    })
    .returning();

  await appendAuditEntry({
    actorId: params.proposedBy,
    action: "resolution.drafted",
    entityType: "resolution",
    entityId: row.id,
    payload: { type: params.type, matterRef: params.matterRef },
  });

  return row;
}

/**
 * Records a director's vote. HARD STOP: if the director has an active
 * conflict matching the resolution's matter and the vote does not declare
 * it (conflictDeclared=true, with a conflictId referencing the register, or
 * the vote itself is "recused"), the vote is rejected before it is
 * persisted. This cannot be bypassed from the API layer.
 */
export async function castVote(params: {
  resolutionId: number;
  directorId: number;
  vote: VoteValue;
  conflictDeclared?: boolean;
  conflictId?: number;
}) {
  const [resolution] = await db
    .select()
    .from(resolutions)
    .where(eq(resolutions.id, params.resolutionId));
  if (!resolution) throw new Error("Resolution not found");

  const activeConflict = await findActiveConflict(params.directorId, resolution.matterRef);
  if (activeConflict && params.vote !== "recused" && !params.conflictDeclared) {
    throw new UndeclaredConflictError(params.directorId, resolution.matterRef);
  }

  const [row] = await db
    .insert(resolutionVotes)
    .values({
      resolutionId: params.resolutionId,
      directorId: params.directorId,
      vote: params.vote,
      conflictDeclared: params.conflictDeclared ?? false,
      conflictId: params.conflictId ?? activeConflict?.id ?? null,
    })
    .returning();

  await appendAuditEntry({
    actorId: params.directorId,
    action: "resolution.voted",
    entityType: "resolution",
    entityId: params.resolutionId,
    payload: { vote: params.vote, conflictDeclared: params.conflictDeclared ?? false },
  });

  return row;
}

/** Tallies votes and decides the resolution. Recused/abstain do not count
 * toward for/against. Also auto-schedules the first oversight milestone on
 * passage — this is scheduling only, never a substitute for the human
 * effectiveness review that must still be entered by a person. */
export async function decideResolution(resolutionId: number) {
  const votes = await db
    .select()
    .from(resolutionVotes)
    .where(eq(resolutionVotes.resolutionId, resolutionId));

  const forCount = votes.filter((v) => v.vote === "for").length;
  const againstCount = votes.filter((v) => v.vote === "against").length;
  const passed = forCount > againstCount && forCount > 0;

  const [row] = await db
    .update(resolutions)
    .set({ status: passed ? "passed" : "rejected", decidedAt: new Date() })
    .where(eq(resolutions.id, resolutionId))
    .returning();

  await appendAuditEntry({
    action: "resolution.decided",
    entityType: "resolution",
    entityId: resolutionId,
    payload: { passed, forCount, againstCount },
  });

  if (passed) {
    const milestoneDate = new Date();
    milestoneDate.setDate(milestoneDate.getDate() + DEFAULT_OVERSIGHT_HORIZON_DAYS);
    await db.insert(oversightMilestones).values({
      resolutionId,
      milestoneDate,
      description: "Automatic oversight review scheduled on resolution passage.",
      status: "pending",
    });
  }

  return row;
}

export async function linkImplementationTask(params: {
  resolutionId: number;
  taskId: number;
  linkedBy: number;
}) {
  const [row] = await db
    .insert(resolutionImplementationLinks)
    .values(params)
    .returning();

  await appendAuditEntry({
    actorId: params.linkedBy,
    action: "resolution.implementation_linked",
    entityType: "resolution",
    entityId: params.resolutionId,
    payload: { taskId: params.taskId },
  });

  return row;
}

export async function createImplementationTask(params: {
  title: string;
  owner: string;
  dueDate?: Date;
}) {
  const [row] = await db
    .insert(tasks)
    .values({ title: params.title, owner: params.owner, dueDate: params.dueDate })
    .returning();
  return row;
}

/**
 * Resolutions without implementation linkage are flagged. A resolution is
 * only exempt if it is still within the grace period after passage, or if
 * it was rejected/withdrawn (nothing to implement).
 */
export async function findUnlinkedResolutions(now: Date = new Date()) {
  const passed = await db
    .select()
    .from(resolutions)
    .where(eq(resolutions.status, "passed"));

  const graceCutoff = new Date(now);
  graceCutoff.setDate(graceCutoff.getDate() - IMPLEMENTATION_LINK_GRACE_DAYS);

  const flagged = [];
  for (const resolution of passed) {
    if (!resolution.decidedAt || resolution.decidedAt > graceCutoff) continue;
    const links = await db
      .select()
      .from(resolutionImplementationLinks)
      .where(eq(resolutionImplementationLinks.resolutionId, resolution.id));
    if (links.length === 0) {
      flagged.push(resolution);
    }
  }
  return flagged;
}

export async function listOverdueOversightMilestones(now: Date = new Date()) {
  return db
    .select()
    .from(oversightMilestones)
    .where(and(eq(oversightMilestones.status, "pending"), lt(oversightMilestones.milestoneDate, now)));
}

export async function recordEffectivenessReview(params: {
  resolutionId: number;
  milestoneId: number;
  outcome: "effective" | "partially_effective" | "ineffective";
  notes: string;
  reviewedBy: number;
}) {
  const [row] = await db.insert(effectivenessReviews).values(params).returning();

  await db
    .update(oversightMilestones)
    .set({ status: "reviewed" })
    .where(eq(oversightMilestones.id, params.milestoneId));

  await appendAuditEntry({
    actorId: params.reviewedBy,
    action: "resolution.oversight_reviewed",
    entityType: "resolution",
    entityId: params.resolutionId,
    payload: { outcome: params.outcome },
  });

  return row;
}

export async function getResolutionFull(resolutionId: number) {
  const [resolution] = await db
    .select()
    .from(resolutions)
    .where(eq(resolutions.id, resolutionId));
  if (!resolution) return null;
  const votes = await db
    .select()
    .from(resolutionVotes)
    .where(eq(resolutionVotes.resolutionId, resolutionId));
  const links = await db
    .select()
    .from(resolutionImplementationLinks)
    .where(eq(resolutionImplementationLinks.resolutionId, resolutionId));
  const milestones = await db
    .select()
    .from(oversightMilestones)
    .where(eq(oversightMilestones.resolutionId, resolutionId));
  const reviews = await db
    .select()
    .from(effectivenessReviews)
    .where(eq(effectivenessReviews.resolutionId, resolutionId));
  return { resolution, votes, links, milestones, reviews };
}
