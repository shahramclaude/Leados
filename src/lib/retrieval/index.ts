// Section C: hybrid retrieval grounded in real LEADOS data.
//
// Postgres full-text search (tsvector/tsquery) + trigram similarity
// (pg_trgm) over a unified corpus of entities/events/metrics/docs/memory
// notes, then one hop of knowledge-graph neighborhood expansion (Part 11
// seam) from the entities the top hits belong to. pgvector is deliberately
// NOT used: at LEADOS's current data volume (thousands, not millions, of
// rows) FTS+trigram+graph gives citeable, debuggable scores with zero extra
// infra, and every retrieved chunk can be reproduced with a plain SQL
// EXPLAIN — a property we did not want to trade away for marginal recall
// gains from embeddings. It stays behind `LEADOS_ENABLE_PGVECTOR` as a flag
// for future adoption (see README note) rather than being half-built here.
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { expandNeighborhood } from "@/lib/knowledgeGraph";
import type { EvidenceChunkT } from "@/lib/promptRegistry/common";

export type ScoredChunk = EvidenceChunkT & { score: number; entityId: string | null; expanded?: boolean };

export type RetrievalResult = {
  query: string;
  chunks: ScoredChunk[];
  /** 0..1 confidence derived from the top hybrid score — used for Ask-LEADOS refusal gating. */
  confidence: number;
};

const CORPUS_SQL = sql`
  with corpus as (
    select 'entity:' || id::text as id, 'entity' as kind,
           name || '. ' || coalesce(attributes::text, '') as text,
           updated_at as ts, id as entity_id
    from entities
    union all
    select 'event:' || id::text, 'event', type || ': ' || summary, occurred_at, entity_id
    from events
    union all
    select 'metric:' || id::text, 'metric', name || ' = ' || value::text || ' ' || unit, as_of, entity_id
    from metrics
    union all
    select 'doc:' || id::text, 'doc', title || ': ' || body, updated_at, entity_id
    from docs
    union all
    select 'memory_note:' || id::text, 'memory_note', title || ': ' || body, created_at, entity_id
    from memory_notes
  )
`;

export async function hybridRetrieve(query: string, limit = 12): Promise<RetrievalResult> {
  const trimmed = query.trim();
  if (!trimmed) return { query, chunks: [], confidence: 0 };

  const result = await db.execute(sql`
    ${CORPUS_SQL}
    select id, kind, text, ts, entity_id as "entityId",
      ts_rank(to_tsvector('english', text), plainto_tsquery('english', ${trimmed})) as fts_score,
      similarity(text, ${trimmed}) as trgm_score
    from corpus
    where to_tsvector('english', text) @@ plainto_tsquery('english', ${trimmed})
       or similarity(text, ${trimmed}) > 0.15
    order by (ts_rank(to_tsvector('english', text), plainto_tsquery('english', ${trimmed})) * 3
              + similarity(text, ${trimmed})) desc
    limit ${limit}
  `);

  type Row = {
    id: string;
    kind: EvidenceChunkT["kind"];
    text: string;
    ts: Date | null;
    entityId: string | null;
    fts_score: string | number;
    trgm_score: string | number;
  };
  const rows = result.rows as unknown as Row[];

  const primary: ScoredChunk[] = rows.map((r) => {
    const combined = Number(r.fts_score) * 3 + Number(r.trgm_score);
    return {
      id: r.id,
      kind: r.kind,
      text: r.text,
      timestamp: r.ts ? new Date(r.ts).toISOString() : undefined,
      entityId: r.entityId,
      score: combined,
    };
  });

  // Graph-neighborhood expansion: pull chunks belonging to 1-hop neighbors
  // of the entities the top primary hits are about, scored lower, so
  // "why is X falling" also surfaces events on entities linked to X.
  const seedEntityIds = Array.from(new Set(primary.slice(0, 5).map((c) => c.entityId).filter((v): v is string => Boolean(v))));
  const neighbors = await expandNeighborhood(seedEntityIds);
  let expanded: ScoredChunk[] = [];
  if (neighbors.length > 0) {
    const neighborIds = Array.from(new Set(neighbors.map((n) => n.entityId)));
    const result2 = await db.execute(sql`
      ${CORPUS_SQL}
      select id, kind, text, ts, entity_id as "entityId"
      from corpus
      where entity_id = any(${sql.raw(`array[${neighborIds.map((id) => `'${id}'`).join(",") || "NULL"}]::uuid[]`)})
      limit ${limit}
    `);
    const rows2 = result2.rows as unknown as Omit<Row, "fts_score" | "trgm_score">[];
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
  const topScore = chunks[0]?.score ?? 0;
  // Normalize a heuristic combined score into 0..1 confidence. Tuned against
  // the eval golden set in evals/golden/retrieval.json.
  const confidence = Math.max(0, Math.min(1, topScore / 0.6));

  return { query, chunks, confidence };
}

export const REFUSAL_CONFIDENCE_THRESHOLD = Number(process.env.LEADOS_REFUSAL_THRESHOLD ?? "0.2");
