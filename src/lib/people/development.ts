// src/lib/people/development.ts
//
// Growth plans: gap -> learning path -> evidence milestones, written from the
// PERSON'S perspective first (what *they* would read), not a management
// report about them.

import { getSkill } from "./skillsOntology";
import type { NamedGap } from "./types";

export interface LearningStep {
  skillId: string;
  skillName: string;
  fromLevel: number;
  toLevel: number;
  activity: string;
  evidenceMilestone: string;
}

export interface GrowthPlan {
  personId: string;
  roleId: string;
  roleName: string;
  generatedAt: string;
  narrative: string;
  steps: LearningStep[];
}

function activityForLevel(skillName: string, toLevel: number): string {
  if (toLevel <= 2) return `Pair with someone level 3+ in ${skillName} on a real task and ask them to review your approach, not just your output.`;
  if (toLevel === 3) return `Take ownership of a task in ${skillName} end-to-end without a pair, including handling at least one edge case you didn't anticipate.`;
  if (toLevel === 4) return `Lead a project that stresses ${skillName} in an ambiguous situation, and review someone else's work in this area.`;
  return `Define how the team approaches ${skillName}; mentor at least one person toward level 4.`;
}

function milestoneForLevel(skillName: string, toLevel: number): string {
  if (toLevel <= 2) return `An endorsement from the person you paired with, describing the specific task.`;
  if (toLevel === 3) return `A demonstrated-by-work-evidence entry: a shipped artifact plus a one-line note on the edge case you handled.`;
  if (toLevel === 4) return `Two demonstrated-by-work-evidence entries at level 4, at least one endorsed by someone outside your immediate team.`;
  return `A demonstrated track record (3+ entries) plus an endorsement from someone you mentored.`;
}

export function gapsToLearningPath(roleId: string, roleName: string, personId: string, gaps: NamedGap[], now: Date = new Date()): GrowthPlan {
  const steps: LearningStep[] = gaps.map((gap) => {
    const skillName = getSkill(gap.skillId)?.name ?? gap.skillName;
    const toLevel = gap.requiredLevel;
    return {
      skillId: gap.skillId,
      skillName,
      fromLevel: gap.currentLevel,
      toLevel,
      activity: activityForLevel(skillName, toLevel),
      evidenceMilestone: milestoneForLevel(skillName, toLevel),
    };
  });

  const narrative =
    steps.length === 0
      ? `You already meet every core-skill bar we have evidence for on ${roleName}. There's nothing blocking you here on skills — readiness conversations from this point are about role availability and timing, not more work on your end.`
      : `Here's what's between you and ${roleName} today, in order of size of the gap. Each step says what "done" looks like and what evidence would prove it — these are the same milestones your manager and the succession view will see, nothing hidden.`;

  return { personId, roleId, roleName, generatedAt: now.toISOString(), narrative, steps };
}
