import { describe, expect, it } from "vitest";
import {
  assertHasEvidence,
  isStrongEvidence,
  reliabilityClassFromScore,
  reliabilityClassToEvidenceClass,
  EVIDENCE_CLASS_ORDER,
  type EvidenceMeta,
} from "@/lib/seams/part27-evidence";
import { shouldElevate } from "@/lib/seams/part47-crisis";

describe("evidence-class enforcement (Part 27 rule)", () => {
  it("accepts a well-formed external claim with sourceRef", () => {
    const value: EvidenceMeta = { evidenceClass: "reported_secondary", sourceRef: "Demo Trade Press" };
    expect(() => assertHasEvidence(value, "industry signal")).not.toThrow();
  });

  it("catches a seeded violation: missing evidenceClass entirely", () => {
    const violatingValue = { sourceRef: "someone said so" } as unknown as EvidenceMeta;
    expect(() => assertHasEvidence(violatingValue, "seeded-violation-1")).toThrow(/Evidence-class enforcement failed/);
  });

  it("catches a seeded violation: invalid evidenceClass string", () => {
    const violatingValue = { evidenceClass: "trust_me_bro", sourceRef: "x" } as unknown as EvidenceMeta;
    expect(() => assertHasEvidence(violatingValue, "seeded-violation-2")).toThrow();
  });

  it("catches a seeded violation: external evidence class without a sourceRef", () => {
    const violatingValue: EvidenceMeta = { evidenceClass: "verified_primary", sourceRef: null };
    expect(() => assertHasEvidence(violatingValue, "seeded-violation-3")).toThrow(/without sourceRef/);
  });

  it("does NOT require a sourceRef for model_estimate or internal_telemetry (self-generated, not external)", () => {
    expect(() => assertHasEvidence({ evidenceClass: "model_estimate" }, "contagion output")).not.toThrow();
    expect(() => assertHasEvidence({ evidenceClass: "internal_telemetry" }, "product telemetry")).not.toThrow();
  });

  it("evidence class order is a complete, honesty-ranked ladder", () => {
    expect(EVIDENCE_CLASS_ORDER).toEqual([
      "verified_primary",
      "licensed_dataset",
      "reported_secondary",
      "model_estimate",
      "unverified_signal",
      "internal_telemetry",
    ]);
  });

  it("only verified/licensed classes are treated as strong evidence", () => {
    expect(isStrongEvidence("verified_primary")).toBe(true);
    expect(isStrongEvidence("licensed_dataset")).toBe(true);
    expect(isStrongEvidence("reported_secondary")).toBe(false);
    expect(isStrongEvidence("model_estimate")).toBe(false);
    expect(isStrongEvidence("unverified_signal")).toBe(false);
  });
});

describe("source reliability tiers (Part 27 seam) -> evidence class mapping", () => {
  it("classifies reliability scores into tiers at documented thresholds", () => {
    expect(reliabilityClassFromScore(0.95)).toBe("tier1_verified");
    expect(reliabilityClassFromScore(0.75)).toBe("tier1_verified");
    expect(reliabilityClassFromScore(0.74)).toBe("tier2_reported");
    expect(reliabilityClassFromScore(0.4)).toBe("tier2_reported");
    expect(reliabilityClassFromScore(0.39)).toBe("tier3_unverified");
  });

  it("maps every reliability tier to a distinct evidence class", () => {
    expect(reliabilityClassToEvidenceClass("tier1_verified")).toBe("verified_primary");
    expect(reliabilityClassToEvidenceClass("tier2_reported")).toBe("reported_secondary");
    expect(reliabilityClassToEvidenceClass("tier3_unverified")).toBe("unverified_signal");
  });
});

describe("crisis elevation thresholds (Part 47 seam)", () => {
  it("never elevates on tier3_unverified sources alone, regardless of severity", () => {
    const decision = shouldElevate({ severity: "critical", reliabilityClass: "tier3_unverified" });
    expect(decision.elevate).toBe(false);
  });

  it("elevates critical severity from a tier2+ source", () => {
    const decision = shouldElevate({ severity: "critical", reliabilityClass: "tier2_reported" });
    expect(decision.elevate).toBe(true);
  });

  it("elevates high severity only from a tier1 verified source", () => {
    expect(shouldElevate({ severity: "high", reliabilityClass: "tier1_verified" }).elevate).toBe(true);
    expect(shouldElevate({ severity: "high", reliabilityClass: "tier2_reported" }).elevate).toBe(false);
  });

  it("never elevates low/moderate severity regardless of source", () => {
    expect(shouldElevate({ severity: "low", reliabilityClass: "tier1_verified" }).elevate).toBe(false);
    expect(shouldElevate({ severity: "moderate", reliabilityClass: "tier1_verified" }).elevate).toBe(false);
  });
});
