// Real-options valuation adapted from the Black-Scholes option pricing model.
//
// Mapping strategic "wait and see" decisions onto a financial call option:
//   S (spot)   -> current estimated value of the opportunity if exercised today
//   K (strike) -> cost of committing/deciding now
//   T (time)   -> years until the decision deadline
//   r          -> discount/risk-free rate assumption
//   sigma      -> volatility of the opportunity's value (uncertainty)
//
// A strategic decision with a deadline behaves like an American/European call:
// the "option to wait" has value only while uncertainty can still resolve in
// your favor and there is time left before the deadline forces exercise.
//
// This module was previously orphaned — built, never imported anywhere. Part 5
// wires it into `strategicIntelligence.ts`.

/** Standard normal cumulative distribution function (Abramowitz & Stegun 7.1.26 approximation). */
export function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const prob =
    d *
    t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/** Standard normal probability density function. */
export function normalPdf(x: number): number {
  return Math.exp(-(x * x) / 2) / Math.sqrt(2 * Math.PI);
}

export interface BlackScholesInputs {
  spot: number; // S
  strike: number; // K
  timeToExpiryYears: number; // T
  riskFreeRate: number; // r
  volatility: number; // sigma
}

export interface BlackScholesResult {
  value: number; // call option value
  delta: number; // d(value)/d(spot)
  theta: number; // d(value)/d(t), PER YEAR (negative = value decays as time passes)
  thetaPerDay: number; // convenience: theta / 365
  d1: number;
  d2: number;
}

/**
 * Black-Scholes value of a European call option, with first-order greeks.
 * Formula: C = S*N(d1) - K*e^(-rT)*N(d2)
 * Theta (call): -[S*N'(d1)*sigma / (2*sqrt(T))] - r*K*e^(-rT)*N(d2)
 * Reference: Black & Scholes (1973) closed-form solution — textbook formula.
 */
export function blackScholesCall(inputs: BlackScholesInputs): BlackScholesResult {
  const { spot, strike, riskFreeRate: r } = inputs;
  // Guard against non-physical/degenerate inputs (expired or zero-volatility options).
  const T = Math.max(inputs.timeToExpiryYears, 1 / 365);
  const sigma = Math.max(inputs.volatility, 0.01);

  const d1 =
    (Math.log(spot / strike) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const discountedStrike = strike * Math.exp(-r * T);
  const value = spot * normalCdf(d1) - discountedStrike * normalCdf(d2);

  const theta =
    -((spot * normalPdf(d1) * sigma) / (2 * Math.sqrt(T))) -
    r * discountedStrike * normalCdf(d2);

  return {
    value: Math.max(0, value),
    delta: normalCdf(d1),
    theta,
    thetaPerDay: theta / 365,
    d1,
    d2,
  };
}

export interface DecisionOptionInputs {
  /** Estimated value captured if the opportunity is exercised today. */
  spot: number;
  /** Cost of committing to the decision now. */
  strike: number;
  /** Days remaining until the decision must be made. */
  daysRemaining: number;
  /** Annualized discount rate assumption. */
  riskFreeRate?: number;
  /** Volatility of the underlying opportunity's value. */
  volatility?: number;
}

export interface DecisionOptionValuation extends BlackScholesResult {
  daysRemaining: number;
  /** True when the option is decaying fast enough that waiting is net-costly. */
  isDecayingFast: boolean;
  recommendation: "decide_now" | "wait" | "monitor";
}

const FAST_DECAY_THETA_PER_DAY_THRESHOLD = -5; // value units lost per day, heuristic threshold

/**
 * Value the "option to wait" on a strategic decision and recommend whether to
 * decide now, keep waiting, or simply monitor.
 * Formula source: `blackScholesCall` above (realOptions.ts).
 */
export function valueDecisionOption(inputs: DecisionOptionInputs): DecisionOptionValuation {
  const { spot, strike, daysRemaining, riskFreeRate = 0.08, volatility = 0.35 } = inputs;
  const timeToExpiryYears = Math.max(daysRemaining, 0) / 365;

  const bs = blackScholesCall({
    spot,
    strike,
    timeToExpiryYears,
    riskFreeRate,
    volatility,
  });

  const isDecayingFast = bs.thetaPerDay < FAST_DECAY_THETA_PER_DAY_THRESHOLD;

  let recommendation: DecisionOptionValuation["recommendation"] = "monitor";
  if (isDecayingFast || daysRemaining <= 3) {
    recommendation = "decide_now";
  } else if (bs.value > strike * 0.1) {
    recommendation = "wait";
  }

  return {
    ...bs,
    daysRemaining,
    isDecayingFast,
    recommendation,
  };
}
