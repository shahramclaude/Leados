// =============================================================================
// LEADOS — Part 23 — Decision rights (RACI-style) engine + ambiguity detection
// =============================================================================

import { db } from "@/db";
import { decisionRightsConfigs, decisions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export interface DecisionRightsInput {
  orgId: string;
  decisionClass: string;
  deciderRole: string | null;
  consultedRoles: string[];
  informedRoles: string[];
}

export async function upsertDecisionRights(input: DecisionRightsInput) {
  const existing = await db
    .select()
    .from(decisionRightsConfigs)
    .where(
      and(
        eq(decisionRightsConfigs.orgId, input.orgId),
        eq(decisionRightsConfigs.decisionClass, input.decisionClass),
      ),
    );

  if (existing.length) {
    const [row] = await db
      .update(decisionRightsConfigs)
      .set({
        deciderRole: input.deciderRole,
        consultedRoles: input.consultedRoles,
        informedRoles: input.informedRoles,
        updatedAt: new Date(),
      })
      .where(eq(decisionRightsConfigs.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(decisionRightsConfigs)
    .values({
      orgId: input.orgId,
      decisionClass: input.decisionClass,
      deciderRole: input.deciderRole,
      consultedRoles: input.consultedRoles,
      informedRoles: input.informedRoles,
    })
    .returning();
  return row;
}

export async function listDecisionRights(orgId: string) {
  return db.select().from(decisionRightsConfigs).where(eq(decisionRightsConfigs.orgId, orgId));
}

export interface AmbiguityFinding {
  decisionClass: string;
  decisionCount: number;
  message: string;
}

/** Surfaces a Finding for any decision class in active use that has no
 * configured decider — "this class has no decider configured". */
export async function detectAmbiguousDecisionRights(orgId: string): Promise<AmbiguityFinding[]> {
  const configs = await db
    .select()
    .from(decisionRightsConfigs)
    .where(eq(decisionRightsConfigs.orgId, orgId));

  const configByClass = new Map(configs.map((c) => [c.decisionClass, c]));

  const rows = await db.select().from(decisions).where(eq(decisions.orgId, orgId));
  const classCounts = new Map<string, number>();
  for (const r of rows) {
    classCounts.set(r.decisionClass, (classCounts.get(r.decisionClass) ?? 0) + 1);
  }

  const findings: AmbiguityFinding[] = [];
  for (const [decisionClass, decisionCount] of classCounts) {
    const cfg = configByClass.get(decisionClass);
    if (!cfg || !cfg.deciderRole) {
      findings.push({
        decisionClass,
        decisionCount,
        message: `Decision class "${decisionClass}" has no decider configured — ${decisionCount} decision(s) are affected. Configure decision rights to resolve this ambiguity.`,
      });
    }
  }
  return findings;
}
