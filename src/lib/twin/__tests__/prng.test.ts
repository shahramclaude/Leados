import { describe, expect, it } from "vitest";
import { createRng, seedHash, hashObject } from "../prng";

describe("prng", () => {
  it("is deterministic: same seed produces an identical stream", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 50 }, () => a.next());
    const seqB = Array.from({ length: 50 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different streams", () => {
    const a = createRng(1);
    const b = createRng(2);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it("seedHash derives independent, stable per-component streams", () => {
    const s1 = seedHash("run-1", "arrivals");
    const s2 = seedHash("run-1", "network");
    const s3 = seedHash("run-1", "arrivals");
    expect(s1).not.toEqual(s2);
    expect(s1).toEqual(s3); // stable for same inputs
  });

  it("child() streams do not perturb each other regardless of call order", () => {
    const root1 = createRng(999);
    const arrivalsFirst = root1.child("arrivals");
    const networkFirst = root1.child("network");

    const root2 = createRng(999);
    const networkSecond = root2.child("network");
    const arrivalsSecond = root2.child("arrivals");

    expect(arrivalsFirst.next()).toEqual(arrivalsSecond.next());
    expect(networkFirst.next()).toEqual(networkSecond.next());
  });

  it("antithetic mode mirrors uniforms (u -> 1-u)", () => {
    const normal = createRng(777, false);
    const anti = createRng(777, true);
    for (let i = 0; i < 20; i++) {
      expect(anti.next()).toBeCloseTo(1 - normal.next(), 10);
    }
  });

  it("hashObject is stable regardless of key order", () => {
    const h1 = hashObject({ a: 1, b: { c: 2, d: 3 } });
    const h2 = hashObject({ b: { d: 3, c: 2 }, a: 1 });
    expect(h1).toEqual(h2);
  });
});
