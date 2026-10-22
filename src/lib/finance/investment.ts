// Part 08 — scenario/valuation bridge: DCF-lite + sensitivity grid.
// EV = Sum_t FCF_t / (1+wacc)^t + terminalValue / (1+wacc)^N
// terminalValue = FCF_N x (1+g) / (wacc - g)   [Gordon growth, g < wacc]

export interface DcfInput {
  freeCashFlows: number[]; // monthly FCF for the forecast horizon
  wacc: number; // annual
  terminalGrowth: number; // annual
}

export interface DcfResult {
  ev: number;
  pvExplicit: number;
  pvTerminal: number;
  terminalValue: number;
  monthlyDiscountRate: number;
  /** false when the last explicit-period FCF is still negative, which makes
   * a Gordon-growth terminal value mathematically well-defined but
   * practically meaningless (it perpetuates a loss into infinity). Honesty
   * rule: we surface this instead of hiding it or silently clamping it. */
  terminalValueReliable: boolean;
}

function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

export function discountedCashFlow({ freeCashFlows, wacc, terminalGrowth }: DcfInput): DcfResult {
  const r = monthlyRate(wacc);
  const g = monthlyRate(terminalGrowth);
  let pvExplicit = 0;
  for (let t = 0; t < freeCashFlows.length; t++) {
    pvExplicit += freeCashFlows[t] / Math.pow(1 + r, t + 1);
  }
  const lastFcf = freeCashFlows[freeCashFlows.length - 1] ?? 0;
  const terminalValue = r > g ? (lastFcf * (1 + g)) / (r - g) : 0;
  const pvTerminal = terminalValue / Math.pow(1 + r, freeCashFlows.length);
  const terminalValueReliable = lastFcf > 0 && r > g;
  return { ev: pvExplicit + pvTerminal, pvExplicit, pvTerminal, terminalValue, monthlyDiscountRate: r, terminalValueReliable };
}

export interface SensitivityCell {
  wacc: number;
  growth: number;
  ev: number;
}

export function sensitivityGrid(
  freeCashFlows: number[],
  waccRange: number[],
  growthRange: number[],
): SensitivityCell[][] {
  return waccRange.map((wacc) =>
    growthRange.map((growth) => {
      const { ev } = discountedCashFlow({ freeCashFlows, wacc, terminalGrowth: growth });
      return { wacc, growth, ev };
    }),
  );
}

export interface WhatIfDriverChange {
  driverId: string;
  monthIndex: number;
  value: number;
}
