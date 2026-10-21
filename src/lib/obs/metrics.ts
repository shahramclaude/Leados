// Single metrics registry, Prometheus text exposition format
// (https://prometheus.io/docs/instrumenting/exposition_formats/), version
// 0.0.4. Every metric declared here with its unit in a comment — this file
// is the one place new metrics get added, per the mission's "declared in
// one registry with units" requirement.
//
// Cardinality policy (see adversarial self-review in AI-SESSION-LOG.md):
// labels are restricted to small, closed, operator-controlled enums
// (route family, HTTP method, status class, job type, outcome, SLO name).
// Nothing here is ever labeled with personId/orgId/userId/correlationId —
// those belong in logs/traces, not metric label values, precisely because
// they are unbounded and would blow up cardinality.

interface Counter {
  type: "counter";
  help: string;
  unit: string;
  values: Map<string, number>;
}
interface Gauge {
  type: "gauge";
  help: string;
  unit: string;
  values: Map<string, number>;
}
interface Histogram {
  type: "histogram";
  help: string;
  unit: string;
  buckets: number[];
  bucketCounts: Map<string, number[]>;
  sums: Map<string, number>;
  counts: Map<string, number>;
}

type Metric = Counter | Gauge | Histogram;

const registry = new Map<string, Metric>();

function keyFor(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "{}";
  const sorted = Object.keys(labels).sort();
  return JSON.stringify(sorted.map((k) => [k, labels[k]]));
}

function labelsFromKey(key: string): Record<string, string> {
  if (key === "{}") return {};
  const pairs = JSON.parse(key) as [string, string][];
  return Object.fromEntries(pairs);
}

function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return "";
  return "{" + entries.map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`).join(",") + "}";
}

export function defineCounter(name: string, help: string, unit: string): void {
  if (!registry.has(name)) registry.set(name, { type: "counter", help, unit, values: new Map() });
}
export function defineGauge(name: string, help: string, unit: string): void {
  if (!registry.has(name)) registry.set(name, { type: "gauge", help, unit, values: new Map() });
}
export function defineHistogram(name: string, help: string, unit: string, buckets: number[]): void {
  if (!registry.has(name))
    registry.set(name, { type: "histogram", help, unit, buckets, bucketCounts: new Map(), sums: new Map(), counts: new Map() });
}

export function incCounter(name: string, labels: Record<string, string> = {}, by = 1): void {
  const m = registry.get(name) as Counter | undefined;
  if (!m || m.type !== "counter") throw new Error(`metric not declared as counter: ${name}`);
  const k = keyFor(labels);
  m.values.set(k, (m.values.get(k) ?? 0) + by);
}

export function setGauge(name: string, value: number, labels: Record<string, string> = {}): void {
  const m = registry.get(name) as Gauge | undefined;
  if (!m || m.type !== "gauge") throw new Error(`metric not declared as gauge: ${name}`);
  m.values.set(keyFor(labels), value);
}

export function observeHistogram(name: string, value: number, labels: Record<string, string> = {}): void {
  const m = registry.get(name) as Histogram | undefined;
  if (!m || m.type !== "histogram") throw new Error(`metric not declared as histogram: ${name}`);
  const k = keyFor(labels);
  if (!m.bucketCounts.has(k)) m.bucketCounts.set(k, new Array(m.buckets.length).fill(0));
  const counts = m.bucketCounts.get(k)!;
  m.buckets.forEach((b, i) => {
    if (value <= b) counts[i] += 1;
  });
  m.sums.set(k, (m.sums.get(k) ?? 0) + value);
  m.counts.set(k, (m.counts.get(k) ?? 0) + 1);
}

// ---------------------------------------------------------------------------
// Declarations — RED per route family
// ---------------------------------------------------------------------------
defineCounter("http_requests_total", "Total HTTP requests handled, by route family/method/status class.", "requests");
defineHistogram(
  "http_request_duration_seconds",
  "HTTP request duration in seconds, by route family/method.",
  "seconds",
  [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
);

// Work queue / outbox / dead-letter depth & age
defineGauge("work_queue_depth", "Number of work_queue rows by status.", "jobs");
defineGauge("work_queue_oldest_age_seconds", "Age of the oldest queued/running job, by status.", "seconds");
defineGauge("dead_letter_depth", "Number of jobs in the dead-letter state (work_queue.status='dead').", "jobs");
defineGauge("outbox_pending_depth", "Number of pending outbox rows awaiting delivery.", "messages");
defineGauge("outbox_oldest_age_seconds", "Age of the oldest pending outbox row.", "seconds");

// Automation run outcomes
defineCounter("automation_runs_total", "Automation run outcomes, by job_type/status.", "runs");
defineHistogram("automation_run_duration_seconds", "Automation run duration in seconds, by job_type.", "seconds", [
  0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60,
]);

// Forecast drift
defineGauge("forecast_drift_ratio", "abs(actual - forecast) / max(1, forecast) for the event-volume forecast.", "ratio");

// Stream connections
defineGauge("stream_connections_active", "Active server-sent-event stream connections.", "connections");

// DB pool saturation
defineGauge("db_pool_total_connections", "Total connections in the pg Pool.", "connections");
defineGauge("db_pool_idle_connections", "Idle connections in the pg Pool.", "connections");
defineGauge("db_pool_waiting_requests", "Requests waiting for a pool connection.", "requests");

// SLO error budget (surfaced as metrics so they can be graphed/alerted on)
defineGauge("slo_error_budget_remaining_ratio", "Remaining error budget (0-1) for the named SLO over its window.", "ratio");

// Dead-man's switch heartbeat age (the alert-rule self-test)
defineGauge("dead_mans_switch_age_seconds", "Seconds since the scheduler's dead-man's-switch last pinged.", "seconds");

export function recordHttpRequest(routeFamily: string, method: string, statusCode: number, durationMs: number): void {
  const statusClass = `${Math.floor(statusCode / 100)}xx`;
  incCounter("http_requests_total", { route_family: routeFamily, method, status_class: statusClass });
  observeHistogram("http_request_duration_seconds", durationMs / 1000, { route_family: routeFamily, method });
}

export function recordAutomationRun(jobType: string, status: "succeeded" | "failed", durationMs: number): void {
  incCounter("automation_runs_total", { job_type: jobType, status });
  observeHistogram("automation_run_duration_seconds", durationMs / 1000, { job_type: jobType });
}

/** Render the full registry as Prometheus text exposition format. */
export function renderPrometheus(): string {
  const lines: string[] = [];
  for (const [name, m] of registry) {
    lines.push(`# HELP ${name} ${m.help} (unit: ${m.unit})`);
    lines.push(`# TYPE ${name} ${m.type}`);
    if (m.type === "counter" || m.type === "gauge") {
      if (m.values.size === 0) continue;
      for (const [k, v] of m.values) {
        lines.push(`${name}${formatLabels(labelsFromKey(k))} ${v}`);
      }
    } else {
      for (const [k, counts] of m.bucketCounts) {
        const labels = labelsFromKey(k);
        let cumulative = 0;
        m.buckets.forEach((b, i) => {
          cumulative += counts[i];
          lines.push(`${name}_bucket${formatLabels({ ...labels, le: String(b) })} ${cumulative}`);
        });
        const total = m.counts.get(k) ?? 0;
        lines.push(`${name}_bucket${formatLabels({ ...labels, le: "+Inf" })} ${total}`);
        lines.push(`${name}_sum${formatLabels(labels)} ${m.sums.get(k) ?? 0}`);
        lines.push(`${name}_count${formatLabels(labels)} ${total}`);
      }
    }
  }
  return lines.join("\n") + "\n";
}

/** Reset — test-only, so vitest runs don't bleed state into each other. */
export function __resetMetricsForTests(): void {
  for (const m of registry.values()) {
    if (m.type === "histogram") {
      m.bucketCounts.clear();
      m.sums.clear();
      m.counts.clear();
    } else {
      m.values.clear();
    }
  }
}
