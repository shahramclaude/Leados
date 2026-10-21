// src/lib/retrieval/index.ts
//
// Mission §E: "One search stack (build on /api/search): keyword + fuzzy +
// graph-rank + recency + authority (entity importance), faceted, saved
// searches. Postgres-first: FTS + trigram + graph expansion; pgvector
// optional behind a flag if justified."
//
// Corpus: entities, events, metrics, docs, retrospectives (institutional
// memory), hypotheses, playbooks — i.e. every domain the labeled query set
// in eval/retrieval-labels.json exercises.
//
// Scoring = ftsScore*FTS_WEIGHT + trgmScore*TRGM_WEIGHT + recencyBoost + authorityBoost,
// then one hop of knowledge-graph neighborhood expansion from the entities
// the top primary hits belong to is appended at a fixed, lower score so
// "what's linked to X" also surfaces without drowning out direct hits.
//
// pgvector: NOT enabled. At LEADOS's current data volume (hundreds to low
// thousands of rows across all seven corpora) FTS+trigram+graph gives
// citeable, debuggable, `EXPLAIN`-able scores with zero extra infrastructure
// and zero embedding cost/drift to manage. It is gated behind
// `LEADOS_ENABLE_PGVECTOR` (checked but intentionally left unimplemented —
// turning it on without an actual embeddings column would silently no-op)
// so a future part can adopt it deliberately once recall data justifies it,
// rather than it being half-built here. See eval/retrieval-labels.json +
// `npm run eval:retrieval` for the recall numbers that would motivate (or
// not) that investment.
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { expandNeighborhood } from "@/lib/knowledgeGraph";

export const PGVECTOR_ENABLED = process.env.LEADOS_ENABLE_PGVECTOR === "true";

export type ChunkKind = "entity" | "event" | "metric" | "doc" | "retrospective" | "hypothesis" | "playbook";

export type ScoredChunk = {
  id: string;
  kind: ChunkKind;
  text: string;
  timestamp?: string;
  entityId: string | null;
  score: number;
  expanded?: boolean;
};

export type RetrievalResult = {
  query: string;
  chunks: ScoredChunk[];
  confidence: number;
  facets: { kind: string; count: number }[];
};

const FTS_WEIGHT = 3;
const TRGM_WEIGHT = 1;
const RECENCY_WEIGHT = 0.4;
const AUTHORITY_WEIGHT = 0.3;
const RECENCY_HALF_LIFE_DAYS = 180;

const CORPUS_SQL = sql`
  with corpus as (
    select 'entity:' || id::text as id, 'entity' as kind,
           name || '. ' || type || ' ' || coalesce(attributes::text, '') as text,
           updated_at as ts, id as entity_id, importance::float as authority
    from entities
    union all
    select 'event:' || id::text, 'event', type || ': ' || summary, occurred_at, entity_id, 0.3
    from events
    union all
    select 'metric:' || id::text, 'metric', name || ' = ' || value::text || ' ' || unit, as_of, entity_id, 0.3
    from metrics
    union all
    select 'doc:' || id::text, 'doc', title || ': ' || body, updated_at, entity_id, 0.45
    from docs
    union all
    select 'retrospective:' || id::text, 'retrospective',
           title || '. ' || situation || ' ' || decision || ' ' || outcome || ' ' || lesson || ' ' || coalesce(playbook_update, ''),
           occurred_at::timestamptz, null::uuid, 0.45
    from retrospectives
    union all
    select 'hypothesis:' || id::text, 'hypothesis', title || '. ' || coalesce(description, ''), updated_at, null::uuid, 0.4
    from hypotheses
    union all
    select 'playbook:' || id::text, 'playbook', title || '. ' || coalesce(description, ''), updated_at, null::uuid, 0.5
    from playbooks
  )
`;

export async function hybridRetrieve(
  query: string,
  limit = 12,
  facetFilter?: { kinds?: ChunkKind[] }
): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) return { query, chunks: [], confidence: 0, facets: [] };

  const kindFilter = facetFilter?.kinds && facetFilter.kinds.length > 0 ? sql`and kind = any(${facetFilter.kinds})` : sql``;

  const result = await db.execute(sql`
    ${CORPUS_SQL}
    select id, kind, text, ts, entity_id as "entityId", authority,
      ts_rank(to_tsvector('english', text), plainto_tsquery('english', ${trimmed})) as fts_score,
      similarity(text, ${trimmed}) as trgm_score
    from corpus
    where (to_tsvector('english', text) @@ plainto_tsquery('english', ${trimmed})
       or similarity(text, ${trimmed}) > 0.15)
      ${kindFilter}
    order by (ts_rank(to_tsvector('english', text), plainto_tsquery('english', ${trimmed})) * ${FTS_WEIGHT}
              + similarity(text, ${trimmed}) * ${TRGM_WEIGHT}) desc
    limit ${limit * 3}
  `);

  type Row = {
    id: string;
    kind: ChunkKind;
    text: string;
    ts: Date | string | null;
    entityId: string | null;
    authority: string | number;
    fts_score: string | number;
    trgm_score: string | number;
  };
  const rows = result.rows as unknown as Row[];
  const now = Date.now();

  const primary: ScoredChunk[] = rows.map((r) => {
    const ftsScore = Number(r.fts_score);
    const trgmScore = Number(r.trgm_score);
    const ageDays = r.ts ? Math.max(0, (now - new Date(r.ts).getTime()) / 86_400_000) : RECENCY_HALF_LIFE_DAYS * 4;
    const recencyBoost = RECENCY_WEIGHT * Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
    const authorityBoost = AUTHORITY_WEIGHT * Number(r.authority ?? 0.3);
    const score = ftsScore * FTS_WEIGHT + trgmScore * TRGM_WEIGHT + recencyBoost + authorityBoost;
    return {
      id: r.id,
      kind: r.kind,
      text: r.text,
      timestamp: r.ts ? new Date(r.ts).toISOString() : undefined,
      entityId: r.entityId,
      score,
    };
  });
  primary.sort((a, b) => b.score - a.score);

  // One-hop graph expansion from the entities the top primary hits are about.
  const seedEntityIds = Array.from(new Set(primary.slice(0, 5).map((c) => c.entityId).filter((v): v is string => Boolean(v))));
  const neighbors = await expandNeighborhood(seedEntityIds);
  let expanded: ScoredChunk[] = [];
  if (neighbors.length > 0) {
    const neighborIds = Array.from(new Set(neighbors.map((n) => n.entityId)));
    const idList = sql.raw(`array[${neighborIds.map((id) => `'${id}'`).join(",")}]::uuid[]`);
    const result2 = await db.execute(sql`
      ${CORPUS_SQL}
      select id, kind, text, ts, entity_id as "entityId"
      from corpus
      where entity_id = any(${idList})
      limit ${limit}
    `);
    const rows2 = result2.rows as unknown as Omit<Row, "fts_score" | "trgm_score" | "authority">[];
    const existingIds = new Set(primary.map((p) => p.id));
    expanded = rows2
      .filter((r) => !existingIds.has(r.id))
      .map((r) => {
        const neighbor = neighbors.find((n) => n.entityId === r.entityId);
        return {
          id: r.id,
          kind: r.kind,
          text: r.text,
          timestamp: r.ts ? new Date(r.ts).toISOString() : undefined,
          entityId: r.entityId,
          score: 0.25 * (neighbor?.weight ?? 1),
          expanded: true,
        };
      });
  }

  const chunks = [...primary, ...expanded].sort((a, b) => b.score - a.score).slice(0, limit);
  const facetCounts = new Map<string, number>();
  for (const c of [...primary, ...expanded]) facetCounts.set(c.kind, (facetCounts.get(c.kind) ?? 0) + 1);
  const facets = Array.from(facetCounts.entries()).map(([kind, count]) => ({ kind, count }));

  const topScore = chunks[0]?.score ?? 0;
  const confidence = Math.max(0, Math.min(1, topScore / 2.0));

  return { query, chunks, confidence, facets };
}

export const REFUSAL_CONFIDENCE_THRESHOLD = Number(process.env.LEADOS_REFUSAL_THRESHOLD ?? "0.15");
