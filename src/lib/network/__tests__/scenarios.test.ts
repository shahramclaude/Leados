import { describe, expect, it } from "vitest";
import type { EcosystemGraph } from "../types";
import { runShockScenario } from "../scenarios";

describe("shock scenarios run reproducibly", () => {
  const graph: EcosystemGraph = {
    nodes: [
      { id: "partner", type: "partner", name: "NimbusCloud", isExternal: true, scopeTags: [] },
      { id: "company", type: "internal_team", name: "LEADOS Inc", isExternal: false, scopeTags: [] },
      { id: "customer", type: "customer", name: "Globex Corp", isExternal: true, scopeTags: [] },
    ],
    edges: [
      {
        id: "e1",
        source: "company",
        target: "partner",
        edgeType: "depends_on",
        strength: 0.9,
        substitutability: 0.1,
        evidenceClass: "verified_secondary",
        evidenceRefs: [],
      },
      {
        id: "e2",
        source: "customer",
        target: "company",
        edgeType: "serves",
        strength: 0.8,
        substitutability: 0.4,
        evidenceClass: "verified_secondary",
        evidenceRefs: [],
      },
    ],
  };

  it("produces the same blast radius across repeated runs (deterministic)", () => {
    const run1 = runShockScenario(graph, { type: "partner_loss", nodeId: "partner" });
    const run2 = runShockScenario(graph, { type: "partner_loss", nodeId: "partner" });
    expect(run1.affected).toEqual(run2.affected);
    expect(run1.totalAffectedNodes).toBe(run2.totalAffectedNodes);
    expect(run1.maxRecoveryDays).toBe(run2.maxRecoveryDays);
  });

  it("flags zero blast radius as a possible invisible-dependency case", () => {
    const run = runShockScenario(graph, { type: "key_person_loss", nodeId: "customer" });
    expect(run.totalAffectedNodes).toBe(0);
    expect(run.summary).toMatch(/invisible/);
  });

  it("carries a war-game role reference through for Part 24 hand-off", () => {
    const run = runShockScenario(graph, {
      type: "partner_loss",
      nodeId: "partner",
      warGameRoleRef: "part24:role:infra-lead",
    });
    expect(run.warGameRoleRef).toBe("part24:role:infra-lead");
  });
});
