// Delegation intelligence: three checks (authority / capacity / growth), each
// returning an Explain<T>, plus load-aware suggestions and the follow-up loop
// that catches "delegated-without-checking" (a known failure mode).

import type { Explain } from "./types";
import { findRule, type RightsRule } from "./authorityRights";
import { remainingCapacity, type CapacitySnapshot } from "./capacityTwin";
import { hoursInCategory, overlappingSkills, type GrowthGoal, type TimeAllocationRow } from "./growthPaths";

export type AuthorityCheckInput = {
  delegateRole: string;
  actionClassKey: string;
  rules: RightsRule[];
};

export function checkAuthority(input: AuthorityCheckInput): Explain<{ allowed: boolean }> {
  const rule = findRule(input.rules, input.delegateRole, input.actionClassKey);
  if (!rule) {
    return {
      result: { allowed: false },
      passed: false,
      reason: `no rights rule found for role '${input.delegateRole}' on action class '${input.actionClassKey}' — default-deny`,
      evidence: { delegateRole: input.delegateRole, actionClassKey: input.actionClassKey },
      ruleRef: "default-deny",
    };
  }
  return {
    result: { allowed: rule.allowed },
    passed: rule.allowed,
    reason: rule.allowed
      ? `role '${input.delegateRole}' holds authority for '${input.actionClassKey}' per ${rule.ruleRef}`
      : `role '${input.delegateRole}' lacks authority for '${input.actionClassKey}' per ${rule.ruleRef}`,
    evidence: { rule },
    ruleRef: rule.ruleRef,
  };
}

export type CapacityCheckInput = {
  snapshot: CapacitySnapshot;
  estimatedHours: number;
};

export function checkCapacity(input: CapacityCheckInput): Explain<{ remainingBefore: number; remainingAfter: number }> {
  const remainingBefore = remainingCapacity(input.snapshot);
  const remainingAfter = remainingBefore - input.estimatedHours;
  const passed = remainingAfter >= 0;
  return {
    result: { remainingBefore, remainingAfter },
    passed,
    reason: passed
      ? `${input.snapshot.personId} has ${remainingBefore.toFixed(1)}h free this week, task needs ${input.estimatedHours}h`
      : `${input.snapshot.personId} only has ${remainingBefore.toFixed(1)}h free this week, task needs ${input.estimatedHours}h (would overcommit by ${Math.abs(remainingAfter).toFixed(1)}h)`,
    evidence: { snapshot: input.snapshot, estimatedHours: input.estimatedHours },
    ruleRef: "capacity-twin-v1",
  };
}

export type GrowthCheckInput = {
  goal: GrowthGoal | undefined;
  taskSkillTags: string[];
  timeRows: TimeAllocationRow[];
  weekOf: string;
};

export function checkGrowth(input: GrowthCheckInput): Explain<{ overlap: string[]; underAllocated: boolean }> {
  if (!input.goal) {
    return {
      result: { overlap: [], underAllocated: false },
      passed: false,
      reason: "no stated growth goal on file — no stretch suggestion available",
      evidence: {},
    };
  }
  const overlap = overlappingSkills(input.taskSkillTags, input.goal);
  if (overlap.length === 0) {
    return {
      result: { overlap, underAllocated: false },
      passed: false,
      reason: `task skills [${input.taskSkillTags.join(", ")}] do not overlap goal '${input.goal.goalLabel}'`,
      evidence: { goal: input.goal },
    };
  }
  const spent = overlap.reduce(
    (sum, tag) => sum + hoursInCategory(input.timeRows, input.goal!.personId, input.weekOf, tag),
    0,
  );
  const underAllocated = spent < 4; // fewer than 4h/week in this skill = room to grow
  return {
    result: { overlap, underAllocated },
    passed: true,
    reason: `this task stretches skills [${overlap.join(", ")}] toward goal '${input.goal.goalLabel}'${
      underAllocated ? " and they currently have light allocation there — good timing" : ""
    }`,
    evidence: { goal: input.goal, hoursSpentThisWeek: spent },
  };
}

export type DelegationDecision = {
  authority: Explain<{ allowed: boolean }>;
  capacity: Explain<{ remainingBefore: number; remainingAfter: number }>;
  growth: Explain<{ overlap: string[]; underAllocated: boolean }>;
  /** Blocking checks must BOTH pass, or an explicit human override is required. */
  blocked: boolean;
  blockReasons: string[];
};

export function evaluateDelegation(
  authorityInput: AuthorityCheckInput,
  capacityInput: CapacityCheckInput,
  growthInput: GrowthCheckInput,
): DelegationDecision {
  const authority = checkAuthority(authorityInput);
  const capacity = checkCapacity(capacityInput);
  const growth = checkGrowth(growthInput);
  const blockReasons: string[] = [];
  if (!authority.passed) blockReasons.push(`authority: ${authority.reason}`);
  if (!capacity.passed) blockReasons.push(`capacity: ${capacity.reason}`);
  return { authority, capacity, growth, blocked: blockReasons.length > 0, blockReasons };
}

// ---------------------------------------------------------------------------
// Follow-up loop: delegated-without-checking
// ---------------------------------------------------------------------------

export type DelegationForFollowup = {
  id: string;
  delegatorId: string;
  delegateId: string;
  task: string;
  status: string;
  createdAt: Date;
  lastCheckinAt: Date | null;
};

/**
 * A delegation that's been "accepted" for more than `staleDays` without a
 * check-in is flagged. The nudge is drafted FOR THE DELEGATOR ("check in on
 * the thing you handed off"), never auto-escalated to or past the delegate —
 * see Phase 5 risk #2 for why.
 */
export function findStaleDelegations(
  delegations: DelegationForFollowup[],
  now: Date,
  staleDays = 3,
): DelegationForFollowup[] {
  const staleMs = staleDays * 24 * 60 * 60 * 1000;
  return delegations.filter((d) => {
    if (d.status !== "accepted") return false;
    const lastTouch = d.lastCheckinAt ?? d.createdAt;
    return now.getTime() - lastTouch.getTime() > staleMs;
  });
}

// ---------------------------------------------------------------------------
// Load-aware delegate suggestions
// ---------------------------------------------------------------------------

export type SuggestionCandidate = {
  personId: string;
  role: string;
  snapshot: CapacitySnapshot;
  goal: GrowthGoal | undefined;
};

export type DelegationSuggestion = {
  personId: string;
  score: number;
  decision: DelegationDecision;
};

export function suggestDelegates(
  candidates: SuggestionCandidate[],
  actionClassKey: string,
  rules: RightsRule[],
  estimatedHours: number,
  taskSkillTags: string[],
  timeRows: TimeAllocationRow[],
  weekOf: string,
): DelegationSuggestion[] {
  const suggestions = candidates.map((c) => {
    const decision = evaluateDelegation(
      { delegateRole: c.role, actionClassKey, rules },
      { snapshot: c.snapshot, estimatedHours },
      { goal: c.goal, taskSkillTags, timeRows, weekOf },
    );
    let score = 0;
    if (decision.authority.passed) score += 50;
    if (decision.capacity.passed) score += 30 + Math.min(20, decision.capacity.result.remainingAfter);
    if (decision.growth.passed && decision.growth.result.overlap.length > 0) score += 15;
    if (decision.growth.result.underAllocated) score += 5;
    if (decision.blocked) score = -1; // never suggest a blocked delegate first
    return { personId: c.personId, score, decision };
  });
  return suggestions.sort((a, b) => b.score - a.score);
}
