// LEADOS — Part 37: seed data for the global-operations demo surfaces.
//
// Run with: npx tsx src/db/seed.ts
//
// Builds one EntityGroup with five entities spanning four consolidation methods, four functional
// currencies, two fiscal calendar families, and a deliberately loss-making entity (UK) so the
// "which default view hides a failing entity" attack scenario (PHASE 5 #1) has real data behind
// it in the UI, not just in unit tests.

import "dotenv/config";
import { db, pool } from "./index";
import {
  entityGroups,
  entities,
  fxRates,
  financialFigures,
  intercompanyEliminations,
  obligations,
  obligationInstances,
  dataResidencyPolicies,
  boardPackEntityNotes,
} from "./schema";

const FY = 2025;
const FP = 1;

async function main() {
  console.log("Seeding Part 37 global-operations data...");

  await db.delete(boardPackEntityNotes);
  await db.delete(obligationInstances);
  await db.delete(obligations);
  await db.delete(dataResidencyPolicies);
  await db.delete(intercompanyEliminations);
  await db.delete(financialFigures);
  await db.delete(fxRates);
  await db.delete(entities);
  await db.delete(entityGroups);

  const [group] = await db
    .insert(entityGroups)
    .values({ code: "LEADOS-GRP", name: "Leados Group", groupCurrency: "USD" })
    .returning();

  const [parent] = await db
    .insert(entities)
    .values({
      groupId: group.id,
      parentEntityId: null,
      code: "PARENT",
      legalName: "Leados Holdings, Inc.",
      jurisdictionCode: "US",
      region: "us",
      functionalCurrency: "USD",
      ownershipPct: 100,
      consolidationMethod: "full",
      fiscalCalendarType: "calendar",
      fiscalCalendarConfig: { yearStartMonth: 1 },
      timezone: "America/New_York",
      localeTag: "en-US",
    })
    .returning();

  const [eu] = await db
    .insert(entities)
    .values({
      groupId: group.id,
      parentEntityId: parent.id,
      code: "LEADOS-EU",
      legalName: "Leados Europe GmbH",
      jurisdictionCode: "DE",
      region: "eu",
      functionalCurrency: "EUR",
      ownershipPct: 80,
      consolidationMethod: "full",
      fiscalCalendarType: "calendar",
      fiscalCalendarConfig: { yearStartMonth: 1 },
      timezone: "Europe/Berlin",
      localeTag: "de-DE",
    })
    .returning();

  const [uk] = await db
    .insert(entities)
    .values({
      groupId: group.id,
      parentEntityId: parent.id,
      code: "LEADOS-UK",
      legalName: "Leados UK Ltd",
      jurisdictionCode: "GB",
      region: "uk",
      functionalCurrency: "GBP",
      ownershipPct: 100,
      consolidationMethod: "full",
      fiscalCalendarType: "445",
      fiscalCalendarConfig: { yearStartMonth: 1, weekStartsOn: 1 },
      timezone: "Europe/London",
      localeTag: "en-GB",
    })
    .returning();

  const [apacJv] = await db
    .insert(entities)
    .values({
      groupId: group.id,
      parentEntityId: parent.id,
      code: "LEADOS-APAC-JV",
      legalName: "Leados APAC Joint Venture Pte Ltd",
      jurisdictionCode: "SG",
      region: "apac",
      functionalCurrency: "SGD",
      ownershipPct: 35,
      consolidationMethod: "proportional",
      fiscalCalendarType: "calendar",
      fiscalCalendarConfig: { yearStartMonth: 1 },
      timezone: "Asia/Singapore",
      localeTag: "en-SG",
    })
    .returning();

  const [assocJp] = await db
    .insert(entities)
    .values({
      groupId: group.id,
      parentEntityId: parent.id,
      code: "LEADOS-ASSOC-JP",
      legalName: "Leados Associate K.K.",
      jurisdictionCode: "JP",
      region: "apac",
      functionalCurrency: "JPY",
      ownershipPct: 25,
      consolidationMethod: "equity",
      fiscalCalendarType: "calendar",
      fiscalCalendarConfig: { yearStartMonth: 1 },
      timezone: "Asia/Tokyo",
      localeTag: "ja-JP",
    })
    .returning();

  await db.insert(fxRates).values([
    { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.09, method: "average", rateSource: "Treasury FX desk — monthly average", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.10, method: "closing", rateSource: "ECB reference rate", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "EUR", quoteCurrency: "USD", rateDate: "2019-06-15", rate: 1.14, method: "historical", rateSource: "Historical rate at Leados Europe GmbH formation (2019-06-15) — treasury archive", fiscalYear: FY, fiscalPeriod: FP },

    { baseCurrency: "GBP", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.27, method: "average", rateSource: "Treasury FX desk — monthly average", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "GBP", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 1.28, method: "closing", rateSource: "Bank of England reference rate", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "GBP", quoteCurrency: "USD", rateDate: "2018-03-01", rate: 1.32, method: "historical", rateSource: "Historical rate at Leados UK Ltd formation (2018-03-01) — treasury archive", fiscalYear: FY, fiscalPeriod: FP },

    { baseCurrency: "SGD", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 0.745, method: "average", rateSource: "Treasury FX desk — monthly average", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "SGD", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 0.748, method: "closing", rateSource: "MAS reference rate", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "SGD", quoteCurrency: "USD", rateDate: "2020-09-10", rate: 0.715, method: "historical", rateSource: "Historical rate at JV formation (2020-09-10) — treasury archive", fiscalYear: FY, fiscalPeriod: FP },

    { baseCurrency: "JPY", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 0.0067, method: "average", rateSource: "Treasury FX desk — monthly average", fiscalYear: FY, fiscalPeriod: FP },
    { baseCurrency: "JPY", quoteCurrency: "USD", rateDate: "2025-01-31", rate: 0.00675, method: "closing", rateSource: "Bank of Japan reference rate", fiscalYear: FY, fiscalPeriod: FP },
  ]);

  await db.insert(financialFigures).values([
    // PARENT (USD)
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 2000000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-IC", accountLabel: "Intercompany revenue (licence fee to EU)", amountValue: 150000, amountCurrency: "USD", isIntercompany: true, counterpartyEntityId: eu.id },
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 1200000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "CASH", accountLabel: "Cash and equivalents", amountValue: 5000000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "RETAINED-EARNINGS", accountLabel: "Retained earnings", amountValue: 3500000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: parent.id, fiscalYear: FY, fiscalPeriod: FP, statement: "EQ", accountCode: "SHARE-CAPITAL", accountLabel: "Share capital", amountValue: 2000000, amountCurrency: "USD", isIntercompany: false, counterpartyEntityId: null },

    // LEADOS-EU (EUR), 80% owned, full
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 900000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 500000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-IC", accountLabel: "Intercompany expense (licence fee from Parent)", amountValue: 137000, amountCurrency: "EUR", isIntercompany: true, counterpartyEntityId: parent.id },
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "CASH", accountLabel: "Cash and equivalents", amountValue: 1200000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "RETAINED-EARNINGS", accountLabel: "Retained earnings", amountValue: 800000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },
    { entityId: eu.id, fiscalYear: FY, fiscalPeriod: FP, statement: "EQ", accountCode: "SHARE-CAPITAL", accountLabel: "Share capital", amountValue: 500000, amountCurrency: "EUR", isIntercompany: false, counterpartyEntityId: null },

    // LEADOS-UK (GBP), 100% owned, full — LOSS-MAKING this period
    { entityId: uk.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 300000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
    { entityId: uk.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense (incl. one-off restructuring)", amountValue: 420000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
    { entityId: uk.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "CASH", accountLabel: "Cash and equivalents", amountValue: 150000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
    { entityId: uk.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "RETAINED-EARNINGS", accountLabel: "Retained earnings (accumulated deficit)", amountValue: -50000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },
    { entityId: uk.id, fiscalYear: FY, fiscalPeriod: FP, statement: "EQ", accountCode: "SHARE-CAPITAL", accountLabel: "Share capital", amountValue: 100000, amountCurrency: "GBP", isIntercompany: false, counterpartyEntityId: null },

    // LEADOS-APAC-JV (SGD), 35% owned, proportional
    { entityId: apacJv.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 1000000, amountCurrency: "SGD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: apacJv.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 700000, amountCurrency: "SGD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: apacJv.id, fiscalYear: FY, fiscalPeriod: FP, statement: "BS", accountCode: "CASH", accountLabel: "Cash and equivalents", amountValue: 900000, amountCurrency: "SGD", isIntercompany: false, counterpartyEntityId: null },
    { entityId: apacJv.id, fiscalYear: FY, fiscalPeriod: FP, statement: "EQ", accountCode: "SHARE-CAPITAL", accountLabel: "Share capital", amountValue: 400000, amountCurrency: "SGD", isIntercompany: false, counterpartyEntityId: null },

    // LEADOS-ASSOC-JP (JPY), 25% owned, equity method
    { entityId: assocJp.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "REV-EXT", accountLabel: "External revenue", amountValue: 50000000, amountCurrency: "JPY", isIntercompany: false, counterpartyEntityId: null },
    { entityId: assocJp.id, fiscalYear: FY, fiscalPeriod: FP, statement: "PL", accountCode: "EXP-EXT", accountLabel: "External expense", amountValue: 42000000, amountCurrency: "JPY", isIntercompany: false, counterpartyEntityId: null },
  ]);

  await db.insert(intercompanyEliminations).values([
    { groupId: group.id, fiscalYear: FY, fiscalPeriod: FP, fromEntityId: parent.id, toEntityId: eu.id, accountCode: "REV-IC", amountValue: 150000, amountCurrency: "USD", reason: "Eliminate intercompany licence fee revenue: Parent -> Leados Europe" },
    { groupId: group.id, fiscalYear: FY, fiscalPeriod: FP, fromEntityId: eu.id, toEntityId: parent.id, accountCode: "EXP-IC", amountValue: 137000, amountCurrency: "EUR", reason: "Eliminate intercompany licence fee expense: Leados Europe <- Parent" },
  ]);

  await db.insert(dataResidencyPolicies).values([
    { dataClass: "group-financial", description: "Group-level consolidated financial data", allowedRegions: ["us", "eu", "uk", "apac"] },
    { dataClass: "us-tax", description: "US federal/state tax filings", allowedRegions: ["us"] },
    { dataClass: "eu-personal-data", description: "EU personal data subject to GDPR", allowedRegions: ["eu"] },
    { dataClass: "uk-regulatory", description: "UK statutory/regulatory filings", allowedRegions: ["uk"] },
    { dataClass: "apac-regulatory", description: "APAC statutory/regulatory filings", allowedRegions: ["apac"] },
  ]);

  const [globalTp, usTenQ, euGdpr, ukCt600, sgAcra, jpTax] = await db
    .insert(obligations)
    .values([
      { code: "GLOBAL-TRANSFER-PRICING", title: "Group transfer pricing documentation", description: "Master file + local files per OECD BEPS Action 13.", jurisdictionCode: "*", applicabilityRule: {}, frequency: "annual", dataClass: "group-financial" },
      { code: "US-10Q", title: "US quarterly filing (10-Q equivalent)", description: "Quarterly financial filing for US-controlled entities.", jurisdictionCode: "US", applicabilityRule: { minOwnershipPct: 51 }, frequency: "quarterly", dataClass: "us-tax" },
      { code: "EU-GDPR-ROPA", title: "GDPR Record of Processing Activities", description: "Annual update of the data processing register.", jurisdictionCode: "*", applicabilityRule: { regions: ["eu"] }, frequency: "annual", dataClass: "eu-personal-data" },
      { code: "UK-CT600", title: "UK Corporation Tax Return (CT600)", description: "Annual UK corporation tax filing.", jurisdictionCode: "GB", applicabilityRule: {}, frequency: "annual", dataClass: "uk-regulatory" },
      { code: "SG-ACRA-ANNUAL-RETURN", title: "Singapore ACRA Annual Return", description: "Annual corporate filing with ACRA.", jurisdictionCode: "SG", applicabilityRule: {}, frequency: "annual", dataClass: "apac-regulatory" },
      { code: "JP-TAX-RETURN", title: "Japan corporate tax return", description: "Annual Japanese corporate tax filing.", jurisdictionCode: "JP", applicabilityRule: { minOwnershipPct: 20 }, frequency: "annual", dataClass: "apac-regulatory" },
    ])
    .returning();

  await db.insert(obligationInstances).values([
    { obligationId: globalTp.id, entityId: parent.id, periodLabel: "2025-FY", dueDate: "2025-12-31", status: "in_progress" },
    { obligationId: globalTp.id, entityId: eu.id, periodLabel: "2025-FY", dueDate: "2025-12-31", status: "filed" },
    { obligationId: globalTp.id, entityId: uk.id, periodLabel: "2025-FY", dueDate: "2025-12-31", status: "not_started" },
    { obligationId: usTenQ.id, entityId: parent.id, periodLabel: "2025-Q1", dueDate: "2025-04-30", status: "filed" },
    { obligationId: euGdpr.id, entityId: eu.id, periodLabel: "2025-FY", dueDate: "2025-05-31", status: "in_progress" },
    { obligationId: ukCt600.id, entityId: uk.id, periodLabel: "2024-FY", dueDate: "2025-01-31", status: "overdue" },
    { obligationId: sgAcra.id, entityId: apacJv.id, periodLabel: "2025-FY", dueDate: "2025-09-30", status: "not_started" },
    { obligationId: jpTax.id, entityId: assocJp.id, periodLabel: "2025-FY", dueDate: "2025-05-31", status: "filed" },
  ]);

  await db.insert(boardPackEntityNotes).values([
    {
      groupId: group.id,
      entityId: uk.id,
      fiscalYear: FY,
      fiscalPeriod: FP,
      noteText: "UK posted a GBP 120k operating loss this period, driven by one-off restructuring costs. CT600 filing for FY2024 is overdue; treasury is engaging HMRC on a short extension.",
      flagLevel: "risk",
    },
    {
      groupId: group.id,
      entityId: apacJv.id,
      fiscalYear: FY,
      fiscalPeriod: FP,
      noteText: "ACRA annual return not yet started. The 35%-owned JV partner has been slow to counter-sign board minutes; escalated to JV governance committee.",
      flagLevel: "watch",
    },
    {
      groupId: group.id,
      entityId: eu.id,
      fiscalYear: FY,
      fiscalPeriod: FP,
      noteText: "On track. GDPR processing register update in progress ahead of the Q2 deadline.",
      flagLevel: "info",
    },
  ]);

  console.log("Seed complete:", {
    group: group.code,
    entities: [parent.code, eu.code, uk.code, apacJv.code, assocJp.code],
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
