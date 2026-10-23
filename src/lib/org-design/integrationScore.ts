// Integration-difficulty score: culture distance (Part 26 lineage) +
// systems overlap + talent-flight risk (Part 09 aggregate signals).
// Returned as Explain<number> — a composite score is a judgement aid, not a
// verdict, and the inputs remain visible alongside it.

import { explainNumber, type Explain } from "./types";

export type IntegrationInputs = {
  cultureDistance: number; // 0..100, higher = more distant cultures
  systemsOverlapPct: number; // 0..100, higher = more overlap (easier)
  talentFlightRisk: number; // 0..100, higher = more people likely to leave
};

export function scoreIntegrationDifficulty(inputs: IntegrationInputs): Explain<number> {
  const systemsDifficulty = 100 - inputs.systemsOverlapPct;
  const value = 0.4 * inputs.cultureDistance + 0.3 * systemsDifficulty + 0.3 * inputs.talentFlightRisk;
  const halfWidth = 20; // declared in model card: ±20 composite points

  return explainNumber({
    value: round1(value),
    low: round1(Math.max(0, value - halfWidth)),
    high: round1(Math.min(100, value + halfWidth)),
    confidence: 0.45,
    assumptions: [
      `Culture distance input: ${inputs.cultureDistance}/100 (Part 26 lineage placeholder metric).`,
      `Systems overlap input: ${inputs.systemsOverlapPct}/100 overlap (lower overlap raises difficulty).`,
      `Talent-flight risk input: ${inputs.talentFlightRisk}/100 (Part 09 aggregate signal, anonymised).`,
      "Weights (0.4 / 0.3 / 0.3) are a starting judgement, not a validated regression — treat the composite as a conversation starter, not a verdict.",
    ],
    rationale: "Composite = 0.4×culture distance + 0.3×(100 − systems overlap) + 0.3×talent-flight risk.",
    method: "integration-score-v1",
  });
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
