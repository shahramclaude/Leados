/**
 * src/lib/realOptions.ts
 *
 * Minimal real-options valuation helper. This module is not directly wired
 * into the Financial Intelligence OS UI built in this slice (Part 6), but is
 * kept here because the Financial OS roadmap treats strategic bets (e.g. "do
 * we fund this new initiative") as real options rather than static NPV line
 * items. It is included so later slices can call `valueExpansionOption`
 * without re-deriving the formula.
 *
 * Formula: Black-Scholes-Merton closed-form European call valuation, applied
 * to a "real option" per the real-options-analysis framework (Copeland &
 * Antikarov, "Real Options: A Practitioner's Guide", 2001), which maps:
 *   S0 = present value of expected cash flows from the initiative
 *   K  = cost required to "exercise" (fully fund) the initiative
 *   T  = time until the decision must be made (years)
 *   r  = risk-free rate
 *   sigma = volatility of the underlying project value
 *
 * This is a standard but simplified application (UNVERIFIED for any specific
 * business use-case — real options valuation is sensitive to the volatility
 * estimate, which is rarely directly observable for an internal initiative).
 */

/** Standard normal cumulative distribution function via Abramowitz & Stegun 7.1.26 approximation. */
function standardNormalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);

  // Abramowitz & Stegun formula 7.1.26 (max error ~1.5e-7)
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1 + sign * y);
}

export interface RealOptionInputs {
  presentValueOfCashFlows: number; // S0
  exerciseCost: number; // K
  yearsUntilDecision: number; // T
  riskFreeRate: number; // r
  volatility: number; // sigma
}

export interface RealOptionValuation {
  optionValue: number;
  d1: number;
  d2: number;
}

/**
 * Black-Scholes-Merton closed-form call valuation, reinterpreted as the value
 * of the option to expand/fund an initiative later rather than committing now.
 */
export function valueExpansionOption(inputs: RealOptionInputs): RealOptionValuation {
  const { presentValueOfCashFlows: S0, exerciseCost: K, yearsUntilDecision: T, riskFreeRate: r, volatility: sigma } =
    inputs;

  if (T <= 0 || sigma <= 0 || S0 <= 0 || K <= 0) {
    return { optionValue: Math.max(0, S0 - K), d1: 0, d2: 0 };
  }

  // Black-Scholes d1, d2 terms
  const d1 = (Math.log(S0 / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);

  const optionValue = S0 * standardNormalCdf(d1) - K * Math.exp(-r * T) * standardNormalCdf(d2);

  return { optionValue, d1, d2 };
}
