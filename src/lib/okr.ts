import type { OkrStatus } from "./types";

/**
 * OKR pacing score: progress achieved vs. time elapsed through the period.
 * A score of 1.0 means "exactly on pace"; above 1.0 means ahead of pace.
 */
export function computeOkrScore(progress: number, timeElapsed: number): number {
  if (timeElapsed <= 0) return progress > 0 ? 1 : 0;
  return progress / timeElapsed;
}

export function computeOkrStatus(score: number): OkrStatus {
  if (score >= 0.7) return "on_track";
  if (score >= 0.4) return "at_risk";
  return "off_track";
}
