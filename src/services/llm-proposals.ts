import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings, llmProposals } from "@/db/schema";
import { can } from "@/lib/permissions";
import { recordEvent } from "@/lib/envelope";
import { sanitizeCausalLanguage } from "@/lib/causal-language";
import { ValidationError, ForbiddenServiceError, NotFoundServiceError } from "@/lib/errors";
import type { SessionContext } from "@/lib/demo-auth";

export async function listProposals(session: SessionContext) {
  return db
    .select()
    .from(llmProposals)
    .where(eq(llmProposals.orgId, session.orgId))
    .orderBy(desc(llmProposals.createdAt));
}

/**
 * Simulates an LLM drafting commentary about a finding (see the longer note
 * in src/app/api/llm-proposals/route.ts). The causal-language rule
 * (Part 05) is unconditionally applied here, which is the seam
 * tests/seams/causal-language.test.ts proves.
 */
export async function createProposal(
  session: SessionContext,
  input: { findingId: string; draftText: string },
) {
  if (!can(session.role, "proposal:write")) {
    throw new ForbiddenServiceError("Role lacks proposal:write");
  }
  if (input.draftText.length < 3) throw new ValidationError("draftText too short");

  const [finding] = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, input.findingId), eq(findings.orgId, session.orgId)));

  if (!finding) throw new NotFoundServiceError("Finding not found in this org");

  const { sanitized, rewriteCount } = sanitizeCausalLanguage(input.draftText, finding.causalConfidence);

  const [proposal] = await db
    .insert(llmProposals)
    .values({
      orgId: session.orgId,
      findingId: finding.id,
      rawDraft: input.draftText,
      sanitizedDraft: sanitized,
      causalRewrites: rewriteCount,
      status: "draft",
    })
    .returning();

  await recordEvent({
    orgId: session.orgId,
    actorType: "llm",
    actorId: "leados-draft-assistant",
    action: "llm_proposal.created",
    entityType: "llm_proposal",
    entityId: proposal.id,
    payload: { findingId: finding.id, causalRewrites: rewriteCount },
  });

  return proposal;
}
