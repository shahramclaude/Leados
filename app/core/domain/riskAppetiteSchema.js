/**
 * app/core/domain/riskAppetiteSchema.js — the fail-closed loaders of the
 * Enterprise Risk Appetite & Tolerance Breach Register (ADR-0219, Schema v173).
 *
 * THE RULE THIS FILE ENFORCES. A stored row is the row its own loader returns.
 * Nothing here repairs a tolerance, completes a stance, re-dates a review,
 * re-points a risk at another case or rescues a currency. A row that cannot be
 * read exactly is DROPPED with a counted warning, and the screen prints the
 * count.
 *
 * MONEY IS NEVER RE-PARSED FROM ITS OWN STORED FORM. This is the defect class
 * Session 280 actually shipped and then had to fix: a stored integer cents value
 * routed back through a major-unit parser multiplies by 100 on every reload, so
 * a 9,500,000.00 ceiling becomes 950,000,000.00 the first time a workspace
 * loads. Here the two directions have two different functions and neither is
 * ever called for the other:
 *
 *   `readStoredCents(value)`      — stored form: a non-negative SAFE INTEGER
 *                                   of cents. Anything with a decimal point,
 *                                   a sign, an exponent or a comma is refused.
 *   `parseMoneyInputToCents(text)` — human input: major units as a decimal
 *                                   string, at most two decimal places, digits
 *                                   only. The multiplication by 100 happens
 *                                   exactly once, on the way in.
 *
 * COUNT AND MONEY NEVER SHARE A FIELD. A count statement stores
 * `toleranceCount`; an exposure statement stores `toleranceCents`. A loader
 * that finds the wrong field for the measure drops the row rather than
 * interpreting the number as the other unit.
 *
 * TWO DECLARATIONS ON THE SAME DAY FOR THE SAME KEY ARE AN AMBIGUITY, NOT A
 * LATEST-WINS. The later row is dropped with a counted warning, because
 * silently choosing one would put a tolerance on the board's table that nobody
 * chose.
 */

import { dayKey } from '../time.js';
import {
  RA_APPETITE_KEYS,
  RA_DOMAIN_KEYS,
  RA_DOMAINS,
  RA_LIMITS as L,
  RA_MEASURE_KEYS,
  RA_SETTING_KEYS,
  RA_DEFAULTS,
  raStatementKey,
} from './riskAppetiteRegistry.js';

/** A real calendar day inside the register's range, or null. */
export function raDay(value) {
  const key = dayKey(value);
  if (!key || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

/** Collapse whitespace and bound the length. Returns '' rather than a placeholder. */
export function raText(value, max = L.textMax) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Uppercase ISO-style code, exactly three letters, or null. No symbol, no long name. */
export function raCurrency(value) {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * STORED cents. The value must already BE an integer of cents. This function
 * never divides, multiplies or rounds: a stored 950_000_000 is read as
 * 950,000,000.00 and stays that on every reload.
 */
export function readStoredCents(value) {
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0 || value > L.centsMax) return null;
  return value;
}

/** STORED count. A whole number of risks, never a rate and never a decimal. */
export function readStoredCount(value) {
  if (!Number.isSafeInteger(value)) return null;
  if (value < 0 || value > L.countMax) return null;
  return value;
}

/**
 * HUMAN input in major units, e.g. "1250000.00", "0", "12.5". Exactly one
 * conversion, in integer arithmetic, with no floating point anywhere:
 *
 *   "1250000.00" → 125000000
 *   "12.5"       → 1250
 *   "12.505"     → null   (a third decimal place is not a rounding problem, it
 *                         is a different amount)
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

/** Exact cents as major units, without floating point. 1250 → "12.50". */
export function centsToMajorText(cents) {
  const value = readStoredCents(cents);
  if (value === null) return '';
  const sign = value < 0 ? '-' : '';
  const abs = BigInt(Math.abs(value));
  const major = abs / 100n;
  const rest = String(abs % 100n).padStart(2, '0');
  return `${sign}${major.toString()}.${rest}`;
}

/** Exact cents with thousands separators, for a printed figure. 123456789 → "1,234,567.89". */
export function centsToDisplay(cents) {
  const text = centsToMajorText(cents);
  if (!text) return '';
  const [whole, fraction] = text.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${grouped}.${fraction}`;
}

/**
 * Load stored appetite statements. A statement is the enterprise's declared
 * ceiling for one (domain, measure, currency) key on one day.
 */
export function normalizeRiskAppetiteStatements(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  const seenKeys = new Map();
  let dropped = 0;
  let ambiguous = 0;
  list.forEach((raw, index) => {
    if (index >= L.statements) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = raText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const domain = RA_DOMAIN_KEYS.includes(raw.domain) ? raw.domain : null;
    const measure = RA_MEASURE_KEYS.includes(raw.measure) ? raw.measure : null;
    if (!domain || !measure) { dropped += 1; return; }
    const money = measure === 'retained-exposure';
    const currency = money ? raCurrency(raw.currency) : '';
    if (money && !currency) { dropped += 1; return; }
    if (!money && raw.currency !== undefined && raw.currency !== null && raw.currency !== '') { dropped += 1; return; }
    // The tolerance field must match the measure. A count in the cents field is
    // not a small amount of money; it is an unreadable row.
    const toleranceCount = money ? null : readStoredCount(raw.toleranceCount);
    const toleranceCents = money ? readStoredCents(raw.toleranceCents) : null;
    if (money ? toleranceCents === null : toleranceCount === null) { dropped += 1; return; }
    if (!money && raw.toleranceCents !== undefined && raw.toleranceCents !== null) { dropped += 1; return; }
    if (money && raw.toleranceCount !== undefined && raw.toleranceCount !== null) { dropped += 1; return; }
    const appetite = RA_APPETITE_KEYS.includes(raw.appetite) ? raw.appetite : null;
    if (!appetite) { dropped += 1; return; }
    const declaredOn = raDay(raw.declaredOn);
    const reviewOn = raDay(raw.reviewOn);
    if (!declaredOn || !reviewOn || reviewOn < declaredOn) { dropped += 1; return; }
    const declaredById = raText(raw.declaredById, L.idMax);
    if (!declaredById) { dropped += 1; return; }
    const basis = raText(raw.basis, L.textMax);
    if (basis.length < L.textMin) { dropped += 1; return; }

    // Retirement is all three fields or none. Half a retirement is unreadable.
    const retiredOnRaw = raw.retiredOn === undefined || raw.retiredOn === null || raw.retiredOn === '' ? null : raw.retiredOn;
    const retiredByIdRaw = raw.retiredById === undefined || raw.retiredById === null ? '' : raText(raw.retiredById, L.idMax);
    const retirementReasonRaw = raw.retirementReason === undefined || raw.retirementReason === null ? '' : raText(raw.retirementReason, L.textMax);
    let retiredOn = null;
    let retiredById = '';
    let retirementReason = '';
    if (retiredOnRaw !== null || retiredByIdRaw || retirementReasonRaw) {
      retiredOn = raDay(retiredOnRaw);
      if (!retiredOn || retiredOn < declaredOn) { dropped += 1; return; }
      if (!retiredByIdRaw || retirementReasonRaw.length < L.textMin) { dropped += 1; return; }
      retiredById = retiredByIdRaw;
      retirementReason = retirementReasonRaw;
    }

    const key = raStatementKey({ domain, measure, currency });
    const keyDay = `${key}|${declaredOn}`;
    if (seenKeys.has(keyDay)) { ambiguous += 1; return; }
    seenKeys.set(keyDay, id);
    seenIds.add(id);
    kept.push({
      id, domain, measure,
      currency,
      toleranceCount,
      toleranceCents,
      appetite,
      declaredOn,
      reviewOn,
      declaredById,
      basis,
      retiredOn,
      retiredById,
      retirementReason,
    });
  });
  if (dropped || ambiguous) {
    warnings.push(
      `Risk appetite statements: refused ${dropped} unreadable or duplicate row(s)`
      + `${ambiguous ? ` and ${ambiguous} second declaration(s) sharing a key and day` : ''}`
      + '; no tolerance was repaired, re-dated, re-keyed or chosen between.',
    );
  }
  return kept;
}

/**
 * Load stored risk declarations. A declaration names a live operational case,
 * its domain, the exact cents deliberately retained in one currency, and the
 * written basis. The case reference is NOT resolved here: a declaration whose
 * case is missing from the workspace is kept and marked `case-missing` by the
 * reader, because dropping it would silently remove a risk from the register's
 * coverage — the exact failure this module exists to prevent.
 */
export function normalizeRiskDeclarations(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const kept = [];
  const seenIds = new Set();
  const seenCaseDay = new Set();
  let dropped = 0;
  let ambiguous = 0;
  list.forEach((raw, index) => {
    if (index >= L.declarations) { dropped += 1; return; }
    if (!raw || typeof raw !== 'object') { dropped += 1; return; }
    const id = raText(raw.id, 80);
    if (!id || seenIds.has(id)) { dropped += 1; return; }
    const caseId = raText(raw.caseId, L.idMax);
    if (!caseId) { dropped += 1; return; }
    const domain = RA_DOMAIN_KEYS.includes(raw.domain) ? raw.domain : null;
    if (!domain) { dropped += 1; return; }
    const currency = raCurrency(raw.currency);
    if (!currency) { dropped += 1; return; }
    const retainedCents = readStoredCents(raw.retainedCents);
    if (retainedCents === null) { dropped += 1; return; }
    const basis = raText(raw.basis, L.textMax);
    if (basis.length < L.textMin) { dropped += 1; return; }
    const declaredOn = raDay(raw.declaredOn);
    if (!declaredOn) { dropped += 1; return; }
    const declaredById = raText(raw.declaredById, L.idMax);
    if (!declaredById) { dropped += 1; return; }

    const withdrawnRaw = raw.withdrawnOn === undefined || raw.withdrawnOn === null || raw.withdrawnOn === '' ? null : raw.withdrawnOn;
    const withdrawnByIdRaw = raw.withdrawnById === undefined || raw.withdrawnById === null ? '' : raText(raw.withdrawnById, L.idMax);
    const withdrawalReasonRaw = raw.withdrawalReason === undefined || raw.withdrawalReason === null ? '' : raText(raw.withdrawalReason, L.textMax);
    let withdrawnOn = null;
    let withdrawnById = '';
    let withdrawalReason = '';
    if (withdrawnRaw !== null || withdrawnByIdRaw || withdrawalReasonRaw) {
      withdrawnOn = raDay(withdrawnRaw);
      if (!withdrawnOn || withdrawnOn < declaredOn) { dropped += 1; return; }
      if (!withdrawnByIdRaw || withdrawalReasonRaw.length < L.textMin) { dropped += 1; return; }
      withdrawnById = withdrawnByIdRaw;
      withdrawalReason = withdrawalReasonRaw;
    }

    // A case cannot be declared twice on one day. Two declarations for the same
    // case and day are an ambiguity about which figure is the one the
    // enterprise is carrying; the later row is dropped and counted.
    const caseDay = `${caseId}|${declaredOn}`;
    if (seenCaseDay.has(caseDay)) { ambiguous += 1; return; }
    seenCaseDay.add(caseDay);
    seenIds.add(id);
    kept.push({
      id, caseId, domain, currency, retainedCents, basis, declaredOn, declaredById,
      withdrawnOn, withdrawnById, withdrawalReason,
    });
  });
  if (dropped || ambiguous) {
    warnings.push(
      `Risk declarations: refused ${dropped} unreadable or duplicate row(s)`
      + `${ambiguous ? ` and ${ambiguous} second declaration(s) for one case on one day` : ''}`
      + '; no retention was repaired, re-attributed, re-dated or chosen between.',
    );
  }
  return kept;
}

/** Identity-free observations written by the rule. Duplicate keys collapse. */
export function normalizeRaMarkers(value, warnings = []) {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set();
  const kept = [];
  let dropped = 0;
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') { dropped += 1; continue; }
    const key = raText(raw.key, 240);
    const at = typeof raw.at === 'string' ? raw.at : '';
    const detail = raText(raw.detail, 400);
    if (!key || !at || !detail || seen.has(key)) { dropped += 1; continue; }
    seen.add(key);
    kept.push({ key, at, ruleId: raText(raw.ruleId, 80) || null, kind: raText(raw.kind, 80) || 'risk-appetite', detail });
  }
  if (dropped) warnings.push(`Risk appetite markers: refused ${dropped} unreadable or duplicate marker row(s).`);
  return kept.slice(-L.markers);
}

/** The module's declared conventions. Only the pause switch exists today. */
export function normalizeRiskAppetiteSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const key = RA_SETTING_KEYS.autoPropagate;
  return {
    [key]: source[key] === undefined ? RA_DEFAULTS.autoPropagate : Boolean(source[key]),
  };
}

export function readRaSettings({ settings = null } = {}) {
  const raw = normalizeRiskAppetiteSettings(settings || {});
  return { autoPropagate: raw[RA_SETTING_KEYS.autoPropagate] };
}

/* --------------------------------------------------------------- ask links */

export const RA_ASK_PREFIX = 'Risk appetite:';

export function raAskSummary(signature) {
  return `${RA_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseRaAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(RA_ASK_PREFIX)) return null;
  const signature = raw.slice(RA_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/** The domain label, or null — never a plausible default. */
export const raDomainLabel = (key) => RA_DOMAINS.find((row) => row.key === key)?.label || null;
