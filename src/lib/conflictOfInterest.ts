// Conflict-of-interest registry: declarations, recusal tracking, and
// automated proximity warnings ("declarant is N hops from this decision's
// outcome") using the Part 31 stakeholder graph.

import { db } from "@/db";
import { conflictDeclarations, conflictRecusals, conflictProximityWarnings, decisions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { computeHops } from "@/lib/stakeholderGraph";
import { recordAudit } from "@/lib/audit";

const PROXIMITY_WARNING_THRESHOLD_HOPS = 2;

export async function declareConflict(params: { personId: number; interestDescription: string; relatedEntity: string }) {
  const [row] = await db
    .insert(conflictDeclarations)
    .values({
      personId: params.personId,
      interestDescription: params.interestDescription,
      relatedEntity: params.relatedEntity,
      status: "active",
    })
    .returning();

  await recordAudit({
    actorId: params.personId,
    action: "coi.declared",
    resourceType: "conflict_declaration",
    resourceId: row.id,
    metadata: { relatedEntity: params.relatedEntity },
  });

  return row;
}

export async function recordRecusal(params: { declarationId: number; decisionId: number }) {
  const [declaration] = await db.select().from(conflictDeclarations).where(eq(conflictDeclarations.id, params.declarationId));
  if (!declaration) throw new Error("Declaration not found");

  const [row] = await db
    .insert(conflictRecusals)
    .values({ declarationId: params.declarationId, decisionId: params.decisionId })
    .returning();

  await db.update(conflictDeclarations).set({ status: "recused" }).where(eq(conflictDeclarations.id, params.declarationId));

  // Resolve any open proximity warnings for this person+decision.
  await db
    .update(conflictProximityWarnings)
    .set({ resolved: true })
    .where(
      and(
        eq(conflictProximityWarnings.decisionId, params.decisionId),
        eq(conflictProximityWarnings.personId, declaration.personId),
      ),
    );

  await recordAudit({
    actorId: declaration.personId,
    action: "coi.recused",
    resourceType: "decision",
    resourceId: params.decisionId,
    metadata: { declarationId: params.declarationId },
  });

  return row;
}

/**
 * Check proximity between a declarant and a decision's outcome (the
 * decision's primary subject, falling back to the proposer). Creates a
 * proximity warning when hops <= threshold and no recusal already covers it.
 */
export async function checkProximity(personId: number, decisionId: number) {
  const [decisionRow] = await db.select().from(decisions).where(eq(decisions.id, decisionId));
  if (!decisionRow) throw new Error("Decision not found");

  const outcomePersonId = decisionRow.primarySubjectPersonId ?? decisionRow.proposedByPersonId;
  const result = await computeHops(personId, outcomePersonId);

  if (!result) {
    return { hops: null as number | null, warningCreated: false, path: [] as number[] };
  }

  if (result.hops <= PROXIMITY_WARNING_THRESHOLD_HOPS) {
    const existing = await db
      .select()
      .from(conflictProximityWarnings)
      .where(
        and(
          eq(conflictProximityWarnings.decisionId, decisionId),
          eq(conflictProximityWarnings.personId, personId),
          eq(conflictProximityWarnings.resolved, false),
        ),
      );
    if (existing.length === 0) {
      await db.insert(conflictProximityWarnings).values({
        decisionId,
        personId,
        hops: result.hops,
        path: result.path,
      });
      await recordAudit({
        actorId: personId,
        action: "coi.proximity_warning_raised",
        resourceType: "decision",
        resourceId: decisionId,
        metadata: { hops: result.hops, path: result.path },
      });
    }
    return { hops: result.hops, warningCreated: true, path: result.path };
  }

  return { hops: result.hops, warningCreated: false, path: result.path };
}

export async function listDeclarations() {
  return db.select().from(conflictDeclarations);
}

export async function listProximityWarnings(decisionId?: number) {
  if (decisionId != null) {
    return db.select().from(conflictProximityWarnings).where(eq(conflictProximityWarnings.decisionId, decisionId));
  }
  return db.select().from(conflictProximityWarnings);
}
