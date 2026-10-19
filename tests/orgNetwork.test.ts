// Org-network intelligence tests. Also documents and enforces the
// metadata-only constraint: the MeetingMeta/MessageMeta types used
// throughout this module have no field capable of carrying message or
// meeting content, and every computation below only ever touches ids,
// durations, timestamps, and channel labels.

import { describe, expect, it } from "vitest";
import {
  computeBottlenecks,
  computeBusFactor,
  computeCollaborationLoad,
  computeOnboardingLoad,
  estimateMeetingLoad,
  type MeetingMeta,
  type MessageMeta,
} from "../src/lib/domain/people/orgNetworkIntelligence";

describe("metadata-only constraint", () => {
  it("MeetingMeta objects carry no content-bearing fields", () => {
    const meeting: MeetingMeta = {
      meetingId: "m1",
      participantIds: [1, 2],
      organizerId: 1,
      durationMinutes: 30,
      recurring: true,
    };
    expect(Object.keys(meeting).sort()).toEqual(
      ["durationMinutes", "meetingId", "organizerId", "participantIds", "recurring"].sort(),
    );
    expect("agenda" in meeting).toBe(false);
    expect("notes" in meeting).toBe(false);
    expect("transcript" in meeting).toBe(false);
  });

  it("MessageMeta objects carry no content-bearing fields", () => {
    const message: MessageMeta = { fromId: 1, toId: 2, channel: "chat" };
    expect(Object.keys(message).sort()).toEqual(["channel", "fromId", "toId"].sort());
    expect("body" in message).toBe(false);
    expect("subject" in message).toBe(false);
    expect("content" in message).toBe(false);
  });
});

describe("collaboration load", () => {
  it("computes meeting hours and distinct collaborators from metadata only", () => {
    const meetings: MeetingMeta[] = [
      { meetingId: "m1", participantIds: [1, 2, 3], organizerId: 1, durationMinutes: 60, recurring: true },
      { meetingId: "m2", participantIds: [1, 4], organizerId: 4, durationMinutes: 30, recurring: false },
    ];
    const messages: MessageMeta[] = [{ fromId: 1, toId: 5, channel: "chat" }];
    const load = computeCollaborationLoad(1, meetings, messages);
    expect(load.meetingHoursPerWeek).toBe(1.5);
    expect(load.distinctCollaborators).toBe(4); // 2,3,4,5
  });

  it("flags overloaded when meeting hours exceed the documented threshold", () => {
    const meetings: MeetingMeta[] = Array.from({ length: 30 }, (_, i) => ({
      meetingId: `m${i}`,
      participantIds: [1, 2],
      organizerId: 1,
      durationMinutes: 60,
      recurring: true,
    }));
    const load = computeCollaborationLoad(1, meetings, []);
    expect(load.loadLevel).toBe("overloaded");
  });
});

describe("bus factor / single points of failure", () => {
  it("flags a person organizing a disproportionate share of a team's meetings", () => {
    const meetings: MeetingMeta[] = [
      { meetingId: "m1", participantIds: [1, 2, 3], organizerId: 1, durationMinutes: 30, recurring: true },
      { meetingId: "m2", participantIds: [1, 2], organizerId: 1, durationMinutes: 30, recurring: true },
      { meetingId: "m3", participantIds: [2, 3], organizerId: 2, durationMinutes: 30, recurring: true },
    ];
    const result = computeBusFactor(10, [1, 2, 3], meetings);
    expect(result.singlePointsOfFailure.some((s) => s.personId === 1)).toBe(true);
    expect(result.busFactor).toBeLessThan(3);
  });
});

describe("bottlenecks", () => {
  it("identifies people touching a large share of cross-group messages", () => {
    const groupOf = new Map([[1, 1], [2, 2], [3, 2], [4, 1]]);
    const messages: MessageMeta[] = [
      { fromId: 1, toId: 2, channel: "chat" },
      { fromId: 1, toId: 3, channel: "chat" },
      { fromId: 4, toId: 2, channel: "email" },
    ];
    const bottlenecks = computeBottlenecks(messages, groupOf);
    expect(bottlenecks[0].personId).toBe(1);
  });
});

describe("onboarding load", () => {
  it("flags elevated load when a mentor supports 3+ recent hires", () => {
    const now = new Date("2026-01-15");
    const pairings = [
      { mentorId: 9, newHireId: 1, hireDate: "2026-01-01" },
      { mentorId: 9, newHireId: 2, hireDate: "2025-12-20" },
      { mentorId: 9, newHireId: 3, hireDate: "2025-12-01" },
    ];
    const result = computeOnboardingLoad(pairings, 90, now);
    expect(result.find((r) => r.personId === 9)?.loadLevel).toBe("elevated");
  });
});

describe("meeting load estimate", () => {
  it("estimates average per-person meeting hours for a team", () => {
    const meetings: MeetingMeta[] = [
      { meetingId: "m1", participantIds: [1, 2], organizerId: 1, durationMinutes: 60, recurring: true },
    ];
    const estimate = estimateMeetingLoad([1, 2], meetings);
    expect(estimate.avgMeetingHoursPerWeek).toBeGreaterThan(0);
    expect(estimate.recurringShare).toBe(1);
  });
});
