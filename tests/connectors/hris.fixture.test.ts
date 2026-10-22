import { describe, it, expect } from "vitest";
import { hrisConnector, ConnectorFetchError } from "@/lib/platform/connectors/hrisConnector";
import { makeFixtureTransport } from "@/lib/syncEngine";
import { runQualityEngine } from "@/lib/platform/quality/engine";

describe("HRIS connector — recorded fixtures (no live network)", () => {
  it("fetches and parses a successful recorded response", async () => {
    const transport = makeFixtureTransport("success");
    const result = await hrisConnector.fetchRaw!({ transport });
    const rows = hrisConnector.parseRaw(result.raw);
    expect(rows).toHaveLength(3);
    const normalized = rows.map((r) => hrisConnector.normalizeRow(r));
    expect(normalized[0].email).toBe("dana.whitfield@acme-hr.com");
    expect(normalized[0].entityType).toBe("person");
  });

  it("throws (never fabricates data) on a malformed payload shape", async () => {
    const transport = makeFixtureTransport("malformed");
    const result = await hrisConnector.fetchRaw!({ transport });
    expect(() => hrisConnector.parseRaw(result.raw)).toThrow(/Malformed HRIS payload/);
  });

  it("surfaces schema drift: renamed fields resolve to fewer canonical columns, not silently guessed", async () => {
    const transport = makeFixtureTransport("schema-drift");
    const result = await hrisConnector.fetchRaw!({ transport });
    const rows = hrisConnector.parseRaw(result.raw);
    const normalized = rows.map((r) => hrisConnector.normalizeRow(r));
    // "primaryEmailAddress" / "contactNumber" / "orgUnit" are not recognized aliases for this connector's schemaMap
    expect(normalized[0].email).toBeNull();
    expect(normalized[0].phone).toBeNull();
    expect(normalized[0].company).toBeNull();
    const report = runQualityEngine(normalized);
    expect(report.rowResults[0].quarantined).toBe(true); // no contact identifier resolved at all
    expect(report.schemaDriftSuspected.value).toBe(true);
  });

  it("retries on 5xx and succeeds on a later attempt (exponential backoff policy)", async () => {
    const transport = makeFixtureTransport("server-error-then-success");
    const result = await hrisConnector.fetchRaw!({ transport });
    const rows = hrisConnector.parseRaw(result.raw);
    expect(rows[0]).toMatchObject({ employeeName: "Lena Fischer" });
  }, 10000);

  it("exhausts retries and fails honestly (no stale success) when the source is down", async () => {
    const transport = makeFixtureTransport("always-down");
    await expect(hrisConnector.fetchRaw!({ transport })).rejects.toBeInstanceOf(ConnectorFetchError);
  }, 10000);

  it("throws when no transport is configured, rather than returning fabricated live data", async () => {
    await expect(hrisConnector.fetchRaw!({})).rejects.toThrow(/No transport configured/);
  });
});
