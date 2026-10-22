import { describe, expect, it } from "vitest";
import {
  computeExpertise,
  defaultExpertise,
  levelFromScore,
  type InteractionSignal,
} from "@/lib/familiarity";

const NOW = Date.parse("2026-01-15T00:00:00Z");

function signal(overrides: Partial<InteractionSignal> = {}): InteractionSignal {
  return {
    domain: "finance",
    depth: 0.5,
    vocabulary: 0.5,
    drilldown: 0.5,
    timestamp: NOW,
    ...overrides,
  };
}

describe("familiarity: expertise model properties", () => {
  it("is monotone in usage: adding any non-negative-strength signal never decreases the score", () => {
    const seeds: InteractionSignal[][] = [
      [],
      [signal({ depth: 0.2 })],
      [signal({ depth: 0.2 }), signal({ vocabulary: 0.4, timestamp: NOW - 1000 })],
      [signal({ drilldown: 0.9 }), signal({ depth: 0.9 }), signal({ vocabulary: 0.9 })],
    ];

    for (const base of seeds) {
      const before = computeExpertise(base, "finance", NOW).score;
      for (let trial = 0; trial < 25; trial++) {
        const extra = signal({
          depth: Math.random(),
          vocabulary: Math.random(),
          drilldown: Math.random(),
          timestamp: NOW - Math.floor(Math.random() * 1000 * 60 * 60 * 24 * 10),
        });
        const after = computeExpertise([...base, extra], "finance", NOW).score;
        expect(after).toBeGreaterThanOrEqual(before - 1e-9);
      }
    }
  });

  it("decays over elapsed time with no new evidence", () => {
    const signals = [signal({ depth: 0.9, vocabulary: 0.9, drilldown: 0.9, timestamp: NOW })];
    const immediate = computeExpertise(signals, "finance", NOW);
    const after30Days = computeExpertise(signals, "finance", NOW + 30 * 24 * 60 * 60 * 1000);
    const after180Days = computeExpertise(signals, "finance", NOW + 180 * 24 * 60 * 60 * 1000);

    expect(after30Days.score).toBeLessThan(immediate.score);
    expect(after180Days.score).toBeLessThan(after30Days.score);
  });

  it("stays within [0,1] for score and confidence under heavy input", () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      signal({ depth: 1, vocabulary: 1, drilldown: 1, timestamp: NOW - i * 1000 }),
    );
    const result = computeExpertise(many, "finance", NOW);
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("cold start (zero evidence) is always novice with zero confidence", () => {
    const cold = defaultExpertise("risk", NOW);
    expect(cold.level).toBe("novice");
    expect(cold.confidence).toBe(0);
    expect(cold.score).toBe(0);
  });

  it("level thresholds are consistent with levelFromScore", () => {
    expect(levelFromScore(0)).toBe("novice");
    expect(levelFromScore(0.32)).toBe("novice");
    expect(levelFromScore(0.33)).toBe("intermediate");
    expect(levelFromScore(0.69)).toBe("intermediate");
    expect(levelFromScore(0.7)).toBe("expert");
    expect(levelFromScore(1)).toBe("expert");
  });

  it("never reads or references any content/fact field (type-level guarantee)", () => {
    // computeExpertise's input type (InteractionSignal) has no `fact`, `severity`,
    // or `content` field at all — it is structurally impossible to pass facts in.
    const s: InteractionSignal = signal();
    expect(Object.keys(s).sort()).toEqual(["depth", "domain", "drilldown", "timestamp", "vocabulary"]);
  });
});
