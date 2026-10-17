// real_options — Black-Scholes real options valuation.
//
// PROVENANCE: pasted "pt-O" brief names `js/real_options.js`. Not found in
// github.com/wbweve/Leados this session. The Black-Scholes formula itself
// IS a verifiable, citable piece of real finance theory (Black & Scholes,
// 1973) — applied here to a strategic-investment "real option" framing
// (Myers, 1977), which is a standard, textbook technique, not invented here.
// The application to this app's specific synthetic numbers is original.

import { round1 } from "./prng";
import type { RealOptionsInputs } from "./types";

/** Abramowitz & Stegun (1964) rational approximation of the standard normal CDF. */
export function normCdf(x: number): number {
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const c = 0.39894228;

  if (x >= 0) {
    const t = 1 / (1 + p * x);
    return 1 - c * Math.exp((-x * x) / 2) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
  }
  const t = 1 / (1 - p * x);
  return c * Math.exp((-x * x) / 2) * t * (t * (t * (t * (t * b5 + b4) + b3) + b2) + b1);
}

export interface RealOptionsResult {
  d1: number;
  d2: number;
  callValue: number;
  staticNpv: number;
  optionPremiumOverNpv: number;
  decision: "exercise now" | "hold the option" | "let expire";
}

export function computeRealOptionValue(input: RealOptionsInputs): RealOptionsResult {
  const { pv: S, cost: K, years: T, volatility: sigma, riskFreeRate: r } = input;

  const safeT = Math.max(T, 0.0001);
  const safeSigma = Math.max(sigma, 0.0001);

  const d1 = (Math.log(S / K) + (r + (safeSigma * safeSigma) / 2) * safeT) / (safeSigma * Math.sqrt(safeT));
  const d2 = d1 - safeSigma * Math.sqrt(safeT);

  const callValue = S * normCdf(d1) - K * Math.exp(-r * safeT) * normCdf(d2);
  const staticNpv = S - K;
  const optionPremiumOverNpv = callValue - staticNpv;

  let decision: RealOptionsResult["decision"];
  if (staticNpv > 0 && optionPremiumOverNpv < staticNpv * 0.1) decision = "exercise now";
  else if (callValue > 0) decision = "hold the option";
  else decision = "let expire";

  return {
    d1: round1(d1),
    d2: round1(d2),
    callValue: round1(callValue),
    staticNpv: round1(staticNpv),
    optionPremiumOverNpv: round1(optionPremiumOverNpv),
    decision,
  };
}

export function realOptionsSignal(input: RealOptionsInputs): number {
  const { callValue } = computeRealOptionValue(input);
  // Normalize option value relative to cost basis into a 0-100 "strategic optionality" signal.
  const ratio = input.cost > 0 ? callValue / input.cost : 0;
  return Math.max(0, Math.min(100, ratio * 60));
}
