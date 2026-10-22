// LEADOS — Part 38: Assurance checks registry.
//
// This is the single source of truth for "everything that can silently
// degrade" (Phase 0) turned into executable checks (Phase 1). Every check
// MUST declare non-empty `blindSpots` — a check without blind spots is
// considered a review failure (enforced in scripts/verify.ts).

export type CheckDomain =
  | "intelligence"
  | "fairness"
  | "cost"
  | "data"
  | "config"
  | "security"
  | "retrieval";

export type OnBreach = "finding" | "auto_fix" | "degrade" | "alert";

export interface Threshold {
  /**
   * "ratio": warn/breach are fractions of relative deviation from the
   *   metric's own baseline (e.g. 0.3 = 30% worse than baseline). This is
   *   what makes ONE threshold object usable across metrics with wildly
   *   different natural scales (a 0..1 score vs. a millisecond latency vs.
   *   a dollar amount) — each is judged relative to its own history.
   * "absolute": warn/breach are literal values compared directly to the
   *   metric (used for small-integer counts like a config diff count,
   *   where "relative to baseline 0" is meaningless).
   */
  mode: "ratio" | "absolute";
  direction: "above" | "below"; // default direction; per-metric override via Check.metricDirections
  warn: number;
  breach: number;
}

export interface Check {
  id: string;
  domain: CheckDomain;
  name: string;
  method: string;
  cadence: "hourly" | "daily" | "weekly";
  threshold: Threshold;
  onBreach: OnBreach;
  metricKeys: string[];
  relatedPart: string;
  featureFlagKey?: string;
  /** Per-metric direction override for ratio-mode checks that bundle metrics
   * where "worse" points different ways (e.g. cost up is bad, quality score
   * down is bad). Falls back to threshold.direction when not listed. */
  metricDirections?: Record<string, "above" | "below">;
  /** Authored, required. A check without blind spots fails review. */
  blindSpots: string[];
}

function assertHasBlindSpots(check: Check): Check {
  if (!check.blindSpots || check.blindSpots.length === 0) {
    throw new Error(`Check '${check.id}' has no declared blind spots — fails registry review.`);
  }
  return check;
}

export const CHECK_REGISTRY: Check[] = [
  {
    id: "calibration-brier-ece",
    domain: "intelligence",
    name: "Calibration drift (Brier / ECE)",
    method: "Rolling 30-day window of Brier score and Expected Calibration Error vs. Part 04 baseline, EWMA + CUSUM drift detection.",
    cadence: "daily",
    // Ratio mode: breach when Brier/ECE rise 60%+ relative to their own
    // rolling baseline (warn at 30%+). Absolute thresholds don't work here
    // because Brier and ECE baselines sit at very different raw scales.
    threshold: { mode: "ratio", direction: "above", warn: 0.3, breach: 0.6 },
    onBreach: "finding",
    metricKeys: ["calibration.brier", "calibration.ece"],
    relatedPart: "Part 04",
    featureFlagKey: "ai-lead-scoring",
    blindSpots: [
      "Cannot detect calibration drift for segments with fewer than ~30 samples in the window — the aggregate can look fine while a thin segment is badly miscalibrated.",
      "Does not see miscalibration that cancels out in aggregate (symmetric opposite-direction errors across sub-populations).",
      "Depends on Part 04's baseline being refreshed; a stale baseline makes this check blind to genuine, now-acceptable drift (looks like a false breach) or to a new bad-normal (looks fine).",
    ],
  },
  {
    id: "fairness-parity-decay",
    domain: "fairness",
    name: "Fairness parity decay",
    method: "Rolling 30-day window of Demographic Parity Difference and Equal Opportunity Difference (Part 09 metrics) vs. baseline, EWMA + CUSUM.",
    cadence: "daily",
    // Ratio mode: breach when DPD/EOD rise 80%+ relative to baseline
    // (warn at 40%+) — these metrics start small (~0.05) so a small absolute
    // move is already a large, meaningful relative move.
    threshold: { mode: "ratio", direction: "above", warn: 0.4, breach: 0.8 },
    onBreach: "degrade",
    metricKeys: ["fairness.demographic_parity_diff", "fairness.equal_opportunity_diff"],
    relatedPart: "Part 09",
    featureFlagKey: "ai-lead-scoring",
    blindSpots: [
      "Only monitors the protected attributes Part 09 already tracks; unlabeled or unknown protected attributes are completely invisible to this check.",
      "Small subgroup sizes are statistically noisy and may fail to trigger even a real, sustained disparity.",
      "Proxy discrimination through correlated-but-unprotected features (e.g. zip code standing in for race) is not measured by group-fairness metrics at all.",
    ],
  },
  {
    id: "retrieval-quality-eval",
    domain: "retrieval",
    name: "Retrieval quality eval-set regression",
    method: "Weekly re-run of the Part 12 labeled retrieval eval set, tracking precision@5 and recall@10 vs. baseline.",
    cadence: "weekly",
    // Ratio mode: breach when precision/recall fall 20%+ below baseline
    // (warn at 10%+ below).
    threshold: { mode: "ratio", direction: "below", warn: 0.1, breach: 0.2 },
    onBreach: "finding",
    metricKeys: ["retrieval.precision_at_5", "retrieval.recall_at_10"],
    relatedPart: "Part 12",
    featureFlagKey: "semantic-retrieval",
    blindSpots: [
      "The eval set is static and curated; it does not reflect newly emerging production query distributions ('eval-set rot').",
      "Only measures quality on labeled eval queries — most production-only query phrasings are never scored.",
      "Does not catch latency or index-freshness regressions, only relevance quality.",
    ],
  },
  {
    id: "ai-cost-quality-trend",
    domain: "cost",
    name: "AI cost & quality trend",
    method: "Daily trend of Part 33 control-room cost-per-1k-requests, automatic quality score, and p95 latency vs. baseline.",
    cadence: "daily",
    // Ratio mode with per-metric direction override: cost and latency are
    // bad when they rise; the quality auto-score is bad when it falls. One
    // shared 25%/50% relative-deviation sensitivity across all three.
    threshold: { mode: "ratio", direction: "above", warn: 0.25, breach: 0.5 },
    metricDirections: {
      "cost.usd_per_1k_requests": "above",
      "controlroom.p95_latency_ms": "above",
      "aiquality.auto_score": "below",
    },
    onBreach: "alert",
    metricKeys: ["cost.usd_per_1k_requests", "aiquality.auto_score", "controlroom.p95_latency_ms"],
    relatedPart: "Part 33",
    blindSpots: [
      "Cost tracking only covers metered LLM API calls; compute/infra cost drift (e.g. database scaling) is out of scope.",
      "The automatic quality score is produced by Part 33's own scoring model, which has its own blind spots this check inherits.",
      "Provider pricing changes are only visible once they land in the next billing cycle's numbers, not at the moment they take effect.",
    ],
  },
  {
    id: "data-quality-decay",
    domain: "data",
    name: "Data quality decay",
    method: "Daily trend of Part 34 completeness and validity scores vs. baseline.",
    cadence: "daily",
    // Ratio mode: breach when completeness/validity fall 10%+ below
    // baseline (warn at 5%+ below) — baselines sit close to 1.0 so small
    // absolute moves are already meaningful relative moves.
    threshold: { mode: "ratio", direction: "below", warn: 0.05, breach: 0.1 },
    onBreach: "finding",
    metricKeys: ["dataquality.completeness", "dataquality.validity"],
    relatedPart: "Part 34",
    blindSpots: [
      "Only measures the dimensions Part 34 scores (completeness, validity); semantic correctness of a syntactically valid value is not checked.",
      "New data sources not yet wired into the Part 34 pipeline are invisible to this check until onboarded.",
    ],
  },
  {
    id: "config-schema-drift",
    domain: "config",
    name: "Config / schema drift",
    method: "Diff of declared checks registry, declared feature flags, and declared DB schema against live database state.",
    cadence: "daily",
    // Absolute mode: diff_count is a literal count against a baseline of 0,
    // where "relative to baseline" is meaningless — 1 diff is a warning,
    // 3+ diffs is a breach.
    threshold: { mode: "absolute", direction: "above", warn: 1, breach: 3 },
    onBreach: "finding",
    metricKeys: ["config.diff_count"],
    relatedPart: "Parts 11/13",
    blindSpots: [
      "Only compares declared config/schema in this repository against live state at check time; a manual out-of-band change that is made and reverted between two check runs is invisible.",
      "Cannot detect semantically-equivalent-but-differently-expressed configuration (e.g. an equivalent threshold expressed in different units).",
    ],
  },
  {
    id: "security-posture-scan",
    domain: "security",
    name: "Security posture & audit-chain integrity",
    method: "Daily security posture scan (Part 19) plus full audit-chain re-verification (audit:verify).",
    cadence: "daily",
    // Ratio mode: breach when posture score falls 5%+ below its (near-1.0)
    // baseline (warn at 2%+ below).
    threshold: { mode: "ratio", direction: "below", warn: 0.02, breach: 0.05 },
    onBreach: "degrade",
    metricKeys: ["security.posture_score"],
    relatedPart: "Part 19",
    blindSpots: [
      "Static/simulated scans in this environment cannot find zero-day vulnerabilities absent from any signature database.",
      "Audit-chain integrity proves the recorded sequence was not altered after the fact — it cannot prove the first write into the chain was itself truthful.",
      "Does not cover social-engineering, credential-leak-outside-the-repo, or physical-access vectors.",
    ],
  },
  {
    id: "learning-loop-regression",
    domain: "intelligence",
    name: "Learning-loop regression",
    method: "Weekly re-run of the fixed regression suite after each Part 30 learning-loop update, tracked as a regression score vs. baseline.",
    cadence: "weekly",
    // Ratio mode: breach when the regression score falls 12%+ below
    // baseline (warn at 8%+ below).
    threshold: { mode: "ratio", direction: "below", warn: 0.08, breach: 0.12 },
    onBreach: "auto_fix",
    metricKeys: ["learningloop.eval_regression_score"],
    relatedPart: "Part 30",
    blindSpots: [
      "The regression suite only covers recorded historical cases; genuinely novel inputs are never exercised by this check.",
      "Cannot by itself distinguish a true model regression from an upstream data-distribution shift — that requires correlating with the data-quality check, which is not automated here.",
    ],
  },
];

export const VALIDATED_REGISTRY: Check[] = CHECK_REGISTRY.map(assertHasBlindSpots);

export function getCheck(id: string): Check | undefined {
  return CHECK_REGISTRY.find((c) => c.id === id);
}
