import { describe, expect, it } from "vitest";
import {
  buildGraph,
  cascadeCompletenessFor,
  detectCapacityConflicts,
  detectCycles,
  detectOrphanObjectives,
  linkIntegrityFindings,
  strategyPath,
} from "@/lib/strategy/alignmentEngine";
import type {
  EvidenceRefInput,
  InitiativeNode,
  KeyResultInput,
  ObjectiveLinkEdge,
  ObjectiveNode,
  TeamNode,
} from "@/lib/strategy/strategyModels";

function obj(partial: Partial<ObjectiveNode> & { id: string }): ObjectiveNode {
  return {
    title: partial.id,
    level: "team",
    timeframe: "2026-Q1",
    ownerName: "owner",
    status: "active",
    stretch: false,
    isNorthStarAligned: false,
    parentId: null,
    priorityRank: 100,
    ...partial,
  };
}

describe("cascade integrity: cycle detection", () => {
  it("detects a direct cycle (A -> B -> A)", () => {
    const objectives = [obj({ id: "A" }), obj({ id: "B" })];
    const links: ObjectiveLinkEdge[] = [
      { id: "l1", fromObjectiveId: "A", toObjectiveId: "B", linkType: "contributes_to" },
      { id: "l2", fromObjectiveId: "B", toObjectiveId: "A", linkType: "contributes_to" },
    ];
    const graph = buildGraph(objectives, links);
    const cycles = detectCycles(graph, "contributes_to");
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("detects a longer cycle (A -> B -> C -> A)", () => {
    const objectives = [obj({ id: "A" }), obj({ id: "B" }), obj({ id: "C" })];
    const links: ObjectiveLinkEdge[] = [
      { id: "l1", fromObjectiveId: "A", toObjectiveId: "B", linkType: "contributes_to" },
      { id: "l2", fromObjectiveId: "B", toObjectiveId: "C", linkType: "contributes_to" },
      { id: "l3", fromObjectiveId: "C", toObjectiveId: "A", linkType: "contributes_to" },
    ];
    const graph = buildGraph(objectives, links);
    const cycles = detectCycles(graph, "contributes_to");
    expect(cycles.length).toBeGreaterThan(0);
  });

  it("finds no cycles in a clean DAG", () => {
    const objectives = [obj({ id: "A" }), obj({ id: "B" }), obj({ id: "root", isNorthStarAligned: true })];
    const links: ObjectiveLinkEdge[] = [
      { id: "l1", fromObjectiveId: "A", toObjectiveId: "root", linkType: "contributes_to" },
      { id: "l2", fromObjectiveId: "B", toObjectiveId: "root", linkType: "contributes_to" },
    ];
    const graph = buildGraph(objectives, links);
    expect(detectCycles(graph, "contributes_to")).toHaveLength(0);
  });
});

describe("cascade integrity: orphan detection", () => {
  it("flags an objective with no parent and no contributes_to edge", () => {
    const objectives = [obj({ id: "root", isNorthStarAligned: true }), obj({ id: "orphan" })];
    const links: ObjectiveLinkEdge[] = [];
    const graph = buildGraph(objectives, links);
    const orphans = detectOrphanObjectives(graph);
    expect(orphans.map((o) => o.id)).toEqual(["orphan"]);
  });

  it("does not flag the north-star-aligned root", () => {
    const objectives = [obj({ id: "root", isNorthStarAligned: true })];
    const graph = buildGraph(objectives, []);
    expect(detectOrphanObjectives(graph)).toHaveLength(0);
  });

  it("does not flag an objective with a parentId even without a contributes_to edge", () => {
    const objectives = [obj({ id: "root", isNorthStarAligned: true }), obj({ id: "child", parentId: "root" })];
    const graph = buildGraph(objectives, []);
    expect(detectOrphanObjectives(graph)).toHaveLength(0);
  });
});

describe("cascade completeness scoring", () => {
  const objective = obj({ id: "A" });

  it("scores 0 completeness with no KRs, no initiatives, no evidence", () => {
    const result = cascadeCompletenessFor(objective, [], [], []);
    expect(result.completenessScore).toBe(0);
    expect(result.findings.some((f) => f.kind === "cascade_no_key_results")).toBe(true);
    expect(result.findings.some((f) => f.kind === "cascade_no_initiatives")).toBe(true);
  });

  it("scores 1 completeness with KRs, initiatives, and evidence all present", () => {
    const kr: KeyResultInput = {
      id: "kr1",
      objectiveId: "A",
      title: "kr",
      baseline: 0,
      target: 10,
      current: 0,
      unit: "",
      direction: "up",
      progressMode: "linear",
      weight: 1,
      stretch: false,
      confidenceClass: null,
      milestonesTotal: null,
      milestonesComplete: null,
      thresholdValue: null,
    };
    const initiative: InitiativeNode = {
      id: "i1",
      objectiveId: "A",
      teamId: null,
      title: "init",
      status: "in_progress",
      blockerNote: null,
      budgetAllocated: 0,
      budgetSpent: 0,
      timeCriticality: 5,
      riskReduction: 5,
      userValue: 5,
      jobSize: 5,
      requiredSkill: null,
      requiredHoursPerWeek: 10,
      startDate: null,
      targetEndDate: null,
    };
    const evidence: EvidenceRefInput[] = [
      { id: "ev1", keyResultId: "kr1", sourceType: "manual", sourceId: null, value: 5, observedAt: new Date().toISOString(), note: null },
    ];
    const result = cascadeCompletenessFor(objective, [kr], [initiative], evidence);
    expect(result.completenessScore).toBe(1);
    expect(result.findings).toHaveLength(0);
  });
});

describe("link integrity findings", () => {
  it("flags a conflicts link between two active objectives", () => {
    const objectives = [obj({ id: "A" }), obj({ id: "B" })];
    const links: ObjectiveLinkEdge[] = [{ id: "l1", fromObjectiveId: "A", toObjectiveId: "B", linkType: "conflicts" }];
    const findings = linkIntegrityFindings(objectives, links);
    expect(findings.some((f) => f.kind === "objective_conflict")).toBe(true);
  });

  it("flags a dangling link referencing a missing objective", () => {
    const objectives = [obj({ id: "A" })];
    const links: ObjectiveLinkEdge[] = [{ id: "l1", fromObjectiveId: "A", toObjectiveId: "ghost", linkType: "contributes_to" }];
    const findings = linkIntegrityFindings(objectives, links);
    expect(findings.some((f) => f.kind === "dangling_link")).toBe(true);
  });

  it("flags a self-link", () => {
    const objectives = [obj({ id: "A" })];
    const links: ObjectiveLinkEdge[] = [{ id: "l1", fromObjectiveId: "A", toObjectiveId: "A", linkType: "blocks" }];
    const findings = linkIntegrityFindings(objectives, links);
    expect(findings.some((f) => f.kind === "self_link")).toBe(true);
  });
});

describe("capacity conflict detection", () => {
  const team: TeamNode = { id: "t1", name: "Team 1", capacityHoursPerWeek: 20, skills: ["engineering"] };

  it("flags two overlapping initiatives exceeding team capacity for a shared skill", () => {
    const initiatives: InitiativeNode[] = [
      {
        id: "i1",
        objectiveId: "A",
        teamId: "t1",
        title: "Init 1",
        status: "in_progress",
        blockerNote: null,
        budgetAllocated: 0,
        budgetSpent: 0,
        timeCriticality: 5,
        riskReduction: 5,
        userValue: 5,
        jobSize: 5,
        requiredSkill: "engineering",
        requiredHoursPerWeek: 15,
        startDate: "2026-01-01",
        targetEndDate: "2026-03-01",
      },
      {
        id: "i2",
        objectiveId: "B",
        teamId: "t1",
        title: "Init 2",
        status: "in_progress",
        blockerNote: null,
        budgetAllocated: 0,
        budgetSpent: 0,
        timeCriticality: 5,
        riskReduction: 5,
        userValue: 5,
        jobSize: 5,
        requiredSkill: "engineering",
        requiredHoursPerWeek: 15,
        startDate: "2026-02-01",
        targetEndDate: "2026-04-01",
      },
    ];
    const findings = detectCapacityConflicts(initiatives, [team]);
    expect(findings.some((f) => f.kind === "capacity_conflict")).toBe(true);
  });

  it("does not flag non-overlapping initiatives", () => {
    const initiatives: InitiativeNode[] = [
      {
        id: "i1",
        objectiveId: "A",
        teamId: "t1",
        title: "Init 1",
        status: "in_progress",
        blockerNote: null,
        budgetAllocated: 0,
        budgetSpent: 0,
        timeCriticality: 5,
        riskReduction: 5,
        userValue: 5,
        jobSize: 5,
        requiredSkill: "engineering",
        requiredHoursPerWeek: 15,
        startDate: "2026-01-01",
        targetEndDate: "2026-02-01",
      },
      {
        id: "i2",
        objectiveId: "B",
        teamId: "t1",
        title: "Init 2",
        status: "in_progress",
        blockerNote: null,
        budgetAllocated: 0,
        budgetSpent: 0,
        timeCriticality: 5,
        riskReduction: 5,
        userValue: 5,
        jobSize: 5,
        requiredSkill: "engineering",
        requiredHoursPerWeek: 15,
        startDate: "2026-03-01",
        targetEndDate: "2026-04-01",
      },
    ];
    const findings = detectCapacityConflicts(initiatives, [team]);
    expect(findings.some((f) => f.kind === "capacity_conflict")).toBe(false);
  });
});

describe("strategy path query", () => {
  it("walks objective -> initiatives -> teams -> metrics", () => {
    const objectives = [obj({ id: "root", isNorthStarAligned: true }), obj({ id: "child", parentId: "root" })];
    const links: ObjectiveLinkEdge[] = [{ id: "l1", fromObjectiveId: "child", toObjectiveId: "root", linkType: "contributes_to" }];
    const kr: KeyResultInput = {
      id: "kr1",
      objectiveId: "child",
      title: "kr",
      baseline: 0,
      target: 10,
      current: 0,
      unit: "",
      direction: "up",
      progressMode: "linear",
      weight: 1,
      stretch: false,
      confidenceClass: null,
      milestonesTotal: null,
      milestonesComplete: null,
      thresholdValue: null,
    };
    const team: TeamNode = { id: "t1", name: "Team 1", capacityHoursPerWeek: 40, skills: [] };
    const initiative: InitiativeNode = {
      id: "i1",
      objectiveId: "child",
      teamId: "t1",
      title: "init",
      status: "in_progress",
      blockerNote: null,
      budgetAllocated: 0,
      budgetSpent: 0,
      timeCriticality: 5,
      riskReduction: 5,
      userValue: 5,
      jobSize: 5,
      requiredSkill: null,
      requiredHoursPerWeek: 10,
      startDate: null,
      targetEndDate: null,
    };
    const evidence: EvidenceRefInput[] = [
      { id: "ev1", keyResultId: "kr1", sourceType: "manual", sourceId: null, value: 5, observedAt: new Date().toISOString(), note: null },
    ];

    const result = strategyPath("child", objectives, links, [kr], [initiative], [team], [], evidence);
    expect(result).not.toBeNull();
    expect(result!.ancestors.map((a) => a.id)).toEqual(["root"]);
    expect(result!.initiatives).toHaveLength(1);
    expect(result!.initiatives[0].team?.id).toBe("t1");
    expect(result!.latestEvidenceByKeyResultId["kr1"]?.id).toBe("ev1");
  });
});
