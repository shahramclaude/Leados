// Part 08 — `npm run finance:citation-check`.
// Generates a board pack for the latest actual month (and one forecast
// month) and validates every sentence's citations against the fact ledger
// produced alongside it. Fails (exit 1) if any sentence:
//   - contains a digit but cites no refs,
//   - cites a ref that doesn't resolve, or
//   - cites a ref whose formatted value does not appear verbatim in the text
//     (the guard against "technically cited but misleading").
// This script also gates Part 11's planned LLM narration per the spec.

import { evaluateModel, monteCarloForecast, CUTOVER_INDEX } from "../src/lib/finance/financeEngine";
import { generateBoardPack, allSentences } from "../src/lib/finance/financialStory";
import { checkCitations } from "../src/lib/finance/citations";
import { FactLedger } from "../src/lib/finance/citations";

const model = evaluateModel();
const forecast = monteCarloForecast(model, {}, undefined, 60);

const monthsToCheck = [CUTOVER_INDEX, CUTOVER_INDEX - 6];
let totalIssues = 0;
let totalSentences = 0;

for (const i of monthsToCheck) {
  const pack = generateBoardPack(model, i, 1, i === CUTOVER_INDEX ? forecast : undefined);
  const ledger = FactLedger.fromJSON(pack.facts);
  const sentences = allSentences(pack);
  const issues = checkCitations(sentences, ledger);
  totalSentences += sentences.length;
  totalIssues += issues.length;

  console.log(`\n=== Board pack ${pack.month} (v${pack.version}, model hash ${pack.modelHash}) ===`);
  console.log(`sentences=${sentences.length} facts=${pack.facts.length} issues=${issues.length}`);
  for (const issue of issues) {
    console.error(`  CITATION ISSUE [${issue.section}] "${issue.text}" -> ${issue.reason}`);
  }
}

console.log(`\nTotal sentences checked: ${totalSentences}. Total citation issues: ${totalIssues}.`);
if (totalIssues > 0) {
  console.error("FAILED: finance:citation-check found unresolved or misleading citations.");
  process.exit(1);
} else {
  console.log("PASSED: every generated sentence's numbers resolve to real model facts.");
}
