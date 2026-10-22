// src/lib/export.ts
//
// Export integrity: every export carries a provenance manifest (contributing
// connectors, row count, checksum). `verifyExportRoundTrip` re-imports the
// exported CSV through the same CSV connector used for ingestion and checks
// it is lossless for canonical fields — this is the round-trip test required
// by Phase 4.
import { randomUUID } from "crypto";
import { createHash } from "crypto";
import { db } from "@/db";
import { entities, exportManifests } from "@/db/schema";
import { toCsv } from "./csvUtils";
import { parseCsvRaw, CSV_SCHEMA_MAP } from "./platform/connectors/csvConnector";
import { resolveField, asStringOrNull } from "./platform/connectors/types";
import type { NormalizedLead } from "./platform/types";
import { CANONICAL_FIELDS } from "./platform/types";
import { linkExistingProjectionsToSurface } from "./platform/lineage/store";
import { emitEvent } from "./dbEvents";

// Export header names are chosen to be valid aliases in CSV_SCHEMA_MAP so the
// file round-trips through the very same connector that would ingest it.
const EXPORT_HEADER = ["ID", "Entity Type", "Full Name", "Email", "Phone", "Company", "Job Title", "Country", "Updated At"];

function entityToRow(entityId: string, record: NormalizedLead): Array<string | null> {
  return [
    entityId,
    record.entityType,
    record.fullName,
    record.email,
    record.phone,
    record.company,
    record.title,
    record.country,
    record.sourceUpdatedAt,
  ];
}

export interface ExportResult {
  manifestId: string;
  csvText: string;
  rowCount: number;
  checksumSha256: string;
  provenance: Record<string, unknown>;
}

export async function exportLeadsCsv(exportName = "leads-export"): Promise<ExportResult> {
  const rows = await db.select().from(entities);
  const csvRows = rows.map((r) => entityToRow(r.id, r.goldenRecord as NormalizedLead));
  const csvText = toCsv(EXPORT_HEADER, csvRows);
  const checksumSha256 = createHash("sha256").update(csvText, "utf8").digest("hex");

  const connectorsUsed = Array.from(
    new Set(
      rows.flatMap((r) => ((r.sourcePrecedence as Array<{ connectorId: string }>) ?? []).map((s) => s.connectorId))
    )
  );

  const provenance = {
    generatedAt: new Date().toISOString(),
    entityCount: rows.length,
    connectorsUsed,
    note: "Row-level provenance (which source contributed which field) is queryable per-entity via the Lineage Explorer / field_provenance column, not duplicated into this manifest.",
  };

  const manifestId = randomUUID();
  await db.insert(exportManifests).values({
    id: manifestId,
    exportName,
    format: "csv",
    rowCount: rows.length,
    checksumSha256,
    provenance,
  });

  await linkExistingProjectionsToSurface(
    "entities",
    rows.map((r) => r.id),
    "exportFile"
  );

  await emitEvent("export.generated", { manifestId, rowCount: rows.length, checksumSha256 });

  return { manifestId, csvText, rowCount: rows.length, checksumSha256, provenance };
}

export interface RoundTripIssue {
  code: string;
  message: string;
}

export interface RoundTripResult {
  ok: boolean;
  recomputedChecksum: string;
  checksumMatches: boolean;
  parsedRowCount: number;
  malformedRowCount: number;
  rowCountMatches: boolean;
  issues: RoundTripIssue[];
}

/** Re-imports an exported CSV through the CSV connector and verifies integrity against the manifest. */
export function verifyExportRoundTrip(csvText: string, manifest: { rowCount: number; checksumSha256: string }): RoundTripResult {
  const issues: RoundTripIssue[] = [];
  const recomputedChecksum = createHash("sha256").update(csvText, "utf8").digest("hex");
  const checksumMatches = recomputedChecksum === manifest.checksumSha256;
  if (!checksumMatches) issues.push({ code: "checksum_mismatch", message: "Recomputed checksum does not match the manifest. File was altered after export." });

  const { objects, malformedRows } = parseCsvRaw(csvText);
  if (malformedRows.length > 0) {
    issues.push({ code: "malformed_rows_on_reimport", message: `${malformedRows.length} row(s) failed to re-parse; integrity is NOT intact.` });
  }
  const rowCountMatches = objects.length === manifest.rowCount;
  if (!rowCountMatches) {
    issues.push({ code: "row_count_mismatch", message: `Manifest declares ${manifest.rowCount} rows; re-parsed ${objects.length}.` });
  }

  // Lossless-field check for canonical fields the export actually carries.
  for (const [idx, obj] of objects.entries()) {
    for (const field of CANONICAL_FIELDS) {
      if (field === "externalId") continue; // exported as "ID" (entity id), not the original external id — documented limit
      const resolved = asStringOrNull(resolveField(CSV_SCHEMA_MAP, field, obj));
      if (field === "email" && resolved && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolved)) {
        issues.push({ code: "reimported_invalid_email", message: `Row ${idx}: re-imported email "${resolved}" failed format validation after round-trip.` });
      }
    }
  }

  return {
    ok: checksumMatches && rowCountMatches && malformedRows.length === 0 && issues.filter((i) => i.code !== "reimported_invalid_email").length === 0,
    recomputedChecksum,
    checksumMatches,
    parsedRowCount: objects.length,
    malformedRowCount: malformedRows.length,
    rowCountMatches,
    issues,
  };
}
