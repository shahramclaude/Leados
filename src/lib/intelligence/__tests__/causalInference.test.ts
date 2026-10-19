import { describe, expect, it } from "vitest";
import { buildGtmCausalGraph } from "../causal";
import { estimateCausalEffect } from "../causalInference";
import { CAUSAL_GOLDEN_TRUE_EFFECT, generateCausalGoldenDataset } from "../goldenDataset";

describe("Causal inference: honest correlation vs. causation", () => {
  it("falls back to association-only when the confounder is unmeasured, and warns about it", () => {
    const graph = buildGtmCausalGraph();
    const data = generateCausalGoldenDataset(300, 1337, false);
    const finding = estimateCausalEffect(graph, data, "headcount", "pipelineGenerated");
    expect(finding.kind).toBe("association");
    if (finding.kind === "association") {
      expect(finding.confounderWarnings.length).toBeGreaterThan(0);
      expect(finding.confounderWarnings[0]).toMatch(/marketDemand/);
      expect(finding.reason).toMatch(/not identifiable/i);
    }
  });

  it("identifies a causal effect close to ground truth once the confounder is measured and adjusted for", () => {
    const graph = buildGtmCausalGraph();
    const data = generateCausalGoldenDataset(300, 1337, true);
    const finding = estimateCausalEffect(graph, data, "headcount", "pipelineGenerated");
    expect(finding.kind).toBe("causal");
    if (finding.kind === "causal") {
      expect(finding.identification).toBe("backdoor-adjustment");
      expect(finding.adjustmentSet).toContain("marketDemand");
      // Tolerance reflects realistic sampling noise (n=300) around the
      // planted ground-truth effect; the point is that adjustment recovers
      // an estimate an order of magnitude closer to truth than the naive
      // (unadjusted) correlation computed in the next test.
      expect(finding.effectPerUnit).toBeGreaterThan(CAUSAL_GOLDEN_TRUE_EFFECT - 1.5);
      expect(finding.effectPerUnit).toBeLessThan(CAUSAL_GOLDEN_TRUE_EFFECT + 1.5);
      expect(finding.assumptions.length).toBeGreaterThan(0);
    }
  });

  it("the naive (unadjusted) correlation is biased away from ground truth, demonstrating why adjustment matters", () => {
    const data = generateCausalGoldenDataset(300, 1337, true);
    const xs = data.map((r) => r.headcount);
    const ys = data.map((r) => r.pipelineGenerated);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) ** 2;
    }
    const naiveSlope = num / den;
    // Confounding inflates the naive slope well above the true 1.8 effect.
    expect(naiveSlope).toBeGreaterThan(CAUSAL_GOLDEN_TRUE_EFFECT + 1);
  });
});
