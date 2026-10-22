// Part 08 — variance decomposition: actual vs plan.
//
// Sales (price/volume/mix) variance — exact textbook attribution:
//   priceEffect  = Σ_i actualVolume_i x (actualPrice_i - planPrice_i)
//   volumeEffect = (actualTotalVolume - planTotalVolume) x planWeightedAvgPrice
//   mixEffect    = Σ_i (actualVolume_i - actualTotalVolume x planMixRatio_i) x planPrice_i
// priceEffect + volumeEffect + mixEffect reconstructs the total revenue
// delta exactly (to floating-point rounding); any further residual is
// reported explicitly rather than folded into one of the three terms, and
// flagged "unexplained" when it exceeds 20% of |delta|.
//
// Opex variance uses a simpler headcount-rate decomposition per category.

export interface SegmentActualPlan {
  name: string;
  planPrice: number;
  actualPrice: number;
  planVolume: number;
  actualVolume: number;
}

export interface SalesVarianceDecomposition {
  planRevenue: number;
  actualRevenue: number;
  total: number;
  priceEffect: number;
  volumeEffect: number;
  mixEffect: number;
  residual: number;
  flaggedUnexplained: boolean;
  bySegment: { name: string; priceEffect: number; planVolume: number; actualVolume: number }[];
}

export function decomposeSalesVariance(segments: SegmentActualPlan[]): SalesVarianceDecomposition {
  const planRevenue = segments.reduce((s, x) => s + x.planPrice * x.planVolume, 0);
  const actualRevenue = segments.reduce((s, x) => s + x.actualPrice * x.actualVolume, 0);
  const total = actualRevenue - planRevenue;

  const planTotalVolume = segments.reduce((s, x) => s + x.planVolume, 0);
  const actualTotalVolume = segments.reduce((s, x) => s + x.actualVolume, 0);
  const planWeightedAvgPrice = planTotalVolume > 0 ? planRevenue / planTotalVolume : 0;

  const priceEffect = segments.reduce((s, x) => s + x.actualVolume * (x.actualPrice - x.planPrice), 0);
  const volumeEffect = (actualTotalVolume - planTotalVolume) * planWeightedAvgPrice;
  const mixEffect = segments.reduce((s, x) => {
    const planMixRatio = planTotalVolume > 0 ? x.planVolume / planTotalVolume : 0;
    const expectedVolumeAtPlanMix = actualTotalVolume * planMixRatio;
    return s + (x.actualVolume - expectedVolumeAtPlanMix) * x.planPrice;
  }, 0);

  const explained = priceEffect + volumeEffect + mixEffect;
  const residual = total - explained;
  const flaggedUnexplained = Math.abs(total) > 0.01 && Math.abs(residual) > 0.2 * Math.abs(total);

  const bySegment = segments.map((x) => ({
    name: x.name,
    priceEffect: x.actualVolume * (x.actualPrice - x.planPrice),
    planVolume: x.planVolume,
    actualVolume: x.actualVolume,
  }));

  return { planRevenue, actualRevenue, total, priceEffect, volumeEffect, mixEffect, residual, flaggedUnexplained, bySegment };
}

export interface OpexCategoryActualPlan {
  name: string;
  planHeadcount: number;
  actualHeadcount: number;
  planCostPerHead: number;
  actualCostPerHead: number;
  /** One-off / timing adjustment not explained by headcount x rate (e.g. a
   * late invoice, a one-time true-up). Zero in the common case. */
  unexplainedAdjustment?: number;
}

export interface OpexVarianceDecomposition {
  name: string;
  planAmount: number;
  actualAmount: number;
  total: number;
  headcountEffect: number;
  rateEffect: number;
  residual: number;
  flaggedUnexplained: boolean;
}

export function decomposeOpexVariance(c: OpexCategoryActualPlan): OpexVarianceDecomposition {
  const planAmount = c.planHeadcount * c.planCostPerHead;
  const actualAmount = c.actualHeadcount * c.actualCostPerHead + (c.unexplainedAdjustment ?? 0);
  const total = actualAmount - planAmount;
  const headcountEffect = c.planCostPerHead * (c.actualHeadcount - c.planHeadcount);
  const rateEffect = c.actualHeadcount * (c.actualCostPerHead - c.planCostPerHead);
  const explained = headcountEffect + rateEffect;
  const residual = total - explained;
  const flaggedUnexplained = Math.abs(total) > 0.01 && Math.abs(residual) > 0.2 * Math.abs(total);
  return { name: c.name, planAmount, actualAmount, total, headcountEffect, rateEffect, residual, flaggedUnexplained };
}
