// Part 08 — unit economics, exposed as Explain<number> (value + confidence +
// citeable ref) rather than bare numbers, per the number-citation contract.

import { EvaluatedModel } from "./dag";
import { FactLedger } from "./citations";
import { Explain } from "./types";

function explainFromNode(
  model: EvaluatedModel,
  ledger: FactLedger,
  nodeId: string,
  i: number,
  formula: string,
  explanation: string,
): Explain<number> {
  const node = model.nodes[nodeId];
  if (!node) throw new Error(`unitEconomics: missing node "${nodeId}"`);
  const value = node.values[i];
  const confidence = node.confidence[i];
  const ref = ledger.cite(node.label, value, { unit: node.unit, month: model.months[i], confidence });
  return { value, confidence, refs: [ref], formula, explanation };
}

export interface UnitEconomicsSnapshot {
  arpu: Explain<number>;
  cac: Explain<number>;
  grossMargin: Explain<number>;
  churnRateMonthly: Explain<number>;
  ltv: Explain<number>;
  paybackMonths: Explain<number>;
  ltvCacRatio: Explain<number>;
  magicNumber: Explain<number>;
}

export function unitEconomicsAt(model: EvaluatedModel, ledger: FactLedger, i: number): UnitEconomicsSnapshot {
  return {
    arpu: explainFromNode(
      model,
      ledger,
      "arpuCore",
      i,
      "ARPU = revenueCore / existingCustomersCore",
      "Average monthly revenue per core-segment customer.",
    ),
    cac: explainFromNode(
      model,
      ledger,
      "cac",
      i,
      "CAC = (smHeadcountAmount + smProgramsAmount) / newCustomersCore",
      "Blended cost to acquire one new customer this month.",
    ),
    grossMargin: explainFromNode(
      model,
      ledger,
      "grossMargin",
      i,
      "grossMargin = grossProfit / totalRevenue",
      "Share of revenue retained after cost of goods sold.",
    ),
    churnRateMonthly: explainFromNode(
      model,
      ledger,
      "churnRateMonthly",
      i,
      "driver series: actual history or EWMA+seasonality forecast",
      "Monthly logo/revenue churn applied to the core customer base.",
    ),
    ltv: explainFromNode(
      model,
      ledger,
      "ltvNode",
      i,
      "LTV = ARPU x grossMargin / churnRateMonthly",
      "Gross-profit lifetime value of an average core customer.",
    ),
    paybackMonths: explainFromNode(
      model,
      ledger,
      "paybackMonthsNode",
      i,
      "paybackMonths = CAC / (ARPU x grossMargin)",
      "Months of gross profit needed to recover acquisition cost.",
    ),
    ltvCacRatio: explainFromNode(
      model,
      ledger,
      "ltvCacRatioNode",
      i,
      "ratio = LTV / CAC",
      "Efficiency ratio; greater than 3x is a common healthy-SaaS benchmark.",
    ),
    magicNumber: explainFromNode(
      model,
      ledger,
      "magicNumberNode",
      i,
      "magicNumber = (ARR_now - ARR_3moAgo) x 4 / priorQuarterS&M",
      "SaaS sales efficiency metric; >0.75 is generally considered efficient.",
    ),
  };
}
