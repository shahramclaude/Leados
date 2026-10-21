// Section E.4: classify.ts — assisted capture/classification. Turns a raw
// note/email into a *proposed* structured event. The proposal is written to
// capture_proposals and, if the proposer wants it to become a real event,
// it must go through invokeCapability("events.create", ...) — for an
// "agent" actor this capability's autoApprove() always returns false, so it
// always lands as pending_approval. Nothing is ever auto-written.
import { db } from "@/db";
import { captureProposals, entities } from "@/db/schema";
import { redactPii } from "@/lib/piiRedaction";
import { runPrompt } from "@/lib/agentCore";
import { classifyCapturePrompt } from "@/lib/promptRegistry";
import { invokeCapability, type Actor } from "@/lib/capabilityRegistry";
import { desc, eq } from "drizzle-orm";

export type ClassifyCaptureResult = {
  proposalId: string;
  proposedEntityType: string;
  proposedEntityName: string;
  eventType: string;
  summary: string;
  confidence: number;
  reasoning: string;
  degraded: boolean;
  modelCallId: number | null;
  redactionLabelsFound: string[];
};

export async function classifyCapture(
  sourceType: "note" | "email",
  rawText: string,
  actor: Actor = { kind: "agent", id: "classify.ts" },
): Promise<ClassifyCaptureResult> {
  const { redactedText, labelsFound } = redactPii(rawText);

  const knownEntities = await db.select({ name: entities.name }).from(entities).limit(200);

  const run = await runPrompt(
    classifyCapturePrompt,
    { redactedText, knownEntityNames: knownEntities.map((e) => e.name) },
    actor,
  );

  const [proposal] = await db
    .insert(captureProposals)
    .values({
      sourceType,
      rawText,
      redactedText,
      proposedEntityType: run.output.proposedEntityType,
      proposedEntityName: run.output.proposedEntityName,
      proposedEvent: {
        type: run.output.eventType,
        summary: run.output.summary,
        entityName: run.output.proposedEntityName,
        entityType: run.output.proposedEntityType,
      },
      confidence: run.output.confidence.toFixed(3),
      status: "pending",
      modelCallId: run.modelCallId,
    })
    .returning();

  return {
    proposalId: proposal.id,
    proposedEntityType: run.output.proposedEntityType,
    proposedEntityName: run.output.proposedEntityName,
    eventType: run.output.eventType,
    summary: run.output.summary,
    confidence: run.output.confidence,
    reasoning: run.output.reasoning,
    degraded: run.degraded,
    modelCallId: run.modelCallId,
    redactionLabelsFound: labelsFound,
  };
}

export async function listCaptureProposals(status?: "pending" | "approved" | "rejected") {
  const rows = await db.select().from(captureProposals).orderBy(desc(captureProposals.createdAt)).limit(100);
  return status ? rows.filter((r) => r.status === status) : rows;
}

/** Human approves a proposal: routes through the Part 07 capability registry (events.create), never writes `events` directly. */
export async function approveCaptureProposal(proposalId: string, approvedBy: string) {
  const [proposal] = await db.select().from(captureProposals).where(eq(captureProposals.id, proposalId)).limit(1);
  if (!proposal) throw new Error("Proposal not found");
  if (proposal.status !== "pending") throw new Error(`Proposal already ${proposal.status}`);

  const payload = proposal.proposedEvent as { type: string; summary: string; entityName: string; entityType: string };
  const invocation = await invokeCapability(
    "events.create",
    {
      entityName: payload.entityName,
      entityType: payload.entityType,
      type: payload.type,
      summary: payload.summary,
      payload: { fromCaptureProposalId: proposalId },
      source: "capture" as const,
    },
    { kind: "user", id: approvedBy },
  );

  // A human approving a capture proposal is itself the human-in-the-loop
  // approval the capability registry's policy gate is waiting for, so we
  // immediately approve the resulting pending invocation too.
  let finalInvocation = invocation;
  if (invocation.status === "pending_approval") {
    const { approveCapabilityInvocation } = await import("@/lib/capabilityRegistry");
    const result = await approveCapabilityInvocation(invocation.invocationId, approvedBy);
    finalInvocation = { status: "executed", invocationId: invocation.invocationId, result };
  }

  await db
    .update(captureProposals)
    .set({ status: "approved", reviewedBy: approvedBy, reviewedAt: new Date() })
    .where(eq(captureProposals.id, proposalId));

  return finalInvocation;
}

export async function rejectCaptureProposal(proposalId: string, reviewedBy: string) {
  await db
    .update(captureProposals)
    .set({ status: "rejected", reviewedBy, reviewedAt: new Date() })
    .where(eq(captureProposals.id, proposalId));
}
