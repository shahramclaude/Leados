// LEADOS — Part 14 "attention budget" dependency stand-in
//
// Honesty note: see temporal.ts header. Part 14's attention-budget module
// was not present in this checkout; this implements the minimal contract
// Part 45 needs — a per-person daily deep-work minutes budget, and how
// much of it a proposed meeting would consume/fragment.

export interface AttentionBudgetConfig {
  dailyDeepWorkTargetMinutes: number; // e.g. 240 = 4 hours/day target
}

export const DEFAULT_ATTENTION_BUDGET: AttentionBudgetConfig = {
  dailyDeepWorkTargetMinutes: 240,
};

export interface AttentionBudgetStatus {
  targetMinutes: number;
  preservedMinutes: number; // actual contiguous deep-work minutes available
  deficitMinutes: number; // max(0, target - preserved)
  utilizationPct: number; // preserved / target, capped at 100
}

export function evaluateAttentionBudget(
  preservedDeepWorkMinutes: number,
  config: AttentionBudgetConfig = DEFAULT_ATTENTION_BUDGET,
): AttentionBudgetStatus {
  const deficit = Math.max(0, config.dailyDeepWorkTargetMinutes - preservedDeepWorkMinutes);
  const utilizationPct = Math.min(
    100,
    Math.round((preservedDeepWorkMinutes / config.dailyDeepWorkTargetMinutes) * 1000) / 10,
  );
  return {
    targetMinutes: config.dailyDeepWorkTargetMinutes,
    preservedMinutes: preservedDeepWorkMinutes,
    deficitMinutes: deficit,
    utilizationPct,
  };
}
