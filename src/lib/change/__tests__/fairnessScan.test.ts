import { describe, it, expect } from "vitest";
import { scanGroupPayloadsForDisclosureRisk, scanComputationInputKeys } from "../fairnessScan";
import { K_ANONYMITY_THRESHOLD } from "@/lib/privacy/aggregation";
import { readinessScore } from "../readiness";

describe("scanGroupPayloadsForDisclosureRisk", () => {
  it("flags a non-suppressed payload with groupSize below the k-anonymity threshold", () => {
    const findings = scanGroupPayloadsForDisclosureRisk([
      { groupId: "tiny", groupSize: K_ANONYMITY_THRESHOLD - 1, readiness: 0.5 },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });

  it("does not flag a suppressed payload regardless of size", () => {
    const findings = scanGroupPayloadsForDisclosureRisk([{ groupId: "tiny", groupSize: 1, suppressed: true }]);
    expect(findings).toHaveLength(0);
  });

  it("does not flag a payload meeting the threshold with no banned fields", () => {
    const findings = scanGroupPayloadsForDisclosureRisk([{ groupId: "big", groupSize: K_ANONYMITY_THRESHOLD, readiness: 0.7 }]);
    expect(findings).toHaveLength(0);
  });

  it("flags a payload that carries a banned individual-level field even if the group is large enough", () => {
    const findings = scanGroupPayloadsForDisclosureRisk([
      { groupId: "big", groupSize: 50, sentimentScore: 0.9 } as unknown as { groupId: string; groupSize: number },
    ]);
    expect(findings.some((f) => f.id.includes("banned_field"))).toBe(true);
  });
});

describe("scanComputationInputKeys", () => {
  it("passes the real readiness computation's input keys (no protected attributes used)", () => {
    const result = readinessScore({ trainingCompletionRate: 0.5, capacityHeadroom: 0.5, priorChangeLoad: 1 });
    const findings = scanComputationInputKeys(result.inputs);
    expect(findings).toHaveLength(0);
  });

  it("flags a protected-attribute-shaped key if one were ever introduced", () => {
    const findings = scanComputationInputKeys({ trainingCompletionRate: 0.5, gender: "x" });
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("critical");
  });
});
