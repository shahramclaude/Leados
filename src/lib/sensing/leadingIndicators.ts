// Leading-indicator framework: pure evaluation logic. DB orchestration
// (reading the indicator + latest metric point, writing a Finding +
// notification stub) lives in the API route so this stays unit-testable.

export type IndicatorDirection = "above" | "below";

export interface IndicatorEvaluation {
  breached: boolean;
  currentValue: number;
  thresholdValue: number;
  direction: IndicatorDirection;
  /** How close the current value is to the threshold, 0 = far, 1 = at/over threshold. */
  proximity: number;
}

export function evaluateIndicator(
  currentValue: number,
  direction: IndicatorDirection,
  thresholdValue: number,
  // used to scale "nearing threshold" proximity even before breach
  referenceRange = Math.max(1, Math.abs(thresholdValue) * 0.5),
): IndicatorEvaluation {
  const breached = direction === "above" ? currentValue >= thresholdValue : currentValue <= thresholdValue;
  const distance = direction === "above" ? thresholdValue - currentValue : currentValue - thresholdValue;
  const proximity = breached ? 1 : Math.max(0, Math.min(1, 1 - distance / referenceRange));
  return { breached, currentValue, thresholdValue, direction, proximity };
}
