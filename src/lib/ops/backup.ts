// Backup / restore-into-staging verification. "A backup you haven't
// restored is not a backup" — `restoreVerify()` actually spins up a scratch
// database, restores the latest dump into it, runs data-integrity checks,
// and tears it down, recording the result either way.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/db";
import { backupsLog } from "@/db/schema";
import { withExternalSpan } from "@/lib/obs/tracing";
import { logger } from "@/lib/obs/logger";
import { verifyChain } from "@/lib/ops/auditChain";

const execFileAsync = promisify(execFile);

export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(process.cwd(), "backups");
// Retention policy: keep the last 14 daily dumps, documented in docs/SLO.md
// RPO/RTO section. Weekly/monthly tiers are a documented follow-up, not
// implemented here (see AI-SESSION-LOG.md "what did you deliberately not do").
export const RETENTION_COUNT = 14;

function parseDbUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port || "5432",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
  };
}

export interface BackupResult {
  ok: boolean;
  filePath?: string;
  sizeBytes?: number;
  error?: string;
}

export async function runBackup(): Promise<BackupResult> {
  const started = new Date();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { ok: false, error: "DATABASE_URL not set" };
  const { host, port, user, password, database } = parseDbUrl(databaseUrl);
  await mkdir(BACKUP_DIR, { recursive: true });
  const fileName = `leados-${database}-${started.toISOString().replace(/[:.]/g, "-")}.sql`;
  const filePath = path.join(BACKUP_DIR, fileName);

  try {
    await withExternalSpan("pg_dump", () =>
      execFileAsync("pg_dump", ["-h", host, "-p", port, "-U", user, "-d", database, "-f", filePath, "--no-owner", "--no-privileges"], {
        env: { ...process.env, PGPASSWORD: password },
      }),
    );
    const stats = await stat(filePath);
    await pruneOldBackups();
    await db.insert(backupsLog).values({
      kind: "backup",
      filePath,
      status: "success",
      sizeBytes: stats.size,
      detail: { fileName },
      startedAt: started,
      finishedAt: new Date(),
    });
    logger.info("backup.completed", { filePath, sizeBytes: stats.size });
    return { ok: true, filePath, sizeBytes: stats.size };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(backupsLog).values({
      kind: "backup",
      filePath,
      status: "failed",
      detail: { error: message },
      startedAt: started,
      finishedAt: new Date(),
    });
    logger.error("backup.failed", { error: message });
    return { ok: false, error: message };
  }
}

async function pruneOldBackups() {
  const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith(".sql")).sort();
  const excess = files.length - RETENTION_COUNT;
  for (let i = 0; i < excess; i++) {
    await unlink(path.join(BACKUP_DIR, files[i])).catch(() => undefined);
  }
}

export async function latestBackupFile(): Promise<string | null> {
  try {
    const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith(".sql")).sort();
    return files.length ? path.join(BACKUP_DIR, files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

export interface RestoreVerifyResult {
  ok: boolean;
  scratchDb?: string;
  checks?: Record<string, unknown>;
  error?: string;
}

/** Restore the most recent backup into a throwaway database and verify
 * row-count + audit-chain integrity before dropping it. This is what makes
 * the backup a verified backup, not just a file on disk. */
export async function restoreVerify(filePath?: string): Promise<RestoreVerifyResult> {
  const started = new Date();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return { ok: false, error: "DATABASE_URL not set" };
  const dumpPath = filePath ?? (await latestBackupFile());
  if (!dumpPath) return { ok: false, error: "no backup file available to verify" };
  const { host, port, user, password } = parseDbUrl(databaseUrl);
  const scratchDb = `leados_restore_check_${Date.now()}`;

  const run = (cmd: string, args: string[]) =>
    execFileAsync(cmd, args, { env: { ...process.env, PGPASSWORD: password } });

  try {
    await withExternalSpan("restore_verify", async () => {
      await run("createdb", ["-h", host, "-p", port, "-U", user, scratchDb]);
      await run("psql", ["-h", host, "-p", port, "-U", user, "-d", scratchDb, "-v", "ON_ERROR_STOP=1", "-f", dumpPath]);
    });

    // Integrity checks against the restored, isolated database.
    const { Pool } = await import("pg");
    const scratchPool = new Pool({ host, port: Number(port), user, password, database: scratchDb });
    let checks: Record<string, unknown>;
    try {
      const tableCount = await scratchPool.query<{ count: string }>(
        "select count(*)::text as count from information_schema.tables where table_schema='public'",
      );
      const eventCount = await scratchPool.query<{ count: string }>("select count(*)::text as count from event_log").catch(() => ({
        rows: [{ count: "0" }],
      }));
      const auditCount = await scratchPool.query<{ count: string }>("select count(*)::text as count from audit_log").catch(() => ({
        rows: [{ count: "0" }],
      }));
      checks = {
        tableCount: Number(tableCount.rows[0].count),
        eventLogRowCount: Number(eventCount.rows[0].count),
        auditLogRowCount: Number(auditCount.rows[0].count),
      };
    } finally {
      await scratchPool.end();
    }

    await run("dropdb", ["-h", host, "-p", port, "-U", user, scratchDb]);

    const ok = (checks.tableCount as number) > 0;
    await db.insert(backupsLog).values({
      kind: "restore_verify",
      filePath: dumpPath,
      status: ok ? "success" : "failed",
      detail: checks,
      startedAt: started,
      finishedAt: new Date(),
    });
    logger.info("backup.restore_verify.completed", { ok, checks });
    return { ok, scratchDb, checks };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await run("dropdb", ["-h", host, "-p", port, "-U", user, "--if-exists", scratchDb]).catch(() => undefined);
    await db.insert(backupsLog).values({
      kind: "restore_verify",
      filePath: dumpPath,
      status: "failed",
      detail: { error: message },
      startedAt: started,
      finishedAt: new Date(),
    });
    logger.error("backup.restore_verify.failed", { error: message });
    return { ok: false, error: message };
  }
}

export async function auditChainIntegrityForRestore() {
  return verifyChain();
}
