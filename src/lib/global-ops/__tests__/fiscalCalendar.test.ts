import { describe, expect, it } from "vitest";
import {
  alignPeriodsToWindow,
  diffDaysUTC,
  generateFiscalPeriods,
  isLeapYear,
  parseISODateUTC,
  periodLengthDays,
} from "../fiscalCalendar";
import type { EntityRecord } from "../types";

const YEARS = Array.from({ length: 10 }, (_, i) => 2016 + i); // 2016..2025, includes leap years 2016/2020/2024
const CALENDAR_TYPES = ["calendar", "445", "544", "454"] as const;

function makeEntity(type: (typeof CALENDAR_TYPES)[number]): Pick<EntityRecord, "fiscalCalendarConfig" | "fiscalCalendarType"> {
  return { fiscalCalendarType: type, fiscalCalendarConfig: { yearStartMonth: 1, weekStartsOn: 1 } };
}

describe("generateFiscalPeriods — property tests across calendar types x 10 years", () => {
  for (const type of CALENDAR_TYPES) {
    for (const year of YEARS) {
      it(`[${type} / ${year}] produces exactly 12 contiguous, non-overlapping periods`, () => {
        const periods = generateFiscalPeriods(makeEntity(type), year);
        expect(periods).toHaveLength(12);
        for (let i = 0; i < periods.length - 1; i += 1) {
          const end = parseISODateUTC(periods[i].endDate);
          const nextStart = parseISODateUTC(periods[i + 1].startDate);
          expect(diffDaysUTC(end, nextStart)).toBe(1); // end + 1 day === next start, no gap/overlap
        }
      });

      it(`[${type} / ${year}] period lengths sum to the full declared year span`, () => {
        const periods = generateFiscalPeriods(makeEntity(type), year);
        const totalDays = periods.reduce((sum, p) => sum + periodLengthDays(p), 0);
        const spanDays = diffDaysUTC(parseISODateUTC(periods[0].startDate), parseISODateUTC(periods[11].endDate)) + 1;
        expect(totalDays).toBe(spanDays);
        if (type === "calendar") {
          expect([365, 366]).toContain(totalDays);
          expect(totalDays).toBe(isLeapYear(year) ? 366 : 365);
        } else {
          // 4-4-5 family: always a whole number of weeks, 52 in most years, 53 in leap-week years
          expect(totalDays % 7).toBe(0);
          expect([52 * 7, 53 * 7]).toContain(totalDays);
        }
      });
    }
  }

  it("calendar type: February has 29 days in a leap year and 28 otherwise", () => {
    const leap = generateFiscalPeriods(makeEntity("calendar"), 2024);
    const nonLeap = generateFiscalPeriods(makeEntity("calendar"), 2025);
    expect(periodLengthDays(leap[1])).toBe(29);
    expect(periodLengthDays(nonLeap[1])).toBe(28);
  });

  it("DST invariance: period lengths are computed from UTC calendar days and are unaffected by US/EU DST transitions", () => {
    // US DST 2024: spring-forward Mar 10, fall-back Nov 3. EU DST 2024: Mar 31 / Oct 27.
    // A calendar-type March period must still be exactly 31 days regardless of any DST shift.
    const periods2024 = generateFiscalPeriods(makeEntity("calendar"), 2024);
    const march = periods2024[2];
    expect(periodLengthDays(march)).toBe(31);
    const november = periods2024[10];
    expect(periodLengthDays(november)).toBe(30);
    // Direct proof that diffDaysUTC is immune to DST: day count between two UTC dates straddling
    // a DST boundary matches the plain calendar difference.
    expect(diffDaysUTC(parseISODateUTC("2024-03-01"), parseISODateUTC("2024-04-01"))).toBe(31);
    expect(diffDaysUTC(parseISODateUTC("2024-10-27"), parseISODateUTC("2024-11-04"))).toBe(8);
  });
});

describe("alignPeriodsToWindow — period-alignment engine", () => {
  it("self-alignment: aligning an entity's own periods against themselves yields fraction 1 with no cross-bleed", () => {
    for (const type of CALENDAR_TYPES) {
      for (const year of [2020, 2024, 2025]) {
        const periods = generateFiscalPeriods(makeEntity(type), year);
        for (const p of periods) {
          const overlaps = alignPeriodsToWindow(periods, p.startDate, p.endDate);
          expect(overlaps).toHaveLength(1);
          expect(overlaps[0].period.fiscalPeriod).toBe(p.fiscalPeriod);
          expect(overlaps[0].fractionOfPeriod).toBe(1);
        }
      }
    }
  });

  it("cross-calendar alignment never double-counts or fabricates overlap days", () => {
    // Align a 4-4-5 entity's periods onto a calendar-type group's monthly windows for the same
    // nominal year, and prove the total counted overlap never exceeds the true date-range
    // intersection computed independently.
    const entityPeriods = generateFiscalPeriods(makeEntity("445"), 2024);
    const groupWindows = generateFiscalPeriods(makeEntity("calendar"), 2024);

    let engineTotalOverlap = 0;
    for (const window of groupWindows) {
      const overlaps = alignPeriodsToWindow(entityPeriods, window.startDate, window.endDate);
      for (const o of overlaps) {
        engineTotalOverlap += o.overlapDays;
        expect(o.overlapDays).toBeGreaterThan(0);
        expect(o.overlapDays).toBeLessThanOrEqual(o.periodLengthDays);
      }
    }

    const entityStart = parseISODateUTC(entityPeriods[0].startDate);
    const entityEnd = parseISODateUTC(entityPeriods[11].endDate);
    const groupStart = parseISODateUTC(groupWindows[0].startDate);
    const groupEnd = parseISODateUTC(groupWindows[11].endDate);
    const intersectStart = entityStart.getTime() > groupStart.getTime() ? entityStart : groupStart;
    const intersectEnd = entityEnd.getTime() < groupEnd.getTime() ? entityEnd : groupEnd;
    const trueIntersectionDays = diffDaysUTC(intersectStart, intersectEnd) + 1;

    expect(engineTotalOverlap).toBe(trueIntersectionDays);
  });
});
