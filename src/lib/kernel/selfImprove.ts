// Self-improvement, caged.
//
// Agents may PROPOSE rule/threshold/prompt changes. A proposal is evaluated
// in a sandbox against a golden dataset, producing a before/after scorecard.
// Merging requires a human approval recorded on the proposal — `mergeProposal`
// throws if that invariant doesn't hold, which is the thing that makes
// "silent self-modification of production behavior" architecturally
// impossible rather than merely discouraged:
//   1. `kernel_active_rules` (the only table production code reads rule
//      values from, e.g. `severity.ts#getDriftThreshold`) is never written
//      by anything except `mergeProposal`.
//   2. `mergeProposal` refuses unless `proposal.status === "approved"`.
//   3. `approveProposal` refuses unless `decidedBy.kind === "human"`.
// An agent therefore has no code path — not even a buggy one — that reaches
// production rule state without a human approval event in between.
import { db } from "@/db";
import { kernelActiveRules, kernelGoldenCases, kernelSelfImproveProposals } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { newId } from "./ids";
import { appendEvent } from "./events";
import type { Actor } from "./types";

export type ProposalRow = typeof kernelSelfImproveProposals.$inferSelect;

export class SelfImproveCagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SelfImproveCagingError";
  }
}

export async function proposeChange(params: {
  kind: "rule" | "threshold" | "prompt";
  ruleKey: string;
  title: string;
  rationale: string;
  before: unknown;
  after: unknown;
  proposedBy: Actor;
}): Promise<ProposalRow> {
  const id = newId("sip");
  const [row] = await db
    .insert(kernelSelfImproveProposals)
    .values({
      id,
      kind: params.kind,
      ruleKey: params.ruleKey,
      title: params.title,
      rationale: params.rationale,
      before: params.before as object,
      after: params.after as object,
      proposedBy: params.proposedBy as object,
    })
    .returning();

  await appendEvent({
    type: "self_improve.proposed",
    actor: params.proposedBy,
    correlationId: id,
    payload: row,
    notify: { topic: "approvals" },
  });

  return row;
}

function scoreAgainstCases(threshold: number, cases: Array<{ input: { relativeDrift: number }; expected: { severity: number } }>) {
  let correct = 0;
  for (const c of cases) {
    const ratio = c.input.relativeDrift / threshold;
    const predicted = ratio >= 1 ? 5 : ratio >= 0.75 ? 4 : ratio >= 0.5 ? 3 : ratio >= 0.25 ? 2 : 1;
    if (predicted === c.expected.severity) correct += 1;
  }
  return cases.length === 0 ? 1 : correct / cases.length;
}

/** Runs the proposal's before/after values against the golden dataset in a
 * pure, side-effect-free sandbox (it never touches `kernel_active_rules`).
 * Produces the scorecard required before a human can approve. */
export async function evaluateProposal(id: string, evaluator: Actor): Promise<ProposalRow> {
  const [proposal] = await db.select().from(kernelSelfImproveProposals).where(eq(kernelSelfImproveProposals.id, id)).limit(1);
  if (!proposal) throw new Error(`Proposal ${id} not found`);

  const cases = await db.select().from(kernelGoldenCases).where(eq(kernelGoldenCases.ruleKey, proposal.ruleKey));
  const typedCases = cases.map((c) => ({ input: c.input as { relativeDrift: number }, expected: c.expected as { severity: number } }));

  const beforeValue = (proposal.before as { threshold?: number }).threshold ?? 0.4;
  const afterValue = (proposal.after as { threshold?: number }).threshold ?? beforeValue;

  const beforeAccuracy = scoreAgainstCases(beforeValue, typedCases);
  const afterAccuracy = scoreAgainstCases(afterValue, typedCases);

  const scorecard = {
    caseCount: typedCases.length,
    beforeAccuracy,
    afterAccuracy,
    delta: afterAccuracy - beforeAccuracy,
    recommendation: afterAccuracy >= beforeAccuracy ? "accept" : "reject",
    evaluatedBy: evaluator,
    evaluatedAt: new Date().toISOString(),
  };

  const [row] = await db
    .update(kernelSelfImproveProposals)
    .set({ status: "evaluated", scorecard, evaluatedAt: new Date() })
    .where(eq(kernelSelfImproveProposals.id, id))
    .returning();

  await appendEvent({ type: "self_improve.evaluated", actor: evaluator, correlationId: id, payload: scorecard });

  return row;
}

/** Human-only gate. Agents cannot approve their own (or anyone's) proposal. */
export async function approveProposal(id: string, decision: "approved" | "rejected", decidedBy: Actor, note?: string): Promise<ProposalRow> {
  if (decidedBy.kind !== "human") {
    throw new SelfImproveCagingError("Self-improvement proposals can only be approved or rejected by a human actor.");
  }
  const [proposal] = await db.select().from(kernelSelfImproveProposals).where(eq(kernelSelfImproveProposals.id, id)).limit(1);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  if (proposal.status !== "evaluated") {
    throw new SelfImproveCagingError(`Proposal ${id} must be evaluated against the golden dataset before it can be approved (current status: ${proposal.status}).`);
  }

  const [row] = await db
    .update(kernelSelfImproveProposals)
    .set({ status: decision, decidedBy: decidedBy as object, decidedAt: new Date(), rationale: note ? `${proposal.rationale}\n\nDecision note: ${note}` : proposal.rationale })
    .where(eq(kernelSelfImproveProposals.id, id))
    .returning();

  await appendEvent({ type: "self_improve.decided", actor: decidedBy, correlationId: id, payload: { decision, note } });

  return row;
}

/** The only function in the kernel allowed to write `kernel_active_rules`.
 * Throws (does not silently no-op) if the human-approval invariant is not
 * satisfied — see `__tests__/selfImproveCaging.test.ts`. */
export async function mergeProposal(id: string, mergedBy: Actor): Promise<ProposalRow> {
  const [proposal] = await db.select().from(kernelSelfImproveProposals).where(eq(kernelSelfImproveProposals.id, id)).limit(1);
  if (!proposal) throw new Error(`Proposal ${id} not found`);
  if (proposal.status !== "approved") {
    throw new SelfImproveCagingError(`Proposal ${id} is not approved (status: ${proposal.status}); merge refused.`);
  }
  const decidedBy = proposal.decidedBy as Actor | null;
  if (!decidedBy || decidedBy.kind !== "human") {
    throw new SelfImproveCagingError(`Proposal ${id} has no recorded human approval; merge refused.`);
  }

  await db
    .insert(kernelActiveRules)
    .values({ ruleKey: proposal.ruleKey, value: proposal.after, updatedByProposalId: proposal.id })
    .onConflictDoUpdate({ target: kernelActiveRules.ruleKey, set: { value: proposal.after, updatedAt: new Date(), updatedByProposalId: proposal.id } });

  const [row] = await db
    .update(kernelSelfImproveProposals)
    .set({ status: "merged", mergedAt: new Date() })
    .where(eq(kernelSelfImproveProposals.id, id))
    .returning();

  await appendEvent({
    type: "self_improve.merged",
    actor: mergedBy,
    correlationId: id,
    payload: { ruleKey: proposal.ruleKey, before: proposal.before, after: proposal.after, scorecard: proposal.scorecard, approvedBy: decidedBy },
  });

  return row;
}

export async function listProposals(): Promise<ProposalRow[]> {
  return db.select().from(kernelSelfImproveProposals).orderBy(desc(kernelSelfImproveProposals.createdAt));
}

export async function seedGoldenCasesIfEmpty(): Promise<void> {
  const existing = await db.select().from(kernelGoldenCases).limit(1);
  if (existing.length > 0) return;
  const cases: Array<{ relativeDrift: number; severity: number }> = [
    { relativeDrift: 0.05, severity: 1 },
    { relativeDrift: 0.12, severity: 2 },
    { relativeDrift: 0.22, severity: 3 },
    { relativeDrift: 0.32, severity: 4 },
    { relativeDrift: 0.45, severity: 5 },
    { relativeDrift: 0.6, severity: 5 },
  ];
  for (const c of cases) {
    await db.insert(kernelGoldenCases).values({
      id: newId("golden"),
      name: `drift-${c.relativeDrift}`,
      ruleKey: "tripwire.drift.severity5Threshold",
      input: { relativeDrift: c.relativeDrift },
      expected: { severity: c.severity },
    });
  }
}
