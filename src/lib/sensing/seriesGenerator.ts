// Synthetic series generator used by (a) the seeded anomaly injection
// harness `npm run eval:sensing`, and (b) demo/seed data for the app UI.

import { mulberry32, gaussian } from "./rng";
import type { GeneratedSeries, InjectedAnomaly, InjectionKind, SeriesMeta } from "./types";

export interface GenerateOptions {
  seed: number;
  length?: number; // default 120 points
  startValue?: number; // default 100
  noiseStd?: number; // default 4
  dailyTrend?: number; // default 0 (flat baseline drift per point)
  seasonalPeriod?: number | null; // default null (no seasonality)
  seasonalAmplitude?: number; // default 10
  heavyTailed?: boolean;
  injections?: InjectionKind[]; // which kinds to inject, one each, non-overlapping
  stepHours?: number; // spacing between points, default 24 (daily)
}

function addInjection(
  values: number[],
  kind: InjectionKind,
  start: number,
  rng: () => number,
  seasonalPeriod: number | null,
): InjectedAnomaly {
  const n = values.length;
  const end = Math.min(n, start + (kind === "spike" ? 1 : 25));
  switch (kind) {
    case "level_shift": {
      const shift = (gaussian(rng) >= 0 ? 1 : -1) * (18 + rng() * 10);
      for (let i = start; i < n; i++) values[i] += shift;
      return { kind, start, end: n };
    }
    case "trend_change": {
      const slope = (gaussian(rng) >= 0 ? 1 : -1) * (0.8 + rng() * 0.6);
      for (let i = start; i < n; i++) values[i] += slope * (i - start);
      return { kind, start, end: n };
    }
    case "seasonal_break": {
      // Flip/dampen the seasonal component for a window, breaking the
      // expected periodic shape without changing the overall level/trend.
      const period = seasonalPeriod ?? 7;
      const windowEnd = Math.min(n, start + period * 3);
      for (let i = start; i < windowEnd; i++) {
        const phase = ((i % period) / period) * 2 * Math.PI;
        values[i] -= Math.sin(phase) * 14; // cancel/override normal seasonal swing
      }
      return { kind, start, end: windowEnd };
    }
    case "spike": {
      const spike = (gaussian(rng) >= 0 ? 1 : -1) * (25 + rng() * 15);
      values[start] += spike;
      return { kind, start, end: start + 1 };
    }
    default:
      return { kind, start, end };
  }
}

export function generateSeries(meta: SeriesMeta, options: GenerateOptions): GeneratedSeries {
  const rng = mulberry32(options.seed);
  const length = options.length ?? 120;
  const startValue = options.startValue ?? 100;
  const noiseStd = options.noiseStd ?? 4;
  const dailyTrend = options.dailyTrend ?? 0;
  const seasonalPeriod = options.seasonalPeriod ?? null;
  const seasonalAmplitude = options.seasonalAmplitude ?? 10;
  const stepHours = options.stepHours ?? 24;

  const values: number[] = [];
  for (let i = 0; i < length; i++) {
    let v = startValue + dailyTrend * i;
    if (seasonalPeriod) {
      v += Math.sin((i / seasonalPeriod) * 2 * Math.PI) * seasonalAmplitude;
    }
    if (options.heavyTailed) {
      // Student-t-ish heavy tail: mixture of two gaussians, one wide.
      const wide = rng() < 0.03;
      v += gaussian(rng, 0, wide ? noiseStd * 3 : noiseStd);
    } else {
      v += gaussian(rng, 0, noiseStd);
    }
    values.push(v);
  }

  const injections: InjectedAnomaly[] = [];
  const kinds = options.injections ?? [];
  // Space injections out so eval windows don't overlap.
  const segment = Math.floor(length / (kinds.length + 1));
  kinds.forEach((kind, idx) => {
    const start = Math.max(30, segment * (idx + 1));
    if (start < length - 2) {
      injections.push(addInjection(values, kind, start, rng, seasonalPeriod));
    }
  });

  const baseTs = Date.UTC(2024, 0, 1);
  const points = values.map((value, i) => ({
    ts: new Date(baseTs + i * stepHours * 3600 * 1000).toISOString(),
    value,
  }));

  return { points, meta, injections };
}
