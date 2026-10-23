// Seeded scheduling scenarios must produce feasible, constraint-satisfying
// schedules — every returned candidate is independently re-checked here
// against the same hard constraints the optimizer claims to enforce.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSchedulingSuggestions } from "../calendarOptimizer";
import type { AttendeeContext, NoMeetingWindowConstraint } from "../calendarOptimizer";
import { localDayOfWeek, localMinuteOfDay, overlaps } from "../temporal";

function isoDate(d: string) {
  return new Date(d);
}

test("optimizer: never returns a slot where a required attendee is busy", () => {
  const attendees: AttendeeContext[] = [
    {
      userId: "alice",
      required: true,
      timezone: "America/New_York",
      chronotype: "lark",
      busy: [{ start: isoDate("2026-02-02T14:00:00Z"), end: isoDate("2026-02-02T15:00:00Z") }],
      workDayStartMinute: 9 * 60,
      workDayEndMinute: 17 * 60,
    },
    {
      userId: "bob",
      required: true,
      timezone: "America/New_York",
      chronotype: "owl",
      busy: [],
      workDayStartMinute: 9 * 60,
      workDayEndMinute: 17 * 60,
    },
  ];

  const result = generateSchedulingSuggestions({
    title: "Sync",
    durationMinutes: 30,
    earliestStart: isoDate("2026-02-02T13:00:00Z"),
    latestEnd: isoDate("2026-02-02T20:00:00Z"),
    attendees,
    noMeetingWindows: [],
    candidateGranularityMinutes: 15,
    maxCandidates: 20,
  });

  assert.ok(result.feasibleCandidates.length > 0, "expected at least one feasible candidate");
  for (const c of result.feasibleCandidates) {
    const start = new Date(c.start);
    const end = new Date(c.end);
    for (const a of attendees) {
      for (const busy of a.busy) {
        assert.equal(overlaps(start, end, busy.start, busy.end), false, `candidate ${c.start} overlaps ${a.userId}'s busy interval`);
      }
    }
  }
});

test("optimizer: never returns a slot violating an enforced no-meeting window for a required attendee", () => {
  const attendees: AttendeeContext[] = [
    {
      userId: "alice",
      required: true,
      timezone: "UTC",
      chronotype: "intermediate",
      busy: [],
      workDayStartMinute: 0,
      workDayEndMinute: 24 * 60,
    },
  ];
  // Enforced window: every day, 09:00-12:00 UTC is blocked.
  const windows: NoMeetingWindowConstraint[] = [0, 1, 2, 3, 4, 5, 6].map((dow) => ({
    dayOfWeek: dow,
    startMinute: 9 * 60,
    endMinute: 12 * 60,
    enforced: true,
    appliesToUserId: null,
  }));

  const result = generateSchedulingSuggestions({
    title: "Deep work test",
    durationMinutes: 30,
    earliestStart: isoDate("2026-02-02T08:00:00Z"),
    latestEnd: isoDate("2026-02-02T18:00:00Z"),
    attendees,
    noMeetingWindows: windows,
    candidateGranularityMinutes: 15,
    maxCandidates: 50,
  });

  assert.ok(result.feasibleCandidates.length > 0);
  for (const c of result.feasibleCandidates) {
    const start = new Date(c.start);
    const localStart = localMinuteOfDay("UTC", start);
    const dow = localDayOfWeek("UTC", start);
    const window = windows.find((w) => w.dayOfWeek === dow);
    assert.ok(window, "window should exist for every day in this fixture");
    const violatesWindow = localStart < window!.endMinute && window!.startMinute < localStart + 30;
    assert.equal(violatesWindow, false, `candidate ${c.start} falls inside the enforced no-meeting window`);
  }
});

test("optimizer: respects each required attendee's local work-day bounds", () => {
  const attendees: AttendeeContext[] = [
    {
      userId: "alice",
      required: true,
      timezone: "UTC",
      chronotype: "intermediate",
      busy: [],
      workDayStartMinute: 9 * 60,
      workDayEndMinute: 17 * 60,
    },
  ];
  const result = generateSchedulingSuggestions({
    title: "Work day bounded",
    durationMinutes: 30,
    earliestStart: isoDate("2026-02-02T00:00:00Z"),
    latestEnd: isoDate("2026-02-03T00:00:00Z"),
    attendees,
    noMeetingWindows: [],
    candidateGranularityMinutes: 30,
    maxCandidates: 50,
  });
  assert.ok(result.feasibleCandidates.length > 0);
  for (const c of result.feasibleCandidates) {
    const start = new Date(c.start);
    const localStart = localMinuteOfDay("UTC", start);
    assert.ok(localStart >= 9 * 60 && localStart + 30 <= 17 * 60, `candidate ${c.start} outside 09:00-17:00 UTC work day`);
  }
});

test("optimizer: infeasible request yields zero candidates with reasons, not a crash", () => {
  const attendees: AttendeeContext[] = [
    {
      userId: "alice",
      required: true,
      timezone: "UTC",
      chronotype: "intermediate",
      busy: [{ start: isoDate("2026-02-02T09:00:00Z"), end: isoDate("2026-02-02T17:00:00Z") }],
      workDayStartMinute: 9 * 60,
      workDayEndMinute: 17 * 60,
    },
  ];
  const result = generateSchedulingSuggestions({
    title: "Impossible",
    durationMinutes: 30,
    earliestStart: isoDate("2026-02-02T09:00:00Z"),
    latestEnd: isoDate("2026-02-02T17:00:00Z"),
    attendees,
    noMeetingWindows: [],
  });
  assert.equal(result.feasibleCandidates.length, 0);
  assert.ok(Object.keys(result.infeasibleReasonSummary).length > 0);
});
