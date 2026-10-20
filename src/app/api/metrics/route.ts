import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/db";
import { withObservability } from "@/lib/observability/apiHandler";
import {
  snapshotRouteMetrics,
  totalRequestCounts,
  uptimeSeconds,
  type MetricsSnapshot,
} from "@/lib/observability/metrics";

async function buildSnapshot(): Promise<MetricsSnapshot> {
  const [queueRow, outcomeRows] = await Promise.all([
    db.execute<{ depth: string; oldest_queued_at: string | null }>(sql`
      select count(*)::text as depth, min(queued_at)::text as oldest_queued_at
      from automation_runs
      where status in ('queued', 'running')
    `),
    db.execute<{ status: string; count: string }>(sql`
      select status, count(*)::text as count from automation_runs group by status
    `),
  ]);

  const queue = queueRow.rows[0] as { depth: string; oldest_queued_at: string | null } | undefined;
  const depth = queue ? Number(queue.depth) : 0;
  const oldestQueuedAgeSeconds = queue?.oldest_queued_at
    ? Math.max(0, Math.round((Date.now() - new Date(queue.oldest_queued_at).getTime()) / 1000))
    : null;

  const automationOutcomes: Record<string, number> = {};
  for (const row of outcomeRows.rows as { status: string; count: string }[]) {
    automationOutcomes[row.status] = Number(row.count);
  }

  return {
    uptimeSeconds: uptimeSeconds(),
    totals: totalRequestCounts(),
    routes: snapshotRouteMetrics(),
    queue: { depth, oldestQueuedAgeSeconds },
    automationOutcomes,
    forecastDrift: {
      status: "not_implemented",
      reason:
        "No forecasting engine exists in this working tree yet (see FEATURES.md roadmap). This field is kept in the schema so a future forecasting engine can populate it without another breaking change to this endpoint.",
    },
  };
}

function toPrometheusText(snapshot: MetricsSnapshot): string {
  const lines: string[] = [];
  lines.push("# HELP leados_uptime_seconds Process uptime in seconds.");
  lines.push("# TYPE leados_uptime_seconds gauge");
  lines.push(`leados_uptime_seconds ${snapshot.uptimeSeconds}`);

  lines.push("# HELP leados_http_requests_total Total HTTP requests handled, by route.");
  lines.push("# TYPE leados_http_requests_total counter");
  for (const route of snapshot.routes) {
    lines.push(`leados_http_requests_total{route="${route.route}"} ${route.requests}`);
  }

  lines.push("# HELP leados_http_errors_total Total HTTP 5xx responses, by route.");
  lines.push("# TYPE leados_http_errors_total counter");
  for (const route of snapshot.routes) {
    lines.push(`leados_http_errors_total{route="${route.route}"} ${route.errors}`);
  }

  lines.push("# HELP leados_http_request_duration_ms_p95 p95 request latency in ms, by route.");
  lines.push("# TYPE leados_http_request_duration_ms_p95 gauge");
  for (const route of snapshot.routes) {
    lines.push(`leados_http_request_duration_ms_p95{route="${route.route}"} ${route.p95Ms}`);
  }

  lines.push("# HELP leados_automation_queue_depth Automation runs currently queued or running.");
  lines.push("# TYPE leados_automation_queue_depth gauge");
  lines.push(`leados_automation_queue_depth ${snapshot.queue.depth}`);

  lines.push("# HELP leados_automation_runs_total Automation runs, by outcome.");
  lines.push("# TYPE leados_automation_runs_total counter");
  for (const [status, count] of Object.entries(snapshot.automationOutcomes)) {
    lines.push(`leados_automation_runs_total{status="${status}"} ${count}`);
  }

  return lines.join("\n") + "\n";
}

export const dynamic = "force-dynamic";

export const GET = withObservability("GET /api/metrics", async (req: NextRequest) => {
  const snapshot = await buildSnapshot();
  const format = req.nextUrl.searchParams.get("format");

  if (format === "prometheus") {
    return new NextResponse(toPrometheusText(snapshot), {
      status: 200,
      headers: { "content-type": "text/plain; version=0.0.4" },
    });
  }

  return NextResponse.json(snapshot);
});
