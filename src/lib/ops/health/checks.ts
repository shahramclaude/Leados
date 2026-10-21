// Individual health checks. Each one is independently testable and reports
// a status a human can act on, not just a boolean.
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { automationRuns, backupsLog, systemMeta } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withDbSpan, withExternalSpan } from "@/lib/obs/tracing";
import { deadLetterCount, oldestAgeSecondsByStatus } from "@/lib/ops/workQueue";
import { projectionLagSeconds } from "@/lib/ops/projection";
import { getMaintenanceState } from "@/lib/ops/maintenance";
import { activeStreamConnections } from "@/lib/ops/streamHub";
import { getHeartbeatAgeSeconds } from "@/lib/ops/deadMansSwitch";

export const CURRENT_SCHEMA_VERSION = "2026.10.part18";

export type CheckStatus = "ok" | "warn" | "fail";

export interface CheckResult {
  id: string;
  label: string;
  status: CheckStatus;
  critical: boolean;
  summary: string;
  details: Record<string, unknown>;
  remediation: string;
  runbook: string;
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await withDbSpan("health.select1", () => db.execute(sql`select 1`));
    const latencyMs = Date.now() - start;
    const status: CheckStatus = latencyMs > 300 ? "warn" : "ok";
    return {
      id: "database",
      label: "Database connectivity",
      status,
      critical: true,
      summary: status === "ok" ? `Reachable, ${latencyMs}ms` : `Reachable but slow, ${latencyMs}ms`,
      details: { latencyMs },
      remediation: status === "ok" ? "None." : "Investigate db load/network latency; see runbook.",
      runbook: "docs/RUNBOOKS.md#degraded-database",
    };
  } catch (err) {
    return {
      id: "database",
      label: "Database connectivity",
      status: "fail",
      critical: true,
      summary: err instanceof Error ? err.message : "unreachable",
      details: { error: err instanceof Error ? err.message : String(err) },
      remediation: "Check DATABASE_URL, Postgres container/host status, connection count. See runbook.",
      runbook: "docs/RUNBOOKS.md#degraded-database",
    };
  }
}

async function checkMigration(): Promise<CheckResult> {
  try {
    const rows = await db.select().from(systemMeta).where(sql`key = 'schema_version'`).limit(1);
    const deployed = (rows[0]?.value as { version?: string } | undefined)?.version;
    const ok = deployed === CURRENT_SCHEMA_VERSION;
    return {
      id: "schema_version",
      label: "Migration / schema version",
      status: ok ? "ok" : deployed ? "fail" : "warn",
      critical: true,
      summary: ok
        ? `schema_version matches (${deployed})`
        : deployed
          ? `schema_version mismatch: deployed=${deployed} expected=${CURRENT_SCHEMA_VERSION}`
          : "schema_version not recorded yet — run migrations",
      details: { deployed: deployed ?? null, expected: CURRENT_SCHEMA_VERSION },
      remediation: ok ? "None." : "Run `npx drizzle-kit push` / the deploy migration step, then re-check.",
      runbook: "docs/RUNBOOKS.md#schema-rollback-expandcontract",
    };
  } catch (err) {
    return {
      id: "schema_version",
      label: "Migration / schema version",
      status: "fail",
      critical: true,
      summary: "could not read system_meta",
      details: { error: err instanceof Error ? err.message : String(err) },
      remediation: "Database/schema likely not initialized. Run migrations.",
      runbook: "docs/RUNBOOKS.md#schema-rollback-expandcontract",
    };
  }
}

async function checkProjectionLag(): Promise<CheckResult> {
  const { lagSeconds, behindEvents } = await projectionLagSeconds();
  // SLO: projections <= 60s behind the event log.
  const status: CheckStatus = lagSeconds === null ? "warn" : lagSeconds > 300 ? "fail" : lagSeconds > 60 ? "warn" : "ok";
  return {
    id: "projection_lag",
    label: "Projection freshness",
    status,
    critical: false,
    summary: lagSeconds === null ? "projection has never run" : `${lagSeconds.toFixed(1)}s behind, ${behindEvents} events unprojected`,
    details: { lagSeconds, behindEvents, sloSeconds: 60 },
    remediation: status === "ok" ? "None." : "Trigger `npm run db:rebuild` or POST /api/scheduler/run {job:'projection.refresh'}.",
    runbook: "docs/RUNBOOKS.md#projection--read-model-rebuild",
  };
}

async function checkQueueAge(): Promise<CheckResult> {
  const queuedAge = await oldestAgeSecondsByStatus("queued");
  const runningAge = await oldestAgeSecondsByStatus("running");
  const worst = Math.max(queuedAge ?? 0, runningAge ?? 0);
  const status: CheckStatus = worst > 1800 ? "fail" : worst > 300 ? "warn" : "ok";
  return {
    id: "automation_queue",
    label: "Automation queue age",
    status,
    critical: false,
    summary: worst === 0 ? "queue empty / fresh" : `oldest due job age ${worst.toFixed(0)}s`,
    details: { oldestQueuedAgeSeconds: queuedAge, oldestRunningAgeSeconds: runningAge },
    remediation: status === "ok" ? "None." : "Inspect stuck jobs; see stuck-automation-run runbook.",
    runbook: "docs/RUNBOOKS.md#stuck-automation-run",
  };
}

async function checkDeadLetter(): Promise<CheckResult> {
  const count = await deadLetterCount();
  const status: CheckStatus = count > 20 ? "fail" : count > 0 ? "warn" : "ok";
  return {
    id: "dead_letter",
    label: "Dead-letter queue",
    status,
    critical: false,
    summary: `${count} job(s) in dead-letter`,
    details: { count },
    remediation: count === 0 ? "None." : "Triage via GET /api/scheduler/dead-letter; see dead-letter-triage runbook.",
    runbook: "docs/RUNBOOKS.md#dead-letter-triage",
  };
}

async function checkAutomationFreshness(): Promise<CheckResult> {
  const [last] = await db.select().from(automationRuns).where(sql`status = 'succeeded'`).orderBy(desc(automationRuns.finishedAt)).limit(1);
  const ageHours = last ? (Date.now() - last.finishedAt.getTime()) / 3_600_000 : null;
  const recent = await db.select().from(automationRuns).orderBy(desc(automationRuns.finishedAt)).limit(50);
  const successRate = recent.length ? recent.filter((r) => r.status === "succeeded").length / recent.length : 1;
  const status: CheckStatus =
    ageHours === null ? "warn" : ageHours > 72 ? "fail" : ageHours > 24 ? "warn" : successRate < 0.95 ? "warn" : "ok";
  return {
    id: "automation_freshness",
    label: "Automation success / freshness",
    status,
    critical: false,
    summary:
      ageHours === null
        ? "no successful automation run recorded yet"
        : `last success ${ageHours.toFixed(1)}h ago, ${(successRate * 100).toFixed(0)}% success over last ${recent.length}`,
    details: { lastSuccessAgeHours: ageHours, successRate, sampleSize: recent.length, sloSuccessRate: 0.95 },
    remediation: status === "ok" ? "None." : "Check scheduler logs; manually trigger via POST /api/scheduler/run.",
    runbook: "docs/RUNBOOKS.md#stuck-automation-run",
  };
}

async function checkMaintenanceMode(): Promise<CheckResult> {
  const state = await getMaintenanceState();
  return {
    id: "maintenance_mode",
    label: "Maintenance mode",
    status: state.enabled ? "warn" : "ok",
    critical: false,
    summary: state.enabled ? `ENABLED${state.reason ? `: ${state.reason}` : ""}` : "disabled",
    details: state,
    remediation: state.enabled ? "Confirm this is intentional; disable via POST /api/admin/maintenance when done." : "None.",
    runbook: "docs/RUNBOOKS.md#backup-restore-drill",
  };
}

async function checkLlmProvider(): Promise<CheckResult> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL;
  if (!apiKey || !baseUrl) {
    return {
      id: "llm_provider",
      label: "LLM provider reachability",
      status: "warn",
      critical: false,
      summary: "not configured (LLM_API_KEY / LLM_BASE_URL unset) — feature optional in this deployment",
      details: { configured: false },
      remediation: "Configure LLM_API_KEY/LLM_BASE_URL if LLM-backed features are required.",
      runbook: "docs/RUNBOOKS.md#credential-rotation",
    };
  }
  try {
    await withExternalSpan("llm_provider.ping", async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      try {
        await fetch(baseUrl, { method: "HEAD", signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
    });
    return {
      id: "llm_provider",
      label: "LLM provider reachability",
      status: "ok",
      critical: false,
      summary: "reachable",
      details: { configured: true },
      remediation: "None.",
      runbook: "docs/RUNBOOKS.md#credential-rotation",
    };
  } catch (err) {
    return {
      id: "llm_provider",
      label: "LLM provider reachability",
      status: "warn",
      critical: false,
      summary: `unreachable: ${err instanceof Error ? err.message : String(err)}`,
      details: { configured: true },
      remediation: "Check provider status / credential validity; see credential-rotation runbook.",
      runbook: "docs/RUNBOOKS.md#credential-rotation",
    };
  }
}

async function checkStreamHub(): Promise<CheckResult> {
  const active = activeStreamConnections();
  const limit = Number(process.env.STREAM_HUB_SOFT_LIMIT || 500);
  const status: CheckStatus = active > limit ? "warn" : "ok";
  return {
    id: "stream_hub",
    label: "Realtime stream hub load",
    status,
    critical: false,
    summary: `${active} active connection(s) (soft limit ${limit})`,
    details: { active, limit },
    remediation: status === "ok" ? "None." : "Investigate client reconnect storms; consider raising limit or shedding load.",
    runbook: "docs/RUNBOOKS.md#stuck-automation-run",
  };
}

async function checkDeadMansSwitch(): Promise<CheckResult> {
  const ageSeconds = await getHeartbeatAgeSeconds();
  const status: CheckStatus = ageSeconds === null ? "warn" : ageSeconds > 3600 ? "fail" : ageSeconds > 600 ? "warn" : "ok";
  return {
    id: "dead_mans_switch",
    label: "Scheduler dead-man's switch",
    status,
    critical: false,
    summary: ageSeconds === null ? "never pinged" : `last ping ${ageSeconds.toFixed(0)}s ago`,
    details: { ageSeconds },
    remediation: status === "ok" ? "None." : "The scheduler loop has stopped. Check the app process / instrumentation hook; see stuck-automation-run runbook.",
    runbook: "docs/RUNBOOKS.md#stuck-automation-run",
  };
}

async function checkLastBackup(): Promise<CheckResult> {
  const [lastBackup] = await db.select().from(backupsLog).where(sql`kind = 'backup'`).orderBy(desc(backupsLog.finishedAt)).limit(1);
  const [lastVerify] = await db.select().from(backupsLog).where(sql`kind = 'restore_verify'`).orderBy(desc(backupsLog.finishedAt)).limit(1);
  const backupAgeHours = lastBackup ? (Date.now() - lastBackup.finishedAt.getTime()) / 3_600_000 : null;
  const verifyOk = lastVerify?.status === "success";
  const status: CheckStatus =
    backupAgeHours === null ? "warn" : backupAgeHours > 48 ? "fail" : !lastVerify ? "warn" : !verifyOk ? "fail" : "ok";
  return {
    id: "backup",
    label: "Backup & restore verification",
    status,
    critical: false,
    summary:
      backupAgeHours === null
        ? "no backup recorded yet"
        : `last backup ${backupAgeHours.toFixed(1)}h ago, last restore-verify ${lastVerify ? lastVerify.status : "never run"}`,
    details: { lastBackupAt: lastBackup?.finishedAt.toISOString() ?? null, lastVerify: lastVerify?.status ?? null },
    remediation: status === "ok" ? "None." : "Run POST /api/scheduler/run {job:'backup.nightly'} then {job:'backup.restore_verify'}; see backup-restore-drill runbook.",
    runbook: "docs/RUNBOOKS.md#backup-restore-drill",
  };
}

export async function runAllChecks(): Promise<CheckResult[]> {
  return Promise.all([
    checkDatabase(),
    checkMigration(),
    checkProjectionLag(),
    checkQueueAge(),
    checkDeadLetter(),
    checkAutomationFreshness(),
    checkMaintenanceMode(),
    checkLlmProvider(),
    checkStreamHub(),
    checkDeadMansSwitch(),
    checkLastBackup(),
  ]);
}
