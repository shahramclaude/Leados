import { describe, it, expect } from "vitest";
import { aggregateFunnelCounts, classifyPersonStage, type ChangeEventRecord } from "../adoptionProxies";
import { K_ANONYMITY_THRESHOLD } from "@/lib/privacy/aggregation";

function evt(personId: string, groupId: string, daysAgo: number, now: Date): ChangeEventRecord {
  return { personId, groupId, proxyEventType: "x", occurredAt: new Date(now.getTime() - daysAgo * 86400000) };
}

describe("classifyPersonStage", () => {
  const now = new Date("2026-01-01");

  it("classifies a person with no events as awareness (zero-weight)", () => {
    const stage = classifyPersonStage([], "p1", now);
    expect(stage.stage).toBe("awareness");
    expect(stage.totalEvents).toBe(0);
  });

  it("classifies a person active in only one recent week as trial", () => {
    const events = [evt("p1", "g1", 1, now), evt("p1", "g1", 2, now)];
    const stage = classifyPersonStage(events, "p1", now);
    expect(stage.stage).toBe("trial");
  });

  it("classifies a person active across 3+ distinct weeks as habit", () => {
    const events = [evt("p1", "g1", 1, now), evt("p1", "g1", 8, now), evt("p1", "g1", 15, now)];
    const stage = classifyPersonStage(events, "p1", now);
    expect(stage.stage).toBe("habit");
  });
});

describe("aggregateFunnelCounts — k-anonymity gating", () => {
  const now = new Date("2026-01-01");

  it("suppresses groups smaller than the k-anonymity threshold", () => {
    const smallRoster = Array.from({ length: K_ANONYMITY_THRESHOLD - 1 }, (_, i) => `p${i}`);
    const result = aggregateFunnelCounts([], "small-group", smallRoster, now);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.groupSize).toBe(K_ANONYMITY_THRESHOLD - 1);
    }
  });

  it("returns an aggregate for groups meeting the k-anonymity threshold", () => {
    const roster = Array.from({ length: K_ANONYMITY_THRESHOLD + 3 }, (_, i) => `p${i}`);
    const events = roster.flatMap((p) => [evt(p, "big-group", 1, now), evt(p, "big-group", 8, now), evt(p, "big-group", 15, now)]);
    const result = aggregateFunnelCounts(events, "big-group", roster, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.value.habit).toBe(roster.length);
      expect(result.value.caveats.length).toBeGreaterThan(0);
    }
  });

  it("never includes a personId in the aggregated output", () => {
    const roster = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const events = roster.map((p) => evt(p, "g", 1, now));
    const result = aggregateFunnelCounts(events, "g", roster, now);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("p0");
  });
});
