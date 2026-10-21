import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { fnv1a } from "./hash";

describe("fnv1a", () => {
  it("is a pure deterministic function: same input -> same output", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(fnv1a(s)).toBe(fnv1a(s));
      }),
    );
  });

  it("always returns a non-negative 32-bit integer", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const h = fnv1a(s);
        expect(Number.isInteger(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(0xffffffff);
      }),
    );
  });

  it("different inputs usually hash differently (spot check, not a guarantee)", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
    expect(fnv1a("approval-1")).not.toBe(fnv1a("approval-2"));
  });
});
