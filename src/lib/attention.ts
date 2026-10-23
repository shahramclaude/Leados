// src/lib/attention.ts
//
// RECONSTRUCTION NOTE: see src/lib/circadian.ts header. Minimal stand-in for
// the earlier attention-tracking module: deep-work and quiet-hours
// "recovery signals" that feed the capacity dashboard. Self-scope only —
// these values are always read/written through leaderState/repository.ts.

export interface RecoverySignal {
  date: string; // YYYY-MM-DD
  deepWorkBlocksHonored: number;
  deepWorkBlocksPlanned: number;
  quietHoursKept: boolean;
}

export function deepWorkHonorRate(signals: RecoverySignal[]): number | null {
  const withPlans = signals.filter((s) => s.deepWorkBlocksPlanned > 0);
  if (withPlans.length === 0) return null;
  const totalPlanned = withPlans.reduce((sum, s) => sum + s.deepWorkBlocksPlanned, 0);
  const totalHonored = withPlans.reduce((sum, s) => sum + s.deepWorkBlocksHonored, 0);
  return totalPlanned === 0 ? null : totalHonored / totalPlanned;
}

export function quietHoursKeptRate(signals: RecoverySignal[]): number | null {
  if (signals.length === 0) return null;
  const kept = signals.filter((s) => s.quietHoursKept).length;
  return kept / signals.length;
}
