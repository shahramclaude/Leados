// SEAM ADAPTER — Part 27 (Market Intelligence & Evidence Classes)
//
// STATUS: Part 27's source was not present in this repo snapshot at the time
// Part 50 was built (verified by listing the full repo tree before writing
// any code — see AI-SESSION-LOG.md). This file is the single integration
// point. When Part 27's real module exists, replace the body of this file
// with an import/re-export from it; every consumer in Part 50 only imports
// from this path, never from a hypothetical Part 27 path directly.
//
// ASSUMED CONTRACT (documented so Part 27 can be slotted in later):
//   - Evidence classes form a strict honesty ladder from strongest to
//     weakest provenance.
//   - Every externally-sourced figure must carry an EvidenceClass + a
//     human-readable source reference.
//   - "model_estimate" is reserved for numbers LEADOS computed/simulated
//     itself (e.g. contagion exposure scores) — never presented as fact.

export type EvidenceClass =
  | "verified_primary"
  | "licensed_dataset"
  | "reported_secondary"
  | "model_estimate"
  | "unverified_signal"
  | "internal_telemetry";

export interface EvidenceMeta {
  evidenceClass: EvidenceClass;
  sourceRef?: string | null;
  asOf?: string | null;
}

export const EVIDENCE_CLASS_ORDER: EvidenceClass[] = [
  "verified_primary",
  "licensed_dataset",
  "reported_secondary",
  "model_estimate",
  "unverified_signal",
  "internal_telemetry",
];

export const EVIDENCE_CLASS_LABEL: Record<EvidenceClass, string> = {
  verified_primary: "Verified / Primary",
  licensed_dataset: "Licensed Dataset",
  reported_secondary: "Reported (Secondary)",
  model_estimate: "Model Estimate",
  unverified_signal: "Unverified Signal",
  internal_telemetry: "Internal Telemetry",
};

export const EVIDENCE_CLASS_COLOR: Record<EvidenceClass, string> = {
  verified_primary: "bg-emerald-100 text-emerald-800 border-emerald-300",
  licensed_dataset: "bg-sky-100 text-sky-800 border-sky-300",
  reported_secondary: "bg-amber-100 text-amber-800 border-amber-300",
  model_estimate: "bg-violet-100 text-violet-800 border-violet-300",
  unverified_signal: "bg-rose-100 text-rose-800 border-rose-300",
  internal_telemetry: "bg-slate-100 text-slate-700 border-slate-300",
};

/** True when a value's provenance is strong enough to present without heavy hedging language. */
export function isStrongEvidence(evidenceClass: EvidenceClass): boolean {
  return evidenceClass === "verified_primary" || evidenceClass === "licensed_dataset";
}

/**
 * Enforcement helper (Part 27's rule): any figure that claims to describe the
 * outside world (industry structure, competitor data, external signal) MUST
 * carry evidence metadata. Throws descriptively so misuse fails loudly in
 * tests rather than silently shipping unattributed "facts".
 */
export function assertHasEvidence<T extends EvidenceMeta>(value: T, context: string): T {
  if (!value.evidenceClass || !EVIDENCE_CLASS_ORDER.includes(value.evidenceClass)) {
    throw new Error(`Evidence-class enforcement failed for ${context}: missing/invalid evidenceClass`);
  }
  if (value.evidenceClass !== "model_estimate" && value.evidenceClass !== "internal_telemetry") {
    if (!value.sourceRef) {
      throw new Error(`Evidence-class enforcement failed for ${context}: external claim without sourceRef`);
    }
  }
  return value;
}

/** Source-reliability tiers used by the External Radar (Part 27 seam, extended by Part 34 connectors). */
export type ReliabilityClass = "tier1_verified" | "tier2_reported" | "tier3_unverified";

export function reliabilityClassFromScore(score: number): ReliabilityClass {
  if (score >= 0.75) return "tier1_verified";
  if (score >= 0.4) return "tier2_reported";
  return "tier3_unverified";
}

export function reliabilityClassToEvidenceClass(reliability: ReliabilityClass): EvidenceClass {
  switch (reliability) {
    case "tier1_verified":
      return "verified_primary";
    case "tier2_reported":
      return "reported_secondary";
    case "tier3_unverified":
      return "unverified_signal";
  }
}
