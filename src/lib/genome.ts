// src/lib/genome.ts
//
// The organizational "genome": a compact, computed read-model of recurring
// traits distilled from the knowledge graph + institutional memory +
// playbook usage. It never stores anything itself — every call recomputes
// from source tables — so it can never drift from ground truth. Consumed by
// synthesis.ts (narrative framing) and the knowledge dashboard.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { relations, retrospectives, playbookRuns, playbooks } from "@/db/schema";
import { jaccard } from "@/lib/memory";

export interface RelationTypeMix {
  type: string;
  count: number;
  share: number;
}

export interface GenomeTag {
  tag: string;
  count: number;
}

export interface OrganizationalGenome {
  relationMix: RelationTypeMix[];
  dominantValence: { valence: string; count: number }[];
  topLessonTags: GenomeTag[];
  decisionVelocityPerMonth: number; // retrospectives recorded per month, trailing 6 months
  playbookAdoptionRate: number; // completed runs / total runs (0..1)
  activePlaybookCount: number;
}

export async function computeGenome(): Promise<OrganizationalGenome> {
  const relationRows = await db.select({ type: relations.type }).from(relations);
  const relationCounts = new Map<string, number>();
  for (const r of relationRows) relationCounts.set(r.type, (relationCounts.get(r.type) ?? 0) + 1);
  const totalRelations = relationRows.length || 1;
  const relationMix = [...relationCounts.entries()]
    .map(([type, count]) => ({ type, count, share: count / totalRelations }))
    .sort((a, b) => b.count - a.count);

  const retroRows = await db.select().from(retrospectives);
  const valenceCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();
  for (const r of retroRows) {
    valenceCounts.set(r.outcomeValence, (valenceCounts.get(r.outcomeValence) ?? 0) + 1);
    for (const tag of (r.tags as string[]) ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const dominantValence = [...valenceCounts.entries()]
    .map(([valence, count]) => ({ valence, count }))
    .sort((a, b) => b.count - a.count);
  const topLessonTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const recentRetros = retroRows.filter((r) => new Date(r.occurredAt) >= sixMonthsAgo);
  const decisionVelocityPerMonth = recentRetros.length / 6;

  const runRows = await db.select().from(playbookRuns);
  const completed = runRows.filter((r) => r.status === "completed").length;
  const playbookAdoptionRate = runRows.length === 0 ? 0 : completed / runRows.length;

  const activeCountRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(playbooks)
    .where(sql`${playbooks.status} = 'active'`);
  const activePlaybookCount = Number(activeCountRows[0]?.count ?? 0);

  return {
    relationMix,
    dominantValence,
    topLessonTags,
    decisionVelocityPerMonth,
    playbookAdoptionRate,
    activePlaybookCount,
  };
}

/** Jaccard-based check for whether two tag sets represent a recurring organizational pattern. */
export function isRecurringPattern(tagsA: string[], tagsB: string[], threshold = 0.5): boolean {
  return jaccard(new Set(tagsA), new Set(tagsB)) >= threshold;
}
