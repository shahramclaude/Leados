// Obligation-graph cascade analysis: change-of-control / M&A trigger propagation (Phase 1 "Obligation
// graph", Phase 3c). Seam to Part 54: `cascadeTriggers.sourceSeam` / `externalEventRef` identify the
// planned corporate-action event that originates in Part 54's M&A planning module; we do not model
// M&A planning itself here, only its legal-contract blast radius.
//
// HONESTY: cascade impacts are generated from *confirmed* clauses only. An unconfirmed draft
// change-of-control clause cannot trigger a cascade impact record — this mirrors the human-confirmation
// gate used everywhere else in this part.

import { db } from "@/db";
import { cascadeImpacts, cascadeTriggers, clauses, contracts } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export interface CascadeImpactResult {
  contractId: number;
  contractTitle: string;
  clauseId: number;
  severity: "low" | "medium" | "high" | "critical";
  impactDescription: string;
}

/**
 * Evaluates a change-of-control (or other) cascade trigger against every active contract, looking for
 * CONFIRMED `change_of_control` clauses. Writes a `cascadeImpacts` row per hit and returns the set of
 * impacts computed. Idempotent-ish: callers typically run this once per planned corporate action and
 * inspect the stored impacts afterward via `listCascadeImpacts`.
 */
export async function runChangeOfControlCascade(triggerId: number): Promise<CascadeImpactResult[]> {
  const [trigger] = await db.select().from(cascadeTriggers).where(eq(cascadeTriggers.id, triggerId));
  if (!trigger) throw new Error("Cascade trigger not found");

  const confirmedCocClauses = await db
    .select({
      clauseId: clauses.id,
      contractId: clauses.contractId,
      excerptText: clauses.excerptText,
    })
    .from(clauses)
    .where(and(eq(clauses.clauseType, "change_of_control"), eq(clauses.status, "confirmed")));

  const results: CascadeImpactResult[] = [];

  for (const row of confirmedCocClauses) {
    if (!row.contractId) continue;
    const [contract] = await db.select().from(contracts).where(eq(contracts.id, row.contractId));
    if (!contract) continue;

    // Simple, explainable severity heuristic: auto-renewing contracts with short notice windows are
    // higher severity because the acquirer has less time to react before the counterparty can exit.
    const severity: CascadeImpactResult["severity"] =
      contract.terminationNoticeDays <= 30 ? "high" : contract.terminationNoticeDays <= 60 ? "medium" : "low";

    const impactDescription =
      `Change-of-control clause in "${contract.title}" may let ${"the counterparty"} terminate ` +
      `following trigger "${trigger.name}" (${trigger.triggerType}). Notice window: ${contract.terminationNoticeDays} days.`;

    await db.insert(cascadeImpacts).values({
      cascadeTriggerId: triggerId,
      clauseId: row.clauseId,
      contractId: contract.id,
      impactDescription,
      severity,
    });

    results.push({
      contractId: contract.id,
      contractTitle: contract.title,
      clauseId: row.clauseId,
      severity,
      impactDescription,
    });
  }

  return results;
}

export async function listCascadeImpacts(triggerId: number) {
  return db.select().from(cascadeImpacts).where(eq(cascadeImpacts.cascadeTriggerId, triggerId));
}
