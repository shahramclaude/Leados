// realOptions — real-options valuation: does *waiting* for more information
// have value, or should we decide now? Framed as a call option on the
// decision's best estimate of value, with time-to-deadline as time-to-expiry.
// This is a simplification of Black-Scholes applied outside its native
// domain (traded securities) — treat the output as a directional "value of
// flexibility" estimate, not a priced financial instrument.

export interface OptionValueInput {
  estimatedValue: number;
  deadline: string | Date;
  now?: Date;
  /** annualized uncertainty in the underlying value estimate, default 35% */
  volatility?: number;
  /** annual risk-free / cost-of-capital rate, default 8% */
  riskFreeRate?: number;
}

export interface OptionValueResult {
  optionValue: number | null;
  daysToExpiry: number;
  assumptions: { volatility: number; riskFreeRate: number };
  interpretation: string;
}

/** Standard normal CDF via Abramowitz & Stegun approximation. */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  let prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) prob = 1 - prob;
  return 1 - prob;
}

/**
 * calculateRealOptionValue — the dollar value of flexibility: how much is it
 * worth to delay committing, given the uncertainty will partially resolve
 * before the deadline. Treats "deciding now" as exercising an at-the-money
 * call option on the estimated value.
 */
export function calculateRealOptionValue(input: OptionValueInput): OptionValueResult {
  const { estimatedValue, deadline } = input;
  const volatility = input.volatility ?? 0.35;
  const riskFreeRate = input.riskFreeRate ?? 0.08;
  const assumptions = { volatility, riskFreeRate };

  if (!estimatedValue || estimatedValue <= 0) {
    return { optionValue: null, daysToExpiry: 0, assumptions, interpretation: "No positive value estimate on file — option value cannot be computed." };
  }

  const now = input.now ?? new Date();
  const deadlineDate = typeof deadline === "string" ? new Date(deadline) : deadline;
  const daysToExpiry = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (!isFinite(daysToExpiry) || daysToExpiry <= 0) {
    return { optionValue: 0, daysToExpiry: 0, assumptions, interpretation: "Deadline has passed or is today — no remaining option value; decide now." };
  }

  const T = daysToExpiry / 365;
  const S = estimatedValue;
  const K = estimatedValue; // at-the-money: strike = current best estimate
  const d1 = (Math.log(S / K) + (riskFreeRate + (volatility * volatility) / 2) * T) / (volatility * Math.sqrt(T));
  const d2 = d1 - volatility * Math.sqrt(T);
  const callValue = S * normCdf(d1) - K * Math.exp(-riskFreeRate * T) * normCdf(d2);
  const optionValue = Math.round(callValue);

  const pctOfValue = optionValue / estimatedValue;
  const interpretation =
    pctOfValue > 0.15
      ? `Waiting is worth roughly $${optionValue.toLocaleString()} (${(pctOfValue * 100).toFixed(0)}% of the value at stake) given ${Math.round(daysToExpiry)} days of remaining uncertainty-resolution time — this favors a reversible, staged commitment over deciding irreversibly today.`
      : `The value of waiting is modest (~$${optionValue.toLocaleString()}) relative to the value at stake — the uncertainty isn't resolving fast enough to justify delay; deciding now is reasonable if the door is two-way.`;

  return { optionValue, daysToExpiry: Math.round(daysToExpiry), assumptions, interpretation };
}
