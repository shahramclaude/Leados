// Phase 4 gate 4: "cadence simulator matches manual calculation on seeded
// histories (test)". Pure unit test, no DB — the history below is seeded by
// hand and the expected per-occurrence mode is computed by hand in the
// comment trail so the assertion is checkable by a human, not just by code.
import { describe, expect, it } from "vitest";
import { evaluateCadenceRule, simulateCadenceRule } from "../policyEngine";
import type { OccurrenceSummary, VarianceAnomalyDegradeRule } from "../types";

const RULE: VarianceAnomalyDegradeRule = {
  kind: "variance_anomaly_degrade",
  varianceThresholdPct: 2,
  anomalyFreeOccurrences: 3,
  degradeTo: "async_checklist",
};

// Oldest -> newest. Manual trace (window = up to 3 most-recent PRIOR
// occurrences, most-recent-first; degrade iff max|variance| < 2% AND total
// anomalies == 0 across that window):
//   o1: prior=[]                      -> <3 history  -> full
//   o2: prior=[o1]                    -> <3 history  -> full
//   o3: prior=[o2,o1]                 -> <3 history  -> full
//   o4: prior=[o3,o2,o1] = (1.5,1,5)% -> max=5%, anomalies=1 -> full
//   o5: prior=[o4,o3,o2] = (0.5,1.5,1)% -> max=1.5%, anomalies=0 -> DEGRADE
//   o6: prior=[o5,o4,o3] = (1,0.5,1.5)% -> max=1.5%, anomalies=0 -> DEGRADE
const HISTORY: OccurrenceSummary[] = [
  { occurrenceKey: "o1", scheduledFor: "2026-01-01T00:00:00Z", variancePct: 5, anomalyCount: 1 },
  { occurrenceKey: "o2", scheduledFor: "2026-02-01T00:00:00Z", variancePct: 1, anomalyCount: 0 },
  { occurrenceKey: "o3", scheduledFor: "2026-03-01T00:00:00Z", variancePct: 1.5, anomalyCount: 0 },
  { occurrenceKey: "o4", scheduledFor: "2026-04-01T00:00:00Z", variancePct: 0.5, anomalyCount: 0 },
  { occurrenceKey: "o5", scheduledFor: "2026-05-01T00:00:00Z", variancePct: 1, anomalyCount: 0 },
  { occurrenceKey: "o6", scheduledFor: "2026-06-01T00:00:00Z", variancePct: 0.2, anomalyCount: 0 },
];

describe("simulateCadenceRule matches a hand-computed trace", () => {
  it("degrades exactly o5 and o6, keeps o1-o4 at full cadence", () => {
    const result = simulateCadenceRule(RULE, HISTORY);
    expect(result.totalOccurrences).toBe(6);
    expect(result.details.map((d) => d.mode)).toEqual(["full", "full", "full", "full", "async_checklist", "async_checklist"]);
    expect(result.wouldDegradeCount).toBe(2);
    expect(result.wouldDegradeOccurrenceKeys).toEqual(["o5", "o6"]);
  });

  it("every reason string is concrete (passes the same zero-filler shape the lint enforces)", () => {
    const result = simulateCadenceRule(RULE, HISTORY);
    for (const d of result.details) {
      expect(d.reason).toMatch(/\d/);
    }
  });
});

describe("evaluateCadenceRule", () => {
  it("always_full never degrades regardless of history", () => {
    const result = evaluateCadenceRule({ kind: "always_full" }, []);
    expect(result.mode).toBe("full");
  });

  it("requires the full history window before it will degrade", () => {
    const result = evaluateCadenceRule(RULE, [{ occurrenceKey: "x", scheduledFor: "2026-01-01T00:00:00Z", variancePct: 0, anomalyCount: 0 }]);
    expect(result.mode).toBe("full");
    expect(result.reason).toMatch(/Only 1/);
  });

  it("a single anomaly in the window blocks degradation even with low variance", () => {
    const window: OccurrenceSummary[] = [
      { occurrenceKey: "a", scheduledFor: "2026-01-03T00:00:00Z", variancePct: 0.1, anomalyCount: 1 },
      { occurrenceKey: "b", scheduledFor: "2026-01-02T00:00:00Z", variancePct: 0.1, anomalyCount: 0 },
      { occurrenceKey: "c", scheduledFor: "2026-01-01T00:00:00Z", variancePct: 0.1, anomalyCount: 0 },
    ];
    const result = evaluateCadenceRule(RULE, window);
    expect(result.mode).toBe("full");
  });
});
