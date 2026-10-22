// Part 28 — queueing analytics per process step.
//
// For every activity we estimate standard queueing quantities from the
// event log and cross-check them with Little's Law (L = λ * W). The two
// independent estimates of W (time-averaged WIP / arrival rate, vs the
// directly-measured average sojourn time) should agree closely in a
// steady-state system; `littlesLawDeltaPct` quantifies how closely they do,
// which doubles as a sanity check on the whole pipeline (see
// scripts/verify.ts gate #3).
import type { CaseInstance, QueueingStats } from "./types";
import { computeEwmaTrend } from "./ewma";
import { mean } from "./stats";

export interface QueueingOptions {
  /** bucket size (ms) for the EWMA growth-trend series, default 1 day */
  trendBucketMs?: number;
}

const DEFAULTS: Required<QueueingOptions> = {
  trendBucketMs: 24 * 60 * 60 * 1000,
};

interface Interval {
  start: number;
  end: number;
}

export function computeQueueingStats(cases: CaseInstance[], options: QueueingOptions = {}): QueueingStats[] {
  const opts = { ...DEFAULTS, ...options };
  const processName = cases[0]?.processName ?? "unknown";

  let windowStart = Infinity;
  let windowEnd = -Infinity;
  for (const c of cases) {
    windowStart = Math.min(windowStart, c.startedAt.getTime());
    windowEnd = Math.max(windowEnd, c.endedAt.getTime());
  }
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd) || windowEnd <= windowStart) {
    return [];
  }
  const periodMs = windowEnd - windowStart;

  const byActivity = new Map<
    string,
    {
      serviceMs: number[];
      sojournMs: number[];
      intervals: Interval[];
      resources: Set<string>;
      occurrencesByBucket: Map<number, number>;
      wipByBucket: Map<number, Interval[]>;
    }
  >();

  for (const c of cases) {
    for (const event of c.events) {
      const start = event.occurredAt.getTime() - event.queueMs; // queue started before active work
      const end = event.occurredAt.getTime() + event.durationMs;
      const acc = byActivity.get(event.activity) ?? {
        serviceMs: [],
        sojournMs: [],
        intervals: [],
        resources: new Set<string>(),
        occurrencesByBucket: new Map<number, number>(),
        wipByBucket: new Map<number, Interval[]>(),
      };
      acc.serviceMs.push(event.durationMs);
      acc.sojournMs.push(event.queueMs + event.durationMs);
      acc.intervals.push({ start, end });
      if (event.resourceId) acc.resources.add(event.resourceId);

      const bucket = Math.floor((start - windowStart) / opts.trendBucketMs);
      acc.occurrencesByBucket.set(bucket, (acc.occurrencesByBucket.get(bucket) ?? 0) + 1);

      byActivity.set(event.activity, acc);
    }
  }

  const stats: QueueingStats[] = [];
  for (const [activity, acc] of byActivity) {
    const arrivals = acc.intervals.length;
    const periodHours = periodMs / 3_600_000;
    const lambdaPerHour = periodHours > 0 ? arrivals / periodHours : 0;

    const avgServiceMs = mean(acc.serviceMs);
    const muPerHour = avgServiceMs > 0 ? 3_600_000 / avgServiceMs : 0;

    const servers = Math.max(1, acc.resources.size);
    const utilization = muPerHour > 0 ? lambdaPerHour / (servers * muPerHour) : 0;

    const wipTimeAverage = timeAveragedConcurrency(acc.intervals, windowStart, windowEnd);

    const wMeasuredMs = mean(acc.sojournMs);
    // Little's Law: L = λ * W  =>  W = L / λ. Convert λ (per hour) to per-ms.
    const lambdaPerMs = lambdaPerHour / 3_600_000;
    const wLittleMs = lambdaPerMs > 0 ? wipTimeAverage / lambdaPerMs : 0;
    const littlesLawDeltaPct = wMeasuredMs > 0 ? (Math.abs(wMeasuredMs - wLittleMs) / wMeasuredMs) * 100 : 0;

    const bucketSeries = [...acc.occurrencesByBucket.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([bucket, count]) => ({
        periodStart: new Date(windowStart + bucket * opts.trendBucketMs),
        value: count,
      }));
    const trend = computeEwmaTrend(bucketSeries);

    stats.push({
      processName,
      activity,
      periodMs,
      arrivals,
      lambdaPerHour,
      avgServiceMs,
      muPerHour,
      servers,
      utilization,
      wipTimeAverage,
      wMeasuredMs,
      wLittleMs,
      littlesLawDeltaPct,
      trend,
    });
  }

  return stats.sort((a, b) => b.utilization - a.utilization);
}

/** Sweep-line time-average of concurrently open intervals, clipped to [windowStart, windowEnd]. */
function timeAveragedConcurrency(intervals: Interval[], windowStart: number, windowEnd: number): number {
  const windowLength = windowEnd - windowStart;
  if (windowLength <= 0 || intervals.length === 0) return 0;

  const events: { t: number; delta: number }[] = [];
  for (const interval of intervals) {
    const start = Math.max(interval.start, windowStart);
    const end = Math.min(Math.max(interval.end, start), windowEnd);
    events.push({ t: start, delta: 1 });
    events.push({ t: end, delta: -1 });
  }
  events.sort((a, b) => a.t - b.t);

  let areaUnderCurve = 0;
  let currentCount = 0;
  let lastT = windowStart;
  for (const e of events) {
    areaUnderCurve += currentCount * (e.t - lastT);
    currentCount += e.delta;
    lastT = e.t;
  }
  areaUnderCurve += currentCount * (windowEnd - lastT);

  return areaUnderCurve / windowLength;
}
