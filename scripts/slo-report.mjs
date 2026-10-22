#!/usr/bin/env node
// Monthly SLO report (docs/SLO.md). Computes real numbers from the tables
// this part actually populates, over a trailing window (default 30 days).
//
// Honesty note: this sandbox has no durable metrics time-series backend
// (Prometheus + long-term storage), so this script measures the ground-truth
// tables directly (agent_runs, notifications, work_queue_jobs) rather than
// pretending to replay 30 days of scraped /api/metrics history. In a real
// deployment, wire this to query Prometheus/Thanos instead — the thresholds
// and math below would not change.
import { withClient } from "./lib/db-client.mjs";

const WINDOW_DAYS = Number(process.env.SLO_WINDOW_DAYS || 30);

function pct(n, d) {
  if (d === 0) return null;
  return (n / d) * 100;
}

async function main() {
  await withClient(async (client) => {
    const since = `now() - interval '${WINDOW_DAYS} days'`;

    const runOutcomes = await client.query(`
      select status, count(*)::int as count
      from agent_runs where created_at > ${since}
      group by status
    `);
    const totalRuns = runOutcomes.rows.reduce((s, r) => s + r.count, 0);
    const succeeded = runOutcomes.rows.find((r) => r.status === "succeeded")?.count ?? 0;
    const automationSuccessPct = pct(succeeded, totalRuns);

    const notificationLatency = await client.query(`
      select
        count(*) filter (where delivered_at is not null)::int as delivered,
        count(*)::int as total,
        percentile_cont(0.95) within group (
          order by extract(epoch from (delivered_at - queued_at))
        ) filter (where delivered_at is not null) as p95_seconds
      from notifications where queued_at > ${since}
    `);
    const n = notificationLatency.rows[0];

    const projectionLag = await client.query(`
      select name, extract(epoch from (now() - last_refreshed_at)) as lag_seconds
      from projection_state
    `);

    const deadLetters = await client.query(`
      select count(*)::int as count from work_queue_jobs
      where status = 'dead_letter' and created_at > ${since}
    `);

    const report = {
      windowDays: WINDOW_DAYS,
      generatedAt: new Date().toISOString(),
      automationSuccess: {
        target: "\u2265 95%",
        totalRuns,
        succeeded,
        actualPct: automationSuccessPct === null ? "no data" : automationSuccessPct.toFixed(2) + "%",
        met: automationSuccessPct === null ? "unknown (no runs in window)" : automationSuccessPct >= 95,
      },
      notificationDeliveryP95: {
        target: "\u2264 60s p95",
        delivered: n.delivered,
        total: n.total,
        actualP95Seconds: n.p95_seconds === null ? "no data" : Number(n.p95_seconds).toFixed(1),
        met: n.p95_seconds === null ? "unknown (no notifications in window)" : Number(n.p95_seconds) <= 60,
      },
      projectionFreshness: {
        target: "\u2264 60s",
        projections: projectionLag.rows.map((r) => ({
          name: r.name,
          lagSeconds: Math.round(Number(r.lag_seconds)),
          met: Number(r.lag_seconds) <= 60,
        })),
      },
      deadLettersInWindow: deadLetters.rows[0].count,
      note:
        "Availability and latency-budget SLOs require scraped /api/metrics history over the window; " +
        "this report only covers the SLOs measurable from ground-truth tables in this checkout. " +
        "Wire this script to Prometheus range queries in a real deployment for the full set.",
    };

    console.log(JSON.stringify(report, null, 2));
  });
}

main().catch((err) => {
  console.error("slo-report failed:", err);
  process.exit(1);
});
