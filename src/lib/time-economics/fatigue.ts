// LEADOS — src/lib/fatigue.ts dependency stand-in (Part 14 contract)
//
// Honesty note: see temporal.ts header — the real Part 14 fatigue model
// was not present in this checkout. This stand-in sources its single
// headline constant from a specific, citable study rather than inventing
// a number, and is isolated here so it is a one-file swap.
//
// Primary source: Mark, Gudith & Klocke (2008), "The Cost of Interrupted
// Work: More Speed and Stress", CHI '08 — measured ~23 minutes, 15 seconds
// average time to fully resume a task after an interruption. Secondary
// support: Leroy (2009), "Why is it so hard to do my work?", Organizational
// Behavior and Human Decision Processes — "attention residue" after task
// switching degrades performance on the subsequent task.
//
// These numbers are population averages from small lab/field studies of
// knowledge workers, not a measurement of any individual. The model card
// (MODEL-CARD.md) calls this out as a parameter with real uncertainty.

export const DEFAULT_RECOVERY_MINUTES_PER_INTERRUPTION = 23;

/** Diminishing-but-nonzero recovery cost as interruptions stack up in a day. */
export function cumulativeRecoveryMinutes(
  interruptionCount: number,
  recoveryMinutesPerInterruption = DEFAULT_RECOVERY_MINUTES_PER_INTERRUPTION,
): number {
  if (interruptionCount <= 0) return 0;
  // First interruption costs the full recovery window; subsequent ones in
  // the same day are assumed to compound at 70% (residual attention debt),
  // reflecting Leroy (2009)'s residue effect rather than full independence.
  let total = 0;
  let marginal = recoveryMinutesPerInterruption;
  for (let i = 0; i < interruptionCount; i++) {
    total += marginal;
    marginal *= 0.7;
  }
  return Math.round(total * 10) / 10;
}

/** A 0..1 fatigue index for a day given interruption count and hours worked. */
export function dailyFatigueIndex(interruptionCount: number, hoursWorked: number): number {
  const recovery = cumulativeRecoveryMinutes(interruptionCount);
  const workMinutes = Math.max(1, hoursWorked * 60);
  const recoveryShare = Math.min(1, recovery / workMinutes);
  const lengthPressure = Math.min(1, Math.max(0, (hoursWorked - 6) / 6)); // rises after 6h
  return Math.min(1, 0.7 * recoveryShare + 0.3 * lengthPressure);
}
