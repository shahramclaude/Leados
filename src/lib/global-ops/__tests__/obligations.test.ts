import { describe, expect, it } from "vitest";
import { applicableObligations, isObligationApplicable, type ObligationDefinition } from "../obligations";
import type { EntityRecord } from "../types";

function makeEntity(overrides: Partial<EntityRecord>): EntityRecord {
  return {
    id: 1,
    groupId: 1,
    parentEntityId: null,
    code: "E1",
    legalName: "Entity One",
    jurisdictionCode: "DE",
    region: "eu",
    functionalCurrency: "EUR",
    ownershipPct: 100,
    consolidationMethod: "full",
    fiscalCalendarType: "calendar",
    fiscalCalendarConfig: {},
    timezone: "Europe/Berlin",
    localeTag: "de-DE",
    isActive: true,
    ...overrides,
  };
}

const globalObligation: ObligationDefinition = {
  code: "GLOBAL-TP",
  title: "Transfer pricing documentation",
  description: "Applies everywhere",
  jurisdictionCode: "*",
  applicabilityRule: {},
  frequency: "annual",
  dataClass: "group-financial",
};

const euGdprObligation: ObligationDefinition = {
  code: "EU-GDPR",
  title: "GDPR data processing register",
  description: "EU only",
  jurisdictionCode: "*",
  applicabilityRule: { regions: ["eu"] },
  frequency: "annual",
  dataClass: "eu-personal-data",
};

const usStateObligation: ObligationDefinition = {
  code: "US-STATE-TAX",
  title: "US state tax filing",
  description: "US jurisdiction only, controlling entities only",
  jurisdictionCode: "US",
  applicabilityRule: { minOwnershipPct: 51 },
  frequency: "quarterly",
  dataClass: "us-tax",
};

describe("isObligationApplicable", () => {
  it("a global ('*') obligation applies to any entity", () => {
    expect(isObligationApplicable(globalObligation, makeEntity({}))).toBe(true);
    expect(isObligationApplicable(globalObligation, makeEntity({ jurisdictionCode: "SG", region: "apac" }))).toBe(true);
  });

  it("region-scoped obligation applies only to matching regions", () => {
    expect(isObligationApplicable(euGdprObligation, makeEntity({ region: "eu" }))).toBe(true);
    expect(isObligationApplicable(euGdprObligation, makeEntity({ region: "us" }))).toBe(false);
  });

  it("jurisdiction-coded obligation requires exact jurisdiction match", () => {
    expect(isObligationApplicable(usStateObligation, makeEntity({ jurisdictionCode: "US", ownershipPct: 100 }))).toBe(true);
    expect(isObligationApplicable(usStateObligation, makeEntity({ jurisdictionCode: "DE", ownershipPct: 100 }))).toBe(false);
  });

  it("minOwnershipPct clause excludes minority-owned entities", () => {
    expect(isObligationApplicable(usStateObligation, makeEntity({ jurisdictionCode: "US", ownershipPct: 40 }))).toBe(false);
    expect(isObligationApplicable(usStateObligation, makeEntity({ jurisdictionCode: "US", ownershipPct: 60 }))).toBe(true);
  });
});

describe("applicableObligations", () => {
  it("filters a full obligation list down to what applies to a given entity", () => {
    const usEntity = makeEntity({ jurisdictionCode: "US", region: "us", ownershipPct: 100 });
    const result = applicableObligations([globalObligation, euGdprObligation, usStateObligation], usEntity);
    expect(result.map((o) => o.code).sort()).toEqual(["GLOBAL-TP", "US-STATE-TAX"]);
  });
});
