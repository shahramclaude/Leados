/**
 * app/core/domain/distributedEquitySchema.js — the fail-closed loaders of the
 * Distributed-Work Equity Register (ADR-0238, Schema v193).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a window, completes a source, re-times a wall clock,
 * re-zones a sitting, de-duplicates an attendee list or rescues a missing
 * duration. A row that cannot be read exactly is DROPPED with a counted
 * warning, and the screen prints the count.
 *
 * TWO LOADER RULES THAT CARRY THE MANDATE:
 *   - A working window with no written source is DROPPED. A window is a claim
 *     about a human being's daily life; an unsourced one is exactly the
 *     plausible default the Bulletproof Reliability Mandate forbids.
 *   - A sitting whose attendee list repeats a person is DROPPED. A room that
 *     contains somebody twice is a hand-edited artefact, and no arithmetic can
 *     say which count was meant.
 *
 * WALL CLOCKS ARE PARSED, NEVER ROUNDED. `09:60` is not a quarter past ten; it
 * is nothing. A zone is admitted only if this device's own rules know it — an
 * unknown zone is refused at this boundary, never silently read as UTC.
 */

import { dayKey } from '../time.js';
import { isKnownZone } from './workRestTime.js';
import {
  DWE_DEFAULTS,
  DWE_BOUNDS,
  DWE_LIMITS as L,
  DWE_SETTING_KEYS,
} from './distributedEquityRegistry.js';

/** A real calendar day inside the register's range, or null. */
export function dweDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function dweText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** An id: a trimmed bounded string, or null. */
export function dweId(value, max = L.idMax) {
  if (typeof value !== 'string') return null;
  const id = value.trim().slice(0, max);
  return id || null;
}

const WALL_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * A wall clock `HH:MM` or `H:MM`, or null. `24:00`, `09:60` and `9.30` are
 * null — a wall time the record cannot read exactly is never repaired.
 */
export function dweWallClock(value) {
  if (typeof value !== 'string') return null;
  const match = WALL_RE.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Whole minutes between two wall clocks; `end <= start` is an overnight span. */
export function wallClockSpanMinutes(startText, endText) {
  const start = dweWallClock(startText);
  const end = dweWallClock(endText);
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  let endMin = eh * 60 + em;
  if (endMin <= startMin) endMin += 1440;
  return endMin - startMin;
}

/** A sitting duration: a whole integer 1..minutesMax. A fraction is not a duration. */
export function dweSittingMinutes(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > L.minutesMax) return null;
  return value;
}

/** An IANA zone this device knows, or null. An unknown zone is never read as UTC. */
export function dweZone(value) {
  if (typeof value !== 'string') return null;
  const zone = value.trim().slice(0, 64);
  if (!zone || !isKnownZone(zone)) return null;
  return zone;
}

/** Which occurrence of an ambiguous wall time is meant. */
export function dweFold(value) {
  return value === 'first' || value === 'second' ? value : null;
}

const DWE_WINDOW_STATUSES = ['active', 'superseded', 'withdrawn'];
const DWE_SITTING_STATUSES = ['active', 'retracted'];

/**
 * Working windows. A row that cannot be read exactly is DROPPED with a counted
 * warning: no re-dating, no re-zoning, no invented source, no repaired status.
 * Multiple ACTIVE rows for one person are KEPT — choosing between them is the
 * reader's refusal to make, printed on the screen, never a silent latest-wins.
 */
export function normalizeDweWindows(rows, warnings = []) {
  const warn = (text) => warnings.push(`[distributed-equity] ${text}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') { warn('a window row was not an object and was dropped'); continue; }
    const id = dweId(row.id);
    if (!id) { warn('a window row had no readable id and was dropped'); continue; }
    if (seen.has(id)) { warn(`window ${id} appeared twice; the second copy was dropped`); continue; }
    const personId = dweId(row.personId);
    if (!personId) { warn(`window ${id} named no person and was dropped`); continue; }
    const zone = dweZone(row.zone);
    if (!zone) { warn(`window ${id} named an unreadable time zone and was dropped`); continue; }
    const start = dweWallClock(row.start);
    const end = dweWallClock(row.end);
    if (!start || !end) { warn(`window ${id} carried an unreadable wall time and was dropped`); continue; }
    const span = wallClockSpanMinutes(start, end);
    if (!span || span < 1 || span > L.windowMinutesMax) {
      warn(`window ${id} does not read as a daily working span and was dropped`);
      continue;
    }
    const source = dweText(row.source);
    if (!source) { warn(`window ${id} carried no written source for a claim about a person's working hours and was dropped`); continue; }
    const declaredOn = dweDay(row.declaredOn);
    if (!declaredOn) { warn(`window ${id} carried an unreadable declaration day and was dropped`); continue; }
    const status = DWE_WINDOW_STATUSES.includes(row.status) ? row.status : null;
    if (!status) { warn(`window ${id} carried an unreadable status and was dropped`); continue; }
    seen.add(id);
    out.push({
      id,
      personId,
      zone,
      start,
      end,
      declaredOn,
      declaredById: dweId(row.declaredById) || '',
      source,
      note: dweText(row.note),
      status,
      withdrawnOn: dweDay(row.withdrawnOn) || null,
      withdrawalReason: dweText(row.withdrawalReason),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  return out;
}

/**
 * Unsociable-hour sittings. A sitting is one dated event: wall-clock start,
 * whole minutes, its own zone, the unique people who attended, and the chair.
 * Retracted rows are KEPT (they are history, not silence) and excluded on read.
 */
export function normalizeDweSittings(rows, warnings = []) {
  const warn = (text) => warnings.push(`[distributed-equity] ${text}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') { warn('a sitting row was not an object and was dropped'); continue; }
    const id = dweId(row.id);
    if (!id) { warn('a sitting row had no readable id and was dropped'); continue; }
    if (seen.has(id)) { warn(`sitting ${id} appeared twice; the second copy was dropped`); continue; }
    const day = dweDay(row.day);
    if (!day) { warn(`sitting ${id} carried an unreadable day and was dropped`); continue; }
    const start = dweWallClock(row.start);
    if (!start) { warn(`sitting ${id} carried an unreadable start and was dropped`); continue; }
    const minutes = dweSittingMinutes(row.minutes);
    if (!minutes) { warn(`sitting ${id} carried no readable whole-minute duration and was dropped`); continue; }
    const zone = dweZone(row.zone);
    if (!zone) { warn(`sitting ${id} named an unreadable time zone and was dropped`); continue; }
    const rawAttendees = Array.isArray(row.attendeeIds) ? row.attendeeIds : [];
    const attendeeIds = [];
    let duplicated = false;
    for (const raw of rawAttendees) {
      const attendeeId = dweId(raw);
      if (!attendeeId) continue;
      if (attendeeIds.includes(attendeeId)) { duplicated = true; break; }
      attendeeIds.push(attendeeId);
    }
    if (duplicated) { warn(`sitting ${id} listed a person twice; the room it describes is ambiguous and the row was dropped`); continue; }
    if (!attendeeIds.length) { warn(`sitting ${id} named no attendee and was dropped`); continue; }
    if (attendeeIds.length > L.attendeesMax) { warn(`sitting ${id} named more attendees than the register bounds and was dropped`); continue; }
    const status = DWE_SITTING_STATUSES.includes(row.status) ? row.status : null;
    if (!status) { warn(`sitting ${id} carried an unreadable status and was dropped`); continue; }
    seen.add(id);
    out.push({
      id,
      day,
      start,
      minutes,
      zone,
      attendeeIds,
      chairId: dweId(row.chairId) || '',
      fold: dweFold(row.fold),
      declaredById: dweId(row.declaredById) || '',
      note: dweText(row.note),
      status,
      retractedOn: dweDay(row.retractedOn) || null,
      retractionReason: dweText(row.retractionReason),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  return out;
}

/** Identity-free rule markers: unique keys, capped, never repaired. */
export function normalizeDweMarkers(rows, warnings = []) {
  const warn = (text) => warnings.push(`[distributed-equity] ${text}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object') { warn('a marker row was not an object and was dropped'); continue; }
    const key = dweId(row.key, 200);
    if (!key || seen.has(key)) continue;
    if (typeof row.detail !== 'string' || !row.detail.trim()) continue;
    seen.add(key);
    out.push({
      key,
      at: typeof row.at === 'string' ? row.at : '',
      ruleId: dweId(row.ruleId, 60) || '',
      kind: dweId(row.kind, 60) || DWE_MARKER_FALLBACK,
      detail: row.detail.trim().slice(0, 400),
    });
  }
  if (out.length > L.markers) out.splice(0, out.length - L.markers);
  return out;
}

const DWE_MARKER_FALLBACK = 'distributed-equity';

const clampBound = (value, bound, fallback) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < bound.min) return bound.min;
  if (n > bound.max) return bound.max;
  return n;
};

/**
 * The register's conventions, clamped on load and refused (never clamped) by
 * the setter. Keyed by the FULL setting keys they are persisted under, exactly
 * as the risk-appetite register keys its own switch. Defaults come from the
 * registry, never from the record.
 */
export function normalizeDweSettings(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    [DWE_SETTING_KEYS.autoPropagate]: s[DWE_SETTING_KEYS.autoPropagate] !== false,
    [DWE_SETTING_KEYS.outsideMinutesCeiling]: clampBound(s[DWE_SETTING_KEYS.outsideMinutesCeiling], DWE_BOUNDS.outsideMinutesCeiling, DWE_DEFAULTS.outsideMinutesCeiling),
    [DWE_SETTING_KEYS.windowDays]: clampBound(s[DWE_SETTING_KEYS.windowDays], DWE_BOUNDS.windowDays, DWE_DEFAULTS.windowDays),
    [DWE_SETTING_KEYS.equityMinPeople]: clampBound(s[DWE_SETTING_KEYS.equityMinPeople], DWE_BOUNDS.equityMinPeople, DWE_DEFAULTS.equityMinPeople),
    [DWE_SETTING_KEYS.equityMinSittings]: clampBound(s[DWE_SETTING_KEYS.equityMinSittings], DWE_BOUNDS.equityMinSittings, DWE_DEFAULTS.equityMinSittings),
    [DWE_SETTING_KEYS.equityMinOutsideMinutes]: clampBound(s[DWE_SETTING_KEYS.equityMinOutsideMinutes], DWE_BOUNDS.equityMinOutsideMinutes, DWE_DEFAULTS.equityMinOutsideMinutes),
  };
}
