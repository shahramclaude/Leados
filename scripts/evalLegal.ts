// `npm run eval:legal` — clause-extraction precision/recall scorecard on the holdout split of the
// synthetic labeled corpus (src/lib/legal/corpus.ts). Gates (Phase 4):
//   - overall precision >= 0.90
//   - overall recall    >= 0.80
// Also prints a per-clause-type scorecard so degradation is visible (Phase 5 honesty requirement),
// even though the gate itself is enforced at the overall level.

import { generateCorpus } from "../src/lib/legal/corpus";
import { extractClauses } from "../src/lib/legal/extraction";
import { CLAUSE_TYPES, type ClauseType } from "../src/lib/legal/clauseTypes";
import { writeFileSync, mkdirSync } from "node:fs";

const OVERALL_PRECISION_GATE = 0.9;
const OVERALL_RECALL_GATE = 0.8;

interface TypeStats {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
}

function emptyStats(): TypeStats {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0 };
}

function main() {
  const corpus = generateCorpus();
  const holdout = corpus.filter((d) => d.splitSet === "holdout");
  const train = corpus.filter((d) => d.splitSet === "train");

  if (corpus.length < 60) {
    console.error(`FAIL: corpus has only ${corpus.length} documents; eval:legal requires >= 60.`);
    process.exit(1);
  }
  if (holdout.length < 10) {
    console.error(`FAIL: holdout split has only ${holdout.length} documents; too small to evaluate.`);
    process.exit(1);
  }

  const statsByType = new Map<ClauseType, TypeStats>();
  for (const t of CLAUSE_TYPES) statsByType.set(t, emptyStats());

  let overallTP = 0;
  let overallFP = 0;
  let overallFN = 0;
  let spanIntegrityFailures = 0;

  for (const doc of holdout) {
    const predicted = extractClauses(doc.rawText);

    // span-citation integrity: every candidate's excerpt must equal the literal slice of rawText.
    for (const cand of predicted) {
      const sliced = doc.rawText.slice(cand.spanStart, cand.spanEnd);
      if (sliced !== cand.excerptText) spanIntegrityFailures += 1;
    }

    const groundTruth = doc.annotations.map((a) => ({ ...a, matched: false }));
    const predictedMatched = predicted.map((p) => ({ ...p, matched: false }));

    // Match predicted candidates to ground truth by overlapping span + same clause type.
    for (const pred of predictedMatched) {
      const match = groundTruth.find(
        (gt) =>
          !gt.matched &&
          gt.clauseType === pred.clauseType &&
          pred.spanStart < gt.spanEnd &&
          pred.spanEnd > gt.spanStart,
      );
      if (match) {
        match.matched = true;
        pred.matched = true;
        statsByType.get(pred.clauseType)!.truePositives += 1;
        overallTP += 1;
      } else {
        statsByType.get(pred.clauseType)!.falsePositives += 1;
        overallFP += 1;
      }
    }

    for (const gt of groundTruth) {
      if (!gt.matched) {
        statsByType.get(gt.clauseType)!.falseNegatives += 1;
        overallFN += 1;
      }
    }
  }

  const overallPrecision = overallTP / Math.max(1, overallTP + overallFP);
  const overallRecall = overallTP / Math.max(1, overallTP + overallFN);

  const scorecard = {
    generatedAt: new Date().toISOString(),
    corpus: { total: corpus.length, train: train.length, holdout: holdout.length },
    extractionMethod: "lexicon-grounded-v1",
    overall: {
      truePositives: overallTP,
      falsePositives: overallFP,
      falseNegatives: overallFN,
      precision: round(overallPrecision),
      recall: round(overallRecall),
      spanIntegrityFailures,
    },
    gates: {
      precisionGate: OVERALL_PRECISION_GATE,
      recallGate: OVERALL_RECALL_GATE,
      precisionPass: overallPrecision >= OVERALL_PRECISION_GATE,
      recallPass: overallRecall >= OVERALL_RECALL_GATE,
      spanIntegrityPass: spanIntegrityFailures === 0,
    },
    byClauseType: Object.fromEntries(
      CLAUSE_TYPES.map((t) => {
        const s = statsByType.get(t)!;
        const precision = s.truePositives / Math.max(1, s.truePositives + s.falsePositives);
        const recall = s.truePositives / Math.max(1, s.truePositives + s.falseNegatives);
        return [
          t,
          {
            ...s,
            precision: round(precision),
            recall: round(recall),
          },
        ];
      }),
    ),
  };

  mkdirSync("eval-reports", { recursive: true });
  writeFileSync("eval-reports/legal-scorecard.json", JSON.stringify(scorecard, null, 2));

  console.log("=== eval:legal clause-extraction scorecard (holdout split) ===");
  console.log(`corpus: ${corpus.length} docs (${train.length} train / ${holdout.length} holdout)`);
  console.log(
    `overall: precision=${scorecard.overall.precision} (gate ${OVERALL_PRECISION_GATE}) recall=${scorecard.overall.recall} (gate ${OVERALL_RECALL_GATE})`,
  );
  console.log("per-clause-type:");
  for (const [type, s] of Object.entries(scorecard.byClauseType)) {
    console.log(
      `  ${type.padEnd(18)} precision=${s.precision.toFixed(2)} recall=${s.recall.toFixed(2)} (tp=${s.truePositives} fp=${s.falsePositives} fn=${s.falseNegatives})`,
    );
  }
  console.log(`span-citation integrity failures: ${spanIntegrityFailures}`);
  console.log(`report written to eval-reports/legal-scorecard.json`);

  const pass =
    scorecard.gates.precisionPass && scorecard.gates.recallPass && scorecard.gates.spanIntegrityPass;

  if (!pass) {
    console.error("FAIL: eval:legal gates not met.");
    process.exit(1);
  }
  console.log("PASS: eval:legal gates met.");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

main();
