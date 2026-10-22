import { describe, it, expect } from "vitest";
import { momentumFromSeries } from "../momentum";

describe("momentumFromSeries", () => {
  it("reports positive momentum for a steadily increasing series", () => {
    const series = [0.1, 0.15, 0.2, 0.28, 0.35, 0.42];
    const result = momentumFromSeries(series);
    expect(result.value).toBeGreaterThan(0);
  });

  it("reports negative momentum for a steadily decreasing series", () => {
    const series = [0.5, 0.42, 0.35, 0.28, 0.2, 0.15];
    const result = momentumFromSeries(series);
    expect(result.value).toBeLessThan(0);
  });

  it("reports ~0 for a flat series", () => {
    const series = [0.3, 0.3, 0.3, 0.3];
    const result = momentumFromSeries(series);
    expect(Math.abs(result.value)).toBeLessThan(1e-9);
  });

  it("returns low confidence for short series", () => {
    const result = momentumFromSeries([0.1, 0.2]);
    expect(result.confidence).toBe("low");
  });
});
