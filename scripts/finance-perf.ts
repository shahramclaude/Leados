// Part 08 — `npm run finance:perf`.
// Measures cold and warm evaluation time of the full 3-year monthly model
// (48 months x ~55 nodes) and fails if a cold evaluation exceeds 200ms.

import { buildFinancialModelNodes } from "../src/lib/finance/financialModel";
import { evaluateDag, clearDagCache } from "../src/lib/finance/dag";
import { MONTHS } from "../src/lib/finance/timeline";

const nodes = buildFinancialModelNodes();
console.log(`Model has ${nodes.length} nodes across ${MONTHS.length} months.`);

clearDagCache();
const coldStart = performance.now();
const model = evaluateDag(nodes, MONTHS, {}, { cache: false });
const coldMs = performance.now() - coldStart;

const warmStart = performance.now();
evaluateDag(nodes, MONTHS, {});
const warmMs = performance.now() - warmStart;
const warmHitStart = performance.now();
evaluateDag(nodes, MONTHS, {});
const warmHitMs = performance.now() - warmHitStart;

console.log(`Cold evaluation (uncached): ${coldMs.toFixed(2)}ms`);
console.log(`Warm evaluation (first cache write): ${warmMs.toFixed(2)}ms`);
console.log(`Warm evaluation (cache hit): ${warmHitMs.toFixed(2)}ms`);
console.log(`Internal engine evalMs reported on cache-miss run: ${model.evalMs.toFixed(2)}ms`);
console.log(`Evaluated node count: ${Object.keys(model.nodes).length}`);

const GATE_MS = 200;
if (coldMs > GATE_MS) {
  console.error(`\nFAILED: cold evaluation ${coldMs.toFixed(2)}ms exceeds the ${GATE_MS}ms gate.`);
  process.exit(1);
} else {
  console.log(`\nPASSED: cold evaluation ${coldMs.toFixed(2)}ms is under the ${GATE_MS}ms gate (node count: ${nodes.length}).`);
}
