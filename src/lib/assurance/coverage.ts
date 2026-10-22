// LEADOS — Part 38: registry completeness / coverage table.
//
// Phase 4 gate #5: "every Part 04/09/12/33 metric has a monitoring check or
// an explicit blind-spot entry". This module is the single source of truth
// for that claim — for every metric we know these upstream parts are
// expected to produce, we either point at the check that monitors it, or we
// author an explicit blind-spot note explaining why it is deliberately not
// monitored yet. A metric with neither fails `npm run verify`.

import { CHECK_REGISTRY } from "@/lib/assurance/registry";

export interface CoverageEntry {
  metricKey: string;
  relatedPart: string;
  monitoredByCheckId: string | null; // computed
  blindSpotIfUnmonitored: string | null; // authored — required when not monitored
}

const DECLARED_METRICS: Array<{ metricKey: string; relatedPart: string; blindSpotIfUnmonitored: string | null }> = [
  // Part 04 — calibration
  { metricKey: "calibration.brier", relatedPart: "Part 04", blindSpotIfUnmonitored: null },
  { metricKey: "calibration.ece", relatedPart: "Part 04", blindSpotIfUnmonitored: null },
  // Part 09 — fairness
  { metricKey: "fairness.demographic_parity_diff", relatedPart: "Part 09", blindSpotIfUnmonitored: null },
  { metricKey: "fairness.equal_opportunity_diff", relatedPart: "Part 09", blindSpotIfUnmonitored: null },
  {
    metricKey: "fairness.individual_fairness_lipschitz",
    relatedPart: "Part 09",
    blindSpotIfUnmonitored:
      "Individual fairness (similar inputs should get similar outputs, measured via a Lipschitz-style bound) is not computed by Part 09 in this build and is therefore not monitored — only group-fairness metrics are tracked. This is listed as a per-check blind spot on 'fairness-parity-decay'.",
  },
  // Part 12 — retrieval
  { metricKey: "retrieval.precision_at_5", relatedPart: "Part 12", blindSpotIfUnmonitored: null },
  { metricKey: "retrieval.recall_at_10", relatedPart: "Part 12", blindSpotIfUnmonitored: null },
  {
    metricKey: "retrieval.embedding_drift_cosine",
    relatedPart: "Part 12",
    blindSpotIfUnmonitored:
      "Embedding-space drift (average cosine distance between new and historical document embeddings) is not computed or monitored in this build; only end-to-end precision/recall on the eval set is. A pure embedding-space shift that happens not to move precision/recall on the (static) eval set would be invisible.",
  },
  // Part 33 — AI control room
  { metricKey: "cost.usd_per_1k_requests", relatedPart: "Part 33", blindSpotIfUnmonitored: null },
  { metricKey: "aiquality.auto_score", relatedPart: "Part 33", blindSpotIfUnmonitored: null },
  { metricKey: "controlroom.p95_latency_ms", relatedPart: "Part 33", blindSpotIfUnmonitored: null },
  {
    metricKey: "cost.perrequest_margin",
    relatedPart: "Part 33",
    blindSpotIfUnmonitored:
      "Per-request gross margin (cost vs. the value/price attributed to that request) is a business metric Part 33 does not yet expose, so it cannot be monitored here. Cost is tracked in absolute terms only.",
  },
  // Part 30 — learning loop
  { metricKey: "learningloop.eval_regression_score", relatedPart: "Part 30", blindSpotIfUnmonitored: null },
  // Part 34 — data quality
  { metricKey: "dataquality.completeness", relatedPart: "Part 34", blindSpotIfUnmonitored: null },
  { metricKey: "dataquality.validity", relatedPart: "Part 34", blindSpotIfUnmonitored: null },
  // Part 19 — security
  { metricKey: "security.posture_score", relatedPart: "Part 19", blindSpotIfUnmonitored: null },
];

export function buildCoverageTable(): CoverageEntry[] {
  const monitoredKeys = new Map<string, string>();
  for (const check of CHECK_REGISTRY) {
    for (const key of check.metricKeys) {
      monitoredKeys.set(key, check.id);
    }
  }

  return DECLARED_METRICS.map((m) => ({
    metricKey: m.metricKey,
    relatedPart: m.relatedPart,
    monitoredByCheckId: monitoredKeys.get(m.metricKey) ?? null,
    blindSpotIfUnmonitored: m.blindSpotIfUnmonitored,
  }));
}

export interface CoverageVerdict {
  entries: CoverageEntry[];
  gaps: CoverageEntry[]; // unmonitored AND no blind-spot note — these fail review
  ok: boolean;
}

export function assertCoverage(): CoverageVerdict {
  const entries = buildCoverageTable();
  const gaps = entries.filter((e) => !e.monitoredByCheckId && !e.blindSpotIfUnmonitored);
  return { entries, gaps, ok: gaps.length === 0 };
}
