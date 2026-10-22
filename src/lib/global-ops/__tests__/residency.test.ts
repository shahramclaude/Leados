import { describe, expect, it } from "vitest";
import { assertResidencyAllowed, filterByResidency, isRegionAllowed, ResidencyViolationError, type ResidencyPolicy } from "../residency";

const policies: ResidencyPolicy[] = [
  { dataClass: "eu-personal-data", description: "EU personal data (GDPR)", allowedRegions: ["eu"] },
  { dataClass: "us-tax", description: "US tax filings", allowedRegions: ["us"] },
  { dataClass: "group-financial", description: "Group-level consolidated financial data", allowedRegions: ["eu", "us", "apac"] },
];
const policiesByClass = new Map(policies.map((p) => [p.dataClass, p]));

describe("isRegionAllowed / assertResidencyAllowed", () => {
  it("allows a same-region read", () => {
    expect(isRegionAllowed(policies[0], "eu")).toBe(true);
    expect(() => assertResidencyAllowed(policies[0], "eu-personal-data", "eu")).not.toThrow();
  });

  it("blocks a cross-border read attempt", () => {
    expect(isRegionAllowed(policies[0], "us")).toBe(false);
    expect(() => assertResidencyAllowed(policies[0], "eu-personal-data", "us")).toThrow(ResidencyViolationError);
  });

  it("fails closed when no policy is configured for the data class", () => {
    expect(() => assertResidencyAllowed(undefined, "unclassified", "eu")).toThrow(ResidencyViolationError);
  });
});

interface Row {
  id: number;
  dataClass: string;
}

describe("filterByResidency — cross-border attempt matrix", () => {
  const rows: Row[] = [
    { id: 1, dataClass: "eu-personal-data" },
    { id: 2, dataClass: "us-tax" },
    { id: 3, dataClass: "group-financial" },
    { id: 4, dataClass: "unclassified-data" }, // no policy on file at all
  ];

  it("EU requester: sees EU personal data + group financial, blocked from US tax and unclassified", () => {
    const { allowed, blocked } = filterByResidency(rows, (r) => r.dataClass, policiesByClass, "eu");
    expect(allowed.map((r) => r.id).sort()).toEqual([1, 3]);
    expect(blocked.map((b) => b.row.id).sort()).toEqual([2, 4]);
  });

  it("US requester: sees US tax + group financial, blocked from EU personal data and unclassified", () => {
    const { allowed, blocked } = filterByResidency(rows, (r) => r.dataClass, policiesByClass, "us");
    expect(allowed.map((r) => r.id).sort()).toEqual([2, 3]);
    expect(blocked.map((b) => b.row.id).sort()).toEqual([1, 4]);
  });

  it("APAC requester: sees only group financial, blocked from both region-locked classes and unclassified", () => {
    const { allowed, blocked } = filterByResidency(rows, (r) => r.dataClass, policiesByClass, "apac");
    expect(allowed.map((r) => r.id).sort()).toEqual([3]);
    expect(blocked.map((b) => b.row.id).sort()).toEqual([1, 2, 4]);
  });

  it("every blocked row carries a human-readable reason — nothing disappears silently", () => {
    const { blocked } = filterByResidency(rows, (r) => r.dataClass, policiesByClass, "eu");
    for (const b of blocked) {
      expect(b.reason.length).toBeGreaterThan(0);
    }
  });

  it("unknown data class fails closed even when requester region is otherwise broadly permitted", () => {
    const { allowed, blocked } = filterByResidency(rows, (r) => r.dataClass, policiesByClass, "us");
    expect(allowed.some((r) => r.dataClass === "unclassified-data")).toBe(false);
    expect(blocked.find((b) => b.row.dataClass === "unclassified-data")?.reason).toMatch(/fail closed/i);
  });
});
