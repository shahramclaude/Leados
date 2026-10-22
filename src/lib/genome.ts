// =============================================================================
// genome.ts — organizational "genome": derived authority profile per entity
// =============================================================================
// authority(entity) feeds the retrieval scoring function (synthesis.ts) as
// w4 term. It is a composite, bounded-[0,1] signal built only from
// structural graph facts — never from an LLM judgement — so it is cheap to
// explain and audit:
//
//   authority = 0.4 * normalized_in_degree(owns|informs|evidences, facts only)
//             + 0.3 * confirmation_ratio(edges touching entity)
//             + 0.2 * normalized_evidence_strength(evidence_links)
//             + 0.1 * recency_of_activity
//
// Recomputed nightly by selfImprove.ts and stored on entities.authorityScore
// so reads don't need to recompute the whole graph on every search.
// =============================================================================

import { db } from "@/db";
import { entities, relations, evidenceLinks } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

const AUTHORITY_RELATION_TYPES = ["owns", "informs", "evidences"] as const;

export interface GenomeComponents {
  entityId: string;
  inDegree: number;
  normalizedInDegree: number;
  confirmationRatio: number;
  normalizedEvidenceStrength: number;
  recencyScore: number;
  authority: number;
}

async function maxInDegree(): Promise<number> {
  const result = await db.execute(sql`
    select coalesce(max(cnt), 1) as max_cnt from (
      select to_entity_id, count(*) as cnt
      from relations
      where relation_type = any(${AUTHORITY_RELATION_TYPES})
        and confidence_class in ('observed','confirmed')
      group by to_entity_id
    ) t
  `);
  return Number((result.rows[0] as { max_cnt: string })?.max_cnt ?? 1);
}

export async function computeGenome(entityId: string, maxInDeg?: number): Promise<GenomeComponents> {
  const denom = maxInDeg ?? (await maxInDegree());

  const inDegreeRow = await db.execute(sql`
    select count(*)::int as c from relations
    where to_entity_id = ${entityId}
      and relation_type = any(${AUTHORITY_RELATION_TYPES})
      and confidence_class in ('observed','confirmed')
  `);
  const inDegree = Number((inDegreeRow.rows[0] as { c: number })?.c ?? 0);
  const normalizedInDegree = denom > 0 ? Math.min(1, inDegree / denom) : 0;

  const touchingRow = await db.execute(sql`
    select
      count(*) filter (where confidence_class = 'confirmed')::int as confirmed,
      count(*) filter (where confidence_class in ('confirmed','proposed'))::int as total
    from relations
    where from_entity_id = ${entityId} or to_entity_id = ${entityId}
  `);
  const touching = touchingRow.rows[0] as { confirmed: number; total: number };
  const confirmationRatio = touching.total > 0 ? touching.confirmed / touching.total : 0;

  const evidenceRows = await db
    .select({ strength: evidenceLinks.strength })
    .from(evidenceLinks)
    .where(eq(evidenceLinks.entityId, entityId));
  const evidenceSum = evidenceRows.reduce((acc, r) => acc + Number(r.strength), 0);
  const normalizedEvidenceStrength = Math.min(1, evidenceSum / 5); // 5+ strong evidence links saturates

  const [entity] = await db.select().from(entities).where(eq(entities.id, entityId));
  const ageDays = entity
    ? Math.max(0, (Date.now() - new Date(entity.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 9999;
  const recencyScore = Math.exp(-ageDays / 90); // 90-day recency half-life-ish window

  const authority =
    0.4 * normalizedInDegree + 0.3 * confirmationRatio + 0.2 * normalizedEvidenceStrength + 0.1 * recencyScore;

  return {
    entityId,
    inDegree,
    normalizedInDegree,
    confirmationRatio,
    normalizedEvidenceStrength,
    recencyScore,
    authority: Number(authority.toFixed(4)),
  };
}

/** Recompute and persist authorityScore for every entity. Returns counts for
 * the nightly consolidation audit log. */
export async function recomputeAllAuthorityScores() {
  const all = await db.select({ id: entities.id }).from(entities);
  const denom = await maxInDegree();
  let updated = 0;
  for (const { id } of all) {
    const genome = await computeGenome(id, denom);
    await db
      .update(entities)
      .set({ authorityScore: genome.authority.toString(), updatedAt: sql`updated_at` })
      .where(eq(entities.id, id));
    updated++;
  }
  return { scanned: all.length, updated };
}
