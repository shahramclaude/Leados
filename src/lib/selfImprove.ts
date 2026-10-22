// =============================================================================
// selfImprove.ts — nightly memory consolidation (audited)
// =============================================================================
// Runs, in order, and records every step + counts in `consolidation_runs`
// so each run is independently auditable (no silent background mutation):
//   1. Decay pass (institutionalMemory.decayPass) — flips `archived` for
//      memories whose retention has fallen below threshold. Never deletes.
//   2. Edge strengthening — confirmed/observed "current" edges that persist
//      unchallenged gain a small, capped confidence nudge each run. This is
//      intentionally weak and bounded: persistence-without-contradiction is
//      only weak evidence of correctness.
//   3. Orphan flagging — entities with zero fact-edges are counted and
//      listed for human triage (not auto-deleted or auto-linked).
//   4. Relation closure rebuild — relationClosure is fully recomputed from
//      `relations` (never the other way around), bounded to depth 6.
//   5. Authority recompute (genome.ts) — entities.authorityScore refreshed.
// =============================================================================

import { db } from "@/db";
import { consolidationRuns, relations, relationClosure } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { decayPass } from "./institutionalMemory";
import { findOrphans } from "./knowledgeGraph";
import { recomputeAllAuthorityScores } from "./genome";

const CLOSURE_MAX_DEPTH = 6;
const STRENGTHEN_INCREMENT = 0.005; // 0.5% nightly nudge toward 1, capped

async function strengthenUncontestedEdges() {
  const result = await db.execute(sql`
    update relations
    set confidence = least(0.99, confidence + (1 - confidence) * ${STRENGTHEN_INCREMENT})
    where valid_to is null
      and confidence_class in ('observed', 'confirmed')
    returning id;
  `);
  return result.rows.length;
}

async function rebuildRelationClosure() {
  await db.delete(relationClosure);

  const result = await db.execute(sql`
    with recursive walk as (
      select r.from_entity_id as ancestor_id, r.to_entity_id as descendant_id,
             1 as depth, array[r.relation_type::text] as rel_types,
             array[r.from_entity_id, r.to_entity_id] as path
      from relations r
      where r.confidence_class in ('observed', 'confirmed') and r.valid_to is null
      union all
      select w.ancestor_id, r.to_entity_id, w.depth + 1,
             w.rel_types || r.relation_type::text,
             w.path || r.to_entity_id
      from relations r
      join walk w on r.from_entity_id = w.descendant_id
      where w.depth < ${CLOSURE_MAX_DEPTH}
        and r.confidence_class in ('observed', 'confirmed') and r.valid_to is null
        and not (r.to_entity_id = any(w.path))
    )
    select ancestor_id, descendant_id, min(depth) as min_depth,
           (array_agg(rel_types order by depth))[1] as rel_types
    from walk
    group by ancestor_id, descendant_id;
  `);

  const rows = result.rows as Array<{ ancestor_id: string; descendant_id: string; min_depth: number; rel_types: string[] }>;
  if (rows.length === 0) return 0;

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await db.insert(relationClosure).values(
      batch.map((r) => ({
        ancestorId: r.ancestor_id,
        descendantId: r.descendant_id,
        minDepth: r.min_depth,
        relationTypes: r.rel_types,
      })),
    );
  }
  return rows.length;
}

export interface ConsolidationResult {
  runId: string;
  decayedCount: number;
  unarchivedCount: number;
  strengthenedCount: number;
  orphansFlagged: number;
  closureEdgesRebuilt: number;
  authorityUpdated: number;
  log: Array<{ step: string; detail: string; at: string }>;
}

export async function runNightlyConsolidation(now: Date = new Date()): Promise<ConsolidationResult> {
  const [run] = await db.insert(consolidationRuns).values({ startedAt: now, status: "running" }).returning();
  const log: ConsolidationResult["log"] = [];

  const decay = await decayPass(now);
  log.push({
    step: "decay_pass",
    detail: `scanned=${decay.scanned} archived=${decay.decayedCount} unarchived=${decay.unarchivedCount}`,
    at: new Date().toISOString(),
  });

  const strengthened = await strengthenUncontestedEdges();
  log.push({ step: "edge_strengthening", detail: `nudged=${strengthened}`, at: new Date().toISOString() });

  const orphans = await findOrphans();
  log.push({ step: "orphan_flagging", detail: `found=${orphans.length}`, at: new Date().toISOString() });

  const closureCount = await rebuildRelationClosure();
  log.push({ step: "closure_rebuild", detail: `edges=${closureCount}`, at: new Date().toISOString() });

  const authority = await recomputeAllAuthorityScores();
  log.push({
    step: "authority_recompute",
    detail: `scanned=${authority.scanned} updated=${authority.updated}`,
    at: new Date().toISOString(),
  });

  const result: ConsolidationResult = {
    runId: run.id,
    decayedCount: decay.decayedCount,
    unarchivedCount: decay.unarchivedCount,
    strengthenedCount: strengthened,
    orphansFlagged: orphans.length,
    closureEdgesRebuilt: closureCount,
    authorityUpdated: authority.updated,
    log,
  };

  await db
    .update(consolidationRuns)
    .set({
      completedAt: new Date(),
      decayedCount: decay.decayedCount,
      strengthenedCount: strengthened,
      orphansFlagged: orphans.length,
      closureEdgesRebuilt: closureCount,
      status: "completed",
      log,
    })
    .where(eq(consolidationRuns.id, run.id));

  return result;
}

export async function listConsolidationRuns(limit = 20) {
  return db
    .select()
    .from(consolidationRuns)
    .orderBy(sql`${consolidationRuns.startedAt} desc`)
    .limit(limit);
}

// Re-exported for convenience so API routes / scripts don't need to import
// from both knowledgeGraph.ts and selfImprove.ts separately.
export { relations };
