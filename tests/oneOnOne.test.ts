import { describe, expect, it } from "vitest";
import { suggestTalkingPoints, scoreFollowThrough } from "../src/lib/domain/people/oneOnOne";
import type { Commitment } from "../src/lib/domain/types";

describe("talking point suggestions", () => {
  it("suggests a growth check-in when none has happened recently", () => {
    const suggestions = suggestTalkingPoints({
      daysSinceLastGrowthConversation: 120,
      goalsAtRisk: [],
      missedCommitments: [],
      recentSkillEvidence: [],
      managerChangedRecently: false,
    });
    expect(suggestions.some((s) => s.sourceSignal === "growth_conversation_recency")).toBe(true);
  });

  it("every suggestion names its source signal and reason (advisory, inspectable, never opaque)", () => {
    const suggestions = suggestTalkingPoints({
      daysSinceLastGrowthConversation: 10,
      goalsAtRisk: ["Ship v2"],
      missedCommitments: [],
      recentSkillEvidence: [],
      managerChangedRecently: true,
    });
    for (const s of suggestions) {
      expect(s.topic.length).toBeGreaterThan(0);
      expect(s.reason.length).toBeGreaterThan(0);
      expect(s.sourceSignal.length).toBeGreaterThan(0);
    }
  });
});

describe("commitment follow-through scoring", () => {
  it("computes a 0..1 rate from resolved commitments only", () => {
    const commitments: Commitment[] = [
      { id: "1", text: "a", owner: "person", dueDate: null, status: "done", completedAt: "2026-01-01" },
      { id: "2", text: "b", owner: "person", dueDate: null, status: "missed", completedAt: "2026-01-02" },
      { id: "3", text: "c", owner: "person", dueDate: null, status: "open", completedAt: null },
    ];
    const score = scoreFollowThrough(commitments);
    expect(score.rate).toBe(0.5);
    expect(score.open).toBe(1);
  });

  it("defaults to a rate of 1 when nothing has been resolved yet (no false negative signal)", () => {
    const score = scoreFollowThrough([
      { id: "1", text: "a", owner: "person", dueDate: null, status: "open", completedAt: null },
    ]);
    expect(score.rate).toBe(1);
  });
});
