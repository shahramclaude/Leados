// LEADOS — Part 38 / Part 33 compatibility shim: AI control room trends.
//
// Part 33's AI control room (not present in this sandbox) is expected to
// track per-request cost and an automatic quality/SLO score over time. This
// module seeds a plausible daily history for both and supports injecting a
// cost spike or quality regression for the drift-injection harness.

import { ensureBaseline, recordObservation, seededNoise } from "@/lib/metrics";

export const COST_PER_1K_KEY = "cost.usd_per_1k_requests";
export const AI_AUTOSCORE_KEY = "aiquality.auto_score";
export const CONTROLROOM_P95_LATENCY_KEY = "controlroom.p95_latency_ms";

export async function seedCostQualityHistory(days = 30, injectSpikeFromDay: number | null = null) {
  await ensureBaseline(COST_PER_1K_KEY, "cost", 4.2);
  await ensureBaseline(AI_AUTOSCORE_KEY, "intelligence", 0.9);
  await ensureBaseline(CONTROLROOM_P95_LATENCY_KEY, "cost", 1200);

  const now = Date.now();
  for (let day = 0; day < days; day++) {
    const spikeActive = injectSpikeFromDay !== null && day >= injectSpikeFromDay;
    const jitter = (seededNoise(day * 31) - 0.5) * 0.3;
    const cost = 4.2 + jitter + (spikeActive ? 2.1 : 0);
    const score = Math.max(0.5, 0.9 + (seededNoise(day * 41) - 0.5) * 0.04 - (spikeActive ? 0.12 : 0));
    const latency = 1200 + (seededNoise(day * 51) - 0.5) * 100 + (spikeActive ? 450 : 0);
    const observedAt = new Date(now - (days - day) * 86400000);
    await recordObservation({
      metricKey: COST_PER_1K_KEY,
      domain: "cost",
      value: cost,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
    await recordObservation({
      metricKey: AI_AUTOSCORE_KEY,
      domain: "intelligence",
      value: score,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
    await recordObservation({
      metricKey: CONTROLROOM_P95_LATENCY_KEY,
      domain: "cost",
      value: latency,
      windowLabel: `daily-${observedAt.toISOString().slice(0, 10)}`,
      observedAt,
    });
  }
}
