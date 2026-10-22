// Part 08 — generic ROI / NPV / IRR / payback helpers used by
// capitalAllocation.ts and investment.ts.

export function npv(rate: number, cashflows: number[]): number {
  return cashflows.reduce((sum, cf, t) => sum + cf / Math.pow(1 + rate, t), 0);
}

/** Bisection IRR solver (robust for monotone cashflow profiles like ours;
 * avoids pulling in a dependency for a single root-find). Returns null if no
 * sign change is found in [-0.99, 10]. */
export function irr(cashflows: number[]): number | null {
  const f = (r: number) => npv(r, cashflows);
  let lo = -0.99;
  let hi = 10;
  let fLo = f(lo);
  let fHi = f(hi);
  if (Number.isNaN(fLo) || Number.isNaN(fHi)) return null;
  if (fLo * fHi > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
      fHi = fMid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }
  return (lo + hi) / 2;
}

/** Months until cumulative net cashflow turns non-negative. Returns null if
 * it never pays back within the provided horizon. */
export function paybackPeriodMonths(upfrontCost: number, monthlyNetCashflow: number[]): number | null {
  let cumulative = -upfrontCost;
  for (let i = 0; i < monthlyNetCashflow.length; i++) {
    cumulative += monthlyNetCashflow[i];
    if (cumulative >= 0) {
      // linear interpolation within the month for a smoother estimate
      const prev = cumulative - monthlyNetCashflow[i];
      const frac = monthlyNetCashflow[i] !== 0 ? -prev / monthlyNetCashflow[i] : 0;
      return i + frac;
    }
  }
  return null;
}

export function simpleRoi(gain: number, cost: number): number {
  return cost === 0 ? 0 : (gain - cost) / cost;
}
