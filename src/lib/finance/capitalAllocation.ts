// Part 08 — capital allocation: candidate initiatives ranked by risk-adjusted
// ROI so leadership can see where the next incremental dollar is best spent.
// Evidence quality is tracked explicitly per initiative (see Phase 5 attack
// answer #1 in AI-SESSION-LOG.md: leverage and evidence quality are NOT the
// same axis, and the highest-leverage initiative here is also the
// lowest-evidence one).

import { npv, paybackPeriodMonths, simpleRoi } from "./roi";
import type { ConfidenceClass } from "./types";

export interface Initiative {
  id: string;
  label: string;
  monthlyCost: number;
  horizonMonths: number;
  expectedMonthlyBenefit: number;
  /** How well-evidenced the benefit estimate is. "asserted" = a leader's gut
   * estimate with no supporting data yet. */
  evidenceQuality: ConfidenceClass;
  discountRateAnnual: number;
  description: string;
}

export const CANDIDATE_INITIATIVES: Initiative[] = [
  {
    id: "init-sales-headcount",
    label: "Add 4 enterprise AEs",
    monthlyCost: 4 * 11500,
    horizonMonths: 24,
    expectedMonthlyBenefit: 4 * 1.3 * 0.24 * 640 * 12, // reps x productivity x winRate x ACV, ramped
    evidenceQuality: "evidence",
    discountRateAnnual: 0.18,
    description: "Scale the proven outbound motion with reps at current blended productivity and win rate.",
  },
  {
    id: "init-pricing",
    label: "Core platform price increase (+8%)",
    monthlyCost: 1500, // enablement / comms cost
    horizonMonths: 24,
    expectedMonthlyBenefit: 0.08 * 640 * 180, // 8% uplift x current customer base proxy
    evidenceQuality: "forecast",
    discountRateAnnual: 0.18,
    description: "Extend the step-price-increase pattern already observed twice in the actuals.",
  },
  {
    id: "init-churn-program",
    label: "Dedicated churn-save program (2 CS hires)",
    monthlyCost: 2 * 8500,
    horizonMonths: 24,
    expectedMonthlyBenefit: 0.004 * 640 * 180, // assumed 0.4pt monthly churn reduction x ARPU x base
    evidenceQuality: "asserted",
    discountRateAnnual: 0.18,
    description:
      "Leadership estimate (no pilot data yet) that 2 dedicated CS hires reduce monthly churn by ~0.4pt. " +
      "This is the highest-leverage, lowest-evidence initiative in the current plan — see attack notes.",
  },
  {
    id: "init-services-expansion",
    label: "Expand services delivery capacity",
    monthlyCost: 9000,
    horizonMonths: 18,
    expectedMonthlyBenefit: 3 * 19000 * 0.42, // 3 incremental projects/mo at current margin
    evidenceQuality: "evidence",
    discountRateAnnual: 0.18,
    description: "Add delivery capacity to capture backlog demand already visible in the pipeline.",
  },
];

export interface RankedInitiative extends Initiative {
  npv: number;
  roi: number;
  paybackMonths: number | null;
  leverageScore: number; // NPV per $ of monthly cost — "bang per buck"
}

export function rankInitiatives(initiatives: Initiative[] = CANDIDATE_INITIATIVES): RankedInitiative[] {
  return initiatives
    .map((i) => {
      const cashflows = [-i.monthlyCost, ...Array(i.horizonMonths).fill(i.expectedMonthlyBenefit - i.monthlyCost)];
      const monthlyRate = Math.pow(1 + i.discountRateAnnual, 1 / 12) - 1;
      const initiativeNpv = npv(monthlyRate, cashflows);
      const totalCost = i.monthlyCost * i.horizonMonths;
      const totalBenefit = i.expectedMonthlyBenefit * i.horizonMonths;
      const roi = simpleRoi(totalBenefit, totalCost);
      const payback = paybackPeriodMonths(i.monthlyCost, Array(i.horizonMonths).fill(i.expectedMonthlyBenefit));
      return {
        ...i,
        npv: initiativeNpv,
        roi,
        paybackMonths: payback,
        leverageScore: i.monthlyCost > 0 ? initiativeNpv / i.monthlyCost : 0,
      };
    })
    .sort((a, b) => b.leverageScore - a.leverageScore);
}
