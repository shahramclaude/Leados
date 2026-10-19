// src/lib/realOptions.ts
// Real-options valuation: should we decide now or does waiting have value?
//
// Exported: calculateRealOptionValue (function, line 24), OptionValueInput (line 14)

export interface OptionValueInput {
  estimatedValue: number;
  deadline: string | Date;
  now?: Date;
  /** annualized uncertainty in the underlying value estimate, default 35% */
  volatility?: number;
  /** annual risk-free / cost-of-capital rate, default 8% */
  riskFreeRate?: number;
}

/**
 * calculateRealOptionValue
 * Simplified Black-Scholes-style real option valuation. Treats "deciding now"
 * as exercising a call option on the estimated value, with time-to-deadline
 * as time-to-expiry. Returns the option premium — the dollar value of
 * flexibility / waiting for more information before committing.
 */
export function calculateRealOptionValue(input: OptionValueInput): number | null {
  const { estimatedValue, deadline } = input;
  if (!estimatedValue || estimatedValue <= 0) return null;

  const now = input.now ?? new Date();
  const deadlineDate = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const daysToExpiry = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (!isFinite(daysToExpiry) || daysToExpiry <= 0) return 0;

  const T = daysToExpiry / 365;
  const sigma = input.volatility ?? 0.35;
  const r = input.riskFreeRate ?? 0.08;
  const S = estimatedValue;
  const K = estimatedValue; // at-the-money: strike = current best estimate

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const callValue = S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
  return Math.round(callValue);
}

/** Standard normal CDF via Abramowitz & Stegun approximation */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return 1 - prob;
}
