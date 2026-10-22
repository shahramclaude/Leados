// In-process Prometheus exposition registry.
//
// No external metrics dependency is installed — this is a small, dependency
// free implementation of counters/gauges/histograms that renders the
// standard Prometheus text exposition format (# HELP / # TYPE / samples),
// validated by scripts/check-metrics-exposition.mjs. Metric names carry
// units per Prometheus convention (_seconds, _bytes, _total, _ratio).
type LabelValues = Record<string, string>;

function labelKey(labels: LabelValues): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${labels[k]}"`).join(",");
}

function renderLabels(labels: LabelValues): string {
  const key = labelKey(labels);
  return key ? `{${key}}` : "";
}

class Counter {
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  inc(labels: LabelValues = {}, value = 1) {
    const key = labelKey(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + value);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) return lines.join("\n");
    for (const [key, value] of this.values) {
      const labels = key ? `{${key}}` : "";
      lines.push(`${this.name}${labels} ${value}`);
    }
    return lines.join("\n");
  }
}

class Gauge {
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  set(labels: LabelValues, value: number) {
    this.values.set(labelKey(labels), value);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    for (const [key, value] of this.values) {
      const labels = key ? `{${key}}` : "";
      lines.push(`${this.name}${labels} ${value}`);
    }
    return lines.join("\n");
  }
}

class Histogram {
  private buckets: number[];
  private bucketCounts = new Map<string, Map<number, number>>();
  private sums = new Map<string, number>();
  private counts = new Map<string, number>();
  constructor(public name: string, public help: string, buckets: number[]) {
    this.buckets = [...buckets].sort((a, b) => a - b);
  }
  observe(labels: LabelValues, value: number) {
    const key = labelKey(labels);
    if (!this.bucketCounts.has(key)) {
      this.bucketCounts.set(key, new Map(this.buckets.map((b) => [b, 0])));
    }
    const counts = this.bucketCounts.get(key)!;
    for (const b of this.buckets) {
      if (value <= b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    this.sums.set(key, (this.sums.get(key) ?? 0) + value);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [key, counts] of this.bucketCounts) {
      const baseLabels = key ? key + "," : "";
      let cumulative = 0;
      for (const b of this.buckets) {
        cumulative = counts.get(b) ?? cumulative;
        lines.push(`${this.name}_bucket{${baseLabels}le="${b}"} ${cumulative}`);
      }
      lines.push(`${this.name}_bucket{${baseLabels}le="+Inf"} ${this.counts.get(key) ?? 0}`);
      const labels = key ? `{${key}}` : "";
      lines.push(`${this.name}_sum${labels} ${this.sums.get(key) ?? 0}`);
      lines.push(`${this.name}_count${labels} ${this.counts.get(key) ?? 0}`);
    }
    return lines.join("\n");
  }
}

const globalForMetrics = globalThis as typeof globalThis & {
  __leadosMetrics?: {
    httpRequestsTotal: Counter;
    httpRequestDurationSeconds: Histogram;
    workQueueDepth: Gauge;
    workQueueAgeSeconds: Gauge;
    workQueueDeadLetterTotal: Gauge;
    agentRunOutcomesTotal: Counter;
    forecastDriftRatio: Gauge;
    streamConnectionsActive: Gauge;
    dbPoolInUse: Gauge;
    dbPoolSize: Gauge;
    notificationDeliverySeconds: Histogram;
  };
};

function buildRegistry() {
  return {
    httpRequestsTotal: new Counter(
      "http_requests_total",
      "Total HTTP requests handled, by route family/method/status."
    ),
    httpRequestDurationSeconds: new Histogram(
      "http_request_duration_seconds",
      "HTTP request duration in seconds, by route family/method.",
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    ),
    workQueueDepth: new Gauge(
      "work_queue_depth",
      "Number of pending jobs currently waiting in the queue."
    ),
    workQueueAgeSeconds: new Gauge(
      "work_queue_age_seconds",
      "Age in seconds of the oldest pending job in the queue."
    ),
    workQueueDeadLetterTotal: new Gauge(
      "work_queue_dead_letter_total",
      "Number of jobs currently parked in the dead-letter state."
    ),
    agentRunOutcomesTotal: new Counter(
      "agent_run_outcomes_total",
      "Agent run completions, by kind and outcome."
    ),
    forecastDriftRatio: new Gauge(
      "forecast_drift_ratio",
      "Most recent forecast drift as a ratio (0 = no drift, 1 = 100% drift)."
    ),
    streamConnectionsActive: new Gauge(
      "stream_connections_active",
      "Number of currently open SSE/stream-hub connections."
    ),
    dbPoolInUse: new Gauge(
      "db_pool_connections_in_use",
      "Number of PostgreSQL pool connections currently checked out."
    ),
    dbPoolSize: new Gauge(
      "db_pool_connections_total",
      "Total PostgreSQL pool connections (in use + idle)."
    ),
    notificationDeliverySeconds: new Histogram(
      "notification_delivery_seconds",
      "Time from a notification being queued to being marked delivered.",
      [0.5, 1, 2, 5, 10, 30, 60, 120, 300]
    ),
  };
}

export const registry = globalForMetrics.__leadosMetrics ?? buildRegistry();
if (process.env.NODE_ENV !== "production") {
  globalForMetrics.__leadosMetrics = registry;
}

const DYNAMIC_SEGMENT_PATTERNS = [
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, // uuid
  /^(cor|trace|run|job|drill)_/i, // prefixed ids (correlation ids, etc.)
  /\d/, // any segment containing a digit (numeric ids, dates, etc.)
];

/** Classify a pathname into a bounded-cardinality route family for RED metrics.
 * Strips dynamic segments (uuids, correlation ids, numeric ids) so label
 * cardinality stays bounded — see Phase 5 attack notes on cardinality risk
 * (e.g. never label a metric with a raw personId or correlationId). */
export function routeFamily(pathname: string): string {
  const segments = pathname.split("/");
  const collapsed = segments.map((segment) => {
    if (segment === "") return segment;
    const isDynamic = DYNAMIC_SEGMENT_PATTERNS.some((re) => re.test(segment));
    return isDynamic ? ":id" : segment;
  });
  const result = collapsed.join("/");
  return result || "/";
}

export function recordHttpRequest(opts: {
  routeFamily: string;
  method: string;
  status: number;
  durationSeconds: number;
}) {
  const labels = { route: opts.routeFamily, method: opts.method, status: String(opts.status) };
  registry.httpRequestsTotal.inc(labels);
  registry.httpRequestDurationSeconds.observe(
    { route: opts.routeFamily, method: opts.method },
    opts.durationSeconds
  );
}

export function renderPrometheusExposition(): string {
  const metrics = Object.values(registry) as Array<{ render(): string }>;
  return metrics.map((m) => m.render()).join("\n") + "\n";
}
