import { describe, expect, it } from "vitest";
import { driftRatioOf, fitLinearTrendForecast } from "../forecast";

describe("forecast drift math (pure, no db)", () => {
  it("predicts the next point of a perfectly linear series exactly", () => {
    const series = [1, 2, 3, 4, 5];
    expect(fitLinearTrendForecast(series)).toBeCloseTo(6, 5);
  });

  it("predicts a flat series as flat", () => {
    expect(fitLinearTrendForecast([10, 10, 10, 10])).toBeCloseTo(10, 5);
  });

  it("never forecasts a negative value", () => {
    const series = [5, 3, 1, -1, -3]; // steep decline
    expect(fitLinearTrendForecast(series)).toBeGreaterThanOrEqual(0);
  });

  it("drift ratio is 0 when actual matches forecast exactly", () => {
    expect(driftRatioOf(10, 10)).toBe(0);
  });

  it("drift ratio reflects a real miss", () => {
    expect(driftRatioOf(20, 10)).toBeCloseTo(1, 5);
  });
});
