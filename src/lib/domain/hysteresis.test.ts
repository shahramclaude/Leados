import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { countTransitions, createHysteresisConfig, hysteresisTrace } from "./hysteresis";

const config = createHysteresisConfig(0.6, 0.4);

describe("Hysteresis non-oscillation invariant", () => {
  it("scores confined to the dead band never change state after the first settle", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"cold" | "hot">("cold", "hot"),
        fc.array(fc.double({ min: 0.4, max: 0.6, noNaN: true }), { minLength: 1, maxLength: 200 }),
        (initial, scores) => {
          const trace = hysteresisTrace(config, initial, scores);
          // Once inside the dead band, state never changes (since 0.4 <= score <= 0.6
          // satisfies neither "score > 0.6" nor "score < 0.4").
          const distinctStates = new Set(trace);
          expect(distinctStates.size).toBe(1);
          expect(trace[0]).toBe(initial);
        },
      ),
    );
  });

  it("rejects misconfigured thresholds that would allow oscillation", () => {
    expect(() => createHysteresisConfig(0.4, 0.6)).toThrow();
    expect(() => createHysteresisConfig(0.5, 0.5)).toThrow();
  });

  it("transitions at most once per clear crossing of the band (no chatter for noisy-but-decisive inputs)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 1, maxLength: 300 }),
        (scores) => {
          const trace = hysteresisTrace(config, "cold", scores);
          const transitions = countTransitions(["cold" as const, ...trace]);
          // Hysteresis transitions can never exceed the number of scores that
          // are strictly outside the dead band (each transition requires a
          // decisive score), which is a weaker but always-true bound that
          // demonstrates the controller is not chattering on every sample.
          const decisive = scores.filter((s) => s > 0.6 || s < 0.4).length;
          expect(transitions).toBeLessThanOrEqual(decisive);
        },
      ),
    );
  });

  it("concrete regression: a score bouncing around 0.5 with a naive single threshold would oscillate, hysteresis does not", () => {
    const bouncing = [0.52, 0.48, 0.51, 0.49, 0.5, 0.47, 0.53];
    const trace = hysteresisTrace(config, "cold", bouncing);
    expect(new Set(trace).size).toBe(1);
    expect(trace.every((s) => s === "cold")).toBe(true);
  });

  it("does cross decisively when scores clearly exceed/drop below thresholds", () => {
    const trace = hysteresisTrace(config, "cold", [0.9, 0.55, 0.3]);
    expect(trace).toEqual(["hot", "hot", "cold"]);
  });
});
