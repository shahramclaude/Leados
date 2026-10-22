// ---------------------------------------------------------------------------
// src/lib/emissionFactors.ts
//
// Factor library: versioned, sourced emission factors with an evidence class
// per factor. Includes both activity-based (physical unit) and spend-based
// (EEIO-style, $/unit) factors, and dual location-based/market-based grid
// factors for scope 2 per the GHG Protocol Scope 2 Guidance dual-reporting
// requirement.
//
// NOTE ON SOURCING: factor values below are illustrative, modelled on the
// order of magnitude and structure of publicly documented factor sets
// (UK DEFRA/BEIS GHG Conversion Factors, US EPA eGRID, EPA EEIO spend-based
// factors). They are NOT pulled live from those publications in this
// sandbox — `source` / `sourceUrl` document provenance so a real deployment
// swaps in the authoritative published values without changing the schema
// or calculation chain. This is called out explicitly rather than presented
// as certified official data (HONESTY RULES).
// ---------------------------------------------------------------------------
import { EvidenceClass, Method } from "./evidence";

export interface EmissionFactorRow {
  id: string;
  version: number;
  supersedes: string | null;
  scope: "scope1" | "scope2" | "scope3";
  category: string;
  region: string;
  unit: string;
  gridMethod: "location-based" | "market-based" | null;
  factorValue: number; // kgCO2e per unit (or per USD for spend-based)
  method: Method;
  evidenceClass: EvidenceClass;
  uncertaintyPct: number;
  source: string;
  sourceUrl: string | null;
  validFrom: string; // ISO date
  validTo: string | null;
}

export const FACTOR_LIBRARY_SEED: EmissionFactorRow[] = [
  // Scope 1 — stationary & mobile combustion (activity-based)
  {
    id: "EF-DIESEL-UK-2024-v1",
    version: 1,
    supersedes: null,
    scope: "scope1",
    category: "mobile_combustion_diesel",
    region: "UK",
    unit: "litre",
    gridMethod: null,
    factorValue: 2.68779,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.05,
    source: "Modelled on UK Government GHG Conversion Factors for Company Reporting (diesel, average biofuel blend)",
    sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    validFrom: "2024-01-01",
    validTo: "2024-12-31",
  },
  {
    id: "EF-DIESEL-UK-2025-v2",
    version: 2,
    supersedes: "EF-DIESEL-UK-2024-v1",
    scope: "scope1",
    category: "mobile_combustion_diesel",
    region: "UK",
    unit: "litre",
    gridMethod: null,
    factorValue: 2.70553,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.05,
    source: "Modelled on UK Government GHG Conversion Factors for Company Reporting 2025 refresh",
    sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-NATGAS-US-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope1",
    category: "stationary_combustion_natural_gas",
    region: "US",
    unit: "therm",
    gridMethod: null,
    factorValue: 5.311,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.05,
    source: "Modelled on US EPA GHG Emission Factors Hub (natural gas, stationary combustion)",
    sourceUrl: "https://www.epa.gov/climateleadership/ghg-emission-factors-hub",
    validFrom: "2025-01-01",
    validTo: null,
  },
  // Scope 2 — purchased electricity, dual reported
  {
    id: "EF-GRID-US-LOC-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope2",
    category: "purchased_electricity",
    region: "US-AVG",
    unit: "kWh",
    gridMethod: "location-based",
    factorValue: 0.369,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.08,
    source: "Modelled on US EPA eGRID national average grid emission factor",
    sourceUrl: "https://www.epa.gov/egrid",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-GRID-US-MKT-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope2",
    category: "purchased_electricity",
    region: "US-AVG",
    unit: "kWh",
    gridMethod: "market-based",
    factorValue: 0.21,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.12,
    source: "Modelled on supplier-specific residual-mix / PPA-adjusted factor (GHG Protocol Scope 2 Guidance market-based method)",
    sourceUrl: "https://ghgprotocol.org/scope_2_guidance",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-GRID-UK-LOC-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope2",
    category: "purchased_electricity",
    region: "UK",
    unit: "kWh",
    gridMethod: "location-based",
    factorValue: 0.207,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.08,
    source: "Modelled on UK Government GHG Conversion Factors (UK electricity, generation average)",
    sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-GRID-UK-MKT-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope2",
    category: "purchased_electricity",
    region: "UK",
    unit: "kWh",
    gridMethod: "market-based",
    factorValue: 0.0,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.1,
    source: "Modelled on 100% renewable-backed REGO certificates for contracted supply (market-based residual)",
    sourceUrl: "https://ghgprotocol.org/scope_2_guidance",
    validFrom: "2025-01-01",
    validTo: null,
  },
  // Scope 3 — spend-based (lower confidence) and activity-based categories
  {
    id: "EF-SPEND-ITHARDWARE-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope3",
    category: "purchased_goods_it_hardware",
    region: "GLOBAL",
    unit: "USD",
    gridMethod: null,
    factorValue: 0.38,
    method: "spend-based",
    evidenceClass: "spend-based-estimate",
    uncertaintyPct: 0.45,
    source: "Modelled on EEIO-style spend-based factor set (US EPA Supply Chain GHG Emission Factors, computer & electronics manufacturing sector)",
    sourceUrl: "https://www.epa.gov/cgi/supply-chain-ghg-emission-factors",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-SPEND-PROFSERVICES-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope3",
    category: "purchased_services_professional",
    region: "GLOBAL",
    unit: "USD",
    gridMethod: null,
    factorValue: 0.09,
    method: "spend-based",
    evidenceClass: "spend-based-estimate",
    uncertaintyPct: 0.5,
    source: "Modelled on EEIO-style spend-based factor set, professional/admin services sector",
    sourceUrl: "https://www.epa.gov/cgi/supply-chain-ghg-emission-factors",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-AIRTRAVEL-LONGHAUL-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope3",
    category: "business_travel_air_longhaul",
    region: "GLOBAL",
    unit: "passenger_km",
    gridMethod: null,
    factorValue: 0.148,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.15,
    source: "Modelled on UK Government GHG Conversion Factors (long-haul economy class, incl. radiative forcing)",
    sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    validFrom: "2025-01-01",
    validTo: null,
  },
  {
    id: "EF-COMMUTE-CAR-2025-v1",
    version: 1,
    supersedes: null,
    scope: "scope3",
    category: "employee_commuting_car",
    region: "GLOBAL",
    unit: "passenger_km",
    gridMethod: null,
    factorValue: 0.171,
    method: "activity-based",
    evidenceClass: "activity-based-estimate",
    uncertaintyPct: 0.2,
    source: "Modelled on UK Government GHG Conversion Factors (average petrol/diesel car, commuting survey basis)",
    sourceUrl: "https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting",
    validFrom: "2025-01-01",
    validTo: null,
  },
];

/** Find the latest valid factor version for a scope/category/region/gridMethod as of a date. */
export function getActiveFactor(
  factors: EmissionFactorRow[],
  scope: string,
  category: string,
  region: string,
  asOf: string,
  gridMethod: string | null = null,
): EmissionFactorRow | null {
  const candidates = factors.filter(
    (f) =>
      f.scope === scope &&
      f.category === category &&
      f.region === region &&
      (f.gridMethod ?? null) === gridMethod &&
      f.validFrom <= asOf &&
      (f.validTo === null || f.validTo >= asOf),
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.version - a.version)[0];
}

export interface FactorDiffRow {
  activityId: string;
  oldFactorId: string;
  newFactorId: string;
  oldEmissionKg: number;
  newEmissionKg: number;
  deltaKg: number;
  deltaPct: number;
}

/**
 * Factor versioning test support: given a set of activities that used
 * `oldFactor`, recompute with `newFactor` and return an explicit diff per
 * activity — this is the mechanism that guarantees "factor update produces
 * diffed recalculations (no silent number changes)".
 */
export function diffFactorVersions(
  activities: { id: string; quantity: number }[],
  oldFactor: EmissionFactorRow,
  newFactor: EmissionFactorRow,
): FactorDiffRow[] {
  return activities.map((a) => {
    const oldEmissionKg = a.quantity * oldFactor.factorValue;
    const newEmissionKg = a.quantity * newFactor.factorValue;
    const deltaKg = newEmissionKg - oldEmissionKg;
    return {
      activityId: a.id,
      oldFactorId: oldFactor.id,
      newFactorId: newFactor.id,
      oldEmissionKg,
      newEmissionKg,
      deltaKg,
      deltaPct: oldEmissionKg !== 0 ? deltaKg / oldEmissionKg : newEmissionKg === 0 ? 0 : 1,
    };
  });
}
