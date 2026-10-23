// Industry market-structure metrics: HHI, entry/exit flows, price/capacity
// cycle heuristic. Pure functions so they can be fixture-tested against
// hand-computed values (see tests/industry-metrics.test.ts).

export type HhiBand = "unconcentrated" | "moderate" | "concentrated";

/**
 * Herfindahl-Hirschman Index. Shares may be given as fractions (0..1) or
 * percentages (0..100) — detected by the `asPercent` flag. Standard formula:
 * HHI = sum(share_i_as_percent^2), range 0..10000.
 */
export function computeHHI(shares: number[], opts: { asPercent?: boolean } = {}): number {
  if (shares.length === 0) return 0;
  const pct = opts.asPercent ? shares : shares.map((s) => s * 100);
  const total = pct.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 1.5) {
    // Honesty: shares that don't sum to ~100% indicate bad input data.
    // We still compute, but callers should surface this as a data-quality flag.
  }
  return pct.reduce((sum, p) => sum + p * p, 0);
}

export function classifyHHIBand(hhi: number): HhiBand {
  if (hhi < 1500) return "unconcentrated";
  if (hhi <= 2500) return "moderate";
  return "concentrated";
}

export interface EntryExitFlow {
  entrants: number;
  exits: number;
  netEntryRate: number; // (entrants - exits) / priorFirmCount
  turnoverRate: number; // (entrants + exits) / priorFirmCount
}

export function computeEntryExitFlow(entrants: number, exits: number, priorFirmCount: number): EntryExitFlow {
  if (priorFirmCount <= 0) {
    throw new Error("computeEntryExitFlow: priorFirmCount must be > 0");
  }
  return {
    entrants,
    exits,
    netEntryRate: (entrants - exits) / priorFirmCount,
    turnoverRate: (entrants + exits) / priorFirmCount,
  };
}

export type CyclePhase = "expansion" | "peak" | "contraction" | "trough";

export interface CycleReading {
  phase: CyclePhase | null; // null = insufficient data, do not guess
  confidence: number; // 0..1 heuristic confidence, 0 when phase is null
  method: string;
}

/**
 * Heuristic price/capacity cycle classification from a short utilization
 * series (0..1 values, chronological order, most recent last). This is a
 * MODEL ESTIMATE / heuristic, not a verified macro call — always label it as
 * such in the UI. Requires >= 3 points; otherwise returns phase: null.
 */
export function detectCapacityCycle(utilizationSeries: number[]): CycleReading {
  const method = "slope-and-level heuristic over trailing utilization series";
  if (utilizationSeries.length < 3) {
    return { phase: null, confidence: 0, method };
  }
  const n = utilizationSeries.length;
  const last = utilizationSeries[n - 1];
  const prev = utilizationSeries[n - 2];
  const slope = last - prev;
  const avg = utilizationSeries.reduce((a, b) => a + b, 0) / n;
  const highLevel = last >= 0.85;
  const lowLevel = last <= 0.65;

  let phase: CyclePhase;
  if (slope > 0.01 && !highLevel) phase = "expansion";
  else if (slope > 0 && highLevel) phase = "peak";
  else if (slope < -0.01 && !lowLevel) phase = "contraction";
  else if (slope <= 0 && lowLevel) phase = "trough";
  else phase = last >= avg ? "peak" : "trough";

  // Confidence shrinks with short series and with slope near zero (ambiguous).
  const lengthConfidence = Math.min(1, (n - 2) / 6); // saturates at 8 points
  const slopeConfidence = Math.min(1, Math.abs(slope) / 0.05);
  const confidence = Math.max(0.15, Math.min(1, 0.5 * lengthConfidence + 0.5 * slopeConfidence));

  return { phase, confidence: Number(confidence.toFixed(2)), method };
}
