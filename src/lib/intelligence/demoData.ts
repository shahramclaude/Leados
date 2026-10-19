// src/lib/intelligence/demoData.ts
//
// ⚠️ SYNTHETIC — sample telemetry used to demonstrate the intelligence
// pipeline end-to-end from both the API routes and the /intelligence
// dashboard page, without depending on a live metrics/event store. Kept
// separate from goldenDataset.ts because this data is illustrative demo
// content, not the labeled regression/calibration dataset.
import type { AccountTelemetry } from "./intelligence";
import type { MonteCarloInput } from "./monteCarlo";

export function sampleAccounts(): AccountTelemetry[] {
  const now = Date.now();
  const days = (n: number, value: number) => ({
    timestamp: new Date(now - n * 86_400_000).toISOString(),
    value,
  });
  return [
    {
      accountId: "acct-northwind",
      domain: "retention",
      title: "Northwind Traders — renewal risk",
      impact: "high",
      metrics: {
        usageTrend30d: Array.from({ length: 14 }, (_, i) => days(13 - i, 1000 - i * 40)),
        openCriticalTickets: Array.from({ length: 14 }, (_, i) => days(13 - i, i > 10 ? 2 : 0)),
        championTurnover: Array.from({ length: 14 }, (_, i) => days(13 - i, i > 11 ? 1 : 0)),
      },
    },
    {
      accountId: "acct-globex",
      domain: "pipeline",
      title: "Globex Corp — stalled expansion deal",
      impact: "medium",
      metrics: {
        daysInStage: Array.from({ length: 14 }, (_, i) => days(13 - i, 20 + i * 1.5)),
        engagementTrend: Array.from({ length: 14 }, (_, i) => days(13 - i, 5 - i * 0.4)),
        emailResponseRateChange: Array.from({ length: 14 }, (_, i) => days(13 - i, -0.05 * i)),
      },
    },
    {
      accountId: "acct-initech",
      domain: "forecast",
      title: "Initech — Q3 forecast coverage risk",
      impact: "critical",
      metrics: {
        pipelineCoverageRatio: Array.from({ length: 14 }, (_, i) => days(13 - i, 3.6 - i * 0.08)),
        lateStageConcentration: Array.from({ length: 14 }, (_, i) => days(13 - i, 0.4 + i * 0.015)),
      },
    },
  ];
}

export const DEFAULT_FORECAST_INPUT: MonteCarloInput = {
  subject: "q3-revenue-forecast",
  drivers: [
    { name: "existingPipelineConversion", mean: 420_000, stdDev: 60_000 },
    { name: "newLogoRevenue", mean: 150_000, stdDev: 45_000 },
    { name: "expansionRevenue", mean: 90_000, stdDev: 20_000 },
  ],
  trials: 4000,
  seed: 42,
};

export const INTERRUPT_OPT_IN: Record<string, boolean> = { retention: true, forecast: true, pipeline: false };
