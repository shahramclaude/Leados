// src/lib/leaderState/research.ts
//
// Opt-in, anonymized-at-read-time research contribution path. A person may
// choose to contribute a derived metric (e.g. their own weekly average
// decision load) into a cohort. Individual contributions are never exposed;
// reads are always aggregates, and any aggregate whose contributing cohort
// is smaller than K_ANONYMITY_THRESHOLD is suppressed outright.

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leaderStateResearchContributions } from "@/db/schema";
import { applyKAnonymity } from "@/lib/privacy";
import type { ActorContext } from "@/lib/privacy";

export class AccessDeniedError extends Error {}

function assertSelf(actor: ActorContext, ownerUserId: string): void {
  if (actor.userId !== ownerUserId) {
    throw new AccessDeniedError(
      `Access denied: role="${actor.role}" actor="${actor.userId}" attempted to manage research ` +
        `contributions owned by "${ownerUserId}".`,
    );
  }
}

export async function contributeResearchMetric(
  actor: ActorContext,
  ownerUserId: string,
  params: { cohortKey: string; metricType: string; metricValue: number },
): Promise<{ id: string }> {
  assertSelf(actor, ownerUserId);
  const [row] = await db
    .insert(leaderStateResearchContributions)
    .values({
      id: randomUUID(),
      ownerUserId,
      cohortKey: params.cohortKey,
      metricType: params.metricType,
      metricValue: params.metricValue.toString(),
    })
    .returning({ id: leaderStateResearchContributions.id });
  return row;
}

export async function listMyResearchContributions(actor: ActorContext, ownerUserId: string) {
  assertSelf(actor, ownerUserId);
  return db
    .select()
    .from(leaderStateResearchContributions)
    .where(eq(leaderStateResearchContributions.ownerUserId, ownerUserId));
}

export interface ResearchAggregateResult {
  suppressed: boolean;
  cohortKey: string;
  metricType: string;
  cohortSize: number;
  average?: number;
}

/**
 * Org-visible read path. Always goes through `applyKAnonymity`: if fewer
 * than K_ANONYMITY_THRESHOLD distinct people contributed to this
 * cohort+metric, the result is suppressed and no average is returned at all
 * (not even a rounded or noisy one).
 */
export async function readResearchAggregate(cohortKey: string, metricType: string): Promise<ResearchAggregateResult> {
  const rows = await db
    .select({
      ownerUserId: leaderStateResearchContributions.ownerUserId,
      metricValue: leaderStateResearchContributions.metricValue,
    })
    .from(leaderStateResearchContributions)
    .where(
      and(
        eq(leaderStateResearchContributions.cohortKey, cohortKey),
        eq(leaderStateResearchContributions.metricType, metricType),
      ),
    );

  const distinctOwners = new Set(rows.map((r) => r.ownerUserId));
  const cohortSize = distinctOwners.size;

  const gate = applyKAnonymity(cohortSize, rows);
  if (gate.suppressed) {
    return { suppressed: true, cohortKey, metricType, cohortSize };
  }

  const values = gate.value.map((r) => Number(r.metricValue));
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  return { suppressed: false, cohortKey, metricType, cohortSize, average: Math.round(average * 100) / 100 };
}
