// src/lib/import.ts
//
// Import Studio core: preview (parse + quality gate + MDM dry-run diff,
// cached and NOT yet written to raw_records/entities) -> commit (deterministic
// replay of the cached preview into raw_records / entities / dedup_candidates
// / lineage, with a partial-failure report). Used by both the CSV push UI and
// (indirectly, via src/lib/syncEngine.ts) the HRIS pull connector so every
// ingestion path is gated identically.
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  importBatches,
  quarantinedRows,
  rawRecords,
  entities,
  entityLinks,
  dedupCandidates,
  connectors as connectorsTable,
  syncRuns,
  auditLog,
} from "@/db/schema";
import { parseCsvRaw } from "./platform/connectors/csvConnector";
import { getConnectorDefinition } from "./platform/connectors/registry";
import { normalizeAndScore } from "./platform/pipeline";
import type { QualityReport } from "./platform/quality/engine";
import type { NormalizedLead } from "./platform/types";
import { resolveAgainstEntities, type CandidateEntity } from "./platform/mdm/resolve";
import { buildGoldenRecord, type SourcedRecord } from "./platform/mdm/golden";
import { recordLineage } from "./platform/lineage/store";
import { emitEvent } from "./dbEvents";

export interface ParseErrorSample {
  rowIndex: number;
  message: string;
  raw: string;
}

export interface PreviewPayload {
  rawObjects: Array<Record<string, unknown>>;
  normalizedRows: NormalizedLead[];
  malformedRows: ParseErrorSample[];
}

export interface DiffSummary {
  newEntityCount: number;
  autoDuplicateCount: number;
  pendingReviewCount: number;
  quarantinedCount: number;
  malformedRowCount: number;
}

export interface PreviewResult {
  batchId: string;
  connectorId: string;
  rawRowCount: number;
  qualityReport: QualityReport;
  diffSummary: DiffSummary;
  sampleMalformedRows: ParseErrorSample[];
}

/** Computes the dry-run diff (what commit WOULD do) without writing raw_records/entities. */
async function computeDiffSummary(connectorId: string, normalizedRows: NormalizedLead[], qualityReport: QualityReport): Promise<DiffSummary> {
  const candidateRows = normalizedRows.filter((_, idx) => !qualityReport.rowResults[idx].quarantined);
  const existingEntities = await db.select().from(entities);
  const candidates: CandidateEntity[] = existingEntities.map((e) => ({ id: e.id, record: e.goldenRecord as NormalizedLead }));

  let newEntityCount = 0;
  let autoDuplicateCount = 0;
  let pendingReviewCount = 0;

  for (const row of candidateRows) {
    const sameType = candidates.filter((c) => c.record.entityType === row.entityType);
    const results = resolveAgainstEntities(row, sameType);
    if (results.length === 0) newEntityCount += 1;
    else if (results[0].decision === "auto_duplicate") autoDuplicateCount += 1;
    else pendingReviewCount += 1;
  }

  return {
    newEntityCount,
    autoDuplicateCount,
    pendingReviewCount,
    quarantinedCount: qualityReport.quarantinedCount,
    malformedRowCount: 0,
  };
}

export async function previewCsvImport(connectorId: string, csvText: string): Promise<PreviewResult> {
  const connector = getConnectorDefinition(connectorId);
  if (!connector) throw new Error(`Unknown connector: ${connectorId}`);

  const { objects, malformedRows } = parseCsvRaw(csvText);
  const { normalizedRows, qualityReport } = normalizeAndScore(connector, objects);
  const diffSummary = await computeDiffSummary(connectorId, normalizedRows, qualityReport);
  diffSummary.malformedRowCount = malformedRows.length;

  const payload: PreviewPayload = { rawObjects: objects, normalizedRows, malformedRows };

  const batchId = randomUUID();
  await db.insert(importBatches).values({
    id: batchId,
    connectorId,
    status: "previewed",
    rawRowCount: objects.length,
    mapping: connector.schemaMap,
    qualityReport: qualityReport as unknown as Record<string, unknown>,
    previewPayload: payload as unknown as Record<string, unknown>,
  });

  await emitEvent("import.previewed", { batchId, connectorId, rawRowCount: objects.length, malformedRowCount: malformedRows.length });

  return {
    batchId,
    connectorId,
    rawRowCount: objects.length,
    qualityReport,
    diffSummary,
    sampleMalformedRows: malformedRows.slice(0, 20),
  };
}

export interface CommitReport {
  batchId: string;
  rowsImported: number;
  rowsQuarantined: number;
  rowsNewEntities: number;
  rowsMergedAuto: number;
  rowsMergedPending: number;
  malformedRowCount: number;
  quarantinedSamples: Array<{ rowIndex: number; reasons: string[]; raw: Record<string, unknown> }>;
}

/** Deterministically replays a cached preview into the durable store. Never re-parses the original source. */
export async function commitImportBatch(batchId: string, actor: string): Promise<CommitReport> {
  const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
  if (!batch) throw new Error(`Unknown import batch: ${batchId}`);
  if (batch.status === "committed") throw new Error(`Batch ${batchId} was already committed.`);
  if (batch.status === "discarded") throw new Error(`Batch ${batchId} was discarded and cannot be committed.`);

  const payload = batch.previewPayload as unknown as PreviewPayload;
  const qualityReport = batch.qualityReport as unknown as QualityReport;
  const connector = getConnectorDefinition(batch.connectorId);
  if (!connector) throw new Error(`Unknown connector: ${batch.connectorId}`);

  const syncRunId = randomUUID();
  await db.insert(syncRuns).values({
    id: syncRunId,
    connectorId: batch.connectorId,
    mode: "commit",
    status: "running",
    rowsRead: payload.rawObjects.length,
  });

  let rowsImported = 0;
  let rowsNewEntities = 0;
  let rowsMergedAuto = 0;
  let rowsMergedPending = 0;
  const quarantinedSamples: CommitReport["quarantinedSamples"] = [];

  for (const rowResult of qualityReport.rowResults) {
    const normalized = payload.normalizedRows[rowResult.rowIndex];
    if (rowResult.quarantined) {
      const qId = randomUUID();
      await db.insert(quarantinedRows).values({
        id: qId,
        batchId,
        rowIndex: rowResult.rowIndex,
        rawPayload: payload.rawObjects[rowResult.rowIndex] ?? {},
        reasons: rowResult.hardFailReasons,
      });
      if (quarantinedSamples.length < 20) {
        quarantinedSamples.push({
          rowIndex: rowResult.rowIndex,
          reasons: rowResult.hardFailReasons,
          raw: payload.rawObjects[rowResult.rowIndex] ?? {},
        });
      }
      continue; // never merged into entities, per the quality gate contract
    }

    const rawRecordId = randomUUID();
    await db.insert(rawRecords).values({
      id: rawRecordId,
      connectorId: batch.connectorId,
      batchId,
      externalId: normalized.externalId,
      entityType: normalized.entityType,
      normalized: normalized as unknown as Record<string, unknown>,
    });
    rowsImported += 1;

    const existingEntityRows = await db.select().from(entities).where(eq(entities.entityType, normalized.entityType));
    const candidates: CandidateEntity[] = existingEntityRows.map((e) => ({ id: e.id, record: e.goldenRecord as NormalizedLead }));
    const matches = resolveAgainstEntities(normalized, candidates);

    const [connectorRow] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, batch.connectorId));
    const precedenceRank = connectorRow?.precedenceRank ?? connector.precedenceRank;

    if (matches.length === 0) {
      // Brand new entity.
      const { goldenRecord, fieldProvenance } = buildGoldenRecord([
        { connectorId: batch.connectorId, rawRecordId, precedenceRank, record: normalized },
      ]);
      const entityId = randomUUID();
      await db.insert(entities).values({
        id: entityId,
        entityType: normalized.entityType,
        goldenRecord: goldenRecord as unknown as Record<string, unknown>,
        sourcePrecedence: [{ connectorId: batch.connectorId, precedenceRank }],
        fieldProvenance: fieldProvenance as unknown as Record<string, unknown>,
      });
      await db.insert(entityLinks).values({
        id: randomUUID(),
        entityId,
        rawRecordId,
        confidence: "1.0",
        linkMethod: "initial",
      });
      await recordLineage({
        sourceRefTable: "raw_records",
        sourceRefId: rawRecordId,
        sourceLabel: `${connector.displayName} row (external id: ${normalized.externalId ?? "n/a"})`,
        transformLabel: "normalize:v1 -> new-entity:v1",
        transformMetadata: { connectorId: batch.connectorId, batchId },
        projectionRefTable: "entities",
        projectionRefId: entityId,
        projectionLabel: "entities.goldenRecord",
        surfaces: ["leadDetail", "leadList"],
      });
      rowsNewEntities += 1;
    } else if (matches[0].decision === "auto_duplicate") {
      const entityId = matches[0].entityId;
      await db.insert(entityLinks).values({
        id: randomUUID(),
        entityId,
        rawRecordId,
        confidence: String(matches[0].matchScore.score),
        linkMethod: "auto_duplicate",
      });
      await rebuildGoldenRecordForEntity(entityId, batch.connectorId, precedenceRank);
      await recordLineage({
        sourceRefTable: "raw_records",
        sourceRefId: rawRecordId,
        sourceLabel: `${connector.displayName} row (external id: ${normalized.externalId ?? "n/a"})`,
        transformLabel: "normalize:v1 -> mdm-auto-duplicate-merge:v1",
        transformMetadata: { connectorId: batch.connectorId, batchId, score: matches[0].matchScore.score },
        projectionRefTable: "entities",
        projectionRefId: entityId,
        projectionLabel: "entities.goldenRecord",
        surfaces: ["leadDetail", "leadList"],
      });
      rowsMergedAuto += 1;
    } else {
      // pending_review: NEVER auto-merged. Queued for human confirmation (Dedup Review).
      await db.insert(dedupCandidates).values({
        id: randomUUID(),
        entityId: matches[0].entityId,
        rawRecordId,
        score: String(matches[0].matchScore.score),
        matchedRules: matches[0].matchScore.rules,
        status: "pending",
      });
      await emitEvent("dedup.candidate_created", { entityId: matches[0].entityId, rawRecordId, score: matches[0].matchScore.score });
      rowsMergedPending += 1;
    }
  }

  const finalStatus = qualityReport.quarantinedCount > 0 || payload.malformedRows.length > 0 ? "partial" : "success";

  await db
    .update(syncRuns)
    .set({
      status: finalStatus,
      rowsValid: rowsImported,
      rowsQuarantined: qualityReport.quarantinedCount,
      rowsImported,
      rowsMergedPending,
      rowsMergedAuto,
      finishedAt: new Date(),
      errorSummary: payload.malformedRows.length > 0 ? { malformedRows: payload.malformedRows } : null,
    })
    .where(eq(syncRuns.id, syncRunId));

  await db
    .update(importBatches)
    .set({ status: "committed", committedAt: new Date(), syncRunId })
    .where(eq(importBatches.id, batchId));

  await db
    .update(connectorsTable)
    .set({ healthState: "healthy", lastSuccessAt: new Date(), lastAttemptAt: new Date(), lastErrorMessage: null })
    .where(eq(connectorsTable.id, batch.connectorId));

  await db.insert(auditLog).values({
    id: randomUUID(),
    actor,
    action: "import.commit",
    targetTable: "import_batches",
    targetId: batchId,
    details: { rowsImported, rowsNewEntities, rowsMergedAuto, rowsMergedPending, rowsQuarantined: qualityReport.quarantinedCount },
  });

  await emitEvent("import.committed", { batchId, rowsImported, rowsNewEntities, rowsMergedAuto, rowsMergedPending });

  return {
    batchId,
    rowsImported,
    rowsQuarantined: qualityReport.quarantinedCount,
    rowsNewEntities,
    rowsMergedAuto,
    rowsMergedPending,
    malformedRowCount: payload.malformedRows.length,
    quarantinedSamples,
  };
}

/** Rebuilds an entity's golden record from ALL raw records ever linked to it (immutable raw history replay). */
export async function rebuildGoldenRecordForEntity(entityId: string, _newConnectorId: string, _newPrecedenceRank: number): Promise<void> {
  const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, entityId));
  const rawRecordIds = links.map((l) => l.rawRecordId);
  const sources: SourcedRecord[] = [];
  for (const rid of rawRecordIds) {
    const [rr] = await db.select().from(rawRecords).where(eq(rawRecords.id, rid));
    if (!rr) continue;
    const [connectorRow] = await db.select().from(connectorsTable).where(eq(connectorsTable.id, rr.connectorId));
    sources.push({
      connectorId: rr.connectorId,
      rawRecordId: rr.id,
      precedenceRank: connectorRow?.precedenceRank ?? 999,
      record: rr.normalized as unknown as NormalizedLead,
    });
  }
  if (sources.length === 0) return;
  const { goldenRecord, fieldProvenance, conflicts } = buildGoldenRecord(sources);
  const distinctConnectors = Array.from(new Set(sources.map((s) => ({ connectorId: s.connectorId, precedenceRank: s.precedenceRank }))
    .map((x) => JSON.stringify(x)))).map((s) => JSON.parse(s));

  await db
    .update(entities)
    .set({
      goldenRecord: goldenRecord as unknown as Record<string, unknown>,
      fieldProvenance: fieldProvenance as unknown as Record<string, unknown>,
      sourcePrecedence: distinctConnectors,
      updatedAt: new Date(),
    })
    .where(eq(entities.id, entityId));

  if (Object.keys(conflicts).length > 0) {
    await db.insert(auditLog).values({
      id: randomUUID(),
      actor: "system:mdm-golden-rebuild",
      action: "entity.field_conflict",
      targetTable: "entities",
      targetId: entityId,
      details: { conflicts },
    });
  }
}
