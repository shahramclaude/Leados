/**
 * Part 51 — Impact History read model (Phase 2 "Impact History").
 * Accepted plays -> measured outcomes -> belief updates: the org's
 * management R&D record.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { recBeliefLog, recFeedback, recOutcomes, recRecommendations } from "@/db/schema";
import { getInterventionById } from "./registry";

export interface ImpactHistoryItem {
  recommendationId: string;
  interventionTitle: string;
  interventionSlug: string;
  contextKey: string;
  acceptedAt: string;
  outcomes: Array<{
    source: string;
    success: boolean;
    magnitude: number;
    verified: boolean;
    measuredAt: string;
  }>;
  beliefUpdates: Array<{
    beforeMean: number;
    afterMean: number;
    evidenceClassBefore: string;
    evidenceClassAfter: string;
    reason: string;
    at: string;
  }>;
}

export async function getImpactHistory(orgId: string): Promise<ImpactHistoryItem[]> {
  const accepted = await db
    .select({
      feedbackAction: recFeedback.action,
      feedbackCreatedAt: recFeedback.createdAt,
      recId: recRecommendations.id,
      recInterventionId: recRecommendations.interventionId,
      recContextKey: recRecommendations.contextKey,
    })
    .from(recFeedback)
    .innerJoin(recRecommendations, eq(recFeedback.recommendationId, recRecommendations.id))
    .where(eq(recFeedback.orgId, orgId))
    .orderBy(desc(recFeedback.createdAt));

  const acceptedOnly = accepted.filter((row) => row.feedbackAction === "accept");
  const items: ImpactHistoryItem[] = [];

  for (const row of acceptedOnly) {
    const rec = { id: row.recId, interventionId: row.recInterventionId, contextKey: row.recContextKey };
    const intervention = await getInterventionById(rec.interventionId);
    if (!intervention) continue;

    const outcomeRows = await db
      .select()
      .from(recOutcomes)
      .where(eq(recOutcomes.recommendationId, rec.id));

    const beliefRows = await db
      .select()
      .from(recBeliefLog)
      .where(eq(recBeliefLog.interventionId, rec.interventionId));

    const beliefForContext = beliefRows.filter((b) => b.contextKey === rec.contextKey);

    items.push({
      recommendationId: rec.id,
      interventionTitle: intervention.title,
      interventionSlug: intervention.slug,
      contextKey: rec.contextKey,
      acceptedAt: row.feedbackCreatedAt.toISOString(),
      outcomes: outcomeRows.map((o) => ({
        source: o.source,
        success: o.success,
        magnitude: o.magnitude,
        verified: o.verified,
        measuredAt: o.measuredAt.toISOString(),
      })),
      beliefUpdates: beliefForContext.map((b) => ({
        beforeMean: b.beforeAlpha / (b.beforeAlpha + b.beforeBeta),
        afterMean: b.afterAlpha / (b.afterAlpha + b.afterBeta),
        evidenceClassBefore: b.evidenceClassBefore,
        evidenceClassAfter: b.evidenceClassAfter,
        reason: b.reason,
        at: b.at.toISOString(),
      })),
    });
  }

  return items;
}
