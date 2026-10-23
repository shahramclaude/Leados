// src/lib/leaderState/capacitySignals.ts
//
// The ONLY bridge between leader-state data and Part 45's scheduling
// optimizer. It never hands over raw decisions or recovery rows — only a
// coarse `CapacitySignal` (see timeEconomics.ts), and only when the owner
// currently holds an active, non-expired `scheduler-optimizer` grant.

import { hasActiveGrant, internalFetchForDerivation } from "@/lib/leaderState/repository";
import { computeRecoveryAdjustedCapacity } from "@/lib/attentionOpt";
import { decisionWindowSuggestion } from "@/lib/leaderState/decisionLoad";
import type { CapacitySignal } from "@/lib/timeEconomics";

export interface CapacitySignalResult {
  granted: boolean;
  signal: CapacitySignal | null;
  reason?: string;
}

/**
 * Called by (a stand-in for) Part 45's optimizer. Returns `granted: false`
 * with no signal at all if there is no active grant — including when a
 * grant has expired or was revoked. The optimizer must treat that exactly
 * like "no information," never as a fallback to read raw data.
 */
export async function getCapacitySignalForScheduler(ownerUserId: string): Promise<CapacitySignalResult> {
  const active = await hasActiveGrant("scheduler-optimizer-service", ownerUserId);
  if (!active) {
    return { granted: false, signal: null, reason: "no active scheduler-optimizer grant for this owner" };
  }

  const { decisions, recoverySignals } = await internalFetchForDerivation(ownerUserId);
  const recoveryAdjusted = computeRecoveryAdjustedCapacity(
    recoverySignals.map((r) => ({
      date: r.date,
      deepWorkBlocksHonored: r.deepWorkBlocksHonored,
      deepWorkBlocksPlanned: r.deepWorkBlocksPlanned,
      quietHoursKept: r.quietHoursKept,
    })),
    recoverySignals.map((r) => r.meetingMinutes),
  );
  const window = decisionWindowSuggestion(decisions);

  const signal: CapacitySignal = {
    ownerUserId,
    asOf: new Date(),
    capacityScore: Math.round(recoveryAdjusted.score * 100) / 100,
    suggestedDecisionWindows: window.bucket ? [window.bucket] : [],
    confidence: window.confidence === "moderate" ? "moderate" : "low",
    sourceSampleSize: window.sampleSize,
  };

  return { granted: true, signal };
}
