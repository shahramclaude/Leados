// ---------------------------------------------------------------------------
// scripts/seed-esg.ts
//
// Seeds the ESG/sustainability schema with demo data: factor library
// versions (including a deliberate version bump for the factor-versioning
// test), activities (activity-based + spend-based, matched to a finance
// ledger for the reconciliation identity), environmental metrics, social
// aggregates (one deliberately below the k-anonymity threshold), governance
// decisions, targets, abatement initiatives, and obligations.
//
// Run with: npx tsx scripts/seed-esg.ts
// ---------------------------------------------------------------------------
import { db, pool } from "../src/db";
import {
  emissionFactors,
  activities,
  financeLedgerEntries,
  environmentalMetrics,
  peopleAggregates,
  governanceDecisions,
  targets,
  abatementInitiatives,
  obligations,
  disclosurePacks,
} from "../src/db/schema";
import { FACTOR_LIBRARY_SEED } from "../src/lib/emissionFactors";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Seeding ESG schema...");

  // Clean slate (idempotent re-seed)
  await db.execute(sql`truncate table esg_disclosure_packs, esg_obligations, esg_abatement_initiatives, esg_targets,
    esg_governance_decisions, esg_people_aggregates, esg_environmental_metrics, esg_activities,
    esg_finance_ledger_entries, esg_emission_factors restart identity cascade`);

  // --- Factor library -------------------------------------------------------
  await db.insert(emissionFactors).values(
    FACTOR_LIBRARY_SEED.map((f) => ({
      id: f.id,
      version: f.version,
      supersedes: f.supersedes,
      scope: f.scope,
      category: f.category,
      region: f.region,
      unit: f.unit,
      gridMethod: f.gridMethod,
      factorValue: f.factorValue.toString(),
      method: f.method,
      evidenceClass: f.evidenceClass,
      uncertaintyPct: f.uncertaintyPct.toString(),
      source: f.source,
      sourceUrl: f.sourceUrl,
      validFrom: f.validFrom,
      validTo: f.validTo,
    })),
  );

  // --- Finance ledger (Part 08 finance DAG stand-in output) -----------------
  const period = "2025-Q3";
  const priorPeriod = "2025-Q2";
  await db.insert(financeLedgerEntries).values([
    { id: "FL-ITHW-2025Q3", period, category: "purchased_goods_it_hardware", amountUsd: "182000.00", description: "IT hardware procurement, Q3 2025" },
    { id: "FL-PROFSVC-2025Q3", period, category: "purchased_services_professional", amountUsd: "94500.00", description: "Professional services spend, Q3 2025" },
    { id: "FL-ITHW-2025Q2", period: priorPeriod, category: "purchased_goods_it_hardware", amountUsd: "210500.00", description: "IT hardware procurement, Q2 2025" },
    { id: "FL-PROFSVC-2025Q2", period: priorPeriod, category: "purchased_services_professional", amountUsd: "88000.00", description: "Professional services spend, Q2 2025" },
  ]);

  // --- Activities -------------------------------------------------------------
  // Scope 1: diesel fleet (activity-based, uses the NEW diesel factor version v2)
  // Scope 2: electricity, dual reported location + market
  // Scope 3: spend-based (IT hardware, professional services, reconciled to ledger above)
  //          + activity-based (air travel, commuting)
  await db.insert(activities).values([
    {
      id: "ACT-DIESEL-2025Q3",
      scope: "scope1",
      category: "mobile_combustion_diesel",
      region: "UK",
      period,
      quantity: "18500.0000",
      unit: "litre",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-DIESEL-UK-2025-v2",
      gridMethod: null,
      sourceDescription: "Fleet fuel card consolidated volume, Q3 2025",
    },
    {
      id: "ACT-NATGAS-2025Q3",
      scope: "scope1",
      category: "stationary_combustion_natural_gas",
      region: "US",
      period,
      quantity: "9400.0000",
      unit: "therm",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-NATGAS-US-2025-v1",
      gridMethod: null,
      sourceDescription: "Utility meter readings, HQ facility, Q3 2025",
    },
    {
      id: "ACT-ELEC-US-LOC-2025Q3",
      scope: "scope2",
      category: "purchased_electricity",
      region: "US-AVG",
      period,
      quantity: "612000.0000",
      unit: "kWh",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-GRID-US-LOC-2025-v1",
      gridMethod: "location-based",
      sourceDescription: "Smart meter consolidated reading, US offices, Q3 2025",
    },
    {
      id: "ACT-ELEC-US-MKT-2025Q3",
      scope: "scope2",
      category: "purchased_electricity",
      region: "US-AVG",
      period,
      quantity: "612000.0000",
      unit: "kWh",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-GRID-US-MKT-2025-v1",
      gridMethod: "market-based",
      sourceDescription: "Same metered volume, supplier residual-mix factor applied",
    },
    {
      id: "ACT-ELEC-UK-LOC-2025Q3",
      scope: "scope2",
      category: "purchased_electricity",
      region: "UK",
      period,
      quantity: "248000.0000",
      unit: "kWh",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-GRID-UK-LOC-2025-v1",
      gridMethod: "location-based",
      sourceDescription: "Smart meter consolidated reading, UK office, Q3 2025",
    },
    {
      id: "ACT-ELEC-UK-MKT-2025Q3",
      scope: "scope2",
      category: "purchased_electricity",
      region: "UK",
      period,
      quantity: "248000.0000",
      unit: "kWh",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-GRID-UK-MKT-2025-v1",
      gridMethod: "market-based",
      sourceDescription: "Same metered volume, 100% REGO-backed PPA residual factor applied",
    },
    {
      id: "ACT-ITHW-2025Q3",
      scope: "scope3",
      category: "purchased_goods_it_hardware",
      region: "GLOBAL",
      period,
      quantity: "182000.0000",
      unit: "USD",
      method: "spend-based",
      spendAmountUsd: "182000.00",
      financeLedgerRef: "FL-ITHW-2025Q3",
      factorId: "EF-SPEND-ITHARDWARE-2025-v1",
      gridMethod: null,
      sourceDescription: "Procurement system spend extract, IT hardware category, Q3 2025",
    },
    {
      id: "ACT-PROFSVC-2025Q3",
      scope: "scope3",
      category: "purchased_services_professional",
      region: "GLOBAL",
      period,
      quantity: "94500.0000",
      unit: "USD",
      method: "spend-based",
      spendAmountUsd: "94500.00",
      financeLedgerRef: "FL-PROFSVC-2025Q3",
      factorId: "EF-SPEND-PROFSERVICES-2025-v1",
      gridMethod: null,
      sourceDescription: "Procurement system spend extract, professional services category, Q3 2025",
    },
    {
      id: "ACT-AIRTRAVEL-2025Q3",
      scope: "scope3",
      category: "business_travel_air_longhaul",
      region: "GLOBAL",
      period,
      quantity: "412000.0000",
      unit: "passenger_km",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-AIRTRAVEL-LONGHAUL-2025-v1",
      gridMethod: null,
      sourceDescription: "Travel booking system itinerary distances, Q3 2025",
    },
    {
      id: "ACT-COMMUTE-2025Q3",
      scope: "scope3",
      category: "employee_commuting_car",
      region: "GLOBAL",
      period,
      quantity: "890000.0000",
      unit: "passenger_km",
      method: "activity-based",
      spendAmountUsd: null,
      financeLedgerRef: null,
      factorId: "EF-COMMUTE-CAR-2025-v1",
      gridMethod: null,
      sourceDescription: "Annual commuting survey, extrapolated to quarter, Q3 2025",
    },
  ]);

  // --- Prior-period activities (2025-Q2) — enables a genuine two-point trend
  // on the dashboard instead of a fabricated one. Same factor versions apply
  // (both quarters fall under the 2025 factor vintage).
  await db.insert(activities).values([
    { id: "ACT-DIESEL-2025Q2", scope: "scope1", category: "mobile_combustion_diesel", region: "UK", period: priorPeriod, quantity: "19800.0000", unit: "litre", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-DIESEL-UK-2025-v2", gridMethod: null, sourceDescription: "Fleet fuel card consolidated volume, Q2 2025" },
    { id: "ACT-NATGAS-2025Q2", scope: "scope1", category: "stationary_combustion_natural_gas", region: "US", period: priorPeriod, quantity: "10100.0000", unit: "therm", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-NATGAS-US-2025-v1", gridMethod: null, sourceDescription: "Utility meter readings, HQ facility, Q2 2025" },
    { id: "ACT-ELEC-US-LOC-2025Q2", scope: "scope2", category: "purchased_electricity", region: "US-AVG", period: priorPeriod, quantity: "635000.0000", unit: "kWh", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-GRID-US-LOC-2025-v1", gridMethod: "location-based", sourceDescription: "Smart meter consolidated reading, US offices, Q2 2025" },
    { id: "ACT-ELEC-US-MKT-2025Q2", scope: "scope2", category: "purchased_electricity", region: "US-AVG", period: priorPeriod, quantity: "635000.0000", unit: "kWh", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-GRID-US-MKT-2025-v1", gridMethod: "market-based", sourceDescription: "Same metered volume, supplier residual-mix factor applied, Q2 2025" },
    { id: "ACT-ELEC-UK-LOC-2025Q2", scope: "scope2", category: "purchased_electricity", region: "UK", period: priorPeriod, quantity: "251000.0000", unit: "kWh", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-GRID-UK-LOC-2025-v1", gridMethod: "location-based", sourceDescription: "Smart meter consolidated reading, UK office, Q2 2025" },
    { id: "ACT-ELEC-UK-MKT-2025Q2", scope: "scope2", category: "purchased_electricity", region: "UK", period: priorPeriod, quantity: "251000.0000", unit: "kWh", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-GRID-UK-MKT-2025-v1", gridMethod: "market-based", sourceDescription: "Same metered volume, REGO-backed PPA residual factor applied, Q2 2025" },
    { id: "ACT-ITHW-2025Q2", scope: "scope3", category: "purchased_goods_it_hardware", region: "GLOBAL", period: priorPeriod, quantity: "210500.0000", unit: "USD", method: "spend-based", spendAmountUsd: "210500.00", financeLedgerRef: "FL-ITHW-2025Q2", factorId: "EF-SPEND-ITHARDWARE-2025-v1", gridMethod: null, sourceDescription: "Procurement system spend extract, IT hardware category, Q2 2025" },
    { id: "ACT-PROFSVC-2025Q2", scope: "scope3", category: "purchased_services_professional", region: "GLOBAL", period: priorPeriod, quantity: "88000.0000", unit: "USD", method: "spend-based", spendAmountUsd: "88000.00", financeLedgerRef: "FL-PROFSVC-2025Q2", factorId: "EF-SPEND-PROFSERVICES-2025-v1", gridMethod: null, sourceDescription: "Procurement system spend extract, professional services category, Q2 2025" },
    { id: "ACT-AIRTRAVEL-2025Q2", scope: "scope3", category: "business_travel_air_longhaul", region: "GLOBAL", period: priorPeriod, quantity: "455000.0000", unit: "passenger_km", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-AIRTRAVEL-LONGHAUL-2025-v1", gridMethod: null, sourceDescription: "Travel booking system itinerary distances, Q2 2025" },
    { id: "ACT-COMMUTE-2025Q2", scope: "scope3", category: "employee_commuting_car", region: "GLOBAL", period: priorPeriod, quantity: "905000.0000", unit: "passenger_km", method: "activity-based", spendAmountUsd: null, financeLedgerRef: null, factorId: "EF-COMMUTE-CAR-2025-v1", gridMethod: null, sourceDescription: "Annual commuting survey, extrapolated to quarter, Q2 2025" },
  ]);

  // --- Environmental raw metrics ----------------------------------------------
  await db.insert(environmentalMetrics).values([
    { id: "ENV-ENERGY-2025Q3", period, metric: "energy_consumption_kwh", value: "860000.000", unit: "kWh", method: "measured", evidenceClass: "metered-measured", source: "Consolidated smart meter readings, all sites" },
    { id: "ENV-WASTE-2025Q3", period, metric: "waste_generated_kg", value: "41200.000", unit: "kg", method: "activity-based", evidenceClass: "activity-based-estimate", source: "Waste hauler manifest weights, Q3 2025" },
    { id: "ENV-WASTE-DIVERTED-2025Q3", period, metric: "waste_diverted_kg", value: "27400.000", unit: "kg", method: "activity-based", evidenceClass: "activity-based-estimate", source: "Waste hauler manifest weights, diverted/recycled stream, Q3 2025" },
    { id: "ENV-ENERGY-2025Q2", period: priorPeriod, metric: "energy_consumption_kwh", value: "886000.000", unit: "kWh", method: "measured", evidenceClass: "metered-measured", source: "Consolidated smart meter readings, all sites, Q2 2025" },
    { id: "ENV-WASTE-2025Q2", period: priorPeriod, metric: "waste_generated_kg", value: "43900.000", unit: "kg", method: "activity-based", evidenceClass: "activity-based-estimate", source: "Waste hauler manifest weights, Q2 2025" },
  ]);

  // --- Social aggregates (k-anonymity: one record deliberately below threshold) --
  await db.insert(peopleAggregates).values([
    { id: "PPL-SAFETY-ALL-2025Q3", period, metric: "safety_incident_rate", cohort: "all-employees", cohortSize: 410, value: "0.8200", unit: "incidents per 200,000 hrs", evidenceClass: "aggregated-hr-derived", kAnonymityThreshold: 5 },
    { id: "PPL-TRAINING-ALL-2025Q3", period, metric: "training_hours_per_fte", cohort: "all-employees", cohortSize: 410, value: "14.3000", unit: "hours/FTE", evidenceClass: "aggregated-hr-derived", kAnonymityThreshold: 5 },
    { id: "PPL-PAYEQUITY-ALL-2025Q3", period, metric: "pay_equity_ratio", cohort: "all-employees", cohortSize: 410, value: "0.9800", unit: "ratio", evidenceClass: "aggregated-hr-derived", kAnonymityThreshold: 5 },
    // Deliberately small cohort -> must be suppressed, demonstrates honest treatment, not fabrication
    { id: "PPL-PAYEQUITY-EXEC-2025Q3", period, metric: "pay_equity_ratio", cohort: "executive-leadership", cohortSize: 4, value: "0.9100", unit: "ratio", evidenceClass: "aggregated-hr-derived", kAnonymityThreshold: 5 },
  ]);

  // --- Governance decisions -----------------------------------------------------
  await db.insert(governanceDecisions).values([
    { id: "GOV-D1-2025Q3", period, decisionTitle: "Approve FY26 emissions reduction capex", reviewedByBoard: true, hasDocumentedRationale: true, withinSlaDays: true, cadenceDays: 30, decidedAt: "2025-07-14" },
    { id: "GOV-D2-2025Q3", period, decisionTitle: "Renewable PPA renewal (UK)", reviewedByBoard: true, hasDocumentedRationale: true, withinSlaDays: true, cadenceDays: 45, decidedAt: "2025-08-02" },
    { id: "GOV-D3-2025Q3", period, decisionTitle: "Supplier code of conduct update", reviewedByBoard: true, hasDocumentedRationale: false, withinSlaDays: true, cadenceDays: 60, decidedAt: "2025-08-20" },
    { id: "GOV-D4-2025Q3", period, decisionTitle: "Scope 3 data quality remediation plan", reviewedByBoard: false, hasDocumentedRationale: true, withinSlaDays: false, cadenceDays: null, decidedAt: "2025-09-05" },
  ]);

  // --- Targets (OKR-linked, Part 07 stand-in) ------------------------------------
  await db.insert(targets).values([
    {
      id: "TGT-ALLSCOPE-2030",
      name: "Absolute emissions reduction 2030 (all scopes)",
      scope: null,
      category: null,
      baselineYear: 2023,
      baselineValueTco2e: "5200.000",
      targetYear: 2030,
      targetValueTco2e: "2600.000",
      pathway: "linear",
      okrRef: "OKR-CLIMATE-2030",
    },
    {
      id: "TGT-SCOPE3-2030",
      name: "Scope 3 intensity reduction 2030 (SBTi-style pathway)",
      scope: "scope3",
      category: null,
      baselineYear: 2023,
      baselineValueTco2e: "2800.000",
      targetYear: 2030,
      targetValueTco2e: "1680.000",
      pathway: "geometric",
      okrRef: "OKR-CLIMATE-SCOPE3-2030",
    },
  ]);

  // --- Abatement initiatives / MACC (Part 07 portfolio link) ---------------------
  await db.insert(abatementInitiatives).values([
    { id: "ABT-LED-RETROFIT", name: "LED lighting retrofit, all sites", scope: "scope2", category: "purchased_electricity", annualAbatementTco2e: "38.500", annualNetCostUsd: "-12000.00", implementationStatus: "approved", portfolioRef: "PORT-07-LED", evidenceClass: "activity-based-estimate" },
    { id: "ABT-FLEET-EV", name: "Fleet electrification phase 1", scope: "scope1", category: "mobile_combustion_diesel", annualAbatementTco2e: "210.000", annualNetCostUsd: "95000.00", implementationStatus: "proposed", portfolioRef: "PORT-07-FLEETEV", evidenceClass: "activity-based-estimate" },
    { id: "ABT-RENEWABLE-PPA", name: "Renewable PPA expansion (US)", scope: "scope2", category: "purchased_electricity", annualAbatementTco2e: "165.000", annualNetCostUsd: "-4000.00", implementationStatus: "in-progress", portfolioRef: "PORT-07-PPA", evidenceClass: "activity-based-estimate" },
    { id: "ABT-SUPPLIER-ENGAGEMENT", name: "Supplier engagement program (IT hardware)", scope: "scope3", category: "purchased_goods_it_hardware", annualAbatementTco2e: "95.000", annualNetCostUsd: "40000.00", implementationStatus: "proposed", portfolioRef: "PORT-07-SUPPLIER", evidenceClass: "spend-based-estimate" },
    { id: "ABT-TRAVEL-POLICY", name: "Business travel substitution policy", scope: "scope3", category: "business_travel_air_longhaul", annualAbatementTco2e: "54.000", annualNetCostUsd: "-9000.00", implementationStatus: "approved", portfolioRef: "PORT-07-TRAVEL", evidenceClass: "activity-based-estimate" },
  ]);

  // --- Obligations (Part 29 obligation tracker stand-in) --------------------------
  await db.insert(obligations).values([
    { id: "OBL-CSRD-E1-2025", name: "CSRD ESRS E1 Climate disclosure", standard: "CSRD-style", dueDate: "2026-03-31", status: "open", linkedPackId: null },
    { id: "OBL-GRI-2025", name: "GRI annual sustainability report", standard: "GRI", dueDate: "2026-04-30", status: "open", linkedPackId: null },
    { id: "OBL-SASB-2025", name: "SASB sector disclosure", standard: "SASB", dueDate: "2025-11-15", status: "open", linkedPackId: null },
  ]);

  console.log("ESG seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
