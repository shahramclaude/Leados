// src/lib/search.ts
//
// One search surface across entities, retrospectives, hypotheses, playbooks
// and living docs: keyword (Postgres full-text) + fuzzy (pg_trgm trigram
// similarity) + graph-rank (knowledge-graph degree) + recency, with facets
// and saved searches.
//
// Why Postgres-only (no pgvector): the corpus here is structured,
// short-form organizational records (titles + a few paragraphs), not long
// unstructured prose needing semantic embedding search. `ts_rank_cd` +
// `pg_trgm` already cover exact/keyword and typo-tolerant/fuzzy retrieval,
// and graph-rank + recency give us the "importance" signal embeddings would
// otherwise approximate. Adding pgvector would mean standing up an
// embedding pipeline for no measurable precision/recall gain at this
// corpus size — see docs/SEARCH.md for the write-up. It remains an
// optional, swappable scoring term (`graphScore`) if that changes.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { searchDocuments } from "@/db/schema";
import { getDegreeMap } from "@/lib/knowledgeGraph";

export const SEARCH_SOURCE_TYPES = [
  "entity",
  "retrospective",
  "hypothesis",
  "playbook",
  "living_doc",
  "metric",
] as const;
export type SearchSourceType = (typeof SEARCH_SOURCE_TYPES)[number];

export interface IndexDocumentInput {
  sourceType: SearchSourceType | string;
  sourceId: number;
  title: string;
  body: string;
  tags?: string[];
  recencyAt?: Date;
  graphScore?: number;
}

/** Upsert a single document into the denormalized search index. */
export async function indexDocument(input: IndexDocumentInput) {
  await db
    .insert(searchDocuments)
    .values({
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      title: input.title,
      body: input.body,
      tags: input.tags ?? [],
      recencyAt: input.recencyAt ?? new Date(),
      graphScore: input.graphScore ?? 0,
    })
    .onConflictDoUpdate({
      target: [searchDocuments.sourceType, searchDocuments.sourceId],
      set: {
        title: input.title,
        body: input.body,
        tags: input.tags ?? [],
        recencyAt: input.recencyAt ?? new Date(),
        graphScore: input.graphScore ?? 0,
        updatedAt: new Date(),
      },
    });
}

/** Recompute graphScore for every indexed `entity` document from current graph degree. */
export async function refreshGraphScores() {
  const degree = await getDegreeMap();
  const rows = await db.select().from(searchDocuments).where(sql`${searchDocuments.sourceType} = 'entity'`);
  const maxDegree = Math.max(1, ...[...degree.values()]);
  for (const row of rows) {
    const d = degree.get(row.sourceId) ?? 0;
    await db
      .update(searchDocuments)
      .set({ graphScore: d / maxDegree })
      .where(sql`${searchDocuments.id} = ${row.id}`);
  }
}

export interface SearchOptions {
  query: string;
  sourceTypes?: string[];
  tags?: string[];
  limit?: number;
  weights?: Partial<{ keyword: number; fuzzy: number; graph: number; recency: number }>;
}

export interface SearchHit {
  sourceType: string;
  sourceId: number;
  title: string;
  snippet: string;
  tags: string[];
  score: number;
  scoreBreakdown: { keyword: number; fuzzy: number; graph: number; recency: number };
}

export interface SearchResult {
  hits: SearchHit[];
  facets: { sourceType: string; count: number }[];
  total: number;
}

const DEFAULT_WEIGHTS = { keyword: 0.45, fuzzy: 0.2, graph: 0.15, recency: 0.2 };

/**
 * Combined keyword + fuzzy + graph-rank + recency search over the
 * denormalized `search_documents` index.
 */
export async function search(options: SearchOptions): Promise<SearchResult> {
  const q = options.query.trim();
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const sourceTypeFilter =
    options.sourceTypes && options.sourceTypes.length > 0
      ? sql`and source_type = any(${sql.raw(`array[${options.sourceTypes.map((t) => `'${t.replace(/'/g, "")}'`).join(",")}]`)})`
      : sql``;

  // Recency score: 1.0 today, exponential half-life of 30 days.
  const recencyExpr = sql`exp(-ln(2) * extract(epoch from (now() - recency_at)) / (30 * 86400.0))`;

  let rows;
  if (q.length === 0) {
    rows = await db.execute(sql`
      select source_type, source_id, title, body, tags,
        0 as keyword_score,
        0 as fuzzy_score,
        graph_score as graph_score,
        ${recencyExpr} as recency_score
      from search_documents
      where true ${sourceTypeFilter}
      order by recency_score desc
      limit ${limit}
    `);
  } else {
    rows = await db.execute(sql`
      select source_type, source_id, title, body, tags,
        ts_rank_cd(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')), plainto_tsquery('english', ${q})) as keyword_score,
        greatest(similarity(title, ${q}), similarity(body, ${q}) * 0.6) as fuzzy_score,
        graph_score as graph_score,
        ${recencyExpr} as recency_score
      from search_documents
      where (
        to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')) @@ plainto_tsquery('english', ${q})
        or similarity(title, ${q}) > 0.15
        or similarity(body, ${q}) > 0.1
      ) ${sourceTypeFilter}
      limit 500
    `);
  }

  const scored: SearchHit[] = (rows.rows as Record<string, unknown>[]).map((r) => {
    const keyword = Number(r.keyword_score) || 0;
    const fuzzy = Number(r.fuzzy_score) || 0;
    const graph = Number(r.graph_score) || 0;
    const recency = Number(r.recency_score) || 0;
    const normalizedKeyword = Math.min(1, keyword * 4); // ts_rank_cd is typically small; scale into [0,1]-ish
    const score =
      weights.keyword * normalizedKeyword + weights.fuzzy * fuzzy + weights.graph * graph + weights.recency * recency;
    const body = String(r.body ?? "");
    return {
      sourceType: String(r.source_type),
      sourceId: Number(r.source_id),
      title: String(r.title),
      snippet: body.length > 220 ? `${body.slice(0, 220)}…` : body,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
      score,
      scoreBreakdown: { keyword: normalizedKeyword, fuzzy, graph, recency },
    };
  });

  let filtered = scored;
  if (options.tags && options.tags.length > 0) {
    const wanted = new Set(options.tags);
    filtered = filtered.filter((h) => h.tags.some((t) => wanted.has(t)));
  }

  filtered.sort((a, b) => b.score - a.score);
  const top = filtered.slice(0, limit);

  const facetCounts = new Map<string, number>();
  for (const h of filtered) facetCounts.set(h.sourceType, (facetCounts.get(h.sourceType) ?? 0) + 1);

  return {
    hits: top,
    facets: [...facetCounts.entries()].map(([sourceType, count]) => ({ sourceType, count })),
    total: filtered.length,
  };
}
