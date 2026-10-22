// src/lib/syncEngine.ts
//
// Orchestrates PULL connectors (currently: hris-directory). Applies the
// connector's own retry/backoff policy, updates connector health state
// honestly (never reports "healthy" after a failed attempt), and — on
// success — routes the fetched rows through the exact same preview/commit
// pipeline as Import Studio, so a pull and a CSV upload are gated identically.
//
// DOCUMENTED LIMIT: there is no real vendor behind hris-directory. Every sync
// replays a recorded fixture file chosen by the caller (default: "success").
// This is intentionally visible in the UI ("Demo fixture mode") rather than
// quietly pretending to be a live integration.
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { connectors as connectorsTable, importBatches, syncRuns } from "@/db/schema";
import { hrisConnector, ConnectorFetchError } from "./platform/connectors/hrisConnector";
import { normalizeAndScore } from "./platform/pipeline";
import { commitImportBatch, type CommitReport } from "./import";
import { emitEvent } from "./dbEvents";
import type { ConnectorTransport } from "./platform/connectors/types";
import { resolveAgainstEntities, type CandidateEntity } from "./platform/mdm/resolve";
import { entities as entitiesTable } from "@/db/schema";
import type { NormalizedLead } from "./platform/types";
import type { QualityReport } from "./platform/quality/engine";

export const AVAILABLE_FIXTURES = [
  "success",
  "schema-drift",
  "malformed",
  "server-error-then-success",
  "always-down",
] as const;
export type FixtureName = (typeof AVAILABLE_FIXTURES)[number];

function loadFixture(name: FixtureName): unknown {
  const filePath = path.join(process.cwd(), "src/lib/platform/connectors/fixtures/hris", `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** Builds a transport that replays a recorded fixture file (single-response or multi-attempt). */
export function makeFixtureTransport(fixtureName: FixtureName): ConnectorTransport {
  const fixture = loadFixture(fixtureName) as
    | { status: number; body: unknown }
    | { attempts: Array<{ status: number; body: unknown }> };

  return async ({ attempt }) => {
    if ("attempts" in fixture) {
      const idx = Math.min(attempt - 1, fixture.attempts.length - 1);
      return fixture.attempts[idx];
    }
    return { status: fixture.status, body: fixture.body };
  };
}

export interface SyncOutcome {
  syncRunId: string | null;
  status: "success" | "partial" | "failed";
  healthState: "healthy" | "degraded" | "down";
  errorMessage: string | null;
  batchId: string | null;
  qualityReport: QualityReport | null;
  commitReport: CommitReport | null;
}

export async function runHrisSync(
  connectorId: string,
  opts: { dryRun: boolean; fixture?: FixtureName; actor: string }
): Promise<SyncOutcome> {
  const fixtureName = opts.fixture ?? "success";
  const transport = makeFixtureTransport(fixtureName);

  await db
    .update(connectorsTable)
    .set({ lastAttemptAt: new Date() })
    .where(eq(connectorsTable.id, connectorId));
  await emitEvent("connector.sync_started", { connectorId, dryRun: opts.dryRun, fixtureName });

  let raw: unknown;
  try {
    if (!hrisConnector.fetchRaw) throw new Error("hris-directory connector has no fetchRaw implementation.");
    const result = await hrisConnector.fetchRaw({ transport });
    raw = result.raw;
  } catch (err) {
    const message = err instanceof ConnectorFetchError ? err.message : String(err);
    await db
      .update(connectorsTable)
      .set({ healthState: "down", lastErrorMessage: message })
      .where(eq(connectorsTable.id, connectorId));
    await emitEvent("connector.health_changed", { connectorId, healthState: "down", message });
    const syncRunId = randomUUID();
    await db.insert(syncRuns).values({
      id: syncRunId,
      connectorId,
      mode: opts.dryRun ? "dry_run" : "commit",
      status: "failed",
      errorSummary: { message },
      finishedAt: new Date(),
    });
    return { syncRunId, status: "failed", healthState: "down", errorMessage: message, batchId: null, qualityReport: null, commitReport: null };
  }

  let rawObjects: Array<Record<string, unknown>>;
  try {
    rawObjects = hrisConnector.parseRaw(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(connectorsTable)
      .set({ healthState: "degraded", lastErrorMessage: message })
      .where(eq(connectorsTable.id, connectorId));
    await emitEvent("connector.health_changed", { connectorId, healthState: "degraded", message });
    const syncRunId = randomUUID();
    await db.insert(syncRuns).values({
      id: syncRunId,
      connectorId,
      mode: opts.dryRun ? "dry_run" : "commit",
      status: "failed",
      errorSummary: { message },
      finishedAt: new Date(),
    });
    return { syncRunId, status: "failed", healthState: "degraded", errorMessage: message, batchId: null, qualityReport: null, commitReport: null };
  }

  const { normalizedRows, qualityReport } = normalizeAndScore(hrisConnector, rawObjects);

  const batchId = randomUUID();
  await db.insert(importBatches).values({
    id: batchId,
    connectorId,
    status: "previewed",
    rawRowCount: rawObjects.length,
    mapping: hrisConnector.schemaMap,
    qualityReport: qualityReport as unknown as Record<string, unknown>,
    previewPayload: { rawObjects, normalizedRows, malformedRows: [] },
  });

  await db
    .update(connectorsTable)
    .set({ healthState: "healthy", lastSuccessAt: new Date(), lastErrorMessage: null })
    .where(eq(connectorsTable.id, connectorId));
  await emitEvent("connector.health_changed", { connectorId, healthState: "healthy" });

  if (opts.dryRun) {
    const syncRunId = randomUUID();
    await db.insert(syncRuns).values({
      id: syncRunId,
      connectorId,
      mode: "dry_run",
      status: qualityReport.quarantinedCount > 0 ? "partial" : "success",
      rowsRead: rawObjects.length,
      rowsValid: rawObjects.length - qualityReport.quarantinedCount,
      rowsQuarantined: qualityReport.quarantinedCount,
      finishedAt: new Date(),
    });
    await emitEvent("connector.sync_finished", { connectorId, syncRunId, dryRun: true });
    return {
      syncRunId,
      status: qualityReport.quarantinedCount > 0 ? "partial" : "success",
      healthState: "healthy",
      errorMessage: null,
      batchId,
      qualityReport,
      commitReport: null,
    };
  }

  const commitReport = await commitImportBatch(batchId, opts.actor);
  await emitEvent("connector.sync_finished", { connectorId, batchId, dryRun: false });

  return {
    syncRunId: null,
    status: commitReport.rowsQuarantined > 0 || commitReport.malformedRowCount > 0 ? "partial" : "success",
    healthState: "healthy",
    errorMessage: null,
    batchId,
    qualityReport,
    commitReport,
  };
}

/** Used by the Data Sources dashboard to preview what a sync WOULD do, for connectors not yet committed. */
export async function diffAgainstExisting(normalizedRows: NormalizedLead[]) {
  const existing = await db.select().from(entitiesTable);
  const candidates: CandidateEntity[] = existing.map((e) => ({ id: e.id, record: e.goldenRecord as NormalizedLead }));
  return normalizedRows.map((row) => resolveAgainstEntities(row, candidates.filter((c) => c.record.entityType === row.entityType)));
}
