// Synthetic data generation, used for (a) the `/api/strategy/seed` demo
// endpoint that powers the UI pages, and (b) the 100-objective performance
// test fixture (Phase 4 Gate 5). Generation is pure / in-memory so the perf
// test never depends on database latency — it measures the alignment engine
// algorithms themselves.
import type {
  EvidenceRefInput,
  InitiativeNode,
  KeyResultInput,
  MilestoneNode,
  ObjectiveLinkEdge,
  ObjectiveNode,
  TeamNode,
} from "./strategyModels";

export interface SyntheticOrg {
  teams: TeamNode[];
  objectives: ObjectiveNode[];
  links: ObjectiveLinkEdge[];
  keyResults: KeyResultInput[];
  evidence: EvidenceRefInput[];
  initiatives: InitiativeNode[];
  milestones: MilestoneNode[];
}

/**
 * Builds a synthetic org with `objectiveCount` objectives arranged as a
 * roughly-balanced tree (fan-out 4) rolling up to one north-star-aligned
 * company objective, each with 2 KRs (one evidence-backed, one asserted) and
 * 1-2 initiatives with 3 milestones each. Deterministic given `seed`.
 */
export function generateSyntheticOrg(objectiveCount = 100, seed = 7): SyntheticOrg {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const teams: TeamNode[] = Array.from({ length: 6 }, (_, i) => ({
    id: `team-${i}`,
    name: `Team ${i + 1}`,
    capacityHoursPerWeek: 80,
    skills: ["engineering", "design", "data"].slice(0, 1 + (i % 3)),
  }));

  const objectives: ObjectiveNode[] = [];
  const links: ObjectiveLinkEdge[] = [];
  const keyResults: KeyResultInput[] = [];
  const evidence: EvidenceRefInput[] = [];
  const initiatives: InitiativeNode[] = [];
  const milestones: MilestoneNode[] = [];

  const root: ObjectiveNode = {
    id: "obj-root",
    title: "Company North Star: durable growth",
    level: "company",
    timeframe: "2026-FY",
    ownerName: "CEO",
    status: "active",
    stretch: false,
    isNorthStarAligned: true,
    parentId: null,
    priorityRank: 1,
  };
  objectives.push(root);

  const fanOut = 4;
  let created = 1;
  const frontier: string[] = [root.id];
  let frontierIdx = 0;

  while (created < objectiveCount) {
    const parentId = frontier[frontierIdx % frontier.length];
    frontierIdx++;
    for (let i = 0; i < fanOut && created < objectiveCount; i++) {
      const id = `obj-${created}`;
      const obj: ObjectiveNode = {
        id,
        title: `Objective ${created}`,
        level: created < 7 ? "team" : "individual",
        timeframe: "2026-Q1",
        ownerName: `Owner ${created % 23}`,
        status: "active",
        stretch: created % 3 === 0,
        isNorthStarAligned: false,
        parentId,
        priorityRank: 50 + created,
      };
      objectives.push(obj);
      links.push({ id: `link-${id}`, fromObjectiveId: id, toObjectiveId: parentId, linkType: "contributes_to" });
      frontier.push(id);
      created++;

      const teamId = teams[created % teams.length].id;

      const krEvidenceId = `kr-${id}-a`;
      keyResults.push({
        id: krEvidenceId,
        objectiveId: id,
        title: `Grow metric for ${obj.title}`,
        baseline: 0,
        target: 100,
        current: 0,
        unit: "pts",
        direction: "up",
        progressMode: "linear",
        weight: 0.6,
        stretch: obj.stretch,
        confidenceClass: null,
        milestonesTotal: null,
        milestonesComplete: null,
        thresholdValue: null,
      });
      evidence.push({
        id: `ev-${id}-a`,
        keyResultId: krEvidenceId,
        sourceType: "metric_series",
        sourceId: `metric-${id}`,
        value: Math.round(rand() * 100),
        observedAt: new Date(2026, 0, 1 + (created % 28)).toISOString(),
        note: null,
      });

      const krAssertedId = `kr-${id}-b`;
      keyResults.push({
        id: krAssertedId,
        objectiveId: id,
        title: `Qualitative milestone for ${obj.title}`,
        baseline: 0,
        target: 1,
        current: rand(),
        unit: "ratio",
        direction: "up",
        progressMode: "linear",
        weight: 0.4,
        stretch: obj.stretch,
        confidenceClass: rand() > 0.5 ? "medium" : "low",
        milestonesTotal: null,
        milestonesComplete: null,
        thresholdValue: null,
      });

      const initId = `init-${id}`;
      const jobSize = 1 + Math.floor(rand() * 9);
      initiatives.push({
        id: initId,
        objectiveId: id,
        teamId,
        title: `Deliver for ${obj.title}`,
        status: rand() > 0.85 ? "blocked" : "in_progress",
        blockerNote: null,
        budgetAllocated: Math.round(rand() * 50000),
        budgetSpent: 0,
        timeCriticality: 1 + Math.floor(rand() * 9),
        riskReduction: 1 + Math.floor(rand() * 9),
        userValue: 1 + Math.floor(rand() * 9),
        jobSize,
        requiredSkill: teams[created % teams.length].skills[0] ?? "engineering",
        requiredHoursPerWeek: 10 + Math.round(rand() * 20),
        startDate: new Date(2026, 0, 1).toISOString(),
        targetEndDate: new Date(2026, 2, 28).toISOString(),
      });

      let prevMilestoneId: string | null = null;
      for (let m = 0; m < 3; m++) {
        const msId = `${initId}-ms-${m}`;
        milestones.push({
          id: msId,
          initiativeId: initId,
          name: `Milestone ${m + 1}`,
          sequence: m,
          dependsOnMilestoneId: prevMilestoneId,
          optimisticDays: 3 + rand() * 2,
          mostLikelyDays: 7 + rand() * 3,
          pessimisticDays: 14 + rand() * 5,
          status: "planned",
        });
        prevMilestoneId = msId;
      }
    }
  }

  return { teams, objectives, links, keyResults, evidence, initiatives, milestones };
}
