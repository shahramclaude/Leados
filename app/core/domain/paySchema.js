/**
 * app/core/domain/paySchema.js — the stored contract for Schema v51.
 *
 * `pay.js` is the analytics; this module decides what a half-written, hand-edited
 * or hostile pay record is allowed to become on load. Pay records are the most
 * sensitive ordinary data in this workspace, so the rules here are deliberately
 * narrower than elsewhere in LeadOS:
 *
 *  - A pay amount must be a positive finite number. It is never defaulted,
 *    never inferred from a band midpoint, and never copied from another person.
 *    A record that cannot be read is dropped with a warning, not repaired into
 *    something plausible.
 *  - A band must be a real range: 0 < minimum ≤ midpoint ≤ maximum. A band that
 *    is not a range is dropped, because every placement figure derived from it
 *    would be meaningless.
 *  - A dangling person pointer is cleared, never re-pointed.
 *  - A filed audit's frozen snapshot is preserved exactly. Re-deriving it from
 *    today's pay would rewrite the assessment that was filed, which is the one
 *    thing a filed assessment exists to prevent.
 *  - A committed merit round keeps its frozen projection; its status cannot be
 *    inferred from the presence of a settlement.
 *  - Group membership accepts only the declared vocabulary, and an unrecognised
 *    value becomes `unrecorded` — never guessed.
 */

import { dayKey, daysBetween, addDays } from '../time.js';
import {
  DEFAULT_MERIT_MATRIX,
  EUR_DIRECTIVE_JPA_GAP_PCT,
  MERIT_ROUND_STATUSES,
  PAY_AUDIT_STATUSES,
  PAY_CONTRAST_GROUPS,
  PAY_GROUP_BY_ID,
  PAY_GROUP_IDS,
  PAY_REASON_IDS,
  PAY_STALE_DAYS_DEFAULT,
} from './payVocabulary.js';
import { LEVELS } from '../schema.js';

export const PAY_MAX_NOTE = 600;
export const PAY_MAX_LABEL = 120;
export const PAY_MAX_FAMILY = 80;
export const PAY_MAX_AMOUNT = 100000000;
export const PAY_SNAPSHOT_VERSION = 1;
export const PAY_MIN_WAGE_FLOOR = 1;

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function cleanText(value, max) {
  return str(value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** A pay amount, or null. Positive, finite, bounded, rounded to whole units. */
export function amountOrNull(value) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > PAY_MAX_AMOUNT) return null;
  return Math.round(n * 100) / 100;
}

function currencyOrNull(value) {
  const raw = str(value).trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

/** Group ids are a closed vocabulary; anything else is `unrecorded`, never guessed. */
export function normalizePayGroup(value) {
  const raw = str(value).trim().toLowerCase();
  if (PAY_GROUP_IDS.includes(raw)) return raw;
  return 'unrecorded';
}

/* ------------------------------------------------------------------- bands */

export function normalizePayBands(raw, state, now, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  let droppedRange = 0;
  let droppedShape = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isPlainObject(row)) { droppedShape += 1; continue; }
    const id = str(row.id).trim() || `payband-${i}`;
    const family = cleanText(row.family, PAY_MAX_FAMILY);
    const level = LEVELS.includes(str(row.level)) ? str(row.level) : null;
    const currency = currencyOrNull(row.currency);
    const min = amountOrNull(row.min);
    const mid = amountOrNull(row.mid);
    const max = amountOrNull(row.max);
    const effectiveFrom = day(row.effectiveFrom);
    if (!family || !level || !currency || !effectiveFrom) { droppedShape += 1; continue; }
    if (min === null || mid === null || max === null || !(min <= mid && mid <= max)) { droppedRange += 1; continue; }
    if (seen.has(id)) { droppedShape += 1; continue; }
    seen.add(id);
    out.push({
      id,
      family,
      level,
      currency,
      min,
      mid,
      max,
      effectiveFrom,
      note: cleanText(row.note, PAY_MAX_NOTE),
      createdAt: isoOrNull(row.createdAt) || now,
      updatedAt: isoOrNull(row.updatedAt) || isoOrNull(row.createdAt) || now,
    });
  }
  if (droppedRange) warnings.push(`Pay bands: dropped ${droppedRange} band(s) that were not a valid minimum ≤ midpoint ≤ maximum range`);
  if (droppedShape) warnings.push(`Pay bands: dropped ${droppedShape} band(s) with an unrecognised level, currency or effective date`);
  return out;
}

/* ------------------------------------------------------------- assignments */

export function normalizePayAssignments(raw, state, now, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const peopleIds = new Set((state?.people || []).map((person) => person && person.id).filter(Boolean));
  const out = [];
  const seen = new Set();
  let droppedPerson = 0;
  let droppedShape = 0;
  let droppedDuplicate = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isPlainObject(row)) { droppedShape += 1; continue; }
    const id = str(row.id).trim() || `payassign-${i}`;
    const personId = str(row.personId).trim();
    if (!personId || !peopleIds.has(personId)) { droppedPerson += 1; continue; }
    const base = amountOrNull(row.base);
    const currency = currencyOrNull(row.currency);
    const effectiveFrom = day(row.effectiveFrom);
    const family = cleanText(row.family, PAY_MAX_FAMILY);
    const level = LEVELS.includes(str(row.level)) ? str(row.level) : null;
    if (base === null || !currency || !effectiveFrom || !level) { droppedShape += 1; continue; }
    const variableRaw = row.variableTargetPct;
    const variable = variableRaw === null || variableRaw === undefined || variableRaw === ''
      ? null
      : Math.min(100, Math.max(0, Math.round(Number(variableRaw) * 10) / 10));
    const key = `${personId}|${effectiveFrom}|${currency}`;
    if (seen.has(key)) { droppedDuplicate += 1; continue; }
    seen.add(key);
    out.push({
      id,
      personId,
      family,
      level,
      currency,
      base,
      variableTargetPct: Number.isFinite(variable) ? variable : null,
      effectiveFrom,
      reason: PAY_REASON_IDS.includes(str(row.reason)) ? str(row.reason) : 'other',
      note: cleanText(row.note, PAY_MAX_NOTE),
      recordedOn: day(row.recordedOn) || dayKey(now),
      createdAt: isoOrNull(row.createdAt) || now,
    });
  }
  if (droppedPerson) warnings.push(`Pay records: dropped ${droppedPerson} record(s) pointing at a person who is not in the roster`);
  if (droppedShape) warnings.push(`Pay records: dropped ${droppedShape} record(s) without a positive amount, currency, level or effective date`);
  if (droppedDuplicate) warnings.push(`Pay records: dropped ${droppedDuplicate} duplicate record(s) for the same person, currency and effective date — one effective pay rate per person per date`);
  return out;
}

/* --------------------------------------------------------------- snapshots */

function pctOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(100000, Math.max(-100000, n)) * 100) / 100;
}

/** A frozen audit snapshot. Validated for shape, preserved exactly, never re-derived. */
export function normalizePaySnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const status = str(raw.status) === 'ok' ? 'ok' : 'insufficient';
  const base = {
    version: PAY_SNAPSHOT_VERSION,
    status,
    capturedAt: isoOrNull(raw.capturedAt) || null,
    asOf: day(raw.asOf) || null,
    currency: currencyOrNull(raw.currency) || null,
    groupA: PAY_CONTRAST_GROUPS.includes(str(raw.groupA)) ? str(raw.groupA) : 'group-a',
    groupB: PAY_CONTRAST_GROUPS.includes(str(raw.groupB)) ? str(raw.groupB) : 'group-b',
    groupALabel: cleanText(raw.groupALabel, 60) || 'Group A',
    groupBLabel: cleanText(raw.groupBLabel, 60) || 'Group B',
    triggerPct: pctOrNull(raw.triggerPct) ?? EUR_DIRECTIVE_JPA_GAP_PCT,
    n: Math.max(0, Math.round(Number(raw.n) || 0)),
    nA: Math.max(0, Math.round(Number(raw.nA) || 0)),
    nB: Math.max(0, Math.round(Number(raw.nB) || 0)),
    reason: cleanText(raw.reason, 600),
    frozen: true,
  };
  if (status !== 'ok') return base;
  const controlsUsed = Array.isArray(raw.controlsUsed)
    ? raw.controlsUsed.filter((key) => ['level', 'family', 'tenure'].includes(str(key)))
    : [];
  const controlLabels = Array.isArray(raw.controlLabels)
    ? raw.controlLabels.map((label) => cleanText(label, 80)).filter(Boolean).slice(0, 8)
    : [];
  const ci = isPlainObject(raw.adjustedCiPct)
    ? {
        low: pctOrNull(raw.adjustedCiPct.low),
        high: pctOrNull(raw.adjustedCiPct.high),
        level: 0.95,
      }
    : null;
  const flagged = Array.isArray(raw.flaggedCategories)
    ? raw.flaggedCategories.filter(isPlainObject).slice(0, 24).map((row) => ({
        level: str(row.level),
        label: cleanText(row.label, 60),
        nA: Math.max(0, Math.round(Number(row.nA) || 0)),
        nB: Math.max(0, Math.round(Number(row.nB) || 0)),
        gapPct: pctOrNull(row.gapPct),
      }))
    : [];
  const quartiles = Array.isArray(raw.quartiles)
    ? raw.quartiles.filter(isPlainObject).slice(0, 8).map((row) => ({
        quartile: Math.max(1, Math.min(9, Math.round(Number(row.quartile) || 1))),
        headcount: Math.max(0, Math.round(Number(row.headcount) || 0)),
        shareAPct: pctOrNull(row.shareAPct),
        shareBPct: pctOrNull(row.shareBPct),
      }))
    : [];
  return {
    ...base,
    controlsUsed,
    controlLabels,
    df: Math.max(0, Math.round(Number(raw.df) || 0)),
    k: Math.max(0, Math.round(Number(raw.k) || 0)),
    r2: Number.isFinite(Number(raw.r2)) ? Math.round(Number(raw.r2) * 1000) / 1000 : null,
    rawGapPct: pctOrNull(raw.rawGapPct),
    adjustedGapPct: pctOrNull(raw.adjustedGapPct),
    adjustedCiPct: ci,
    pValue: Number.isFinite(Number(raw.pValue)) ? Math.round(Number(raw.pValue) * 1000) / 1000 : null,
    significant: raw.significant === true,
    meetsThreshold: raw.meetsThreshold === true,
    requiresJointAssessment: flagged.length > 0,
    flaggedCategories: flagged,
    quartiles,
    means: isPlainObject(raw.means)
      ? {
          groupA: amountOrNull(raw.means.groupA),
          groupB: amountOrNull(raw.means.groupB),
          overall: amountOrNull(raw.means.overall),
        }
      : null,
    droppedBecause: cleanText(raw.droppedBecause, 400) || null,
  };
}

/* ------------------------------------------------------------------- audits */

export function normalizePayAudits(raw, state, now, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const peopleIds = new Set((state?.people || []).map((person) => person && person.id).filter(Boolean));
  const out = [];
  const seen = new Set();
  let repaired = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isPlainObject(row)) continue;
    const id = str(row.id).trim() || `payaudit-${i}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const status = PAY_AUDIT_STATUSES.includes(str(row.status)) ? str(row.status) : 'draft';
    const filedOn = status === 'filed' ? day(row.filedOn) : null;
    const byId = str(row.byId).trim();
    if (status === 'filed' && !filedOn) {
      // A filed audit without a filing date is not a record of an assessment.
      repaired += 1;
      continue;
    }
    out.push({
      id,
      label: cleanText(row.label, PAY_MAX_LABEL) || 'Pay equity audit',
      status,
      currency: currencyOrNull(row.currency),
      groupA: PAY_CONTRAST_GROUPS.includes(str(row.groupA)) ? str(row.groupA) : 'woman',
      groupB: PAY_CONTRAST_GROUPS.includes(str(row.groupB)) ? str(row.groupB) : 'man',
      controls: {
        level: row.controls?.level !== false,
        family: row.controls?.family !== false,
        tenure: row.controls?.tenure !== false,
      },
      snapshot: status === 'filed' ? normalizePaySnapshot(row.snapshot) : null,
      filedOn,
      byId: byId && peopleIds.has(byId) ? byId : null,
      note: cleanText(row.note, PAY_MAX_NOTE),
      createdAt: isoOrNull(row.createdAt) || now,
      updatedAt: isoOrNull(row.updatedAt) || now,
    });
  }
  if (repaired) warnings.push(`Pay audits: dropped ${repaired} filed audit(s) with no filing date`);
  return out;
}

/* -------------------------------------------------------------- merit rounds */

function normalizeMatrix(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const out = { ...DEFAULT_MERIT_MATRIX };
  for (const key of Object.keys(DEFAULT_MERIT_MATRIX)) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) out[key] = Math.min(3, Math.max(0, Math.round(value * 1000) / 1000));
  }
  return out;
}

function normalizeRoundSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    version: PAY_SNAPSHOT_VERSION,
    capturedAt: isoOrNull(raw.capturedAt) || null,
    currency: currencyOrNull(raw.currency) || null,
    payroll: amountOrNull(raw.payroll),
    cost: amountOrNull(raw.cost),
    envelopePct: Number.isFinite(Number(raw.envelopePct)) ? Math.round(Number(raw.envelopePct) * 100) / 100 : null,
    envelopeAmount: amountOrNull(raw.envelopeAmount),
    headcount: Math.max(0, Math.round(Number(raw.headcount) || 0)),
    belowMinBefore: Math.max(0, Math.round(Number(raw.belowMinBefore) || 0)),
    belowMinAfter: Math.max(0, Math.round(Number(raw.belowMinAfter) || 0)),
    gapBeforePct: Number.isFinite(Number(raw.gapBeforePct)) ? Math.round(Number(raw.gapBeforePct) * 100) / 100 : null,
    gapAfterPct: Number.isFinite(Number(raw.gapAfterPct)) ? Math.round(Number(raw.gapAfterPct) * 100) / 100 : null,
    rounded: true,
  };
}

export function normalizeMeritRounds(raw, state, now, warnings) {
  const rows = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isPlainObject(row)) continue;
    const id = str(row.id).trim() || `meritround-${i}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const status = MERIT_ROUND_STATUSES.includes(str(row.status)) ? str(row.status) : 'declared';
    const basePctRaw = Number(row.basePct);
    out.push({
      id,
      label: cleanText(row.label, PAY_MAX_LABEL) || 'Merit round',
      currency: currencyOrNull(row.currency),
      basePct: Number.isFinite(basePctRaw) ? Math.min(100, Math.max(0, Math.round(basePctRaw * 100) / 100)) : 0,
      envelopePct: Number.isFinite(Number(row.envelopePct)) ? Math.min(100, Math.max(0, Math.round(Number(row.envelopePct) * 100) / 100)) : null,
      matrix: normalizeMatrix(row.matrix),
      status,
      snapshot: status === 'committed' ? normalizeRoundSnapshot(row.snapshot) : null,
      committedOn: status === 'committed' ? day(row.committedOn) : null,
      note: cleanText(row.note, PAY_MAX_NOTE),
      createdAt: isoOrNull(row.createdAt) || now,
      updatedAt: isoOrNull(row.updatedAt) || now,
    });
  }
  return out;
}

/* ------------------------------------------------------------ settings keys */

export const PAY_SETTING_DEFAULTS = Object.freeze({
  payGapTriggerPct: EUR_DIRECTIVE_JPA_GAP_PCT,
  payStaleDays: PAY_STALE_DAYS_DEFAULT,
  payEnvelopePct: 3,
  payJobEvaluationOn: null,
  payInformationRouteOn: null,
  payAutoPropagate: true,
});

/**
 * Attestations are stored as settings because they are two dated facts about
 * process, not records with their own lifecycle. A date in the future is refused:
 * an attestation cannot be made before the work happened.
 */
export function normalizePaySettings(raw, now = new Date()) {
  const source = isPlainObject(raw) ? raw : {};
  const today = dayKey(now);
  const trigger = Number(source.payGapTriggerPct);
  const stale = Number(source.payStaleDays);
  const envelope = Number(source.payEnvelopePct);
  const jobOn = day(source.payJobEvaluationOn);
  const infoOn = day(source.payInformationRouteOn);
  return {
    payGapTriggerPct: Number.isFinite(trigger) ? Math.min(50, Math.max(0.5, Math.round(trigger * 10) / 10)) : PAY_SETTING_DEFAULTS.payGapTriggerPct,
    payStaleDays: Number.isFinite(stale) ? Math.min(3650, Math.max(30, Math.round(stale))) : PAY_SETTING_DEFAULTS.payStaleDays,
    payEnvelopePct: Number.isFinite(envelope) ? Math.min(100, Math.max(0, Math.round(envelope * 10) / 10)) : PAY_SETTING_DEFAULTS.payEnvelopePct,
    payJobEvaluationOn: jobOn && jobOn <= today ? jobOn : null,
    payInformationRouteOn: infoOn && infoOn <= today ? infoOn : null,
    payAutoPropagate: source.payAutoPropagate !== false,
  };
}

/** True when a band range is internally valid — used by the action boundary too. */
export function isValidBandRange(min, mid, max) {
  const a = Number(min);
  const b = Number(mid);
  const c = Number(max);
  return Number.isFinite(a) && Number.isFinite(b) && Number.isFinite(c) && a > 0 && a <= b && b <= c && c <= PAY_MAX_AMOUNT;
}

/** Convenience: the last N days as a day key range, used by the UI filter. */
export function payWindow(from, days) {
  const start = day(from) || dayKey(new Date());
  return { start, end: addDays(start, Math.max(1, days)), days: daysBetween(start, addDays(start, Math.max(1, days))) };
}

export { PAY_GROUP_BY_ID };
