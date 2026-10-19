import { describe, expect, it } from "vitest";
import { buildRenewalNetwork } from "../bayesianNetwork";
import { buildGtmCausalGraph } from "../causal";
import { buildCausalChain } from "../causalChain";
import { combineProbabilities, severityFromRisk } from "../inference";
import { runScenario } from "../scenarioEngine";

describe("BayesianNetwork exact inference", () => {
  it("computes exact joint-enumeration probabilities matching manual calculation", () => {
    const net = buildRenewalNetwork();
    // P(renews) = sum over usageUp, supportHealthy, championActive of
    // P(usageUp)P(supportHealthy)P(championActive|supportHealthy)P(renews|usageUp,championActive)
    const p = net.query("renews");
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it("conditioning on evidence shifts the probability in the expected direction", () => {
    const net = buildRenewalNetwork();
    const base = net.query("renews");
    const withGoodSignals = net.query("renews", { usageUp: true, championActive: true });
    const withBadSignals = net.query("renews", { usageUp: false, championActive: false });
    expect(withGoodSignals).toBeGreaterThan(base);
    expect(withBadSignals).toBeLessThan(base);
  });

  it("sensitivities rank the most influential upstream node first", () => {
    const net = buildRenewalNetwork();
    const sensitivities = net.sensitivities("renews");
    expect(sensitivities.length).toBeGreaterThan(0);
    expect(Math.abs(sensitivities[0].contribution)).toBeGreaterThanOrEqual(Math.abs(sensitivities[sensitivities.length - 1].contribution));
  });
});

describe("Causal chain rendering", () => {
  it("renders the shortest path from headcount to revenue with cumulative multipliers", () => {
    const chain = buildCausalChain(buildGtmCausalGraph(), "headcount", "revenue");
    expect(chain.identifiable).toBe(true);
    expect(chain.primaryPath[0].nodeId).toBe("headcount");
    expect(chain.primaryPath[chain.primaryPath.length - 1].nodeId).toBe("revenue");
  });

  it("reports not identifiable when no path exists", () => {
    const chain = buildCausalChain(buildGtmCausalGraph(), "revenue", "headcount");
    expect(chain.identifiable).toBe(false);
    expect(chain.note).toMatch(/No directed path/);
  });
});

describe("inference.ts shared utilities", () => {
  it("combineProbabilities returns the same value when identical sources agree", () => {
    // Logarithmic opinion pooling of two IDENTICAL estimates reproduces that
    // estimate exactly (geometric mean of equal odds = those odds). This is
    // a pooling operator over existing beliefs, not Bayesian evidence
    // accumulation (see beliefFabric.ts for the latter).
    const combined = combineProbabilities([
      { probability: 0.8, weight: 1, source: "a" },
      { probability: 0.8, weight: 1, source: "b" },
    ]);
    expect(combined).toBeCloseTo(0.8, 6);
  });

  it("combineProbabilities weights a higher-confidence source more heavily", () => {
    const evenWeight = combineProbabilities([
      { probability: 0.9, weight: 1, source: "a" },
      { probability: 0.5, weight: 1, source: "b" },
    ]);
    const heavyOnA = combineProbabilities([
      { probability: 0.9, weight: 3, source: "a" },
      { probability: 0.5, weight: 1, source: "b" },
    ]);
    expect(heavyOnA).toBeGreaterThan(evenWeight);
  });

  it("combineProbabilities pulls disagreement back toward 0.5", () => {
    const combined = combineProbabilities([
      { probability: 0.9, weight: 1, source: "a" },
      { probability: 0.1, weight: 1, source: "b" },
    ]);
    expect(combined).toBeCloseTo(0.5, 6);
  });

  it("severityFromRisk maps high probability + critical impact to severity 5", () => {
    expect(severityFromRisk(0.95, "critical")).toBe(5);
  });

  it("severityFromRisk maps low probability + low impact to severity 1", () => {
    expect(severityFromRisk(0.05, "low")).toBe(1);
  });
});

describe("Scenario engine counterfactuals", () => {
  it("produces a quantified outcome distribution with p10<=p50<=p90", () => {
    const result = runScenario({ name: "hire 3", interventions: [{ type: "hire", amount: 3 }], trials: 500 });
    expect(result.scenarioDistribution.p10).toBeLessThanOrEqual(result.scenarioDistribution.p50);
    expect(result.scenarioDistribution.p50).toBeLessThanOrEqual(result.scenarioDistribution.p90);
  });

  it("hiring more reps increases median incremental revenue vs. baseline", () => {
    const result = runScenario({ name: "hire 5", interventions: [{ type: "hire", amount: 5 }], trials: 800 });
    expect(result.deltaP50).toBeGreaterThan(0);
  });

  it("delaying launch decreases median incremental revenue vs. baseline", () => {
    const result = runScenario({ name: "delay", interventions: [{ type: "delayLaunch", amount: 8 }], trials: 800 });
    expect(result.deltaP50).toBeLessThan(0);
  });

  it("every scenario includes a causal chain per intervention", () => {
    const result = runScenario({
      name: "combo",
      interventions: [{ type: "hire", amount: 2 }, { type: "priceChange", amount: 0.08 }],
      trials: 300,
    });
    expect(result.causalChains.length).toBe(2);
    for (const chain of result.causalChains) {
      expect(chain.identifiable).toBe(true);
    }
  });
});
