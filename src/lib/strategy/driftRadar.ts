// Drift Radar: objectives whose KR evidence contradicts asserted progress,
// plus low-confidence assertions, surfaced as Findings consistent with the
// alignmentEngine Finding shape so every strategy surface renders findings
// the same way.
import { computeKeyResultProgress } from "./okrsEngine";
import type { EvidenceRefInput, Finding, KeyResultInput, ObjectiveNode } from "./strategyModels";

// Threshold above which a divergence between a stale hand-assertion and the
// most recent evidence counts as "drift" worth flagging. Documented policy:
// 0.15 (15 percentage points of progress) — small enough to catch real
// divergence, large enough to avoid flagging normal estimation noise.
export const DRIFT_THRESHOLD = 0.15;

export interface DriftCandidate {
  keyResultId: string;
  objectiveId: string;
  assertedProgress: number;
  evidenceProgress: number;
  divergence: number;
}

/**
 * A KR can only "drift" (asserted vs. evidence disagreement) if it has BOTH
 * a hand-typed `current` value AND at least one evidence ref — i.e. someone
 * is still hand-tracking a number that evidence has since overtaken. Because
 * computeKeyResultProgress always prefers evidence when present, we
 * recompute the "what if there were no evidence" case to get the asserted
 * progress for comparison.
 */
export function findDrift(
  objectives: ObjectiveNode[],
  keyResults: KeyResultInput[],
  evidence: EvidenceRefInput[],
): Finding[] {
  const findings: Finding[] = [];
  const objById = new Map(objectives.map((o) => [o.id, o]));

  for (const kr of keyResults) {
    const refs = evidence.filter((e) => e.keyResultId === kr.id);
    if (refs.length === 0) {
      // No evidence at all: flag low-confidence assertions explicitly, this
      // is a transparency finding, not a contradiction.
      if (kr.confidenceClass === "low" || !kr.confidenceClass) {
        findings.push({
          id: `drift-low-confidence-${kr.id}`,
          kind: "low_confidence_assertion",
          severity: "warning",
          summary: `"${kr.title}" progress is hand-asserted with low/no declared confidence`,
          detail:
            "No evidence refs exist for this key result, and its confidenceClass is low or undeclared. Treat the reported progress as a guess, not a fact.",
          relatedObjectiveIds: [kr.objectiveId],
          relatedInitiativeIds: [],
          evidenceRefIds: [],
        });
      }
      continue;
    }

    const withEvidence = computeKeyResultProgress(kr, refs);
    const withoutEvidence = computeKeyResultProgress(kr, []); // forces the asserted path
    const divergence = Math.abs(withEvidence.progress - withoutEvidence.progress);

    if (divergence > DRIFT_THRESHOLD) {
      const obj = objById.get(kr.objectiveId);
      findings.push({
        id: `drift-${kr.id}`,
        kind: "progress_drift",
        severity: divergence > 0.35 ? "critical" : "warning",
        summary: `"${kr.title}" asserted progress disagrees with evidence by ${(divergence * 100).toFixed(0)} pts`,
        detail: `Hand-typed current value implies ${(withoutEvidence.progress * 100).toFixed(
          0,
        )}% progress, but the latest evidence (ref ${withEvidence.latestEvidenceId}, observed ${
          withEvidence.latestEvidenceObservedAt
        }) implies ${(withEvidence.progress * 100).toFixed(0)}%. Objective: "${obj?.title ?? kr.objectiveId}".`,
        relatedObjectiveIds: [kr.objectiveId],
        relatedInitiativeIds: [],
        evidenceRefIds: withEvidence.latestEvidenceId ? [withEvidence.latestEvidenceId] : [],
      });
    }
  }

  return findings;
}
