// src/lib/attentionOpt.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Minimal stand-in for
// the earlier attention-optimization module. Combines recovery signals
// (attention.ts) with meeting load (timeEconomics.ts) into a single coarse
// "recovery-adjusted capacity" number used only inside the person's own
// dashboard — never exported to org-level views.

import { deepWorkHonorRate, quietHoursKeptRate, type RecoverySignal } from "@/lib/attention";
import { meetingLoadFactor } from "@/lib/timeEconomics";

export interface RecoveryAdjustedCapacity {
  score: number; // 0..1, higher is more capacity
  basis: {
    deepWorkHonorRate: number | null;
    quietHoursKeptRate: number | null;
    avgMeetingLoadFactor: number | null;
  };
  sampleSize: number;
}

export function computeRecoveryAdjustedCapacity(
  signals: RecoverySignal[],
  meetingMinutesByDay: number[],
): RecoveryAdjustedCapacity {
  const honor = deepWorkHonorRate(signals);
  const quiet = quietHoursKeptRate(signals);
  const avgMeetingLoad =
    meetingMinutesByDay.length === 0
      ? null
      : meetingMinutesByDay.reduce((sum, m) => sum + meetingLoadFactor({ meetingMinutes: m }), 0) /
        meetingMinutesByDay.length;

  const parts: number[] = [];
  if (honor !== null) parts.push(honor);
  if (quiet !== null) parts.push(quiet);
  if (avgMeetingLoad !== null) parts.push(1 - avgMeetingLoad);

  const score = parts.length === 0 ? 0.5 : parts.reduce((a, b) => a + b, 0) / parts.length;

  return {
    score,
    basis: { deepWorkHonorRate: honor, quietHoursKeptRate: quiet, avgMeetingLoadFactor: avgMeetingLoad },
    sampleSize: signals.length,
  };
}
