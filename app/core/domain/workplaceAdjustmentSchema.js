/**
 * app/core/domain/workplaceAdjustmentSchema.js — the fail-closed storage
 * contract of the Workplace Adjustment & Functional-Restriction Register
 * (ADR-0241, Schema v195).
 *
 * FIVE COLLECTIONS, ALL EMPTY AT UPGRADE: `wpaRestrictions`, `wpaAdjustments`,
 * `wpaAcknowledgements`, `wpaReviews` and the rule's `wpaMarkers`. Nothing
 * derived is stored — no state, no conflict, no duration, no days-to-operational,
 * no acknowledgement verdict. Every one of those is recomputed on read, so a
 * replayed workspace cannot carry an adjustment somebody edited into the file,
 * or a conflict the record no longer supports.
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a restriction, completes an instrument reference, guesses
 * a limit's unit, re-dates a review, invents a night window or rescues a row
 * that names a person off the roster. A row that cannot be read exactly is
 * DROPPED with a counted warning, and the screen prints the count.
 *
 * THE FOUR LOADER RULES THAT CARRY THE MANDATE:
 *   1. A restriction with NO WRITTEN INSTRUMENT REFERENCE is DROPPED. A
 *      restriction is a claim about a human being's body; an unsourced one is
 *      exactly the plausible default the Bulletproof Reliability Mandate
 *      forbids, and it is impossible to defend if it is ever tested.
 *   2. A restriction whose LIMIT does not match its domain's unit is DROPPED.
 *      A `max-shift-hours` limit of zero minutes, a fractional minute, or a
 *      gram value on an hours domain is not "probably fine" — it is unreadable,
 *      and a repaired number here would be a duty nobody declared.
 *   3. A restriction carrying a DIAGNOSIS-SHAPED field is refused at the
 *      boundary. There is no diagnosis field in this register by design, and a
 *      hand-edited file that smuggles `condition`, `diagnosis`, `symptom`,
 *      `prognosis` or `clinicalNote` onto a row is dropped WHOLE with the count
 *      printed, rather than silently stripped — because stripping it would let
 *      the writer believe it had been stored.
 *   4. An acknowledgement, adjustment or review is admitted only through its
 *      restriction's own lifecycle, so a hand-edited file cannot acknowledge a
 *      withdrawn restriction, put an adjustment operational for an unknown
 *      restriction, or review a restriction twice on one day.
 */

import { dayKey } from '../time.js';
import {
  WPA_ADJUSTMENT_KIND_KEYS,
  WPA_BOUNDS,
  WPA_DEFAULTS,
  WPA_DOMAIN_BY_KEY,
  WPA_DOMAIN_KEYS,
  WPA_INSTRUMENT_BY_KEY,
  WPA_INSTRUMENT_KEYS,
  WPA_LIMITS as L,
  WPA_NIGHT_WINDOW_DEFAULTS,
  WPA_REVIEW_DECISION_KEYS,
  WPA_RESTRICTION_STATUSES,
  WPA_SETTING_KEYS,
} from './workplaceAdjustmentRegistry.js';

const ID_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value, max = L.textMax) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const list = (value) => (Array.isArray(value) ? value : []);
const id = (value) => { const c = text(value, L.idMax); return ID_RE.test(c) ? c : null; };

/** A real calendar day inside the register's range, or null. */
export function wpaDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** An ISO instant, normalised through Date so it is exactly comparable, or null. */
function stamp(value) {
  const raw = text(value, 40);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/** A wall clock `HH:MM`, or null. `24:00` and `09:60` are nothing, not a repair. */
export function wpaWallClock(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A wall clock as minutes since local midnight, or null. */
export function wallMinutes(value) {
  const clock = wpaWallClock(value);
  if (!clock) return null;
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/**
 * The declared LIMIT of a restriction, read exactly against its domain's unit.
 *
 * Returns `{ unit, value }` on success and `null` on any unreadable value. An
 * hours/rest domain carries whole MINUTES; a handling domain carries whole
 * GRAMS; a pure prohibition carries nothing at all, and a number supplied for
 * one is refused rather than ignored — a prohibition with a number on it means
 * the declaration contradicts itself.
 */
export function wpaLimit(domainKey, rawLimit) {
  const domain = WPA_DOMAIN_BY_KEY[domainKey];
  if (!domain) return null;
  if (!domain.limit) {
    // A pure prohibition. No limit may be attached, and silence is the only
    // correct value. `null` and `''` read as "no limit declared".
    if (rawLimit === null || rawLimit === undefined || rawLimit === '') return { unit: null, value: null };
    return null;
  }
  if (typeof rawLimit !== 'number' || !Number.isInteger(rawLimit)) return null;
  const max = domain.limit === 'grams' ? L.limitMaxGrams : L.limitMaxMinutes;
  if (rawLimit < 0 || rawLimit > max) return null;
  return { unit: domain.limit, value: rawLimit };
}

/** A statement of what the work must respect: bounded, non-empty, no whitespace games. */
export function wpaStatement(value) {
  const candidate = text(value, L.statementMax + 40);
  if (candidate.length < L.statementMin) return null;
  return candidate.slice(0, L.statementMax);
}

/** A written instrument reference: the note's own words, bounded. Never a diagnosis. */
export function wpaSourceRef(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/** A written reason, bounded. Used for withdrawals, refusals, reviews and retirement. */
export function wpaReason(value) {
  const candidate = text(value, L.textMax + 80);
  if (candidate.length < L.textMin) return null;
  return candidate.slice(0, L.textMax);
}

/**
 * THE FIELDS THIS REGISTER WILL NOT HOLD.
 *
 * A diagnosis is not a field this register has, so a row carrying one is a
 * hand-edited artefact describing a medical record the product never promised
 * to keep. It is dropped WHOLE and counted: stripping the field silently would
 * leave the writer believing the condition was stored, which is the worse of
 * the two failures for a system people trust with real decisions.
 */
export const WPA_FORBIDDEN_FIELDS = Object.freeze([
  'diagnosis', 'condition', 'conditions', 'symptom', 'symptoms', 'prognosis',
  'clinicalNote', 'clinicalNotes', 'medicalNote', 'medicalNotes', 'medicalRecord',
  'treatment', 'medication', 'medications', 'icd10', 'icd', 'snomed', 'disability',
  'impairment', 'illness', 'disease',
]);

function carriesForbiddenField(row) {
  return WPA_FORBIDDEN_FIELDS.some((field) => Object.hasOwn(row, field) && row[field] !== null && row[field] !== undefined && row[field] !== '');
}

const WPA_NIGHT_WINDOW_FIELDS = Object.freeze(['startMinute', 'endMinute']);

/** The declared night window must be non-empty: "night" cannot be zero minutes long. */
export const WPA_NIGHT_WINDOW_MIN_MINUTES = 30;

/**
 * The declared night window. Both bounds are whole minutes in [0, 1440]. A
 * window whose end is at or before its start WRAPS past midnight — 22:00 to
 * 06:00 is the ordinary case and is exactly what a night restriction means, so
 * refusing that shape would refuse the commonest declaration in the world.
 *
 * What IS refused is an EMPTY window: equal bounds (zero minutes of night) and
 * a window shorter than the declared minimum. A zero-length night window would
 * make every `no-night-work` test vacuously pass, which is precisely the
 * reassuring blank the Bulletproof Reliability Mandate forbids.
 */
export function normalizeWpaNightWindow(input) {
  const row = isPlainObject(input) ? input : {};
  const start = Number.isInteger(row.startMinute) ? row.startMinute : null;
  const end = Number.isInteger(row.endMinute) ? row.endMinute : null;
  if (start !== null && (start < 0 || start > 1439)) return null;
  if (end !== null && (end < 0 || end > 1440)) return null;
  const resolvedStart = start === null ? WPA_NIGHT_WINDOW_DEFAULTS.startMinute : start;
  const resolvedEnd = end === null ? WPA_NIGHT_WINDOW_DEFAULTS.endMinute : end;
  // A window whose start EQUALS its end has no extent: read as a wrapping span it
  // would silently become a FULL 24-HOUR night and every shift would breach. It
  // is refused, not repaired, exactly like any other window too short to be one.
  if (resolvedEnd === resolvedStart) return null;
  const span = resolvedEnd > resolvedStart
    ? resolvedEnd - resolvedStart
    : (1440 - resolvedStart) + resolvedEnd;
  if (span < WPA_NIGHT_WINDOW_MIN_MINUTES) return null;
  return { startMinute: resolvedStart, endMinute: resolvedEnd };
}

export { WPA_NIGHT_WINDOW_FIELDS };

/* ------------------------------------------------------- restriction loader */

/**
 * Restrictions. A row that cannot be read exactly is DROPPED with a counted
 * warning: no re-dating, no unit repair, no invented source, no repaired status.
 *
 * A restriction whose named person is not on the roster is NOT dropped here —
 * the reader prints it as an orphan with its reason, exactly as the assurance
 * and probation registers do, because dropping it would silently delete a live
 * duty from the record. The loader's job is to refuse rows it cannot READ; the
 * reader's job is to report rows it can read but cannot place.
 */
export function normalizeWpaRestrictions(rows, warnings = []) {
  const warn = (message) => warnings.push(`[workplace-adjustments] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the restriction ledger was not an array; it was read as empty');
    return [];
  }
  const out = [];
  const seen = new Set();
  let dropped = 0;
  let diagnoses = 0;
  for (const row of rows) {
    if (out.length >= L.restrictions) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }
    if (carriesForbiddenField(row)) { diagnoses += 1; continue; }

    const rowId = id(row.id);
    const personId = id(row.personId);
    const domain = WPA_DOMAIN_KEYS.includes(row.domain) ? row.domain : null;
    const instrument = WPA_INSTRUMENT_KEYS.includes(row.instrument) ? row.instrument : null;
    const statement = wpaStatement(row.statement);
    const sourceRef = wpaSourceRef(row.sourceRef);
    const limit = domain ? wpaLimit(domain, row.limitValue) : null;
    const declaredOn = wpaDay(row.declaredOn);
    const declaredAt = stamp(row.declaredAt);
    const declaredById = id(row.declaredById);
    const reviewOn = wpaDay(row.reviewOn);
    const status = WPA_RESTRICTION_STATUSES.includes(row.status) ? row.status : null;
    const withdrawnOn = row.withdrawnOn ? wpaDay(row.withdrawnOn) : null;
    const withdrawalReason = row.withdrawnOn ? wpaReason(row.withdrawalReason) : null;

    if (!rowId || seen.has(rowId) || !personId || !domain || !instrument
      || !statement || !sourceRef || !limit || !declaredOn || !declaredAt || !declaredById || !status) {
      dropped += 1;
      continue;
    }
    // A review day that precedes the declaration is not "probably a typo".
    if (reviewOn && reviewOn < declaredOn) { dropped += 1; continue; }
    // A status and its withdrawal must arrive together or not at all.
    if (status === 'withdrawn' && (!withdrawnOn || !withdrawalReason)) { dropped += 1; continue; }
    if (status === 'active' && (withdrawnOn || withdrawalReason)) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      personId,
      domain,
      instrument,
      statement,
      sourceRef,
      limitUnit: limit.unit,
      limitValue: limit.value,
      declaredOn,
      declaredAt,
      declaredById,
      reviewOn,
      note: text(row.note),
      status,
      withdrawnOn,
      withdrawalReason: withdrawalReason || '',
      withdrawnById: withdrawnOn ? id(row.withdrawnById) || '' : '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} restriction row(s) could not be read exactly — an unreadable person, domain, instrument, statement, source reference, unit-mismatched limit, day or status — and were dropped. Nothing was repaired.`);
  if (diagnoses) warn(`${diagnoses} restriction row(s) carried a diagnosis-shaped field, which this register does not hold; they were dropped whole rather than stripped.`);
  return out;
}

/* ------------------------------------------------------- adjustment loader */

/**
 * Adjustments: what was actually done, when it was agreed, when (if ever) it
 * became operational, and by whom. The two dates are separate fields because
 * the distance between them is the measure the category says nobody can produce.
 *
 * An adjustment is admitted only through a LIVE-or-historical restriction that
 * this loader was handed, so a hand-edited file cannot attach work to a
 * restriction that does not exist.
 */
export function normalizeWpaAdjustments(rows, restrictions = [], warnings = []) {
  const warn = (message) => warnings.push(`[workplace-adjustments] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the adjustment ledger was not an array; it was read as empty');
    return [];
  }
  const live = new Map(list(restrictions).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.adjustments) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const restrictionId = id(row.restrictionId);
    const parent = restrictionId ? live.get(restrictionId) : null;
    const kind = WPA_ADJUSTMENT_KIND_KEYS.includes(row.kind) ? row.kind : null;
    const detail = text(row.detail, L.statementMax) || null;
    const agreedOn = wpaDay(row.agreedOn);
    const agreedAt = stamp(row.agreedAt);
    const agreedById = id(row.agreedById);
    const operationalOn = row.operationalOn ? wpaDay(row.operationalOn) : null;
    const status = row.status === 'retired' ? 'retired' : (row.status === 'active' || row.status === 'agreed' ? 'active' : null);
    const retiredOn = row.retiredOn ? wpaDay(row.retiredOn) : null;
    const retiredReason = row.retiredOn ? wpaReason(row.retiredReason) : null;

    if (!rowId || seen.has(rowId) || !parent || !kind || !detail || !agreedOn || !agreedAt || !agreedById || !status) {
      dropped += 1;
      continue;
    }
    if (detail.length < L.statementMin) { dropped += 1; continue; }
    // An operational day before the agreement, or in the future of the
    // declaration, is unreadable — the register refuses rather than re-dating.
    if (operationalOn && operationalOn < agreedOn) { dropped += 1; continue; }
    if (status === 'retired' && (!retiredOn || !retiredReason)) { dropped += 1; continue; }
    if (status === 'active' && (retiredOn || retiredReason)) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      restrictionId,
      kind,
      detail: detail.slice(0, L.statementMax),
      agreedOn,
      agreedAt,
      agreedById,
      operationalOn,
      operationalAt: operationalOn ? stamp(row.operationalAt) : null,
      operationalById: operationalOn ? id(row.operationalById) || '' : '',
      costNote: text(row.costNote, L.statementMax),
      status,
      retiredOn,
      retiredReason: retiredReason || '',
      retiredById: retiredOn ? id(row.retiredById) || '' : '',
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '',
    });
  }
  if (dropped) warn(`${dropped} adjustment row(s) could not be read exactly — an unknown restriction, an unreadable kind, a missing statement, an operational day before the agreement, or half a retirement — and were dropped. Nothing was repaired.`);
  return out;
}

/* -------------------------------------------------- acknowledgement loader */

/**
 * A LINE ACKNOWLEDGEMENT: the holder of one reporting line states, on a day,
 * that they have been shown this restriction and understand what it requires of
 * the work they hand out.
 *
 * This is the row the third benchmarked failure needs. An adjustment is agreed,
 * then the manager changes, and the duty quietly stops operating. Requiring an
 * acknowledgement PER LINE makes a line change re-open the gap by itself,
 * without anybody remembering to look.
 */
export function normalizeWpaAcknowledgements(rows, restrictions = [], warnings = []) {
  const warn = (message) => warnings.push(`[workplace-adjustments] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the acknowledgement ledger was not an array; it was read as empty');
    return [];
  }
  const live = new Map(list(restrictions).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.acknowledgements) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const restrictionId = id(row.restrictionId);
    const parent = restrictionId ? live.get(restrictionId) : null;
    const lineManagerId = id(row.lineManagerId);
    const acknowledgedOn = wpaDay(row.acknowledgedOn);
    const acknowledgedAt = stamp(row.acknowledgedAt);
    const acknowledgedById = id(row.acknowledgedById);

    if (!rowId || seen.has(rowId) || !parent || !lineManagerId || !acknowledgedOn || !acknowledgedAt || !acknowledgedById) {
      dropped += 1;
      continue;
    }
    // The person carrying the restriction may read it and may not sign for a line.
    if (parent.personId === lineManagerId) { dropped += 1; continue; }
    if (acknowledgedOn < parent.declaredOn) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      restrictionId,
      lineManagerId,
      acknowledgedOn,
      acknowledgedAt,
      acknowledgedById,
      note: text(row.note),
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} acknowledgement row(s) could not be read exactly — an unknown restriction, an unreadable line or day, a day before the restriction was declared, or the person signing for their own line — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------- review loader */

/**
 * A RECORDED REVIEW: the decision a human reached on a day, with a written
 * basis, and what the review was told. Nothing here closes a restriction by the
 * passage of time; only a human act does, and only with the decision recorded.
 *
 * A review whose decision is `close` or `amend` is the ONLY evidence this
 * register accepts for lifting a live restriction. The door enforces that; this
 * loader enforces that a review row is internally readable.
 */
export function normalizeWpaReviews(rows, restrictions = [], warnings = []) {
  const warn = (message) => warnings.push(`[workplace-adjustments] ${message}`);
  if (!Array.isArray(rows)) {
    if (rows !== undefined && rows !== null) warn('the review ledger was not an array; it was read as empty');
    return [];
  }
  const live = new Map(list(restrictions).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const row of rows) {
    if (out.length >= L.reviews) { dropped += 1; continue; }
    if (!isPlainObject(row)) { dropped += 1; continue; }

    const rowId = id(row.id);
    const restrictionId = id(row.restrictionId);
    const parent = restrictionId ? live.get(restrictionId) : null;
    const decision = WPA_REVIEW_DECISION_KEYS.includes(row.decision) ? row.decision : null;
    const basis = wpaReason(row.basis);
    const reviewedOn = wpaDay(row.reviewedOn);
    const reviewedAt = stamp(row.reviewedAt);
    const reviewedById = id(row.reviewedById);
    const nextReviewOn = row.nextReviewOn ? wpaDay(row.nextReviewOn) : null;

    if (!rowId || seen.has(rowId) || !parent || !decision || !basis || !reviewedOn || !reviewedAt || !reviewedById) {
      dropped += 1;
      continue;
    }
    if (reviewedOn < parent.declaredOn) { dropped += 1; continue; }
    if (nextReviewOn && nextReviewOn <= reviewedOn) { dropped += 1; continue; }
    // A decision to continue must name the next review day, or the restriction
    // would silently fall out of the review cycle for ever.
    if (decision === 'continue' && !nextReviewOn) { dropped += 1; continue; }

    seen.add(rowId);
    out.push({
      id: rowId,
      restrictionId,
      decision,
      basis,
      reviewedOn,
      reviewedAt,
      reviewedById,
      nextReviewOn,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    });
  }
  if (dropped) warn(`${dropped} review row(s) could not be read exactly — an unknown restriction, an unreadable decision, a missing basis, a day before the restriction was declared, or a “continue” that names no next review day — and were dropped.`);
  return out;
}

/* ------------------------------------------------------------------ markers */

/** Identity-free rule markers: unique keys, capped, never repaired. */
export function normalizeWpaMarkers(rows, warnings = []) {
  const warn = (message) => warnings.push(`[workplace-adjustments] ${message}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) { warn('a marker row was not an object and was dropped'); continue; }
    const key = id(row.key, 240);
    if (!key || seen.has(key)) continue;
    if (typeof row.detail !== 'string' || !row.detail.trim()) continue;
    seen.add(key);
    out.push({
      key,
      at: typeof row.at === 'string' ? row.at : '',
      ruleId: id(row.ruleId, 60) || '',
      kind: id(row.kind, 60) || 'workplace-adjustment',
      detail: row.detail.trim().slice(0, 400),
    });
  }
  if (out.length > L.markers) out.splice(0, out.length - L.markers);
  return out;
}

/* ---------------------------------------------------------------- settings */

const clampBound = (value, bound, fallback) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < bound.min) return bound.min;
  if (n > bound.max) return bound.max;
  return n;
};

/**
 * The register's conventions, clamped on load and REFUSED (never clamped) by
 * the setter. Keyed by the FULL setting keys they are persisted under, exactly
 * as the risk-appetite and distributed-work registers key their own switches: a
 * key missing here is a switch that cannot be recorded, which Session 293 found
 * the hard way.
 */
export function normalizeWpaSettings(input = {}) {
  const s = isPlainObject(input) ? input : {};
  return {
    [WPA_SETTING_KEYS.autoPropagate]: s[WPA_SETTING_KEYS.autoPropagate] !== false,
    [WPA_SETTING_KEYS.adjustmentGraceDays]: clampBound(s[WPA_SETTING_KEYS.adjustmentGraceDays], WPA_BOUNDS.adjustmentGraceDays, WPA_DEFAULTS.adjustmentGraceDays),
    [WPA_SETTING_KEYS.reviewWarnDays]: clampBound(s[WPA_SETTING_KEYS.reviewWarnDays], WPA_BOUNDS.reviewWarnDays, WPA_DEFAULTS.reviewWarnDays),
    [WPA_SETTING_KEYS.privacyFloor]: clampBound(s[WPA_SETTING_KEYS.privacyFloor], WPA_BOUNDS.privacyFloor, WPA_DEFAULTS.privacyFloor),
    // The night window a `no-night-work` restriction is tested against. It is a
    // DECLARED convention and it is normalized here, on load, so the window the
    // register tests with is always the one on the record: an unreadable
    // declaration (a zero-length night, a 10-minute night, an out-of-range
    // minute) falls back to the printed default rather than being silently used.
    ...(() => {
      const window = normalizeWpaNightWindow({
        startMinute: s.wpaNightStartMinute ?? s[WPA_SETTING_KEYS.nightStartMinute],
        endMinute: s.wpaNightEndMinute ?? s[WPA_SETTING_KEYS.nightEndMinute],
      }) || WPA_NIGHT_WINDOW_DEFAULTS;
      return { wpaNightStartMinute: window.startMinute, wpaNightEndMinute: window.endMinute };
    })(),
  };
}

/** The declared night window, read from settings, falling back to the declared default. */
export function readWpaNightWindow(settings = {}) {
  const s = isPlainObject(settings) ? settings : {};
  const start = Number.isInteger(s.wpaNightStartMinute) ? s.wpaNightStartMinute : WPA_NIGHT_WINDOW_DEFAULTS.startMinute;
  const end = Number.isInteger(s.wpaNightEndMinute) ? s.wpaNightEndMinute : WPA_NIGHT_WINDOW_DEFAULTS.endMinute;
  const normalized = normalizeWpaNightWindow({ startMinute: start, endMinute: end });
  return normalized || { ...WPA_NIGHT_WINDOW_DEFAULTS };
}

export const WPA_INSTRUMENT_IS_BINDING = Object.freeze(
  Object.fromEntries(WPA_INSTRUMENT_KEYS.map((key) => [key, WPA_INSTRUMENT_BY_KEY[key].binding])),
);
