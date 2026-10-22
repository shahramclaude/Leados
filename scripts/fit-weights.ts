// =============================================================================
// scripts/fit-weights.ts — fits retrieval scoring weights on the TRAIN split
// =============================================================================
// FIT PROCEDURE (documented per the standing order):
//  1. w2 (graphProximity) is FIXED at 0.15, not grid-searched. None of the
//     labeled queries in data/eval/retrieval-queries.json supply a seed
//     entity (they are plain-text queries), so graphProximity evaluates to
//     0 for every candidate in this set — grid search would be free to
//     assign it any weight with zero effect on train nDCG, which would be a
//     meaningless/misleading "fit". We reserve a fixed, modest weight for it
//     based on its designed role in graph-aware search (used via
//     /api/search?seedEntityId=...), and graph-aware boosting itself is
//     validated separately by the graph query tests (scripts/graph-tests.ts),
//     not by this text-retrieval eval.
//  2. The remaining 0.85 weight mass is distributed across w1 (BM25),
//     w3 (recencyDecay), w4 (authority), w5 (evidenceStrength) by grid
//     search in steps of 0.05, maximizing mean nDCG@10 on the TRAIN split
//     only (ties broken by mean P@5). The HOLDOUT split is never touched by
//     this script.
//  3. The winning weights are written to data/retrieval-weights.json with
//     fit metadata (date, train size, achieved train metrics).
//
// Run with: npx tsx scripts/fit-weights.ts
// =============================================================================

import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { searchCorpus, scoreItems, type ScoringWeights } from "../src/lib/synthesis";
import { aggregate, type Judgment } from "./lib/evalMetrics";

const W2_FIXED = 0.15;
const STEP = 0.05;
const REMAINING = 1 - W2_FIXED; // 0.85
const UNITS = Math.round(REMAINING / STEP); // 17

// BM25 is the primary lexical-relevance signal for text retrieval; without a
// floor, grid search can zero it out in favor of a modifier signal (e.g.
// evidenceStrength) that happens to correlate with train-set idiosyncrasies
// via score ties rather than genuine relevance. We require BM25 to carry at
// least 40% of the non-graph weight mass (>= 0.34 of the total 0.85).
const MIN_BM25_UNITS = Math.round(0.4 * UNITS);

interface EvalQuery {
  id: string;
  query: string;
  judgments: Judgment[];
  split: "train" | "holdout";
}

function* compositions(parts: number, total: number): Generator<number[]> {
  if (parts === 1) {
    yield [total];
    return;
  }
  for (let i = 0; i <= total; i++) {
    for (const rest of compositions(parts - 1, total - i)) {
      yield [i, ...rest];
    }
  }
}

async function main() {
  const queriesPath = join(process.cwd(), "data", "eval", "retrieval-queries.json");
  const { queries } = JSON.parse(readFileSync(queriesPath, "utf-8")) as { queries: EvalQuery[] };
  const trainQueries = queries.filter((q) => q.split === "train");

  console.log(`Fitting weights on ${trainQueries.length} TRAIN queries (holdout reserved: ${queries.length - trainQueries.length}).`);

  const corpus = await searchCorpus();
  const titleById = new Map(corpus.map((c) => [c.id, c.title]));

  let best: { weights: ScoringWeights; ndcg: number; p5: number } | null = null;
  let evaluated = 0;

  for (const [u1, u3, u4, u5] of compositions(4, UNITS)) {
    if (u1 < MIN_BM25_UNITS) continue;
    const weights: ScoringWeights = {
      w1_bm25: u1 * STEP,
      w2_graphProximity: W2_FIXED,
      w3_recencyDecay: u3 * STEP,
      w4_authority: u4 * STEP,
      w5_evidenceStrength: u5 * STEP,
    };

    const perQuery = [];
    for (const q of trainQueries) {
      const scored = await scoreItems(corpus, q.query, { weights, limit: corpus.length });
      const ranked = scored.map((s) => ({ id: s.item.id, title: titleById.get(s.item.id) ?? s.item.title }));
      perQuery.push({ ranked, judgments: q.judgments });
    }
    const metrics = aggregate(perQuery);
    evaluated++;

    // Primary objective: P@5 (matches the PHASE 4 gate most directly),
    // tie-broken by nDCG@10 (matches the second gate).
    if (
      !best ||
      metrics.precisionAt5 > best.p5 ||
      (metrics.precisionAt5 === best.p5 && metrics.ndcgAt10 > best.ndcg)
    ) {
      best = { weights, ndcg: metrics.ndcgAt10, p5: metrics.precisionAt5 };
    }
  }

  if (!best) throw new Error("Grid search produced no candidates");

  console.log(`Evaluated ${evaluated} weight combinations.`);
  console.log(`Best TRAIN nDCG@10: ${best.ndcg.toFixed(4)}, P@5: ${best.p5.toFixed(4)}`);
  console.log("Best weights:", best.weights);

  const output = {
    ...best.weights,
    fitMetadata: {
      fitted: true,
      fittedAt: new Date().toISOString(),
      procedure:
        "w2_graphProximity fixed at 0.15 (no train query supplies a seed entity, so it is inert on this text-only eval set and excluded from grid search to avoid a meaningless fit). Remaining 0.85 mass grid-searched in 0.05 steps over w1/w3/w4/w5 with a floor of w1 >= 0.34 (BM25 must carry the primary lexical signal; unconstrained search could zero it out via train-set score-tie artifacts). Objective: maximize mean P@5 on TRAIN, tie-broken by mean nDCG@10. Holdout split is never touched by this script.",
      trainQueryCount: trainQueries.length,
      holdoutQueryCount: queries.length - trainQueries.length,
      trainNdcgAt10: best.ndcg,
      trainPrecisionAt5: best.p5,
      combinationsEvaluated: evaluated,
    },
  };

  const outPath = join(process.cwd(), "data", "retrieval-weights.json");
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote fitted weights to ${outPath}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
