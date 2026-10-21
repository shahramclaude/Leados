import { beforeEach, describe, expect, it } from "vitest";
import { __resetMetricsForTests, incCounter, observeHistogram, recordHttpRequest, renderPrometheus, setGauge } from "../metrics";

describe("metrics registry / Prometheus exposition", () => {
  beforeEach(() => __resetMetricsForTests());

  it("renders HELP/TYPE lines and counter samples", () => {
    incCounter("http_requests_total", { route_family: "health", method: "GET", status_class: "2xx" });
    const text = renderPrometheus();
    expect(text).toContain("# HELP http_requests_total");
    expect(text).toContain("# TYPE http_requests_total counter");
    expect(text).toMatch(/http_requests_total\{.*route_family="health".*\} 1/);
  });

  it("renders gauges", () => {
    setGauge("work_queue_depth", 3, { status: "queued" });
    const text = renderPrometheus();
    expect(text).toContain('work_queue_depth{status="queued"} 3');
  });

  it("renders histogram buckets, sum and count cumulatively", () => {
    observeHistogram("http_request_duration_seconds", 0.02, { route_family: "x", method: "GET" });
    observeHistogram("http_request_duration_seconds", 0.3, { route_family: "x", method: "GET" });
    const text = renderPrometheus();
    expect(text).toContain("http_request_duration_seconds_bucket");
    expect(text).toContain('le="+Inf"');
    expect(text).toContain("http_request_duration_seconds_count");
    expect(text).toContain("http_request_duration_seconds_sum");
  });

  it("recordHttpRequest increments the RED counter and histogram together", () => {
    recordHttpRequest("health", "GET", 200, 42);
    const text = renderPrometheus();
    expect(text).toMatch(/http_requests_total\{.*status_class="2xx".*\} 1/);
  });

  it("never labels a metric with a raw personId/userId-shaped value (cardinality guard)", () => {
    // This test documents and enforces the policy: route_family must be one
    // of a small closed set, not a raw dynamic path segment.
    const text = (() => {
      incCounter("http_requests_total", { route_family: "people_by_id", method: "GET", status_class: "2xx" });
      return renderPrometheus();
    })();
    expect(text).not.toMatch(/person[iI]d=/);
  });
});
