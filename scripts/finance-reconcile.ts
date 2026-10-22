// Part 08 — reconciliation test suite.
// Verifies, for every seeded scenario (baseline + 3 stress scenarios) and
// every month of the 48-month model, that:
//   1. balance sheet identity: assets = liabilities + equity
//   2. cash-flow reconciliation: endingCash = priorCash + CFO + CFI + CFF
//   3. margin identity: grossProfit = revenue - COGS
// All within a one-cent tolerance. Any violation fails the script (exit 1).

import { evaluateModel } from "../src/lib/finance/financeEngine";
import { checkAllIdentities } from "../src/lib/finance/financialStatements";
import { OverrideMap } from "../src/lib/finance/dag";

interface Scenario {
  name: string;
  overrides: OverrideMap;
}

const scenarios: Scenario[] = [
  { name: "baseline", overrides: {} },
  {
    name: "price-shock (core price +25% from month 30)",
    overrides: Object.fromEntries(
      [["priceCore", Object.fromEntries(Array.from({ length: 18 }, (_, k) => [30 + k, 900]))]],
    ),
  },
  {
    name: "churn-spike (asserted 6% churn for 3 months)",
    overrides: { churnRateMonthly: { 26: 0.06, 27: 0.06, 28: 0.06 } },
  },
  {
    name: "hiring-freeze (sales headcount asserted flat)",
    overrides: {
      headcount_sales: Object.fromEntries(Array.from({ length: 12 }, (_, k) => [24 + k, 18])),
    },
  },
];

let failures = 0;
const rows: { scenario: string; months: number; ok: number; worstBalanceDelta: number; worstCashDelta: number; worstMarginDelta: number }[] = [];

for (const scenario of scenarios) {
  const model = evaluateModel(scenario.overrides);
  const results = checkAllIdentities(model);
  const ok = results.filter((r) => r.ok).length;
  const worstBalanceDelta = Math.max(...results.map((r) => Math.abs(r.balanceSheetDelta)));
  const worstCashDelta = Math.max(...results.map((r) => Math.abs(r.cashReconciliationDelta)));
  const worstMarginDelta = Math.max(...results.map((r) => Math.abs(r.marginIdentityDelta)));
  rows.push({ scenario: scenario.name, months: results.length, ok, worstBalanceDelta, worstCashDelta, worstMarginDelta });
  if (ok !== results.length) {
    failures += results.length - ok;
    const bad = results.find((r) => !r.ok);
    console.error(`FAIL [${scenario.name}] first violation at ${bad?.month}:`, bad);
  }
}

console.log("\n=== Reconciliation Test Suite ===\n");
console.log(
  rows
    .map(
      (r) =>
        `${r.scenario.padEnd(45)} months=${r.months} ok=${r.ok}/${r.months}  maxBalanceDelta=$${r.worstBalanceDelta.toFixed(4)}  maxCashDelta=$${r.worstCashDelta.toFixed(4)}  maxMarginDelta=$${r.worstMarginDelta.toFixed(4)}`,
    )
    .join("\n"),
);

if (failures > 0) {
  console.error(`\nFAILED: ${failures} month(s) violated an identity beyond the 1-cent tolerance.`);
  process.exit(1);
} else {
  console.log(`\nPASSED: all ${scenarios.length} scenarios x ${rows[0].months} months satisfy all identities within $0.01.`);
}
