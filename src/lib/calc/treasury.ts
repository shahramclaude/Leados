// Part 138 — cash reconciliation identity and covenant headroom math.

export function cashReconciliationResidual(
  bookBalance: number,
  bankBalance: number,
  outstandingItemsTotal: number,
): number {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  // identity: book - bank = outstanding items (within rounding)
  return round2(bookBalance - bankBalance - outstandingItemsTotal);
}

export type CovenantStatus = "healthy" | "watch" | "breach";

export type CovenantEvaluation = {
  headroomPct: number; // positive = room to spare, negative = breach
  status: CovenantStatus;
};

// direction 'max': currentValue must stay <= thresholdValue (e.g. leverage ratio)
// direction 'min': currentValue must stay >= thresholdValue (e.g. interest cover)
export function evaluateCovenant(
  direction: "max" | "min",
  thresholdValue: number,
  currentValue: number,
): CovenantEvaluation {
  let headroomPct: number;
  if (direction === "max") {
    headroomPct = thresholdValue === 0 ? 0 : (thresholdValue - currentValue) / Math.abs(thresholdValue);
  } else {
    headroomPct = thresholdValue === 0 ? 0 : (currentValue - thresholdValue) / Math.abs(thresholdValue);
  }

  let status: CovenantStatus;
  if (headroomPct < 0) status = "breach";
  else if (headroomPct < 0.1) status = "watch";
  else status = "healthy";

  return { headroomPct, status };
}
