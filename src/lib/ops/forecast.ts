// Tiny, honest forecast: linear trend over the last N daily event counts,
// used only to populate the `forecast_drift_ratio` metric with a real
// number instead of a hard-coded placeholder. Not a product feature.
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface ForecastResult {
  forecastNextDay: number;
  actualLastDay: number;
  driftRatio: number;
  samplePoints: number;
}

/** Pure least-squares linear fit, extracted so it's unit-testable without a
 * database. Returns the predicted value at index `trainSeries.length`
 * (i.e. the next point after the training window). */
export function fitLinearTrendForecast(trainSeries: number[]): number {
  const n = trainSeries.length;
  if (n === 0) return 0;
  const xs = trainSeries.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = trainSeries.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (trainSeries[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  return Math.max(0, intercept + slope * n);
}

export function driftRatioOf(actual: number, forecast: number): number {
  return Math.abs(actual - forecast) / Math.max(1, forecast);
}

/** Fits a least-squares line to the last `days` daily event counts and
 * compares its prediction for the most recent day against what actually
 * happened (a simple backtest), expressed as a drift ratio. */
export async function computeForecastDrift(days = 14): Promise<ForecastResult> {
  const rows = await db.execute(sql`
    select date_trunc('day', created_at) as day, count(*)::int as n
    from event_log
    where created_at >= now() - (${days + 1} || ' days')::interval
    group by 1
    order by 1
  `);
  const series = (rows.rows as { day: string; n: number }[]).map((r) => r.n);
  if (series.length < 3) {
    return { forecastNextDay: 0, actualLastDay: series.at(-1) ?? 0, driftRatio: 0, samplePoints: series.length };
  }
  const trainSeries = series.slice(0, -1);
  const actualLastDay = series.at(-1)!;
  const forecastNextDay = fitLinearTrendForecast(trainSeries);
  const driftRatio = driftRatioOf(actualLastDay, forecastNextDay);
  return { forecastNextDay, actualLastDay, driftRatio, samplePoints: series.length };
}
