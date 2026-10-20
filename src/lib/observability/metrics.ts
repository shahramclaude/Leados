// In-process metrics registry.
//
// Honest limitation: these counters live in the Node.js process memory, so
// in a horizontally-scaled deployment each instance reports only its own
// numbers. For multi-instance production deployments, scrape `/api/metrics`
// per instance (the docker-compose/production setup here runs a single API
// container) or front it with an aggregator — see docs/SLO.md. This is
// intentionally dependency-free (no Prometheus client library, no vendor
// SDK) so it has zero lock-in; the `/api/metrics` route can render the same
// numbers as JSON or Prometheus text exposition format.

type RouteKey = string;

type RouteStats = {
  count: number;
  errorCount: number;
  durationsMs: number[]; // bounded ring buffer, see MAX_SAMPLES
};

const MAX_SAMPLES = 500;

const routeStats = new Map<RouteKey, RouteStats>();
let processStartedAt = Date.now();

function getOrCreate(route: RouteKey): RouteStats {
  let stats = routeStats.get(route);
  if (!stats) {
    stats = { count: 0, errorCount: 0, durationsMs: [] };
    routeStats.set(route, stats);
  }
  return stats;
}

export function recordRequest(route: RouteKey, durationMs: number, isError: boolean) {
  const stats = getOrCreate(route);
  stats.count += 1;
  if (isError) stats.errorCount += 1;
  stats.durationsMs.push(durationMs);
  if (stats.durationsMs.length > MAX_SAMPLES) {
    stats.durationsMs.shift();
  }
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export type RouteMetricSnapshot = {
  route: string;
  requests: number;
  errors: number;
  errorRatePct: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
};

export type MetricsSnapshot = {
  uptimeSeconds: number;
  totals: {
    requests: number;
    errors: number;
    errorRatePct: number;
  };
  routes: RouteMetricSnapshot[];
  queue: {
    depth: number;
    oldestQueuedAgeSeconds: number | null;
  };
  automationOutcomes: Record<string, number>;
  forecastDrift: {
    status: "not_implemented";
    reason: string;
  };
};

export function snapshotRouteMetrics(): RouteMetricSnapshot[] {
  const out: RouteMetricSnapshot[] = [];
  for (const [route, stats] of routeStats.entries()) {
    const sorted = [...stats.durationsMs].sort((a, b) => a - b);
    out.push({
      route,
      requests: stats.count,
      errors: stats.errorCount,
      errorRatePct: stats.count === 0 ? 0 : Number(((stats.errorCount / stats.count) * 100).toFixed(2)),
      p50Ms: Math.round(percentile(sorted, 50)),
      p95Ms: Math.round(percentile(sorted, 95)),
      p99Ms: Math.round(percentile(sorted, 99)),
    });
  }
  return out.sort((a, b) => b.requests - a.requests);
}

export function totalRequestCounts() {
  let requests = 0;
  let errors = 0;
  for (const stats of routeStats.values()) {
    requests += stats.count;
    errors += stats.errorCount;
  }
  return { requests, errors, errorRatePct: requests === 0 ? 0 : Number(((errors / requests) * 100).toFixed(2)) };
}

export function uptimeSeconds(): number {
  return Math.round((Date.now() - processStartedAt) / 1000);
}

/** Test/dev helper: reset all in-memory counters. Not used in production code paths. */
export function __resetMetricsForTests() {
  routeStats.clear();
  processStartedAt = Date.now();
}
