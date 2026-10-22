import { describe, expect, it } from "vitest";
import { lintCitations, type Citation } from "@/lib/strategy/citationLint";
import { diffSnapshots, renderBriefNarrative, type StrategySnapshot } from "@/lib/strategy/briefGenerator";

describe("citation lint", () => {
  it("passes when every number in the text has a matching citation", () => {
    const citations: Citation[] = [{ id: "c1", label: "shift", sourceType: "milestone", sourceId: "i1", value: 5 }];
    const result = lintCitations('"Initiative X" slipped by 5 days.', citations);
    expect(result.ok).toBe(true);
    expect(result.uncitedNumbers).toHaveLength(0);
  });

  it("fails when a number has no corresponding citation", () => {
    const result = lintCitations("Progress jumped to 42%.", []);
    expect(result.ok).toBe(false);
    expect(result.uncitedNumbers.length).toBeGreaterThan(0);
  });

  it("ignores zero (not a claim requiring evidence)", () => {
    const result = lintCitations("No change this week (delta 0).", []);
    expect(result.ok).toBe(true);
  });
});

describe("brief generator: cites only real numbers", () => {
  it("generates a brief with no material changes and zero citations when nothing changed", () => {
    const snapshot: StrategySnapshot = {
      generatedAt: new Date().toISOString(),
      initiatives: [{ id: "i1", title: "Init 1", status: "in_progress", wsjf: 5, rank: 1, p50Date: "2026-02-01T00:00:00.000Z" }],
      driftFindingIds: [],
    };
    const delta = diffSnapshots(snapshot, snapshot);
    const { text, citations } = renderBriefNarrative(delta, [], "2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z");
    const lint = lintCitations(text, citations);
    expect(lint.ok).toBe(true);
    // The only number printed is the PERT materiality threshold policy
    // constant, which is cited explicitly rather than invented.
    expect(citations).toHaveLength(1);
  });

  it("every number in a brief with real deltas is cited and passes lint", () => {
    const prev: StrategySnapshot = {
      generatedAt: "2026-01-01T00:00:00.000Z",
      initiatives: [
        { id: "i1", title: "Init 1", status: "in_progress", wsjf: 5, rank: 2, p50Date: "2026-02-01T00:00:00.000Z" },
      ],
      driftFindingIds: [],
    };
    const curr: StrategySnapshot = {
      generatedAt: "2026-01-08T00:00:00.000Z",
      initiatives: [
        { id: "i1", title: "Init 1", status: "blocked", wsjf: 7.5, rank: 1, p50Date: "2026-02-10T00:00:00.000Z" },
      ],
      driftFindingIds: [],
    };
    const delta = diffSnapshots(prev, curr);
    expect(delta.newBlockers).toHaveLength(1);
    expect(delta.pertShifts).toHaveLength(1);
    expect(delta.wsjfRankChanges).toHaveLength(1);

    const { text, citations } = renderBriefNarrative(delta, [], "2026-01-01T00:00:00.000Z", "2026-01-08T00:00:00.000Z");
    const lint = lintCitations(text, citations);
    expect(lint.ok).toBe(true);
    expect(lint.uncitedNumbers).toHaveLength(0);
  });
});
