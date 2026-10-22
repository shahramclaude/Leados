import { describe, it, expect } from "vitest";
import { runQualityEngine } from "@/lib/platform/quality/engine";
import type { NormalizedLead } from "@/lib/platform/types";

function lead(overrides: Partial<NormalizedLead>): NormalizedLead {
  return {
    externalId: null,
    entityType: "person",
    fullName: "Test Person",
    email: "test.person@example-corp.com",
    phone: "+1 555-000-0000",
    company: "Example Corp",
    title: "Analyst",
    country: "US",
    sourceUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Quality gate — seeded corrupt data is quarantined, never silently merged", () => {
  it("quarantines a row with neither email nor phone", () => {
    const rows = [lead({ email: null, phone: null })];
    const report = runQualityEngine(rows);
    expect(report.rowResults[0].quarantined).toBe(true);
    expect(report.rowResults[0].hardFailReasons).toContain("missing_contact_identifiers");
  });

  it("quarantines a row with a malformed email instead of repairing/guessing it", () => {
    const rows = [lead({ email: "not-an-email-at-all" })];
    const report = runQualityEngine(rows);
    expect(report.rowResults[0].quarantined).toBe(true);
    expect(report.rowResults[0].hardFailReasons).toContain("invalid_email_format");
    // The engine must not have changed the value — honesty rule.
    expect(rows[0].email).toBe("not-an-email-at-all");
  });

  it("does NOT quarantine a merely-stale or placeholder-domain row (soft warning only)", () => {
    const rows = [lead({ email: "person@example.com", sourceUpdatedAt: "2000-01-01T00:00:00Z" })];
    const report = runQualityEngine(rows);
    expect(report.rowResults[0].quarantined).toBe(false);
    expect(report.rowResults[0].warnings).toEqual(expect.arrayContaining(["placeholder_email_domain", "stale_or_future_timestamp"]));
  });

  it("scores a corrupt batch below thresholds on multiple dimensions (surfaced as low-quality chips)", () => {
    const rows = [
      lead({ email: null, phone: null }),
      lead({ email: "bad-email" }),
      lead({ email: "dup@corp.com" }),
      lead({ email: "dup@corp.com" }), // exact duplicate
      lead({ sourceUpdatedAt: null }),
    ];
    const report = runQualityEngine(rows);
    expect(report.lowQualityDimensions).toEqual(expect.arrayContaining(["completeness", "validity"]));
    expect(report.quarantinedCount).toBeGreaterThanOrEqual(2);
  });

  it("honestly reports accuracyProxy as a proxy with no ground truth (never pretends to be real accuracy)", () => {
    const report = runQualityEngine([lead({})]);
    expect(report.dimensions.accuracyProxy.isProxy).toBe(true);
    expect(report.dimensions.accuracyProxy.explanation).toMatch(/no ground truth|NO ground-truth/i);
  });

  it("honestly reports timeliness as unmet (not assumed-fresh) when no source timestamp exists at all", () => {
    const rows = [lead({ sourceUpdatedAt: null }), lead({ sourceUpdatedAt: null })];
    const report = runQualityEngine(rows);
    expect(report.dimensions.timeliness.value).toBe(0);
    expect(report.dimensions.timeliness.explanation).toMatch(/cannot be assessed/i);
  });
});
