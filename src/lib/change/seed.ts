import { rngFromKey } from "@/lib/prng";
import { assignSteppedWedge } from "./rollout";
import { explain } from "@/lib/explain";
import type { ChangeProgram, Intervention, TargetBehavior } from "./types";

/**
 * Deterministic demo/seed data for the Transformation Dashboard. Everything
 * here is synthetic and generated from fixed seeds via `src/lib/prng.ts`, so
 * re-seeding is idempotent and reproducible — useful for demos and for the
 * privacy/fairness attempt-matrix tests that need a known fixture.
 */

export interface SeedGroup {
  id: string;
  name: string;
  department: string;
  headcount: number;
  capacityHeadroom: number;
}

export interface SeedPerson {
  id: string;
  groupId: string;
  trainingCompletionPct: number;
}

export interface SeedEvent {
  programId: string | null;
  groupId: string;
  personId: string;
  proxyEventType: string;
  periodIndex: number;
  occurredAt: Date;
}

export const SEED_GROUPS: SeedGroup[] = [
  { id: "eng-platform", name: "Platform Engineering", department: "Engineering", headcount: 40, capacityHeadroom: 0.32 },
  { id: "eng-mobile", name: "Mobile Engineering", department: "Engineering", headcount: 22, capacityHeadroom: 0.55 },
  { id: "sales-west", name: "Sales - West", department: "Sales", headcount: 18, capacityHeadroom: 0.4 },
  { id: "sales-east", name: "Sales - East", department: "Sales", headcount: 16, capacityHeadroom: 0.62 },
  { id: "support-tier1", name: "Support Tier 1", department: "Support", headcount: 35, capacityHeadroom: 0.22 },
  { id: "finance-ops", name: "Finance Ops", department: "Finance", headcount: 4, capacityHeadroom: 0.7 },
];

const TARGET_BEHAVIORS: Record<string, TargetBehavior> = {
  cicd: { behavior: "Engineers trigger builds through the new CI/CD pipeline", observableProxy: "feature_usage", proxyEventType: "cicd_pipeline_run" },
  expense: { behavior: "Employees submit expenses via the new policy workflow", observableProxy: "process_conformance", proxyEventType: "expense_new_policy_submit" },
  playbook: { behavior: "Support agents follow the new playbook steps", observableProxy: "process_conformance", proxyEventType: "playbook_v2_step_complete" },
  ritual: { behavior: "Teams attend standups and retrospectives", observableProxy: "ritual_participation", proxyEventType: "agile_ritual_attendance" },
  security: { behavior: "Engineers complete recurring security drills", observableProxy: "feature_usage", proxyEventType: "security_drill_complete" },
  codeReview: { behavior: "Engineers use the new PR review checklist", observableProxy: "process_conformance", proxyEventType: "pr_checklist_used" },
};

export const SEED_PROGRAMS: ChangeProgram[] = [
  {
    id: "prog-cicd",
    intent: "Move all services onto the centralized CI/CD pipeline",
    targetBehaviors: [TARGET_BEHAVIORS.cicd],
    affectedGroups: ["eng-platform", "eng-mobile"],
    resistanceMap: [
      { group: "eng-platform", driver: "Fear of breaking legacy release scripts", mitigation: "Parallel-run old and new pipeline for 2 sprints" },
    ],
    status: "active",
    startDate: "2025-11-01",
    loadWeight: 1.0,
  },
  {
    id: "prog-expense",
    intent: "Roll out the simplified expense policy and workflow",
    targetBehaviors: [TARGET_BEHAVIORS.expense],
    affectedGroups: ["finance-ops", "sales-west", "sales-east"],
    resistanceMap: [
      { group: "sales-west", driver: "Travel-heavy reps dislike the new receipt-upload step", mitigation: "Add mobile photo-capture shortcut" },
    ],
    status: "active",
    startDate: "2025-10-15",
    loadWeight: 1.0,
  },
  {
    id: "prog-playbook",
    intent: "Adopt the v2 customer support playbook",
    targetBehaviors: [TARGET_BEHAVIORS.playbook],
    affectedGroups: ["support-tier1"],
    resistanceMap: [
      { group: "support-tier1", driver: "Playbook adds steps to already time-pressured calls", mitigation: "Trim playbook to top 5 scenarios first" },
    ],
    status: "active",
    startDate: "2025-11-10",
    loadWeight: 1.2,
  },
  {
    id: "prog-ritual",
    intent: "Establish consistent agile ritual participation",
    targetBehaviors: [TARGET_BEHAVIORS.ritual],
    affectedGroups: ["eng-platform", "eng-mobile", "support-tier1"],
    resistanceMap: [],
    status: "active",
    startDate: "2025-09-20",
    loadWeight: 0.8,
  },
  {
    id: "prog-security",
    intent: "Mandate recurring security drills",
    targetBehaviors: [TARGET_BEHAVIORS.security],
    affectedGroups: ["eng-platform"],
    resistanceMap: [],
    status: "active",
    startDate: "2025-11-20",
    loadWeight: 1.0,
  },
  {
    id: "prog-codereview",
    intent: "Introduce the new PR review checklist",
    targetBehaviors: [TARGET_BEHAVIORS.codeReview],
    affectedGroups: ["eng-platform"],
    resistanceMap: [
      { group: "eng-platform", driver: "Perceived as slowing down shipping velocity", mitigation: "Pair checklist with a 48h review SLA" },
    ],
    status: "active",
    startDate: "2025-12-01",
    loadWeight: 1.0,
  },
];

export const SEED_INTERVENTIONS: Intervention[] = [
  {
    id: "interv-cicd-pairing",
    programId: "prog-cicd",
    kind: "Pairing-session blitz with platform champions",
    cost: 8000,
    expectedEffect: explain(0.15, "planning_estimate_v1", { basis: "similar pairing programs elsewhere" }, {
      confidence: "low",
      caveats: ["Expectation is a hypothesis from the program owner, not a measured baseline."],
    }),
    status: "running",
    startDate: "2025-12-01",
  },
];

function weeksBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (7 * 86400000));
}

/**
 * Per (program, group) adoption trajectory: starting weekly participation
 * probability and the per-week change in that probability. Crafted to
 * produce a mix of improving, flat, and stalling stories across the demo
 * dashboard (not fit to any real outcome).
 */
const TRAJECTORY: Record<string, { base: number; weeklyDelta: number }> = {
  "prog-cicd:eng-platform": { base: 0.2, weeklyDelta: 0.01 }, // stalling
  "prog-cicd:eng-mobile": { base: 0.3, weeklyDelta: 0.05 }, // improving
  "prog-expense:finance-ops": { base: 0.5, weeklyDelta: 0.06 },
  "prog-expense:sales-west": { base: 0.25, weeklyDelta: 0.02 },
  "prog-expense:sales-east": { base: 0.4, weeklyDelta: 0.05 },
  "prog-playbook:support-tier1": { base: 0.35, weeklyDelta: 0.03 },
  "prog-ritual:eng-platform": { base: 0.45, weeklyDelta: 0.02 },
  "prog-ritual:eng-mobile": { base: 0.55, weeklyDelta: 0.03 },
  "prog-ritual:support-tier1": { base: 0.4, weeklyDelta: 0.015 },
  "prog-security:eng-platform": { base: 0.3, weeklyDelta: 0.02 },
  "prog-codereview:eng-platform": { base: 0.15, weeklyDelta: -0.01 }, // declining
};

export function buildSeedPeople(): SeedPerson[] {
  const people: SeedPerson[] = [];
  for (const group of SEED_GROUPS) {
    for (let i = 0; i < group.headcount; i++) {
      const rng = rngFromKey(`person:${group.id}:${i}`);
      const trainingCompletionPct = Math.round(Math.min(100, Math.max(0, (0.4 + rng() * 0.6) * 100)));
      people.push({ id: `${group.id}-p${i}`, groupId: group.id, trainingCompletionPct });
    }
  }
  return people;
}

export function buildSeedEvents(people: readonly SeedPerson[], now: Date, lookbackWeeks = 8): SeedEvent[] {
  const events: SeedEvent[] = [];
  const peopleByGroup = new Map<string, SeedPerson[]>();
  for (const p of people) {
    if (!peopleByGroup.has(p.groupId)) peopleByGroup.set(p.groupId, []);
    peopleByGroup.get(p.groupId)!.push(p);
  }

  for (const program of SEED_PROGRAMS) {
    const behavior = program.targetBehaviors[0];
    for (const groupId of program.affectedGroups) {
      const trajectoryKey = `${program.id}:${groupId}`;
      const traj = TRAJECTORY[trajectoryKey] ?? { base: 0.3, weeklyDelta: 0.02 };
      const groupPeople = peopleByGroup.get(groupId) ?? [];
      for (const person of groupPeople) {
        for (let week = 0; week < lookbackWeeks; week++) {
          const rng = rngFromKey(`event:${program.id}:${person.id}:${week}`);
          const prob = Math.max(0.02, Math.min(0.95, traj.base + traj.weeklyDelta * week));
          if (rng() < prob) {
            const occurredAt = new Date(now.getTime() - (lookbackWeeks - week) * 7 * 86400000 + Math.floor(rng() * 5) * 86400000);
            events.push({
              programId: program.id,
              groupId,
              personId: person.id,
              proxyEventType: behavior.proxyEventType,
              periodIndex: week,
              occurredAt,
            });
          }
        }
      }
    }
  }
  return events;
}

export function buildSteppedWedgeForIntervention(intervention: Intervention, groupIds: readonly string[], periods = 6) {
  return assignSteppedWedge(groupIds, periods, `rollout:${intervention.id}`);
}

export function _weeksBetweenForTest(a: Date, b: Date): number {
  return weeksBetween(a, b);
}
