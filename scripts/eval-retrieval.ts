// =============================================================================
// scripts/eval-retrieval.ts — reports retrieval quality on the HOLDOUT split
// =============================================================================
// Loads weights fit by scripts/fit-weights.ts (TRAIN split only) and
// evaluates P@5, R@20, MRR, nDCG@10 on the HOLDOUT split of
// data/eval/retrieval-queries.json, which this script never uses for
// fitting. Exits non-zero if the PHASE 4 gates are not met:
//   P@5 >= 0.7, nDCG@10 >= 0.75 (on holdout).
//
// Run with: npx tsx scripts/eval-retrieval.ts
// (mapped conceptually to `npm run eval:retrieval`; see
// docs/PART-12-KNOWLEDGE-MEMORY.md for why this repo cannot add an npm
// script directly in this environment.)
// =============================================================================

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { searchCorpus, scoreItems, loadWeights } from "../src/lib/synthesis";
import { aggregate, precisionAtK, recallAtK, reciprocalRank, ndcgAtK, type Judgment } from "./lib/evalMetrics";

interface EvalQuery {
  id: string;
  domain: string;
  query: string;
  judgments: Judgment[];
  split: "train" | "holdout";
}

const GATE_P_AT_5 = 0.7;
const GATE_NDCG_AT_10 = 0.75;

async function main() {
  const queriesPath = join(process.cwd(), "data", "eval", "retrieval-queries.json");
  const { queries } = JSON.parse(readFileSync(queriesPath, "utf-8")) as { queries: EvalQuery[] };
  const holdout = queries.filter((q) => q.split === "holdout");
  const train = queries.filter((q) => q.split === "train");

  const weights = loadWeights();
  console.log("Loaded weights:", weights);
  console.log(`Evaluating on HOLDOUT split: ${holdout.length} queries (train split: ${train.length}, never scored here).\n`);

  const corpus = await searchCorpus();
  const titleById = new Map(corpus.map((c) => [c.id, c.title]));

  const perQuery: Array<{ ranked: { id: string; title: string }[]; judgments: Judgment[] }> = [];
  const rows: string[] = [];

  for (const q of holdout) {
    const scored = await scoreItems(corpus, q.query, { weights, limit: corpus.length });
    const ranked = scored.map((s) => ({ id: s.item.id, title: titleById.get(s.item.id) ?? s.item.title }));
    perQuery.push({ ranked, judgments: q.judgments });

    const p5 = precisionAtK(ranked, q.judgments, 5);
    const r20 = recallAtK(ranked, q.judgments, 20);
    const rr = reciprocalRank(ranked, q.judgments);
    const ndcg10 = ndcgAtK(ranked, q.judgments, 10);
    rows.push(
      `${q.id.padEnd(5)} [${q.domain.padEnd(18)}] P@5=${p5.toFixed(2)} R@20=${r20.toFixed(2)} RR=${rr.toFixed(2)} nDCG@10=${ndcg10.toFixed(2)}  "${q.query}"`,
    );
  }

  console.log("Per-query holdout results:");
  console.log(rows.join("\n"));

  const metrics = aggregate(perQuery);
  console.log("\n=== HOLDOUT aggregate metrics ===");
  console.log(`n (holdout queries) : ${metrics.n}`);
  console.log(`P@5                 : ${metrics.precisionAt5.toFixed(4)}  (gate >= ${GATE_P_AT_5})`);
  console.log(`R@20                : ${metrics.recallAt20.toFixed(4)}`);
  console.log(`MRR                 : ${metrics.mrr.toFixed(4)}`);
  console.log(`nDCG@10             : ${metrics.ndcgAt10.toFixed(4)}  (gate >= ${GATE_NDCG_AT_10})`);

  const p5Pass = metrics.precisionAt5 >= GATE_P_AT_5;
  const ndcgPass = metrics.ndcgAt10 >= GATE_NDCG_AT_10;
  console.log(`\nGate P@5 >= ${GATE_P_AT_5}: ${p5Pass ? "PASS" : "FAIL"}`);
  console.log(`Gate nDCG@10 >= ${GATE_NDCG_AT_10}: ${ndcgPass ? "PASS" : "FAIL"}`);

  if (!p5Pass || !ndcgPass) {
    console.error("\nEVAL FAILED: one or more gates not met on holdout.");
    process.exit(1);
  }
  console.log("\nEVAL PASSED.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
