import { describe, expect, it } from "vitest";
import { herfindahlHirschmanIndex } from "../metrics";
import {
  evaluateBusFactorAlert,
  evaluateConcentrationAlert,
  HHI_HIGH_THRESHOLD,
} from "../alerts";
import type { BusFactorResult } from "../types";

describe("concentration alert fires on seeded threshold breach", () => {
  it("does not fire below the moderate band", () => {
    const hhi = herfindahlHirschmanIndex([
      { key: "a", amount: 10 },
      { key: "b", amount: 10 },
      { key: "c", amount: 10 },
      { key: "d", amount: 10 },
      { key: "e", amount: 10 },
      { key: "f", amount: 10 },
      { key: "g", amount: 10 },
      { key: "h", amount: 10 },
    ]); // hhi = 8*(0.125^2) = 0.125 -> low band
    expect(hhi.hhi).toBeLessThan(0.15);
    expect(evaluateConcentrationAlert("spend", hhi)).toBeNull();
  });

  it("fires a 'high' concentration alert once HHI crosses the seeded threshold", () => {
    // Single dominant partner at 70% share -> HHI well above HHI_HIGH_THRESHOLD.
    const hhi = herfindahlHirschmanIndex([
      { key: "dominant", amount: 700000 },
      { key: "small-a", amount: 200000 },
      { key: "small-b", amount: 100000 },
    ]);
    expect(hhi.hhi).toBeGreaterThan(HHI_HIGH_THRESHOLD);
    const alert = evaluateConcentrationAlert("spend", hhi);
    expect(alert).not.toBeNull();
    expect(alert!.severity).toBe("high");
    expect(alert!.alertType).toBe("concentration");
  });

  it("fires a 'critical' single_source alert when one entity holds effectively all share", () => {
    const hhi = herfindahlHirschmanIndex([
      { key: "sole-supplier", amount: 999000 },
      { key: "negligible", amount: 1000 },
    ]);
    const alert = evaluateConcentrationAlert("spend", hhi);
    expect(alert).not.toBeNull();
    expect(alert!.alertType).toBe("single_source");
    expect(alert!.severity).toBe("critical");
  });
});

describe("bus-factor alert thresholds", () => {
  it("fires critical when bus factor is 1 (single point of failure)", () => {
    const result: BusFactorResult = {
      capability: "Kubernetes Infra Ops",
      busFactor: 1,
      totalCapacity: 7,
      requiredCapacity: 5,
      criticalPeople: ["carol"],
    };
    const alert = evaluateBusFactorAlert(result);
    expect(alert?.severity).toBe("critical");
  });

  it("fires high (warning) when bus factor is 2", () => {
    const result: BusFactorResult = {
      capability: "Payments Integration",
      busFactor: 2,
      totalCapacity: 4,
      requiredCapacity: 3,
      criticalPeople: ["bob", "carol"],
    };
    const alert = evaluateBusFactorAlert(result);
    expect(alert?.severity).toBe("high");
  });

  it("does not fire when bus factor comfortably exceeds the warning threshold", () => {
    const result: BusFactorResult = {
      capability: "Data Pipeline Ops",
      busFactor: 5,
      totalCapacity: 20,
      requiredCapacity: 5,
      criticalPeople: ["a", "b", "c", "d", "e"],
    };
    expect(evaluateBusFactorAlert(result)).toBeNull();
  });
});
