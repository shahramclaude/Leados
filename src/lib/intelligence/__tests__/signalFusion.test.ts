import { describe, expect, it } from "vitest";
import { HYSTERESIS_CONSECUTIVE_REQUIRED, SignalFusionEngine, RawSignal } from "../signalFusion";
import { explainFinding } from "../explain";
import type { Explanation } from "../types";

function fakeExplanation(value: number): Explanation {
  return explainFinding({
    label: "test",
    value,
    interval: { low: value - 1, high: value + 1, level: 0.9, kind: "credible" },
    drivers: [],
    evidence: [],
    method: "rule-engine",
    confidence: 0.7,
  });
}

function signal(id: string, rootCauseId: string, severity: 1 | 2 | 3 | 4 | 5, domain = "retention"): RawSignal {
  return {
    id,
    rootCauseId,
    domain,
    title: `Finding for ${rootCauseId}`,
    rawSeverity: severity,
    explanation: fakeExplanation(severity),
    detectedAt: new Date().toISOString(),
  };
}

describe("SignalFusionEngine", () => {
  it("de-duplicates correlated signals sharing a root cause into ONE finding", () => {
    const engine = new SignalFusionEngine();
    const findings = engine.fuse([
      signal("s1", "root-A", 3),
      signal("s2", "root-A", 4),
      signal("s3", "root-A", 2),
    ]);
    expect(findings.length).toBe(1);
    expect(findings[0].suppressedSignalIds.sort()).toEqual(["s1", "s3"]);
    expect(findings[0].severity).toBe(4); // loudest signal wins
  });

  it("does not suppress unrelated root causes", () => {
    const engine = new SignalFusionEngine();
    const findings = engine.fuse([signal("s1", "root-A", 3), signal("s2", "root-B", 2)]);
    expect(findings.length).toBe(2);
  });

  it("applies hysteresis: a single noisy severity change does not flip the displayed severity", () => {
    const engine = new SignalFusionEngine();
    const first = engine.fuse([signal("s1", "root-A", 3)]);
    expect(first[0].displayedSeverity).toBe(3);

    // One-off spike to 5 should NOT immediately show as 5.
    const second = engine.fuse([signal("s2", "root-A", 5)]);
    expect(second[0].displayedSeverity).toBe(3);

    // Drop back to 3 resets the pending change.
    const third = engine.fuse([signal("s3", "root-A", 3)]);
    expect(third[0].displayedSeverity).toBe(3);
  });

  it("promotes displayed severity after it persists for the required number of evaluations", () => {
    const engine = new SignalFusionEngine();
    engine.fuse([signal("s1", "root-A", 3)]);
    let last;
    for (let i = 0; i < HYSTERESIS_CONSECUTIVE_REQUIRED; i++) {
      last = engine.fuse([signal(`s${i + 2}`, "root-A", 5)]);
    }
    expect(last![0].displayedSeverity).toBe(5);
  });

  it("interrupt policy: only severity 5 AND explicit opt-in may interrupt", () => {
    const engine = new SignalFusionEngine();
    for (let i = 0; i < HYSTERESIS_CONSECUTIVE_REQUIRED; i++) {
      engine.fuse([signal(`s${i}`, "root-A", 5)], { retention: true });
    }
    const withOptIn = engine.fuse([signal("s-final", "root-A", 5)], { retention: true });
    expect(withOptIn[0].interruptEligible).toBe(true);

    const engine2 = new SignalFusionEngine();
    for (let i = 0; i < HYSTERESIS_CONSECUTIVE_REQUIRED + 1; i++) {
      engine2.fuse([signal(`t${i}`, "root-B", 5)], { retention: false });
    }
    const withoutOptIn = engine2.fuse([signal("t-final", "root-B", 5)], { retention: false });
    expect(withoutOptIn[0].interruptEligible).toBe(false);
  });
});
