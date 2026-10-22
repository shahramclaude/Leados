import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { exportManifests } from "@/db/schema";
import { eq } from "drizzle-orm";
import { previewCsvImport, commitImportBatch } from "@/lib/import";
import { exportLeadsCsv, verifyExportRoundTrip } from "@/lib/export";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { truncateAll } from "../dbHelpers";

const CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Export One,export.one@roundtrip.com,+1 212-555-0155,RoundTripCo,Owner,US,2026-01-02T00:00:00Z
Export Two,export.two@roundtrip.com,+1 212-555-0166,RoundTripCo,CTO,US,2026-01-03T00:00:00Z
`;

describe("Export integrity — provenance manifest + round-trip import/export", () => {
  beforeEach(async () => {
    await ensureConnectorsSeeded();
    await truncateAll();
  });

  it("round-trips cleanly: checksum, row count, and canonical fields survive export -> re-import", async () => {
    const preview = await previewCsvImport("csv-upload", CSV);
    await commitImportBatch(preview.batchId, "test:export-suite");

    const exportResult = await exportLeadsCsv("test-export");
    expect(exportResult.rowCount).toBe(2);

    const [manifest] = await db.select().from(exportManifests).where(eq(exportManifests.id, exportResult.manifestId));
    expect(manifest.checksumSha256).toBe(exportResult.checksumSha256);

    const roundTrip = verifyExportRoundTrip(exportResult.csvText, manifest);
    expect(roundTrip.ok).toBe(true);
    expect(roundTrip.checksumMatches).toBe(true);
    expect(roundTrip.rowCountMatches).toBe(true);
    expect(roundTrip.malformedRowCount).toBe(0);
  });

  it("detects tampering: a modified export file fails checksum verification instead of being silently accepted", async () => {
    const preview = await previewCsvImport("csv-upload", CSV);
    await commitImportBatch(preview.batchId, "test:export-suite");
    const exportResult = await exportLeadsCsv("tamper-test");
    const [manifest] = await db.select().from(exportManifests).where(eq(exportManifests.id, exportResult.manifestId));

    const tampered = exportResult.csvText.replace("export.one@roundtrip.com", "tampered@roundtrip.com");
    const roundTrip = verifyExportRoundTrip(tampered, manifest);
    expect(roundTrip.ok).toBe(false);
    expect(roundTrip.checksumMatches).toBe(false);
  });

  it("detects row loss from a truncated export instead of reporting false row counts", async () => {
    const preview = await previewCsvImport("csv-upload", CSV);
    await commitImportBatch(preview.batchId, "test:export-suite");
    const exportResult = await exportLeadsCsv("truncate-test");
    const [manifest] = await db.select().from(exportManifests).where(eq(exportManifests.id, exportResult.manifestId));

    const lines = exportResult.csvText.split("\r\n").filter(Boolean);
    const truncated = [lines[0], lines[1]].join("\r\n") + "\r\n"; // drop the last data row
    const roundTrip = verifyExportRoundTrip(truncated, manifest);
    expect(roundTrip.ok).toBe(false);
    expect(roundTrip.rowCountMatches).toBe(false);
  });
});
