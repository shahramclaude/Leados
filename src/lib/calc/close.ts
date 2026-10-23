// Part 124 — reconciliation identity & close-task sequencing logic.
// Identity enforced: source − GL = Σ reconciling items (within tolerance).

export type ReconciliationInput = {
  sourceBalance: number;
  glBalance: number;
  reconcilingItemsTotal: number;
  toleranceUsd: number;
};

export type ReconciliationResult = {
  difference: number; // source - gl
  residual: number; // difference - reconcilingItemsTotal (should be ~0)
  status: "matched" | "explained" | "exception";
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateReconciliation(input: ReconciliationInput): ReconciliationResult {
  const difference = round2(input.sourceBalance - input.glBalance);
  const residual = round2(difference - input.reconcilingItemsTotal);
  const withinTolerance = Math.abs(residual) <= Math.abs(input.toleranceUsd);

  if (!withinTolerance) {
    return { difference, residual, status: "exception" };
  }
  return { difference, residual, status: residual === 0 ? "matched" : "explained" };
}

export type CloseTaskLike = {
  id: number;
  sequence: number;
  status: string;
  evidenceRef: string | null;
};

// A sign-off is blocked without attached evidence — the "evidence-less sign-off" guard.
export function canSignOff(task: CloseTaskLike): { allowed: boolean; reason?: string } {
  if (!task.evidenceRef || task.evidenceRef.trim().length === 0) {
    return { allowed: false, reason: "Evidence reference required before sign-off." };
  }
  if (task.status === "blocked") {
    return { allowed: false, reason: "Task is blocked by a dependency." };
  }
  return { allowed: true };
}

// First-digit (Benford's Law) frequency check over a set of manual journal-entry
// amounts. Returns observed vs expected frequency per leading digit 1-9 and a
// chi-square-style deviation score. This FLAGS distributions for review; it never
// accuses — copy surfaced in the UI must say "flag, not accusation".
export function benfordFirstDigitCheck(amounts: number[]): {
  observed: Record<number, number>;
  expected: Record<number, number>;
  deviationScore: number;
  sampleSize: number;
} {
  const expected: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) expected[d] = Math.log10(1 + 1 / d);

  const counts: Record<number, number> = {};
  for (let d = 1; d <= 9; d++) counts[d] = 0;

  const usable = amounts.filter((a) => a > 0);
  for (const amount of usable) {
    const leading = parseInt(amount.toString().replace(".", "").replace(/^0+/, "")[0], 10);
    if (leading >= 1 && leading <= 9) counts[leading] += 1;
  }

  const n = usable.length || 1;
  const observed: Record<number, number> = {};
  let deviationScore = 0;
  for (let d = 1; d <= 9; d++) {
    observed[d] = counts[d] / n;
    const diff = observed[d] - expected[d];
    deviationScore += (diff * diff) / expected[d];
  }

  return { observed, expected, deviationScore, sampleSize: usable.length };
}
