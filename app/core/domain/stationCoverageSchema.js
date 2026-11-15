/**
 * app/core/domain/stationCoverageSchema.js — fail-closed storage contract and
 * window arithmetic for Skill-Constrained Simultaneous Station Coverage
 * (ADR-0201, Schema v157; extended by ADR-0204, Schema v159).
 *
 * FOUR append-only ledgers and nothing else:
 *
 *   1. `stationWindows`     — one declared, contiguous, dated window that says
 *                             which stations must run within it;
 *   2. `skillStations`      — one declared station: its holder, the ILUO task
 *                             that qualifies a person for it, its integer
 *                             headcount demand, and whether it must run
 *                             CONCURRENTLY with the others or merely somewhere
 *                             inside the window;
 *   3. `stationAvailability`— one dated, first-person or explicitly
 *                             manager-declared statement that a named person is
 *                             available for a named window, with an integer
 *                             capacity (how many stations they can hold at once);
 *   4. `stationEnables`     — one dated declaration that station A must come up
 *                             before station B in the SAME window ("B may not
 *                             be manned before A is manned"), with a written
 *                             reason, retirable by the same holder. It declares
 *                             an order; it never staffs either station.
 *
 * NOTHING DERIVED IS STORED — no feasibility verdict, no matching, no deficient
 * set, no station state, no cycle. Every one of those is recomputed on read
 * from the ledgers plus the matrix DAG, so a replayed workspace cannot carry a
 * stale proof of feasibility.
 *
 * A row that cannot be read exactly is RETAINED and marked invalid, never
 * repaired. Repairing would turn a malformed declaration into a claim a human
 * never made, which is the failure the bulletproof mandate names.
 */

import { addDays } from '../time.js';
import {
  STATION_COVERAGE_ASK_SUMMARY_PREFIX,
  STATION_COVERAGE_BOUNDS,
  STATION_COVERAGE_DEFAULTS,
  STATION_COVERAGE_LIMITS,
  STATION_COVERAGE_REQUIREMENT_KEYS,
  STATION_COVERAGE_AVAILABILITY_SOURCE_KEYS,
  STATION_COVERAGE_SETTING_KEYS,
} from './stationCoverageRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const text = (v, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const id = (v) => { const c = text(v, 120); return ID_RE.test(c) ? c : null; };
const stamp = (v) => {
  const raw = text(v, 40);
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const boundedInt = (value, [min, max], fallback) => {
  const n = Math.round(Number(value));
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/** A real calendar day as `YYYY-MM-DD`, or null. `2026-02-30` is null, never March. */
export function stationCoverageDay(value) {
  const candidate = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null;
}

/** Every inclusive day from `from` to `to`, or null if the range is unreadable or reversed. */
export function stationCoverageDays(from, to) {
  const a = stationCoverageDay(from);
  const b = stationCoverageDay(to);
  if (!a || !b || b < a) return null;
  const out = [];
  for (let day = a; day && day <= b; day = addDays(day, 1)) out.push(day);
  if (out.length > STATION_COVERAGE_BOUNDS.availabilityDays[1]) return null;
  return out;
}

/** Inclusive day count of a readable range, or null. */
export function stationCoverageDayCount(from, to) {
  const days = stationCoverageDays(from, to);
  return days ? days.length : null;
}

/* ----------------------------------------------------------------- settings */

/** The loader clamps into declared bounds; the governed setter refuses out-of-range values. */
export function normalizeStationCoverageSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = STATION_COVERAGE_SETTING_KEYS;
  const B = STATION_COVERAGE_BOUNDS;
  const D = STATION_COVERAGE_DEFAULTS;
  return {
    [K.askDays]: boundedInt(src[K.askDays], B.askDays, D.askDays),
    [K.disclosureFloorN]: boundedInt(src[K.disclosureFloorN], B.disclosureFloorN, D.disclosureFloorN),
    // Only an explicit `false` pauses the rule: an unreadable value must never
    // read as "somebody switched governance off".
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

/* -------------------------------------------------------- row-level validation */

/** The stored shape of every row carries all its fields; a missing one is invalid, not defaulted. */
export function stationCoverageWindowError(r) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid station window retained; repair the source register before any coverage is claimed.';
  if (!id(r.id) || !id(r.holderId) || !text(r.label, 160)) return 'Station window identity, holder or label is invalid.';
  const from = stationCoverageDay(r.fromDay);
  const to = stationCoverageDay(r.toDay);
  if (!from || !to) return 'Station window needs readable calendar start and end days.';
  if (to < from) return 'Station window ends before it starts; a reversed range is a contradiction, not a short window.';
  const n = stationCoverageDayCount(from, to);
  if (n === null || n < STATION_COVERAGE_BOUNDS.windowDays[0] || n > STATION_COVERAGE_BOUNDS.windowDays[1]) {
    return `Station window must span ${STATION_COVERAGE_BOUNDS.windowDays[0]}–${STATION_COVERAGE_BOUNDS.windowDays[1]} calendar day(s).`;
  }
  if (!stamp(r.declaredAt)) return 'Station window declaration timestamp is invalid.';
  if (r.declaredAt.slice(0, 10) > from) return 'Station window was declared after it began; a window is declared before the shift, not after it.';
  if (!(r.retiredOn === null || (stationCoverageDay(r.retiredOn) && r.retiredOn >= from))) return 'Station window retirement day is invalid or precedes the window.';
  return null;
}

export function stationCoverageStationError(r, windows = []) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid station retained; repair the source register before any coverage is claimed.';
  if (!id(r.id) || !id(r.windowId) || !id(r.holderId)) return 'Station identity, window or holder is invalid.';
  const window = windows.find((w) => w && w.id === r.windowId && !stationCoverageWindowError(w));
  if (!window) return 'Station names a window that is not a readable declaration.';
  if (r.holderId !== window.holderId) return 'A station must be declared in its own holder’s window; a station is never filed into another manager’s window.';
  if (!text(r.title, 160)) return 'Station needs a title of 1–160 characters.';
  if (!text(r.standard, 10)) return 'Station needs an observable standard of at least 10 characters.';
  if (!text(r.taskId, 120) || !id(r.taskId)) return 'Station must name the ILUO task that qualifies a person for it.';
  if (!STATION_COVERAGE_REQUIREMENT_KEYS.includes(r.requirement)) return 'Station requirement must be `concurrent` or `sequential`.';
  if (!Number.isInteger(r.demand) || r.demand < STATION_COVERAGE_BOUNDS.minDemand[0] || r.demand > STATION_COVERAGE_BOUNDS.minDemand[1]) {
    return `Station demand must be a whole number of people from ${STATION_COVERAGE_BOUNDS.minDemand[0]} to ${STATION_COVERAGE_BOUNDS.minDemand[1]}.`;
  }
  if (!stamp(r.declaredAt)) return 'Station declaration timestamp is invalid.';
  if (r.declaredAt < window.declaredAt) return 'Station was declared before its window; the declaration order is a contradiction.';
  if (!(r.retiredOn === null || (stationCoverageDay(r.retiredOn) && r.retiredOn >= window.fromDay))) return 'Station retirement day is invalid or precedes its window.';
  return null;
}

export function stationCoverageAvailabilityError(r, { windows = [], stations = [], people = null } = {}) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid availability statement retained; availability is never assumed in its place.';
  if (!id(r.id) || !id(r.personId) || !id(r.windowId) || !id(r.byId)) return 'Availability identity, person, window or declarer is invalid.';
  const window = windows.find((w) => w && w.id === r.windowId && !stationCoverageWindowError(w));
  if (!window) return 'Availability names a window that is not a readable declaration.';
  if (people && !people.has(r.personId)) return 'Availability names a person who is not on the active roster.';
  if (!STATION_COVERAGE_AVAILABILITY_SOURCE_KEYS.includes(r.basis)) return 'Availability basis must be `self` or `manager`.';
  if (r.basis === 'manager' && r.byId === r.personId) return 'A self-declaration must use basis `self`; the register prints who said it.';
  if (r.basis === 'self' && r.byId !== r.personId) return 'A statement on someone else’s behalf is a manager declaration and must say so.';
  const from = stationCoverageDay(r.fromDay);
  const to = stationCoverageDay(r.toDay);
  if (!from || !to) return 'Availability needs readable calendar start and end days.';
  if (to < from) return 'Availability ends before it starts; a reversed range is a contradiction, not a short window.';
  const n = stationCoverageDayCount(from, to);
  if (n === null || n < STATION_COVERAGE_BOUNDS.availabilityDays[0] || n > STATION_COVERAGE_BOUNDS.availabilityDays[1]) {
    return `An availability statement covers ${STATION_COVERAGE_BOUNDS.availabilityDays[0]}–${STATION_COVERAGE_BOUNDS.availabilityDays[1]} calendar day(s).`;
  }
  // Consent about a named window cannot extend past it — that would be standing
  // consent for a window nobody has declared yet.
  if (from < window.fromDay || to > window.toDay) return 'Availability must fall inside the window it is declared for; it never extends beyond the declared shift.';
  if (!Number.isInteger(r.capacity) || r.capacity < STATION_COVERAGE_BOUNDS.capacity[0] || r.capacity > STATION_COVERAGE_BOUNDS.capacity[1]) {
    return `Availability capacity must be a whole number of stations from ${STATION_COVERAGE_BOUNDS.capacity[0]} to ${STATION_COVERAGE_BOUNDS.capacity[1]}.`;
  }
  if (!stamp(r.declaredAt)) return 'Availability declaration timestamp is invalid.';
  if (r.declaredAt.slice(0, 10) > from) return 'Availability was declared after the days it claims; a past window is not covered by a later statement.';
  if (!(r.withdrawnAt === null || stamp(r.withdrawnAt))) return 'Availability withdrawal timestamp is invalid.';
  if (r.withdrawnAt && r.withdrawnAt < r.declaredAt) return 'Availability was withdrawn before it was declared.';
  if (!(r.withdrawnBy === null || id(r.withdrawnBy))) return 'Availability withdrawal declarer is invalid.';
  if (r.withdrawnAt && !r.withdrawnBy) return 'A withdrawal must name who withdrew the statement.';
  if (!r.withdrawnAt && r.withdrawnBy) return 'A withdrawal declarer exists with no withdrawal; the row is a contradiction.';
  if (!(r.note === '' || text(r.note, 400))) return 'Availability note is unreadable.';
  // The station ids are advisory: availability is a statement about a window, and
  // narrows later to the stations that actually need the person. A named station
  // that does not exist is a contradiction and is refused rather than ignored.
  const ids = Array.isArray(r.stationIds) ? r.stationIds : [];
  if (ids.length > STATION_COVERAGE_BOUNDS.stationsPerWindow[1]) return 'Availability names more stations than one window can hold.';
  if (ids.some((s) => !id(s))) return 'Availability names an unreadable station id.';
  if (ids.some((s) => !stations.some((st) => st && st.id === s && !stationCoverageStationError(st, windows)))) {
    return 'Availability names a station that is not a readable declaration in this window.';
  }
  return null;
}

/**
 * An enabling declaration: station `fromStationId` must come up before station
 * `toStationId` in the same window. Same authority and same file discipline as
 * the stations themselves — the window's own holder declares it, it is dated,
 * and it is retirable only by that holder with a written reason. A declaration
 * that cannot be read exactly is retained and refused, never repaired.
 */
export function stationEnableError(r, { windows = [], stations = [] } = {}) {
  if (!r || typeof r !== 'object' || r.invalid) return 'Invalid enabling declaration retained; repair the source register before any precedence is claimed.';
  if (!id(r.id) || !id(r.windowId) || !id(r.holderId) || !id(r.fromStationId) || !id(r.toStationId)) {
    return 'Enabling declaration identity, window, holder or station endpoint is invalid.';
  }
  const window = windows.find((w) => w && w.id === r.windowId && !stationCoverageWindowError(w));
  if (!window) return 'Enabling declaration names a window that is not a readable declaration.';
  if (r.holderId !== window.holderId) return 'An enabling declaration is filed in its own holder’s window; it is never filed into another manager’s window.';
  if (r.fromStationId === r.toStationId) return 'A station cannot enable itself; the declaration is a contradiction, not an order.';
  const liveStations = stations.filter((st) => st && st.windowId === r.windowId && !stationCoverageStationError(st, windows));
  const from = liveStations.find((st) => st.id === r.fromStationId);
  const to = liveStations.find((st) => st.id === r.toStationId);
  if (!from) return 'Enabling declaration names an enabler that is not a readable station in this window.';
  if (!to) return 'Enabling declaration names a dependent that is not a readable station in this window.';
  const reason = text(r.reason, STATION_COVERAGE_BOUNDS.enablingReason[1] + 1);
  if (reason.length < STATION_COVERAGE_BOUNDS.enablingReason[0]) {
    return `An enabling declaration needs a written reason of at least ${STATION_COVERAGE_BOUNDS.enablingReason[0]} characters.`;
  }
  if (!stamp(r.declaredAt)) return 'Enabling declaration timestamp is invalid.';
  if (r.declaredAt < window.declaredAt) return 'Enabling declaration predates its window; the declaration order is a contradiction.';
  if (from.declaredAt && r.declaredAt < from.declaredAt) return 'Enabling declaration predates its enabler station; the declaration order is a contradiction.';
  if (to.declaredAt && r.declaredAt < to.declaredAt) return 'Enabling declaration predates its dependent station; the declaration order is a contradiction.';
  if (!(r.retiredOn === null || stationCoverageDay(r.retiredOn))) {
    return 'Enabling declaration retirement day is unreadable; a retirement may be dated any real day, including before the window begins.';
  }
  if (!(r.retiredBy === null || id(r.retiredBy))) return 'Enabling declaration retirement declarer is invalid.';
  if (r.retiredOn && !r.retiredBy) return 'A retirement must name who retired the declaration.';
  if (!r.retiredOn && r.retiredBy) return 'A retirement declarer exists with no retirement; the row is a contradiction.';
  // The retirement carries its own written reason beside the original
  // declaration — the original is never edited.
  if (r.retiredOn) {
    const retireReason = text(r.retireReason, 401);
    if (retireReason.length < 5) return 'A retirement must carry a written reason of at least 5 characters; the original declaration is never edited.';
  } else if (r.retireReason !== null && r.retireReason !== undefined && r.retireReason !== '') {
    return 'A retirement reason exists with no retirement; the row is a contradiction.';
  }
  return null;
}

/* -------------------------------------------------------------- normalizers */

function normalizeLedger(raw, warnings, name, limit, validate) {
  if (raw === undefined) return [];
  const rows = Array.isArray(raw) ? raw : [raw];
  const seen = new Set();
  const out = rows.slice(0, limit).map((r, i) => {
    if (r?.invalid === true) {
      warnings.push(`${name}[${i}]: invalid evidence retained. Coverage withheld.`);
      return { ...r };
    }
    const error = !Array.isArray(raw) ? 'Register is not an array.' : validate(r) || (seen.has(r?.id) ? 'Duplicate ledger identity.' : null);
    seen.add(r?.id);
    if (!error) return { ...r };
    warnings.push(`${name}[${i}]: ${error} Coverage withheld; rejected evidence retained.`);
    return { ...(r && typeof r === 'object' ? r : { rejectedValue: r }), invalid: true, error };
  });
  if (rows.length > limit) {
    const tail = rows.slice(limit);
    const excessRows = tail.length === 1 && tail[0]?.overflow === true && Array.isArray(tail[0].excessRows) ? tail[0].excessRows : tail;
    warnings.push(`${name}: ${excessRows.length} rows exceed the supported bound; coverage withheld.`);
    out.push({ invalid: true, overflow: true, error: 'Ledger bound exceeded; export and repair before using coverage.', excessRows });
  }
  return out;
}

export function normalizeStationWindows(raw, warnings = []) {
  return normalizeLedger(raw, warnings, 'stationWindows', STATION_COVERAGE_LIMITS.windows, stationCoverageWindowError);
}

export function normalizeSkillStationRows(raw, windows, warnings = []) {
  return normalizeLedger(raw, warnings, 'skillStations', STATION_COVERAGE_LIMITS.stations, (r) => stationCoverageStationError(r, windows));
}

export function normalizeStationAvailability(raw, { windows = [], stations = [], people = null } = {}, warnings = []) {
  const rows = normalizeLedger(raw, warnings, 'stationAvailability', STATION_COVERAGE_LIMITS.availability,
    (r) => stationCoverageAvailabilityError(r, { windows, stations, people }));
  // One live statement per (person, window) is the whole contract: two live
  // statements about the same person's same shift would leave the reader to
  // choose, and choosing is the substitution this register refuses. A
  // withdrawal is a dated act and does NOT license a second live row; the
  // later statement supersedes through `supersedesId` instead.
  const live = new Map();
  for (const row of rows) {
    if (row.invalid || row.withdrawnAt) continue;
    const key = JSON.stringify([row.personId, row.windowId]);
    if (live.has(key)) {
      row.invalid = true;
      row.error = 'Two live availability statements for one person and window; the register refused rather than picking one.';
      warnings.push('stationAvailability: two live statements for one person and window. Coverage withheld.');
      continue;
    }
    live.set(key, row);
  }
  return rows;
}

export function normalizeStationEnables(raw, { windows = [], stations = [] } = {}, warnings = []) {
  const rows = normalizeLedger(raw, warnings, 'stationEnables', STATION_COVERAGE_LIMITS.enables,
    (r) => stationEnableError(r, { windows, stations }));
  // One live declaration per ordered pair. A second live row for the same
  // (window, enabler, dependent) would leave the acyclic check to choose
  // between them — choosing is the substitution this register refuses, so the
  // later declaration is retained and refused rather than silently preferred.
  const live = new Map();
  const perWindow = new Map();
  for (const row of rows) {
    if (row.invalid || row.retiredOn) continue;
    const key = JSON.stringify([row.windowId, row.fromStationId, row.toStationId]);
    if (live.has(key)) {
      row.invalid = true;
      row.error = 'Two live enabling declarations for one ordered pair in one window; the register refused rather than picking one.';
      warnings.push('stationEnables: two live declarations for one ordered pair. Coverage withheld.');
      continue;
    }
    live.set(key, row);
    perWindow.set(row.windowId, (perWindow.get(row.windowId) || 0) + 1);
  }
  // A window can hold only so many edges before the precedence graph stops being
  // something a human can actually audit. The excess is retained and refused,
  // never dropped.
  for (const [windowId, count] of perWindow) {
    if (count > STATION_COVERAGE_LIMITS.enablesPerWindow) {
      warnings.push(`stationEnables: window ${windowId} carries ${count} live enabling declarations, over the ${STATION_COVERAGE_LIMITS.enablesPerWindow} bound; coverage withheld until the register is repaired.`);
      let seen = 0;
      for (const row of rows) {
        if (row.invalid || row.retiredOn || row.windowId !== windowId) continue;
        seen += 1;
        if (seen > STATION_COVERAGE_LIMITS.enablesPerWindow) {
          row.invalid = true;
          row.error = `More than ${STATION_COVERAGE_LIMITS.enablesPerWindow} live enabling declarations in one window; the excess is retained and refused.`;
        }
      }
    }
  }
  return rows;
}

/* -------------------------------------------------- condition signatures */

/** A deterministic, opaque condition signature. No names, ids or free text. */
export function stationCoverageSignature(kind, parts) {
  return `${STATION_COVERAGE_ASK_SUMMARY_PREFIX}${kind}:${parts.map((p) => String(p ?? '').replace(/\|/g, '/')).join('|')}`;
}

export function stationCoverageAskSummary(signature) {
  return `${signature} — skill-constrained simultaneous station coverage.`;
}

export function parseStationCoverageAskSummary(summary) {
  const raw = text(summary, 400);
  if (!raw.startsWith(STATION_COVERAGE_ASK_SUMMARY_PREFIX)) return null;
  const [signature] = raw.split(' — ');
  const parts = signature.split(':');
  if (parts.length < 3) return null;
  return { signature, kind: parts[1], parts: parts.slice(2) };
}
