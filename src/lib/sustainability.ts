// ---------------------------------------------------------------------------
// src/lib/sustainability.ts
//
// Part 36 — Sustainability Intelligence core.
//
// Orchestrates:
//  (1) Carbon accounting (scopes 1/2/3, activity + spend based, dual
//      location/market scope 2) on the shared calculation DAG (financeDag.ts)
//  (2) ESG metrics framework (environmental / social / governance) with a
//      documented standard-mapping table (GRI / SASB / CSRD-style tags)
//  (3) Targets & trajectories (linear / geometric pathways + variance
//      decomposition reused from the finance decomposition identity)
//  (4) Disclosure/reporting engine (period packs with lineage + explicit gaps)
//
// This module is intentionally pure (no DB imports) so it can be unit tested
// directly; src/lib/esgData.ts is the data-access layer that loads rows from
// Postgres and maps them into the plain types used here.
// ---------------------------------------------------------------------------
import { Explain, combineExplain, explain, EvidenceClass, SurfaceFigure } from "./evidence";
import { DagNode, runDag, decomposeTwoFactor, DecompositionResult } from "./financeDag";
import { EmissionFactorRow, getActiveFactor } from "./emissionFactors";
import { buildLineageManifest, LineageNode, LineageManifest } from "./lineage";

// ---------------------------------------------------------------------------
// Standard mapping table — documented mapping only, NOT a certification or
// assurance claim. Every ESG metric key used on a surface must appear here.
// ---------------------------------------------------------------------------
export interface StandardMappingEntry {
  metricKey: string;
  pillar: "environmental" | "social" | "governance";
  definition: string;
  gri?: string;
  sasb?: string;
  csrd?: string;
  note?: string;
}

export const STANDARD_MAPPING: StandardMappingEntry[] = [
  {
    metricKey: "scope1_emissions",
    pillar: "environmental",
    definition: "Direct GHG emissions from owned/controlled sources (tCO2e)",
    gri: "GRI 305-1",
    csrd: "ESRS E1-6",
  },
  {
    metricKey: "scope2_emissions_location",
    pillar: "environmental",
    definition: "Indirect emissions from purchased energy, grid-average (location-based) method (tCO2e)",
    gri: "GRI 305-2 (location-based)",
    csrd: "ESRS E1-6",
  },
  {
    metricKey: "scope2_emissions_market",
    pillar: "environmental",
    definition: "Indirect emissions from purchased energy, contractual-instrument (market-based) method (tCO2e)",
    gri: "GRI 305-2 (market-based)",
    csrd: "ESRS E1-6",
  },
  {
    metricKey: "scope3_emissions",
    pillar: "environmental",
    definition: "Value-chain emissions across purchased goods/services, travel, and commuting categories (tCO2e)",
    gri: "GRI 305-3",
    csrd: "ESRS E1-6",
    note: "Materially driven by spend-based estimates — see evidence class per category before treating as precise.",
  },
  {
    metricKey: "energy_consumption",
    pillar: "environmental",
    definition: "Total purchased energy consumption (kWh)",
    gri: "GRI 302-1",
    csrd: "ESRS E1-5",
  },
  {
    metricKey: "waste_generated",
    pillar: "environmental",
    definition: "Total waste generated (kg)",
    gri: "GRI 306-3",
    csrd: "ESRS E5-5",
  },
  {
    metricKey: "safety_incident_rate",
    pillar: "social",
    definition: "Aggregate recordable safety incident rate per cohort (k-anonymized, k>=5)",
    gri: "GRI 403-9",
    csrd: "ESRS S1-14",
    note: "Suppressed below k-anonymity threshold; never backfilled or estimated.",
  },
  {
    metricKey: "training_hours_per_fte",
    pillar: "social",
    definition: "Aggregate average development/training hours per FTE per cohort (k-anonymized)",
    gri: "GRI 404-1",
    csrd: "ESRS S1-13",
  },
  {
    metricKey: "pay_equity_ratio",
    pillar: "social",
    definition: "Aggregate pay equity ratio per cohort (k-anonymized)",
    gri: "GRI 405-2",
    csrd: "ESRS S1-16",
    note: "Ratio only, no individual-level data ever surfaced; vanity-metric risk — see honesty treatment in self-review.",
  },
  {
    metricKey: "board_oversight_cadence",
    pillar: "governance",
    definition: "Median days between recorded board/decision-body reviews of sustainability matters",
    gri: "GRI 2-12",
    csrd: "ESRS G1 / GRI 2-9",
  },
  {
    metricKey: "decision_quality_score",
    pillar: "governance",
    definition: "Share of logged decisions with documented rationale, reviewed on time",
    csrd: "ESRS G1 (supports qualitative disclosure, not an audited KPI)",
    note: "Internal governance KPI — not a third-party-assured figure.",
  },
];

// ---------------------------------------------------------------------------
// Carbon accounting
// ---------------------------------------------------------------------------
export interface ActivityRecord {
  id: string;
  scope: "scope1" | "scope2" | "scope3";
  category: string;
  region: string;
  period: string;
  quantity: number;
  unit: string;
  method: "measured" | "activity-based" | "spend-based" | "derived" | "assumed";
  spendAmountUsd: number | null;
  financeLedgerRef: string | null;
  factorId: string;
  gridMethod: "location-based" | "market-based" | null;
  sourceDescription: string;
}

export interface ActivityEmission {
  activity: ActivityRecord;
  factor: EmissionFactorRow;
  emissionTco2e: Explain<number>;
}

/** Compute a single activity's emission (kg -> tCO2e) as an Explain<number>, tracing to activity + factor ids. */
export function computeActivityEmission(activity: ActivityRecord, factor: EmissionFactorRow): ActivityEmission {
  const kg = activity.quantity * factor.factorValue;
  const tco2e = kg / 1000;
  const emission = explain(tco2e, factor.method, factor.evidenceClass, [activity.id, factor.id], activity.period, {
    uncertaintyPct: factor.uncertaintyPct,
    notes:
      factor.method === "spend-based"
        ? "Spend-based estimate: derived from $ spend, not physical activity. Lower precision — use for screening/trend only."
        : undefined,
  });
  return { activity, factor, emissionTco2e: emission };
}

/** Build and run the carbon calculation DAG for a set of activities against the active factor library. */
export function computeCarbonLedger(
  activities: ActivityRecord[],
  factors: EmissionFactorRow[],
): { ledger: ActivityEmission[]; unresolvedActivities: ActivityRecord[] } {
  const ledger: ActivityEmission[] = [];
  const unresolvedActivities: ActivityRecord[] = [];

  for (const activity of activities) {
    const factor =
      factors.find((f) => f.id === activity.factorId) ??
      getActiveFactor(factors, activity.scope, activity.category, activity.region, activity.period, activity.gridMethod);
    if (!factor) {
      unresolvedActivities.push(activity);
      continue;
    }
    ledger.push(computeActivityEmission(activity, factor));
  }
  return { ledger, unresolvedActivities };
}

export interface ScopeTotals {
  scope1: Explain<number>;
  scope2Location: Explain<number>;
  scope2Market: Explain<number>;
  scope3: Explain<number>;
  grandTotalLocationBased: Explain<number>;
  grandTotalMarketBased: Explain<number>;
}

/**
 * Aggregate the carbon ledger into GHG Protocol scope totals using the
 * shared DAG engine (reused from the finance model, not forked): each scope
 * total is a DAG node whose inputs are the per-activity Explain<number>
 * "leaf" values, combined with combineExplain for honest uncertainty +
 * quality-mix propagation.
 */
export function aggregateScopeTotals(ledger: ActivityEmission[], period: string): ScopeTotals {
  const leaves: Record<string, Explain<number>> = {};
  for (const row of ledger) {
    leaves[`leaf:${row.activity.id}`] = row.emissionTco2e;
  }

  const scope1Ids = ledger.filter((r) => r.activity.scope === "scope1").map((r) => `leaf:${r.activity.id}`);
  const scope2LocIds = ledger
    .filter((r) => r.activity.scope === "scope2" && r.activity.gridMethod === "location-based")
    .map((r) => `leaf:${r.activity.id}`);
  const scope2MktIds = ledger
    .filter((r) => r.activity.scope === "scope2" && r.activity.gridMethod === "market-based")
    .map((r) => `leaf:${r.activity.id}`);
  const scope3Ids = ledger.filter((r) => r.activity.scope === "scope3").map((r) => `leaf:${r.activity.id}`);

  const nodes: DagNode[] = [
    ...Object.keys(leaves).map((id) => ({ id, deps: [], compute: () => leaves[id] })),
    { id: "scope1", deps: scope1Ids, compute: (inp) => combineExplain(scope1Ids.map((id) => inp[id]), period) },
    { id: "scope2Location", deps: scope2LocIds, compute: (inp) => combineExplain(scope2LocIds.map((id) => inp[id]), period) },
    { id: "scope2Market", deps: scope2MktIds, compute: (inp) => combineExplain(scope2MktIds.map((id) => inp[id]), period) },
    { id: "scope3", deps: scope3Ids, compute: (inp) => combineExplain(scope3Ids.map((id) => inp[id]), period) },
    {
      id: "grandTotalLocationBased",
      deps: ["scope1", "scope2Location", "scope3"],
      compute: (inp) => combineExplain([inp.scope1, inp.scope2Location, inp.scope3], period, "Scope 1 + Scope 2 (location-based) + Scope 3"),
    },
    {
      id: "grandTotalMarketBased",
      deps: ["scope1", "scope2Market", "scope3"],
      compute: (inp) => combineExplain([inp.scope1, inp.scope2Market, inp.scope3], period, "Scope 1 + Scope 2 (market-based) + Scope 3"),
    },
  ];

  const results = runDag(nodes);
  return {
    scope1: results.get("scope1")!,
    scope2Location: results.get("scope2Location")!,
    scope2Market: results.get("scope2Market")!,
    scope3: results.get("scope3")!,
    grandTotalLocationBased: results.get("grandTotalLocationBased")!,
    grandTotalMarketBased: results.get("grandTotalMarketBased")!,
  };
}

// ---------------------------------------------------------------------------
// Targets & trajectories
// ---------------------------------------------------------------------------
export interface TargetRecord {
  id: string;
  name: string;
  scope: string | null;
  category: string | null;
  baselineYear: number;
  baselineValueTco2e: number;
  targetYear: number;
  targetValueTco2e: number;
  pathway: "linear" | "geometric";
  okrRef: string | null;
}

export interface TrajectoryPoint {
  year: number;
  expectedTco2e: number;
}

/** Linear or geometric (SBTi-style constant % reduction) pathway from baseline to target year. */
export function computeTrajectory(target: TargetRecord): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];
  const span = target.targetYear - target.baselineYear;
  if (span <= 0) return [{ year: target.baselineYear, expectedTco2e: target.baselineValueTco2e }];

  if (target.pathway === "linear") {
    const perYear = (target.baselineValueTco2e - target.targetValueTco2e) / span;
    for (let y = target.baselineYear; y <= target.targetYear; y++) {
      points.push({ year: y, expectedTco2e: target.baselineValueTco2e - perYear * (y - target.baselineYear) });
    }
  } else {
    const ratio = target.baselineValueTco2e !== 0 ? target.targetValueTco2e / target.baselineValueTco2e : 0;
    const annualRate = 1 - Math.pow(Math.max(ratio, 0), 1 / span);
    for (let y = target.baselineYear; y <= target.targetYear; y++) {
      points.push({
        year: y,
        expectedTco2e: target.baselineValueTco2e * Math.pow(1 - annualRate, y - target.baselineYear),
      });
    }
  }
  return points;
}

export interface TargetVariance {
  year: number;
  actualTco2e: number;
  expectedTco2e: number;
  varianceTco2e: number;
  variancePct: number;
  onTrack: boolean;
}

export function computeTargetVariance(target: TargetRecord, actuals: { year: number; actualTco2e: number }[]): TargetVariance[] {
  const trajectory = computeTrajectory(target);
  const expectedByYear = new Map(trajectory.map((p) => [p.year, p.expectedTco2e]));
  return actuals
    .filter((a) => expectedByYear.has(a.year))
    .map((a) => {
      const expectedTco2e = expectedByYear.get(a.year)!;
      const varianceTco2e = a.actualTco2e - expectedTco2e;
      return {
        year: a.year,
        actualTco2e: a.actualTco2e,
        expectedTco2e,
        varianceTco2e,
        variancePct: expectedTco2e !== 0 ? varianceTco2e / expectedTco2e : 0,
        onTrack: varianceTco2e <= 0,
      };
    });
}

/** Re-exported for surfaces that want the raw finance-style decomposition (e.g. volume vs. factor effect per category). */
export function decomposeEmissionVariance(
  baseline: { qty: number; rate: number },
  current: { qty: number; rate: number },
): DecompositionResult {
  return decomposeTwoFactor(baseline, current);
}

// ---------------------------------------------------------------------------
// Social metrics (k-anonymity enforced)
// ---------------------------------------------------------------------------
export interface PeopleAggregateRecord {
  id: string;
  period: string;
  metric: string;
  cohort: string;
  cohortSize: number;
  value: number;
  unit: string;
  evidenceClass: EvidenceClass;
  kAnonymityThreshold: number;
}

export interface SocialMetricView {
  metric: string;
  cohort: string;
  period: string;
  suppressed: boolean;
  reason?: string;
  explain?: Explain<number>;
}

/**
 * Aggregate-only people metrics: if the cohort is below the k-anonymity
 * threshold, the metric is suppressed with an explicit reason rather than
 * shown with a vague caveat or silently rounded — this is the honest
 * treatment of a metric class that is easy to turn into a vanity number.
 */
export function projectSocialMetrics(records: PeopleAggregateRecord[]): SocialMetricView[] {
  return records.map((r) => {
    if (r.cohortSize < r.kAnonymityThreshold) {
      return {
        metric: r.metric,
        cohort: r.cohort,
        period: r.period,
        suppressed: true,
        reason: `Cohort size ${r.cohortSize} is below the k-anonymity threshold (${r.kAnonymityThreshold}); suppressed to protect individual privacy.`,
      };
    }
    return {
      metric: r.metric,
      cohort: r.cohort,
      period: r.period,
      suppressed: false,
      explain: explain(r.value, "derived", r.evidenceClass, [r.id], r.period, {
        notes: `Aggregated over ${r.cohortSize} people (k-anonymity threshold ${r.kAnonymityThreshold}).`,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// Governance metrics
// ---------------------------------------------------------------------------
export interface GovernanceDecisionRecord {
  id: string;
  period: string;
  decisionTitle: string;
  reviewedByBoard: boolean;
  hasDocumentedRationale: boolean;
  withinSlaDays: boolean;
  cadenceDays: number | null;
}

export interface GovernanceMetrics {
  decisionQualityScore: Explain<number>; // 0..1
  oversightCadenceDays: Explain<number>;
}

export function computeGovernanceMetrics(records: GovernanceDecisionRecord[], period: string): GovernanceMetrics {
  if (records.length === 0) {
    return {
      decisionQualityScore: explain(0, "assumed", "assumed-placeholder", [], period, {
        notes: "No governance decisions logged for this period.",
      }),
      oversightCadenceDays: explain(0, "assumed", "assumed-placeholder", [], period, {
        notes: "No governance decisions logged for this period.",
      }),
    };
  }
  const qualifying = records.filter((r) => r.reviewedByBoard && r.hasDocumentedRationale && r.withinSlaDays);
  const score = qualifying.length / records.length;
  const cadences = records.map((r) => r.cadenceDays).filter((c): c is number => c !== null);
  const medianCadence = cadences.length ? [...cadences].sort((a, b) => a - b)[Math.floor(cadences.length / 2)] : 0;

  return {
    decisionQualityScore: explain(score, "derived", "governance-log-derived", records.map((r) => r.id), period, {
      notes: `${qualifying.length} of ${records.length} logged decisions met review+rationale+SLA criteria. Internal KPI, not third-party assured.`,
    }),
    oversightCadenceDays: explain(medianCadence, "derived", "governance-log-derived", records.map((r) => r.id), period, {
      notes: "Median days between logged board/decision-body reviews.",
    }),
  };
}

// ---------------------------------------------------------------------------
// Environmental raw metrics (energy, waste)
// ---------------------------------------------------------------------------
export interface EnvironmentalMetricRecord {
  id: string;
  period: string;
  metric: string;
  value: number;
  unit: string;
  method: "measured" | "activity-based" | "spend-based" | "derived" | "assumed";
  evidenceClass: EvidenceClass;
  source: string;
}

export function toExplainEnvironmental(record: EnvironmentalMetricRecord): Explain<number> {
  return explain(record.value, record.method, record.evidenceClass, [record.id], record.period, {
    notes: record.source,
  });
}

// ---------------------------------------------------------------------------
// Disclosure / reporting engine
// ---------------------------------------------------------------------------
export interface DisclosureFigure {
  metricKey: string;
  label: string;
  pillar: "environmental" | "social" | "governance";
  standardMapping: StandardMappingEntry | null;
  explain: Explain<number> | null;
  gap: string | null;
}

export interface DisclosurePackContent {
  period: string;
  standard: string;
  generatedAt: string;
  figures: DisclosureFigure[];
  gaps: { metricKey: string; reason: string }[];
  lineageManifest: LineageManifest;
}

export interface DisclosureInputs {
  period: string;
  standard: string;
  scopeTotals: ScopeTotals | null;
  environmental: EnvironmentalMetricRecord[];
  social: SocialMetricView[];
  governance: GovernanceMetrics | null;
}

/**
 * Build a disclosure pack for a period: every required line item from the
 * standard mapping table is either populated with an Explain<number> + a
 * lineage node, or explicitly listed as a gap ("no data for this period")
 * — the pack never fabricates a figure to fill a gap.
 */
export function buildDisclosurePack(inputs: DisclosureInputs, generatedAt: string): DisclosurePackContent {
  const figures: DisclosureFigure[] = [];
  const gaps: { metricKey: string; reason: string }[] = [];
  const lineageNodes: LineageNode[] = [];

  function addFigure(metricKey: string, label: string, ex: Explain<number> | null, missingReason?: string) {
    const mapping = STANDARD_MAPPING.find((m) => m.metricKey === metricKey) ?? null;
    if (!ex) {
      gaps.push({ metricKey, reason: missingReason ?? "No data available for this period." });
      figures.push({ metricKey, label, pillar: mapping?.pillar ?? "environmental", standardMapping: mapping, explain: null, gap: missingReason ?? "No data available for this period." });
      return;
    }
    figures.push({ metricKey, label, pillar: mapping?.pillar ?? "environmental", standardMapping: mapping, explain: ex, gap: null });
    lineageNodes.push({
      id: `metric:${metricKey}:${inputs.period}`,
      kind: "metric",
      label,
      refs: ex.sources,
    });
  }

  addFigure("scope1_emissions", "Scope 1 emissions (tCO2e)", inputs.scopeTotals?.scope1 ?? null);
  addFigure("scope2_emissions_location", "Scope 2 emissions, location-based (tCO2e)", inputs.scopeTotals?.scope2Location ?? null);
  addFigure("scope2_emissions_market", "Scope 2 emissions, market-based (tCO2e)", inputs.scopeTotals?.scope2Market ?? null);
  addFigure("scope3_emissions", "Scope 3 emissions (tCO2e)", inputs.scopeTotals?.scope3 ?? null);

  const energy = inputs.environmental.find((e) => e.metric === "energy_consumption_kwh");
  addFigure("energy_consumption", "Energy consumption (kWh)", energy ? toExplainEnvironmental(energy) : null);
  const waste = inputs.environmental.find((e) => e.metric === "waste_generated_kg");
  addFigure("waste_generated", "Waste generated (kg)", waste ? toExplainEnvironmental(waste) : null);

  const safety = inputs.social.find((s) => s.metric === "safety_incident_rate");
  addFigure(
    "safety_incident_rate",
    "Safety incident rate",
    safety && !safety.suppressed ? safety.explain! : null,
    safety?.suppressed ? safety.reason : "No safety aggregate recorded for this period.",
  );
  const training = inputs.social.find((s) => s.metric === "training_hours_per_fte");
  addFigure(
    "training_hours_per_fte",
    "Training hours per FTE",
    training && !training.suppressed ? training.explain! : null,
    training?.suppressed ? training.reason : "No training aggregate recorded for this period.",
  );
  const payEquity = inputs.social.find((s) => s.metric === "pay_equity_ratio");
  addFigure(
    "pay_equity_ratio",
    "Pay equity ratio",
    payEquity && !payEquity.suppressed ? payEquity.explain! : null,
    payEquity?.suppressed ? payEquity.reason : "No pay equity aggregate recorded for this period.",
  );

  addFigure("board_oversight_cadence", "Board oversight cadence (days)", inputs.governance?.oversightCadenceDays ?? null);
  addFigure("decision_quality_score", "Decision quality score", inputs.governance?.decisionQualityScore ?? null);

  const manifest = buildLineageManifest(lineageNodes, generatedAt);

  return { period: inputs.period, standard: inputs.standard, generatedAt, figures, gaps, lineageManifest: manifest };
}

/** Convert disclosure figures into lint-ready SurfaceFigure records (for the evidence-class lint gate). */
export function disclosureFiguresToSurfaceFigures(figures: DisclosureFigure[]): SurfaceFigure[] {
  return figures
    .filter((f): f is DisclosureFigure & { explain: Explain<number> } => f.explain !== null)
    .map((f) => ({
      key: f.metricKey,
      label: f.label,
      explain: f.explain,
      unit: f.standardMapping?.definition ?? "",
      standardMapping: f.standardMapping ? [f.standardMapping.gri, f.standardMapping.sasb, f.standardMapping.csrd].filter(Boolean) as string[] : [],
    }));
}
