// Part 43 — Phase 1/3: the development graph + growth-path engine.
//
// Read-before-write check: `development.ts` did not previously exist in this
// sandbox (src/lib listed empty). Built fresh here, against the Part 09
// reconstruction in careers.ts/people.ts.
//
// Core rule (property-tested in scripts/test-dev-graph.ts): a growth path
// recommendation must cite real gap EVIDENCE — at least one evidence event
// that is NOT a self-rating — never self-ratings alone.

import { db } from "@/db";
import {
  competencies,
  evidenceEvents,
  experiences,
  growthGoals,
  growthPathRecommendations,
  relationshipTypes,
} from "@/db/schema";
import { COMPETENCY_ANCHORS, ROLE_TARGET_LEVEL } from "@/lib/careers";
import { explain, type Explain } from "@/lib/explain";
import { newId } from "@/lib/ids";
import { and, eq } from "drizzle-orm";

export type EvidenceEvent = typeof evidenceEvents.$inferSelect;
export type EvidenceEventType = EvidenceEvent["eventType"];
export type GrowthGoal = typeof growthGoals.$inferSelect;
export type Experience = typeof experiences.$inferSelect;
export type RelationshipType = typeof relationshipTypes.$inferSelect;

// Self-ratings count, but at a deliberately reduced weight relative to
// externally witnessed or outcome evidence, matching "progress via
// demonstrated-evidence events, not self-ratings alone."
const EVENT_WEIGHT_MULTIPLIER: Record<EvidenceEventType, number> = {
  self_rating: 0.4,
  manager_observation: 1,
  peer_feedback_theme: 0.9,
  demonstrated_outcome: 1.2,
};

export async function recordEvidenceEvent(params: {
  personId: string;
  competencyId: string;
  eventType: EvidenceEventType;
  narrative: string;
  evidenceWeight: number; // 1-5 raw strength as judged by the source
  sourceRef?: string;
  visibility?: "private" | "shared_with_manager";
}): Promise<EvidenceEvent> {
  const [row] = await db
    .insert(evidenceEvents)
    .values({
      id: newId("evidence"),
      personId: params.personId,
      competencyId: params.competencyId,
      eventType: params.eventType,
      narrative: params.narrative,
      evidenceWeight: params.evidenceWeight,
      sourceRef: params.sourceRef,
      visibility: params.visibility ?? "private",
    })
    .returning();
  return row;
}

export async function getEvidenceForPerson(personId: string): Promise<EvidenceEvent[]> {
  return db.select().from(evidenceEvents).where(eq(evidenceEvents.personId, personId));
}

export type CompetencyLevel = {
  competencyId: string;
  weightedLevel: number;
  nonSelfRatingEvidenceIds: string[];
  allEvidenceIds: string[];
};

/** Weighted evidence level per competency for a person, 0-5 scale. */
export async function computeCompetencyLevels(personId: string): Promise<CompetencyLevel[]> {
  const evidence = await getEvidenceForPerson(personId);
  const byCompetency = new Map<string, EvidenceEvent[]>();
  for (const e of evidence) {
    const list = byCompetency.get(e.competencyId) ?? [];
    list.push(e);
    byCompetency.set(e.competencyId, list);
  }

  const result: CompetencyLevel[] = [];
  for (const [competencyId, events] of byCompetency) {
    let weightedSum = 0;
    let weightTotal = 0;
    for (const e of events) {
      const w = EVENT_WEIGHT_MULTIPLIER[e.eventType];
      weightedSum += e.evidenceWeight * w;
      weightTotal += w;
    }
    const weightedLevel = weightTotal > 0 ? weightedSum / weightTotal : 0;
    result.push({
      competencyId,
      weightedLevel,
      nonSelfRatingEvidenceIds: events.filter((e) => e.eventType !== "self_rating").map((e) => e.id),
      allEvidenceIds: events.map((e) => e.id),
    });
  }
  return result;
}

export type GrowthGapGap = {
  competencyId: string;
  competencyLabel: string;
  currentLevel: number;
  targetLevel: number;
  gap: number;
  supportingEvidenceIds: string[];
};

/** A gap only "counts" for recommendation purposes if it is backed by at
 * least one non-self-rating evidence event for that competency — otherwise
 * it is a perception, not yet a demonstrated gap. */
export async function computeGaps(personId: string): Promise<GrowthGapGap[]> {
  const levels = await computeCompetencyLevels(personId);
  const gaps: GrowthGapGap[] = [];
  for (const level of levels) {
    const anchor = COMPETENCY_ANCHORS.find((c) => c.id === level.competencyId);
    if (!anchor) continue;
    const gap = ROLE_TARGET_LEVEL - level.weightedLevel;
    if (gap > 0 && level.nonSelfRatingEvidenceIds.length > 0) {
      gaps.push({
        competencyId: level.competencyId,
        competencyLabel: anchor.label,
        currentLevel: Number(level.weightedLevel.toFixed(2)),
        targetLevel: ROLE_TARGET_LEVEL,
        gap: Number(gap.toFixed(2)),
        supportingEvidenceIds: level.nonSelfRatingEvidenceIds,
      });
    }
  }
  return gaps.sort((a, b) => b.gap - a.gap);
}

export type GrowthPathRecommendation = {
  competencyId: string;
  recommendationType: "experience" | "relationship";
  refId: string;
  title: string;
};

/**
 * The path engine: for every real (evidence-backed) gap, surface the
 * catalog experience/relationship that targets it, wrapped in an
 * `Explain<T>` that cites the exact evidence rows, then persist an audit
 * row. Never recommends against a gap that only has self-rating backing.
 */
export async function recommendGrowthPaths(
  personId: string,
): Promise<Explain<GrowthPathRecommendation>[]> {
  const gaps = await computeGaps(personId);
  const allExperiences = await db.select().from(experiences);
  const allRelationships = await db.select().from(relationshipTypes);

  const recommendations: Explain<GrowthPathRecommendation>[] = [];

  for (const gap of gaps) {
    const matchingExperience = allExperiences.find((e) => e.competencyIds.includes(gap.competencyId));
    const matchingRelationship = allRelationships.find((r) => r.competencyIds.includes(gap.competencyId));

    if (matchingExperience) {
      const rec: GrowthPathRecommendation = {
        competencyId: gap.competencyId,
        recommendationType: "experience",
        refId: matchingExperience.id,
        title: matchingExperience.title,
      };
      const ex = explain(
        rec,
        `Stretch assignment "${matchingExperience.title}" because of a ${gap.gap.toFixed(1)}-point gap in ` +
          `${gap.competencyLabel} (current ${gap.currentLevel} vs target ${gap.targetLevel}), evidenced by ` +
          `${gap.supportingEvidenceIds.length} demonstrated/observed event(s).`,
        gap.supportingEvidenceIds,
        { gap },
      );
      recommendations.push(ex);
      await persistRecommendation(personId, gap, ex);
    }

    if (matchingRelationship) {
      const rec: GrowthPathRecommendation = {
        competencyId: gap.competencyId,
        recommendationType: "relationship",
        refId: matchingRelationship.id,
        title: `${matchingRelationship.kind} relationship: ${matchingRelationship.description}`,
      };
      const ex = explain(
        rec,
        `A ${matchingRelationship.kind} relationship because of a ${gap.gap.toFixed(1)}-point gap in ` +
          `${gap.competencyLabel} (current ${gap.currentLevel} vs target ${gap.targetLevel}), evidenced by ` +
          `${gap.supportingEvidenceIds.length} demonstrated/observed event(s).`,
        gap.supportingEvidenceIds,
        { gap },
      );
      recommendations.push(ex);
      await persistRecommendation(personId, gap, ex);
    }
  }

  return recommendations;
}

async function persistRecommendation(
  personId: string,
  gap: GrowthGapGap,
  ex: Explain<GrowthPathRecommendation>,
): Promise<void> {
  await db.insert(growthPathRecommendations).values({
    id: newId("growthrec"),
    personId,
    competencyId: gap.competencyId,
    gapSummary: `${gap.competencyLabel}: current ${gap.currentLevel} vs target ${gap.targetLevel} (gap ${gap.gap})`,
    recommendationType: ex.result.recommendationType,
    refId: ex.result.refId,
    rationale: ex.rationale,
    citedEvidenceIds: ex.citedEvidenceIds,
  });
}

// --- Growth goals -----------------------------------------------------

export async function createGrowthGoal(params: {
  personId: string;
  competencyId: string;
  title: string;
  description: string;
  targetDate?: Date;
  visibility?: "private" | "shared_with_manager";
}): Promise<GrowthGoal> {
  const [row] = await db
    .insert(growthGoals)
    .values({
      id: newId("goal"),
      personId: params.personId,
      competencyId: params.competencyId,
      title: params.title,
      description: params.description,
      targetDate: params.targetDate,
      visibility: params.visibility ?? "private",
    })
    .returning();
  return row;
}

export async function listGoals(personId: string): Promise<GrowthGoal[]> {
  return db.select().from(growthGoals).where(eq(growthGoals.personId, personId));
}

export async function sharedGoalsForManagerView(personId: string): Promise<GrowthGoal[]> {
  return db
    .select()
    .from(growthGoals)
    .where(and(eq(growthGoals.personId, personId), eq(growthGoals.visibility, "shared_with_manager")));
}

const STALLED_THRESHOLD_MS = 6 * 7 * 24 * 60 * 60 * 1000; // 6 weeks

/** A goal is "stalled" if it's active, shared, and has had no supporting
 * evidence event for its competency in STALLED_THRESHOLD_MS. Used by the
 * manager-nudge generator — never computed from anything the person hasn't
 * chosen to share. */
export async function findStalledSharedGoals(personId: string): Promise<GrowthGoal[]> {
  const goals = await sharedGoalsForManagerView(personId);
  const evidence = await getEvidenceForPerson(personId);
  const now = Date.now();

  return goals.filter((goal) => {
    if (goal.status !== "active") return false;
    const relatedEvidence = evidence.filter((e) => e.competencyId === goal.competencyId);
    const mostRecent = relatedEvidence.reduce<number>((latest, e) => {
      const t = new Date(e.occurredAt).getTime();
      return t > latest ? t : latest;
    }, new Date(goal.createdAt).getTime());
    return now - mostRecent > STALLED_THRESHOLD_MS;
  });
}

export async function allCompetencies() {
  return db.select().from(competencies);
}

export type StoredGrowthPathRecommendation = typeof growthPathRecommendations.$inferSelect;

export async function listStoredRecommendations(personId: string): Promise<StoredGrowthPathRecommendation[]> {
  return db.select().from(growthPathRecommendations).where(eq(growthPathRecommendations.personId, personId));
}
