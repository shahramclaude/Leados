// Enforcement test for the HONESTY RULE: "aggregates never override individual voice
// silently (minority views preserved and shown); no mechanism may punish honest dissent."
//
// This file is intentionally written as a lint-style contract test: it asserts the
// *shape* every aggregation/Delphi API response must have, so that any future change
// to the API layer that forgets to surface minority reports or dissenters fails CI.

import { describe, expect, it } from "vitest";
import { aggregateForecasts } from "../aggregation";
import { summarizeRound } from "../delphi";
import type { AggregationMethod, RawForecast } from "../types";

const METHODS: AggregationMethod[] = ["mean", "extremized", "calibration_weighted"];

const panel: RawForecast[] = [
  { forecasterId: "f1", probability: 0.52, rationale: "consensus view", calibrationScore: 0.8 },
  { forecasterId: "f2", probability: 0.49, rationale: "consensus view, slightly lower", calibrationScore: 0.7 },
  { forecasterId: "f3", probability: 0.5, rationale: "right in the middle", calibrationScore: 0.6 },
  { forecasterId: "f4", probability: 0.98, rationale: "contrarian: classified signal suggests near-certainty", calibrationScore: 0.3 },
];

describe("minority-report preservation contract", () => {
  it.each(METHODS)("every aggregation method (%s) surfaces the dissenting forecaster's full rationale", (method) => {
    const result = aggregateForecasts(panel, { method });
    expect(Array.isArray(result.minorityReports)).toBe(true);
    const dissenter = result.minorityReports.find((r) => r.forecasterId === "f4");
    expect(dissenter).toBeDefined();
    expect(dissenter!.rationale).toContain("contrarian");
    // The aggregate value must never literally equal the suppressed-away dissenting view.
    expect(result.value).not.toBeCloseTo(0.98, 1);
  });

  it("the aggregate result type always includes a minorityReports field, even when empty", () => {
    const tight: RawForecast[] = [
      { forecasterId: "a", probability: 0.5 },
      { forecasterId: "b", probability: 0.51 },
    ];
    for (const method of METHODS) {
      const result = aggregateForecasts(tight, { method });
      expect(result).toHaveProperty("minorityReports");
      expect(result.minorityReports).toEqual([]);
    }
  });

  it("Delphi round summaries preserve dissenter identity (anonymized tag), estimate, and rationale", () => {
    const summary = summarizeRound(1, [
      { forecasterId: "a", anonymousTag: "Anon-1", estimate: 0.5, rationale: "base rate" },
      { forecasterId: "b", anonymousTag: "Anon-2", estimate: 0.52, rationale: "similar" },
      { forecasterId: "c", anonymousTag: "Anon-3", estimate: 0.95, rationale: "insider view" },
    ]);
    expect(summary.dissenters.length).toBeGreaterThan(0);
    const dissenter = summary.dissenters.find((d) => d.anonymousTag === "Anon-3");
    expect(dissenter).toBeDefined();
    expect(dissenter!.rationale).toBe("insider view");
  });

  it("minority reports are never dropped for being a minority of one", () => {
    const panelOfOneOutlier: RawForecast[] = [
      { forecasterId: "a", probability: 0.5 },
      { forecasterId: "b", probability: 0.5 },
      { forecasterId: "c", probability: 0.5 },
      { forecasterId: "d", probability: 0.5 },
      { forecasterId: "lone-dissenter", probability: 0.99, rationale: "I disagree with everyone" },
    ];
    const result = aggregateForecasts(panelOfOneOutlier, { method: "mean" });
    expect(result.minorityReports).toHaveLength(1);
    expect(result.minorityReports[0].forecasterId).toBe("lone-dissenter");
  });

  it("does not punish dissent: a dissenting forecaster's calibration score is not touched by aggregation math", () => {
    // aggregateForecasts is a pure read of RawForecast[]; it must not mutate input records
    // (which would be the mechanism by which dissent could be penalized).
    const before = JSON.parse(JSON.stringify(panel));
    aggregateForecasts(panel, { method: "calibration_weighted" });
    expect(panel).toEqual(before);
  });
});
