// LEADOS — Part 56: Impact assessment workflow (algorithmic AIA-style).
//
// Lifecycle: draft -> in_review -> approved -> (superseded on next version).
// A model update (or scheduled/incident trigger) always creates a brand new
// draft version and marks the previously-approved version "superseded" —
// this is the "change triggers reassessment" guarantee (Phase 4 gate 2),
// and is exercised live by scripts/test-change-trigger.ts.
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { algoSystems, impactAssessments } from "@/db/schema";
import { appendAuditEntry } from "./auditChain";

export type AssessmentTrigger = "initial" | "model_update" | "scheduled" | "incident";

export interface AssessmentDraftInput {
  systemKey: string;
  purpose: string;
  proportionality: string;
  affectedPartiesText: string;
  risksToRights: string;
  dataGovernance: string;
  humanOversightText: string;
  accuracyRobustness: string;
  transparencyText: string;
  linkedExperimentIds: string[];
  triggeredBy: AssessmentTrigger;
  actorId: string;
}

export async function getAssessmentHistory(systemKey: string) {
  return db
    .select()
    .from(impactAssessments)
    .where(eq(impactAssessments.systemKey, systemKey))
    .orderBy(desc(impactAssessments.version));
}

export async function getLatestAssessment(systemKey: string) {
  const [row] = await getAssessmentHistory(systemKey);
  return row ?? null;
}

async function nextVersion(systemKey: string): Promise<number> {
  const history = await getAssessmentHistory(systemKey);
  return history.length === 0 ? 1 : history[0].version + 1;
}

/** Creates a new draft assessment version for a system, superseding any
 * currently-approved version. This is the single entry point both the
 * initial-assessment flow and the change-trigger flow go through, so the
 * superseding behaviour can never be skipped. */
export async function createAssessmentDraft(input: AssessmentDraftInput) {
  const version = await nextVersion(input.systemKey);

  const previouslyApproved = await db
    .select()
    .from(impactAssessments)
    .where(and(eq(impactAssessments.systemKey, input.systemKey), eq(impactAssessments.status, "approved")));

  for (const prior of previouslyApproved) {
    await db
      .update(impactAssessments)
      .set({ status: "superseded" })
      .where(eq(impactAssessments.id, prior.id));
  }

  const [row] = await db
    .insert(impactAssessments)
    .values({
      systemKey: input.systemKey,
      version,
      status: "draft",
      purpose: input.purpose,
      proportionality: input.proportionality,
      affectedPartiesText: input.affectedPartiesText,
      risksToRights: input.risksToRights,
      dataGovernance: input.dataGovernance,
      humanOversightText: input.humanOversightText,
      accuracyRobustness: input.accuracyRobustness,
      transparencyText: input.transparencyText,
      linkedExperimentIds: input.linkedExperimentIds,
      triggeredBy: input.triggeredBy,
    })
    .returning();

  await appendAuditEntry({
    systemKey: input.systemKey,
    actorId: input.actorId,
    action: "assessment_draft_created",
    payload: { version, triggeredBy: input.triggeredBy, supersededCount: previouslyApproved.length },
  });

  return row;
}

export async function submitForReview(assessmentId: number, actorId: string) {
  const [row] = await db
    .update(impactAssessments)
    .set({ status: "in_review" })
    .where(eq(impactAssessments.id, assessmentId))
    .returning();

  if (row) {
    await appendAuditEntry({
      systemKey: row.systemKey,
      actorId,
      action: "assessment_submitted_for_review",
      payload: { assessmentId, version: row.version },
    });
  }
  return row;
}

export async function approveAssessment(assessmentId: number, reviewerId: string, reviewerRole: string) {
  const [row] = await db
    .update(impactAssessments)
    .set({ status: "approved", reviewerId, reviewerRole, reviewedAt: new Date() })
    .where(eq(impactAssessments.id, assessmentId))
    .returning();

  if (row) {
    await appendAuditEntry({
      systemKey: row.systemKey,
      actorId: reviewerId,
      action: "assessment_approved",
      payload: { assessmentId, version: row.version, reviewerRole },
    });
  }
  return row;
}

/**
 * Called whenever a model/system changes in a way that could alter risk
 * (new model card version, weight recalibration, scope change, etc). Always
 * produces a new draft assessment, bumps the system's version counter, and
 * records the trigger in the audit chain. There is deliberately no path to
 * "update the model and skip this" — see scripts/test-change-trigger.ts.
 */
export async function onModelUpdated(params: {
  systemKey: string;
  actorId: string;
  reason: string;
  linkedExperimentIds?: string[];
}) {
  const [system] = await db.select().from(algoSystems).where(eq(algoSystems.systemKey, params.systemKey));
  if (!system) {
    throw new Error(`Unknown system: ${params.systemKey}`);
  }

  const latest = await getLatestAssessment(params.systemKey);

  await db
    .update(algoSystems)
    .set({ version: system.version + 1, updatedAt: new Date() })
    .where(eq(algoSystems.systemKey, params.systemKey));

  const draft = await createAssessmentDraft({
    systemKey: params.systemKey,
    purpose: latest?.purpose ?? system.purpose,
    proportionality: latest?.proportionality ?? "Reassessment pending — carried over from prior version.",
    affectedPartiesText: latest?.affectedPartiesText ?? system.affectedParties,
    risksToRights: `REASSESS: ${params.reason}. Prior assessment risks carried over pending reviewer update: ${
      latest?.risksToRights ?? "n/a"
    }`,
    dataGovernance: latest?.dataGovernance ?? "Carried over from prior version — reviewer must confirm unchanged.",
    humanOversightText: latest?.humanOversightText ?? system.oversightMethod,
    accuracyRobustness: `Pending re-measurement after model update: ${params.reason}`,
    transparencyText: latest?.transparencyText ?? "Carried over from prior version — reviewer must confirm unchanged.",
    linkedExperimentIds: params.linkedExperimentIds ?? [],
    triggeredBy: "model_update",
    actorId: params.actorId,
  });

  await appendAuditEntry({
    systemKey: params.systemKey,
    actorId: params.actorId,
    action: "model_updated",
    payload: { reason: params.reason, newSystemVersion: system.version + 1, forcedAssessmentVersion: draft.version },
  });

  return draft;
}
