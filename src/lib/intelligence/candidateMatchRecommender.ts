// LEADOS intelligence engine — candidate/job matching recommender (Part 51).
export const SYSTEM_ID = "candidate-match-recommender-v2";

export interface CandidateMatchInput {
  skillMatch: number; // 0..1
  proximityKm: number;
  pastRating: number; // 0..5
  availabilityScore: number; // 0..1
}

export interface CandidateMatchOutput {
  matchScore: number; // 0..100
  rank: number | null;
  factors: Array<{ factor: string; weight: number; direction: "increases" | "decreases" }>;
}

/** Ranks worker candidates for a job posting. decisionRole: recommend. */
export function recommendCandidateMatch(input: CandidateMatchInput): CandidateMatchOutput {
  const skillComponent = input.skillMatch * 45;
  const proximityComponent = Math.max(0, 25 - input.proximityKm) * 1.0;
  const ratingComponent = (input.pastRating / 5) * 20;
  const availabilityComponent = input.availabilityScore * 10;

  const matchScore = Math.max(
    0,
    Math.min(100, Math.round(skillComponent + proximityComponent + ratingComponent + availabilityComponent)),
  );

  return {
    matchScore,
    rank: null,
    factors: [
      { factor: "Skill match", weight: Math.round(skillComponent), direction: "increases" },
      { factor: "Proximity", weight: Math.round(proximityComponent), direction: "increases" },
      { factor: "Past rating", weight: Math.round(ratingComponent), direction: "increases" },
      { factor: "Availability", weight: Math.round(availabilityComponent), direction: "increases" },
    ],
  };
}

/** Convenience helper to rank a batch and assign a 1-based rank field. */
export function rankCandidateMatches(inputs: CandidateMatchInput[]): CandidateMatchOutput[] {
  const scored = inputs.map(recommendCandidateMatch);
  const ordered = [...scored].sort((a, b) => b.matchScore - a.matchScore);
  ordered.forEach((item, idx) => {
    item.rank = idx + 1;
  });
  return scored;
}
