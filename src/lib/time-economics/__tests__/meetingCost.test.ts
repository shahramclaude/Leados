// Fixture test: meeting-cost output must match a hand computation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMeetingCost } from "../meetingCost";

test("meeting cost: direct cost matches hand computation (no deep-work interruption)", () => {
  // 3 attendees, 1 hour meeting, rates $100, $120, $80.
  // Hand computation: direct = (100+120+80) * 1h = 300. No interruption => opportunity = 0.
  const start = new Date("2026-01-05T15:00:00Z");
  const end = new Date("2026-01-05T16:00:00Z");
  const result = computeMeetingCost({
    orgId: "org-1",
    eventId: "evt-1",
    title: "Planning",
    startTime: start,
    endTime: end,
    attendees: [
      { userId: "a", loadedHourlyRate: 100, required: true, interruptsDeepWork: false, chronotype: "intermediate" },
      { userId: "b", loadedHourlyRate: 120, required: true, interruptsDeepWork: false, chronotype: "intermediate" },
      { userId: "c", loadedHourlyRate: 80, required: false, interruptsDeepWork: false, chronotype: "intermediate" },
    ],
    deepWorkPremiumMultiplier: 1.5,
    recoveryMinutesPerInterruption: 23,
  });

  assert.equal(result.durationHours, 1);
  assert.equal(result.directCost, 300);
  assert.equal(result.opportunityCost, 0);
  assert.equal(result.totalCost, 300);
  assert.ok(result.method.length > 0, "method notes must be present for UI transparency");
});

test("meeting cost: opportunity cost matches hand computation (deep-work interruption)", () => {
  // 1 attendee, 30 min meeting, rate $120/hr, interrupts deep work.
  // Hand computation:
  //   direct = 120 * 0.5h = 60
  //   recovery minutes (single interruption) = 23 (DEFAULT_RECOVERY_MINUTES_PER_INTERRUPTION, no compounding for n=1)
  //   recovery hours = 23/60 = 0.383333...
  //   opportunity = 120 * 0.383333 * 1.5 (premium multiplier) = 69.0
  const start = new Date("2026-01-05T15:00:00Z");
  const end = new Date("2026-01-05T15:30:00Z");
  const result = computeMeetingCost({
    orgId: "org-1",
    eventId: "evt-2",
    title: "Quick sync",
    startTime: start,
    endTime: end,
    attendees: [{ userId: "a", loadedHourlyRate: 120, required: true, interruptsDeepWork: true, chronotype: "lark" }],
    deepWorkPremiumMultiplier: 1.5,
    recoveryMinutesPerInterruption: 23,
  });

  const expectedDirect = 60;
  const expectedOpportunity = Math.round(120 * (23 / 60) * 1.5 * 100) / 100;

  assert.equal(result.directCost, expectedDirect);
  assert.equal(result.opportunityCost, expectedOpportunity);
  assert.equal(result.totalCost, Math.round((expectedDirect + expectedOpportunity) * 100) / 100);
  assert.equal(result.perAttendee[0].interruptedDeepWork, true);
});

test("meeting cost: zero attendees produces zero cost, not an error", () => {
  const result = computeMeetingCost({
    orgId: "org-1",
    eventId: "evt-3",
    title: "Empty",
    startTime: new Date("2026-01-05T15:00:00Z"),
    endTime: new Date("2026-01-05T15:30:00Z"),
    attendees: [],
    deepWorkPremiumMultiplier: 1.5,
    recoveryMinutesPerInterruption: 23,
  });
  assert.equal(result.directCost, 0);
  assert.equal(result.totalCost, 0);
});
