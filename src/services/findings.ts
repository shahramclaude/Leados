// Service layer rule (docs/GLOSSARY.md + coherence checklist): route handlers
// under src/app/api only resolve identity and HTTP concerns; all business
// logic lives in src/services/* so it can be unit/seam tested without a Next
// request context (cookies() cannot be called outside one).
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { findings } from "@/db/schema";
import { can } from "@/lib/permissions";
import { recordEvent } from "@/lib/envelope";
import { ValidationError, ForbiddenServiceError } from "@/lib/errors";
import type { SessionContext } from "@/lib/demo-auth";
import type { Explain } from "@/lib/explain";

export { ForbiddenServiceError } from "@/lib/errors";

export type CreateFindingInput = {
  domain: "intelligence" | "people" | "finance";
  title: string;
  summary: string;
  causalConfidence: "correlational" | "causal" | "experimental";
  explanation: Explain<Record<string, unknown>>;
};

export async function listFindings(session: SessionContext) {
  if (!can(session.role, "finding:read")) {
    throw new ForbiddenServiceError("Role lacks finding:read");
  }
  return db
    .select()
    .from(findings)
    .where(eq(findings.orgId, session.orgId))
    .orderBy(desc(findings.createdAt));
}

export async function getFinding(session: SessionContext, id: string) {
  if (!can(session.role, "finding:read")) {
    throw new ForbiddenServiceError("Role lacks finding:read");
  }
  const [row] = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, id), eq(findings.orgId, session.orgId)));
  return row ?? null;
}

export async function createFinding(session: SessionContext, input: CreateFindingInput) {
  if (!can(session.role, "finding:write")) {
    throw new ForbiddenServiceError("Role lacks finding:write");
  }
  if (input.title.length < 3) throw new ValidationError("title must be at least 3 characters");
  if (input.summary.length < 3) throw new ValidationError("summary must be at least 3 characters");

  const [created] = await db
    .insert(findings)
    .values({
      orgId: session.orgId,
      domain: input.domain,
      title: input.title,
      summary: input.summary,
      causalConfidence: input.causalConfidence,
      explanation: input.explanation,
      source: "human",
      createdBy: session.userId,
    })
    .returning();

  await recordEvent({
    orgId: session.orgId,
    actorType: "human",
    actorId: session.userId,
    action: "finding.created",
    entityType: "finding",
    entityId: created.id,
    payload: { title: created.title, domain: created.domain },
  });

  return created;
}
