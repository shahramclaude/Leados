// =============================================================================
// synthesis.ts — retrieval scoring engine
// =============================================================================
//   score = w1*BM25 + w2*graphProximity + w3*recencyDecay
//         + w4*authority(entity) + w5*evidenceStrength
//
// Weights are loaded from data/retrieval-weights.json, which is produced by
// scripts/fit-weights.ts (grid search on the TRAIN split of the labeled
// query set only; the HOLDOUT split is reserved exclusively for
// scripts/eval-retrieval.ts so the reported P@5/R@20/MRR/nDCG are not
// fit-contaminated). See docs/PART-12-KNOWLEDGE-MEMORY.md for the fit
// procedure writeup.
//
// This module is deliberately corpus-agnostic: it is given a list of
// `SearchableItem`s (built from docs + memories in searchCorpus()) rather
// than querying the DB itself, so the exact same scoring code path can be
// driven by eval scripts with a synthetic/labeled corpus.
// =============================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import { docs, memories, entities, evidenceLinks } from "@/db/schema";
import { bm25Search, buildBM25Index, type BM25Document } from "./textSearch";
import { decorateWithRetention } from "./institutionalMemory";
import { shortestInfluencePath } from "./knowledgeGraph";
import { eq, inArray } from "drizzle-orm";

export interface ScoringWeights {
  w1_bm25: number;
  w2_graphProximity: number;
  w3_recencyDecay: number;
  w4_authority: number;
  w5_evidenceStrength: number;
}

export function loadWeights(): ScoringWeights {
  try {
    const raw = readFileSync(join(process.cwd(), "data", "retrieval-weights.json"), "utf-8");
    const parsed = JSON.parse(raw);
    return {
      w1_bm25: parsed.w1_bm25,
      w2_graphProximity: parsed.w2_graphProximity,
      w3_recencyDecay: parsed.w3_recencyDecay,
      w4_authority: parsed.w4_authority,
      w5_evidenceStrength: parsed.w5_evidenceStrength,
    };
  } catch {
    return {
      w1_bm25: 0.2,
      w2_graphProximity: 0.2,
      w3_recencyDecay: 0.2,
      w4_authority: 0.2,
      w5_evidenceStrength: 0.2,
    };
  }
}

export interface SearchableItem {
  id: string;
  kind: "doc" | "memory";
  title: string;
  text: string;
  entityId: string | null;
  authority: number;
  ageDays: number;
  retentionOrFreshness: number;
  evidenceStrength: number;
  facetType: string | null;
}

/** Build the current searchable corpus from docs + memories. Exported
 * separately from `search()` so eval scripts can inject a labeled/synthetic
 * corpus instead of hitting the live DB. */
export async function searchCorpus(): Promise<SearchableItem[]> {
  const [allDocs, allMemories, allEntities, allEvidence] = await Promise.all([
    db.select().from(docs),
    db.select().from(memories),
    db.select().from(entities),
    db.select().from(evidenceLinks),
  ]);

  const entityById = new Map(allEntities.map((e) => [e.id, e]));
  const evidenceByEntity = new Map<string, number>();
  for (const link of allEvidence) {
    evidenceByEntity.set(link.entityId, (evidenceByEntity.get(link.entityId) ?? 0) + Number(link.strength));
  }

  const docItems: SearchableItem[] = allDocs.map((d) => {
    const sourceIds = (d.sourceEntityIds as string[]) ?? [];
    const primaryEntity = sourceIds[0] ? entityById.get(sourceIds[0]) : undefined;
    const ageDays = (Date.now() - new Date(d.lastSyncedAt).getTime()) / (1000 * 60 * 60 * 24);
    return {
      id: `doc:${d.id}`,
      kind: "doc",
      title: d.title,
      text: `${d.title}\n${d.content}`,
      entityId: sourceIds[0] ?? null,
      authority: primaryEntity ? Number(primaryEntity.authorityScore) : 0,
      ageDays,
      retentionOrFreshness: Math.exp(-ageDays / 90),
      evidenceStrength: sourceIds[0] ? Math.min(1, (evidenceByEntity.get(sourceIds[0]) ?? 0) / 5) : 0,
      facetType: primaryEntity?.type ?? null,
    };
  });

  const memoryItems: SearchableItem[] = allMemories.map((m) => {
    const decorated = decorateWithRetention(m);
    const entity = m.entityId ? entityById.get(m.entityId) : undefined;
    return {
      id: `memory:${m.id}`,
      kind: "memory",
      title: m.title,
      text: `${m.title}\n${m.content}`,
      entityId: m.entityId,
      authority: entity ? Number(entity.authorityScore) : 0,
      ageDays: decorated.ageDays,
      retentionOrFreshness: decorated.retention,
      evidenceStrength: m.entityId ? Math.min(1, (evidenceByEntity.get(m.entityId) ?? 0) / 5) : 0,
      facetType: entity?.type ?? m.class,
    };
  });

  return [...docItems, ...memoryItems];
}

export interface SearchOptions {
  facetType?: string;
  seedEntityId?: string; // for graph-aware queries: boosts items near this entity
  limit?: number;
  weights?: ScoringWeights;
}

export interface ScoredResult {
  item: SearchableItem;
  score: number;
  components: {
    bm25: number;
    graphProximity: number;
    recencyDecay: number;
    authority: number;
    evidenceStrength: number;
  };
}

function toBM25Docs(items: SearchableItem[]): BM25Document[] {
  return items.map((i) => ({ id: i.id, text: i.text }));
}

export async function scoreItems(
  items: SearchableItem[],
  query: string,
  opts?: SearchOptions,
): Promise<ScoredResult[]> {
  const weights = opts?.weights ?? loadWeights();
  const filtered = opts?.facetType ? items.filter((i) => i.facetType === opts.facetType) : items;

  const index = buildBM25Index(toBM25Docs(filtered));
  const bm25Results = bm25Search(index, query, filtered.length);
  const bm25ById = new Map(bm25Results.map((r) => [r.id, r.normalizedScore]));

  // Graph proximity: only computed when a seed entity is given (graph-aware
  // search). depth 0 = same entity -> 1.0, otherwise 1/(1+depth).
  const proximityCache = new Map<string, number>();
  async function graphProximity(entityId: string | null): Promise<number> {
    if (!opts?.seedEntityId || !entityId) return 0;
    if (entityId === opts.seedEntityId) return 1;
    const key = entityId;
    if (proximityCache.has(key)) return proximityCache.get(key)!;
    const path = await shortestInfluencePath(opts.seedEntityId, entityId, { maxDepth: 5 });
    const score = path ? 1 / (1 + path.depth) : 0;
    proximityCache.set(key, score);
    return score;
  }

  const results: ScoredResult[] = [];
  for (const item of filtered) {
    const bm25 = bm25ById.get(item.id) ?? 0;
    const proximity = await graphProximity(item.entityId);
    const components = {
      bm25,
      graphProximity: proximity,
      recencyDecay: item.retentionOrFreshness,
      authority: item.authority,
      evidenceStrength: item.evidenceStrength,
    };
    const score =
      weights.w1_bm25 * components.bm25 +
      weights.w2_graphProximity * components.graphProximity +
      weights.w3_recencyDecay * components.recencyDecay +
      weights.w4_authority * components.authority +
      weights.w5_evidenceStrength * components.evidenceStrength;
    results.push({ item, score, components });
  }

  // Deterministic tie-break: primary score, then raw BM25 relevance, then
  // item id — avoids ties silently falling back to insertion order (which
  // would make fitting/eval results depend on incidental corpus ordering).
  return results
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.components.bm25 !== a.components.bm25) return b.components.bm25 - a.components.bm25;
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, opts?.limit ?? 20);
}

export async function search(query: string, opts?: SearchOptions): Promise<ScoredResult[]> {
  const items = await searchCorpus();
  return scoreItems(items, query, opts);
}

export async function searchByEntityIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(entities).where(inArray(entities.id, ids));
}

export async function getEntityByIdSafe(id: string) {
  const [row] = await db.select().from(entities).where(eq(entities.id, id));
  return row ?? null;
}
