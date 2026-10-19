// src/lib/flightRisk.ts
//
// NEW MODULE standing in for the "Part 2" flight-risk model referenced by
// this brief (no prior file existed in this checkout — see provenance
// note in src/lib/types.ts). Because there was no pre-existing
// computeFlightRisk to extend, this file is authored in its *final*,
// Part-3-complete form directly: a baseline score (lines 33-55, see the
// "BASELINE" comment block) plus the Part-3 conversation-signal
// multiplier the brief requires, applied at the single return statement
// documented below (see the "PART 3 EXTENSION POINT" comment immediately
// above the `return` on line ~70). That is the exact line being
// "modified" relative to a hypothetical pre-Part-3 version of this
// function.

import type { ConversationSignals } from "./conversationIntelligence";
import type { PersonRecord } from "./types";
import { noisyOr } from "./beliefFabric";
import { tenureInMonths } from "./lifeStage";

export interface FlightRiskResult {
  score: number; // 0-1
  factors: string[];
}

/**
 * Caller: src/lib/talentEngine.ts (buildPersonProfile, 1 call site).
 *
 * BASELINE (lines below): combines three independent risk proxies via
 * noisy-OR (CITATION: src/lib/beliefFabric.ts, noisyOr()):
 *   1. tenure-plateau proxy — long tenure with no recorded promotion
 *      readiness signals reads as stagnation risk.
 *   2. compensationFlag — an explicit HR-logged comp concern.
 *   3. low promotionReadiness combined with growth-stage life stage.
 * All weights/bands are UNVERIFIED (original heuristic authored this
 * session) in the absence of a prior formula to cite.
 */
export function computeFlightRisk(
  person: PersonRecord,
  recentSignals: ConversationSignals[] = []
): FlightRiskResult {
  const factors: string[] = [];

  const tenureMonths = tenureInMonths(person.startDate);
  const tenurePlateauProxy = tenureMonths > 24 && (person.promotionReadiness ?? 50) < 40 ? 0.5 : 0.15;
  if (tenurePlateauProxy > 0.3) factors.push("Long tenure without promotion momentum");

  const compProxy = person.compensationFlag ? 0.6 : 0.1;
  if (person.compensationFlag) factors.push("Open compensation concern on file");

  const readinessProxy = (person.promotionReadiness ?? 50) < 30 ? 0.4 : 0.1;

  let baseline = Math.max(0, Math.min(1, noisyOr([tenurePlateauProxy, compProxy, readinessProxy])));

  // ---------------------------------------------------------------
  // PART 3 EXTENSION POINT — this is the exact modification described
  // by the brief: "If any hasExitSignal=true: apply a multiplier of 1.8
  // to the existing score (clamp after). If sentimentScore < -0.3 on
  // average: apply 1.3." Both multipliers can stack (applied
  // sequentially) and the result is clamped to [0,1] after each step,
  // exactly as instructed ("clamp after").
  // ---------------------------------------------------------------
  const last3 = recentSignals.slice(0, 3);
  const anyExitSignal = last3.some((s) => s.hasExitSignal);
  if (anyExitSignal) {
    baseline = Math.min(1, baseline * 1.8);
    factors.push("Exit signal detected in recent 1:1 notes");
  }

  if (last3.length > 0) {
    const avgSentiment = last3.reduce((sum, s) => sum + s.sentimentScore, 0) / last3.length;
    if (avgSentiment < -0.3) {
      baseline = Math.min(1, baseline * 1.3);
      factors.push("Negative sentiment trend across recent 1:1s");
    }
  }

  return { score: Math.max(0, Math.min(1, baseline)), factors };
}
