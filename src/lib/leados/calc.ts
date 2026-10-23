// LEADOS — shared calculations for the strategic & AI-native modules.
// Every function here is pure (no I/O) so results are reproducible and
// every derived number can be explained by the formula that produced it.

export type Honesty = "measured" | "modeled";

/** 108 — Expected Commercial Value for an innovation bet.
 * ECV = P(technical) * P(commercial) * NPV - remainingCost
 */
export function expectedCommercialValue(input: {
  probTechnical: number;
  probCommercial: number;
  npvUsd: number;
  remainingCostUsd: number;
}): number {
  const { probTechnical, probCommercial, npvUsd, remainingCostUsd } = input;
  return probTechnical * probCommercial * npvUsd - remainingCostUsd;
}

/** 108 — Simplified real-option value (not a full binomial lattice; a
 * transparent approximation suitable for decision support): the option is
 * worth the upside only if it clears the remaining cost, discounted by the
 * combined probability of success.
 */
export function realOptionValue(input: {
  probTechnical: number;
  probCommercial: number;
  npvUsd: number;
  remainingCostUsd: number;
}): number {
  const upside = Math.max(input.npvUsd - input.remainingCostUsd, 0);
  return upside * input.probTechnical * input.probCommercial;
}

/** 109 — Reputation risk score = exposure x severity x velocity. */
export function reputationRiskScore(exposure: number, severity: number, velocity: number): number {
  return exposure * severity * velocity;
}

/** Media exposure proxy = reach-weighted reliability. */
export function mediaExposure(reach: number, sourceReliability: number): number {
  return reach * sourceReliability;
}

/** 110 — Herfindahl-Hirschman Index for concentration risk.
 * HHI = sum(share_i^2), shares expressed as percentages (0-100), so HHI is 0..10000.
 */
export function hhi(shares: number[]): number {
  return shares.reduce((sum, s) => sum + s * s, 0);
}

export function concentrationBand(hhiValue: number): "low" | "watch" | "action" {
  if (hhiValue >= 2500) return "action";
  if (hhiValue >= 1500) return "watch";
  return "low";
}

/** 111 — Synergy run-rate reconciliation identity check. */
export function synergyVariancePct(planned: number, achieved: number): number {
  if (planned === 0) return 0;
  return ((achieved - planned) / planned) * 100;
}

/** Unverified synergies cannot count toward targets. */
export function countableSynergyUsd(achievedRunRateUsd: number, financeVerified: boolean): number {
  return financeVerified ? achievedRunRateUsd : 0;
}

/** 112 — Regulatory impact score = probability x impact x time-decay.
 * Time decay rises as the effective date approaches (closer = sharper signal).
 */
export function regulatoryImpactScore(input: {
  probability: number;
  impactUsd: number;
  proximityDays: number;
}): number {
  const decay = 1 / (1 + Math.max(input.proximityDays, 0) / 180);
  return input.probability * input.impactUsd * decay;
}

/** Only primary-source or official-summary evidence can move an item to "enacted". */
export function canMarkEnacted(evidenceClass: string): boolean {
  return evidenceClass === "primary-source" || evidenceClass === "official-summary";
}

/** 113 — Decision-quality scorecard, computed strictly from record fields (0-100). */
export function decisionQualityScore(input: {
  optionsConsidered: number;
  dissentSought: boolean;
  assumptionsLabeled: boolean;
  predictionsMade: boolean;
  reviewScheduled: boolean;
  outcomeScored: boolean;
}): number {
  let points = 0;
  if (input.optionsConsidered >= 2) points += 1;
  if (input.dissentSought) points += 1;
  if (input.assumptionsLabeled) points += 1;
  if (input.predictionsMade) points += 1;
  if (input.reviewScheduled) points += 1;
  if (input.outcomeScored) points += 1;
  return Math.round((points / 6) * 100);
}

/** k-anonymity guard: aggregate diagnostics below this threshold must not render. */
export const K_ANON_THRESHOLD = 10;
export function passesKAnonymity(n: number): boolean {
  return n >= K_ANON_THRESHOLD;
}

/** 114 — ZOPA (zone of possible agreement) between our reservation and the
 * counterparty's. Returns null when there is no evidenced counterparty
 * reservation (render as "unknown" rather than inventing a number).
 */
export function zopa(
  ourReservation: number,
  theirReservationEstimate: number | null,
  weAreSeller: boolean
): [number, number] | null {
  if (theirReservationEstimate === null || Number.isNaN(theirReservationEstimate)) return null;
  const sellerFloor = weAreSeller ? ourReservation : theirReservationEstimate;
  const buyerCeiling = weAreSeller ? theirReservationEstimate : ourReservation;
  if (sellerFloor > buyerCeiling) return null; // no deal zone
  return [sellerFloor, buyerCeiling];
}

/** 115 — Readiness without evidence renders as "unknown" — never invented. */
export function effectiveReadiness(readiness: string, evidenceNotes: string | null | undefined): string {
  if (!evidenceNotes || evidenceNotes.trim().length === 0) return "unknown";
  return readiness;
}

/** 117 — Tech-debt priority = interest x age(weeks) / principal. */
export function debtPriority(interestPerWeek: number, principal: number, createdAt: Date, now = new Date()): number {
  const ageWeeks = Math.max((now.getTime() - createdAt.getTime()) / (7 * 24 * 60 * 60 * 1000), 0);
  const safePrincipal = principal <= 0 ? 1 : principal;
  return (interestPerWeek * ageWeeks) / safePrincipal;
}

/** 117 — Fitness-function ratchet: value may only improve, never regress. */
export function ratchetPasses(currentValue: number, bestValue: number, direction: "max" | "min"): boolean {
  return direction === "max" ? currentValue >= bestValue : currentValue <= bestValue;
}
export function nextBest(currentValue: number, bestValue: number, direction: "max" | "min"): number {
  return direction === "max" ? Math.max(currentValue, bestValue) : Math.min(currentValue, bestValue);
}

/** 118 — Policy lifecycle: legal transitions only. */
const POLICY_TRANSITIONS: Record<string, string[]> = {
  draft: ["testing"],
  testing: ["adopted", "draft"],
  adopted: ["review-due"],
  "review-due": ["adopted", "sunset"],
  sunset: ["retired"],
  retired: [],
};
export function canTransitionPolicy(from: string, to: string): boolean {
  return (POLICY_TRANSITIONS[from] ?? []).includes(to);
}

/** 119 — Wave entry gate: all four criteria required to start a wave. */
export function waveEntryReady(input: {
  dataReady: boolean;
  trained: boolean;
  pilotPassed: boolean;
  rollbackReady: boolean;
}): boolean {
  return input.dataReady && input.trained && input.pilotPassed && input.rollbackReady;
}

/** 121 — Simplified Monte Carlo ROI distribution using Box-Muller normal draws. */
export function monteCarloRoi(
  investmentUsd: number,
  benefitMeanUsd: number,
  benefitStdPct: number,
  iterations = 4000,
  seed = 42
): { p10: number; p50: number; p90: number; meanRoi: number } {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const draws: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const u1 = Math.max(rand(), 1e-9);
    const u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const benefit = Math.max(benefitMeanUsd * (1 + (benefitStdPct / 100) * z), 0);
    const roi = investmentUsd > 0 ? (benefit - investmentUsd) / investmentUsd : 0;
    draws.push(roi);
  }
  draws.sort((a, b) => a - b);
  const pct = (p: number) => draws[Math.min(Math.floor(p * draws.length), draws.length - 1)];
  const meanRoi = draws.reduce((a, b) => a + b, 0) / draws.length;
  return { p10: pct(0.1), p50: pct(0.5), p90: pct(0.9), meanRoi };
}

/** 121 — Causal-language lint: only RCT / diff-in-diff / matched-pairs may use
 * causal wording; everything else must render as association.
 */
export function confidenceLabel(method: string): "causal" | "associational" | "self-reported" {
  if (method === "rct" || method === "diff-in-diff" || method === "matched-pairs") return "causal";
  if (method === "time-series") return "associational";
  return "self-reported";
}

/** 122 — Simple two-proportion z-test significance check for method candidates. */
export function isSignificantImprovement(currentScore: number, proposedScore: number, n = 200): boolean {
  if (proposedScore === undefined || proposedScore === null) return false;
  const p1 = currentScore;
  const p2 = proposedScore;
  const pooled = (p1 + p2) / 2;
  const se = Math.sqrt((2 * pooled * (1 - pooled)) / n) || 1e-9;
  const z = (p2 - p1) / se;
  return z > 1.645; // one-sided 95%
}
