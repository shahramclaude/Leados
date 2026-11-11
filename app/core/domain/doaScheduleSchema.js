/**
 * app/core/domain/doaScheduleSchema.js — fail-closed normalization and exact
 * integer-cent helpers for the Standing Delegation-of-Authority Schedule
 * (`doaSchedule`, `doaMarkers`, and `doa*` settings; ADR-0174, Schema v138).
 *
 * No limit, currency, scope or window is ever guessed or clamped into validity:
 * malformed acts are rejected with a warning so storage corruption can never
 * invent signing authority.
 */

import {
  DOA_ACT_KINDS,
  DOA_BOUNDS,
  DOA_DEFAULTS,
  DOA_LINE_SCOPE_KEYS,
  DOA_SCOPE_CLASS_KEYS,
} from './doaScheduleRegistry.js';

const ID_RE = /^[A-Za-z0-9_.:-]{1,120}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

const cleanId = (v) => (typeof v === 'string' && ID_RE.test(v.trim()) ? v.trim() : null);

export function validCalendarDay(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === v ? v : null;
}

const validIso = (v) => {
  if (typeof v !== 'string') return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const cleanText = (v, max = DOA_BOUNDS.reasonMaxChars) =>
  (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Convert a typed major-unit monetary number (e.g. `50000` or `123.45`) into
 * exact non-negative integer cents. `null`, `undefined`, `''`, `NaN`, negative
 * numbers, and numbers exceeding 1 trillion units return `null` — never `0`.
 */
export function amountToCents(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const num = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN);
  if (!Number.isFinite(num) || num < 0) return null;
  const cents = Math.round((num + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > DOA_BOUNDS.maxCents) return null;
  return cents;
}

/**
 * Exact integer-cent formatter (`5000000` -> `'50000.00'`). Uses integer
 * division and modulo only — zero floating-point formatting.
 */
export function centsToFixed(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  const whole = Math.floor(cents / 100);
  const rem = cents % 100;
  return `${whole}.${String(rem).padStart(2, '0')}`;
}

export function normalizeDoaSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    doaAskDueDays: clampInt(
      src.doaAskDueDays,
      DOA_DEFAULTS.doaAskDueDays.min,
      DOA_DEFAULTS.doaAskDueDays.max,
      DOA_DEFAULTS.doaAskDueDays.fallback,
    ),
    doaAutoPropagate: src.doaAutoPropagate !== false,
  };
}

export function validateDoaAct(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Act must be an object.' };
  const id = cleanId(raw.id);
  const kind = DOA_ACT_KINDS.includes(raw.kind) ? raw.kind : null;
  const seatId = cleanId(raw.seatId);
  const decidedBySeatId = cleanId(raw.decidedBySeatId);
  const decidedOn = validCalendarDay(raw.decidedOn);
  const decidedAt = validIso(raw.decidedAt);
  const reason = cleanText(raw.reason, DOA_BOUNDS.reasonMaxChars);

  if (!id || !kind || !seatId || !decidedBySeatId || !decidedOn || !decidedAt) {
    return { ok: false, error: 'Missing required identifiers or valid dates on authority-schedule act.' };
  }
  if (reason.length < DOA_BOUNDS.reasonMinChars) {
    return { ok: false, error: `Reason must be at least ${DOA_BOUNDS.reasonMinChars} characters.` };
  }

  if (kind === 'declare') {
    const lineKind = DOA_LINE_SCOPE_KEYS.includes(raw.lineKind) ? raw.lineKind : null;
    const scopeClass = DOA_SCOPE_CLASS_KEYS.includes(raw.scopeClass) ? raw.scopeClass : null;
    const currencyRaw = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
    const currency = CURRENCY_RE.test(currencyRaw) ? currencyRaw : null;
    const limitCents = Number.isSafeInteger(raw.limitCents) && raw.limitCents >= 0 && raw.limitCents <= DOA_BOUNDS.maxCents
      ? raw.limitCents
      : null;
    const effectiveFrom = validCalendarDay(raw.effectiveFrom);
    const hasTo = raw.effectiveTo !== null && raw.effectiveTo !== undefined && raw.effectiveTo !== '';
    const effectiveTo = hasTo ? validCalendarDay(raw.effectiveTo) : null;

    if (!lineKind || !scopeClass || !currency || limitCents === null || !effectiveFrom) {
      return { ok: false, error: 'Declaration requires valid lineKind, scopeClass, 3-letter ISO currency, safe integer limitCents and effectiveFrom.' };
    }
    if (hasTo && (!effectiveTo || effectiveTo < effectiveFrom)) {
      return { ok: false, error: 'Declaration effectiveTo must be a valid calendar day on or after effectiveFrom.' };
    }
    return {
      ok: true,
      act: {
        id,
        kind: 'declare',
        seatId,
        lineKind,
        scopeClass,
        currency,
        limitCents,
        effectiveFrom,
        effectiveTo,
        decidedBySeatId,
        decidedOn,
        decidedAt,
        reason,
      },
    };
  }

  if (kind === 'price-decision') {
    const decisionId = cleanId(raw.decisionId);
    const scopeClass = DOA_SCOPE_CLASS_KEYS.includes(raw.scopeClass) ? raw.scopeClass : null;
    const currencyRaw = typeof raw.currency === 'string' ? raw.currency.trim().toUpperCase() : '';
    const currency = CURRENCY_RE.test(currencyRaw) ? currencyRaw : null;
    const amountCents = Number.isSafeInteger(raw.amountCents) && raw.amountCents >= 0 && raw.amountCents <= DOA_BOUNDS.maxCents
      ? raw.amountCents
      : null;
    if (!decisionId || !scopeClass || !currency || amountCents === null) {
      return { ok: false, error: 'Decision pricing act requires valid decisionId, scopeClass, 3-letter ISO currency and safe integer amountCents.' };
    }
    return {
      ok: true,
      act: {
        id,
        kind: 'price-decision',
        decisionId,
         seatId,
        scopeClass,
        currency,
        amountCents,
        decidedBySeatId,
        decidedOn,
        decidedAt,
        reason,
      },
    };
  }

  const targetLimitId = cleanId(raw.targetLimitId);
  const retiredOn = validCalendarDay(raw.retiredOn);
  if (!targetLimitId || !retiredOn) {
    return { ok: false, error: 'Retirement act requires valid targetLimitId and retiredOn date.' };
  }
  return {
    ok: true,
    act: {
      id,
      kind: 'retire',
      targetLimitId,
      seatId,
      retiredOn,
      decidedBySeatId,
      decidedOn,
      decidedAt,
      reason,
    },
  };
}

export function normalizeDoaSchedule(raw, warnings = []) {
  if (!Array.isArray(raw)) {
    if (raw !== undefined && raw !== null) {
      warnings.push('Delegation-of-authority schedule: non-array doaSchedule reset to [].');
    }
    return [];
  }
  const seen = new Set();
  const declaredIds = new Set();
  const staged = [];
  let dropped = 0;

  for (const item of raw) {
    const res = validateDoaAct(item);
    if (!res.ok || seen.has(res.act.id)) {
      dropped += 1;
      continue;
    }
    if (res.act.kind === 'retire' && !declaredIds.has(res.act.targetLimitId)) {
      dropped += 1;
      continue;
    }
    seen.add(res.act.id);
    if (res.act.kind === 'declare') declaredIds.add(res.act.id);
    staged.push(res.act);
  }

  if (dropped > 0) {
    warnings.push(`Delegation-of-authority schedule: refused ${dropped} malformed, duplicate or dangling act(s); no authority was inferred.`);
  }
  if (staged.length > DOA_BOUNDS.maxActs) {
    return staged.slice(-DOA_BOUNDS.maxActs);
  }
  return staged;
}

export function appendDoaActBounded(existing, act) {
  const list = Array.isArray(existing) ? existing.slice() : [];
  list.push(act);
  if (list.length > DOA_BOUNDS.maxActs) {
    return list.slice(-DOA_BOUNDS.maxActs);
  }
  return list;
}

export function normalizeDoaMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue;
    const key = typeof m.key === 'string' && m.key.trim().length > 0 && m.key.trim().length <= 240
      ? m.key.trim()
      : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      kind: m.kind === 'ask' ? 'ask' : 'abstained',
      objectKey: cleanText(m.objectKey, 160),
      recipientId: cleanId(m.recipientId),
      taskId: cleanId(m.taskId),
      recordedOn: validCalendarDay(m.recordedOn) || null,
      summary: cleanText(m.summary, 300),
    });
  }
  if (out.length > DOA_BOUNDS.markers) {
    return out.slice(-DOA_BOUNDS.markers);
  }
  return out;
}
