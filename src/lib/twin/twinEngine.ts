import { gaussian, mulberry32, type RNG } from "../core/rng";
import type { TwinConfig, TwinState, TwinStepOptions } from "./types";

/**
 * Deterministic twin stepper. Given the same config/seed and the same
 * sequence of deltas, produces the exact same trajectory — this is what
 * lets scenario ensembles and war-games be reproducible.
 */
export function createTwin(config: TwinConfig): TwinState {
  return {
    tick: 0,
    metrics: { ...config.parameters },
    log: [`twin:${config.id} initialized`],
  };
}

export function rngForTwin(config: TwinConfig, tick: number): RNG {
  // Mixing tick into the seed keeps each tick's draw independent but reproducible.
  return mulberry32((config.seed ^ (tick * 2654435761)) >>> 0);
}

const METRIC_VOLATILITY: Record<string, number> = {
  revenueGrowth: 0.012,
  churnRate: 0.006,
  cashRunwayMonths: 0.4,
  headcount: 2,
  marketShare: 0.004,
  regulatoryPressure: 0.03,
  talentAvailability: 0.02,
  competitorAggression: 0.03,
};

export function stepTwin(state: TwinState, config: TwinConfig, options: TwinStepOptions = {}): TwinState {
  const rng = rngForTwin(config, state.tick + 1);
  const metrics: Record<string, number> = { ...state.metrics };

  for (const key of Object.keys(metrics)) {
    const fallbackVol = Math.abs(metrics[key]) * 0.02 || 0.01;
    const vol = METRIC_VOLATILITY[key] ?? fallbackVol;
    metrics[key] = metrics[key] + gaussian(rng, 0, vol);
  }
  if (options.deltas) {
    for (const [key, delta] of Object.entries(options.deltas)) {
      metrics[key] = (metrics[key] ?? 0) + delta;
    }
  }
  // Keep a few metrics within sane bounds.
  if ("churnRate" in metrics) metrics.churnRate = clamp(metrics.churnRate, 0, 1);
  if ("marketShare" in metrics) metrics.marketShare = clamp(metrics.marketShare, 0, 1);
  if ("cashRunwayMonths" in metrics) metrics.cashRunwayMonths = Math.max(0, metrics.cashRunwayMonths);
  if ("headcount" in metrics) metrics.headcount = Math.max(0, Math.round(metrics.headcount));

  const log = options.note ? [...state.log, `t${state.tick + 1}: ${options.note}`] : state.log;
  return { tick: state.tick + 1, metrics, log };
}

export function runTwin(
  config: TwinConfig,
  ticks: number,
  deltasByTick: Record<number, Record<string, number>> = {},
  notesByTick: Record<number, string> = {}
): TwinState[] {
  const trace: TwinState[] = [createTwin(config)];
  for (let t = 1; t <= ticks; t++) {
    const prev = trace[trace.length - 1];
    trace.push(
      stepTwin(prev, config, {
        deltas: deltasByTick[t],
        note: notesByTick[t],
      })
    );
  }
  return trace;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
