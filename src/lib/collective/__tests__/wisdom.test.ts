import { describe, expect, it } from "vitest";
import {
  compareCrowdVsModel,
  computeDispersionStats,
  diversityOfThoughtIndex,
  dispersionIndex,
  independenceIndex,
} from "../wisdom";
import type { ResolvedQuestionSample } from "../wisdom";

describe("crowd-vs-model wisdom tracking", () => {
  it("declares the crowd the winner on a question class where it is closer to outcomes", () => {
    const samples: ResolvedQuestionSample[] = [
      { questionClass: "geopolitics", crowdProbability: 0.9, modelProbability: 0.5, outcome: 1 },
      { questionClass: "geopolitics", crowdProbability: 0.85, modelProbability: 0.4, outcome: 1 },
      { questionClass: "geopolitics", crowdProbability: 0.1, modelProbability: 0.5, outcome: 0 },
    ];
    const [result] = compareCrowdVsModel(samples);
    expect(result.winner).toBe("crowd");
    expect(result.crowdBrier).toBeLessThan(result.modelBrier);
  });

  it("declares the model the winner on a question class where the crowd is noisy", () => {
    const samples: ResolvedQuestionSample[] = [
      { questionClass: "macro-rates", crowdProbability: 0.5, modelProbability: 0.92, outcome: 1 },
      { questionClass: "macro-rates", crowdProbability: 0.5, modelProbability: 0.08, outcome: 0 },
      { questionClass: "macro-rates", crowdProbability: 0.55, modelProbability: 0.9, outcome: 1 },
    ];
    const [result] = compareCrowdVsModel(samples);
    expect(result.winner).toBe("model");
  });

  it("includes market Brier and can crown the market the winner when it is sharpest", () => {
    const samples: ResolvedQuestionSample[] = [
      { questionClass: "product-launch", crowdProbability: 0.6, modelProbability: 0.6, marketProbability: 0.95, outcome: 1 },
      { questionClass: "product-launch", crowdProbability: 0.4, modelProbability: 0.4, marketProbability: 0.05, outcome: 0 },
    ];
    const [result] = compareCrowdVsModel(samples);
    expect(result.marketBrier).not.toBeNull();
    expect(result.winner).toBe("market");
  });

  it("segments results independently per question class", () => {
    const samples: ResolvedQuestionSample[] = [
      { questionClass: "A", crowdProbability: 0.9, modelProbability: 0.5, outcome: 1 },
      { questionClass: "B", crowdProbability: 0.5, modelProbability: 0.9, outcome: 1 },
    ];
    const results = compareCrowdVsModel(samples);
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.questionClass === "A")!.winner).toBe("crowd");
    expect(results.find((r) => r.questionClass === "B")!.winner).toBe("model");
  });
});

describe("diversity-of-thought index", () => {
  it("is low when all forecasters agree (groupthink warning signal)", () => {
    const stats = computeDispersionStats([0.5, 0.5, 0.5, 0.5]);
    expect(stats.diversityIndex).toBeCloseTo(0, 6);
  });

  it("is higher when forecasters are spread out", () => {
    const tight = dispersionIndex([0.49, 0.5, 0.51]);
    const wide = dispersionIndex([0.05, 0.5, 0.95]);
    expect(wide).toBeGreaterThan(tight);
  });

  it("independence index is 1 (fully independent) with insufficient data, not an alarming false signal", () => {
    expect(independenceIndex([[0.5]])).toBe(1);
    expect(independenceIndex([])).toBe(1);
  });

  it("independence index drops when forecasters move in lockstep across questions (correlated signals)", () => {
    const lockstep = [
      [0.2, 0.4, 0.6, 0.8],
      [0.22, 0.41, 0.59, 0.79],
      [0.19, 0.39, 0.61, 0.81],
    ];
    const independent = [
      [0.2, 0.8, 0.3, 0.7],
      [0.9, 0.1, 0.6, 0.2],
      [0.4, 0.5, 0.9, 0.1],
    ];
    expect(independenceIndex(lockstep)).toBeLessThan(independenceIndex(independent));
  });

  it("composite index rewards panels that are both dispersed and independent", () => {
    const groupthink = diversityOfThoughtIndex(0.01, 0.1); // tight AND correlated
    const wise = diversityOfThoughtIndex(0.6, 0.9); // spread AND independent
    expect(wise).toBeGreaterThan(groupthink);
  });
});
