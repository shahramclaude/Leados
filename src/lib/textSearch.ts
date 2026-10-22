// =============================================================================
// textSearch.ts — small, dependency-free BM25 implementation
// =============================================================================
// Used by synthesis.ts (retrieval scoring) and familiarity.ts ("we've seen
// this before"). Deliberately simple and auditable rather than pulling in a
// search engine dependency — the corpus sizes here (docs + memories) are
// small enough that an in-process BM25 over tokenized text is both fast and
// fully inspectable (useful for the labeled eval set / honesty rules).
// =============================================================================

export interface BM25Document {
  id: string;
  text: string;
}

export interface BM25Index {
  docIds: string[];
  tokensByDoc: Map<string, string[]>;
  termFreqByDoc: Map<string, Map<string, number>>;
  docFreq: Map<string, number>;
  avgDocLen: number;
  n: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "is", "are",
  "was", "were", "be", "been", "with", "as", "by", "at", "this", "that",
  "it", "we", "our", "their", "they", "from", "will", "has", "have", "had",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function buildBM25Index(docs: BM25Document[]): BM25Index {
  const tokensByDoc = new Map<string, string[]>();
  const termFreqByDoc = new Map<string, Map<string, number>>();
  const docFreq = new Map<string, number>();
  let totalLen = 0;

  for (const doc of docs) {
    const tokens = tokenize(doc.text);
    tokensByDoc.set(doc.id, tokens);
    totalLen += tokens.length;

    const tf = new Map<string, number>();
    for (const tok of tokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
    termFreqByDoc.set(doc.id, tf);

    for (const term of tf.keys()) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
  }

  return {
    docIds: docs.map((d) => d.id),
    tokensByDoc,
    termFreqByDoc,
    docFreq,
    avgDocLen: docs.length ? totalLen / docs.length : 0,
    n: docs.length,
  };
}

const K1 = 1.5;
const B = 0.75;

export function bm25Score(index: BM25Index, docId: string, queryTerms: string[]): number {
  const tf = index.termFreqByDoc.get(docId);
  if (!tf) return 0;
  const docLen = index.tokensByDoc.get(docId)?.length ?? 0;
  let score = 0;

  for (const term of queryTerms) {
    const freq = tf.get(term) ?? 0;
    if (freq === 0) continue;
    const df = index.docFreq.get(term) ?? 0;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    const numerator = freq * (K1 + 1);
    const denominator = freq + K1 * (1 - B + B * (docLen / (index.avgDocLen || 1)));
    score += idf * (numerator / denominator);
  }
  return score;
}

/** Search a BM25 index, returning normalized scores in [0, 1] (divided by
 * the top score in the result set) so they can be linearly combined with
 * other [0,1] signals in synthesis.ts. */
export function bm25Search(index: BM25Index, query: string, topK = 50) {
  const queryTerms = tokenize(query);
  const scored = index.docIds
    .map((id) => ({ id, score: bm25Score(index, id, queryTerms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const maxScore = scored[0]?.score || 1;
  return scored.slice(0, topK).map((s) => ({ id: s.id, score: s.score, normalizedScore: s.score / maxScore }));
}

/** Simple Jaccard similarity over token sets — used by familiarity.ts as a
 * cheap secondary signal alongside BM25 for "we've seen this before". */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) if (setB.has(t)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
