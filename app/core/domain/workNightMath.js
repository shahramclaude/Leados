/**
 * app/core/domain/workNightMath.js — the exact interval kernel of the
 * Night-Work & In-Shift Break Reading (ADR-0226). Pure: wall-clock minutes
 * and UTC minutes in, whole minutes out. No clock, no zone, no person, no
 * state.
 *
 * WHAT IT DECIDES. Given one person's recorded shifts (with their stored wall
 * times and offsets), their recorded breaks, the declared night window and
 * limits, the stretches every line attested, and a horizon:
 *
 *   - the NIGHT MINUTES of every shift: the wall-clock minutes of its coverage
 *     that fall inside the declared night window;
 *   - the NIGHT SHARE of every shift, compared against a declared maximum with
 *     exact integer arithmetic;
 *   - the NIGHT STREAK: the longest run of consecutive UTC days on which the
 *     person's work carries night minutes;
 *   - the CONTINUOUS STRETTCHES of work inside every spell after its recorded
 *     breaks, and the stretches that a declared break-after limit requires a
 *     break record for;
 *   - the SCHEDULE FATIGUE INDEX: a declared-convention score over the factors
 *     the policy declares, with every factor printed.
 *
 * MONOTONICITY is the property the whole design leans on. Adding a shift to
 * a record can only add night minutes, lengthen a streak or lengthen a
 * continuous stretch — it can never remove them. So every breach found on a
 * partial record holds on the complete one, while a clearance needs the
 * record to be attested complete.
 */

import { parseWallTime } from './workRestTime.js';

/** The minute-of-day of a stored wall time: `YYYY-MM-DDTHH:mm` → 0–1439. */
export function wallMinuteOfDay(wallText) {
  const wall = parseWallTime(wallText);
  return wall ? Math.floor(wall.wallMin % 1440) : null;
}

/**
 * The wall-clock coverage of one shift: every minute-of-day the shift's
 * stored wall interval contains, wrapping at midnight, each minute once.
 * Built from the stored wall times alone, so it is the same set on every
 * device. `null` when either end cannot be read.
 */
export function wallCoverageSet(startWallText, endWallText) {
  const a = wallMinuteOfDay(startWallText);
  const b = wallMinuteOfDay(endWallText);
  if (a === null || b === null) return null;
  const out = [];
  if (b >= a) {
    for (let m = a; m < b; m += 1) out.push(m);
  } else {
    for (let m = a; m < 1440; m += 1) out.push(m);
    for (let m = 0; m < b; m += 1) out.push(m);
  }
  return out;
}

/** The declared night window as a sorted set of minute-of-day values, wrapping. */
export function nightWindowSet(fromMin, toMin) {
  if (!Number.isInteger(fromMin) || !Number.isInteger(toMin)) return null;
  if (fromMin < 0 || fromMin > 1439 || toMin < 0 || toMin > 1439 || fromMin === toMin) return null;
  const out = [];
  if (toMin > fromMin) {
    for (let m = fromMin; m < toMin; m += 1) out.push(m);
  } else {
    for (let m = fromMin; m < 1440; m += 1) out.push(m);
    for (let m = 0; m < toMin; m += 1) out.push(m);
  }
  return out;
}

/**
 * The number of minutes both sets contain. Both inputs are sorted sets of
 * minute-of-day values; the intersection is walked in one pass.
 */
export function countIntersection(sortedA, sortedB) {
  if (!Array.isArray(sortedA) || !Array.isArray(sortedB) || !sortedA.length || !sortedB.length) return 0;
  let i = 0;
  let j = 0;
  let count = 0;
  while (i < sortedA.length && j < sortedB.length) {
    if (sortedA[i] === sortedB[j]) { count += 1; i += 1; j += 1; }
    else if (sortedA[i] < sortedB[j]) i += 1;
    else j += 1;
  }
  return count;
}

/**
 * The night minutes of one shift: the wall-clock minutes of its coverage that
 * fall inside the night window. Exact, from the stored wall times alone.
 */
export function nightMinutesOfShift(shift, nightSet) {
  if (!nightSet || !Array.isArray(nightSet) || !nightSet.length) return { minutes: 0, coverage: null };
  const coverage = wallCoverageSet(shift.effStart, shift.effEnd);
  if (coverage === null) return { minutes: 0, coverage: null };
  return { minutes: countIntersection(coverage, nightSet), coverage: coverage.length };
}

/**
 * Whether a shift's night share is over the declared maximum, in EXACT integer
 * arithmetic: `night × 100 > coverage × limitPct`. Returns the share in whole
 * percentage points (truncated) for printing alongside.
 */
export function nightShareOver(nightMinutes, coverageMinutes, limitPct) {
  if (!Number.isInteger(nightMinutes) || !Number.isInteger(coverageMinutes) || coverageMinutes <= 0) return null;
  if (!Number.isInteger(limitPct)) return null;
  return nightMinutes * 100 > coverageMinutes * limitPct;
}

/** The share in whole percentage points (truncated), for printing. */
export function nightSharePct(nightMinutes, coverageMinutes) {
  if (!Number.isInteger(nightMinutes) || !Number.isInteger(coverageMinutes) || coverageMinutes <= 0) return null;
  return Math.floor((nightMinutes * 100) / coverageMinutes);
}

/**
 * Which UTC days a shift's night minutes fall on. A shift whose two stored
 * offsets agree maps each wall minute of its coverage to an exact instant; a
 * shift whose offsets disagree (it straddles a clock change) cannot be mapped
 * exactly, and returns null — the caller refuses it with its reason rather
 * than re-timing it.
 */
export function nightDaysOfShift(shift, nightSet) {
  if (!nightSet || !Array.isArray(nightSet) || !nightSet.length) return [];
  if (shift.effStartOffsetMin !== shift.effEndOffsetMin) return null;
  const coverage = wallCoverageSet(shift.effStart, shift.effEnd);
  if (coverage === null) return [];
  const startMinOfDay = wallMinuteOfDay(shift.effStart);
  const days = new Set();
  for (const minuteOfDay of coverage) {
    if (!nightSet.includes(minuteOfDay)) continue;
    // Position from the shift start, in wall-clock minutes; the offset is
    // constant across the shift, so the instant is exact.
    const position = (minuteOfDay - startMinOfDay + 1440) % 1440;
    const instant = shift.s + position;
    days.add(Math.floor(instant / 1440));
  }
  return [...days].sort((a, b) => a - b);
}

/** The longest run of consecutive integers in a sorted list. */
export function longestConsecutiveRun(sortedDays) {
  if (!Array.isArray(sortedDays) || !sortedDays.length) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    run = sortedDays[i] === sortedDays[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

/**
 * The continuous stretches of work inside one spell after its recorded breaks.
 *
 *   spell       { s, e }                      the merged spell, in UTC minutes
 *   breakRanges [[from, to], …]               the spell's recorded breaks
 *
 * Returns the gaps between the breaks (and the spell's own ends), each with
 * the shift ids whose work the gap contains, plus the longest stretch. A gap
 * longer than a declared `breakAfterMin` is a stretch the record cannot prove
 * was broken — the caller refuses the clearance for it.
 */
export function continuousSegments(spell, breakRanges) {
  const breaks = (Array.isArray(breakRanges) ? breakRanges : [])
    .filter((row) => row && Number.isInteger(row.from) && Number.isInteger(row.to) && row.to > row.from)
    .map((row) => [Math.max(row.from, spell.s), Math.min(row.to, spell.e)])
    .filter((row) => row[1] > row[0])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const segments = [];
  let cursor = spell.s;
  for (const [from, to] of breaks) {
    if (from > cursor) segments.push({ from: cursor, to: from, minutes: from - cursor });
    if (to > cursor) cursor = to;
  }
  if (spell.e > cursor) segments.push({ from: cursor, to: spell.e, minutes: spell.e - cursor });
  const longest = segments.length ? Math.max(...segments.map((row) => row.minutes)) : (spell.e - spell.s);
  return { segments, longest, hasBreak: breaks.length > 0 };
}

/**
 * The schedule fatigue index: a declared convention, 100 × the largest of the
 * factors the policy declares, each capped at one. Returns null when no factor
 * is declared. Every factor carries its measure and limit so the printed index
 * can always be checked against the record.
 */
export function fatigueIndex(factors) {
  const declared = (Array.isArray(factors) ? factors : []).filter((row) => row && Number.isFinite(row.ratio));
  if (!declared.length) return null;
  const index = 100 * Math.max(...declared.map((row) => Math.min(1, row.ratio)));
  return { index: Math.round(index * 10) / 10, factors: declared };
}

/** Merge sorted UTC intervals into spells. Intervals that touch are one spell. */
export function mergeSpells(sorted) {
  const spells = [];
  for (const row of sorted) {
    const last = spells[spells.length - 1];
    if (last && row.s <= last.e) {
      if (row.e > last.e) last.e = row.e;
      last.ids.push(row.id);
      if (!last.lines.includes(row.line)) last.lines.push(row.line);
      if (!last.breaks) last.breaks = [];
      if (Array.isArray(row.breaks)) last.breaks.push(...row.breaks);
    } else {
      spells.push({ s: row.s, e: row.e, ids: [row.id], lines: [row.line], breaks: Array.isArray(row.breaks) ? [...row.breaks] : [] });
    }
  }
  return spells;
}

/**
 * Keep only well-formed work intervals `{ id, s, e, line, breaks }`, sorted.
 * The wall-clock fields (`effStart` / `effEnd` and the UTC offsets they
 * resolved to) are PRESERVED: the night minutes and the night days are read
 * from the stored wall times alone, so dropping them here would make every
 * night reading empty.
 */
export function cleanIntervals(intervals) {
  return (Array.isArray(intervals) ? intervals : [])
    .filter((row) => row && Number.isInteger(row.s) && Number.isInteger(row.e) && row.e > row.s)
    .map((row) => ({
      id: String(row.id), s: row.s, e: row.e, line: row.line ?? null,
      breaks: Array.isArray(row.breaks) ? row.breaks : [],
      effStart: row.effStart ?? null, effEnd: row.effEnd ?? null,
      effStartOffsetMin: Number.isInteger(row.effStartOffsetMin) ? row.effStartOffsetMin : null,
      effEndOffsetMin: Number.isInteger(row.effEndOffsetMin) ? row.effEndOffsetMin : null,
    }))
    .sort((a, b) => a.s - b.s || a.e - b.e || String(a.id).localeCompare(String(b.id)));
}
