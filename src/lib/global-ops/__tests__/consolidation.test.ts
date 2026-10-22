// Hand-computed fixture — see the worked arithmetic in the PR description / AI-SESSION-LOG.md.
// Group (USD) -> Parent (USD, root) -> Sub A (USD, 80% owned, full) -> (sibling) Sub B (GBP, 40%
// owned, proportional) -> (sibling) Associate (EUR, 30% owned, equity method).
//
// Intercompany: Parent sells to Sub A for 100,000 USD (Parent books REV-IC, Sub A books EXP-IC).
import { describe, expect, it } from "vitest";
import { consolidateGroup, netIncomeAttributableToOwners } from "../consolidation";
import type { EliminationEntry, EntityRecord, FinancialLine, FxRateRecord } from "../types";

const FY = 2025;
const FP = 1;

const parent: EntityRecord = {
  id: 1,
  groupId: 1,
  parentEntityId: null,
  code: "PARENT",
  legalName: "Leados Holdings Inc.",
  jurisdictionCode: "US",
  region: "us",
  functionalCurrency: "USD",
  ownershipPct: 100,
  consolidationMethod: "full",
  fiscalCalendarType: "calendar",
  fiscalCalendarConfig: {},
  timezone: "America/New_York",
  localeTag: "en-US",
  isActive: true,
};

const subA: EntityRecord = {
  ...parent,
  id: 2,
  parentEntityId: 1,
  code: "SUBA",
  legalName: "Leados Sub A LLC",
  ownershipPct: 80,
  consolidationMethod: "full",
};

const subB: EntityRecord = {
  ...parent,
  id: 3,
  parentEntityId: 1,
  code: "SUBB",
  legalName: "Leados Sub B Ltd",
  jurisdictionCode: "GB",
  region: "eu",
  functionalCurrency: "GBP",
  ownershipPct: 40,
  consolidationMethod: "proportional",
};

const associate: EntityRecord = {
  ...parent,
  id: 4,
  parentEntityId: 1,
  code: "ASSOC",
  legalName: "Leados Associate GmbH",
  jurisdictionCode: "DE",
  region: "eu",
  functionalCurrency: "EUR",
  ownershipPct: 30,
  consolidationMethod: "equity",
};

const entities = [parent, subA, subB, associate];

const lines: FinancialLine[] = [
  // Parent
  { entityId: 1, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 900_000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
  { entityId: 1, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-IC", accountLabel: "Intercompany revenue", amountValue: 100_000, amountCurrency: "USD", isIntercompany: true, counterpartyEntityId: 2 },
  { entityId: 1, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 600_000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
  // Sub A
  { entityId: 2, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 400_000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
  { entityId: 2, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 150_000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
  { entityId: 2, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-IC", accountLabel: "Intercompany expense", amountValue: 100_000, amountCurrency: "USD", isIntercompany: true, counterpartyEntityId: 1 },
  // Sub B (GBP)
  { entityId: 3, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 200_000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
  { entityId: 3, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 120_000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
  // Associate (EUR) — equity method, should never appear in consolidated REV/EXP totals
  { entityId: 4, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 1_000_000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
  { entityId: 4, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 700_000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
];

const eliminations: EliminationEntry[] = [
  { fromEntityId: 1, toEntityId: 2, accountCode: "REV-IC", amountValue: 100_000, amountCurrency: "USD", reason: "Eliminate intercompany sale: Parent -> Sub A" },
  { fromEntityId: 2, toEntityId: 1, accountCode: "EXP-IC", amountValue: 100_000, amountCurrency: "USD", reason: "Eliminate intercompany purchase: Sub A <- Parent" },
];

const rates: FxRateRecord[] = [
  { baseCurrency: "GBP", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.25, method: "average", rateSource: "Test fixture: GBP/USD average rate, FY2025 P01", fiscalYear: FY, fiscalPeriod: FP },
  { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.10, method: "average", rateSource: "Test fixture: EUR/USD average rate, FY2025 P01", fiscalYear: FY, fiscalPeriod: FP },
];

describe("consolidateGroup — hand-computed fixture", () => {
  const result = consolidateGroup({
    group: { id: 1, groupCurrency: "USD" },
    entities,
    lines,
    eliminations,
    rates,
    fiscalYear: FY,
    fiscalPeriod: FP,
  });

  it("nets intercompany REV-IC to zero after elimination", () => {
    const line = result.lines.find((l) => l.accountCode === "REV-IC");
    expect(line?.consolidatedValue).toBe(0);
    expect(line?.eliminationsAppliedGroupCcy).toBe(100_000);
  });

  it("nets intercompany EXP-IC to zero after elimination", () => {
    const line = result.lines.find((l) => l.accountCode === "EXP-IC");
    expect(line?.consolidatedValue).toBe(0);
    expect(line?.eliminationsAppliedGroupCcy).toBe(100_000);
  });

  it("consolidates external revenue: Parent + Sub A (full) + 40% of Sub B at 1.25 = 1,400,000", () => {
    const line = result.lines.find((l) => l.accountCode === "REV-EXT");
    expect(line?.consolidatedValue).toBe(1_400_000);
  });

  it("consolidates external expense: Parent + Sub A (full) + 40% of Sub B at 1.25 = 810,000", () => {
    const line = result.lines.find((l) => l.accountCode === "EXP-EXT");
    expect(line?.consolidatedValue).toBe(810_000);
  });

  it("excludes the equity-method associate entirely from consolidated REV/EXP line items", () => {
    const revLine = result.lines.find((l) => l.accountCode === "REV-EXT");
    const assocContribution = revLine?.contributions.find((c) => c.entityId === associate.id);
    expect(assocContribution).toBeUndefined();
  });

  it("raises a single equity pickup for the associate: 30% x (1,000,000-700,000 EUR) x 1.10 = 99,000 USD", () => {
    expect(result.equityPickups).toHaveLength(1);
    expect(result.equityPickups[0].shareOfNetIncomeGroupCcy).toBe(99_000);
  });

  it("raises minority interest for Sub A only: 20% x 250,000 = 50,000, none for proportional Sub B", () => {
    expect(result.minorityInterest).toHaveLength(1);
    expect(result.minorityInterest[0].entityId).toBe(subA.id);
    expect(result.minorityInterest[0].nciAmountGroupCcy).toBe(50_000);
  });

  it("computes group net income attributable to owners = 540,000", () => {
    expect(netIncomeAttributableToOwners(result)).toBe(540_000);
  });

  it("drill-down integrity: every consolidated line's contributions sum exactly to its total", () => {
    for (const line of result.lines) {
      const sum = line.contributions.reduce((s, c) => s + c.translatedValue, 0);
      expect(Math.round(sum * 100) / 100).toBe(line.consolidatedValue);
    }
  });

  it("every entity in the group appears in entitySummaries — no entity can hide behind the group total", () => {
    const ids = result.entitySummaries.map((s) => s.entityId).sort();
    expect(ids).toEqual([1, 2, 3, 4]);
  });

  it("Sub B's proportional exclusion is visible: inclusionPct is 40, not 100", () => {
    const subBSummary = result.entitySummaries.find((s) => s.entityId === subB.id);
    expect(subBSummary?.inclusionPct).toBe(40);
  });
});

describe("consolidateGroup — missing FX rate is a hard failure, never a silent default", () => {
  it("throws instead of assuming rate = 1 when a required rate is absent", () => {
    expect(() =>
      consolidateGroup({
        group: { id: 1, groupCurrency: "USD" },
        entities: [parent, subB],
        lines: lines.filter((l) => l.entityId === 1 || l.entityId === 3),
        eliminations: [],
        rates: [], // no GBP->USD rate on file
        fiscalYear: FY,
        fiscalPeriod: FP,
      }),
    ).toThrow(/no FX rate on file/i);
  });
});
