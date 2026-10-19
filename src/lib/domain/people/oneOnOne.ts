// 1:1 engine: talking-point suggestions (advisory, never auto-sent) and
// commitment follow-through scoring.

import type { Commitment, TalkingPointSuggestion } from "../types";

export interface RecentSignals {
  daysSinceLastGrowthConversation: number | null;
  goalsAtRisk: string[];
  missedCommitments: Commitment[];
  recentSkillEvidence: string[];
  managerChangedRecently: boolean;
}

/**
 * Suggests talking points from recent signals. These are *suggestions* a
 * manager reviews and chooses to raise — the API layer must never expose a
 * path that sends these directly to the employee without a human in the
 * loop. See src/app/api/people/[id]/one-on-ones/route.ts.
 */
export function suggestTalkingPoints(signals: RecentSignals): TalkingPointSuggestion[] {
  const suggestions: TalkingPointSuggestion[] = [];

  if (signals.daysSinceLastGrowthConversation == null || signals.daysSinceLastGrowthConversation > 90) {
    suggestions.push({
      topic: "Career growth check-in",
      reason: "No growth conversation recorded in the last 90 days.",
      sourceSignal: "growth_conversation_recency",
    });
  }

  if (signals.goalsAtRisk.length > 0) {
    suggestions.push({
      topic: `At-risk goals: ${signals.goalsAtRisk.join(", ")}`,
      reason: "One or more goals are currently flagged at risk.",
      sourceSignal: "goals_at_risk",
    });
  }

  if (signals.missedCommitments.length > 0) {
    suggestions.push({
      topic: "Revisit missed commitments",
      reason: `${signals.missedCommitments.length} commitment(s) from prior 1:1s were missed.`,
      sourceSignal: "commitment_follow_through",
    });
  }

  if (signals.managerChangedRecently) {
    suggestions.push({
      topic: "Working-relationship check-in",
      reason: "Manager changed recently; worth confirming expectations and working style.",
      sourceSignal: "manager_change",
    });
  }

  if (signals.recentSkillEvidence.length > 0) {
    suggestions.push({
      topic: `Recognize recent growth: ${signals.recentSkillEvidence.join(", ")}`,
      reason: "New skill evidence was recorded since the last 1:1.",
      sourceSignal: "skill_evidence",
    });
  }

  return suggestions;
}

export interface FollowThroughScore {
  rate: number; // 0..1
  done: number;
  missed: number;
  open: number;
  explanation: string;
}

export function scoreFollowThrough(commitments: Commitment[]): FollowThroughScore {
  const done = commitments.filter((c) => c.status === "done").length;
  const missed = commitments.filter((c) => c.status === "missed").length;
  const open = commitments.filter((c) => c.status === "open").length;
  const resolved = done + missed;
  const rate = resolved === 0 ? 1 : done / resolved;

  return {
    rate: Number(rate.toFixed(2)),
    done,
    missed,
    open,
    explanation:
      resolved === 0
        ? "No commitments have been resolved yet."
        : `${done} of ${resolved} resolved commitments were completed (${open} still open).`,
  };
}
