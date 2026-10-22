// ---------------------------------------------------------------------------
// src/lib/esgSurfaces.ts
//
// Server-side view-model builders shared by the ESG API routes and pages:
// Dashboard, Carbon Ledger, Disclosure Studio, Reduction Portfolio. Keeps
// page/route components thin and ensures every surface runs the same
// evidence-class lint before rendering a figure.
// ---------------------------------------------------------------------------
import {
  loadFactors,
  loadActivities,
  loadFinanceLedger,
  loadSpendActivities,
  loadEnvironmentalMetrics,
  loadPeopleAggregates,
  loadGovernanceDecisions,
  loadTargets,
  loadAbatementInitiatives,
  loadObligations,
} from "./esgData";
import { reconcileActivityToFinance, ReconciliationRow } from "./costModel";
import {
  computeCarbonLedger,
  aggregateScopeTotals,
  ScopeTotals,
  ActivityEmission,
  projectSocialMetrics,
  computeGovernanceMetrics,
  computeTrajectory,
  computeTargetVariance,
  buildDisclosurePack,
  disclosureFiguresToSurfaceFigures,
  DisclosurePackContent,
  TargetRecord,
  STANDARD_MAPPING,
} from "./sustainability";
import { buildMacc, MaccCurve } from "./macc";
import { lintEvidence, EvidenceLintViolation } from "./evidence";
import { projectObligations, ObligationView } from "./obligationTracker";

export interface DashboardData {
  periods: string[];
  currentPeriod: string;
  scopeTotalsByPeriod: Record<string, ScopeTotals>;
  environmental: { energy: number | null; waste: number | null; wasteDiverted: number | null };
  social: ReturnType<typeof projectSocialMetrics>;
  governance: ReturnType<typeof computeGovernanceMetrics>;
  targets: { target: TargetRecord; trajectory: ReturnType<typeof computeTrajectory>; variance: ReturnType<typeof computeTargetVariance> }[];
  lintViolations: EvidenceLintViolation[];
  obligations: ObligationView[];
}

export async function buildDashboardData(): Promise<DashboardData> {
  const [factors, acts, envMetrics, peopleAgg, govDecisions, targetRows, obligationRows] = await Promise.all([
    loadFactors(),
    loadActivities(),
    loadEnvironmentalMetrics(),
    loadPeopleAggregates(),
    loadGovernanceDecisions(),
    loadTargets(),
    loadObligations(),
  ]);

  const periods = Array.from(new Set(acts.map((a) => a.period))).sort();
  const currentPeriod = periods[periods.length - 1];

  const scopeTotalsByPeriod: Record<string, ScopeTotals> = {};
  for (const period of periods) {
    const periodActivities = acts.filter((a) => a.period === period);
    const { ledger } = computeCarbonLedger(periodActivities, factors);
    scopeTotalsByPeriod[period] = aggregateScopeTotals(ledger, period);
  }

  const currentEnv = envMetrics.filter((e) => e.period === currentPeriod);
  const social = projectSocialMetrics(peopleAgg.filter((p) => p.period === currentPeriod));
  const governance = computeGovernanceMetrics(
    govDecisions.filter((g) => g.period === currentPeriod),
    currentPeriod,
  );

  const actualsByYear = new Map<number, number>();
  for (const period of periods) {
    const year = Number(period.split("-")[0]);
    const value = scopeTotalsByPeriod[period].grandTotalLocationBased.value;
    actualsByYear.set(year, (actualsByYear.get(year) ?? 0) + value);
  }
  const actuals = Array.from(actualsByYear.entries()).map(([year, actualTco2e]) => ({ year, actualTco2e }));

  const targetsView = targetRows.map((t) => ({
    target: t,
    trajectory: computeTrajectory(t),
    variance: computeTargetVariance(t, actuals),
  }));

  const { ledger: fullLedger } = computeCarbonLedger(acts.filter((a) => a.period === currentPeriod), factors);
  const pack = buildDisclosurePack(
    {
      period: currentPeriod,
      standard: "internal-dashboard",
      scopeTotals: scopeTotalsByPeriod[currentPeriod],
      environmental: currentEnv,
      social,
      governance,
    },
    new Date().toISOString(),
  );
  const lintViolations = lintEvidence(disclosureFiguresToSurfaceFigures(pack.figures));

  return {
    periods,
    currentPeriod,
    scopeTotalsByPeriod,
    environmental: {
      energy: currentEnv.find((e) => e.metric === "energy_consumption_kwh")?.value ?? null,
      waste: currentEnv.find((e) => e.metric === "waste_generated_kg")?.value ?? null,
      wasteDiverted: currentEnv.find((e) => e.metric === "waste_diverted_kg")?.value ?? null,
    },
    social,
    governance,
    targets: targetsView,
    lintViolations,
    obligations: projectObligations(obligationRows),
  };
}

export interface CarbonLedgerData {
  ledger: ActivityEmission[];
  unresolvedActivities: ReturnType<typeof computeCarbonLedger>["unresolvedActivities"];
  reconciliation: ReconciliationRow[];
  scopeTotals: ScopeTotals;
  period: string;
}

export async function buildCarbonLedgerData(period?: string): Promise<CarbonLedgerData> {
  const [factors, acts, ledgerEntries, spendActs] = await Promise.all([
    loadFactors(),
    loadActivities(),
    loadFinanceLedger(),
    loadSpendActivities(),
  ]);
  const periods = Array.from(new Set(acts.map((a) => a.period))).sort();
  const targetPeriod = period ?? periods[periods.length - 1];
  const periodActivities = acts.filter((a) => a.period === targetPeriod);
  const { ledger, unresolvedActivities } = computeCarbonLedger(periodActivities, factors);
  const scopeTotals = aggregateScopeTotals(ledger, targetPeriod);
  const reconciliation = reconcileActivityToFinance(
    spendActs.filter((a) => a.period === targetPeriod),
    ledgerEntries.filter((l) => l.period === targetPeriod),
    0.01,
  );
  return { ledger, unresolvedActivities, reconciliation, scopeTotals, period: targetPeriod };
}

export async function buildMaccData(): Promise<MaccCurve> {
  const initiatives = await loadAbatementInitiatives();
  return buildMacc(initiatives);
}

export async function buildDisclosurePreview(period?: string): Promise<DisclosurePackContent> {
  const [factors, acts, envMetrics, peopleAgg, govDecisions] = await Promise.all([
    loadFactors(),
    loadActivities(),
    loadEnvironmentalMetrics(),
    loadPeopleAggregates(),
    loadGovernanceDecisions(),
  ]);
  const periods = Array.from(new Set(acts.map((a) => a.period))).sort();
  const targetPeriod = period ?? periods[periods.length - 1];
  const periodActivities = acts.filter((a) => a.period === targetPeriod);
  const { ledger } = computeCarbonLedger(periodActivities, factors);
  const scopeTotals = aggregateScopeTotals(ledger, targetPeriod);
  const social = projectSocialMetrics(peopleAgg.filter((p) => p.period === targetPeriod));
  const governance = computeGovernanceMetrics(
    govDecisions.filter((g) => g.period === targetPeriod),
    targetPeriod,
  );
  return buildDisclosurePack(
    {
      period: targetPeriod,
      standard: "GRI/SASB/CSRD-style (documented mapping, not certified)",
      scopeTotals,
      environmental: envMetrics.filter((e) => e.period === targetPeriod),
      social,
      governance,
    },
    new Date().toISOString(),
  );
}

export { STANDARD_MAPPING };
