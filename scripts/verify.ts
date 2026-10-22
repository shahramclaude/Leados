#!/usr/bin/env -S npx tsx
// `npm run verify` — self-contained correctness checks for the telemetry
// trio that don't require a running server. CI-safe: no network calls, no
// dependency on the app being started. (Live-server checks — composite
// health against real data, metrics exposition over HTTP, backup/restore,
// injected-failure runbooks — are run separately and captured in the
// VERIFICATION LOG, since they need `build_and_start`.)
import assert from "node:assert/strict";
import { redact, REDACTED } from "../src/lib/redact";
import { renderPrometheusExposition, registry, routeFamily } from "../src/lib/metrics";
import { runWithCorrelation, getCorrelationId, newCorrelationId, newTraceId } from "../src/lib/context";

let failures = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`FAIL: ${name}`);
    console.error(err);
  }
}

check("redaction masks a planted secret + PII payload", () => {
  const planted = {
    note: "Heads up",
    password: "hunter2-super-secret",
    apiKey: "sk-live-abcdefghijklmnopqrstuvwxyz0123456789",
    authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dGhpc2lzYXRlc3Q",
    contact: { email: "jane.doe@example.com", phone: "+1 415-555-0134" },
    connectionString: "postgresql://admin:sup3rSecret@db.internal:5432/app",
    ssn: "123-45-6789",
    safeField: "this should survive untouched",
  };

  const redacted = redact(planted) as Record<string, unknown>;
  const serialized = JSON.stringify(redacted);

  assert.equal(redacted.password, REDACTED, "key-based redaction must mask password");
  assert.equal(redacted.apiKey, REDACTED, "key-based redaction must mask apiKey");
  assert.equal(redacted.authorization, REDACTED, "key-based redaction must mask authorization");
  assert.equal(redacted.ssn, REDACTED, "key-based redaction must mask ssn");
  assert.equal((redacted.contact as Record<string, unknown>).email, REDACTED, "value-based redaction must mask email even under a safe key");
  assert.equal((redacted.contact as Record<string, unknown>).phone, REDACTED, "value-based redaction must mask phone even under a safe key");
  assert.ok(!serialized.includes("hunter2"), "plaintext secret must not survive redaction");
  assert.ok(!serialized.includes("sup3rSecret"), "connection string password must not survive redaction");
  assert.ok(!serialized.includes("jane.doe@example.com"), "email must not survive redaction");
  assert.equal(redacted.safeField, "this should survive untouched", "unrelated fields must be preserved");
});

check("correlation context binds and is readable without explicit passing", () => {
  const ctx = { correlationId: newCorrelationId(), traceId: newTraceId() };
  const observed = runWithCorrelation(ctx, () => getCorrelationId());
  assert.equal(observed, ctx.correlationId);
  assert.equal(getCorrelationId(), "cor_unbound", "context must not leak outside runWithCorrelation");
});

check("routeFamily collapses dynamic ids to bound cardinality", () => {
  assert.equal(routeFamily("/api/trace/cor_abc123-def-456"), "/api/trace/:id");
  assert.equal(routeFamily("/api/work-queue/enqueue"), "/api/work-queue/enqueue");
  assert.equal(routeFamily("/api/agent-runs/42"), "/api/agent-runs/:id");
});

check("metrics registry renders valid Prometheus exposition format", () => {
  registry.httpRequestsTotal.inc({ route: "/api/health", method: "GET", status: "200" });
  registry.httpRequestDurationSeconds.observe({ route: "/api/health", method: "GET" }, 0.012);
  registry.workQueueDepth.set({ queue: "default" }, 3);

  const body = renderPrometheusExposition();
  const lines = body.split("\n").filter(Boolean);
  const helpLines = lines.filter((l) => l.startsWith("# HELP"));
  const typeLines = lines.filter((l) => l.startsWith("# TYPE"));
  assert.ok(helpLines.length > 0, "must emit at least one HELP line");
  assert.ok(typeLines.length > 0, "must emit at least one TYPE line");
  assert.ok(body.includes("http_requests_total"), "must include http_requests_total");
  assert.ok(body.includes("work_queue_depth"), "must include work_queue_depth");
  const sampleLine = lines.find((l) => l.startsWith("work_queue_depth{"));
  assert.ok(sampleLine, "work_queue_depth sample line must exist");
  assert.match(sampleLine!, /work_queue_depth\{queue="default"\} 3/);
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll verify checks passed.");
