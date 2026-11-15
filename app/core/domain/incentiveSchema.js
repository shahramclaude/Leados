/**
 * app/core/domain/incentiveSchema.js — the fail-closed loaders of the
 * Variable-Pay Design & Incentive Integrity Register (ADR-0220, Schema v174).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a ceiling, completes a target, re-dates a period,
 * re-points an award at another measure, or rescues a currency. A row that
 * cannot be read exactly is DROPPED with a counted warning, and the screen
 * prints the count.
 *
 * MONEY IS NEVER RE-PARSED FROM ITS OWN STORED FORM. The two directions have two
 * different functions and neither is ever called for the other:
 *
 *   `readStoredCents(value)`       — stored form: a non-negative SAFE INTEGER of
 *                                    cents. A decimal point, a sign, an exponent
 *                                    or a comma is refused.
 *   `parseMoneyInputToCents(text)` — human input: major units as a decimal
 *                                    string, at most two places. The
 *                                    multiplication by 100 happens exactly once,
 *                                    on the way in.
 *
 * A COUNT AND AN AMOUNT NEVER SHARE A FIELD. A `count` measure stores
 * `targetCount` and its readings store `actualCount`; a `money` measure stores
 * `targetCents` and `actualCents`. The reading loader is given the measures so
 * it can refuse a reading that carries the wrong field for its measure — a
 * reading with no unit is not a small number, it is an unreadable row.
 *
 * AN AWARD THAT NAMES A MEASURE IS NOT RE-POINTED. If the measure it names has
 * been dropped by its own loader, the award is kept and the reader marks it
 * `measure-missing`; dropping the award would silently remove money from the
 * register's own coverage, which is the failure this module exists to prevent.
 *
 * TWO PLANS ON ONE FUNDING LINE WITH OVERLAPPING WINDOWS ARE AN AMBIGUITY, NOT A
 * LATEST-WINS. The loader drops the later row with a counted warning, because
 * two envelopes over one period make every "within ceiling" claim a matter of
 * which row was read first.
 */

import { dayKey } from '../time.js';
import {
  INC_BASIS_KEYS,
  INC_CONTROL_KEYS,
  INC_DIRECTION_KEYS,
  INC_LIMITS as L,
  INC_RECOVERY_KIND_KEYS,
  INC_RECOVERY_STATE_KEYS,
  INC_SETTING_KEYS,
  INC_DEFAULTS,
  INC_UNIT_KEYS,
  incMeasureKey,
  incPeriodsOverlap,
} from './incentiveRegistry.js';

/** A real calendar day inside the register's range, or null. */
export function incDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Whole days between two calendar days, or null. */
export function incDaysBetween(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function incText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Uppercase ISO-style code, exactly three letters, or null. */
export function incCurrency(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/** A stored whole number of cents, or null. Never parsed as a string. */
export function readStoredCents(value) {
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0 || value > L.centsMax) return null;
  return value;
}

/** A stored whole count, or null. */
export function readStoredCount(value) {
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0 || value > L.countMax) return null;
  return value;
}

/**
 * HUMAN money input in major units, converted exactly once, in integer
 * arithmetic, with no floating point anywhere:
 *
 *   "1250000.00" → 125000000
 *   "12.5"       → 1250
 *   "12.505"     → null   (a third decimal place is a different amount)
 *   "-1", "1e3", "1,000", "" → null
 */
export function parseMoneyInputToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = /^(\d{1,15})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const whole = match[1];
  const fraction = (match[2] || '').padEnd(2, '0');
  const cents = BigInt(whole) * 100n + BigInt(fraction);
  if (cents > BigInt(L.centsMax)) return null;
  return Number(cents);
}

/** A whole count from a form: digits only, never a decimal and never a sign. */
export function parseCountInput(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= L.countMax ? value : null;
  }
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!/^\d{1,9}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 && n <= L.countMax ? n : null;
}

/** Exact cents as major units, without floating point. 1250 → "12.50". */
export function centsToMajorText(cents) {
  const value = readStoredCents(cents);
  if (value === null) return '';
  const abs = BigInt(value);
  const major = abs / 100n;
  const rest = String(abs % 100n).padStart(2, '0');
  return `${major.toString()}.${rest}`;
}

/** Exact cents with thousands separators. 123456789 → "1,234,567.89". */
export function centsToDisplay(cents) {
  const text = centsToMajorText(cents);
  if (!text) return '';
  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction}`;
}

/* -------------------------------------------------------------------- plans */

/**
 * Load stored plans. A plan is one funding line's declared envelope for a
 * period in one currency, with a written basis and a named declarer.
 */
export function normalizeIncPlans(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  let overlapping = 0;
  list.forEach((raw, index) => {
    if (index >= L.plans) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = incText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const label = incText(raw.label, L.labelMax);
    if (label.length < L.labelMin) { dropped += 1; return; }
    const ownerId = incText(raw.ownerId, L.idMax);
    if (!ownerId) { dropped += 1; return; }
    const currency = incCurrency(raw.currency);
    if (!currency) { dropped += 1; return; }
    const ceilingCents = readStoredCents(raw.ceilingCents);
    if (ceilingCents === null || ceilingCents <= 0) { dropped += 1; return; }
    const periodFrom = incDay(raw.periodFrom);
    const periodTo = incDay(raw.periodTo);
    if (!periodFrom || !periodTo || periodTo <= periodFrom) { dropped += 1; return; }
    const span = incDaysBetween(periodFrom, periodTo);
    if (span === null || span > L.periodMaxDays) { dropped += 1; return; }
    const declaredOn = incDay(raw.declaredOn);
    if (!declaredOn) { dropped += 1; return; }
    const declaredById = incText(raw.declaredById, L.idMax);
    if (!declaredById) { dropped += 1; return; }
    const basis = incText(raw.basis, L.textMax);
    if (basis.length < L.textMin) { dropped += 1; return; }

    // Retirement is all three fields or none. Half a retirement is unreadable.
    const retiredOnRaw = raw.retiredOn === undefined || raw.retiredOn === null || raw.retiredOn === '' ? null : raw.retiredOn;
    const retiredByIdRaw = raw.retiredById === undefined || raw.retiredById === null ? '' : incText(raw.retiredById, L.idMax);
    const retirementReasonRaw = raw.retirementReason === undefined || raw.retirementReason === null ? '' : incText(raw.retirementReason, L.textMax);
    let retiredOn = null;
    let retiredById = '';
    let retirementReason = '';
    if (retiredOnRaw !== null || retiredByIdRaw || retirementReasonRaw) {
      retiredOn = incDay(retiredOnRaw);
      if (!retiredOn || retiredOn < declaredOn) { dropped += 1; return; }
      if (!retiredByIdRaw || retirementReasonRaw.length < L.textMin) { dropped += 1; return; }
      retiredById = retiredByIdRaw;
      retirementReason = retirementReasonRaw;
    }

    // One live envelope per (funding line, currency, overlapping window). Two
    // envelopes over one period make every ceiling claim ambiguous, so the later
    // row is dropped and the ambiguity counted.
    if (retiredOn === null) {
      const clash = kept.some((row) => row.retiredOn === null
        && row.ownerId === ownerId
        && row.currency === currency
        && incPeriodsOverlap(
          { from: row.periodFrom, to: row.periodTo },
          { from: periodFrom, to: periodTo },
        ));
      if (clash) { overlapping += 1; return; }
    }

    seenIds.add(id);
    kept.push({
      id, label, ownerId, currency, ceilingCents, periodFrom, periodTo,
      declaredOn, declaredById, basis, retiredOn, retiredById, retirementReason,
    });
  });
  if (dropped || overlapping) {
    warnings.push(
      `Incentive plans: refused ${dropped} unreadable or duplicate row(s)`
      + `${overlapping ? ` and ${overlapping} second live envelope overlapping one funding line, currency and window` : ''}`
      + '; no ceiling, period or currency was repaired.',
    );
  }
  return kept;
}

/* ----------------------------------------------------------------- measures */

/**
 * Load stored measures. A measure is one outcome a plan pays on, with a
 * declared direction, unit, exact target and declared control.
 */
export function normalizeIncMeasures(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  let duplicateKey = 0;
  list.forEach((raw, index) => {
    if (index >= L.measures) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = incText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const planId = incText(raw.planId, L.idMax);
    if (!planId) { dropped += 1; return; }
    const key = incMeasureKey(raw.key);
    if (!key || key.length < L.keyMin) { dropped += 1; return; }
    const label = incText(raw.label, L.labelMax);
    if (label.length < L.labelMin) { dropped += 1; return; }
    const direction = INC_DIRECTION_KEYS.includes(raw.direction) ? raw.direction : null;
    if (!direction) { dropped += 1; return; }
    const unit = INC_UNIT_KEYS.includes(raw.unit) ? raw.unit : null;
    if (!unit) { dropped += 1; return; }
    const money = unit === 'money';
    const targetCents = money ? readStoredCents(raw.targetCents) : null;
    const targetCount = money ? null : readStoredCount(raw.targetCount);
    if (money ? (targetCents === null || targetCents <= 0) : (targetCount === null || targetCount <= 0)) { dropped += 1; return; }
    if (money && raw.targetCount !== undefined && raw.targetCount !== null) { dropped += 1; return; }
    if (!money && raw.targetCents !== undefined && raw.targetCents !== null) { dropped += 1; return; }
    const control = INC_CONTROL_KEYS.includes(raw.control) ? raw.control : null;
    if (!control) { dropped += 1; return; }

    // One key per plan: two measures with one key inside a plan would make the
    // "paid on this outcome" count a matter of which row was read.
    if (kept.some((row) => row.planId === planId && row.key === key)) { duplicateKey += 1; return; }
    seenIds.add(id);
    kept.push({ id, planId, key, label, direction, unit, targetCents, targetCount, control });
  });
  if (dropped || duplicateKey) {
    warnings.push(
      `Incentive measures: refused ${dropped} unreadable or duplicate row(s)`
      + `${duplicateKey ? ` and ${duplicateKey} second measure sharing one key inside a plan` : ''}`
      + '; no target, direction or unit was repaired.',
    );
  }
  return kept;
}

/* ----------------------------------------------------------------- readings */

/**
 * Load stored readings. A reading is verified evidence about ONE measure: the
 * actual figure on a day, by whom it was verified, on what evidence.
 *
 * This loader is given the measures because the measure's UNIT decides which
 * field the actual belongs in. A reading that carries the count field for a
 * money measure is not a small amount; it is an unreadable row.
 */
export function normalizeIncReadings(value, measures, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const byId = new Map((Array.isArray(measures) ? measures : []).map((row) => [row.id, row]));
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  let orphan = 0;
  list.forEach((raw, index) => {
    if (index >= L.readings) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = incText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const measureId = incText(raw.measureId, L.idMax);
    if (!measureId) { dropped += 1; return; }
    const measure = byId.get(measureId) || null;
    // A reading whose measure did not survive its own loader has no unit, so its
    // figure cannot be verified against anything. It is dropped and COUNTED,
    // rather than guessed into the money field.
    if (!measure) { orphan += 1; return; }
    const money = measure.unit === 'money';
    const actualCents = money ? readStoredCents(raw.actualCents) : null;
    const actualCount = money ? null : readStoredCount(raw.actualCount);
    if (money ? actualCents === null : actualCount === null) { dropped += 1; return; }
    if (money && raw.actualCount !== undefined && raw.actualCount !== null) { dropped += 1; return; }
    if (!money && raw.actualCents !== undefined && raw.actualCents !== null) { dropped += 1; return; }
    const asOf = incDay(raw.asOf);
    if (!asOf) { dropped += 1; return; }
    const verifiedById = incText(raw.verifiedById, L.idMax);
    if (!verifiedById) { dropped += 1; return; }
    const verifiedOn = incDay(raw.verifiedOn);
    if (!verifiedOn) { dropped += 1; return; }
    const evidenceKind = incText(raw.evidenceKind, 40);
    const evidenceId = incText(raw.evidenceId, L.idMax);
    const note = incText(raw.note, L.textMax);

    // A restatement is all three fields or none: the row it restates, the day of
    // the restatement and the written reason. Half a restatement is unreadable.
    const restatesIdRaw = raw.restatesId === undefined || raw.restatesId === null ? '' : incText(raw.restatesId, L.idMax);
    const restatementReasonRaw = raw.restatementReason === undefined || raw.restatementReason === null ? '' : incText(raw.restatementReason, L.textMax);
    let restatesId = '';
    let restatementReason = '';
    if (restatesIdRaw || restatementReasonRaw) {
      if (!restatesIdRaw || restatementReasonRaw.length < L.textMin) { dropped += 1; return; }
      if (restatesIdRaw === id) { dropped += 1; return; }
      restatesId = restatesIdRaw;
      restatementReason = restatementReasonRaw;
    }

    seenIds.add(id);
    kept.push({
      id, measureId, actualCents, actualCount, asOf, verifiedById, verifiedOn,
      evidenceKind, evidenceId, note, restatesId, restatementReason,
    });
  });
  if (dropped || orphan) {
    warnings.push(
      `Incentive readings: refused ${dropped} unreadable or duplicate row(s)`
      + `${orphan ? ` and ${orphan} reading(s) whose measure is no longer readable` : ''}`
      + '; no figure, unit or verification was repaired.',
    );
  }
  return kept;
}

/* ------------------------------------------------------------------- awards */

/**
 * Load stored awards. An award records money decided for ONE person under ONE
 * plan, on a measured basis (which names its measure) or a written
 * discretionary basis (which need not).
 */
export function normalizeIncAwards(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  list.forEach((raw, index) => {
    if (index >= L.awards) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = incText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const planId = incText(raw.planId, L.idMax);
    if (!planId) { dropped += 1; return; }
    const personId = incText(raw.personId, L.idMax);
    if (!personId) { dropped += 1; return; }
    const amountCents = readStoredCents(raw.amountCents);
    if (amountCents === null || amountCents <= 0) { dropped += 1; return; }
    const basisKind = INC_BASIS_KEYS.includes(raw.basisKind) ? raw.basisKind : null;
    if (!basisKind) { dropped += 1; return; }
    const measureIdRaw = raw.measureId === undefined || raw.measureId === null ? '' : incText(raw.measureId, L.idMax);
    // A MEASURED award without a measure is not weakly measured, it is
    // unreadable: the whole point of the basis is that a measure stands behind it.
    if (basisKind === 'measured' && !measureIdRaw) { dropped += 1; return; }
    const rationale = incText(raw.rationale, L.textMax);
    if (basisKind === 'discretionary' && rationale.length < L.textMin) { dropped += 1; return; }
    const decidedOn = incDay(raw.decidedOn);
    if (!decidedOn) { dropped += 1; return; }
    const decidedById = incText(raw.decidedById, L.idMax);
    if (!decidedById) { dropped += 1; return; }

    seenIds.add(id);
    kept.push({
      id, planId, measureId: measureIdRaw || null, personId, amountCents,
      basisKind, rationale, decidedOn, decidedById,
    });
  });
  if (dropped) {
    warnings.push(`Incentive awards: refused ${dropped} unreadable or duplicate row(s); no amount, basis, measure or person was repaired.`);
  }
  return kept;
}

/* --------------------------------------------------------------- recoveries */

/**
 * Load stored recovery acts. A recovery is an append-only act against ONE
 * award: the decision that money is owed (`demanded`), the record that money is
 * back or was withheld (`recovered`), or an executive decision not to pursue it
 * (`waived`). A waiver without a reason is unreadable: it would read as an
 * absence rather than a decision.
 */
export function normalizeIncRecoveries(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  let dropped = 0;
  list.forEach((raw, index) => {
    if (index >= L.recoveries) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = incText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const awardId = incText(raw.awardId, L.idMax);
    if (!awardId) { dropped += 1; return; }
    const kind = INC_RECOVERY_KIND_KEYS.includes(raw.kind) ? raw.kind : null;
    if (!kind) { dropped += 1; return; }
    const state = INC_RECOVERY_STATE_KEYS.includes(raw.state) ? raw.state : null;
    if (!state) { dropped += 1; return; }
    const amountCents = readStoredCents(raw.amountCents);
    if (amountCents === null || amountCents <= 0) { dropped += 1; return; }
    const on = incDay(raw.on);
    if (!on) { dropped += 1; return; }
    const byId = incText(raw.byId, L.idMax);
    if (!byId) { dropped += 1; return; }
    const reason = incText(raw.reason, L.textMax);
    if (reason.length < L.textMin) { dropped += 1; return; }

    seenIds.add(id);
    kept.push({ id, awardId, kind, state, amountCents, on, byId, reason });
  });
  if (dropped) {
    warnings.push(`Incentive recoveries: refused ${dropped} unreadable or duplicate row(s); no state, amount or reason was repaired.`);
  }
  return kept;
}

/** Identity-free observations written by the rule. Duplicate keys collapse. */
export function normalizeIncMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const key = incText(raw.key, 240);
    const at = typeof raw.at === 'string' ? raw.at : '';
    const detail = incText(raw.detail, 400);
    if (!key || !at || !detail || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: incText(raw.ruleId, 80) || null, kind: incText(raw.kind, 80) || 'incentive-integrity', detail });
  }
  if (dropped) warnings.push(`Incentive markers: refused ${dropped} unreadable or duplicate marker row(s).`);
  return kept.slice(-L.markers);
}

/* ----------------------------------------------------------------- settings */

/** The module's declared conventions. Only the pause switch exists today. */
export function normalizeIncentiveSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = INC_SETTING_KEYS.autoPropagate;
  return {
    [key]: source[key] === undefined ? INC_DEFAULTS.autoPropagate : Boolean(source[key]),
  };
}

export function readIncSettings({ settings = null } = {}) {
  const raw = normalizeIncentiveSettings(settings || {});
  return { autoPropagate: raw[INC_SETTING_KEYS.autoPropagate] };
}

/* --------------------------------------------------------------- ask links */

export const INC_ASK_PREFIX = 'Incentive integrity:';

export function incAskSummary(signature) {
  return `${INC_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseIncAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(INC_ASK_PREFIX)) return null;
  const signature = raw.slice(INC_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}
