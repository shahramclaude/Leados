// LEADOS — Part 38: system-level blind spots, maintained as data.
//
// Per-check blind spots live in registry.ts (Check.blindSpots). This file
// holds BLIND SPOTS THAT ARE STRUCTURAL TO THE ASSURANCE SYSTEM ITSELF —
// things no single check fixes because they are properties of the approach,
// not of an individual metric. The "Blind Spots" surface renders this list
// alongside the per-check ones so the honesty requirement (Phase 6) has one
// authoritative, queryable source instead of scattered prose.

export interface SystemBlindSpot {
  id: string;
  domain: string;
  description: string;
  whyUnavoidable: string;
  mitigation: string;
  relatedPart?: string;
}

export const SYSTEM_BLIND_SPOTS: SystemBlindSpot[] = [
  {
    id: "novel-failure-modes",
    domain: "intelligence",
    description:
      "A genuinely novel failure mode that has never occurred before and doesn't move any of the registered metrics cannot be detected by this system.",
    whyUnavoidable:
      "Every check here is a statistical comparison of a known metric against its own history or baseline. By construction it can only see degradation that shows up as movement in a metric someone already decided to measure.",
    mitigation:
      "Keep the checks registry under active review (Phase 0 inventory should be repeated periodically) and treat human-reported anomalies as a first-class input, not just automated metrics.",
    relatedPart: "Part 33",
  },
  {
    id: "correlated-simultaneous-drift",
    domain: "intelligence",
    description:
      "If multiple metrics drift at the same time in ways that are individually sub-threshold but jointly meaningful (e.g. calibration AND fairness both drift 60% of the way to breach together), no single check fires.",
    whyUnavoidable:
      "Each check evaluates one metric (or a small related group) independently against its own threshold; there is no cross-metric joint-anomaly detector in this build.",
    mitigation:
      "The nightly report lists all warn-level (not just breach-level) results side by side so a human reviewing the full report can spot joint near-misses that no single check would escalate alone.",
  },
  {
    id: "gaming-the-metric",
    domain: "intelligence",
    description:
      "If the thing being measured is optimized against (Goodhart's law) — e.g. a model is tuned to look well-calibrated on the exact eval windows this system samples — the check will report healthy while the underlying property degrades.",
    whyUnavoidable:
      "Statistical monitoring cannot distinguish 'genuinely healthy' from 'optimized to pass this exact check' without an independent, harder-to-game signal.",
    mitigation:
      "Retrieval and regression eval sets should be rotated/extended periodically and kept out of training feedback loops — tracked as an open operational practice, not yet automated here.",
    relatedPart: "Part 12",
  },
  {
    id: "upstream-part-absent",
    domain: "config",
    description:
      "This sandbox does not yet contain live implementations of Parts 04, 09, 12, 14, 15, 19, 30, 33, 34. Their metrics are produced by seeded/synthetic shims documented in src/lib/*.ts, not by the real pipelines.",
    whyUnavoidable:
      "Those parts are out of scope for this delivery; building the assurance layer first (with honest shims) is an explicit, declared design choice (see Phase 5, 'what we deliberately did not do').",
    mitigation:
      "Every shim module is labeled as a compatibility shim in its file header and metricKeys are named so real pipelines can write into the same `metric_observations` table without any assurance-layer code changes.",
  },
  {
    id: "remediation-blast-radius",
    domain: "config",
    description:
      "Auto-remediation (safe_auto_fix and degrade tiers) acts on the specific feature flag or check declared in the registry. If the true blast radius of a drifting metric is broader than the one flag it's wired to, remediation under-covers the actual problem.",
    whyUnavoidable:
      "The mapping from check to remediation target is manually authored at registry time; it cannot discover blast radius dynamically.",
    mitigation:
      "Escalation tier always fires a human-visible Finding in addition to any auto-remediation, so a human can judge whether the automated action was sufficient.",
  },
  {
    id: "report-sampling-window",
    domain: "config",
    description:
      "The nightly report only summarizes the 24h (or latest weekly) cycle; slow degradations that move less than a cycle's worth of noise per day are only visible in the Drift Trends charts, not called out in the report prose until they cross a threshold.",
    whyUnavoidable:
      "Natural tension between a report being skimmable each night and reporting every sub-threshold wiggle (see Phase 5, 'noise' answer).",
    mitigation:
      "Drift Trends view always shows the full rolling window with baseline and threshold bands so a human can look for slow creep even when no check has fired yet.",
  },
];

export function getAllBlindSpots() {
  return SYSTEM_BLIND_SPOTS;
}
