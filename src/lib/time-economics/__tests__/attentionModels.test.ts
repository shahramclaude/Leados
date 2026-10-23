// Sanity tests for the attention-time model (fragmentation, circadian,
// fatigue, cadence adaptation) — these are heuristic models, so tests
// check directional correctness and documented bounds, not exact "truth".
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFragmentation } from "../cognitiveLoad";
import { circadianEnergy } from "../circadian";
import { cumulativeRecoveryMinutes, dailyFatigueIndex } from "../fatigue";
import { suggestCadenceChange } from "../ritualEngine";
import { mineRecurringPattern } from "../processMining";

test("fragmentation: a packed day has lower deep-work-preserved minutes than an open day", () => {
  const workStart = 9 * 60;
  const workEnd = 17 * 60;
  const packedDay = analyzeFragmentation(
    [
      { startMinute: 9 * 60, endMinute: 9 * 60 + 30 },
      { startMinute: 10 * 60, endMinute: 10 * 60 + 30 },
      { startMinute: 11 * 60, endMinute: 11 * 60 + 30 },
      { startMinute: 13 * 60, endMinute: 13 * 60 + 30 },
      { startMinute: 14 * 60, endMinute: 14 * 60 + 30 },
    ],
    workStart,
    workEnd,
  );
  const openDay = analyzeFragmentation([{ startMinute: 9 * 60, endMinute: 9 * 60 + 30 }], workStart, workEnd);

  assert.ok(
    packedDay.deepWorkPreservedMinutes < openDay.deepWorkPreservedMinutes,
    "a day with 5 scattered meetings should preserve less deep-work time than a day with 1",
  );
  assert.ok(packedDay.contextSwitches > openDay.contextSwitches);
});

test("circadian: energy stays within [0,1] across a full day for every chronotype", () => {
  for (const chronotype of ["lark", "intermediate", "owl"] as const) {
    for (let h = 0; h < 24; h += 0.5) {
      const e = circadianEnergy(h, chronotype);
      assert.ok(e >= 0 && e <= 1, `energy out of bounds at hour ${h} for ${chronotype}: ${e}`);
    }
  }
});

test("circadian: lark peaks earlier in the day than owl", () => {
  const larkMorning = circadianEnergy(8, "lark");
  const owlMorning = circadianEnergy(8, "owl");
  const larkEvening = circadianEnergy(20, "lark");
  const owlEvening = circadianEnergy(20, "owl");
  assert.ok(larkMorning > owlMorning, "lark should have higher energy than owl at 8am");
  assert.ok(owlEvening > larkEvening, "owl should have higher energy than lark at 8pm");
});

test("fatigue: recovery cost grows with interruption count but sub-linearly (compounding residue)", () => {
  const one = cumulativeRecoveryMinutes(1);
  const two = cumulativeRecoveryMinutes(2);
  const five = cumulativeRecoveryMinutes(5);
  assert.equal(one, 23); // matches the Mark, Gudith & Klocke (2008) default exactly for n=1
  assert.ok(two > one && two < one * 2, "second interruption should add less than a full fresh recovery window");
  assert.ok(five > two);
});

test("fatigue: index rises with more interruptions", () => {
  const low = dailyFatigueIndex(1, 6);
  const high = dailyFatigueIndex(8, 9);
  assert.ok(high > low);
  assert.ok(high <= 1 && low >= 0);
});

test("cadence adaptation: 6-week zero-outcome streak suggests kill", () => {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const history = Array.from({ length: 6 }, (_, i) => ({
    eventId: `e${i}`,
    decisionsCount: 0,
    actionsCount: 0,
    occurredAt: new Date(now - (6 - i) * week),
  }));
  const suggestion = suggestCadenceChange(history, 6, 30);
  assert.equal(suggestion.action, "kill");
});

test("process mining: detects a declining trend across a recurring meeting's history", () => {
  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const instances = [
    { eventId: "a", occurredAt: new Date(now - 4 * week), decisionsCount: 3, actionsCount: 3 },
    { eventId: "b", occurredAt: new Date(now - 3 * week), decisionsCount: 2, actionsCount: 2 },
    { eventId: "c", occurredAt: new Date(now - 2 * week), decisionsCount: 1, actionsCount: 0 },
    { eventId: "d", occurredAt: new Date(now - 1 * week), decisionsCount: 0, actionsCount: 0 },
  ];
  const pattern = mineRecurringPattern("rec-x", instances);
  assert.equal(pattern.trendDirection, "declining");
  assert.equal(pattern.zeroOutcomeStreakWeeks, 1);
});
