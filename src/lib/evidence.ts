// ---------------------------------------------------------------------------
// src/lib/evidence.ts
//
// Minimal "substrate" convention reused from Part 01 for this sandbox: every
// number shown on an ESG surface is wrapped in Explain<T> and must carry a
// method + evidence class + uncertainty. This is the enforcement point for
// the standing honesty rule:
//   "estimated emissions carry method + uncertainty ... no ESG claim without
//    its evidence class."
// ---------------------------------------------------------------------------

export type Method = "measured" | "activity-based" | "spend-based" | "derived" | "assumed";

export type EvidenceClass =
  | "metered-measured" // directly metered / measured, highest confidence
  | "activity-based-estimate" // activity quantity x emission factor
  | "spend-based-estimate" // $ spend x EEIO-style factor, lowest confidence of the quantitative classes
  | "derived-aggregate" // sum/roll-up of mixed underlying evidence classes
  | "aggregated-hr-derived" // k-anonymized people metric
  | "governance-log-derived" // derived from board/decision logs
  | "assumed-placeholder"; // no data yet — must render as an explicit gap, never a silent zero

/** Default uncertainty bands per evidence class, used when a factor/metric does not specify its own. */
export const DEFAULT_UNCERTAINTY: Record<EvidenceClass, number> = {
  "metered-measured": 0.02,
  "activity-based-estimate": 0.1,
  "spend-based-estimate": 0.45,
  "derived-aggregate": 0.15,
  "aggregated-hr-derived": 0.08,
  "governance-log-derived": 0.05,
  "assumed-placeholder": 1.0,
};

/** Human labels so the UI never has to invent its own confidence language. */
export const EVIDENCE_LABEL: Record<EvidenceClass, string> = {
  "metered-measured": "Measured",
  "activity-based-estimate": "Activity-based estimate",
  "spend-based-estimate": "Spend-based estimate (screening-grade)",
  "derived-aggregate": "Derived aggregate (mixed sources)",
  "aggregated-hr-derived": "Aggregated people metric (k-anonymized)",
  "governance-log-derived": "Derived from governance log",
  "assumed-placeholder": "No data — assumed placeholder",
};

/** Confidence tier purely for UI styling; never used for numeric calculation. */
export function confidenceTier(evidenceClass: EvidenceClass): "high" | "medium" | "low" | "none" {
  switch (evidenceClass) {
    case "metered-measured":
      return "high";
    case "activity-based-estimate":
    case "aggregated-hr-derived":
    case "governance-log-derived":
      return "medium";
    case "spend-based-estimate":
    case "derived-aggregate":
      return "low";
    case "assumed-placeholder":
      return "none";
  }
}

/**
 * Every ESG figure on a surface is an Explain<T>: value + enough provenance to
 * answer "how precise is this, and why should I trust it" without a click.
 */
export interface Explain<T> {
  value: T;
  method: Method;
  evidenceClass: EvidenceClass;
  /** Relative uncertainty, e.g. 0.1 = ±10%. */
  uncertaintyPct: number;
  /** Record ids / factor ids this figure traces back to (lineage leaf refs). */
  sources: string[];
  /** Period or as-of date this figure represents. */
  asOf: string;
  notes?: string;
  /**
   * For aggregates that blend multiple evidence classes, the share of the
   * total value contributed by each class — this is what prevents
   * false precision: a dashboard total can say "62% measured, 38%
   * spend-based estimate" instead of pretending uniform confidence.
   */
  qualityMix?: Partial<Record<EvidenceClass, number>>;
}

export function explain<T>(
  value: T,
  method: Method,
  evidenceClass: EvidenceClass,
  sources: string[],
  asOf: string,
  opts?: { uncertaintyPct?: number; notes?: string; qualityMix?: Partial<Record<EvidenceClass, number>> },
): Explain<T> {
  return {
    value,
    method,
    evidenceClass,
    uncertaintyPct: opts?.uncertaintyPct ?? DEFAULT_UNCERTAINTY[evidenceClass],
    sources,
    asOf,
    notes: opts?.notes,
    qualityMix: opts?.qualityMix,
  };
}

/**
 * Combine independent Explain<number> figures (e.g. summing activities into a
 * scope total). Uncertainty is combined as a root-sum-square of absolute
 * uncertainties (standard independent-error propagation for a sum), and the
 * quality mix is computed so the UI can show the blended confidence instead
 * of inheriting one class.
 */
export function combineExplain(items: Explain<number>[], asOf: string, notes?: string): Explain<number> {
  if (items.length === 0) {
    return explain(0, "assumed", "assumed-placeholder", [], asOf, {
      notes: notes ?? "No underlying records for this period/category.",
    });
  }
  const total = items.reduce((s, i) => s + i.value, 0);
  const varianceSum = items.reduce((s, i) => s + Math.pow(i.value * i.uncertaintyPct, 2), 0);
  const absUncertainty = Math.sqrt(varianceSum);
  const uncertaintyPct = total !== 0 ? absUncertainty / Math.abs(total) : 0;

  const mixTotals = new Map<EvidenceClass, number>();
  for (const item of items) {
    mixTotals.set(item.evidenceClass, (mixTotals.get(item.evidenceClass) ?? 0) + item.value);
  }
  const qualityMix: Partial<Record<EvidenceClass, number>> = {};
  for (const [cls, v] of mixTotals.entries()) {
    qualityMix[cls] = total !== 0 ? v / total : 0;
  }

  const singleClass = items.every((i) => i.evidenceClass === items[0].evidenceClass);

  return explain(
    total,
    "derived",
    singleClass ? items[0].evidenceClass : "derived-aggregate",
    items.flatMap((i) => i.sources),
    asOf,
    { uncertaintyPct, notes, qualityMix },
  );
}

/** A surface-ready figure: what the UI actually renders, pairing an Explain<T> with its label. */
export interface SurfaceFigure {
  key: string;
  label: string;
  explain: Explain<number>;
  unit: string;
  standardMapping?: string[];
}

export interface EvidenceLintViolation {
  key: string;
  reason: string;
}

/**
 * Evidence-class lint: every figure rendered on an ESG surface must carry a
 * method and evidence class, and spend-based/assumed figures must carry
 * uncertainty >= their documented floor (so nobody silently overrides a
 * screening-grade estimate to look precise).
 */
export function lintEvidence(figures: SurfaceFigure[]): EvidenceLintViolation[] {
  const violations: EvidenceLintViolation[] = [];
  for (const fig of figures) {
    const ex = fig.explain as Partial<Explain<number>> | undefined;
    if (!ex || ex.method === undefined || ex.method === null) {
      violations.push({ key: fig.key, reason: "missing method" });
      continue;
    }
    if (!ex.evidenceClass) {
      violations.push({ key: fig.key, reason: "missing evidenceClass" });
      continue;
    }
    if (typeof ex.uncertaintyPct !== "number" || Number.isNaN(ex.uncertaintyPct)) {
      violations.push({ key: fig.key, reason: "missing/invalid uncertaintyPct" });
      continue;
    }
    if (!ex.sources || ex.sources.length === 0) {
      violations.push({ key: fig.key, reason: "no lineage sources attached" });
      continue;
    }
    const floor = DEFAULT_UNCERTAINTY[ex.evidenceClass];
    if (ex.evidenceClass === "spend-based-estimate" && ex.uncertaintyPct < floor * 0.5) {
      violations.push({
        key: fig.key,
        reason: `spend-based estimate reports implausibly low uncertainty (${ex.uncertaintyPct}) below half its documented floor (${floor}) — false precision`,
      });
    }
  }
  return violations;
}
