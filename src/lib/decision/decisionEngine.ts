// =============================================================================
// LEADOS — Part 23 — Decision Engine
// =============================================================================
// Core lifecycle logic for the frozen decision record. Read-before-write note:
// no `decisionEngine.ts` (or any decision* module) pre-existed in this repo —
// this is a net-new module built to the Part 23 spec.
//
// Lifecycle:  raised -> framed -> evidence_gathered -> decided -> reviewed
// Freezing:   commitDecision() sets committed_at and snapshots dissent +
//             decision rights. After that, the DB trigger in dbSetup.ts makes
//             any further mutation of frozen columns fail with 'invalid'.
//             Corrections after commit are modelled as NEW rows in
//             decision_corrections (and an event in event_log) — never edits.
// =============================================================================

import { db } from "@/db";
import {
  decisions,
  decisionDissent,
  decisionStateTransitions,
  decisionCorrections,
  decisionTriggerWatches,
  decisionRightsConfigs,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ensureDecisionInvariants } from "./dbSetup";
import { appendEvent } from "./eventLog";
import type {
  DecisionRecordView,
  DecisionStatus,
  DecisionType,
  DissentEntry,
  TriggerCondition,
  Explain,
} from "./types";
import { DECISION_FUNNEL } from "./types";

export class InvalidMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "invalid";
  }
}

function toView(row: typeof decisions.$inferSelect): DecisionRecordView {
  return {
    id: row.id,
    orgId: row.orgId,
    decisionClass: row.decisionClass,
    status: row.status as DecisionStatus,
    question: row.question,
    decisionType: row.decisionType as DecisionType,
    optionsConsidered: (row.optionsConsidered as string[]) ?? [],
    optionEvidence: (row.optionEvidence as Record<string, Explain<unknown>>) ?? {},
    chosen: row.chosen,
    choiceRationale: row.choiceRationale,
    dissent: (row.dissentSnapshot as DissentEntry[]) ?? [],
    expected: row.expectedOutcome
      ? {
          outcome: row.expectedOutcome,
          interval: (row.expectedInterval as DecisionRecordView["expected"]) as any,
          confidenceClass: (row.confidenceClass as any) ?? "medium",
          reviewAt: row.reviewAt ? row.reviewAt.toISOString() : null,
        }
      : null,
    decidedBy: row.decidedBy,
    decisionRights: (row.decisionRightsSnapshot as DecisionRecordView["decisionRights"]) ?? null,
    reversibilityPlan: row.reversibilityPlan,
    triggerConditions: (row.triggerConditions as TriggerCondition[]) ?? [],
    impact: row.impact,
    raisedBy: row.raisedBy,
    raisedAt: row.raisedAt.toISOString(),
    framedAt: row.framedAt ? row.framedAt.toISOString() : null,
    evidenceGatheredAt: row.evidenceGatheredAt ? row.evidenceGatheredAt.toISOString() : null,
    committedAt: row.committedAt ? row.committedAt.toISOString() : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
  };
}

export interface RaiseDecisionInput {
  orgId: string;
  decisionClass: string;
  question: string;
  decisionType: DecisionType;
  raisedBy?: string | null;
  impact?: number;
}

export async function raiseDecision(input: RaiseDecisionInput): Promise<DecisionRecordView> {
  await ensureDecisionInvariants();
  const [row] = await db
    .insert(decisions)
    .values({
      orgId: input.orgId,
      decisionClass: input.decisionClass,
      question: input.question,
      decisionType: input.decisionType,
      raisedBy: input.raisedBy ?? null,
      impact: input.impact ?? 3,
      status: "raised",
    })
    .returning();

  await db.insert(decisionStateTransitions).values({
    decisionId: row.id,
    fromState: null,
    toState: "raised",
    actorId: input.raisedBy ?? null,
  });

  await appendEvent({
    orgId: input.orgId,
    entityType: "decision",
    entityId: row.id,
    type: "decision.raised",
    payload: { question: input.question, decisionType: input.decisionType },
    actorId: input.raisedBy ?? null,
  });

  return toView(row);
}

async function assertNotCommitted(decisionId: string) {
  const [row] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!row) throw new Error("decision not found");
  if (row.committedAt) {
    throw new InvalidMutationError(
      "invalid: decision record is frozen post-commit; use a correction event instead",
    );
  }
  return row;
}

export interface FramePayload {
  optionsConsidered: string[];
  optionEvidence: Record<string, Explain<unknown>>;
  reversibilityPlan?: string;
  /** Allowed to be set pre-commit (decision is still mutable); this lets
   * "decision debt" be detected for decisions that are still open but already
   * have a reality-based trigger defined. Frozen (no longer mutable) once the
   * decision is committed. */
  triggerConditions?: TriggerCondition[];
}

export async function frameDecision(
  decisionId: string,
  payload: FramePayload,
  actorId?: string | null,
): Promise<DecisionRecordView> {
  await ensureDecisionInvariants();
  const existing = await assertNotCommitted(decisionId);

  const [row] = await db
    .update(decisions)
    .set({
      optionsConsidered: payload.optionsConsidered,
      optionEvidence: payload.optionEvidence,
      reversibilityPlan: payload.reversibilityPlan ?? existing.reversibilityPlan,
      triggerConditions: payload.triggerConditions ?? (existing.triggerConditions as TriggerCondition[]) ?? [],
      status: "framed",
      framedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, decisionId))
    .returning();

  await recordTransition(decisionId, existing.status, "framed", actorId);
  await appendEvent({
    orgId: row.orgId,
    entityType: "decision",
    entityId: row.id,
    type: "decision.framed",
    payload: { optionsConsidered: payload.optionsConsidered },
    actorId,
  });
  return toView(row);
}

export async function markEvidenceGathered(
  decisionId: string,
  optionEvidence: Record<string, Explain<unknown>>,
  actorId?: string | null,
): Promise<DecisionRecordView> {
  await ensureDecisionInvariants();
  const existing = await assertNotCommitted(decisionId);

  const [row] = await db
    .update(decisions)
    .set({
      optionEvidence,
      status: "evidence_gathered",
      evidenceGatheredAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, decisionId))
    .returning();

  await recordTransition(decisionId, existing.status, "evidence_gathered", actorId);
  await appendEvent({
    orgId: row.orgId,
    entityType: "decision",
    entityId: row.id,
    type: "decision.evidence_gathered",
    payload: {},
    actorId,
  });
  return toView(row);
}

export interface AddDissentInput {
  who?: string | null;
  whoName: string;
  theCase: string;
  response?: string | null;
}

export async function addDissent(decisionId: string, input: AddDissentInput) {
  await ensureDecisionInvariants();
  const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!existing) throw new Error("decision not found");

  const isLate = Boolean(existing.committedAt);

  const [row] = await db
    .insert(decisionDissent)
    .values({
      decisionId,
      who: input.who ?? null,
      whoName: input.whoName,
      theCase: input.theCase,
      response: input.response ?? null,
      isLate,
    })
    .returning();

  await appendEvent({
    orgId: existing.orgId,
    entityType: "decision",
    entityId: decisionId,
    type: isLate ? "decision.late_dissent" : "decision.dissent_recorded",
    payload: { whoName: input.whoName, theCase: input.theCase },
  });

  if (isLate) {
    // Honesty rule: never rewrite the frozen snapshot. Log a correction event
    // instead so the record stays frozen but the late dissent is visible.
    await db.insert(decisionCorrections).values({
      decisionId,
      correctionType: "late_dissent",
      note: `Late dissent recorded after commit by ${input.whoName}. Decision record snapshot is unchanged (frozen); this dissent is shown as an addendum.`,
      payload: { whoName: input.whoName, theCase: input.theCase },
    });
  }

  return row;
}

export interface CommitDecisionInput {
  chosen: string;
  choiceRationale: string;
  expectedOutcome: string;
  expectedInterval?: { low: number; high: number; unit?: string };
  confidenceClass: "low" | "medium" | "high";
  reviewAt: string; // ISO
  decidedBy: string;
  triggerConditions?: TriggerCondition[];
}

/** Freezes the record: snapshots dissent + decision rights, sets committed_at.
 * After this call, the DB trigger makes any further field mutation fail. */
export async function commitDecision(
  decisionId: string,
  input: CommitDecisionInput,
): Promise<DecisionRecordView> {
  await ensureDecisionInvariants();
  const existing = await assertNotCommitted(decisionId);

  const dissentRows = await db
    .select()
    .from(decisionDissent)
    .where(and(eq(decisionDissent.decisionId, decisionId), eq(decisionDissent.isLate, false)));

  const dissentSnapshot: DissentEntry[] = dissentRows.map((d) => ({
    who: d.who,
    whoName: d.whoName,
    theCase: d.theCase,
    response: d.response,
  }));

  const [rightsConfig] = await db
    .select()
    .from(decisionRightsConfigs)
    .where(
      and(
        eq(decisionRightsConfigs.orgId, existing.orgId),
        eq(decisionRightsConfigs.decisionClass, existing.decisionClass),
      ),
    );

  const decisionRightsSnapshot = {
    role: rightsConfig?.deciderRole ?? null,
    consulted: (rightsConfig?.consultedRoles as string[]) ?? [],
    informed: (rightsConfig?.informedRoles as string[]) ?? [],
  };

  const [row] = await db
    .update(decisions)
    .set({
      chosen: input.chosen,
      choiceRationale: input.choiceRationale,
      expectedOutcome: input.expectedOutcome,
      expectedInterval: input.expectedInterval ?? null,
      confidenceClass: input.confidenceClass,
      reviewAt: new Date(input.reviewAt),
      decidedBy: input.decidedBy,
      decisionRightsSnapshot,
      dissentSnapshot,
      triggerConditions:
        input.triggerConditions ?? (existing.triggerConditions as TriggerCondition[]) ?? [],
      status: "decided",
      committedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(decisions.id, decisionId))
    .returning();

  await recordTransition(decisionId, existing.status, "decided", input.decidedBy);

  // Materialize trigger watches (use the final, merged trigger list)
  const finalTriggerConditions =
    input.triggerConditions ?? (existing.triggerConditions as TriggerCondition[]) ?? [];
  if (finalTriggerConditions.length) {
    await db.insert(decisionTriggerWatches).values(
      finalTriggerConditions.map((tc) => ({
        decisionId,
        signal: tc.signal,
        thresholdOp: tc.op,
        thresholdValue: String(tc.value),
      })),
    );
  }

  await appendEvent({
    orgId: row.orgId,
    entityType: "decision",
    entityId: row.id,
    type: "decision.committed",
    payload: {
      chosen: input.chosen,
      decidedBy: input.decidedBy,
      dissentCount: dissentSnapshot.length,
    },
    actorId: input.decidedBy,
  });

  return toView(row);
}

/** Attempt to mutate a frozen field directly — used ONLY by the immutability
 * property test to prove the mutation path is closed (expected to throw). */
export async function __TEST_ONLY_attemptFrozenMutation(decisionId: string) {
  await ensureDecisionInvariants();
  await db
    .update(decisions)
    .set({ question: "mutated after commit — should never persist" })
    .where(eq(decisions.id, decisionId));
}

export async function reviewDecision(
  decisionId: string,
  actorId?: string | null,
): Promise<DecisionRecordView> {
  await ensureDecisionInvariants();
  const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!existing) throw new Error("decision not found");
  if (!existing.committedAt) {
    throw new InvalidMutationError("invalid: cannot review a decision that has not been committed");
  }

  const [row] = await db
    .update(decisions)
    .set({ status: "reviewed", reviewedAt: new Date(), updatedAt: new Date() })
    .where(eq(decisions.id, decisionId))
    .returning();

  await recordTransition(decisionId, existing.status, "reviewed", actorId);
  await appendEvent({
    orgId: row.orgId,
    entityType: "decision",
    entityId: row.id,
    type: "decision.reviewed",
    payload: {},
    actorId,
  });
  return toView(row);
}

export async function addCorrection(
  decisionId: string,
  correctionType: string,
  note: string,
  payload: Record<string, unknown> = {},
  actorId?: string | null,
) {
  const [existing] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!existing) throw new Error("decision not found");

  const [row] = await db
    .insert(decisionCorrections)
    .values({ decisionId, correctionType, note, payload, actorId: actorId ?? null })
    .returning();

  await appendEvent({
    orgId: existing.orgId,
    entityType: "decision",
    entityId: decisionId,
    type: "decision.correction",
    payload: { correctionType, note },
    actorId,
  });

  return row;
}

async function recordTransition(
  decisionId: string,
  fromState: string | null,
  toState: string,
  actorId?: string | null,
) {
  await db.insert(decisionStateTransitions).values({
    decisionId,
    fromState,
    toState,
    actorId: actorId ?? null,
  });
}

export async function getDecision(decisionId: string): Promise<DecisionRecordView | null> {
  const [row] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  return row ? toView(row) : null;
}

export async function listDecisions(orgId: string): Promise<DecisionRecordView[]> {
  const rows = await db.select().from(decisions).where(eq(decisions.orgId, orgId));
  return rows.map(toView);
}

export { toView, DECISION_FUNNEL };
