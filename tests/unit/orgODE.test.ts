import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { simulateOrgDynamics, stepOrgState } from "@/lib/domain/orgODE";

const boundedState = fc.record({
  morale: fc.double({ min: -5, max: 5, noNaN: true }),
  velocity: fc.double({ min: -5, max: 5, noNaN: true }),
});
const boundedParams = fc.record({
  a: fc.double({ min: 0, max: 1, noNaN: true }),
  b: fc.double({ min: 0, max: 1, noNaN: true }),
  c: fc.double({ min: 0, max: 1, noNaN: true }),
  d: fc.double({ min: 0, max: 1, noNaN: true }),
  targetMorale: fc.double({ min: -5, max: 5, noNaN: true }),
});

describe("orgODE", () => {
  it("simulateOrgDynamics returns exactly steps + 1 states, starting with the initial state", () => {
    fc.assert(
      fc.property(boundedState, boundedParams, fc.integer({ min: 0, max: 200 }), (initial, params, steps) => {
        const trajectory = simulateOrgDynamics(initial, params, steps, 0.05);
        expect(trajectory).toHaveLength(steps + 1);
        expect(trajectory[0]).toEqual(initial);
      }),
    );
  });

  it("stays finite for small, bounded time steps (no blow-up)", () => {
    fc.assert(
      fc.property(boundedState, boundedParams, fc.integer({ min: 0, max: 200 }), (initial, params, steps) => {
        const trajectory = simulateOrgDynamics(initial, params, steps, 0.05);
        for (const state of trajectory) {
          expect(Number.isFinite(state.morale)).toBe(true);
          expect(Number.isFinite(state.velocity)).toBe(true);
        }
      }),
    );
  });

  it("is deterministic: same inputs always produce the same trajectory", () => {
    fc.assert(
      fc.property(boundedState, boundedParams, fc.integer({ min: 0, max: 100 }), (initial, params, steps) => {
        const a = simulateOrgDynamics(initial, params, steps, 0.1);
        const b = simulateOrgDynamics(initial, params, steps, 0.1);
        expect(a).toEqual(b);
      }),
    );
  });

  it("a single step matches one Euler update of the ODE", () => {
    fc.assert(
      fc.property(boundedState, boundedParams, (state, params) => {
        const dt = 0.1;
        const next = stepOrgState(state, params, dt);
        const expectedMorale =
          state.morale + (params.a * (params.targetMorale - state.morale) + params.b * state.velocity) * dt;
        const expectedVelocity = state.velocity + (params.c * state.morale - params.d * state.velocity) * dt;
        expect(next.morale).toBeCloseTo(expectedMorale, 10);
        expect(next.velocity).toBeCloseTo(expectedVelocity, 10);
      }),
    );
  });

  it("rejects negative steps and non-positive dt", () => {
    const initial = { morale: 0, velocity: 0 };
    const params = { a: 0.1, b: 0.1, c: 0.1, d: 0.1, targetMorale: 1 };
    expect(() => simulateOrgDynamics(initial, params, -1, 0.1)).toThrow();
    expect(() => simulateOrgDynamics(initial, params, 10, 0)).toThrow();
  });
});
