import type { TwinState } from "../twin/types";

export interface ResilienceResult {
  metric: string;
  baselineFinal: number;
  stressedTrough: number;
  stressedTroughTick: number;
  stressedFinal: number;
  /** How far the stressed trace fell below baseline at its worst point (normalized to baseline scale). */
  troughDepth: number;
  /** Ticks from the trough until the stressed trace recovers to within `tolerance` of baseline. -1 if never. */
  recoveryTicks: number;
  /** 0 (shattered, never recovers) – 1 (barely dented / recovers immediately). */
  score: number;
}

/**
 * Compare a stressed trace against a no-shock baseline trace of the same
 * scenario/twin to score resilience: how deep the trough was, and how fast
 * the metric recovered.
 */
export function assessResilience(
  baselineTrace: TwinState[],
  stressedTrace: TwinState[],
  metric: string,
  tolerance = 0.08
): ResilienceResult {
  const n = Math.min(baselineTrace.length, stressedTrace.length);
  const baselineFinal = baselineTrace[baselineTrace.length - 1].metrics[metric] ?? 0;

  let troughValue = Infinity;
  let troughTick = 0;
  let troughDepth = 0;
  for (let t = 0; t < n; t++) {
    const b = baselineTrace[t].metrics[metric] ?? 0;
    const s = stressedTrace[t].metrics[metric] ?? 0;
    const depth = b - s; // positive means stressed is worse (assuming higher-is-better metric)
    if (s < troughValue) {
      troughValue = s;
      troughTick = t;
      troughDepth = depth;
    }
  }

  let recoveryTicks = -1;
  const scale = Math.max(Math.abs(baselineFinal), 1e-6);
  for (let t = troughTick; t < n; t++) {
    const b = baselineTrace[t].metrics[metric] ?? 0;
    const s = stressedTrace[t].metrics[metric] ?? 0;
    if (Math.abs(b - s) / scale <= tolerance) {
      recoveryTicks = t - troughTick;
      break;
    }
  }

  const normalizedDepth = clamp01(troughDepth / scale);
  const recoveryPenalty = recoveryTicks < 0 ? 1 : clamp01(recoveryTicks / n);
  const score = clamp01(1 - 0.6 * normalizedDepth - 0.4 * recoveryPenalty);

  return {
    metric,
    baselineFinal,
    stressedTrough: troughValue,
    stressedTroughTick: troughTick,
    stressedFinal: stressedTrace[stressedTrace.length - 1].metrics[metric] ?? 0,
    troughDepth: normalizedDepth,
    recoveryTicks,
    score,
  };
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}
