// Seam 3: chaos results update risk beliefs.
//
// A chaos experiment either "held" (the control/mitigation worked),
// "breached" (the risk materialized despite controls), or was
// "inconclusive". Belief score is a 0-1 probability-of-materializing
// estimate; a breach pushes belief up hard, a hold pulls it down
// gently (confirmation should be slower than disconfirmation for a
// safety-relevant belief), inconclusive leaves it unchanged.
export type ChaosOutcome = "held" | "breached" | "inconclusive";

export function applyChaosToRisk(beliefBefore: number, outcome: ChaosOutcome): number {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  if (outcome === "breached") {
    return Math.round(clamp(beliefBefore + (1 - beliefBefore) * 0.6) * 10000) / 10000;
  }
  if (outcome === "held") {
    return Math.round(clamp(beliefBefore - beliefBefore * 0.25) * 10000) / 10000;
  }
  return beliefBefore;
}
