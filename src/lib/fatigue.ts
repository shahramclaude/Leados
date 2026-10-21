// Fatigue heuristic: how "spent" is this user's attention budget right now,
// as a 0..1 score. Backed only by the interrupt_log ledger (observable,
// auditable), not by any physiological or inferred-emotion signal — so the
// claim here is strictly "spend rate relative to declared budget", not a
// clinical fatigue measurement.

export interface FatigueInput {
  interruptsToday: number;
  dailyBudget: number;
  minutesSinceLastInterrupt: number | null;
}

export interface FatigueResult {
  score: number; // 0 = fresh, 1 = fully spent
  label: "fresh" | "moderate" | "high" | "exhausted";
  explain: string;
}

export function computeFatigue(input: FatigueInput): FatigueResult {
  const budget = Math.max(1, input.dailyBudget);
  const spendRatio = Math.min(1, input.interruptsToday / budget);

  // Rapid-fire interrupts (little recovery time) push fatigue up even below
  // budget; a cool-down drags it back down.
  const recencyPenalty =
    input.minutesSinceLastInterrupt === null
      ? 0
      : Math.max(0, 0.2 - input.minutesSinceLastInterrupt / 150);

  const score = Math.max(0, Math.min(1, spendRatio * 0.85 + recencyPenalty));

  let label: FatigueResult["label"] = "fresh";
  if (score >= 0.95) label = "exhausted";
  else if (score >= 0.66) label = "high";
  else if (score >= 0.33) label = "moderate";

  return {
    score: Number(score.toFixed(2)),
    label,
    explain: `${input.interruptsToday}/${budget} interrupts spent today` +
      (input.minutesSinceLastInterrupt !== null
        ? `, last one ${Math.round(input.minutesSinceLastInterrupt)}m ago`
        : ", none yet today"),
  };
}
