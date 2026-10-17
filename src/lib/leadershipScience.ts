// js/leadership_science.js (requested module) -> src/lib/leadershipScience.ts.
//
// IMPORTANT LABEL: the functions below are *named after* well-known, public
// leadership-science concepts (Tuckman's stages of group development, 1965;
// Edmondson's psychological safety construct, 1999; Dunbar's layered social
// group sizes, ~1992). The formulas themselves are original, simplified
// heuristics written for this sandbox, NOT a reproduction of any published
// instrument, survey, or scoring model from those authors. Treat the numeric
// outputs as illustrative, not as validated psychometrics — unverified beyond
// "this is what this file's own code computes."

import type { Person } from "./types";
import type { SignalBoard } from "./types";
import { RULES } from "./rules";

export type TuckmanStage = "Forming" | "Storming" | "Norming" | "Performing" | "Adjourning";

/** Heuristic only — not Tuckman's original instrument. */
export function estimateTuckmanStage(teamAgeMonths: number, trustFindingsActive: number): TuckmanStage {
  if (teamAgeMonths < 2) return "Forming";
  if (trustFindingsActive >= 2) return "Storming";
  if (teamAgeMonths < 9) return "Norming";
  if (trustFindingsActive === 0) return "Performing";
  return "Norming";
}

/** Heuristic 0-100 index. Higher = more psychological-safety risk signals active. */
export function psychologicalSafetyRiskIndex(board: SignalBoard): number {
  const trustRules = RULES.filter((r) => r.category === "Trust & Psychological Safety");
  const activeCount = trustRules.filter((r) => board[r.id]?.active).length;
  if (trustRules.length === 0) return 0;
  return Math.round((activeCount / trustRules.length) * 100);
}

/**
 * Span-of-control risk: flags managers whose direct-report count sits well
 * outside the commonly cited 5-9 "effective span" range used in org-design
 * literature. The 5-9 figure is a widely cited rule of thumb, not sourced to
 * a single verified paper here — flagged as an approximation.
 */
export function spanOfControlRisk(person: Person): "under" | "healthy" | "over" {
  if (person.directReports === 0) return "under";
  if (person.directReports >= 5 && person.directReports <= 9) return "healthy";
  return "over";
}

/**
 * Dunbar-layer load factor: a simplified illustration of Dunbar's observation
 * that stable social relationships cluster in layers of roughly 5 / 15 / 50 / 150.
 * Here it's reused only as a rough "relationship bandwidth" gauge for a manager's
 * total reachable network (direct + 2nd-degree via peers), not a validated model.
 */
export function dunbarLoadFactor(directReports: number, peerCount: number): number {
  const reach = directReports + peerCount * 0.3;
  if (reach <= 5) return 1;
  if (reach <= 15) return 2;
  if (reach <= 50) return 3;
  return 4;
}

export interface LeadershipScienceSnapshot {
  tuckmanStage: TuckmanStage;
  psychSafetyRiskIndex: number;
  spanOfControl: Record<string, "under" | "healthy" | "over">;
}

export function buildSnapshot(board: SignalBoard, roster: Person[], teamAgeMonths: number): LeadershipScienceSnapshot {
  const trustActive = RULES.filter((r) => r.category === "Trust & Psychological Safety" && board[r.id]?.active).length;
  const spanOfControl: Record<string, "under" | "healthy" | "over"> = {};
  for (const p of roster) spanOfControl[p.id] = spanOfControlRisk(p);
  return {
    tuckmanStage: estimateTuckmanStage(teamAgeMonths, trustActive),
    psychSafetyRiskIndex: psychologicalSafetyRiskIndex(board),
    spanOfControl,
  };
}
