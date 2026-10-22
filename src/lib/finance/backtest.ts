// Part 08 — rolling-origin forecast backtest. For each driver and each
// origin month (after a minimum warm-up window), we forecast exactly one
// month ahead using only the data available up to that origin, then check
// whether the realized next value fell inside the model's own P10-P90 band
// (an 80% interval, see `driverForecasts.ts` / `Z_P80`). Aggregated
// coverage should land close to 80% (gate: 72-88%) if the uncertainty
// model is well calibrated — not too narrow (overconfident) and not too
// wide (useless).

import { forecastDriver, ForecastOptions } from "./driverForecasts";
import * as seed from "./seedData";

export interface BacktestDriverResult {
  driver: string;
  trials: number;
  covered: number;
  coveragePct: number;
}

interface DriverSpec {
  name: string;
  series: number[];
  opts?: ForecastOptions;
}

const DRIVER_SPECS: DriverSpec[] = [
  { name: "productivityPerRep", series: seed.PRODUCTIVITY_PER_REP, opts: { min: 0.3 } },
  { name: "winRate", series: seed.WIN_RATE, opts: { min: 0.05, max: 0.5 } },
  { name: "cycleTimeDays", series: seed.CYCLE_TIME_DAYS, opts: { min: 15 } },
  { name: "churnRateMonthly", series: seed.CHURN_RATE_MONTHLY, opts: { min: 0.003, max: 0.08 } },
  { name: "priceCore", series: seed.PRICE_CORE, opts: { min: 100 } },
  { name: "priceServices", series: seed.PRICE_SERVICES, opts: { min: 1000 } },
  { name: "servicesProjects", series: seed.SERVICES_PROJECTS, opts: { min: 0 } },
  { name: "smProgramSpend", series: seed.SM_PROGRAM_SPEND, opts: { min: 0 } },
  { name: "hostingCostPerCustomer", series: seed.HOSTING_COST_PER_CUSTOMER, opts: { min: 5 } },
  { name: "servicesCostRate", series: seed.SERVICES_COST_RATE, opts: { min: 0.2, max: 0.9 } },
  { name: "otherGaSpend", series: seed.OTHER_GA_SPEND, opts: { min: 0 } },
  { name: "capexMonthly", series: seed.CAPEX_MONTHLY, opts: { min: 0 } },
];

// Needs >=24 months (2 seasonal cycles) before the ratio-to-moving-average
// seasonal index is stable enough to trust.
export const MIN_ORIGIN_HISTORY = 23;

export interface BacktestReport {
  perDriver: BacktestDriverResult[];
  overall: BacktestDriverResult;
}

export function runBacktest(): BacktestReport {
  const perDriver: BacktestDriverResult[] = [];
  let totalTrials = 0;
  let totalCovered = 0;

  for (const spec of DRIVER_SPECS) {
    let trials = 0;
    let covered = 0;
    for (let origin = MIN_ORIGIN_HISTORY; origin < spec.series.length - 1; origin++) {
      const history = spec.series.slice(0, origin + 1);
      const result = forecastDriver(history, 1, 0, spec.opts);
      const actual = spec.series[origin + 1];
      const p10 = result.p10[0];
      const p90 = result.p90[0];
      trials++;
      if (actual >= p10 && actual <= p90) covered++;
    }
    totalTrials += trials;
    totalCovered += covered;
    perDriver.push({ driver: spec.name, trials, covered, coveragePct: trials > 0 ? (covered / trials) * 100 : 0 });
  }

  return {
    perDriver,
    overall: {
      driver: "ALL DRIVERS",
      trials: totalTrials,
      covered: totalCovered,
      coveragePct: totalTrials > 0 ? (totalCovered / totalTrials) * 100 : 0,
    },
  };
}
