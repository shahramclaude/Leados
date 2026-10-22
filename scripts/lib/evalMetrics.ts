// =============================================================================
// scripts/lib/evalMetrics.ts — IR metrics used by fit-weights.ts and
// eval-retrieval.ts: Precision@K, Recall@K, MRR, nDCG@K.
// =============================================================================

export interface RankedItem {
  id: string; // corpus item id, e.g. "doc:<uuid>" or "memory:<uuid>"
  title: string;
}

export interface Judgment {
  title: string;
  grade: 0 | 1 | 2;
}

function gradeFor(title: string, judgments: Judgment[]): number {
  return judgments.find((j) => j.title === title)?.grade ?? 0;
}

export function precisionAtK(ranked: RankedItem[], judgments: Judgment[], k: number): number {
  const top = ranked.slice(0, k);
  if (top.length === 0) return 0;
  const relevant = top.filter((r) => gradeFor(r.title, judgments) > 0).length;
  return relevant / top.length;
}

export function recallAtK(ranked: RankedItem[], judgments: Judgment[], k: number): number {
  const totalRelevant = judgments.filter((j) => j.grade > 0).length;
  if (totalRelevant === 0) return 0;
  const top = ranked.slice(0, k);
  const found = top.filter((r) => gradeFor(r.title, judgments) > 0).length;
  return found / totalRelevant;
}

export function reciprocalRank(ranked: RankedItem[], judgments: Judgment[]): number {
  for (let i = 0; i < ranked.length; i++) {
    if (gradeFor(ranked[i].title, judgments) > 0) return 1 / (i + 1);
  }
  return 0;
}

export function dcgAtK(ranked: RankedItem[], judgments: Judgment[], k: number): number {
  let dcg = 0;
  for (let i = 0; i < Math.min(k, ranked.length); i++) {
    const grade = gradeFor(ranked[i].title, judgments);
    dcg += (Math.pow(2, grade) - 1) / Math.log2(i + 2);
  }
  return dcg;
}

export function ndcgAtK(ranked: RankedItem[], judgments: Judgment[], k: number): number {
  const dcg = dcgAtK(ranked, judgments, k);
  const idealOrder = [...judgments].sort((a, b) => b.grade - a.grade);
  const idealRanked = idealOrder.map((j) => ({ id: j.title, title: j.title }));
  const idcg = dcgAtK(idealRanked, judgments, k);
  return idcg === 0 ? 0 : dcg / idcg;
}

export interface AggregateMetrics {
  n: number;
  precisionAt5: number;
  recallAt20: number;
  mrr: number;
  ndcgAt10: number;
}

export function aggregate(perQuery: Array<{ ranked: RankedItem[]; judgments: Judgment[] }>): AggregateMetrics {
  const n = perQuery.length;
  if (n === 0) return { n: 0, precisionAt5: 0, recallAt20: 0, mrr: 0, ndcgAt10: 0 };
  let p5 = 0, r20 = 0, mrr = 0, ndcg10 = 0;
  for (const { ranked, judgments } of perQuery) {
    p5 += precisionAtK(ranked, judgments, 5);
    r20 += recallAtK(ranked, judgments, 20);
    mrr += reciprocalRank(ranked, judgments);
    ndcg10 += ndcgAtK(ranked, judgments, 10);
  }
  return {
    n,
    precisionAt5: p5 / n,
    recallAt20: r20 / n,
    mrr: mrr / n,
    ndcgAt10: ndcg10 / n,
  };
}
