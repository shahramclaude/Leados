// LEADOS — Part 56: Model / system registry — canonical source of truth.
//
// Every scoring / predicting / recommending / flagging module under
// src/lib/intelligence/* must have exactly one entry here. This file is the
// thing `scripts/check-registry-completeness.ts` cross-checks discovered
// engine modules against (Phase 4 gate 1), and what `scripts/seed.ts` writes
// into the `algo_systems` table.
//
// Honesty note: id/ownership/oversight metadata below reflects this Part 56
// build only. Parts 04/09/11/19/38/51 source files were not present in this
// sandbox snapshot, so this is a best-effort reconstruction of the systems
// they describe, clearly labelled as such in AI-SESSION-LOG.md. Before this
// ships against the real LEADOS repo, each entry's `sourceModule`, model
// card data, and oversight text must be reconciled against the real Part
// 04/09/11/19/38/51 implementations.
import type { AlgoSystemDefinition } from "./types";

export const REGISTRY: AlgoSystemDefinition[] = [
  {
    id: "eligibility-scoring-v1",
    name: "Worker Eligibility Scoring",
    purpose:
      "Scores a worker's reliability/credential history to recommend eligibility for premium job tiers.",
    affectedParties: "workers",
    inputs: ["completedJobsCount", "onTimeRate", "verifiedCredentials", "disputeRate"],
    outputs: ["eligibilityScore", "tierRecommendation", "factors"],
    decisionRole: "recommend",
    actionTier: "T2",
    sourceModule: "src/lib/intelligence/eligibilityScoring.ts",
    owner: "Worker Platform Team",
    humanOversight: {
      owner: "Worker Experience Lead",
      method:
        "Reviewer spot-checks 10% of recommend-tier upgrades weekly; any worker may request human review before a tier change takes effect.",
      trainingNotes: "Reviewers complete the LEADOS Fair Scoring training module annually.",
    },
    optOutPolicy: {
      allowed: true,
      limits: "Opting out routes the worker to the manual tier-review queue, which is slower but always available.",
    },
    modelCardSeed: {
      name: "Eligibility Scoring Model",
      version: "1.3.0",
      summary: "Weighted rules-based score over reliability and credential signals; no ML model in production.",
      trainingData: "N/A — deterministic weighted rule set, not learned from historical data.",
      limitations:
        "Does not account for platform tenure gaps (e.g. parental leave) that reduce completedJobsCount without reflecting reliability.",
      metrics: { backtestAccuracy: 0.81, falsePositiveRateOnAppeal: 0.07 },
    },
  },
  {
    id: "candidate-match-recommender-v2",
    name: "Candidate Match Recommender",
    purpose: "Ranks and recommends worker candidates to customers posting open gigs.",
    affectedParties: "workers",
    inputs: ["skillMatch", "proximityKm", "pastRating", "availabilityScore"],
    outputs: ["matchScore", "rank", "factors"],
    decisionRole: "recommend",
    actionTier: "T2",
    sourceModule: "src/lib/intelligence/candidateMatchRecommender.ts",
    owner: "Marketplace Matching Team",
    humanOversight: {
      owner: "Marketplace Product Lead",
      method:
        "Customers always see and can override the ranked order; matching logic changes require sign-off from the Fairness Review Board (Part 09).",
      trainingNotes: "Marketplace team completes ranking-fairness training before touching ranking weights.",
    },
    optOutPolicy: {
      allowed: true,
      limits:
        "Workers may opt out of algorithmic ranking; they still appear in an unranked manual-browse list, which may reduce visibility to customers.",
    },
    modelCardSeed: {
      name: "Candidate Match Recommender",
      version: "2.1.0",
      summary: "Weighted multi-factor ranking over skill, proximity, rating and availability.",
      trainingData: "Weights calibrated from 2025H2 marketplace outcome logs (anonymized, aggregated).",
      limitations:
        "Proximity weighting can disadvantage workers in low-density service areas; mitigated by a minimum-exposure floor, monitored under Part 09.",
      metrics: { rankingNDCG: 0.88, exposureGiniCoefficient: 0.21 },
    },
  },
  {
    id: "performance-risk-predictor-v1",
    name: "Performance / Churn Risk Predictor",
    purpose: "Predicts a worker's likelihood of missing SLA or churning, to inform retention outreach.",
    affectedParties: "workers",
    inputs: ["recentSlaMisses", "avgResponseMinutes", "tenureMonths", "engagementScore"],
    outputs: ["churnRiskScore", "band", "factors"],
    decisionRole: "inform",
    actionTier: "T1",
    sourceModule: "src/lib/intelligence/performancePredictor.ts",
    owner: "Worker Success Team",
    humanOversight: {
      owner: "Worker Success Manager",
      method:
        "Output is advisory only, surfaced on an internal dashboard; an ops analyst decides whether/how to reach out. No automated consequence attaches.",
      trainingNotes: "Analysts are trained not to treat the score as a performance rating when speaking with workers.",
    },
    optOutPolicy: {
      allowed: true,
      limits: "Worker may request not to be profiled; outreach stops, with no platform-side consequence.",
    },
    modelCardSeed: {
      name: "Performance Risk Predictor",
      version: "1.0.4",
      summary: "Rule-weighted risk score combining recent SLA performance and engagement signals.",
      trainingData: "Calibrated on 2025 Q3-Q4 anonymized ops outcomes.",
      limitations:
        "Accuracy degrades for workers with under 3 months tenure (sparse history). Drift monitoring currently FAILING — see monitoring check mon-perf-accuracy-01.",
      metrics: { backtestAUC: 0.74, currentLiveAUC: 0.63 },
    },
  },
  {
    id: "fraud-anomaly-flagger-v1",
    name: "Fraud / Anomaly Payout Flagger",
    purpose: "Automatically flags and temporarily holds suspicious payouts pending human review.",
    affectedParties: "workers",
    inputs: ["payoutVelocityScore", "deviceFingerprintChanged", "geoVelocityFlag", "priorDisputeCount"],
    outputs: ["riskScore", "holdAction", "reasonCodes", "factors"],
    decisionRole: "automate",
    actionTier: "T4",
    sourceModule: "src/lib/intelligence/riskFlagger.ts",
    owner: "Trust & Safety Team",
    humanOversight: {
      owner: "Trust & Safety Duty Reviewer",
      method:
        "Every temporary hold is queued for mandatory human review within 24h; a reviewer must confirm or overturn before the hold can exceed 24h.",
      trainingNotes: "Duty reviewers are certified on the Trust & Safety escalation runbook before taking queue shifts.",
    },
    optOutPolicy: {
      allowed: false,
      limits:
        "Opt-out is not permitted: fraud controls are mandatory for platform integrity and payment-partner compliance. Workers may contest any hold via the expedited review path (target resolution: 24h).",
    },
    modelCardSeed: {
      name: "Fraud Anomaly Flagger",
      version: "1.2.1",
      summary: "Weighted rule ensemble over velocity, device and geo signals producing a hold/no-hold action.",
      trainingData: "Thresholds tuned on 2025 confirmed-fraud case review set (Trust & Safety).",
      limitations:
        "Known disparity: hold rate for workers with <6 months tenure is 1.42x that of longer-tenured workers at equal risk score — see fairness report fr-fraud-tenure-01 (FAILING, threshold 1.25).",
      metrics: { precisionAtHold: 0.58, recallOnConfirmedFraud: 0.91 },
    },
  },
  {
    id: "support-ticket-priority-scorer-v1",
    name: "Support Ticket Priority Scorer",
    purpose: "Scores and suggests an order for customer support tickets to route triage.",
    affectedParties: "customers",
    inputs: ["severityKeywordsHit", "customerTierWeight", "slaMinutesRemaining", "reopenedCount"],
    outputs: ["priorityScore", "suggestedOrder", "factors"],
    decisionRole: "recommend",
    actionTier: "T1",
    sourceModule: "src/lib/intelligence/priorityScorer.ts",
    owner: "Customer Support Team",
    humanOversight: {
      owner: "Support Operations Lead",
      method: "Agents see the suggested order but always choose which ticket to open next.",
      trainingNotes: "Agents are briefed that `customerTierWeight` must never be used to deprioritize safety-flagged tickets.",
    },
    optOutPolicy: {
      allowed: true,
      limits: "Customer may request FIFO handling instead of priority scoring; this may increase wait time.",
    },
    modelCardSeed: {
      name: "Support Ticket Priority Scorer",
      version: "1.1.0",
      summary: "Weighted rule score over severity language, customer tier, SLA countdown and reopen history.",
      trainingData: "N/A — deterministic weighted rule set.",
      limitations: "Keyword severity detection is English-only; non-English tickets default to a neutral severity score.",
      metrics: { triageAgreementWithHumanAudit: 0.86 },
    },
  },
];

export function getSystemDefinition(id: string): AlgoSystemDefinition | undefined {
  return REGISTRY.find((system) => system.id === id);
}
