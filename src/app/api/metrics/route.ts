// Prometheus-style text exposition. Scraped by `scripts/check-metrics.mjs`
// in CI/verify and intended for a real Prometheus/Grafana stack in
// production (see docs/OBSERVABILITY.md).
import { db, pool } from "@/db";
import { outbox } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { renderPrometheus, setGauge } from "@/lib/obs/metrics";
import { queueDepthByStatus, oldestAgeSecondsByStatus, deadLetterCount } from "@/lib/ops/workQueue";
import { getHeartbeatAgeSeconds } from "@/lib/ops/deadMansSwitch";
import { withApiHandler } from "@/lib/obs/apiHandler";

export const dynamic = "force-dynamic";

async function refreshLiveGauges() {
  const depths = await queueDepthByStatus();
  for (const status of ["queued", "running", "succeeded", "failed", "dead"]) {
    const row = depths.find((d) => d.status === status);
    setGauge("work_queue_depth", row?.count ?? 0, { status });
  }
  const queuedAge = await oldestAgeSecondsByStatus("queued");
  const runningAge = await oldestAgeSecondsByStatus("running");
  setGauge("work_queue_oldest_age_seconds", queuedAge ?? 0, { status: "queued" });
  setGauge("work_queue_oldest_age_seconds", runningAge ?? 0, { status: "running" });

  setGauge("dead_letter_depth", await deadLetterCount());

  const pendingOutbox = await db.select().from(outbox).where(eq(outbox.status, "pending"));
  setGauge("outbox_pending_depth", pendingOutbox.length);
  const oldestOutbox = pendingOutbox.length
    ? Math.max(...pendingOutbox.map((r) => (Date.now() - r.createdAt.getTime()) / 1000))
    : 0;
  setGauge("outbox_oldest_age_seconds", oldestOutbox);

  setGauge("db_pool_total_connections", pool.totalCount);
  setGauge("db_pool_idle_connections", pool.idleCount);
  setGauge("db_pool_waiting_requests", pool.waitingCount);

  const heartbeatAge = await getHeartbeatAgeSeconds();
  setGauge("dead_mans_switch_age_seconds", heartbeatAge ?? -1);

  // Keep the db round-trip count on this route itself honest in metrics too.
  await db.execute(sql`select 1`);
}

export const GET = withApiHandler({ routeFamily: "metrics", allowDuringMaintenance: true }, async () => {
  await refreshLiveGauges();
  const body = renderPrometheus();
  return new Response(body, { headers: { "content-type": "text/plain; version=0.0.4; charset=utf-8" } });
});
