// Phase 4 gate 3: "DST/timezone test suite green (5 zones incl. half-hour
// offsets)". Zones covered: UTC (baseline), America/New_York (1h DST),
// Europe/London (1h DST, different transition dates than US), Asia/Kolkata
// (fixed +05:30, no DST — the ordinary half-hour-offset case), and
// Australia/Lord_Howe (a genuine half-hour DST shift: +10:30 <-> +11:00).
import { describe, expect, it } from "vitest";
import { getLocalDateParts, getTzOffsetMinutes, nextOccurrence, zonedTimeToUtc } from "../occurrenceClock";

const ZONES = ["UTC", "America/New_York", "Europe/London", "Asia/Kolkata", "Australia/Lord_Howe"];

describe("zonedTimeToUtc / getLocalDateParts round-trip (all 5 zones, all 4 seasons)", () => {
  const sampleDates = [
    { year: 2026, month: 1, day: 15 },
    { year: 2026, month: 3, day: 9 }, // inside the US DST-start week
    { year: 2026, month: 4, day: 6 }, // inside the UK DST-start week
    { year: 2026, month: 7, day: 15 },
    { year: 2026, month: 10, day: 26 }, // inside the UK DST-end week
    { year: 2026, month: 11, day: 2 }, // inside the US DST-end week
  ];

  for (const zone of ZONES) {
    for (const d of sampleDates) {
      it(`${zone} @ ${d.year}-${d.month}-${d.day} 09:15 round-trips exactly`, () => {
        const utc = zonedTimeToUtc(d.year, d.month, d.day, 9, 15, zone);
        const back = getLocalDateParts(utc, zone);
        expect(back.year).toBe(d.year);
        expect(back.month).toBe(d.month);
        expect(back.day).toBe(d.day);
        expect(back.hour).toBe(9);
        expect(back.minute).toBe(15);
      });
    }
  }
});

describe("DST is actually modeled, not ignored", () => {
  it("America/New_York offset differs between January and July (1h DST)", () => {
    const jan = getTzOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "America/New_York");
    const jul = getTzOffsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "America/New_York");
    expect(jan).toBe(-300); // EST
    expect(jul).toBe(-240); // EDT
    expect(jul - jan).toBe(60);
  });

  it("Europe/London offset differs between January and July (1h DST)", () => {
    const jan = getTzOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "Europe/London");
    const jul = getTzOffsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "Europe/London");
    expect(jan).toBe(0); // GMT
    expect(jul).toBe(60); // BST
  });

  it("Asia/Kolkata stays at a fixed +05:30 offset year-round (no DST)", () => {
    const jan = getTzOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "Asia/Kolkata");
    const jul = getTzOffsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "Asia/Kolkata");
    expect(jan).toBe(330);
    expect(jul).toBe(330);
  });

  it("Australia/Lord_Howe has a genuine half-hour DST shift (+10:30 <-> +11:00)", () => {
    const summer = getTzOffsetMinutes(new Date(Date.UTC(2026, 0, 15, 12)), "Australia/Lord_Howe");
    const winter = getTzOffsetMinutes(new Date(Date.UTC(2026, 6, 15, 12)), "Australia/Lord_Howe");
    expect([630, 660]).toContain(summer);
    expect([630, 660]).toContain(winter);
    expect(Math.abs(summer - winter)).toBe(30);
  });
});

describe("nextOccurrence — weekly_review, timezone-correct across DST", () => {
  const anchor = { weekday: 1, hour: 10, minute: 0 }; // Monday 10:00 local

  for (const zone of ZONES) {
    it(`${zone}: next Monday 10:00 local, found correctly in January`, () => {
      const after = new Date(Date.UTC(2026, 0, 1)); // Thu Jan 1 2026
      const occ = nextOccurrence("weekly_review", zone, anchor, after);
      const local = getLocalDateParts(occ.scheduledFor, zone);
      expect(local.weekday).toBe(1);
      expect(local.hour).toBe(10);
      expect(local.minute).toBe(0);
      expect(occ.scheduledFor.getTime()).toBeGreaterThan(after.getTime());
    });

    it(`${zone}: next Monday 10:00 local, found correctly in July (other DST season)`, () => {
      const after = new Date(Date.UTC(2026, 6, 1));
      const occ = nextOccurrence("weekly_review", zone, anchor, after);
      const local = getLocalDateParts(occ.scheduledFor, zone);
      expect(local.weekday).toBe(1);
      expect(local.hour).toBe(10);
      expect(local.minute).toBe(0);
    });
  }

  it("never returns an occurrence at or before `after`", () => {
    const after = new Date(Date.UTC(2026, 2, 8, 23, 0)); // right before a DST-week Monday
    const occ = nextOccurrence("weekly_review", "America/New_York", anchor, after);
    expect(occ.scheduledFor.getTime()).toBeGreaterThan(after.getTime());
  });
});

describe("nextOccurrence — monthly clamps day-of-month to the shortest month", () => {
  it("dayOfMonth=31 in April (30 days) clamps to April 30", () => {
    const occ = nextOccurrence("monthly_business_review", "UTC", { dayOfMonth: 31, hour: 9, minute: 0 }, new Date(Date.UTC(2026, 3, 1)));
    const local = getLocalDateParts(occ.scheduledFor, "UTC");
    expect(local.month).toBe(4);
    expect(local.day).toBe(30);
  });
});

describe("occurrence keys", () => {
  it("weekly_review keys are ISO week keys (YYYY-Www)", () => {
    const occ = nextOccurrence("weekly_review", "UTC", { weekday: 1, hour: 9, minute: 0 }, new Date(Date.UTC(2026, 0, 1)));
    expect(occ.occurrenceKey).toMatch(/^2026-W\d{2}$/);
  });

  it("quarterly_strategy keys are YYYY-Qn", () => {
    const occ = nextOccurrence("quarterly_strategy", "UTC", { dayOfMonth: 1, hour: 9, minute: 0 }, new Date(Date.UTC(2026, 0, 1)));
    expect(occ.occurrenceKey).toMatch(/^2026-Q[1-4]$/);
  });
});
