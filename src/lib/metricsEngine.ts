/**
 * metricsEngine.ts — KPI extraction from raw simulation runs, plus
 * backtest scoring (MAE / CRPS vs naive persistence) used by
 * `calibration.ts` and reported in docs/SIMULATION.md.
 */
import type { DiscreteEventResult } from "@/lib/simulation";
import type { PhysicsTraceDay } from "@/lib/orgPhysics";
import { crps, mae, mean, quantile } from "@/lib/stats";

/** Flatten one discrete-event run into a scalar KPI bag (one value per KPI per run). */
export function summarizeDiscreteEventRun(result: DiscreteEventResult): Record<string, number> {
  const days = result.dailySnapshots;
  const horizon = days.length;
  const throughputs = days.map((d) => d.throughputToday);
  const cycleTimes = result.finishedItems.map((i) => i.cycleTimeDays);
  const lastDay = days[days.length - 1];
  const coldHandoffs = result.finishedItems.filter((i) => i.coldHandoff).length;

  return {
    itemsDone: result.finishedItems.length,
    itemsUnfinished: result.unfinishedCount,
    avgWeeklyThroughput: mean(throughputs) * 5,
    p50CycleTimeDays: cycleTimes.length > 0 ? quantile(cycleTimes, 0.5) : 0,
    p90CycleTimeDays: cycleTimes.length > 0 ? quantile(cycleTimes, 0.9) : 0,
    finalBacklog: lastDay ? lastDay.backlogCount : 0,
    avgUtilization: mean(days.map((d) => d.avgUtilization)),
    avgBrooksOverhead: mean(days.map((d) => d.brooksOverheadFraction)),
    coldHandoffRate: result.finishedItems.length > 0 ? coldHandoffs / result.finishedItems.length : 0,
    horizonDays: horizon,
  };
}

/** Flatten one physics run into a scalar KPI bag. */
export function summarizePhysicsRun(trace: PhysicsTraceDay[]): Record<string, number> {
  if (trace.length === 0) return { finalBurnout: 0, finalQuality: 1, finalDebt: 0, avgThroughput: 0 };
  const last = trace[trace.length - 1];
  return {
    finalBurnout: last.burnout,
    finalQuality: last.quality,
    finalDebt: last.debt,
    maxBurnout: Math.max(...trace.map((t) => t.burnout)),
    minQuality: Math.min(...trace.map((t) => t.quality)),
    avgThroughput: mean(trace.map((t) => t.throughput)),
  };
}

export interface KpiBacktestRow {
  kpi: string;
  twinMae: number;
  naiveMae: number;
  twinCrps: number;
  beatsNaive: boolean;
  improvementPct: number;
}

/**
 * Score an ensemble forecast (twin) against actuals and a naive-persistence
 * baseline. `twinEnsembles[t]` is the set of Monte Carlo sample values for
 * time step `t`; `naiveForecast[t]` is the single naive-persistence point
 * forecast for time step `t`; `actuals[t]` is what really happened.
 */
export function backtestKpi(
  kpi: string,
  twinEnsembles: number[][],
  naiveForecast: number[],
  actuals: number[],
): KpiBacktestRow {
  const n = Math.min(twinEnsembles.length, naiveForecast.length, actuals.length);
  const twinPoint = twinEnsembles.slice(0, n).map((ens) => mean(ens));
  const twinMae = mae(twinPoint, actuals.slice(0, n));
  const naiveMae = mae(naiveForecast.slice(0, n), actuals.slice(0, n));
  let crpsSum = 0;
  for (let i = 0; i < n; i++) crpsSum += crps(twinEnsembles[i], actuals[i]);
  const twinCrps = n > 0 ? crpsSum / n : NaN;
  const beatsNaive = twinMae < naiveMae;
  const improvementPct = naiveMae === 0 ? 0 : ((naiveMae - twinMae) / naiveMae) * 100;
  return { kpi, twinMae, naiveMae, twinCrps, beatsNaive, improvementPct };
}
