import { describe, expect, it } from "vitest";
import {
  computeHHI,
  classifyHHIBand,
  computeEntryExitFlow,
  detectCapacityCycle,
} from "@/lib/industry/metrics";

describe("computeHHI (fixture / hand-computed)", () => {
  it("matches hand computation for percent shares [50,30,20]", () => {
    // 50^2 + 30^2 + 20^2 = 2500 + 900 + 400 = 3800
    expect(computeHHI([50, 30, 20], { asPercent: true })).toBe(3800);
  });

  it("matches hand computation for fractional shares [0.5,0.3,0.2]", () => {
    expect(computeHHI([0.5, 0.3, 0.2])).toBe(3800);
  });

  it("four equal firms of 25% => HHI 2500 exactly", () => {
    expect(computeHHI([25, 25, 25, 25], { asPercent: true })).toBe(2500);
  });

  it("returns 0 for no firms", () => {
    expect(computeHHI([])).toBe(0);
  });
});

describe("classifyHHIBand (DOJ/FTC convention)", () => {
  it("unconcentrated below 1500", () => {
    expect(classifyHHIBand(1200)).toBe("unconcentrated");
    expect(classifyHHIBand(1499.9)).toBe("unconcentrated");
  });

  it("moderate between 1500 and 2500 inclusive", () => {
    expect(classifyHHIBand(1500)).toBe("moderate");
    expect(classifyHHIBand(2000)).toBe("moderate");
    expect(classifyHHIBand(2500)).toBe("moderate");
  });

  it("concentrated above 2500", () => {
    expect(classifyHHIBand(2500.01)).toBe("concentrated");
    expect(classifyHHIBand(8000)).toBe("concentrated");
  });
});

describe("computeEntryExitFlow (fixture / hand-computed)", () => {
  it("matches hand computation: 9 entrants, 5 exits, 138 prior firms", () => {
    const flow = computeEntryExitFlow(9, 5, 138);
    expect(flow.netEntryRate).toBeCloseTo(4 / 138, 10);
    expect(flow.turnoverRate).toBeCloseTo(14 / 138, 10);
  });

  it("throws on non-positive prior firm count", () => {
    expect(() => computeEntryExitFlow(1, 1, 0)).toThrow();
    expect(() => computeEntryExitFlow(1, 1, -5)).toThrow();
  });

  it("negative net entry rate on contraction", () => {
    const flow = computeEntryExitFlow(5, 9, 146);
    expect(flow.netEntryRate).toBeLessThan(0);
    expect(flow.netEntryRate).toBeCloseTo(-4 / 146, 10);
  });
});

describe("detectCapacityCycle (heuristic, fixture-checked)", () => {
  it("returns null phase with zero confidence for short series", () => {
    expect(detectCapacityCycle([0.7, 0.75])).toEqual({ phase: null, confidence: 0, method: expect.any(String) });
  });

  it("classifies a rising, non-saturated series as expansion", () => {
    const reading = detectCapacityCycle([0.6, 0.65, 0.7]);
    expect(reading.phase).toBe("expansion");
    expect(reading.confidence).toBeCloseTo(0.58, 2);
  });

  it("classifies a rising, saturated series as peak", () => {
    const reading = detectCapacityCycle([0.75, 0.8, 0.88]);
    expect(reading.phase).toBe("peak");
  });

  it("classifies a falling, non-depressed series as contraction", () => {
    const reading = detectCapacityCycle([0.9, 0.85, 0.78]);
    expect(reading.phase).toBe("contraction");
  });

  it("classifies a falling, depressed series as trough", () => {
    const reading = detectCapacityCycle([0.6, 0.55, 0.5]);
    expect(reading.phase).toBe("trough");
  });

  it("never claims a phase with full confidence from a short/ambiguous series", () => {
    const reading = detectCapacityCycle([0.7, 0.7, 0.7]);
    expect(reading.confidence).toBeLessThan(1);
  });
});
