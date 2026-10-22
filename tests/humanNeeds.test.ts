import { describe, expect, it } from "vitest";
import { blendStyle, declaredStyleFromAnswers, DEFAULT_STYLE, inferCognitiveStyle, type BehaviorSample } from "@/lib/humanNeeds";

const NOW = Date.parse("2026-01-15T00:00:00Z");

describe("humanNeeds: cognitive style inference", () => {
  it("defaults to neutral with zero confidence given no behavior", () => {
    const style = inferCognitiveStyle([], NOW);
    expect(style.detailVsSummary.value).toBe(0);
    expect(style.detailVsSummary.confidence).toBe(0);
  });

  it("leans toward detail when the user repeatedly expands detail panels", () => {
    const samples: BehaviorSample[] = Array.from({ length: 10 }, (_, i) => ({
      domain: "finance",
      action: "expand_detail",
      value: 0.9,
      timestamp: NOW - i * 1000,
    }));
    const style = inferCognitiveStyle(samples, NOW);
    expect(style.detailVsSummary.value).toBeGreaterThan(0.3);
    expect(style.detailVsSummary.confidence).toBeGreaterThan(0);
  });

  it("leans toward tabular when the user repeatedly switches to tables", () => {
    const samples: BehaviorSample[] = Array.from({ length: 10 }, (_, i) => ({
      domain: "finance",
      action: "switch_to_table",
      value: 0.8,
      timestamp: NOW - i * 1000,
    }));
    const style = inferCognitiveStyle(samples, NOW);
    expect(style.visualVsTabular.value).toBeLessThan(-0.3);
  });

  it("is bounded to [-1, 1] on every axis regardless of input volume", () => {
    const samples: BehaviorSample[] = Array.from({ length: 200 }, (_, i) => ({
      domain: "finance",
      action: "deliberate_review",
      value: 1,
      timestamp: NOW - i * 10,
    }));
    const style = inferCognitiveStyle(samples, NOW);
    expect(style.deliberativeVsQuick.value).toBeLessThanOrEqual(1);
    expect(style.deliberativeVsQuick.value).toBeGreaterThanOrEqual(-1);
  });

  it("blends declared answers with inferred behavior without discarding the declared prior", () => {
    const declared = declaredStyleFromAnswers({ detailVsSummary: 1, visualVsTabular: 0, deliberativeVsQuick: 0 });
    const inferredOpposite = inferCognitiveStyle(
      Array.from({ length: 3 }, (_, i) => ({
        domain: "finance" as const,
        action: "collapse_detail" as const,
        value: 0.5,
        timestamp: NOW - i * 1000,
      })),
      NOW,
    );
    const blended = blendStyle(declared, inferredOpposite);
    // A handful of opposite signals should not fully erase a strong declared answer.
    expect(blended.detailVsSummary.value).toBeGreaterThan(0.2);
    expect(blended.declared).toBe(true);
  });

  it("returns the inferred profile unchanged when there is no declared style", () => {
    const inferred = inferCognitiveStyle([], NOW);
    const blended = blendStyle(null, inferred);
    expect(blended).toEqual(inferred);
  });

  it("DEFAULT_STYLE is neutral and not marked as declared", () => {
    expect(DEFAULT_STYLE.declared).toBe(false);
    expect(DEFAULT_STYLE.detailVsSummary.value).toBe(0);
  });

  it("structurally cannot reference domain facts (no fact-shaped fields in BehaviorSample)", () => {
    const sample: BehaviorSample = { domain: "risk", action: "quick_decision", value: 0.5, timestamp: NOW };
    expect(Object.keys(sample).sort()).toEqual(["action", "domain", "timestamp", "value"]);
  });
});
