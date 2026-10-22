import { describe, expect, it } from "vitest";
import {
  defaultAttentionProfile,
  reorderQuestions,
  resetAttentionProfile,
  setDigestTiming,
  setInterruptThreshold,
  suggestQuestionOrderFromUsage,
} from "@/lib/adaptation/attentionProfile";
import { QUESTION_ONTOLOGY } from "@/lib/executive/ontology";

describe("attention profile: editable interrupt thresholds, digest timing, question order", () => {
  it("defaults are fully populated and valid", () => {
    const profile = defaultAttentionProfile("user-1");
    expect(Object.keys(profile.interruptThresholds).sort()).toEqual(["finance", "people", "risk", "tech"]);
    expect(profile.questionOrder.length).toBe(QUESTION_ONTOLOGY.length);
  });

  it("interrupt thresholds are user-editable and clamped to [0,1]", () => {
    let profile = defaultAttentionProfile("user-1");
    profile = setInterruptThreshold(profile, "risk", 1.5);
    expect(profile.interruptThresholds.risk).toBe(1);
    profile = setInterruptThreshold(profile, "risk", -0.5);
    expect(profile.interruptThresholds.risk).toBe(0);
    profile = setInterruptThreshold(profile, "risk", 0.42);
    expect(profile.interruptThresholds.risk).toBeCloseTo(0.42);
  });

  it("digest timing is editable to any supported option", () => {
    let profile = defaultAttentionProfile("user-1");
    profile = setDigestTiming(profile, "weekly-mon-08:00");
    expect(profile.digestTiming).toBe("weekly-mon-08:00");
  });

  it("question order can be reordered by the user and rejects invalid sets", () => {
    const profile = defaultAttentionProfile("user-1");
    const reversed = [...profile.questionOrder].reverse();
    const updated = reorderQuestions(profile, reversed);
    expect(updated.questionOrder).toEqual(reversed);

    expect(() => reorderQuestions(profile, ["not-a-real-id", ...profile.questionOrder.slice(1)])).toThrow();
    expect(() => reorderQuestions(profile, profile.questionOrder.slice(0, -1))).toThrow();
  });

  it("resetAttentionProfile restores the ontology default order", () => {
    const profile = reorderQuestions(defaultAttentionProfile("user-1"), [...defaultAttentionProfile("user-1").questionOrder].reverse());
    const reset = resetAttentionProfile("user-1");
    expect(reset.questionOrder).toEqual(defaultAttentionProfile("user-1").questionOrder);
    expect(reset.questionOrder).not.toEqual(profile.questionOrder);
  });

  it("usage-weighted suggestions always return every ontology question exactly once", () => {
    const usage = { "fin-runway": 9, "risk-exposure": 3 };
    const suggestion = suggestQuestionOrderFromUsage(usage);
    expect(suggestion.length).toBe(QUESTION_ONTOLOGY.length);
    expect(new Set(suggestion).size).toBe(QUESTION_ONTOLOGY.length);
    expect(suggestion[0]).toBe("fin-runway");
  });
});
