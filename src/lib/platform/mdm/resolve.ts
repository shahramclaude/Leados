// src/lib/platform/mdm/resolve.ts
//
// Entity resolution policy: thresholds + classification. This is the ONLY
// place auto-merge is decided, so the "never auto-merge below threshold" gate
// is enforced in one function and unit-testable in isolation.
import type { NormalizedLead } from "../types";
import { scoreMatch, type MatchScore } from "./matchRules";

export const CANDIDATE_THRESHOLD = 0.45; // below this, not even queued for human review
export const AUTO_MERGE_THRESHOLD = 0.95; // AND requires an exact email match

export type MatchDecision = "auto_duplicate" | "pending_review" | "none";

export function classifyMatch(matchScore: MatchScore): MatchDecision {
  if (matchScore.score >= AUTO_MERGE_THRESHOLD && matchScore.emailExact) {
    return "auto_duplicate";
  }
  if (matchScore.score >= CANDIDATE_THRESHOLD) {
    return "pending_review";
  }
  return "none";
}

export interface CandidateEntity {
  id: string;
  record: NormalizedLead;
}

export interface ResolutionResult {
  entityId: string;
  decision: MatchDecision;
  matchScore: MatchScore;
}

/** Scores a new/incoming record against every existing candidate entity and returns best match(es) above threshold. */
export function resolveAgainstEntities(incoming: NormalizedLead, candidates: CandidateEntity[]): ResolutionResult[] {
  const results: ResolutionResult[] = [];
  for (const candidate of candidates) {
    const matchScore = scoreMatch(incoming, candidate.record);
    const decision = classifyMatch(matchScore);
    if (decision !== "none") {
      results.push({ entityId: candidate.id, decision, matchScore });
    }
  }
  // Highest score first so callers pick the best candidate deterministically.
  return results.sort((a, b) => b.matchScore.score - a.matchScore.score);
}
