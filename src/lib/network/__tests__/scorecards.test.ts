import { describe, expect, it } from "vitest";
import type { EcosystemGraph } from "../types";
import { computePartnerScorecard, weakestEvidenceClass } from "../scorecards";

describe("weakestEvidenceClass — evidence never gets laundered upward", () => {
  it("picks the least-trusted class among a mixed set", () => {
    expect(
      weakestEvidenceClass(["verified_primary", "self_reported", "verified_secondary"]),
    ).toBe("self_reported");
    expect(weakestEvidenceClass(["verified_primary", "inferred"])).toBe("inferred");
    expect(weakestEvidenceClass(["verified_primary", "verified_primary"])).toBe(
      "verified_primary",
    );
  });

  it("defaults to the most conservative class when given nothing", () => {
    expect(weakestEvidenceClass([])).toBe("inferred");
  });
});

describe("computePartnerScorecard", () => {
  const graph: EcosystemGraph = {
    nodes: [
      { id: "company", type: "internal_team", name: "LEADOS Inc", isExternal: false, scopeTags: [] },
      { id: "nimbus", type: "partner", name: "NimbusCloud", isExternal: true, scopeTags: [] },
    ],
    edges: [
      {
        id: "e1",
        source: "company",
        target: "nimbus",
        edgeType: "depends_on",
        strength: 0.95,
        substitutability: 0.15,
        evidenceClass: "verified_secondary",
        evidenceRefs: ["contract"],
      },
    ],
  };

  it("produces a high risk score for a concentrated, hard-to-substitute partner", () => {
    const scorecard = computePartnerScorecard({
      partnerNodeId: "nimbus",
      graph,
      spendShares: [
        { key: "nimbus", amount: 500000 },
        { key: "other", amount: 100000 },
      ],
      linkedRiskSeverities: ["high"],
    });

    expect(scorecard.concentrationScore).toBeGreaterThan(0.5);
    expect(scorecard.substitutabilityScore).toBeCloseTo(0.15, 6);
    expect(scorecard.riskScore).toBeGreaterThan(40);
    // Evidence class should reflect the weakest contributing input (no
    // deliveryEvidenceClass supplied -> defaults to "inferred", which must win).
    expect(scorecard.evidenceClass).toBe("inferred");
  });

  it("never reports a score without a traceable evidence class", () => {
    const scorecard = computePartnerScorecard({
      partnerNodeId: "nimbus",
      graph,
      spendShares: [{ key: "nimbus", amount: 1 }],
      deliveryQuality: 90,
      deliveryEvidenceClass: "verified_primary",
      linkedRiskSeverities: [],
    });
    expect(scorecard.evidenceClass).toBeDefined();
    expect(["verified_primary", "verified_secondary", "self_reported", "inferred"]).toContain(
      scorecard.evidenceClass,
    );
  });
});
