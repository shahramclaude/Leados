// Part 08 — board-level KPI registry, Explain<number> wrapped.

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
  if (!node) throw new Error(`kpis: missing node "${nodeId}"`);
  const value = node.values[i];
  const confidence = node.confidence[i];
  const ref = ledger.cite(node.label, value, { unit: node.unit, month: model.months[i], confidence });
  return { value, confidence, refs: [ref], formula, explanation };
}

export interface KpiSnapshot {
  arr: Explain<number>;
  netNewArr: Explain<number>;
  revenue: Explain<number>;
  grossMargin: Explain<number>;
  ebitdaMargin: Explain<number>;
  ruleOf40: Explain<number>;
  burnMultiple: Explain<number>;
  runwayMonths: Explain<number>;
  netMarginTtm: Explain<number>;
  assetTurnoverTtm: Explain<number>;
  leverageRatio: Explain<number>;
  roeTtm: Explain<number>;
}

export function kpiSnapshotAt(model: EvaluatedModel, ledger: FactLedger, i: number): KpiSnapshot {
  return {
    arr: explainFromNode(model, ledger, "arr", i, "ARR = revenueCore x 12", "Annualized recurring revenue run-rate."),
    netNewArr: explainFromNode(model, ledger, "netNewArr", i, "netNewARR = ARR_t - ARR_t-1", "Month-over-month change in ARR."),
    revenue: explainFromNode(model, ledger, "totalRevenue", i, "totalRevenue = revenueCore + revenueServices", "Total recognized revenue this month."),
    grossMargin: explainFromNode(model, ledger, "grossMargin", i, "grossMargin = grossProfit / totalRevenue", "Blended gross margin."),
    ebitdaMargin: explainFromNode(model, ledger, "ebitdaMargin", i, "ebitdaMargin = EBITDA / totalRevenue", "Operating margin before D&A."),
    ruleOf40: explainFromNode(model, ledger, "ruleOf40", i, "ruleOf40 = revenueGrowthYoY + ebitdaMargin", "Combined growth + profitability health check."),
    burnMultiple: explainFromNode(model, ledger, "burnMultiple", i, "burnMultiple = netBurn / netNewARR", "Capital efficiency: dollars burned per dollar of net new ARR."),
    runwayMonths: explainFromNode(model, ledger, "runwayMonths", i, "runway = cash / trailing3moNetBurn", "Months of cash remaining at current smoothed burn."),
    netMarginTtm: explainFromNode(model, ledger, "netMarginTtm", i, "netMargin = ttmNetIncome / ttmRevenue", "DuPont component 1 of 3."),
    assetTurnoverTtm: explainFromNode(model, ledger, "assetTurnoverTtm", i, "assetTurnover = ttmRevenue / totalAssets", "DuPont component 2 of 3."),
    leverageRatio: explainFromNode(model, ledger, "leverageRatio", i, "leverage = totalAssets / totalEquity", "DuPont component 3 of 3."),
    roeTtm: explainFromNode(model, ledger, "roeTtm", i, "ROE = netMargin x assetTurnover x leverage", "DuPont-decomposed trailing-twelve-month return on equity."),
  };
}
