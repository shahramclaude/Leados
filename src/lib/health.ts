// Composite health model.
//
// One `/api/health` response aggregates every subsystem this part added real
// signals for: db + "migrations" (expected-table presence), projection
// freshness, work-queue age, dead-letter count, stuck runs, last successful
// run, LLM reachability, and the stream hub. Each subsystem reports
// healthy | degraded | failing plus a human "what to do" remediation string
// that links to docs/RUNBOOKS.md.
import { sql } from "drizzle-orm";
import { db, pool } from "@/db";
import { agentRuns, projectionState, workQueueJobs } from "@/db/schema";
import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { checkLlmReachability } from "./selfTest";
import { getSetting, getSettingUpdatedAt, DRAINING_KEY, STREAM_HUB_KEY } from "./settings";
import { registry } from "./metrics";

export type Status = "healthy" | "degraded" | "failing";

export interface SubsystemHealth {
  name: string;
  status: Status;
  message: string;
  remediation: string | null;
  runbook: string | null;
  metrics: Record<string, number | string | boolean | null>;
  checkedAt: string;
}

export interface CompositeHealth {
  status: Status;
  draining: boolean;
  checkedAt: string;
  subsystems: SubsystemHealth[];
}

const REQUIRED_TABLES = [
  "work_queue_jobs",
  "agent_runs",
  "projection_state",
  "notifications",
  "audit_events",
  "trace_spans",
  "system_settings",
  "deferred_writes",
  "backup_drills",
];

function worst(a: Status, b: Status): Status {
  const order: Record<Status, number> = { healthy: 0, degraded: 1, failing: 2 };
  return order[a] >= order[b] ? a : b;
}

async function checkDb(): Promise<SubsystemHealth> {
  const start = Date.now();
  try {
    await db.execute(sql`select 1`);
    const latencyMs = Date.now() - start;
    registry.dbPoolInUse.set({}, pool.totalCount - pool.idleCount);
    registry.dbPoolSize.set({}, pool.totalCount);
    const status: Status = latencyMs > 500 ? "degraded" : "healthy";
    return {
      name: "db",
      status,
      message: `select 1 round-trip in ${latencyMs}ms (pool: ${pool.totalCount - pool.idleCount}/${pool.totalCount} in use)`,
      remediation: status === "degraded" ? "DB latency elevated — check connection pool saturation and slow queries." : null,
      runbook: status === "degraded" ? "docs/RUNBOOKS.md#degraded-database" : null,
      metrics: { latencyMs, poolInUse: pool.totalCount - pool.idleCount, poolSize: pool.totalCount },
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: "db",
      status: "failing",
      message: `database unreachable: ${String(err)}`,
      remediation: "Database is unreachable. Check the PostgreSQL service and DATABASE_URL, then restart dependents.",
      runbook: "docs/RUNBOOKS.md#degraded-database",
      metrics: { latencyMs: Date.now() - start },
      checkedAt: new Date().toISOString(),
    };
  }
}

async function checkMigrations(): Promise<SubsystemHealth> {
  try {
    const tableList = sql.join(
      REQUIRED_TABLES.map((t) => sql`${t}`),
      sql`, `
    );
    const rows = await db.execute<{ table_name: string }>(sql`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_name in (${tableList})
    `);
    const present = new Set(rows.rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
    const status: Status = missing.length === 0 ? "healthy" : "failing";
    return {
      name: "migrations",
      status,
      message: missing.length === 0 ? "all required tables present" : `missing tables: ${missing.join(", ")}`,
      remediation: missing.length === 0 ? null : "Apply pending schema changes: `npx drizzle-kit push` (dev) or run the migration-on-deploy step.",
      runbook: missing.length === 0 ? null : "docs/RUNBOOKS.md#schema-rollback",
      metrics: { requiredTables: REQUIRED_TABLES.length, missingTables: missing.length },
      checkedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      name: "migrations",
      status: "failing",
      message: `could not inspect schema: ${String(err)}`,
      remediation: "Database schema could not be inspected — likely the same root cause as the db check.",
      runbook: "docs/RUNBOOKS.md#degraded-database",
      metrics: {},
      checkedAt: new Date().toISOString(),
    };
  }
}

async function checkProjectionFreshness(): Promise<SubsystemHealth> {
  const rows = await db.select().from(projectionState);
  if (rows.length === 0) {
    return {
      name: "projection_freshness",
      status: "healthy",
      message: "no projections registered yet",
      remediation: null,
      runbook: null,
      metrics: { lagSeconds: 0, projections: 0 },
      checkedAt: new Date().toISOString(),
    };
  }
  const now = Date.now();
  let maxLagSeconds = 0;
  let stalest = "";
  for (const row of rows) {
    const lag = (now - row.lastRefreshedAt.getTime()) / 1000;
    if (lag > maxLagSeconds) {
      maxLagSeconds = lag;
      stalest = row.name;
    }
  }
  // SLO (docs/SLO.md): freshness <= 60s healthy, <= 180s degraded, else failing.
  const status: Status = maxLagSeconds <= 60 ? "healthy" : maxLagSeconds <= 180 ? "degraded" : "failing";
  return {
    name: "projection_freshness",
    status,
    message: `stalest projection "${stalest}" is ${Math.round(maxLagSeconds)}s old`,
    remediation: status === "healthy" ? null : "Projection is stale — rebuild it: `node scripts/rebuild-projection.mjs`.",
    runbook: status === "healthy" ? null : "docs/RUNBOOKS.md#projection-rebuild",
    metrics: { lagSeconds: Math.round(maxLagSeconds), projections: rows.length },
    checkedAt: new Date().toISOString(),
  };
}

async function checkQueue(): Promise<SubsystemHealth> {
  const pending = await db
    .select()
    .from(workQueueJobs)
    .where(eq(workQueueJobs.status, "pending"))
    .orderBy(workQueueJobs.availableAt)
    .limit(1);
  const depthResult = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from work_queue_jobs where status = 'pending'
  `);
  const deadLetterResult = await db.execute<{ count: string }>(sql`
    select count(*)::text as count from work_queue_jobs where status = 'dead_letter'
  `);
  const depth = depthResult.rows[0]?.count ?? "0";
  const deadLetters = deadLetterResult.rows[0]?.count ?? "0";

  const ageSeconds = pending.length ? (Date.now() - pending[0].availableAt.getTime()) / 1000 : 0;
  const depthN = Number(depth);
  const deadLetterN = Number(deadLetters);

  registry.workQueueDepth.set({ queue: "default" }, depthN);
  registry.workQueueAgeSeconds.set({ queue: "default" }, ageSeconds);
  registry.workQueueDeadLetterTotal.set({ queue: "default" }, deadLetterN);

  // Queue age SLO: healthy <= 60s, degraded <= 300s, else failing.
  let status: Status = ageSeconds <= 60 ? "healthy" : ageSeconds <= 300 ? "degraded" : "failing";
  let message = `depth=${depthN}, oldest pending job age=${Math.round(ageSeconds)}s`;

  if (deadLetterN > 0) {
    status = worst(status, deadLetterN >= 5 ? "failing" : "degraded");
    message += `, dead-letter=${deadLetterN}`;
  }

  return {
    name: "work_queue",
    status,
    message,
    remediation: status === "healthy" ? null : "Investigate backlog/dead-letters: `node scripts/dead-letter-triage.mjs` and check worker throughput.",
    runbook: status === "healthy" ? null : "docs/RUNBOOKS.md#dead-letter-triage",
    metrics: { depth: depthN, oldestPendingAgeSeconds: Math.round(ageSeconds), deadLetterCount: deadLetterN },
    checkedAt: new Date().toISOString(),
  };
}

async function checkRuns(): Promise<SubsystemHealth> {
  const STUCK_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_MS);
  const stuck = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.status, "running"), lt(agentRuns.startedAt, stuckCutoff)));

  const [lastSucceeded] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.status, "succeeded"))
    .orderBy(desc(agentRuns.finishedAt))
    .limit(1);

  const now = Date.now();
  const lastSuccessAgeSeconds = lastSucceeded?.finishedAt
    ? (now - lastSucceeded.finishedAt.getTime()) / 1000
    : null;

  // Automation-success SLO window: last success within 30 min = healthy,
  // within 2h = degraded, else failing. No runs ever = degraded (unknown, not proven healthy).
  let status: Status;
  let message: string;
  if (lastSuccessAgeSeconds === null) {
    status = "degraded";
    message = "no successful agent run has ever been recorded";
  } else if (lastSuccessAgeSeconds <= 1800) {
    status = "healthy";
    message = `last successful run ${Math.round(lastSuccessAgeSeconds)}s ago`;
  } else if (lastSuccessAgeSeconds <= 7200) {
    status = "degraded";
    message = `last successful run ${Math.round(lastSuccessAgeSeconds / 60)}min ago`;
  } else {
    status = "failing";
    message = `last successful run ${Math.round(lastSuccessAgeSeconds / 60)}min ago`;
  }

  if (stuck.length > 0) {
    status = worst(status, "degraded");
    message += `; ${stuck.length} run(s) stuck in "running" for over ${STUCK_THRESHOLD_MS / 60000}min`;
  }

  return {
    name: "agent_runs",
    status,
    message,
    remediation:
      status === "healthy"
        ? null
        : "If runs are stuck, reap them: `node scripts/run-reaper.mjs`. If nothing has succeeded recently, check the orchestrator logs for the failing correlationId via /trace.",
    runbook: status === "healthy" ? null : "docs/RUNBOOKS.md#stuck-run",
    metrics: {
      stuckRuns: stuck.length,
      lastSuccessAgeSeconds: lastSuccessAgeSeconds === null ? null : Math.round(lastSuccessAgeSeconds),
    },
    checkedAt: new Date().toISOString(),
  };
}

async function checkLlm(): Promise<SubsystemHealth> {
  const result = await checkLlmReachability();
  return {
    name: "llm_reachability",
    status: result.ok ? "healthy" : "degraded",
    message: result.detail,
    remediation: result.ok ? null : "LLM endpoint unreachable — automations requiring it will fail; check provider status and credentials.",
    runbook: result.ok ? null : "docs/RUNBOOKS.md#credential-rotation",
    metrics: { latencyMs: result.latencyMs },
    checkedAt: new Date().toISOString(),
  };
}

async function checkStreamHub(): Promise<SubsystemHealth> {
  const value = await getSetting<{ activeConnections?: number; heartbeatAt?: string }>(STREAM_HUB_KEY, {});
  const updatedAt = await getSettingUpdatedAt(STREAM_HUB_KEY);
  const ageSeconds = updatedAt ? (Date.now() - updatedAt.getTime()) / 1000 : null;
  const active = value.activeConnections ?? 0;
  registry.streamConnectionsActive.set({}, active);

  let status: Status = "healthy";
  let message = `active connections=${active}`;
  if (ageSeconds === null) {
    message = "no stream-hub heartbeat observed yet";
  } else if (ageSeconds > 120) {
    status = "degraded";
    message += `, heartbeat stale (${Math.round(ageSeconds)}s old)`;
  }

  return {
    name: "stream_hub",
    status,
    message,
    remediation: status === "healthy" ? null : "Stream hub heartbeat is stale — check the app process is calling heartbeatStreamHub() on its interval.",
    runbook: status === "healthy" ? null : "docs/RUNBOOKS.md#stuck-run",
    metrics: { activeConnections: active, heartbeatAgeSeconds: ageSeconds === null ? null : Math.round(ageSeconds) },
    checkedAt: new Date().toISOString(),
  };
}

export async function getCompositeHealth(): Promise<CompositeHealth> {
  const draining = await getSetting<boolean>(DRAINING_KEY, false);

  const subsystems = await Promise.all([
    checkDb(),
    checkMigrations(),
    checkProjectionFreshness(),
    checkQueue(),
    checkRuns(),
    checkLlm(),
    checkStreamHub(),
  ]);

  let status: Status = "healthy";
  for (const s of subsystems) status = worst(status, s.status);
  if (draining) status = worst(status, "failing");

  return {
    status,
    draining,
    checkedAt: new Date().toISOString(),
    subsystems,
  };
}
