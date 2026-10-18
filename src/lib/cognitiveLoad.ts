// The Cognitive Load Architecture — a small, concrete slice of the pasted
// brief's "UI that manages its own cognitive impact": a load score derived
// from how much is currently being asked of the user, mapped to a UI
// density the Shell actually obeys (collapsing secondary detail at HIGH).
//
// Original implementation for this sandbox. Simplified relative to the
// pasted brief (no continuous background timer / fatigue model — this is a
// static build with no server, so load is recomputed on each render instead
// of "continuously"), and that simplification is disclosed here rather than
// implied away.

import type { CognitiveLoadLevel } from './types';

export interface CognitiveLoadInput {
  openFindings: number;
  openHypotheses: number;
  emergentAnomalies: number;
  pendingProposals: number;
}

export interface CognitiveLoadResult {
  score: number; // 0-100
  level: CognitiveLoadLevel;
  label: string;
}

export function computeCognitiveLoad(input: CognitiveLoadInput): CognitiveLoadResult {
  // Weighted sum, capped. Weights reflect rough "attention cost" per item type:
  // a pending proposal demands a decision (heaviest), an anomaly demands
  // interpretation, a finding/hypothesis is lighter (already triaged).
  const raw =
    input.openFindings * 3 +
    input.openHypotheses * 4 +
    input.emergentAnomalies * 6 +
    input.pendingProposals * 10;

  const score = Math.max(0, Math.min(100, raw));
  const level: CognitiveLoadLevel = score < 30 ? 'LOW' : score < 65 ? 'MEDIUM' : 'HIGH';

  return {
    score,
    level,
    label:
      level === 'HIGH'
        ? 'High cognitive load: the interface is collapsing secondary detail so the highest-priority items stay reachable.'
        : level === 'MEDIUM'
        ? 'Moderate cognitive load: full detail is still shown, but new auto-generated items will be summarized first.'
        : 'Low cognitive load: full detail shown everywhere.',
  };
}
