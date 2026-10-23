import { describe, expect, it } from "vitest";
import { isRegulatoryReportable, sanitizeReporterName, statutoryReportDueAt, validateRootCause } from "@/lib/calc/hse";

describe("isRegulatoryReportable", () => {
  it("is reportable at severity 4 and above", () => {
    expect(isRegulatoryReportable(3)).toBe(false);
    expect(isRegulatoryReportable(4)).toBe(true);
    expect(isRegulatoryReportable(5)).toBe(true);
  });
});

describe("statutoryReportDueAt", () => {
  it("returns null for non-reportable severities", () => {
    expect(statutoryReportDueAt(new Date(), 2)).toBeNull();
  });

  it("gives a 1-day clock for severity 5", () => {
    const occurredAt = new Date("2026-01-01T00:00:00Z");
    const due = statutoryReportDueAt(occurredAt, 5)!;
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-02");
  });

  it("gives a 7-day clock for severity 4", () => {
    const occurredAt = new Date("2026-01-01T00:00:00Z");
    const due = statutoryReportDueAt(occurredAt, 4)!;
    expect(due.toISOString().slice(0, 10)).toBe("2026-01-08");
  });
});

describe("validateRootCause", () => {
  it("rejects human-error-only analysis with no system factor", () => {
    const result = validateRootCause(true, null);
    expect(result.valid).toBe(false);
  });

  it("accepts human-error analysis when a system-contributing factor is named", () => {
    const result = validateRootCause(true, "Guard interlock was not fail-safe.");
    expect(result.valid).toBe(true);
  });

  it("accepts analysis that is not human-error-only", () => {
    const result = validateRootCause(false, null);
    expect(result.valid).toBe(true);
  });
});

describe("sanitizeReporterName", () => {
  it("suppresses reporter name for anonymous reports", () => {
    expect(sanitizeReporterName(true, "Alex Smith")).toBeNull();
  });

  it("keeps reporter name for non-anonymous reports", () => {
    expect(sanitizeReporterName(false, "Alex Smith")).toBe("Alex Smith");
  });
});
