/**
 * app/core/domain/incidentCommandSchema.js — the fail-closed loaders of the
 * Major-Incident Command & Notification-Clock Register (ADR-0240, Schema v194).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs an instant, synthesises a commander, banks a severity
 * change nobody made, invents a clock source, or converts an unreadable deadline
 * into a guess. A row that cannot be read exactly is DROPPED with a counted
 * warning, and the screen prints the count.
 *
 * FIVE LOADER RULES THAT CARRY THE MANDATE:
 *   1. AN INCIDENT WITH NO DECLARING SEAT, NO DECLARED CRITERION OR NO
 *      DETECTION INSTANT IS DROPPED. The detection-to-declaration interval is
 *      the register's first number; an incident whose detection instant is
 *      missing cannot produce it, and filling that instant with `createdAt`
 *      would manufacture the very figure the page prints.
 *   2. A DECLARED CLOCK WITH NO SOURCE OR NO WHOLE-MINUTE PERIOD IS DROPPED. A
 *      notification deadline is the most consequential number this register
 *      prints. A clock the record cannot source is not a clock.
 *   3. AN ACT IS READ ONLY AS THE KIND IT DECLARES. An `assume` act carrying no
 *      successor is dropped rather than being read as a `transfer`; a `transfer`
 *      carrying no named successor is dropped rather than being read as an
 *      assumption of command by the actor.
 *   4. AN UNDATED ACT IS DROPPED, EXCEPT WHERE THE KIND DEFINES ITS OWN CLOCK.
 *      `notify` and `stand-down` may carry the instant the thing happened where
 *      a seat is transcribing a paper or phone record, but an instant that is
 *      present and unparseable is refused — never silently replaced by "now".
 *   5. A LINE NAMES A REAL, CLOSED-LIST DUTY. A line with an empty duty or a
 *      duty outside the three declared response duties is dropped; a line is
 *      never given a generic duty to keep the row alive.
 *
 * INSTANTS ARE PARSED, NEVER ROUNDED. `2026-02-30T10:00:00Z` is not the second
 * of March; it is nothing. A date-only string is read at UTC midnight, which is
 * what `toDate` already does for the whole workspace, and the reader prints the
 * exact instants it used.
 */

import { toDate, dayKey } from '../time.js';
import {
  MIC_LIMITS as L,
  MIC_SEVERITY_KEYS,
  MIC_CLOCK_SOURCE_KEYS,
  MIC_CLOCK_ORIGIN_KEYS,
  MIC_NOTIFY_PARTY_KEYS,
  MIC_ACT_KINDS,
  MIC_DEFAULTS,
  MIC_BOUNDS,
  MIC_SETTING_KEYS,
} from './incidentCommandRegistry.js';

/** A real calendar day inside the register's range, or null. */
export function micDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/**
 * A full ISO-8601 instant, normalised to UTC, or null. A date-only string is
 * read at UTC midnight (the workspace convention). A string that *looks* like an
 * instant but does not parse — including an impossible calendar day such as
 * `2026-02-30` — is null, never rolled forward.
 */
export function micInstant(value) {
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : new Date(ms).toISOString();
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  // Reject an impossible date-only day explicitly: `new Date('2026-02-30')`
  // rolls to 2 March rather than failing, and a rolled instant is a fabricated
  // own goal on the one field this register exists to make exact.
  const dayOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dayOnly) {
    const year = Number(dayOnly[1]);
    const month = Number(dayOnly[2]);
    const date = Number(dayOnly[3]);
    const probe = new Date(Date.UTC(year, month - 1, date));
    if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== date) return null;
  }
  const parsed = toDate(raw);
  if (!parsed) return null;
  return parsed.toISOString();
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function micText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A reference (case number, message id, receipt): bounded and trimmed, or null. */
export function micRef(value) {
  const text = micText(value, L.refMax);
  return text.length >= L.refMin ? text : null;
}

/** An id: a trimmed bounded string, or null. */
export function micId(value, max = L.idMax) {
  if (typeof value !== 'string') return null;
  const id = value.trim().slice(0, max);
  return id || null;
}

/** A declared clock: a positive whole number of minutes inside the range, or null. */
export function micClockMinutes(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < L.clockMinMinutes || value > L.clockMaxMinutes) return null;
  return value;
}

/** Whole minutes from one instant to another, or null. Exact, never rounded. */
export function minutesBetween(fromIso, toIso) {
  const from = toDate(fromIso);
  const to = toDate(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 60000);
}

const oneOf = (list, value) => (list.includes(value) ? value : null);

/**
 * One declared notification clock. Only ever attached to an incident and read
 * exactly: source, period and origin. A clock that cannot be read whole is
 * dropped, and the incident keeps running without it — the register then prints
 * `no-clock` on every obligation that named it, which is the honest outcome.
 */
function normalizeClock(raw, seenKeys) {
  if (!raw || typeof raw !== 'object') return null;
  const key = micId(raw.key, 60);
  const clockSource = oneOf(MIC_CLOCK_SOURCE_KEYS, raw.clockSource);
  const clockMinutes = micClockMinutes(raw.clockMinutes);
  const clockOrigin = oneOf(MIC_CLOCK_ORIGIN_KEYS, raw.clockOrigin);
  const basis = micText(raw.basis, L.textMax);
  const declaredAt = micInstant(raw.declaredAt);
  const declaredById = micId(raw.declaredById);
  if (!key || seenKeys.has(key)) return null;
  if (!clockSource || !clockMinutes || !clockOrigin) return null;
  if (basis.length < L.textMin) return null;
  if (!declaredAt || !declaredById) return null;
  seenKeys.add(key);
  return { key, clockSource, clockMinutes, clockOrigin, basis, declaredAt, declaredById };
}

/**
 * One response line on an incident: a closed-list duty, a named lead (or none),
 * and the duty's own written statement. The lead is NOT validated against the
 * roster here — the reader resolves it against the live matrix and prints an
 * unresolvable line rather than dropping the whole incident.
 */
function normalizeLine(raw, seenKeys) {
  if (!raw || typeof raw !== 'object') return null;
  const lineId = micId(raw.lineId, 60);
  const duty = micId(raw.duty, 40);
  const dutyText = micText(raw.dutyText, L.textMax);
  const leadId = raw.leadId === null || raw.leadId === undefined ? null : micId(raw.leadId);
  if (!lineId || seenKeys.has(lineId)) return null;
  if (!duty) return null;
  if (dutyText.length < L.textMin) return null;
  seenKeys.add(lineId);
  return { lineId, duty, dutyText, leadId };
}

/**
 * One notification obligation: who must be told, on which of the incident's own
 * declared clocks, and the duty's written basis. `clockKey` may be null — that
 * is a legal, printable state (`no-clock`) and it is counted, never repaired by
 * substituting the incident's first clock.
 */
function normalizeNotification(raw, seenKeys) {
  if (!raw || typeof raw !== 'object') return null;
  const notifId = micId(raw.notifId, 60);
  const party = oneOf(MIC_NOTIFY_PARTY_KEYS, raw.party);
  const basis = micText(raw.basis, L.textMax);
  const clockKey = raw.clockKey === null || raw.clockKey === undefined || raw.clockKey === '' ? null : micId(raw.clockKey, 60);
  if (!notifId || seenKeys.has(notifId)) return null;
  if (!party) return null;
  if (basis.length < L.textMin) return null;
  seenKeys.add(notifId);
  return { notifId, party, basis, clockKey };
}

/**
 * Incidents. A row that cannot be read exactly is DROPPED with a counted
 * warning: no re-dating, no invented declarer, no repaired criterion, no
 * synthesised commander.
 */
export function normalizeMicIncidents(rows, warnings = []) {
  const warn = (text) => warnings.push(`[incident-command] ${text}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    if (out.length >= L.incidents) { warn('the incident ledger is over its declared ceiling; further rows were refused'); break; }
    if (!raw || typeof raw !== 'object') { warn('an incident row was not an object and was dropped'); continue; }
    const id = micId(raw.id);
    if (!id) { warn('an incident row had no readable id and was dropped'); continue; }
    if (seen.has(id)) { warn(`incident ${id} appeared twice; the second copy was dropped`); continue; }

    const title = micText(raw.title, L.titleMax);
    const severity = oneOf(MIC_SEVERITY_KEYS, raw.severity);
    const criterion = micText(raw.criterion, L.textMax);
    const detectedAt = micInstant(raw.detectedAt);
    const declaredAt = micInstant(raw.declaredAt);
    const declaredById = micId(raw.declaredById);
    const createdAt = micInstant(raw.createdAt);
    const updatedAt = micInstant(raw.updatedAt);

    if (title.length < L.titleMin) { warn(`incident ${id} had no readable title and was dropped`); continue; }
    if (!severity || !criterion || criterion.length < L.textMin) { warn(`incident ${id} carried no readable severity criterion and was dropped`); continue; }
    if (!detectedAt || !declaredAt) { warn(`incident ${id} had no readable detection or declaration instant and was dropped — the interval it exists to print cannot be manufactured`); continue; }
    if (declaredAt < detectedAt) { warn(`incident ${id} declares before it was detected; the row was dropped rather than read backwards`); continue; }
    if (!declaredById || !createdAt) { warn(`incident ${id} had no readable declaring seat or creation instant and was dropped`); continue; }

    const clockKeys = new Set();
    const clocks = (Array.isArray(raw.clocks) ? raw.clocks : []).map((row) => normalizeClock(row, clockKeys)).filter(Boolean);
    if ((Array.isArray(raw.clocks) ? raw.clocks.length : 0) > clocks.length) {
      warn(`incident ${id}: refused ${(Array.isArray(raw.clocks) ? raw.clocks.length : 0) - clocks.length} unreadable or duplicate declared clock(s); no period or source was repaired`);
    }

    const lineKeys = new Set();
    const lines = (Array.isArray(raw.lines) ? raw.lines : []).map((row) => normalizeLine(row, lineKeys)).filter(Boolean);
    if ((Array.isArray(raw.lines) ? raw.lines.length : 0) > lines.length) {
      warn(`incident ${id}: refused ${(Array.isArray(raw.lines) ? raw.lines.length : 0) - lines.length} unreadable or duplicate response line(s); no lead or duty was invented`);
    }
    if (!lines.length || lines.length > L.linesMax) { warn(`incident ${id} carried no readable response line (or more than ${L.linesMax}) and was dropped`); continue; }

    const notifKeys = new Set();
    const rawNotifications = Array.isArray(raw.notifications) ? raw.notifications : [];
    const notifications = rawNotifications.map((row) => normalizeNotification(row, notifKeys)).filter(Boolean);
    if (rawNotifications.length > notifications.length) {
      warn(`incident ${id}: refused ${rawNotifications.length - notifications.length} unreadable or duplicate notification obligation(s); no party or clock was repaired`);
    }
    if (notifications.length > L.notifMax) { warn(`incident ${id} carried more than ${L.notifMax} notification obligations and was dropped`); continue; }

    seen.add(id);
    out.push({
      id,
      title,
      severity,
      criterion,
      detectedAt,
      declaredAt,
      declaredById,
      /** A stable reference to the incident this one follows, if declared. */
      followsUpOn: micId(raw.followsUpOn) || null,
      clocks,
      lines,
      notifications,
      createdAt,
      updatedAt: updatedAt && updatedAt >= createdAt ? updatedAt : createdAt,
    });
  }
  if (out.length < (Array.isArray(rows) ? rows.length : 0)) {
    // The per-row warnings above already name the cause; this is the count the
    // screen prints beside the table.
    const dropped = (Array.isArray(rows) ? rows.length : 0) - out.length;
    if (dropped > 0 && !warnings.some((text) => text.includes(`refused ${dropped} `))) {
      warn(`${dropped} incident row(s) were refused; no field was repaired to keep a row alive`);
    }
  }
  return out;
}

/**
 * Acts. Each kind is read by the timestamp key it carries, and the uniform `at`
 * is carried through beside it. An act whose kind requires a field it does not
 * have is DROPPED — never reinterpreted as another kind.
 */
export function normalizeMicActs(rows, incidents = [], warnings = []) {
  const warn = (text) => warnings.push(`[incident-command] ${text}`);
  if (!Array.isArray(rows)) return [];
  const byId = new Map((Array.isArray(incidents) ? incidents : []).map((row) => [row.id, row]));
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    if (out.length >= L.acts) { warn('the incident act ledger is over its declared ceiling; further acts were refused'); break; }
    if (!raw || typeof raw !== 'object') { warn('an incident act was not an object and was dropped'); continue; }
    const id = micId(raw.id);
    const incidentId = micId(raw.incidentId);
    const actorId = micId(raw.actorId);
    const kind = oneOf(MIC_ACT_KINDS, raw.kind);
    if (!id || seen.has(id)) { warn('an incident act had no readable id or repeated one and was dropped'); continue; }
    if (!incidentId || !byId.has(incidentId) || !actorId || !kind) { warn(`incident act ${id} could not be attached to a readable incident, actor or kind and was dropped`); continue; }

    const base = { id, incidentId, actorId, kind };

    if (kind === 'assign') {
      const lineId = micId(raw.lineId, 60);
      const leadId = micId(raw.leadId);
      const assignedAt = micInstant(raw.assignedAt);
      if (!lineId || !leadId || !assignedAt) { warn(`incident act ${id} (assign) was missing a line, a lead or its instant and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, lineId, leadId, assignedAt, at: assignedAt });
      continue;
    }
    if (kind === 'accept') {
      const lineId = micId(raw.lineId, 60);
      const acceptedAt = micInstant(raw.acceptedAt);
      if (!lineId || !acceptedAt) { warn(`incident act ${id} (accept) was missing a line or its instant and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, lineId, acceptedAt, at: acceptedAt });
      continue;
    }
    if (kind === 'assume') {
      const assumedAt = micInstant(raw.assumedAt);
      if (!assumedAt) { warn(`incident act ${id} (assume) had no readable instant and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, assumedAt, at: assumedAt });
      continue;
    }
    if (kind === 'transfer') {
      const toId = micId(raw.toId);
      const reason = micText(raw.reason, L.textMax);
      const transferredAt = micInstant(raw.transferredAt);
      if (!toId || !transferredAt || reason.length < L.textMin) { warn(`incident act ${id} (transfer) was missing a named successor, its instant or a readable reason and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, toId, reason, transferredAt, at: transferredAt });
      continue;
    }
    if (kind === 'notify') {
      const notifId = micId(raw.notifId, 60);
      const reference = micRef(raw.reference);
      const notifiedAt = micInstant(raw.notifiedAt);
      if (!notifId || !reference || !notifiedAt) { warn(`incident act ${id} (notify) was missing its obligation, a reference or its instant and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, notifId, reference, notifiedAt, at: notifiedAt });
      continue;
    }
    if (kind === 'severity') {
      const severity = oneOf(MIC_SEVERITY_KEYS, raw.severity);
      const reason = micText(raw.reason, L.textMax);
      const changedAt = micInstant(raw.changedAt);
      if (!severity || !changedAt || reason.length < L.textMin) { warn(`incident act ${id} (severity) was missing a readable severity, its instant or a reason and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, severity, reason, changedAt, at: changedAt });
      continue;
    }
    if (kind === 'resolve') {
      const evidenceText = micText(raw.evidenceText, L.textMax);
      const resolvedAt = micInstant(raw.resolvedAt);
      if (!resolvedAt || evidenceText.length < L.textMin) { warn(`incident act ${id} (resolve) was missing its instant or readable evidence and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, evidenceText, resolvedAt, at: resolvedAt });
      continue;
    }
    if (kind === 'stand-down') {
      const reason = micText(raw.reason, L.textMax);
      const stoodDownAt = micInstant(raw.stoodDownAt);
      if (!stoodDownAt || reason.length < L.textMin) { warn(`incident act ${id} (stand-down) was missing its instant or a readable reason and was dropped`); continue; }
      seen.add(id);
      out.push({ ...base, reason, stoodDownAt, at: stoodDownAt });
      continue;
    }
    warn(`incident act ${id} declared an unknown kind and was dropped`);
  }
  if (out.length < (Array.isArray(rows) ? rows.length : 0)) {
    const dropped = (Array.isArray(rows) ? rows.length : 0) - out.length;
    if (dropped > 0 && !warnings.some((text) => text.includes(`${dropped} act`))) {
      warn(`${dropped} incident act(s) were refused; no act was reinterpreted as another kind to keep it alive`);
    }
  }
  return out;
}

/** Identity-free rule markers. A marker with no key is dropped. */
export function normalizeMicMarkers(rows, warnings = []) {
  const warn = (text) => warnings.push(`[incident-command] ${text}`);
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const key = micText(raw.key, 240);
    if (!key || seen.has(key)) continue;
    const at = micInstant(raw.at);
    if (!at) continue;
    seen.add(key);
    out.push({
      key,
      at,
      ruleId: micText(raw.ruleId, 40) || '',
      kind: micText(raw.kind, 60) || '',
      detail: micText(raw.detail, 400),
    });
    if (out.length >= L.markers) { warn('the incident marker ledger is over its declared ceiling; further markers were refused'); break; }
  }
  return out;
}

/**
 * The conventions. Clamped to their declared bounds, because a convention
 * outside its bounds is a typo rather than a choice; a value that is not a
 * number at all falls back to the declared default and is never read as zero.
 */
export function normalizeMicSettings(settings = {}) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const clamp = (value, fallback, bounds) => {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(bounds.max, Math.max(bounds.min, n));
  };
  return {
    [MIC_SETTING_KEYS.autoPropagate]: s[MIC_SETTING_KEYS.autoPropagate] !== false,
    [MIC_SETTING_KEYS.closingWindowMinutes]: clamp(s[MIC_SETTING_KEYS.closingWindowMinutes], MIC_DEFAULTS.closingWindowMinutes, MIC_BOUNDS.closingWindowMinutes),
    [MIC_SETTING_KEYS.chaseDays]: clamp(s[MIC_SETTING_KEYS.chaseDays], MIC_DEFAULTS.chaseDays, MIC_BOUNDS.chaseDays),
    [MIC_SETTING_KEYS.lapsedAskDays]: clamp(s[MIC_SETTING_KEYS.lapsedAskDays], MIC_DEFAULTS.lapsedAskDays, MIC_BOUNDS.lapsedAskDays),
    [MIC_SETTING_KEYS.acknowledgeVarianceMinutes]: clamp(s[MIC_SETTING_KEYS.acknowledgeVarianceMinutes], MIC_DEFAULTS.acknowledgeVarianceMinutes, MIC_BOUNDS.acknowledgeVarianceMinutes),
  };
}
