// Part 28 — operational metrics layer: cycle time, throughput, first-pass
// yield, rework rate, SLA attainment — plus per-period series ready for
// control-chart drift detection.
import type { CaseInstance, ConformanceReport, ControlChart, OperationalMetrics } from "./types";
import { computeControlChart } from "./controlChart";
import { mean, percentile } from "./stats";

export function computeOperationalMetrics(
  cases: CaseInstance[],
  reworkConformance?: ConformanceReport,
): OperationalMetrics {
  const processName = cases[0]?.processName ?? "unknown";
  const closedCases = cases.filter((c) => !c.open);
  const cycleTimes = closedCases.map((c) => c.cycleTimeMs);
  const sortedCycleTimes = [...cycleTimes].sort((a, b) => a - b);

  let windowStart = Infinity;
  let windowEnd = -Infinity;
  for (const c of closedCases) {
    windowStart = Math.min(windowStart, c.startedAt.getTime());
    windowEnd = Math.max(windowEnd, c.endedAt.getTime());
  }
  const periodDays = Number.isFinite(windowStart) && windowEnd > windowStart ? (windowEnd - windowStart) / 86_400_000 : 0;
  const throughputPerDay = periodDays > 0 ? closedCases.length / periodDays : closedCases.length;

  const reworkCaseIds = new Set(
    (reworkConformance?.results ?? []).filter((r) => r.deviations.some((d) => d.type === "rework")).map((r) => r.caseId),
  );
  const reworkRate = closedCases.length
    ? closedCases.filter((c) => reworkCaseIds.has(c.caseId)).length / closedCases.length
    : 0;
  const firstPassYield = reworkConformance ? 1 - reworkRate : null;

  const slaCases = closedCases.filter((c) => typeof c.events[c.events.length - 1]?.attributes.slaDeadline === "string");
  const slaInstrumented = slaCases.length > 0;
  const slaAttainment = slaInstrumented
    ? slaCases.filter((c) => {
        const deadline = new Date(c.events[c.events.length - 1].attributes.slaDeadline as string);
        return c.endedAt.getTime() <= deadline.getTime();
      }).length / slaCases.length
    : null;

  return {
    processName,
    caseCount: closedCases.length,
    cycleTimeMsAvg: mean(cycleTimes),
    cycleTimeMsP50: percentile(sortedCycleTimes, 50),
    cycleTimeMsP85: percentile(sortedCycleTimes, 85),
    throughputPerDay,
    firstPassYield,
    reworkRate,
    slaAttainment,
    slaInstrumented,
  };
}

/** Buckets closed cases into daily periods and runs an individuals control chart over cycle time. */
export function cycleTimeControlChart(cases: CaseInstance[], bucketMs = 86_400_000): ControlChart {
  const closedCases = cases.filter((c) => !c.open);
  if (closedCases.length === 0) {
    return computeControlChart("cycle_time_ms", []);
  }
  const windowStart = Math.min(...closedCases.map((c) => c.startedAt.getTime()));
  const byBucket = new Map<number, number[]>();
  for (const c of closedCases) {
    const bucket = Math.floor((c.startedAt.getTime() - windowStart) / bucketMs);
    const arr = byBucket.get(bucket) ?? [];
    arr.push(c.cycleTimeMs);
    byBucket.set(bucket, arr);
  }
  const series = [...byBucket.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, values]) => ({
      periodStart: new Date(windowStart + bucket * bucketMs),
      value: mean(values),
    }));
  return computeControlChart("cycle_time_ms", series);
}
