// LEADOS intelligence engine — worker eligibility scoring.
// Registry-lint contract: this file must export a SYSTEM_ID constant whose
// value is registered in `src/lib/accountability/registry.ts`, and an
// exported function using a recognized verb (score/predict/recommend/flag/
// rank/prioritize) so the completeness lint can discover it by
// import-pattern + naming convention (see scripts/lib/registryAudit.ts).
export const SYSTEM_ID = "eligibility-scoring-v1";

export interface EligibilityInput {
  completedJobsCount: number;
  onTimeRate: number; // 0..1
  verifiedCredentials: number;
  disputeRate: number; // 0..1
}

export interface EligibilityOutput {
  eligibilityScore: number; // 0..100
  tierRecommendation: "standard" | "premium";
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
}

/** Recommends a worker's job-tier eligibility. decisionRole: recommend. */
export function scoreEligibility(input: EligibilityInput): EligibilityOutput {
  const jobsScore = Math.min(input.completedJobsCount / 200, 1) * 35;
  const onTimeScore = input.onTimeRate * 35;
  const credScore = Math.min(input.verifiedCredentials / 5, 1) * 20;
  const disputePenalty = input.disputeRate * 30;

  const raw = jobsScore + onTimeScore + credScore - disputePenalty + 10;
  const eligibilityScore = Math.max(0, Math.min(100, Math.round(raw)));

  return {
    eligibilityScore,
    tierRecommendation: eligibilityScore >= 70 ? "premium" : "standard",
    factors: [
      { factor: "Completed jobs", weight: Math.round(jobsScore), direction: "increases" },
      { factor: "On-time rate", weight: Math.round(onTimeScore), direction: "increases" },
      { factor: "Verified credentials", weight: Math.round(credScore), direction: "increases" },
      { factor: "Dispute rate", weight: Math.round(disputePenalty), direction: "decreases" },
    ],
  };
}
