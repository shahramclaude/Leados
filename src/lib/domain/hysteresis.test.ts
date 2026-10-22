import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  createHysteresisGate,
  stepHysteresis,
  runHysteresis,
  type HysteresisConfig,
} from "./hysteresis";

const config: HysteresisConfig = { onThreshold: 10, offThreshold: 5 };

describe("hysteresis — example-based", () => {
  it("rejects a config where onThreshold <= offThreshold (would guarantee oscillation)", () => {
    expect(() => createHysteresisGate({ onThreshold: 5, offThreshold: 5 })).toThrow();
    expect(() => createHysteresisGate({ onThreshold: 4, offThreshold: 5 })).toThrow();
  });

  it("turns on at the threshold and off at the lower threshold", () => {
    let gate = createHysteresisGate(config, "off");
    gate = stepHysteresis(gate, 9.99);
    expect(gate.state).toBe("off");
    gate = stepHysteresis(gate, 10);
    expect(gate.state).toBe("on");
    gate = stepHysteresis(gate, 5.01);
    expect(gate.state).toBe("on");
    gate = stepHysteresis(gate, 5);
    expect(gate.state).toBe("off");
  });

  it("does not chatter for noise bouncing inside the dead band", () => {
    const gate = createHysteresisGate(config, "off");
    const noisyDeadBand = [6, 7, 9, 6, 8, 9.9, 5.5, 7.2, 6.1, 9.8];
    const final = runHysteresis(gate, noisyDeadBand);
    expect(final.state).toBe("off");
  });
});

describe("hysteresis — property-based", () => {
  it("never changes state while every sample stays strictly inside the dead band", () => {
    const arbDeadBandSeries = fc.array(
      fc.double({
        min: config.offThreshold + 0.001,
        max: config.onThreshold - 0.001,
        noNaN: true,
      }),
      { minLength: 0, maxLength: 200 },
    );
    fc.assert(
      fc.property(
        fc.constantFrom<"on" | "off">("on", "off"),
        arbDeadBandSeries,
        (initial, series) => {
          const gate = createHysteresisGate(config, initial);
          const final = runHysteresis(gate, series);
          expect(final.state).toBe(initial);
        },
      ),
    );
  });

  it("a monotonically increasing sweep flips off->on at most once", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -100, max: 0, noNaN: true }),
        fc.integer({ min: 1, max: 200 }),
        (start, steps) => {
          const stepSize = 1;
          const series = Array.from({ length: steps }, (_, i) => start + i * stepSize);
          let gate = createHysteresisGate(config, "off");
          let transitions = 0;
          for (const v of series) {
            const next = stepHysteresis(gate, v);
            if (next.state !== gate.state) transitions++;
            gate = next;
          }
          expect(transitions).toBeLessThanOrEqual(1);
        },
      ),
    );
  });

  it("staying strictly above offThreshold forever once on never turns off (no spurious flips)", () => {
    // Strictly above, not >=: stepHysteresis's off-transition is inclusive
    // of offThreshold itself (value <= offThreshold turns the gate off —
    // see the example-based test above), so the boundary value must be
    // excluded here or the property would (correctly) fail.
    const arbAboveOff = fc.array(
      fc.double({
        min: config.offThreshold + 0.001,
        max: 1000,
        noNaN: true,
      }),
      { minLength: 0, maxLength: 200 },
    );
    fc.assert(
      fc.property(arbAboveOff, (series) => {
        const gate = createHysteresisGate(config, "on");
        const final = runHysteresis(gate, series);
        expect(final.state).toBe("on");
      }),
    );
  });

  it("is a pure function: stepping twice with the same input is idempotent", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<"on" | "off">("on", "off"),
        fc.double({ min: -1000, max: 1000, noNaN: true }),
        (initial, value) => {
          const gate = createHysteresisGate(config, initial);
          const once = stepHysteresis(gate, value);
          const twice = stepHysteresis(once, value);
          expect(twice).toEqual(once);
        },
      ),
    );
  });
});
