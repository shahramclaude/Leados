// LEADOS Part 25 — After-Ritual Capture.
// The 2-minute flow: decisions made, actions with owners, open questions —
// all persisted as typed entities (never free-text-only minutes). Actions
// without an owner are rejected outright; this is enforced here, not left to
// convention.
import { db } from "@/db";
import { actions, decisions, eventLog, hypotheses, ritualCaptures, ritualOccurrences, rituals } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { CaptureInput } from "./types";

export class CaptureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureValidationError";
  }
}

function validate(input: CaptureInput): void {
  for (const action of input.actions) {
    if (!action.title || action.title.trim().length === 0) {
      throw new CaptureValidationError("Every action requires a non-empty title.");
    }
    if (!action.ownerRole && !action.ownerUserId) {
      throw new CaptureValidationError(
        `Action "${action.title}" has no owner (role or user) — "never minutes without owners" is enforced, not just written policy.`,
      );
    }
  }
  for (const q of input.openQuestions) {
    if (!q.ownerRole || q.ownerRole.trim().length === 0) {
      throw new CaptureValidationError(`Open question "${q.question}" has no owning role.`);
    }
  }
  if (input.attendeeCount < 0) {
    throw new CaptureValidationError("attendeeCount cannot be negative.");
  }
}

export interface CaptureResult {
  captureId: string;
  decisionIds: string[];
  actionIds: string[];
  hypothesisIds: string[];
  quorumMet: boolean;
}

export async function captureRitualOutcome(occurrenceId: string, input: CaptureInput): Promise<CaptureResult> {
  validate(input);

  const [occurrence] = await db.select().from(ritualOccurrences).where(eq(ritualOccurrences.id, occurrenceId)).limit(1);
  if (!occurrence) throw new CaptureValidationError(`No ritual occurrence found for id ${occurrenceId}.`);

  const decisionIds: string[] = [];
  for (const d of input.decisions) {
    const [row] = await db
      .insert(decisions)
      .values({
        orgId: occurrence.orgId,
        decisionClass: d.decisionClass,
        question: d.question,
        chosen: d.chosen ?? null,
        choiceRationale: d.choiceRationale ?? null,
        impact: d.impact,
        raisedBy: d.raisedBy ?? null,
        status: d.chosen ? "decided" : "raised",
        committedAt: d.chosen ? new Date() : null,
        sourceRitualOccurrenceId: occurrenceId,
      })
      .returning();
    decisionIds.push(row.id);
    await db.insert(eventLog).values({
      orgId: occurrence.orgId,
      entityType: "decision",
      entityId: row.id,
      type: d.chosen ? "decision.committed" : "decision.raised",
      payload: { occurrenceId, question: d.question },
      actorId: input.capturedBy ?? null,
    });
  }

  const actionIds: string[] = [];
  for (const a of input.actions) {
    const [row] = await db
      .insert(actions)
      .values({
        orgId: occurrence.orgId,
        title: a.title,
        ownerRole: a.ownerRole ?? null,
        ownerUserId: a.ownerUserId ?? null,
        dueAt: a.dueAt ? new Date(a.dueAt) : null,
        sourceRitualOccurrenceId: occurrenceId,
      })
      .returning();
    actionIds.push(row.id);
    await db.insert(eventLog).values({
      orgId: occurrence.orgId,
      entityType: "action",
      entityId: row.id,
      type: "action.created",
      payload: { occurrenceId, title: a.title, ownerRole: a.ownerRole ?? null, ownerUserId: a.ownerUserId ?? null },
      actorId: input.capturedBy ?? null,
    });
  }

  const hypothesisIds: string[] = [];
  for (const h of input.hypotheses) {
    const [row] = await db
      .insert(hypotheses)
      .values({
        orgId: occurrence.orgId,
        statement: h.statement,
        raisedBy: h.raisedBy ?? null,
        sourceRitualOccurrenceId: occurrenceId,
      })
      .returning();
    hypothesisIds.push(row.id);
    await db.insert(eventLog).values({
      orgId: occurrence.orgId,
      entityType: "hypothesis",
      entityId: row.id,
      type: "hypothesis.raised",
      payload: { occurrenceId, statement: h.statement },
      actorId: input.capturedBy ?? null,
    });
  }

  const [capture] = await db
    .insert(ritualCaptures)
    .values({
      occurrenceId,
      capturedBy: input.capturedBy ?? null,
      decisionIds,
      actionIds,
      hypothesisIds,
      openQuestions: input.openQuestions,
      notes: input.notes ?? null,
    })
    .returning();

  const [ritualRow] = await db.select().from(rituals).where(eq(rituals.id, occurrence.ritualId)).limit(1);
  const quorumMet = ritualRow ? input.attendeeCount >= ritualRow.quorum : true;

  await db
    .update(ritualOccurrences)
    .set({
      status: occurrence.cadenceMode === "async_checklist" ? "degraded_async" : "held",
      attendeeCount: input.attendeeCount,
      quorumMet,
      capturedAt: new Date(),
    })
    .where(eq(ritualOccurrences.id, occurrenceId));

  await db.insert(eventLog).values({
    orgId: occurrence.orgId,
    entityType: "ritual_occurrence",
    entityId: occurrenceId,
    type: "cadence.captured",
    payload: {
      decisionCount: decisionIds.length,
      actionCount: actionIds.length,
      hypothesisCount: hypothesisIds.length,
      openQuestionCount: input.openQuestions.length,
      attendeeCount: input.attendeeCount,
    },
    actorId: input.capturedBy ?? null,
  });

  return { captureId: capture.id, decisionIds, actionIds, hypothesisIds, quorumMet };
}
