// D. Real-options reasoning, applied honestly. This is NOT Black-Scholes
// (there is no tradeable underlying/volatility surface for a staffing or
// product decision), so we use a defensible, disclosed simplification:
// "expected value of waiting for information" — and we say "not applicable"
// when the structural preconditions for option value aren't met, rather than
// forcing a number out of a model that doesn't fit.
import type { Reversibility } from "@/lib/decisionTypes";

export type OptionValueResult =
  | { applicable: false; reason: string }
  | {
      applicable: true;
      method: string;
      valueOfWaiting: number;
      recommendation: "decide now" | "defer and gather information";
      caveats: string[];
    };

export function assessOptionValue(input: {
  reversibility: Reversibility;
  hasCredibleWaitOption: boolean; // can we actually defer without losing the opportunity?
  decideNowEv: number;
  deferredEvIfGoodNews: number;
  deferredEvIfBadNews: number;
  probabilityGoodNews: number;
  costOfWaiting: number; // e.g., competitor moves, carrying cost, lost revenue
}): OptionValueResult {
  if (input.reversibility === "two-way-door") {
    return { applicable: false, reason: "Two-way-door decisions are cheap to reverse; the cost of deciding now and correcting later is normally lower than the analysis cost of formal option valuation. Just decide and adjust." };
  }
  if (!input.hasCredibleWaitOption) {
    return { applicable: false, reason: "No credible way to defer this decision without forfeiting the opportunity (e.g., hard external deadline, competitor pre-emption) — option-value reasoning doesn't change the call." };
  }

  // Value of waiting = EV(decide after information resolves) - cost of waiting - EV(decide now)
  const evAfterInfo =
    input.probabilityGoodNews * Math.max(input.deferredEvIfGoodNews, input.decideNowEv) +
    (1 - input.probabilityGoodNews) * Math.max(input.deferredEvIfBadNews, input.decideNowEv);
  const valueOfWaiting = evAfterInfo - input.costOfWaiting - input.decideNowEv;

  return {
    applicable: true,
    method: "expected-value-of-information heuristic (not Black-Scholes: no tradeable underlying/volatility surface exists for this decision)",
    valueOfWaiting: Math.round(valueOfWaiting * 100) / 100,
    recommendation: valueOfWaiting > 0 ? "defer and gather information" : "decide now",
    caveats: [
      "Assumes the decision-maker can and will act optimally on new information once it arrives — in practice organizational inertia erodes some of this value.",
      "probabilityGoodNews is itself an assumption, not a measured frequency; sensitivity-test it before trusting the recommendation.",
    ],
  };
}
