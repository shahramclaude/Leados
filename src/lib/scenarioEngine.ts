// src/lib/scenarioEngine.ts
// Deterministic + stochastic scenario projection engine.
//
// Exported members referenced elsewhere in the codebase (exact names):
//   - MetricDefinition           (interface, line 13)
//   - BaselineState              (type, line 23)
//   - METRIC_DEFINITIONS         (const, line 26)
//   - defaultBaselineState       (const, line 83)
//   - ScenarioResult             (interface, line 98)
//   - projectScenario            (function, line 112)
//   - olsTrend                   (function, line 167) — used by strategicIntelligence.ts

import type { MetricKey } from './types';
import { runMonteCarlo } from './monteCarlo';

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  unit: string;
  /** fraction of baseline value representing one "month" of volatility, e.g. 0.08 = 8% */
  volatility: number;
  /** assumed monthly drift under a "no action" scenario, as a fraction of baseline */
  monthlyDrift: number;
  direction: 'higher_better' | 'lower_better';
}

export type BaselineState = Record<MetricKey, number>;

export const METRIC_DEFINITIONS: Record<MetricKey, MetricDefinition> = {
  revenue: { key: 'revenue', label: 'Monthly Revenue', unit: '$', volatility: 0.07, monthlyDrift: 0.02, direction: 'higher_better' },
  churnRate: { key: 'churnRate', label: 'Monthly Churn Rate', unit: '%', volatility: 0.15, monthlyDrift: 0.0, direction: 'lower_better' },
  cac: { key: 'cac', label: 'Customer Acquisition Cost', unit: '$', volatility: 0.1, monthlyDrift: 0.01, direction: 'lower_better' },
  burnRate: { key: 'burnRate', label: 'Monthly Burn Rate', unit: '$', volatility: 0.08, monthlyDrift: 0.015, direction: 'lower_better' },
  runwayMonths: { key: 'runwayMonths', label: 'Runway', unit: 'months', volatility: 0.1, monthlyDrift: -0.04, direction: 'higher_better' },
  nps: { key: 'nps', label: 'Net Promoter Score', unit: 'pts', volatility: 0.12, monthlyDrift: 0.0, direction: 'higher_better' },
  headcount: { key: 'headcount', label: 'Headcount', unit: 'FTE', volatility: 0.03, monthlyDrift: 0.01, direction: 'higher_better' },
  pipelineCoverage: { key: 'pipelineCoverage', label: 'Pipeline Coverage', unit: 'x', volatility: 0.14, monthlyDrift: 0.0, direction: 'higher_better' },
  conversionRate: { key: 'conversionRate', label: 'Lead Conversion Rate', unit: '%', volatility: 0.11, monthlyDrift: 0.0, direction: 'higher_better' },
  grossMargin: { key: 'grossMargin', label: 'Gross Margin', unit: '%', volatility: 0.05, monthlyDrift: 0.0, direction: 'higher_better' },
  productUsage: { key: 'productUsage', label: 'Weekly Active Usage', unit: '%', volatility: 0.09, monthlyDrift: 0.01, direction: 'higher_better' },
};

/** Default modeled baseline (the plan the board last approved) for every metric. */
export const defaultBaselineState: BaselineState = {
  revenue: 520000,
  churnRate: 2.8,
  cac: 4200,
  burnRate: 310000,
  runwayMonths: 17,
  nps: 38,
  headcount: 64,
  pipelineCoverage: 3.4,
  conversionRate: 21,
  grossMargin: 71,
  productUsage: 58,
};

export interface ScenarioResult {
  metricKey: MetricKey;
  horizonMonths: number;
  months: number[];
  p10: number[];
  p50: number[];
  p90: number[];
  /** month index (p10 band) at which the metric crosses a critical floor; null if never within horizon */
  p10CriticalMonth: number | null;
  /** p10 value of runwayMonths at the end of horizon — used for urgency scoring across all scenarios */
  p10RunwayMonths: number;
}

const CRITICAL_FLOOR: Partial<Record<MetricKey, number>> = {
  revenue: 0,
  runwayMonths: 0,
  nps: -20,
  grossMargin: 0,
  productUsage: 0,
};

/**
 * projectScenario
 * Projects a metric (and the knock-on runway position) forward `horizonMonths`
 * using a Monte Carlo band (n trials) seeded from the metric's volatility and
 * drift, with optional baseline overrides (e.g. an observed actual value).
 */
export function projectScenario(
  baseline: BaselineState,
  overrides: Partial<BaselineState>,
  metricKey: MetricKey,
  horizonMonths = 12,
  trials = 1000,
): ScenarioResult {
  const state: BaselineState = { ...baseline, ...overrides };
  const def = METRIC_DEFINITIONS[metricKey];
  const start = state[metricKey];
  const vol = def.volatility;
  const drift = def.monthlyDrift;

  const runwayDef = METRIC_DEFINITIONS.runwayMonths;
  const runwayStart = state.runwayMonths;

  const band = runMonteCarlo((trialIndex) => {
    let value = start;
    const path: number[] = [];
    // deterministic-ish pseudo-random per trial for reproducibility
    let seed = trialIndex * 9301 + 49297;
    const rand = () => {
      seed = (seed * 233280 + 1) % 9999991;
      return seed / 9999991;
    };
    for (let m = 1; m <= horizonMonths; m++) {
      const shock = (rand() * 2 - 1) * vol;
      value = Math.max(0, value * (1 + drift + shock));
      path.push(value);
    }
    return path;
  }, trials);

  // second lightweight pass purely to get p10 runway position at horizon end
  const runwayBand = runMonteCarlo((trialIndex) => {
    let runwayValue = runwayStart;
    let seed = trialIndex * 7639 + 1337;
    const rand = () => {
      seed = (seed * 48271) % 2147483647;
      return (seed < 0 ? seed + 2147483647 : seed) / 2147483647;
    };
    const path: number[] = [];
    for (let m = 1; m <= horizonMonths; m++) {
      const shock = (rand() * 2 - 1) * runwayDef.volatility;
      runwayValue = Math.max(0, runwayValue + runwayDef.monthlyDrift * runwayValue - 1 + runwayValue * shock * 0.05);
      path.push(runwayValue);
    }
    return path;
  }, trials);

  const months = Array.from({ length: horizonMonths }, (_, i) => i + 1);
  const floor = CRITICAL_FLOOR[metricKey];
  let p10CriticalMonth: number | null = null;
  if (floor !== undefined) {
    const idx = band.p10.findIndex((v) => (def.direction === 'lower_better' ? v >= 1e12 : v <= floor));
    p10CriticalMonth = idx === -1 ? null : months[idx];
  }

  return {
    metricKey,
    horizonMonths,
    months,
    p10: band.p10,
    p50: band.p50,
    p90: band.p90,
    p10CriticalMonth,
    p10RunwayMonths: runwayBand.p10[runwayBand.p10.length - 1] ?? runwayStart,
  };
}

/**
 * olsTrend
 * Ordinary-least-squares slope of a time series, returned in units/month
 * (series is assumed to be daily; slope is annualized to a 30-day month).
 */
export function olsTrend(values: { date: string; value: number }[]): number {
  if (values.length < 2) return 0;
  const sorted = [...values].sort((a, b) => a.date.localeCompare(b.date));
  const t0 = new Date(sorted[0].date).getTime();
  const xs = sorted.map((v) => (new Date(v.date).getTime() - t0) / (1000 * 60 * 60 * 24)); // days
  const ys = sorted.map((v) => v.value);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slopePerDay = den === 0 ? 0 : num / den;
  return slopePerDay * 30; // units per month
}
