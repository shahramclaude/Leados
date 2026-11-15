/**
 * app/core/domain/workRestTime.js — wall-clock times, IANA zones and instants
 * for the Work/Rest Recovery Ledger (ADR-0209).
 *
 * TWO HALVES, deliberately separate.
 *
 * 1. PURE ARITHMETIC (used on every read). A stored end of a shift is a wall
 *    time `YYYY-MM-DDTHH:mm` plus the whole-minute UTC offset it resolved to.
 *    The instant is `wall − offset`, in whole minutes since the Unix epoch.
 *    Nothing here consults a time-zone database, so a figure printed from a
 *    stored shift is the same integer in every engine.
 *
 * 2. ZONE RESOLUTION (used at the door, and by the drift audit). A wall time in
 *    an IANA zone maps to zero, one or two instants: zero when the clocks went
 *    forward over it, two when they went back over it. The resolver returns
 *    every offset the zone's rules give for that wall time and never chooses
 *    between two — the caller must say which occurrence is meant.
 */

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n, width = 2) => String(n).padStart(width, '0');

/** A wall time read exactly, or null. `2026-02-30T10:00` is null, not March. */
export function parseWallTime(value) {
  if (typeof value !== 'string') return null;
  const match = LOCAL_RE.exec(value.trim());
  if (!match) return null;
  const [y, mo, d, h, mi] = match.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return { y, mo, d, h, mi, wallMin: ms / 60000, text: `${pad(y, 4)}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}` };
}

/** Whole minutes since the epoch, read as a wall clock → `YYYY-MM-DDTHH:mm`. */
export function formatWallMinutes(wallMin) {
  if (!Number.isFinite(wallMin)) return '';
  const date = new Date(wallMin * 60000);
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/** `UTC+01:00`, `UTC-03:30`, `UTC`. */
export function offsetLabel(offsetMin) {
  if (!Number.isInteger(offsetMin)) return '';
  if (offsetMin === 0) return 'UTC';
  const a = Math.abs(offsetMin);
  return `UTC${offsetMin > 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** The instant of a stored end: wall minutes minus its offset. Pure. */
export function instantMinutes(wallText, offsetMin) {
  const wall = parseWallTime(wallText);
  if (!wall || !Number.isInteger(offsetMin)) return null;
  return wall.wallMin - offsetMin;
}

/** An instant printed on the wall clock of a given offset: `2026-10-25 02:30 (UTC+01:00)`. */
export function formatInstant(utcMin, offsetMin) {
  if (!Number.isFinite(utcMin) || !Number.isInteger(offsetMin)) return '';
  return `${formatWallMinutes(utcMin + offsetMin).replace('T', ' ')} (${offsetLabel(offsetMin)})`;
}

/** `7 h 10 min`, `11 h`, `45 min`. Whole minutes in, exact words out. */
export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const sign = minutes < 0 ? '−' : '';
  const a = Math.abs(Math.trunc(minutes));
  const h = Math.floor(a / 60);
  const m = a % 60;
  if (!h) return `${sign}${m} min`;
  return m ? `${sign}${h} h ${m} min` : `${sign}${h} h`;
}

/** A real UTC calendar day `YYYY-MM-DD` → minutes since the epoch at its 00:00Z, or null. */
export function dayStartMinutes(day) {
  if (typeof day !== 'string') return null;
  const match = DAY_RE.exec(day.trim());
  if (!match) return null;
  const wall = parseWallTime(`${day.trim()}T00:00`);
  return wall ? wall.wallMin : null;
}

export function minutesToDay(utcMin) {
  return formatWallMinutes(utcMin).slice(0, 10);
}

/* ------------------------------------------------------- zone resolution */

const FORMATTERS = new Map();

function formatterFor(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 64) return null;
  if (FORMATTERS.has(zone)) return FORMATTERS.get(zone);
  let formatter = null;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    formatter = null;
  }
  FORMATTERS.set(zone, formatter);
  return formatter;
}

/** Whether this engine knows the zone. An unknown zone is refused, never read as UTC. */
export function isKnownZone(zone) {
  return Boolean(formatterFor(zone));
}

/** The zone the device itself is set to — a prefill for a dialog, never a stored default. */
export function deviceZone() {
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every zone this engine can name, for a dialog's list. Falls back to a short list. */
export function knownZones() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      const zones = Intl.supportedValuesOf('timeZone');
      if (Array.isArray(zones) && zones.length) return zones.includes('UTC') ? zones : ['UTC', ...zones];
    }
  } catch {
    /* fall through */
  }
  return ['UTC', deviceZone()].filter((zone, index, all) => all.indexOf(zone) === index);
}

/** The zone's offset, in whole minutes east of UTC, at an instant. Null for an unknown zone. */
export function zoneOffsetAt(zone, utcMin) {
  const formatter = formatterFor(zone);
  if (!formatter || !Number.isFinite(utcMin)) return null;
  const parts = {};
  for (const part of formatter.formatToParts(new Date(utcMin * 60000))) parts[part.type] = part.value;
  const wallMs = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return Math.round((wallMs / 60000) - utcMin);
}

/**
 * Every offset the zone's rules give for one wall time.
 *
 *   `unique`       one instant; `offsets` has one entry.
 *   `ambiguous`    the wall time occurs twice (clocks went back); `offsets` has
 *                  two entries, FIRST occurrence first (the larger offset).
 *   `nonexistent`  the wall time was skipped (clocks went forward); `offsets`
 *                  is empty and `around` names the offsets either side.
 *
 * The probes sit a day either side of the wall time, so they bracket any single
 * transition; an offset is accepted only if the zone really shows that wall
 * time at the instant it implies.
 */
export function resolveWallTime(zone, wallText) {
  const wall = parseWallTime(wallText);
  if (!wall) return { state: 'bad-time', offsets: [] };
  if (!isKnownZone(zone)) return { state: 'bad-zone', offsets: [] };
  const before = zoneOffsetAt(zone, wall.wallMin - 1440);
  const after = zoneOffsetAt(zone, wall.wallMin + 1440);
  const candidates = [...new Set([before, after])].filter((value) => Number.isInteger(value));
  const valid = candidates.filter((offset) => zoneOffsetAt(zone, wall.wallMin - offset) === offset).sort((a, b) => b - a);
  if (valid.length === 1) return { state: 'unique', offsets: valid };
  if (valid.length >= 2) return { state: 'ambiguous', offsets: valid.slice(0, 2) };
  return { state: 'nonexistent', offsets: [], around: [before, after] };
}

/**
 * One end of a shift, resolved at the door. `fold` is needed only when the wall
 * time occurs twice; supplying it otherwise is harmless and ignored.
 */
export function resolveShiftEnd(zone, wallText, fold = null) {
  const resolved = resolveWallTime(zone, wallText);
  if (resolved.state === 'bad-time') return { ok: false, code: 'bad-time', error: 'is not a real wall-clock time (write YYYY-MM-DDTHH:mm)' };
  if (resolved.state === 'bad-zone') return { ok: false, code: 'bad-zone', error: 'names a time zone this device does not know (write an IANA name such as Europe/Copenhagen)' };
  if (resolved.state === 'nonexistent') {
    const [a, b] = resolved.around || [];
    return { ok: false, code: 'nonexistent', error: `does not exist in ${zone}: the clocks moved from ${offsetLabel(a)} to ${offsetLabel(b)} across it. Write the time the clock actually showed` };
  }
  if (resolved.state === 'ambiguous') {
    if (fold !== 'first' && fold !== 'second') {
      return { ok: false, code: 'ambiguous', offsets: resolved.offsets, error: `occurs twice in ${zone}: once at ${offsetLabel(resolved.offsets[0])} and again, after the clocks went back, at ${offsetLabel(resolved.offsets[1])}. Say which — the first or the second` };
    }
    const offsetMin = fold === 'first' ? resolved.offsets[0] : resolved.offsets[1];
    return { ok: true, offsetMin, utcMin: parseWallTime(wallText).wallMin - offsetMin, ambiguous: true };
  }
  return { ok: true, offsetMin: resolved.offsets[0], utcMin: parseWallTime(wallText).wallMin - resolved.offsets[0], ambiguous: false };
}

/** Whether a stored offset is still one the zone's rules give for that wall time on this device. */
export function storedOffsetHolds(zone, wallText, offsetMin) {
  const resolved = resolveWallTime(zone, wallText);
  if (resolved.state === 'bad-zone' || resolved.state === 'bad-time') return null;
  return resolved.offsets.includes(offsetMin);
}
