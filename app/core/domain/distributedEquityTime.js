/**
 * app/core/domain/distributedEquityTime.js — placing declared sittings inside
 * declared working windows, exactly, for the Distributed-Work Equity Register
 * (ADR-0238). The zone machinery itself is `workRestTime.js` (ADR-0209): every
 * function here is integer arithmetic over the instants it resolves, and none
 * consults a floating-point hour, a rounded offset or a device default.
 *
 * THE SHAPE OF A READING. A sitting is one absolute instant (its wall-clock
 * start resolved in its own zone) plus a whole-minute duration. A working
 * window is a daily wall-clock span in the attendee's own zone, anchored on the
 * attendee's LOCAL calendar day at the sitting's instant. The burden is the
 * part of the sitting that falls outside that span, in whole minutes:
 *
 *   outside = minutes − overlap([start, start+minutes], [window, window+span])
 *
 * TWO HONEST FAILURES, DELIBERATELY NOT SMOOTHED OVER:
 *   - a window boundary that falls in a DST gap does not exist; that reading is
 *     refused, never moved to a neighbouring minute;
 *   - a boundary that occurs twice (clocks went back) resolves to the FIRST
 *     occurrence — a stated convention, and the row records that it was used.
 */

import {
  formatMinutes,
  minutesToDay,
  parseWallTime,
  resolveWallTime,
  zoneOffsetAt,
} from './workRestTime.js';

/** Minutes-of-day from a validated `HH:MM` string. */
export function wallClockMinutes(text) {
  const wall = typeof text === 'string' && /^\d{2}:\d{2}$/.test(text) ? text : null;
  if (!wall) return null;
  const [h, m] = wall.split(':').map(Number);
  return h * 60 + m;
}

/**
 * One sitting's start, resolved at read time in the sitting's own zone.
 *   ok        → { ok:true, utcMin, ambiguous }
 *   refused   → { ok:false, code, reason } with a code the registry prints.
 */
export function resolveSittingStart(zone, day, startText, fold = null) {
  const resolved = resolveWallTime(zone, `${day}T${startText}`);
  if (resolved.state === 'bad-time') return { ok: false, code: 'badTime', reason: 'the start is not a real wall-clock time' };
  if (resolved.state === 'bad-zone') return { ok: false, code: 'badZone', reason: `the zone ${zone} is not one this device knows` };
  if (resolved.state === 'nonexistent') {
    const [a, b] = resolved.around || [];
    return { ok: false, code: 'nonexistent', reason: `the start does not exist in ${zone}: the clocks moved from ${a} to ${b} minutes offset across it` };
  }
  if (resolved.state === 'ambiguous') {
    if (fold !== 'first' && fold !== 'second') {
      return { ok: false, code: 'unresolvable', reason: `the start occurs twice in ${zone} and the record does not say which occurrence is meant` };
    }
    const offsetMin = fold === 'first' ? resolved.offsets[0] : resolved.offsets[1];
    return { ok: true, utcMin: parseWallTime(`${day}T${startText}`).wallMin - offsetMin, ambiguous: true };
  }
  return { ok: true, utcMin: parseWallTime(`${day}T${startText}`).wallMin - resolved.offsets[0], ambiguous: false };
}

/**
 * One boundary wall time of a daily working window, resolved in the person's
 * zone on their local day. Ambiguous boundaries resolve to the FIRST
 * occurrence and say so; nonexistent boundaries refuse the reading.
 *   ok        → { ok:true, utcMin, folded }
 *   refused   → { ok:false, code, reason }
 */
function resolveWindowBoundary(zone, localDay, wallText, end) {
  const resolved = resolveWallTime(zone, `${localDay}T${wallText}`);
  if (resolved.state === 'bad-time') return { ok: false, code: 'badBounds', reason: 'the window carries an unreadable wall time' };
  if (resolved.state === 'bad-zone') return { ok: false, code: 'badZone', reason: `the window's zone ${zone} is not one this device knows` };
  if (resolved.state === 'nonexistent') {
    return { ok: false, code: 'nonexistent', reason: `the window's ${end ? 'end' : 'start'} (${wallText}) does not exist in ${zone} on ${localDay}: the clocks moved forward across it, so this reading is refused rather than moved` };
  }
  if (resolved.state === 'ambiguous') {
    const offsetMin = resolved.offsets[0];
    return { ok: true, utcMin: parseWallTime(`${localDay}T${wallText}`).wallMin - offsetMin, folded: true };
  }
  return { ok: true, utcMin: parseWallTime(`${localDay}T${wallText}`).wallMin - resolved.offsets[0], folded: false };
}

/**
 * The working-window span, as two instants, for one person-local day. An
 * overnight window (`end <= start`) ends on the following day; the end
 * boundary is resolved on ITS OWN day, so a span that crosses a zone
 * transition is placed with the offset each boundary really had.
 *   ok        → { ok:true, startUtcMin, endUtcMin, foldedN }
 *   refused   → { ok:false, code, reason }
 */
export function resolveWindowSpan(zone, localDay, startText, endText) {
  const startAt = resolveWindowBoundary(zone, localDay, startText, false);
  if (!startAt.ok) return startAt;
  const endAt = resolveWindowBoundary(zone, localDay, endText, true);
  if (!endAt.ok) return endAt;
  let endUtcMin = endAt.utcMin;
  const startMinutes = wallClockMinutes(startText);
  const endMinutes = wallClockMinutes(endText);
  if (startMinutes === null || endMinutes === null) return { ok: false, code: 'badBounds', reason: 'the window carries an unreadable wall time' };
  if (endMinutes <= startMinutes) endUtcMin += 1440;
  if (endUtcMin <= startAt.utcMin) return { ok: false, code: 'badBounds', reason: 'the window does not read as a forward span' };
  return { ok: true, startUtcMin: startAt.utcMin, endUtcMin, foldedN: (startAt.folded ? 1 : 0) + (endAt.folded ? 1 : 0) };
}

/** The attendee's local calendar day for an absolute instant, in their zone. */
export function personLocalDay(zone, utcMin) {
  const offset = zoneOffsetAt(zone, utcMin);
  if (!Number.isInteger(offset)) return null;
  return minutesToDay(utcMin + offset);
}

/** Whole minutes two half-open [start, end) spans overlap. Exact integers. */
export function overlapMinutes(aStart, aEnd, bStart, bEnd) {
  for (const v of [aStart, aEnd, bStart, bEnd]) {
    if (!Number.isFinite(v)) return null;
  }
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * One sitting placed against one declared window. Returns the burden in whole
 * minutes, or the refusal the registry prints.
 *   ok        → { ok:true, outside, inside, foldedN, localDay }
 *   refused   → { ok:false, code, reason }
 */
export function sittingOutsideMinutes(window, sitting, utcStart) {
  const localDay = personLocalDay(window.zone, utcStart);
  if (!localDay) return { ok: false, code: 'badZone', reason: `the window's zone ${window.zone} could not be read on this device` };
  const span = resolveWindowSpan(window.zone, localDay, window.start, window.end);
  if (!span.ok) return span;
  const utcEnd = utcStart + sitting.minutes;
  const inside = overlapMinutes(utcStart, utcEnd, span.startUtcMin, span.endUtcMin);
  if (inside === null) return { ok: false, code: 'badBounds', reason: 'the sitting or the window could not be placed' };
  return {
    ok: true,
    outside: sitting.minutes - inside,
    inside,
    foldedN: span.foldedN,
    localDay,
  };
}

/** Whole minutes printed in the house style: `7 h 10 min`. */
export function formatDweMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  return formatMinutes(minutes);
}
