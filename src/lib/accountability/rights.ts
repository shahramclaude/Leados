// LEADOS — Part 56: individual rights machinery.
// Right to explanation, contestation (generalized Part 09 workflow), and
// opt-out where policy allows. All access is authorization-checked here —
// pages/API routes must go through these functions, never query the tables
// directly for person-facing data.
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { algoSystems, contestations, decisionRecords, explanations, optOuts } from "@/db/schema";
import { appendAuditEntry } from "./auditChain";
import { findPerson, type PersonRole } from "./people";

export class AccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessDeniedError";
  }
}

export interface Requester {
  personKey: string;
  role: PersonRole;
}

/** Roles permitted to view another person's decisions/explanations for
 * oversight purposes. "engineer" is deliberately excluded: the people who
 * build the model should not have standing ad-hoc access to individuals'
 * personal decision records without an auditor/reviewer/admin hat on. */
const OVERSIGHT_ROLES: PersonRole[] = ["admin", "auditor", "reviewer"];

export function assertCanViewSubjectData(requester: Requester, subjectId: string) {
  if (requester.personKey === subjectId) return;
  if (OVERSIGHT_ROLES.includes(requester.role)) return;
  throw new AccessDeniedError(
    `${requester.personKey} (role=${requester.role}) is not authorized to view decisions/explanations for subject ${subjectId}.`,
  );
}

export function resolveRequester(personKey: string | undefined | null): Requester {
  const person = findPerson(personKey ?? undefined);
  if (!person) {
    throw new AccessDeniedError(`Unknown requester identity: ${personKey ?? "(none)"}`);
  }
  return { personKey: person.personKey, role: person.role };
}

// ---------------------------------------------------------------------------
// Decisions + explanations (right to explanation)
// ---------------------------------------------------------------------------
export async function recordDecision(params: {
  systemKey: string;
  subjectId: string;
  outputSummary: Record<string, unknown>;
  explanationSummary: string;
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
  actorId: string;
}) {
  const [system] = await db.select().from(algoSystems).where(eq(algoSystems.systemKey, params.systemKey));
  if (!system) throw new Error(`Unknown system: ${params.systemKey}`);

  const [decision] = await db
    .insert(decisionRecords)
    .values({
      systemKey: params.systemKey,
      subjectId: params.subjectId,
      decisionRole: system.decisionRole,
      outputSummary: params.outputSummary,
      requiresHumanReview: system.requiresHumanReview,
      humanReviewStatus: system.requiresHumanReview ? "pending" : "not_required",
    })
    .returning();

  const [explanation] = await db
    .insert(explanations)
    .values({
      decisionRecordId: decision.id,
      systemKey: params.systemKey,
      subjectId: params.subjectId,
      summary: params.explanationSummary,
      factors: params.factors,
      modelCardRef: `${params.systemKey}`,
    })
    .returning();

  await appendAuditEntry({
    systemKey: params.systemKey,
    actorId: params.actorId,
    action: "decision_recorded",
    payload: { decisionId: decision.id, subjectId: params.subjectId, decisionRole: system.decisionRole },
  });

  return { decision, explanation };
}

export async function getDecisionsForSubject(requester: Requester, subjectId: string) {
  assertCanViewSubjectData(requester, subjectId);
  return db
    .select()
    .from(decisionRecords)
    .where(eq(decisionRecords.subjectId, subjectId))
    .orderBy(desc(decisionRecords.createdAt));
}

export async function getExplanationForDecision(requester: Requester, decisionRecordId: number) {
  const [decision] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, decisionRecordId));
  if (!decision) return null;
  assertCanViewSubjectData(requester, decision.subjectId);

  const [explanation] = await db
    .select()
    .from(explanations)
    .where(eq(explanations.decisionRecordId, decisionRecordId));
  return explanation ?? null;
}

export async function confirmHumanReview(params: {
  decisionRecordId: number;
  reviewerId: string;
  outcome: "confirmed" | "overridden";
  notes: string;
}) {
  const [row] = await db
    .update(decisionRecords)
    .set({
      humanReviewStatus: params.outcome,
      humanReviewerId: params.reviewerId,
      humanReviewedAt: new Date(),
      humanReviewNotes: params.notes,
    })
    .where(eq(decisionRecords.id, params.decisionRecordId))
    .returning();

  if (row) {
    await appendAuditEntry({
      systemKey: row.systemKey,
      actorId: params.reviewerId,
      action: "human_review_recorded",
      payload: { decisionRecordId: params.decisionRecordId, outcome: params.outcome },
    });
  }
  return row;
}

// ---------------------------------------------------------------------------
// Contestation (generalized Part 09 workflow)
// ---------------------------------------------------------------------------
export async function fileContestation(params: { decisionRecordId: number; subjectId: string; reason: string }) {
  const [decision] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, params.decisionRecordId));
  if (!decision) throw new Error("Decision not found");
  if (decision.subjectId !== params.subjectId) {
    throw new AccessDeniedError("Only the subject of a decision may file a contestation against it.");
  }

  const [row] = await db
    .insert(contestations)
    .values({
      decisionRecordId: params.decisionRecordId,
      subjectId: params.subjectId,
      reason: params.reason,
      status: "submitted",
    })
    .returning();

  await appendAuditEntry({
    systemKey: decision.systemKey,
    actorId: params.subjectId,
    action: "contestation_filed",
    payload: { contestationId: row.id, decisionRecordId: params.decisionRecordId },
  });

  return row;
}

export async function resolveContestation(params: {
  contestationId: number;
  requester: Requester;
  status: "under_review" | "upheld" | "overturned" | "dismissed";
  resolutionNotes: string;
}) {
  if (!OVERSIGHT_ROLES.includes(params.requester.role)) {
    throw new AccessDeniedError(
      `${params.requester.personKey} (role=${params.requester.role}) may not resolve contestations. Oversight roles only.`,
    );
  }

  const [existing] = await db.select().from(contestations).where(eq(contestations.id, params.contestationId));
  if (!existing) throw new Error("Contestation not found");

  const isTerminal = ["upheld", "overturned", "dismissed"].includes(params.status);
  const [row] = await db
    .update(contestations)
    .set({
      status: params.status,
      reviewerId: params.requester.personKey,
      resolutionNotes: params.resolutionNotes,
      resolvedAt: isTerminal ? new Date() : null,
    })
    .where(eq(contestations.id, params.contestationId))
    .returning();

  const [decision] = await db.select().from(decisionRecords).where(eq(decisionRecords.id, existing.decisionRecordId));

  await appendAuditEntry({
    systemKey: decision?.systemKey ?? "unknown",
    actorId: params.requester.personKey,
    action: "contestation_resolved",
    payload: { contestationId: params.contestationId, status: params.status },
  });

  return row;
}

export async function getContestationsForSubject(requester: Requester, subjectId: string) {
  assertCanViewSubjectData(requester, subjectId);
  return db
    .select()
    .from(contestations)
    .where(eq(contestations.subjectId, subjectId))
    .orderBy(desc(contestations.createdAt));
}

// ---------------------------------------------------------------------------
// Opt-out
// ---------------------------------------------------------------------------
export async function requestOptOut(params: { systemKey: string; subjectId: string; scope: string }) {
  const [system] = await db.select().from(algoSystems).where(eq(algoSystems.systemKey, params.systemKey));
  if (!system) throw new Error(`Unknown system: ${params.systemKey}`);

  const status = system.optOutAllowed ? "active" : "denied";
  const limitationsNote = system.optOutLimits;

  const [row] = await db
    .insert(optOuts)
    .values({
      systemKey: params.systemKey,
      subjectId: params.subjectId,
      scope: params.scope,
      status,
      limitationsNote,
      effectiveAt: status === "active" ? new Date() : null,
    })
    .returning();

  await appendAuditEntry({
    systemKey: params.systemKey,
    actorId: params.subjectId,
    action: "opt_out_requested",
    payload: { subjectId: params.subjectId, result: status },
  });

  return row;
}

export async function getOptOutsForSubject(requester: Requester, subjectId: string) {
  assertCanViewSubjectData(requester, subjectId);
  return db.select().from(optOuts).where(eq(optOuts.subjectId, subjectId)).orderBy(desc(optOuts.requestedAt));
}
