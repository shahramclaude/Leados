import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/db";
import { entities, quarantinedRows } from "@/db/schema";
import { previewCsvImport, commitImportBatch } from "@/lib/import";
import { ensureConnectorsSeeded } from "@/lib/platform/connectors/seed";
import { truncateAll } from "../dbHelpers";

const CORRUPT_CSV = `Full Name,Email,Phone,Company,Job Title,Country,Updated At
Good Record,good.record@validcorp.com,+1 212-555-0199,ValidCorp,Manager,US,2026-01-01T00:00:00Z
No Contact Info,,,,NoCorp,,
Bad Email Format,not-an-email,+1 212-555-0100,BadCorp,Rep,US,2026-01-01T00:00:00Z
`;

describe("Import pipeline — seeded corrupt data is quarantined, never silently merged", () => {
  beforeEach(async () => {
    await ensureConnectorsSeeded();
    await truncateAll();
  });

  it("commits the good row, quarantines the bad rows, and creates NO entity for quarantined rows", async () => {
    const preview = await previewCsvImport("csv-upload", CORRUPT_CSV);
    expect(preview.qualityReport.quarantinedCount).toBe(2);

    const report = await commitImportBatch(preview.batchId, "test:quarantine-suite");
    expect(report.rowsImported).toBe(1);
    expect(report.rowsQuarantined).toBe(2);
    expect(report.rowsNewEntities).toBe(1);

    const allEntities = await db.select().from(entities);
    expect(allEntities).toHaveLength(1);
    expect((allEntities[0].goldenRecord as { email: string }).email).toBe("good.record@validcorp.com");

    const quarantined = await db.select().from(quarantinedRows);
    expect(quarantined).toHaveLength(2);
    // The quarantined raw payload is preserved verbatim — no value was invented or repaired.
    const badEmailRow = quarantined.find((q) => (q.rawPayload as Record<string, string>)["Email"] === "not-an-email");
    expect(badEmailRow).toBeDefined();
    expect((badEmailRow!.reasons as string[])).toContain("invalid_email_format");
  });

  it("rejects malformed (column-count mismatch) rows at parse time and never writes them anywhere", async () => {
    const malformedCsv = `Full Name,Email,Phone,Company,Job Title,Country,Updated At\nShort Row,only,three\n`;
    const preview = await previewCsvImport("csv-upload", malformedCsv);
    expect(preview.sampleMalformedRows).toHaveLength(1);
    expect(preview.qualityReport.totalRows).toBe(0); // the malformed row never became a normalized row at all

    const report = await commitImportBatch(preview.batchId, "test:quarantine-suite");
    expect(report.malformedRowCount).toBe(1);
    expect(report.rowsImported).toBe(0);
  });
});
