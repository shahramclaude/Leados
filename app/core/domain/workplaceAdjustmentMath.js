/**
 * app/core/domain/workplaceAdjustmentMath.js — the exact integer kernels of the
 * Workplace Adjustment & Functional-Restriction Register (ADR-0241).
 *
 * PURE. No DOM, no storage, no clock, no network. Every figure the register
 * prints for a shift-based limit is computed here by integer arithmetic on
 * whole minutes, so the same fixture gives the same answer in a test, in the
 * browser and in an exported file — and so nothing can be silently rounded into
 * a reassuring answer.
 *
 * THE THREE KERNELS, AND WHY EACH IS EXACT RATHER THAN APPROXIMATE:
 *
 *  1. `nightMinutesInShift` — the minutes of a declared span that fall inside a
 *     DECLARED night window. The window may wrap past midnight (22:00–06:00 is
 *     the ordinary declaration), so the kernel splits the shift at local
 *     midnight and tests each piece against the window directly. It never
 *     approximates "a shift starting after 20:00 is a night shift": a 20:00–04:00
 *     shift carries four hours of night, not a boolean.
 *
 *  2. `shiftSpanMinutes` — the length of a declared span. `end <= start` means
 *     the span crosses midnight, which is a real and extremely common shape for
 *     a night shift; it is not a mistake to reject.
 *
 *  3. `minuteOverlaps` / `restMinutesBetween` — the exact rest between two
 *     spans, MERGED across every reporting line. This is the kernel the matrix
 *     requirement lives in: a functional manager's day shift and a project
 *     manager's night run can each be individually lawful and still leave the
 *     person six hours between two jobs. Merging the spans is the only way to
 *     see it, and merging is done on absolute minutes, not on wall clocks, so a
 *     span crossing midnight cannot be counted as two short days.
 */

/**
 * Local wall-clock minutes (since midnight) to absolute minutes on a monotonic
 * axis by adding the day number. Never used for time-zone conversion — this
 * register compares declared local wall times on one roster, and `workRest`
 * remains the register that resolves zones for pay and rest across zones.
 */
export function absoluteMinute(dayNumber, wallMinute) {
  return dayNumber * 1440 + wallMinute;
}

/** Days between two `YYYY-MM-DD` keys, as an integer day number. */
export function dayNumber(day) {
  if (typeof day !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isFinite(time) ? Math.floor(time / 86_400_000) : null;
}

/** Whole minutes between two wall clocks on one day; `end <= start` crosses midnight. */
export function shiftSpanMinutes(startWall, endWall) {
  if (!Number.isInteger(startWall) || !Number.isInteger(endWall)) return null;
  if (startWall < 0 || startWall > 1439) return null;
  if (endWall < 0 || endWall > 1440) return null;
  if (startWall === endWall) return null;
  return endWall > startWall ? endWall - startWall : (1440 - startWall) + endWall;
}

/**
 * The minutes of the interval [aStart, aEnd) that lie inside the declared night
 * window [wStart, wEnd), where the window wraps past midnight when
 * `wEnd <= wStart`.
 *
 * The kernel does NOT split the shift at midnight. Instead it slides the window
 * back and forward by whole days and intersects each copy with the interval, so
 * a shift spanning several days, a wrapping window and an ordinary daytime
 * window all take exactly the same code path. That is what makes the number
 * defensible: there is one rule, not a special case per shape.
 */
export function nightMinutesInShift(aStart, aEnd, wStart, wEnd) {
  if (![aStart, aEnd, wStart, wEnd].every(Number.isInteger)) return null;
  if (aEnd <= aStart) return null;
  if (wStart < 0 || wStart > 1439) return null;
  if (wEnd < 0 || wEnd > 1440) return null;
  const windowLen = wEnd > wStart ? wEnd - wStart : (1440 - wStart) + wEnd;
  if (windowLen <= 0) return 0;
  let total = 0;
  // The window's copies tile the axis every 1440 minutes. Aligning on the first
  // copy at or before the shift start is enough: any interval containing a
  // window boundary is caught by the ±1 day sweep.
  const firstDay = Math.floor(aStart / 1440);
  for (let day = firstDay - 1; day <= firstDay + Math.ceil((aEnd - aStart) / 1440) + 1; day += 1) {
    const copyStart = day * 1440 + wStart;
    const copyEnd = copyStart + windowLen;
    const lo = Math.max(aStart, copyStart);
    const hi = Math.min(aEnd, copyEnd);
    if (hi > lo) total += hi - lo;
  }
  return total;
}

/** Does the interval [aStart, aEnd) touch the window at all? Exact, same kernel. */
export function overlapsNight(aStart, aEnd, wStart, wEnd) {
  const minutes = nightMinutesInShift(aStart, aEnd, wStart, wEnd);
  return minutes !== null && minutes > 0;
}

/**
 * Merge a list of absolute-minute intervals, dropping empty or reversed ones.
 * Returns SORTED, NON-OVERLAPPING intervals. Two intervals that touch exactly
 * are merged, because a shift ending at 14:00 and another starting at 14:00 is
 * one continuous spell of work for the purpose of a rest limit.
 */
export function mergeIntervals(intervals) {
  const valid = (Array.isArray(intervals) ? intervals : [])
    .filter((row) => Array.isArray(row) && Number.isInteger(row[0]) && Number.isInteger(row[1]) && row[1] > row[0])
    .map((row) => [row[0], row[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [start, end] of valid) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else out.push([start, end]);
  }
  return out;
}

/**
 * The exact rest between consecutive MERGED spells, in whole minutes.
 *
 * Returns every gap with the two spells that created it, so the screen can
 * print which two pieces of work squeezed the person rather than an average.
 * Averaging rests is how a short gap between two different managers' shifts
 * disappears.
 */
export function restGaps(intervals) {
  const merged = mergeIntervals(intervals);
  const gaps = [];
  for (let i = 1; i < merged.length; i += 1) {
    const previous = merged[i - 1];
    const next = merged[i];
    const gap = next[0] - previous[1];
    if (gap > 0) gaps.push({ minutes: gap, fromEnd: previous[1], toStart: next[0], previous, next });
  }
  return gaps;
}

/**
 * A declared limit tested against measured minutes.
 *
 * Three outcomes and no fourth: `within`, `breached` with the exact minutes of
 * exposure, or `unproven` when the measurement itself could not be taken. An
 * untested limit is never reported as within it.
 */
export function testMaxLimit(measuredMinutes, limitMinutes) {
  if (!Number.isInteger(measuredMinutes) || !Number.isInteger(limitMinutes)) {
    return { verdict: 'unproven', measuredMinutes: null, overByMinutes: null };
  }
  if (measuredMinutes > limitMinutes) {
    return { verdict: 'breached', measuredMinutes, overByMinutes: measuredMinutes - limitMinutes };
  }
  return { verdict: 'within', measuredMinutes, overByMinutes: 0 };
}

/** A declared minimum tested against the smallest measured gap. */
export function testMinLimit(smallestGapMinutes, limitMinutes) {
  if (!Number.isInteger(smallestGapMinutes) || !Number.isInteger(limitMinutes)) {
    return { verdict: 'unproven', measuredMinutes: null, shortByMinutes: null };
  }
  if (smallestGapMinutes < limitMinutes) {
    return { verdict: 'breached', measuredMinutes: smallestGapMinutes, shortByMinutes: limitMinutes - smallestGapMinutes };
  }
  return { verdict: 'within', measuredMinutes: smallestGapMinutes, shortByMinutes: 0 };
}

/** Exact whole days between two `YYYY-MM-DD` keys, or null. Never negative-adjusted. */
export function daysBetweenDays(fromDay, toDay) {
  const a = dayNumber(fromDay);
  const b = dayNumber(toDay);
  if (a === null || b === null) return null;
  return b - a;
}

/**
 * The median of a list of integers, EXACTLY. For an even count the two middle
 * values are averaged; because a day count is an integer the average may be a
 * half day, and this kernel reports it as such rather than rounding a figure
 * the record does not support. Returns null for an empty list.
 */
export function exactMedian(values) {
  const rows = (Array.isArray(values) ? values : []).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  if (!rows.length) return null;
  const middle = Math.floor(rows.length / 2);
  if (rows.length % 2 === 1) return { value: rows[middle], halves: false };
  const sum = rows[middle - 1] + rows[middle];
  return { value: sum / 2, halves: sum % 2 !== 0 };
}

/** Format a possibly half-integer median for printing without rounding the halves away. */
export function formatExactMedian(median) {
  if (!median || median.value === null || median.value === undefined) return null;
  if (!median.halves) return String(median.value);
  return `${Math.floor(median.value)}.5`;
}
