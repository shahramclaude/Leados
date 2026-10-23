// Pure synthetic time-series generator for the world model (Part 59).
// Used by: the eval:worldmodel calibration harness, the demo seed script,
// and unit tests. No DB access here — this module is intentionally free of
// side effects so it can be property-tested in isolation.
import { gaussian, mulberry32 } from "@/lib/rng";
import type { ObservationPoint } from "@/lib/worldModelCore";

export interface SyntheticSeriesSpec {
  n: number;
  intercept: number;
  slope: number;
  noiseStd: number;
  seed: number;
  startPeriod?: string; // ISO date; defaults to 2024-01-01, monthly steps
}

/** Deterministic synthetic series: value_t = intercept + slope*t + N(0, noiseStd). */
export function generateSyntheticSeries(spec: SyntheticSeriesSpec): ObservationPoint[] {
  const rand = mulberry32(spec.seed);
  const start = spec.startPeriod ? new Date(spec.startPeriod) : new Date("2024-01-01T00:00:00Z");
  const points: ObservationPoint[] = [];
  for (let t = 0; t < spec.n; t++) {
    const value = spec.intercept + spec.slope * t + spec.noiseStd * gaussian(rand);
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + t);
    points.push({ period: d.toISOString().slice(0, 10), value: Math.round(value * 1000) / 1000 });
  }
  return points;
}
