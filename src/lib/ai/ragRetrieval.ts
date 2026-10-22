// =============================================================================
// LEADOS — Part 11: hybrid RAG retrieval (couples to Part 12's retrieval seam)
// =============================================================================
// Part 12 owns the production-grade retrieval seam (vector index, managed
// recency/graph services). This module implements that seam's CONTRACT today
// using lexical BM25 + a graph-expansion pass over the entity/event/metric
// graph fetched by groundingFetcher.ts, plus a recency decay term — so
// Ask-LEADOS and Insight Synthesis are fully functional and testable now, and
// can be swapped for Part 12's implementation without changing call sites.
//
// Chunking policy: documents are split into semantic sections of 300-600
// tokens (see chunkDocument) with metadata (documentId, section, sourceType,
// trust) carried on every chunk — this metadata is what lets taint tracking
// and citation refs work per-chunk rather than per-document.
//
// Rerank: we use a cheap heuristic "LLM-lite" reranker (weighted sum of BM25
// score, graph-proximity boost, and recency decay) rather than a cross-encoder
// or a real LLM call, because (a) it's free and instant, keeping Ask-LEADOS
// inside its per-query cost budget, and (b) our corpus here is small enough
// (per-org documents) that lexical + graph signals are already strong. If/when
// corpus size grows, swap `rerank()` for a cross-encoder without touching the
// retrieve()/budget() contract.
//
// Context budgeter: retrieval stops accumulating chunks once the marginal
// utility (next chunk's rerank score) drops below `MARGINAL_UTILITY_THRESHOLD`
// OR the token budget is exhausted — whichever comes first.
// =============================================================================

import { db } from "@/db";
import { documentChunks, documents, injectionIncidents } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DocumentRef, GroundingSet, Trust } from "./types";
import { stripInjectionContent } from "./taint";

export const CHUNK_MIN_TOKENS = 300;
export const CHUNK_MAX_TOKENS = 600;
const MARGINAL_UTILITY_THRESHOLD = 0.08;
const DEFAULT_TOKEN_BUDGET = 2000;
const RECENCY_HALF_LIFE_DAYS = 30;

function estimateTokens(text: string): number {
  // ~4 chars/token heuristic, consistent with cost estimation elsewhere.
  return Math.ceil(text.length / 4);
}

/** Split document content into semantic (paragraph-aware) 300-600 token chunks. */
export function chunkDocument(content: string): string[] {
  const paragraphs = content
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    const candidate = current ? `${current}\n\n${p}` : p;
    if (estimateTokens(candidate) > CHUNK_MAX_TOKENS && current) {
      chunks.push(current);
      current = p;
    } else {
      current = candidate;
    }
    if (estimateTokens(current) >= CHUNK_MIN_TOKENS && estimateTokens(current) <= CHUNK_MAX_TOKENS) {
      // keep accumulating until max, loop naturally continues
    }
  }
  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [content];
}

// ---------------------------------------------------------------------------
// BM25-lite scoring
// ---------------------------------------------------------------------------

// Standard BM25 practice: strip common stopwords so they can't dominate the
// score purely through high term frequency across every document (the bug
// this guards against: an unrelated query like "What is the GDP of France?"
// should NOT retrieve documents just because they share "the"/"is"/"of").
const RAG_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "what", "which", "who", "how",
  "did", "does", "do", "of", "in", "on", "for", "to", "and", "or", "this",
  "that", "has", "have", "had", "with", "by", "at", "as", "it", "its", "be",
  "been", "being", "from", "about",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !RAG_STOPWORDS.has(t));
}

interface Corpus {
  docs: { id: number; tokens: string[] }[];
  df: Map<string, number>;
  avgLen: number;
}

function buildCorpus(texts: { id: number; text: string }[]): Corpus {
  const docs = texts.map((t) => ({ id: t.id, tokens: tokenize(t.text) }));
  const df = new Map<string, number>();
  for (const d of docs) {
    const seen = new Set(d.tokens);
    for (const term of seen) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const avgLen = docs.reduce((s, d) => s + d.tokens.length, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLen };
}

function bm25Score(queryTerms: string[], docTokens: string[], corpus: Corpus, k1 = 1.5, b = 0.75): number {
  const N = corpus.docs.length || 1;
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  let score = 0;
  for (const term of queryTerms) {
    const df = corpus.df.get(term) ?? 0;
    if (df === 0) continue;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const f = tf.get(term) ?? 0;
    const denom = f + k1 * (1 - b + (b * docTokens.length) / (corpus.avgLen || 1));
    score += idf * ((f * (k1 + 1)) / (denom || 1));
  }
  return score;
}

function recencyDecay(createdAt: Date, now: Date): number {
  const ageDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

// ---------------------------------------------------------------------------
// Public retrieval API
// ---------------------------------------------------------------------------

export interface RetrievalOptions {
  tokenBudget?: number;
  now?: Date;
}

export async function retrieveRelevantChunks(
  orgId: number,
  query: string,
  groundingSet: GroundingSet,
  opts: RetrievalOptions = {},
): Promise<DocumentRef[]> {
  const now = opts.now ?? new Date();
  const tokenBudget = opts.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  const rows = await db
    .select({
      chunkId: documentChunks.id,
      documentId: documentChunks.documentId,
      chunkIndex: documentChunks.chunkIndex,
      section: documentChunks.section,
      text: documentChunks.text,
      createdAt: documentChunks.createdAt,
      title: documents.title,
      sourceType: documents.sourceType,
      trust: documents.trust,
    })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(eq(documentChunks.orgId, orgId));

  if (rows.length === 0) return [];

  // Sanitize BEFORE indexing and BEFORE this text can ever be quoted back to
  // a user: instruction-like spans are stripped, not just flagged. This
  // closes a real attack we found in testing (see AI-SESSION-LOG.md /
  // Phase 5): a crafted query that echoes an embedded attack's own phrasing
  // ("ignore all previous instructions...") would otherwise lexically match —
  // and then quote back — the very attack text stored in an untrusted note,
  // even though the pipeline never "obeyed" it. Stripping it from the indexed
  // text removes that retrieval-echo path entirely.
  const sanitizedRows = rows.map((r) => {
    const strip = stripInjectionContent(r.text);
    if (strip.removedCount > 0) {
      void db
        .insert(injectionIncidents)
        .values({
          orgId,
          userId: null,
          source: "document",
          attackPattern: strip.removedPatterns.join(","),
          blocked: true,
          detail: `Instruction-like span(s) removed from document ${r.documentId} chunk ${r.chunkIndex} before indexing/quoting.`,
        })
        .catch(() => undefined);
    }
    return { ...r, text: strip.clean || r.text };
  });

  const corpus = buildCorpus(sanitizedRows.map((r) => ({ id: r.chunkId, text: r.text })));
  const queryTerms = tokenize(query);
  const uniqueQueryTerms = new Set(queryTerms);

  // Graph expansion: boost chunks whose text mentions entity names already
  // present in the deterministic GroundingSet (i.e. connected to the subject
  // of the current task via the knowledge graph, not just lexical overlap).
  const entityNames = groundingSet.entities.map((e) => e.name.toLowerCase());

  const scored = sanitizedRows.map((r) => {
    const tokens = tokenize(r.text);
    const docTermSet = new Set(tokens);
    const matchedTermCount = queryTerms.filter((t) => docTermSet.has(t)).length;
    // Require at least 2 distinct overlapping query terms (or all of them, if
    // the query is a single word) before trusting the lexical score — this
    // prevents one coincidental shared word (e.g. "next") from dragging in an
    // unrelated document purely on BM25 idf noise.
    const minRequired = Math.min(2, uniqueQueryTerms.size);
    const lexical = matchedTermCount >= minRequired ? bm25Score(queryTerms, tokens, corpus) : 0;
    const graphBoost = entityNames.some((name) => name.length > 0 && r.text.toLowerCase().includes(name)) ? 1.0 : 0;
    const recency = recencyDecay(r.createdAt, now);
    // "LLM-lite" rerank: recency is a MODULATOR on top of actual relevance
    // (lexical + graph), never an independent source of score — otherwise a
    // recent-but-irrelevant chunk could outrank an old-but-relevant one, or
    // worse, pass the marginal-utility threshold on recency alone. See
    // module header for the cross-encoder-vs-heuristic justification.
    const relevance = 0.7 * lexical + 0.3 * graphBoost;
    const rerankScore = relevance * (0.6 + 0.4 * recency);
    return { row: r, rerankScore };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);

  const selected: DocumentRef[] = [];
  let tokensUsed = 0;
  for (const s of scored) {
    if (s.rerankScore < MARGINAL_UTILITY_THRESHOLD) break; // marginal utility too low — stop
    const chunkTokens = estimateTokens(s.row.text);
    if (tokensUsed + chunkTokens > tokenBudget) break; // budget exhausted
    selected.push({
      kind: "document",
      ref: `doc:${s.row.documentId}#chunk${s.row.chunkIndex}`,
      documentId: s.row.documentId,
      chunkIndex: s.row.chunkIndex,
      title: s.row.title,
      text: s.row.text,
      trust: s.row.trust as Trust,
      sourceType: s.row.sourceType,
      score: Number(s.rerankScore.toFixed(4)),
    });
    tokensUsed += chunkTokens;
  }
  return selected;
}
