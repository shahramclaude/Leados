#!/usr/bin/env node
// Scrapes /api/metrics and parses the Prometheus exposition format, failing
// if any required metric name (across the RED/queue/automation/forecast/
// stream/db-pool families this part's mission requires) is missing.
const target = process.argv[2] || process.env.METRICS_URL || "http://127.0.0.1:3000/api/metrics";

const REQUIRED_METRICS = [
  "http_requests_total",
  "http_request_duration_seconds",
  "work_queue_depth",
  "work_queue_oldest_age_seconds",
  "dead_letter_depth",
  "outbox_pending_depth",
  "outbox_oldest_age_seconds",
  "automation_runs_total",
  "automation_run_duration_seconds",
  "forecast_drift_ratio",
  "stream_connections_active",
  "db_pool_total_connections",
  "db_pool_idle_connections",
  "db_pool_waiting_requests",
  "slo_error_budget_remaining_ratio",
  "dead_mans_switch_age_seconds",
];

function parsePrometheusText(text) {
  const names = new Set();
  const samples = [];
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([0-9eE+\-.]+)\s*$/);
    if (match) {
      names.add(match[1]);
      samples.push({ name: match[1], labels: match[2] || "", value: Number(match[3]) });
    }
  }
  return { names, samples };
}

const res = await fetch(target);
if (!res.ok) {
  console.error(`FAIL: GET ${target} returned ${res.status}`);
  process.exit(1);
}
const contentType = res.headers.get("content-type") || "";
if (!contentType.includes("text/plain")) {
  console.error(`FAIL: expected text/plain exposition format, got content-type=${contentType}`);
  process.exit(1);
}
const text = await res.text();
const { names, samples } = parsePrometheusText(text);

const missing = REQUIRED_METRICS.filter((m) => !names.has(m));
console.log(`Parsed ${samples.length} samples across ${names.size} metric names from ${target}`);
if (missing.length) {
  console.error(`FAIL: missing required metrics: ${missing.join(", ")}`);
  process.exit(1);
}
console.log(`OK: all ${REQUIRED_METRICS.length} required metrics present.`);
for (const name of REQUIRED_METRICS) {
  const sample = samples.find((s) => s.name === name || s.name === `${name}_count`);
  console.log(`  ${name} -> example sample: ${sample ? `${sample.name}${sample.labels} ${sample.value}` : "(no sample row, only HELP/TYPE)"}`);
}
