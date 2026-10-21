// Part 05 stand-in: causal / root-cause drill-down for plan-vs-actual variance.
// Re-implemented locally (see AI-SESSION-LOG.md). Uses classic flexible-budget
// variance decomposition — price variance + volume variance — which is an
// honest, auditable (not ML/"black box") root-cause method.
import { explain, type Explain } from "@/lib/explain";

export type VarianceDecomposition = {
  totalVariance: number;
  priceVariance: number;
  volumeVariance: number;
  mixOrOther: number;
};

/**
 * Standard decomposition for a revenue-like line:
 *   totalVariance   = actualRevenue - planRevenue
 *   priceVariance    = (actualPrice - planPrice) * actualVolume
 *   volumeVariance   = (actualVolume - planVolume) * planPrice
 *   mixOrOther       = residual (captures interaction term)
 */
export function decomposeRevenueVariance(input: {
  planPrice: number;
  actualPrice: number;
  planVolume: number;
  actualVolume: number;
}): Explain<VarianceDecomposition> {
  const planRevenue = input.planPrice * input.planVolume;
  const actualRevenue = input.actualPrice * input.actualVolume;
  const totalVariance = actualRevenue - planRevenue;
  const priceVariance = (input.actualPrice - input.planPrice) * input.actualVolume;
  const volumeVariance = (input.actualVolume - input.planVolume) * input.planPrice;
  const mixOrOther = totalVariance - priceVariance - volumeVariance;

  const decomposition: VarianceDecomposition = { totalVariance, priceVariance, volumeVariance, mixOrOther };

  return explain(decomposition, {
    confidence: 0.9,
    method: "flexible-budget price/volume decomposition (deterministic algebra, not inferred)",
    drivers: [
      { name: "price", contribution: priceVariance, direction: priceVariance >= 0 ? "positive" : "negative", assumptionKey: "price" },
      { name: "volume", contribution: volumeVariance, direction: volumeVariance >= 0 ? "positive" : "negative", assumptionKey: "revenue_growth" },
      { name: "mix/other residual", contribution: mixOrOther, direction: mixOrOther >= 0 ? "positive" : "negative" },
    ],
    assumptionsUsed: ["price", "revenue_growth"],
    caveats: mixOrOther !== 0 ? ["Residual captures second-order interaction between price and volume changes; not separately attributable."] : [],
  });
}

/** Cost-side variance: how much of a cost-line miss is driven by headcount vs comp inflation vs "other". */
export function decomposeCostVariance(input: {
  planHeadcount: number;
  actualHeadcount: number;
  planCostPerHead: number;
  actualCostPerHead: number;
}): Explain<VarianceDecomposition> {
  const planCost = input.planHeadcount * input.planCostPerHead;
  const actualCost = input.actualHeadcount * input.actualCostPerHead;
  const totalVariance = actualCost - planCost;
  const headcountVariance = (input.actualHeadcount - input.planHeadcount) * input.planCostPerHead;
  const compVariance = (input.actualCostPerHead - input.planCostPerHead) * input.actualHeadcount;
  const mixOrOther = totalVariance - headcountVariance - compVariance;

  const decomposition: VarianceDecomposition = {
    totalVariance,
    priceVariance: compVariance,
    volumeVariance: headcountVariance,
    mixOrOther,
  };

  return explain(decomposition, {
    confidence: 0.9,
    method: "flexible-budget headcount/comp decomposition (deterministic algebra, not inferred)",
    drivers: [
      { name: "headcount vs plan", contribution: headcountVariance, direction: headcountVariance >= 0 ? "negative" : "positive", assumptionKey: "hiring_plan" },
      { name: "comp inflation vs plan", contribution: compVariance, direction: compVariance >= 0 ? "negative" : "positive", assumptionKey: "comp_inflation" },
      { name: "mix/other residual", contribution: mixOrOther, direction: mixOrOther >= 0 ? "negative" : "positive" },
    ],
    assumptionsUsed: ["hiring_plan", "comp_inflation"],
    caveats: [],
  });
}
