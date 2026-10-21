import { describe, expect, it } from "vitest";
import { createFixedClock, createTickingClock } from "./clock";

describe("createFixedClock", () => {
  it("always returns the same instant", () => {
    const clock = createFixedClock("2024-01-01T00:00:00.000Z");
    const a = clock.now().getTime();
    const b = clock.now().getTime();
    expect(a).toBe(b);
    expect(a).toBe(new Date("2024-01-01T00:00:00.000Z").getTime());
  });

  it("returns independent Date instances (no shared mutable state leak)", () => {
    const clock = createFixedClock("2024-01-01T00:00:00.000Z");
    const d1 = clock.now();
    d1.setFullYear(1999);
    const d2 = clock.now();
    expect(d2.getFullYear()).toBe(2024);
  });
});

describe("createTickingClock", () => {
  it("advances deterministically by the configured step", () => {
    const clock = createTickingClock("2024-01-01T00:00:00.000Z", 1000);
    const t0 = clock.now().getTime();
    const t1 = clock.now().getTime();
    const t2 = clock.now().getTime();
    expect(t1 - t0).toBe(1000);
    expect(t2 - t1).toBe(1000);
  });
});
