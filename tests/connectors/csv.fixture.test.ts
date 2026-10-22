import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseCsvRaw, csvConnector } from "@/lib/platform/connectors/csvConnector";
import { runQualityEngine } from "@/lib/platform/quality/engine";

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "../../src/lib/platform/connectors/fixtures/csv", name), "utf8");
}

describe("CSV connector — recorded fixtures", () => {
  it("parses a valid CSV with no malformed rows", () => {
    const { objects, malformedRows } = parseCsvRaw(loadFixture("valid.csv"));
    expect(malformedRows).toHaveLength(0);
    expect(objects).toHaveLength(3);
    const normalized = objects.map((o) => csvConnector.normalizeRow(o));
    expect(normalized[0].email).toBe("alicia.gomez@brightpath.com");
    expect(normalized[0].entityType).toBe("person");
  });

  it("rejects malformed rows (column-count mismatch) instead of coercing them", () => {
    const { objects, malformedRows } = parseCsvRaw(loadFixture("malformed.csv"));
    // "Bad Row,missing-some-columns,US" has 3 cols vs 7-col header -> rejected
    expect(malformedRows.length).toBeGreaterThanOrEqual(1);
    expect(malformedRows[0].message).toMatch(/Expected 7 columns/);
    // Valid rows (Grace Lin, Omar Siddiqui, and the empty-but-correct-column-count row) still parse
    expect(objects.length).toBeGreaterThan(0);
  });

  it("flags invalid email format as a hard quarantine reason, never auto-correcting it", () => {
    const { objects } = parseCsvRaw(loadFixture("malformed.csv"));
    const normalized = objects.map((o) => csvConnector.normalizeRow(o));
    const report = runQualityEngine(normalized);
    const omar = normalized.findIndex((r) => r.fullName === "Omar Siddiqui");
    expect(omar).toBeGreaterThanOrEqual(0);
    expect(report.rowResults[omar].quarantined).toBe(true);
    expect(report.rowResults[omar].hardFailReasons).toContain("invalid_email_format");
  });

  it("detects near-duplicate rows and scores uniqueness below 1.0", () => {
    const { objects } = parseCsvRaw(loadFixture("duplicates.csv"));
    const normalized = objects.map((o) => csvConnector.normalizeRow(o));
    const report = runQualityEngine(normalized);
    expect(report.dimensions.uniqueness.value).toBeLessThan(1);
    // Two rows share the exact same normalized email -> only 1 of the first-2 identical rows is "first seen"
    expect(report.dimensions.uniqueness.evidence?.uniqueCount).toBeLessThan(report.dimensions.uniqueness.evidence?.keyedRows as number);
  });

  it("suspects schema drift when critical fields never resolve across a batch", () => {
    const { objects } = parseCsvRaw(loadFixture("schema-drift.csv"));
    const normalized = objects.map((o) => csvConnector.normalizeRow(o));
    const report = runQualityEngine(normalized);
    // "Primary Email" is not a recognized alias for email -> email never resolves for any row
    expect(report.schemaDriftSuspected.value).toBe(true);
    expect(report.schemaDriftSuspected.evidence?.zeroResolvedFields).toContain("email");
  });
});
