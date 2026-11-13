/**
 * app/core/domain/changeSaturationSchema.js — fail-closed storage contract and
 * the single validator for the Cross-Line Change Saturation & Absorptive-Capacity
 * Ledger (ADR-0186, Schema v148).
 *
 * WHAT IS STORED
 *   `changeSaturationActs`     append-only dated DEMAND acts. One act says: on
 *                              these days, this change puts this much weight on
 *                              this person, down this line. Nothing about the
 *                              load, the total or the verdict is stored.
 *   `changeSaturationCeilings` append-only dated CAPACITY declarations, per
 *                              person or per pool, in whole concurrent weight
 *                              units, for a dated window. A retired ceiling keeps
 *                              its row.
 *   `changeSaturationMarkers`  RULE-CSA-01's bounded idempotency ledger.
 *   four conventions on settings.
 *
 * WHAT IS NEVER STORED. A load, an exposure, a days-over figure, a peak, a
 * verdict, a clearance. Every one is re-derived on read from the acts, the
 * ceilings, the live change records and the Matrix graph, so a printed figure
 * cannot drift from the record under it. Nothing is back-filled on upgrade: an
 * existing workspace has changes with impacts, and inventing windows and weights
 * for them at upgrade time would fabricate the very saturation reading this
 * module is careful to earn.
 *
 * ONE VALIDATOR, TWO DOORS. `validateChangeDemand` and `validateChangeCeiling`
 * are called by the action AND by the loader, so an act the action accepts can
 * never be dropped by the next reload. The checks that need the LIVE graph — is
 * this line still active for this person — are given the graph when a caller has
 * one (the action) and re-derived on read. They are never run inside the loader:
 * a line that ended after a demand was recorded must not delete the history that
 * the demand is part of; it must print as unattributable, which is a different
 * and truer statement.
 *
 * A malformed act is DROPPED with a counted warning. It is never repaired into a
 * demand: a repaired demand is a burden somebody did not declare.
 */

import {
  CHANGE_SATURATION_BAND_VALUES,
  CHANGE_SATURATION_BOUNDS,
  CHANGE_SATURATION_DEFAULTS,
  CHANGE_SATURATION_LIMITS,
  CHANGE_SATURATION_SCOPE_KEYS,
  CHANGE_SATURATION_SETTING_KEYS,
} from './changeSaturationRegistry.js';

const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const SCOPES = new Set(CHANGE_SATURATION_SCOPE_KEYS);
const BANDS = new Set(CHANGE_SATURATION_BAND_VALUES);

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A real calendar day that round-trips, or null. 2026-02-31 is not a day. */
export function saturationDay(value) {
  const raw = str(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return raw;
}

/** Inclusive day count between two day keys, without a wall-clock dependency. */
export function inclusiveDays(fromOn, toOn) {
  const a = Date.parse(`${fromOn}T00:00:00.000Z`);
  const b = Date.parse(`${toOn}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.trunc((b - a) / 86400000) + 1;
}

function boundedInt(value, [min, max], fallback) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;
}

/** The declared conventions, resolved from settings. The loader clamps; the setter refuses. */
export function normalizeChangeSaturationSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  const K = CHANGE_SATURATION_SETTING_KEYS;
  return {
    [K.windowDays]: boundedInt(src[K.windowDays], CHANGE_SATURATION_BOUNDS.windowDays, CHANGE_SATURATION_DEFAULTS.windowDays),
    [K.minPoolN]: boundedInt(src[K.minPoolN], CHANGE_SATURATION_BOUNDS.minPoolN, CHANGE_SATURATION_DEFAULTS.minPoolN),
    [K.askDueDays]: boundedInt(src[K.askDueDays], CHANGE_SATURATION_BOUNDS.askDueDays, CHANGE_SATURATION_DEFAULTS.askDueDays),
    [K.autoPropagate]: src[K.autoPropagate] !== false,
  };
}

export const CHANGE_SATURATION_DEFAULTS_RESOLVED = Object.freeze(normalizeChangeSaturationSettings({}));

/* ------------------------------------------------------------------- demands */

/**
 * Validate one demand declaration. Returns `{ refusals: string[], act }`; the
 * caller decides what to do with several refusals — the action refuses the write
 * and lists them all, the loader drops and counts.
 *
 * `matrix` is optional and only ever ADDS checks: a loader without the live graph
 * cannot say whether a line is still active, and must not pretend to.
 */
export function validateChangeDemand(state, input, { today = null, matrix = null, idFactory = null } = {}) {
  const refusals = [];
  const src = isPlainObject(input) ? input : {};

  const band = typeof src.band === 'number' && Number.isFinite(src.band) ? Math.trunc(src.band) : Number(src.band);
  if (!BANDS.has(band)) refusals.push('unknown-band');

  const personId = str(src.personId);
  const people = Array.isArray(state?.people) ? state.people : [];
  const person = people.find((p) => p && p.id === personId) || null;
  if (!personId || !person) refusals.push('missing-person');
  else if (person.status === 'archived') refusals.push('off-roster');

  const changeId = str(src.changeId);
  const changes = Array.isArray(state?.changes) ? state.changes : [];
  const change = changes.find((c) => c && c.id === changeId) || null;
  if (!changeId) refusals.push('missing-change');
  else if (!change) refusals.push('unknown-change');
  // A demand is anchored to the change’s own impact record. The register will not
  // carry a burden that no change claims to have created, and it will not invent
  // an impact row on the change to make a demand legal.
  else if (personId && !(Array.isArray(change.impacts) ? change.impacts : []).some((row) => row && row.personId === personId)) {
    refusals.push('impact-not-recorded');
  }

  const lineKey = str(src.lineKey);
  if (!lineKey) refusals.push('unknown-line');
  else if (matrix) {
    const active = matrix.linesByPerson?.get?.(personId) || [];
    const line = active.find((l) => String(l.id) === lineKey);
    if (!line) refusals.push('unknown-line');
    else if (line.active === false) refusals.push('line-not-active');
  }

  const fromOn = saturationDay(src.fromOn);
  const toOn = saturationDay(src.toOn);
  if (!fromOn || !toOn) refusals.push('bad-day');
  if (fromOn && toOn) {
    if (toOn < fromOn) refusals.push('reversed-window');
    if (today && fromOn > today) refusals.push('future-window');
    const span = inclusiveDays(fromOn, toOn);
    if (span !== null && span > CHANGE_SATURATION_LIMITS.demandDays) refusals.push('window-too-long');
  }

  // One line states one demand per change per person. A second act from the SAME
  // line is refused: the line would otherwise be counted as having weighed the
  // same impact twice, or — worse — as having changed its mind with no record.
  const acts = Array.isArray(state?.changeSaturationActs) ? state.changeSaturationActs : [];
  if (changeId && personId && lineKey
    && acts.some((a) => a && !a.withdrawn && a.changeId === changeId && a.personId === personId && a.lineKey === lineKey)) {
    refusals.push('duplicate-line-demand');
  }
  if (acts.length >= CHANGE_SATURATION_LIMITS.acts) refusals.push('ledger-full');

  if (refusals.length) return { refusals: [...new Set(refusals)], act: null };

  return {
    refusals: [],
    act: {
      id: idFactory ? idFactory('csa') : `csa-${Math.random().toString(36).slice(2, 10)}`,
      changeId,
      personId,
      lineKey,
      band,
      fromOn,
      toOn,
      note: str(src.note).slice(0, CHANGE_SATURATION_LIMITS.noteMax),
    },
  };
}

/**
 * Load stored demand acts. Every refusal is counted; none is repaired. A
 * withdrawn act is KEPT — marked, not deleted — because a demand that vanished
 * from the ledger would silently move every verdict, and the dated record of who
 * withdrew it is the only thing that makes the correction auditable.
 */
export function normalizeChangeSaturationActs(raw, state, today, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  const seenDemand = new Set();
  let dropped = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const id = str(item.id).slice(0, 80);
    if (!id || seenIds.has(id)) { dropped += 1; continue; }
    const { refusals, act } = validateChangeDemand(state, {
      band: item.band,
      personId: item.personId,
      changeId: item.changeId,
      lineKey: item.lineKey,
      fromOn: item.fromOn,
      toOn: item.toOn,
      note: item.note,
    // An expired window is a state time produced, not a malformation: the loader
    // keeps the row so the register can print the limit that lapsed, and only the
    // action's door refuses to create one.
    }, { today, allowPassedWindow: true });
    if (refusals.length) { dropped += 1; continue; }
    const demandKey = `${act.changeId}|${act.personId}|${act.lineKey}`;
    if (seenDemand.has(demandKey)) { dropped += 1; continue; }
    seenDemand.add(demandKey);
    seenIds.add(id);
    const withdrawn = item.withdrawn === true && Boolean(saturationDay(item.withdrawnOn));
    out.push({
      ...act,
      id,
      declaredOn: saturationDay(item.declaredOn) || saturationDay(item.at) || act.fromOn,
      declaredById: str(item.declaredById).slice(0, 80) || null,
      at: isoOrNull(item.at) || `${act.fromOn}T00:00:00.000Z`,
      withdrawn,
      withdrawnOn: withdrawn ? saturationDay(item.withdrawnOn) : null,
      withdrawnById: withdrawn ? (str(item.withdrawnById).slice(0, 80) || null) : null,
      withdrawnReason: withdrawn ? (str(item.withdrawnReason).slice(0, CHANGE_SATURATION_LIMITS.noteMax) || null) : null,
      withdrawnAt: withdrawn ? isoOrNull(item.withdrawnAt) : null,
    });
  }
  if (dropped) {
    warnings.push(`Change saturation: dropped ${dropped} unreadable demand act(s); none was repaired into a burden nobody declared`);
  }
  out.sort((a, b) => String(a.fromOn).localeCompare(String(b.fromOn)) || String(a.id).localeCompare(String(b.id)));
  return out.length > CHANGE_SATURATION_LIMITS.acts ? out.slice(out.length - CHANGE_SATURATION_LIMITS.acts) : out;
}

/* ------------------------------------------------------------------ ceilings */

/**
 * Validate one capacity declaration. A ceiling is a whole number of CONCURRENT
 * weight units — the unit the load is measured in — for a dated window, over a
 * named subject. There is no default, no unit and no derived ceiling: this is the
 * one place a capacity enters the record, and it is a human's sentence.
 */
/**
 * Who counts as a pool: anybody a line runs. A home-line manager (the roster's
 * `managerId`) and a manager who holds an DECLARED matrix line over someone are both
 * a pool, because in a matrix the project line puts real change on real people and
 * is exactly the span that needs bounding. A pool with nobody in it is a ceiling
 * over nothing, and a ceiling over nothing is refused rather than filed.
 */
export function poolHasMembers(state, managerId) {
  if (!managerId) return false;
  const people = Array.isArray(state?.people) ? state.people : [];
  if (people.some((p) => p && p.id !== managerId && p.managerId === managerId && p.status !== 'archived')) return true;
  const lines = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  return lines.some((line) => line
    && line.managerId === managerId
    && line.personId !== managerId
    && !line.toISO
    && people.some((p) => p && p.id === line.personId && p.status !== 'archived'));
}

export function validateChangeCeiling(state, input, { today = null, idFactory = null, allowPassedWindow = false } = {}) {
  const refusals = [];
  const src = isPlainObject(input) ? input : {};

  const scope = str(src.scope);
  if (!SCOPES.has(scope)) refusals.push('unknown-scope');

  const subjectId = str(src.subjectId);
  const people = Array.isArray(state?.people) ? state.people : [];
  if (!subjectId) refusals.push('missing-subject');
  else {
    const subject = people.find((p) => p && p.id === subjectId) || null;
    // A pool ceiling is declared over a manager; a person ceiling over a person.
    // Both must exist on the roster, and an archived subject has no forward capacity
    // to bound — their history stays in the demand ledger, which is where it belongs.
    if (!subject || subject.status === 'archived') refusals.push('off-roster-subject');
    else if (scope === 'pool' && !poolHasMembers(state, subject.id)) {
      refusals.push('missing-subject');
    }
  }

  const units = src.units;
  if (!Number.isInteger(units)) refusals.push('band-not-whole');
  else if (units < 1 || units > 100) refusals.push('band-out-of-range');

  const fromOn = saturationDay(src.fromOn);
  const toOn = saturationDay(src.toOn);
  if (!fromOn || !toOn) refusals.push('bad-day');
  if (fromOn && toOn) {
    if (toOn < fromOn) refusals.push('reversed-window');
    // A ceiling may not be BORN already expired — that state is produced by time
    // passing, which is the only thing that can honestly retire a limit. The door
    // refuses it; the loader must keep it, or the day after a ceiling's window
    // ends the record of what was agreed would vanish from the workspace and the
    // register would print nobody's expired limit as no limit at all.
    if (today && toOn < today && !allowPassedWindow) refusals.push('window-passed');
  }

  const ceilings = Array.isArray(state?.changeSaturationCeilings) ? state.changeSaturationCeilings : [];
  if (scope && subjectId && fromOn && toOn && ceilings.some((c) => c && !c.retired && c.scope === scope && c.subjectId === subjectId
    && c.fromOn <= toOn && c.toOn >= fromOn)) {
    refusals.push('overlapping-ceiling');
  }
  if (ceilings.length >= CHANGE_SATURATION_LIMITS.ceilings) refusals.push('ledger-full');

  if (refusals.length) return { refusals: [...new Set(refusals)], ceiling: null };

  return {
    refusals: [],
    ceiling: {
      id: idFactory ? idFactory('csc') : `csc-${Math.random().toString(36).slice(2, 10)}`,
      scope,
      subjectId,
      units,
      fromOn,
      toOn,
      note: str(src.note).slice(0, CHANGE_SATURATION_LIMITS.noteMax),
    },
  };
}

/** Load stored capacity declarations. Refusals are counted, never repaired. */
export function normalizeChangeSaturationCeilings(raw, state, today, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const item of arr) {
    if (!isPlainObject(item)) { dropped += 1; continue; }
    const id = str(item.id).slice(0, 80);
    if (!id || seen.has(id)) { dropped += 1; continue; }
    const { refusals, ceiling } = validateChangeCeiling(state, {
      scope: item.scope,
      subjectId: item.subjectId,
      units: item.units,
      fromOn: item.fromOn,
      toOn: item.toOn,
      note: item.note,
    }, { today, allowPassedWindow: true });
    // Every refusal is counted and none is repaired; only `window-passed` is a
    // state time produced rather than a malformation, so the validator is asked
    // to allow it here and the reader prints the row as expired history.
    if (refusals.length) {
      dropped += 1;
      continue;
    }
    seen.add(id);
    const retired = item.retired === true && Boolean(saturationDay(item.retiredOn));
    out.push({
      ...ceiling,
      id,
      note: str(item.note).slice(0, CHANGE_SATURATION_LIMITS.noteMax),
      declaredOn: saturationDay(item.declaredOn) || saturationDay(item.at) || ceiling.fromOn,
      declaredById: str(item.declaredById).slice(0, 80) || null,
      retired,
      retiredOn: retired ? saturationDay(item.retiredOn) : null,
      retiredById: retired ? (str(item.retiredById).slice(0, 80) || null) : null,
      retiredNote: retired ? (str(item.retiredNote).slice(0, CHANGE_SATURATION_LIMITS.noteMax) || '') : '',
      at: isoOrNull(item.at) || `${ceiling.fromOn}T00:00:00.000Z`,
    });
  }
  if (dropped) {
    warnings.push(`Change saturation: dropped ${dropped} unreadable capacity declaration(s); a ceiling is a whole number of concurrent units over a named subject for a dated window`);
  }
  out.sort((a, b) => String(a.fromOn).localeCompare(String(b.fromOn)) || String(a.id).localeCompare(String(b.id)));
  return out.length > CHANGE_SATURATION_LIMITS.ceilings ? out.slice(out.length - CHANGE_SATURATION_LIMITS.ceilings) : out;
}

/** RULE-CSA-01's bounded idempotency ledger. Same shape as every other rule marker. */
export function normalizeChangeSaturationMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    if (!isPlainObject(item)) continue;
    const key = str(item.key).slice(0, 320);
    if (!key || seen.has(key)) continue;
    const kind = item.kind === 'ask' || item.kind === 'observation' ? item.kind : null;
    if (!kind) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      subject: str(item.subject).slice(0, 160),
      taskId: str(item.taskId).slice(0, 80) || null,
      state: str(item.state).slice(0, 24),
      summary: str(item.summary).slice(0, 280),
      at: isoOrNull(item.at),
    });
  }
  const cap = CHANGE_SATURATION_LIMITS.markers;
  return out.length > cap ? out.slice(out.length - cap) : out;
}

/**
 * The ceilings in force on `day`, grouped by subject. Exported so the reader and
 * the rule cannot disagree about which capacity statement governs, and so a
 * subject with two live, disagreeing ceilings is discoverable as one thing:
 * `ceiling-conflict`, never a silently chosen minimum.
 */
export function liveChangeCeilings(ceilings, day) {
  const map = new Map();
  for (const row of Array.isArray(ceilings) ? ceilings : []) {
    if (!row || row.retired) continue;
    if (day && (row.fromOn > day || row.toOn < day)) continue;
    const key = `${row.scope}:${row.subjectId}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  for (const list of map.values()) list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return map;
}
