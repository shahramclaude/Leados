/** ADR-0259: snapshot only sourced inputs; a broken version chain never becomes a current receipt. */
import { reviewMinimumCash } from './minimumCash.js';

export const CASH_COVENANT_METHOD = 'fixed-minimum-v1';
export const CASH_COVENANT_LIMITS = Object.freeze({ tests: 120, revisions: 12, stewards: 8, extract: 64 * 1024, ledger: 512 * 1024 });
export const CASH_COVENANT_REFUSAL = 'Cash covenant ledger: saved evidence is unreadable, ambiguous, or out of bounds. No receipt was substituted. Preserve a full backup and restore verified evidence before using this ledger.';
export const cashCovenantFailure = (error, field = null) => ({ ok: false, error, field });

const L = CASH_COVENANT_LIMITS;
const ID = /^[A-Za-z0-9:_-]{1,120}$/;
const SOURCE_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
export const cashCovenantId = (v) => typeof v === 'string' && ID.test(v);
const sourceKey = (v) => SOURCE_KEY.test(v);
const reference = (v) => typeof v === 'string' && v.length >= 1 && v.length <= 200 && v === v.trim()
  && !/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069\ufffd]/u.test(v);
const refKey = (v) => v.normalize('NFKC').toLowerCase();

function utcInstant(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  const canonical = value.length === 20 ? `${value.slice(0, -1)}.000Z` : value;
  const time = Date.parse(canonical);
  return Number.isFinite(time) && new Date(time).toISOString() === canonical ? canonical : null;
}

export function cashCovenantStewards(value) {
  if (!Array.isArray(value) || !value.length || value.length > L.stewards) return null;
  const ids = [...value];
  return ids.every(cashCovenantId) && new Set(ids).size === ids.length ? ids.sort() : null;
}

export function readCashCovenantRevision(raw, nowIso) {
  if (!cashCovenantId(raw?.recordedById) || !raw.recordedAt || utcInstant(raw.recordedAt) !== raw.recordedAt || raw.recordedAt > nowIso) {
    return cashCovenantFailure('A receipt needs a valid recording seat and a UTC recording instant no later than now.');
  }
  const cutoffAt = utcInstant(raw.cutoffAt);
  if (!cutoffAt || cutoffAt > raw.recordedAt) {
    return cashCovenantFailure('Enter the contractual cutoff as a real UTC instant ending in Z. It must already have occurred.', 'cutoffAt');
  }
  if (!reference(raw.versionRef)) return cashCovenantFailure('Provide a distinct workpaper version reference (1–200 characters).', 'versionRef');
  if (raw.supersedes === null ? raw.correctionReason !== null : !reference(raw.supersedes) || !reference(raw.correctionReason)) {
    return cashCovenantFailure('A correction must name the prior version and explain what changed (1–200 characters).', 'correctionReason');
  }
  if (typeof raw.text !== 'string' || raw.text.length > L.extract) {
    return cashCovenantFailure('The workpaper must be UTF-8 TSV, at most 64 KiB. No partial extract is accepted.', 'text');
  }
  const bytes = new TextEncoder().encode(raw.text).length;
  if (bytes > L.extract) return cashCovenantFailure('The workpaper exceeds 64 KiB as UTF-8. No partial extract is accepted.', 'text');
  let report;
  try { report = reviewMinimumCash(raw.text); }
  catch (error) { return cashCovenantFailure(error.message, 'text'); }
  const { facility, testDate, currency, clauseRef, controlRef } = report.terms;
  if (!sourceKey(facility) || report.evidence.some((r) => !sourceKey(r.account))) {
    return cashCovenantFailure('Use stable facility and account codes: 1–80 ASCII letters, digits, dots, underscores, colons or hyphens, starting with a letter or digit.', 'text');
  }
  // A case variant is ambiguous evidence, not another account. Do not silently
  // merge it or let its amount influence a comparison with the population control.
  if (new Set(report.evidence.map((r) => r.account.toLowerCase())).size !== report.evidence.length) {
    return cashCovenantFailure('Account codes differ only in letter case. Reconcile their identity and resubmit the complete extract.', 'text');
  }
  if (![clauseRef, controlRef, ...report.evidence.flatMap((r) => [r.basisRef, r.balanceRef])].every(reference)) {
    return cashCovenantFailure('Use printable evidence locators no longer than 200 characters.', 'text');
  }
  if (report.evidence.some((r) => refKey(r.balanceRef) === refKey(controlRef))) {
    return cashCovenantFailure('The separate book control must have a different source locator from each balance observation.', 'text');
  }
  const dayDelta = Date.parse(`${testDate}T00:00:00.000Z`) - Date.parse(`${cutoffAt.slice(0, 10)}T00:00:00.000Z`);
  if (Math.abs(dayDelta) > 86_400_000) {
    return cashCovenantFailure('The UTC cutoff must fall on the contractual test date or an adjacent UTC date for a timezone rollover.', 'cutoffAt');
  }
  const revision = { cutoffAt, versionRef: raw.versionRef, supersedes: raw.supersedes, correctionReason: raw.correctionReason,
    recordedById: raw.recordedById, recordedAt: raw.recordedAt, text: raw.text };
  return { ok: true, revision, report, bytes, key: JSON.stringify([facility.toLowerCase(), testDate, currency]) };
}

export function cashVersionExists(revisions, versionRef) {
  return revisions.some((r) => refKey(r.versionRef) === refKey(versionRef));
}

export function readCashCovenantLedger(raw, nowIso) {
  const blocked = () => cashCovenantFailure(CASH_COVENANT_REFUSAL);
  if (!Array.isArray(raw) || raw.length > L.tests) return blocked();
  const entries = [], ids = new Set(), keys = new Set();
  let bytes = 0;
  for (const row of raw) {
    const stewardIds = cashCovenantStewards(row?.stewardIds);
    if (!cashCovenantId(row?.id) || ids.has(row.id) || row.method !== CASH_COVENANT_METHOD || !stewardIds
      || !Array.isArray(row.revisions) || !row.revisions.length || row.revisions.length > L.revisions) return blocked();
    const revisions = [], reports = [];
    let key;
    for (const original of row.revisions) {
      const read = readCashCovenantRevision(original, nowIso);
      if (!read.ok) return blocked();
      const previous = revisions.at(-1);
      if (read.revision.supersedes !== (previous?.versionRef ?? null)
        || (previous && (read.revision.recordedAt < previous.recordedAt || read.key !== key))
        || cashVersionExists(revisions, read.revision.versionRef)) return blocked();
      key = read.key;
      bytes += read.bytes;
      if (bytes > L.ledger) return blocked();
      revisions.push(read.revision);
      reports.push(read.report);
    }
    if (keys.has(key)) return blocked();
    ids.add(row.id);
    keys.add(key);
    entries.push({ series: { id: row.id, method: row.method, stewardIds, revisions }, reports, key });
  }
  return { ok: true, entries, bytes };
}

export function normalizeCashCovenantTests(raw, nowIso, warnings) {
  if (raw === undefined) return [];
  const read = readCashCovenantLedger(raw, nowIso);
  if (read.ok) return read.entries.map(({ series }) => series);
  warnings.push(read.error);
  // Keep the original evidence in a full backup even after an unrelated save.
  // Every reader and writer refuses the entire invalid ledger. In particular,
  // a damaged correction cannot silently make its earlier receipt current.
  return Array.isArray(raw) ? raw : [{ quarantinedLedger: raw }];
}
