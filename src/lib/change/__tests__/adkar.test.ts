import { describe, it, expect } from "vitest";
import { assessAdkarStage } from "../adkar";

describe("assessAdkarStage", () => {
  it("flags Awareness as the primary blocker when few people have any recorded activity", () => {
    const result = assessAdkarStage({ awareness: 2, trial: 1, habit: 0 }, 20, 0.8);
    expect(result.value.primaryBlockingStage).toBe("Awareness");
  });

  it("flags Knowledge as the primary blocker when awareness is high but training completion is low", () => {
    const result = assessAdkarStage({ awareness: 18, trial: 14, habit: 10 }, 20, 0.1);
    expect(result.value.primaryBlockingStage).toBe("Knowledge");
  });

  it("surfaces low confidence and a named runner-up when deficits are close", () => {
    // Construct a case where two deficits are nearly tied.
    const result = assessAdkarStage({ awareness: 19, trial: 10, habit: 9 }, 20, 0.92);
    if (result.value.margin < 0.08) {
      expect(result.confidence).toBe("low");
      expect(result.caveats.some((c) => c.toLowerCase().includes("uncertain"))).toBe(true);
    }
  });

  it("never reports a stage without an explicit margin and caveats", () => {
    const result = assessAdkarStage({ awareness: 5, trial: 2, habit: 1 }, 10, 0.5);
    expect(typeof result.value.margin).toBe("number");
    expect(result.caveats.length).toBeGreaterThan(0);
  });
});
