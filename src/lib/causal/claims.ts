// src/lib/causal/claims.ts
//
// Minimal stand-in for "Part 05's causal claims" register, needed here only
// so Part 06 can honestly contrast simulated correlation with claimed
// causation (see Phase 5 attack answer #3 in AI-SESSION-LOG.md and the model
// card page). This sandbox does not contain a real Part 05 deliverable; these
// are illustrative entries in the SHAPE Part 05 would produce (effect size +
// confidence interval + identification method), not real findings.

export interface CausalClaim {
  id: string;
  statement: string;
  effectSize: number;
  ciLow: number;
  ciHigh: number;
  method: "rct" | "quasi-experimental" | "observational";
  confidence: "low" | "medium" | "high";
}

export const CAUSAL_CLAIMS_REGISTER: CausalClaim[] = [
  {
    id: "manager-support-attrition",
    statement:
      "Increasing manager 1:1 cadence reduces voluntary attrition risk.",
    effectSize: -0.18,
    ciLow: -0.27,
    ciHigh: -0.09,
    method: "quasi-experimental",
    confidence: "medium",
  },
  {
    id: "workload-fatigue",
    statement: "Sustained overload above capacity increases reported burnout.",
    effectSize: 0.31,
    ciLow: 0.2,
    ciHigh: 0.42,
    method: "observational",
    confidence: "low",
  },
];

/**
 * Human-readable note contrasting the twin's mechanistic correlations with
 * Part 05's empirically-claimed causal effects. Surfaced on the model card.
 */
export const SIM_VS_CAUSAL_CONTRAST = `
The digital twin's agent/network mechanics are written as deterministic rules
plus seeded noise (e.g. "fatigue above 0.7 reduces throughput"). Any
correlation you see between two simulated series is TRUE BY CONSTRUCTION inside
the simulation — we wrote the equation. That is simulation-internal causality,
not evidence about the real organisation.

Part 05's causal claims register is the opposite kind of object: statements
that are supposed to be backed by an identification strategy against real or
quasi-experimental data (RCT / quasi-experimental / observational-with-caveats).

These two notions of "causal" must never be conflated:
  - "In the twin, raising motivation input increases completedThisWeek" is a
    MODEL FACT about the code, useful for understanding mechanism and for
    attribution (see attribution.ts), but it is NOT evidence that raising
    real motivation will increase real throughput by the same amount.
  - Only Part 05-style claims, backed by real identification strategies, may
    be used to justify real-world interventions. The twin may be used to
    explore the CONSEQUENCES of a Part-05-validated effect once it is plugged
    in as a scenario parameter — never the other way around.
`;
