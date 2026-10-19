import { describe, expect, it } from "vitest";
import { buildRoleBoard, computeCoverageRisk, type RoleCoverageInputs } from "../src/lib/domain/people/succession";

const baseRole: RoleCoverageInputs = {
  roleId: 1,
  title: "Director of Platform",
  teamId: 2,
  criticality: "high",
  incumbentId: 50,
  incumbentFlightRisk: 0.2,
  candidates: [
    {
      personId: 51,
      displayName: "Ready Now Candidate",
      readiness: "ready_now",
      confidence: 0.8,
      evidence: ["Ran the platform migration end to end."],
      gapPlan: null,
    },
  ],
};

describe("succession coverage risk", () => {
  it("is lower when there is a ready-now candidate and low incumbent flight-risk", () => {
    const withBench = computeCoverageRisk(baseRole);
    const withoutBench = computeCoverageRisk({ ...baseRole, candidates: [] });
    expect(withBench.value).toBeLessThan(withoutBench.value);
  });

  it("increases with role criticality, all else equal", () => {
    const low = computeCoverageRisk({ ...baseRole, criticality: "low" });
    const critical = computeCoverageRisk({ ...baseRole, criticality: "critical" });
    expect(critical.value).toBeGreaterThan(low.value);
  });

  it("always frames itself as decision support, never a decision", () => {
    const score = computeCoverageRisk(baseRole);
    expect(score.decisionSupportNotice).toMatch(/decision support/i);
  });
});

describe("role board", () => {
  it("buckets candidates into ready-now / ready-later / develop", () => {
    const board = buildRoleBoard({
      ...baseRole,
      candidates: [
        ...baseRole.candidates,
        { personId: 52, displayName: "Later", readiness: "ready_later", confidence: 0.5, evidence: [], gapPlan: "Needs P&L exposure." },
        { personId: 53, displayName: "Develop", readiness: "develop", confidence: 0.3, evidence: [], gapPlan: "Early career." },
      ],
    });
    expect(board.readyNow).toHaveLength(1);
    expect(board.readyLater).toHaveLength(1);
    expect(board.develop).toHaveLength(1);
    expect(board.coverageRisk.drivers.length).toBeGreaterThan(0);
  });
});
