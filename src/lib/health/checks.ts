import { sql } from "drizzle-orm";
import { db } from "@/db";
import { systemMeta } from "@/db/schema";
import schemaVersionInfo from "@/db/schemaVersion.json";
import type { HealthCheckResult } from "./types";

async function timed(fn: () => Promise<Omit<HealthCheckResult, "durationMs">>): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return { ...result, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      id: "unknown_check_error",
      label: "Unknown check error",
      status: "fail",
      critical: true,
      summary: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    };
  }
}

/** Dependency check: can we reach Postgres at all. */
export function checkDatabase(): Promise<HealthCheckResult> {
  return timed(async () => {
    await db.execute(sql`select 1`);
    return {
      id: "database",
      label: "Database connectivity",
      status: "ok",
      critical: true,
      summary: "Connected to Postgres and executed `select 1` successfully.",
      runbook: "#degraded-database",
    };
  });
}

/** Dependency check: does the running app's expected schema version match what's recorded in the DB. */
export function checkSchemaVersion(): Promise<HealthCheckResult> {
  return timed(async () => {
    const rows = await db
      .select()
      .from(systemMeta)
      .where(sql`${systemMeta.key} = 'schema_version'`)
      .limit(1);

    const expected = schemaVersionInfo.version;
    const recorded = rows[0]?.value;

    if (!recorded) {
      return {
        id: "schema_version",
        label: "Migration / schema version",
        status: "warn",
        critical: false,
        summary: "No schema_version row found in system_meta. Run `npm run db:migrate`.",
        details: { expected },
        runbook: "#schema-rollback",
      };
    }

    if (recorded !== expected) {
      return {
        id: "schema_version",
        label: "Migration / schema version",
        status: "fail",
        critical: true,
        summary: `App expects schema ${expected} but database reports ${recorded}. Migrations are out of sync with the running app.`,
        details: { expected, recorded },
        runbook: "#schema-rollback",
      };
    }

    return {
      id: "schema_version",
      label: "Migration / schema version",
      status: "ok",
      critical: false,
      summary: `Database schema version ${recorded} matches the running app.`,
      details: { version: recorded },
    };
  });
}

const QUEUE_LAG_WARN_SECONDS = 5 * 60; // 5 minutes
const QUEUE_LAG_FAIL_SECONDS = 30 * 60; // 30 minutes

/** Dependency check: automation queue depth / lag. */
export function checkAutomationQueue(): Promise<HealthCheckResult> {
  return timed(async () => {
    const rows = await db.execute<{ depth: string; oldest_queued_at: string | null }>(sql`
      select count(*)::text as depth, min(queued_at)::text as oldest_queued_at
      from automation_runs
      where status in ('queued', 'running')
    `);
    const row = rows.rows[0] as { depth: string; oldest_queued_at: string | null } | undefined;
    const depth = row ? Number(row.depth) : 0;
    const oldestQueuedAgeSeconds = row?.oldest_queued_at
      ? Math.max(0, Math.round((Date.now() - new Date(row.oldest_queued_at).getTime()) / 1000))
      : null;

    let status: HealthCheckResult["status"] = "ok";
    let summary = `${depth} run(s) queued/running; no significant lag.`;

    if (oldestQueuedAgeSeconds !== null && oldestQueuedAgeSeconds >= QUEUE_LAG_FAIL_SECONDS) {
      status = "fail";
      summary = `Oldest queued automation run has been waiting ${oldestQueuedAgeSeconds}s (>= ${QUEUE_LAG_FAIL_SECONDS}s threshold).`;
    } else if (oldestQueuedAgeSeconds !== null && oldestQueuedAgeSeconds >= QUEUE_LAG_WARN_SECONDS) {
      status = "warn";
      summary = `Oldest queued automation run has been waiting ${oldestQueuedAgeSeconds}s (>= ${QUEUE_LAG_WARN_SECONDS}s warn threshold).`;
    }

    return {
      id: "automation_queue",
      label: "Automation queue depth / lag",
      status,
      critical: false,
      summary,
      details: { depth, oldestQueuedAgeSeconds },
      runbook: "#stuck-automation-run",
    };
  });
}

const AUTOMATION_FRESHNESS_WARN_SECONDS = 24 * 60 * 60; // 24h
const AUTOMATION_FRESHNESS_FAIL_SECONDS = 72 * 60 * 60; // 72h

/** Dependency check: has an automation run succeeded recently. */
export function checkAutomationFreshness(): Promise<HealthCheckResult> {
  return timed(async () => {
    const rows = await db.execute<{ finished_at: string | null; name: string | null }>(sql`
      select finished_at::text as finished_at, name
      from automation_runs
      where status = 'succeeded'
      order by finished_at desc
      limit 1
    `);
    const row = rows.rows[0] as { finished_at: string | null; name: string | null } | undefined;

    if (!row?.finished_at) {
      return {
        id: "automation_freshness",
        label: "Last successful automation run",
        status: "warn",
        critical: false,
        summary: "No automation run has ever succeeded. Expected for a fresh install.",
        runbook: "#stuck-automation-run",
      };
    }

    const ageSeconds = Math.round((Date.now() - new Date(row.finished_at).getTime()) / 1000);
    let status: HealthCheckResult["status"] = "ok";
    let summary = `Last successful run ("${row.name}") finished ${ageSeconds}s ago.`;

    if (ageSeconds >= AUTOMATION_FRESHNESS_FAIL_SECONDS) {
      status = "fail";
      summary = `Last successful automation run was ${ageSeconds}s ago (>= ${AUTOMATION_FRESHNESS_FAIL_SECONDS}s threshold). Data is likely stale.`;
    } else if (ageSeconds >= AUTOMATION_FRESHNESS_WARN_SECONDS) {
      status = "warn";
      summary = `Last successful automation run was ${ageSeconds}s ago (>= ${AUTOMATION_FRESHNESS_WARN_SECONDS}s warn threshold).`;
    }

    return {
      id: "automation_freshness",
      label: "Last successful automation run",
      status,
      critical: false,
      summary,
      details: { finishedAt: row.finished_at, name: row.name, ageSeconds },
      runbook: "#stuck-automation-run",
    };
  });
}

/** Informational check: maintenance mode flag. */
export function checkMaintenanceMode(): Promise<HealthCheckResult> {
  return timed(async () => {
    const rows = await db
      .select()
      .from(systemMeta)
      .where(sql`${systemMeta.key} = 'maintenance_mode'`)
      .limit(1);
    const enabled = rows[0]?.value === "true";

    return {
      id: "maintenance_mode",
      label: "Maintenance mode",
      status: enabled ? "warn" : "ok",
      critical: false,
      summary: enabled
        ? "Maintenance mode is ON. Writes may be rejected by API routes that check this flag."
        : "Maintenance mode is OFF.",
      details: { enabled },
      runbook: "#maintenance-mode--graceful-shutdown",
    };
  });
}

/** Informational check: process-level signals (uptime, shutdown flag, memory). */
export function checkProcess(isShuttingDown: () => boolean): Promise<HealthCheckResult> {
  return timed(async () => {
    const shuttingDown = isShuttingDown();
    const mem = process.memoryUsage();
    return {
      id: "process",
      label: "Process runtime",
      status: shuttingDown ? "warn" : "ok",
      critical: false,
      summary: shuttingDown
        ? "Process received a shutdown signal and is draining in-flight requests."
        : `Process healthy. Uptime ${Math.round(process.uptime())}s.`,
      details: {
        uptimeSeconds: Math.round(process.uptime()),
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        shuttingDown,
        nodeVersion: process.version,
      },
      runbook: "#maintenance-mode--graceful-shutdown",
    };
  });
}
