import { describe, expect, it } from "vitest";
import { LEADOS_PEOPLE_SCM, generateDemoDataset, DEMO_EVIDENCE } from "../domainModel";
import { whatIf, whyIsThisHappening } from "../counterfactual";

describe("counterfactual chains render from real DAG paths", () => {
  it("whatIf traces a path through the actual DAG for an intervention on 1:1 frequency", () => {
    const data = generateDemoDataset(200, 99);
    const entity = data[0];
    const result = whatIf(
      LEADOS_PEOPLE_SCM,
      entity,
      { oneOnOneFrequency: entity.oneOnOneFrequency + 2 },
      "retentionStays",
      DEMO_EVIDENCE
    );

    // The path must include the intervened variable and its real downstream
    // descendants in the DAG (engagementScore -> retentionStays), not a
    // canned/static list.
    expect(result.result.path[0]).toBe("oneOnOneFrequency");
    expect(result.result.path).toContain("engagementScore");
    expect(result.result.path).toContain("retentionStays");
    expect(result.result.steps.length).toBeGreaterThan(0);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.reasoning.steps.some((s) => s.includes("->"))).toBe(true);
  });

  it("whyIsThisHappening decomposes a variable into parent contributions that sum to the structural total", () => {
    const data = generateDemoDataset(200, 100);
    const entity = data[0];
    const result = whyIsThisHappening(LEADOS_PEOPLE_SCM, entity, "engagementScore", DEMO_EVIDENCE);

    const sumContrib = result.result.parents.reduce((a, p) => a + p.contribution, 0);
    const total = sumContrib + result.result.intercept + result.result.noiseContribution;
    expect(total).toBeCloseTo(entity.engagementScore, 5);
    expect(result.result.path[0]).toBe("engagementScore");
  });
});
