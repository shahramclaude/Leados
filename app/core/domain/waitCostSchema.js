/**
 * app/core/domain/waitCostSchema.js — the persisted contract of the Cost of
 * Waiting Terminal (Schema v64).
 *
 * Three persisted structures, all fail-closed:
 *
 *   waitPrices        one row per declared weekly price per class of work.
 *                     The latest declaration per class is the active price;
 *                     earlier rows stay as audit history. Nothing is priced
 *                     by default: an empty list means every wait is unpriced.
 *   waitExposures     append-only weekly exposure certificates frozen by a
 *                     scan or by the leader. A certificate records what the
 *                     waiting was priced at; it is audit history, not a
 *                     prediction (the survival readings grade predictions).
 *   waitCostMarkers   idempotency markers for RULE-WAIT-01..05, same convention
 *                     as survivalMarkers / portfolioMarkers.
 *
 * An unreadable record is dropped with a warning, never repaired silently.
 */

import { WAIT_CLASS_KEYS } from './waitCost.js';

export const WAIT_SCHEMA_VERSION = 1;

export const WAIT_PRICE_MAX_NOTE = 200;
export const WAIT_EXPOSURE_LABEL_MAX = 200;
export const WAIT_EXPOSURE_ITEM_CAP = 200;
export const WAIT_EXPOSURE_TOTAL_CAP = 12;
export const WAIT_PRICES_CAP = 24;
export const WAIT_EXPOSURES_CAP = 60;
export const WAIT_MARKERS_CAP = 400;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Za-z]{3}$/;

function str(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function dayOr(value) {
  const raw = str(value, 10);
  return DAY_RE.test(raw) ? raw : null;
}

function num(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Normalize the declared weekly prices. Fail-closed per row: a row whose
 * class is not one of the six survival classes, or whose amount is not a
 * finite non-negative number, is dropped with a warning — a price invented
 * by the loader would be a cost the leader never declared.
 */
export function normalizeWaitPrices(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = str(row.id, 60);
    if (!id || seen.has(id)) continue;
    const classKey = str(row.classKey, 20);
    if (!WAIT_CLASS_KEYS.includes(classKey)) {
      warnings.push(`Dropped a wait price with unknown class "${classKey || '(empty)'}".`);
      continue;
    }
    const rawAmount = Number(row.weeklyAmount);
    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
      warnings.push(`Dropped wait price ${id}: the weekly amount must be a non-negative number.`);
      continue;
    }
    const amount = Math.min(rawAmount, 1e12);
    const currencyRaw = str(row.currency, 3).toUpperCase();
    const currency = CURRENCY_RE.test(currencyRaw) ? currencyRaw : 'USD';
    seen.add(id);
    out.push({
      id,
      classKey,
      weeklyAmount: round2(amount),
      currency,
      declaredOn: dayOr(row.declaredOn),
      note: str(row.note, WAIT_PRICE_MAX_NOTE),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  return out.slice(0, WAIT_PRICES_CAP);
}

function normalizeCertificateItem(row, warnings, certId) {
  if (!row || typeof row !== 'object') return null;
  const key = str(row.key, 120);
  const sourceType = str(row.sourceType, 40);
  const sourceId = str(row.sourceId, 60);
  if (!key || !sourceType || !sourceId) {
    warnings.push(`Dropped an item of exposure ${certId}: missing key, source type or source id.`);
    return null;
  }
  const amount = num(row.weeklyAmount, 0, 1e12);
  if (amount === null) return null;
  const currencyRaw = str(row.currency, 3).toUpperCase();
  const scenarios = (Array.isArray(row.scenarios) ? row.scenarios : [])
    .map((s) => {
      const weeks = num(s?.weeks, 0, 52);
      const pct = num(s?.stillOpenPct, 0, 100);
      const cost = num(s?.expectedAdditionalCost, 0, 1e15);
      if (weeks === null || pct === null || cost === null) return null;
      return { weeks: Math.round(weeks), stillOpenPct: round2(pct), expectedAdditionalCost: round2(cost) };
    })
    .filter(Boolean)
    .slice(0, 8);
  const confidenceRaw = str(row.confidence, 10);
  return {
    key,
    sourceType,
    sourceId,
    title: str(row.title, 160),
    classKey: str(row.classKey, 20) || 'work',
    elapsedDays: num(row.elapsedDays, 0, 36500) ?? 0,
    overdue: row.overdue === true,
    weeklyAmount: round2(amount),
    currency: CURRENCY_RE.test(currencyRaw) ? currencyRaw : 'USD',
    priceSource: str(row.priceSource, 10) || 'declared',
    confidence: ['high', 'medium', 'low'].includes(confidenceRaw) ? confidenceRaw : 'low',
    scenarios,
  };
}

/**
 * Normalize the exposure certificates. Fail-closed per record: a certificate
 * with no id, no week or no frozen date is dropped rather than repaired,
 * because a certificate is an audit record — inventing its date would invent
 * the audit.
 */
export function normalizeWaitExposures(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const id = str(row.id, 60);
    const week = dayOr(row.week);
    const frozenOn = dayOr(row.frozenOn);
    if (!id || seen.has(id) || !week || !frozenOn) {
      if (id && !seen.has(id)) warnings.push(`Dropped exposure certificate ${id}: unreadable id, week or frozen date.`);
      continue;
    }
    seen.add(id);
    const totals = (Array.isArray(row.totals) ? row.totals : [])
      .map((bucket) => {
        const currencyRaw = str(bucket?.currency, 3).toUpperCase();
        const exposure = num(bucket?.weeklyExposure, 0, 1e15);
        const overdue = num(bucket?.weeklyExposureOverdue, 0, 1e15);
        if (!CURRENCY_RE.test(currencyRaw) || exposure === null || overdue === null) return null;
        const scenarios = (Array.isArray(bucket?.scenarios) ? bucket.scenarios : [])
          .map((s) => {
            const weeks = num(s?.weeks, 0, 52);
            const cost = num(s?.expectedAdditionalCost, 0, 1e15);
            if (weeks === null || cost === null) return null;
            return { weeks: Math.round(weeks), expectedAdditionalCost: round2(cost), coveredRows: Math.round(num(s?.coveredRows, 0, 100000) ?? 0) };
          })
          .filter(Boolean)
          .slice(0, 8);
        return {
          currency: currencyRaw,
          weeklyExposure: round2(exposure),
          weeklyExposureOverdue: round2(overdue),
          pricedItems: Math.round(num(bucket?.pricedItems, 0, 1e6) ?? 0),
          overduePricedItems: Math.round(num(bucket?.overduePricedItems, 0, 1e6) ?? 0),
          topItemSharePct: num(bucket?.topItemSharePct, 0, 100) ?? 0,
          scenarios,
        };
      })
      .filter(Boolean)
      .slice(0, WAIT_EXPOSURE_TOTAL_CAP);
    const items = (Array.isArray(row.items) ? row.items : [])
      .map((item) => normalizeCertificateItem(item, warnings, id))
      .filter(Boolean)
      .slice(0, WAIT_EXPOSURE_ITEM_CAP);
    const history = (Array.isArray(row.history) ? row.history : [])
      .map((entry) => ({
        at: isoOrNull(entry?.at),
        type: str(entry?.type, 40),
        summary: str(entry?.summary, 300),
      }))
      .filter((entry) => entry.type)
      .slice(0, 20);
    const counts = row.counts && typeof row.counts === 'object'
      ? Object.fromEntries(Object.entries(row.counts).slice(0, 24).map(([k, v]) => [str(k, 40), num(v, 0, 1e9) ?? 0]))
      : {};
    out.push({
      id,
      label: str(row.label, WAIT_EXPOSURE_LABEL_MAX) || `Exposure certificate, week of ${week}`,
      week,
      frozenOn,
      reviewOn: dayOr(row.reviewOn),
      horizonWeeks: (Array.isArray(row.horizonWeeks) ? row.horizonWeeks : [])
        .map((w) => num(w, 1, 52)).filter((w) => w !== null).map((w) => Math.round(w)).slice(0, 6),
      totals,
      items,
      counts,
      markers: (Array.isArray(row.markers) ? row.markers : [])
        .filter((m) => typeof m === 'string' && m.length > 0).map((m) => m.slice(0, 200)).slice(0, 100),
      history,
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  // Newest first is the view convention; keep the file order stable by
  // sorting on frozenOn descending, then id, so a hand-edited file still
  // normalizes deterministically.
  return out.sort((a, b) => (b.frozenOn === a.frozenOn ? (a.id < b.id ? -1 : 1) : (b.frozenOn < a.frozenOn ? -1 : 1))).slice(0, WAIT_EXPOSURES_CAP);
}

/** Marker array for RULE-WAIT-01..05 idempotency. Strings only, bounded. */
export function normalizeWaitCostMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200))
    .slice(0, WAIT_MARKERS_CAP);
}
