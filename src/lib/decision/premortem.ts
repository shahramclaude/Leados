// =============================================================================
// LEADOS — Part 23 — Pre-mortem workflow
// =============================================================================
// "Assume this decision failed. Why?" — captured BEFORE or AT commit for major
// decisions (type1, or impact >= 4), surfaced again at review time so the
// predicted failure modes can be checked against what actually happened.
// =============================================================================

import { db } from "@/db";
import { preMortems, decisions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { appendEvent } from "./eventLog";

export function isMajorDecision(decisionType: string, impact: number): boolean {
  return decisionType === "type1" || impact >= 4;
}

export interface CreatePreMortemInput {
  decisionId: string;
  reasons: string[];
  mitigations?: string[];
  createdBy?: string | null;
}

export async function createPreMortem(input: CreatePreMortemInput) {
  const [decision] = await db.select().from(decisions).where(eq(decisions.id, input.decisionId));
  if (!decision) throw new Error("decision not found");

  const [row] = await db
    .insert(preMortems)
    .values({
      decisionId: input.decisionId,
      reasons: input.reasons,
      mitigations: input.mitigations ?? [],
      createdBy: input.createdBy ?? null,
    })
    .returning();

  await appendEvent({
    orgId: decision.orgId,
    entityType: "decision",
    entityId: input.decisionId,
    type: "decision.premortem_created",
    payload: { reasonCount: input.reasons.length },
    actorId: input.createdBy ?? null,
  });

  return row;
}

export async function listPreMortems(decisionId: string) {
  return db
    .select()
    .from(preMortems)
    .where(eq(preMortems.decisionId, decisionId))
    .orderBy(desc(preMortems.createdAt));
}
