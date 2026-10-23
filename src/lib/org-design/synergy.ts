// Synergy estimate builder — Explain<T> model (Part 08 lineage) applied to
// M&A deal synergies. Every estimate is an interval with assumptions, never
// a single headline number.

import { explainNumber, type Explain } from "./types";

export type SynergyCategory = "cost" | "revenue" | "capability";

export function estimateSynergy(args: {
  category: SynergyCategory;
  baselineAnnualValue: number; // e.g. combined cost base or revenue base, in currency units
  expectedPct: number; // central synergy estimate as % of baseline
  uncertaintyPct: number; // +/- band as % of baseline (wide by default — see honesty rules)
  assumptions: string[];
}): Explain<number> {
  const mid = args.baselineAnnualValue * (args.expectedPct / 100);
  const band = args.baselineAnnualValue * (args.uncertaintyPct / 100);

  return explainNumber({
    value: round0(mid),
    low: round0(Math.max(0, mid - band)),
    high: round0(mid + band),
    confidence: args.category === "cost" ? 0.5 : 0.35, // revenue/capability synergies are historically less reliable than cost
    assumptions: [
      `Baseline annual value: ${args.baselineAnnualValue.toLocaleString()}`,
      `Expected synergy: ${args.expectedPct}% of baseline, ±${args.uncertaintyPct}% uncertainty band`,
      ...args.assumptions,
      "Revenue and capability synergies are notoriously overestimated in deal models — this estimate is intentionally conservative on confidence.",
    ],
    rationale: `${args.category} synergy = ${args.expectedPct}% of a ${args.baselineAnnualValue.toLocaleString()} baseline, with a ±${args.uncertaintyPct}% band.`,
    method: "synergy-explain-v1",
  });
}

function round0(n: number) {
  return Math.round(n);
}
