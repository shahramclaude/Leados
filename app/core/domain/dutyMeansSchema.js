/**
 * app/core/domain/dutyMeansSchema.js — fail-closed loaders and exact integer
 * parsers for the Duty-Without-Means Register (ADR-0221, Schema v175).
 *
 * FAIL-CLOSED BY CONSTRUCTION
 * ---------------------------
 *   1. Major-unit money strings are converted to integer cents ONCE at the
 *      action boundary (`parseDwmMoneyToCents` via `BigInt`). Stored rows carry
 *      only integer cents (`readStoredDwmCents`) and are never passed back
 *      through the major-unit parser, making a ×100 reload inflation impossible.
 *   2. Protected capacity is stored as whole integer hours (`readStoredDwmHours`)
 *      and never converted into money or inferred from a percentage.
 *   3. Every pillar owns its exact fields (`authority` -> `authorityScope`, with
 *      money only on `spend-commit`; `budget` -> `currency` + `requiredCents`;
 *      `time` -> `requiredHours`). Cross-contaminated rows are dropped with a
 *      counted warning, never repaired.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  DWM_ACT_STATE_KEYS,
  DWM_AUTHORITY_SCOPE_KEYS,
  DWM_BOUNDS,
  DWM_DEFAULTS,
  DWM_EVIDENCE_KIND_KEYS,
  DWM_LIMITS,
  DWM_MARKER_REASONS,
  DWM_PILLAR_KEYS,
  DWM_RULE_ID,
  DWM_SETTING_KEYS,
  DWM_SOURCE_KIND_KEYS,
  dwmAuthorityScopeByKey,
  dwmSourceByKey,
} from './dutyMeansRegistry.js';

const L = DWM_LIMITS;
const DECIMAL_RE = /^\d+(\.\d+)?$/;
const WHOLE_RE = /^\d+$/;
const SOURCE_SET = new Set(DWM_SOURCE_KIND_KEYS);
const PILLAR_SET = new Set(DWM_PILLAR_KEYS);
const SCOPE_SET = new Set(DWM_AUTHORITY_SCOPE_KEYS);
const EVIDENCE_SET = new Set(DWM_EVIDENCE_KIND_KEYS);
const ACT_STATE_SET = new Set(DWM_ACT_STATE_KEYS);
const MARKER_REASON_SET = new Set(Object.values(DWM_MARKER_REASONS));

export function dwmDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const key = dayKey(trimmed);
  if (!key || key !== trimmed || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

export function dwmDaysBetween(from, to) {
  const a = dwmDay(from);
  const b = dwmDay(to);
  if (!a || !b) return null;
  const diff = daysBetween(`${a}T00:00:00.000Z`, `${b}T00:00:00.000Z`);
  return Number.isInteger(diff) ? diff : null;
}

export function dwmText(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function dwmId(value, max = L.idMax) {
  const text = dwmText(value, max);
  return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : null;
}

export function dwmPersonId(value) {
  return dwmId(value, L.personIdMax);
}

export function dwmCurrency(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Parse user-supplied major-unit money text into whole integer cents ONCE via
 * `BigInt`. Commas, scientific notation, negatives, and >2 decimals are refused.
 */
export function parseDwmMoneyToCents(value, { allowZero = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  const text = String(value).trim();
  if (!text || text.includes(',') || text.includes('e') || text.includes('E') || !DECIMAL_RE.test(text)) {
    return null;
  }
  const dot = text.indexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  const fraction = dot === -1 ? '' : text.slice(dot + 1);
  if (fraction.length > 2) return null;
  const centsBig = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  if (!allowZero && centsBig <= 0n) return null;
  if (allowZero && centsBig < 0n) return null;
  if (centsBig > BigInt(L.centsMax)) return null;
  const cents = Number(centsBig);
  return Number.isSafeInteger(cents) ? cents : null;
}

/**
 * Read stored integer cents from state. Never parses decimals or multiplies by
 * 100, so reloading state is strictly idempotent.
 */
export function readStoredDwmCents(value, { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (!allowZero && value <= 0) return null;
  if (allowZero && value < 0) return null;
  if (value > L.centsMax) return null;
  return value;
}

export function centsToMajorString(cents) {
  if (typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return '';
  const big = BigInt(cents);
  const whole = big / 100n;
  const frac = String(big % 100n).padStart(2, '0');
  return `${whole.toString()}.${frac}`;
}

export function formatDwmMoney(currency, cents) {
  if (!currency || typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return '—';
  const big = BigInt(cents);
  const whole = (big / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(big % 100n).padStart(2, '0');
  return `${currency} ${whole}.${frac}`;
}

export function parseDwmHours(value, { allowZero = false } = {}) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!WHOLE_RE.test(text)) return null;
  const n = Number(text);
  if (!Number.isSafeInteger(n)) return null;
  const min = allowZero ? 0 : L.hoursMin;
  if (n < min || n > L.hoursMax) return null;
  return n;
}

export function readStoredDwmHours(value, { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  const min = allowZero ? 0 : L.hoursMin;
  if (value < min || value > L.hoursMax) return null;
  return value;
}

function pushWarn(warnings, message) {
  if (Array.isArray(warnings) && warnings.length < 100) warnings.push(message);
}

export function normalizeDutyMeansDuties(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.dutiesMax) {
      pushWarn(warnings, `dutyMeansDuties: capped at ${L.dutiesMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'dutyMeansDuties: dropped non-object row.');
      continue;
    }
    const id = dwmId(item.id);
    if (!id || seenIds.has(id)) {
      pushWarn(warnings, `dutyMeansDuties: dropped row with missing or duplicate id "${dwmText(item?.id, 40)}".`);
      continue;
    }
    const label = dwmText(item.label, L.labelMax + 1);
    if (label.length < L.labelMin || label.length > L.labelMax) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row with out-of-bounds label.`);
      continue;
    }
    const carrierId = dwmPersonId(item.carrierId);
    const demandingLineHolderId = dwmPersonId(item.demandingLineHolderId);
    if (!carrierId || !demandingLineHolderId || carrierId === demandingLineHolderId) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row with invalid or identical carrier and demanding line.`);
      continue;
    }
    const windowFrom = dwmDay(item.windowFrom);
    const windowTo = dwmDay(item.windowTo);
    const span = dwmDaysBetween(windowFrom, windowTo);
    if (!windowFrom || !windowTo || span === null || span <= 0 || span > L.windowDaysMax) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row with unreadable or out-of-range duty window.`);
      continue;
    }
    const declaredOn = dwmDay(item.declaredOn);
    const declaredById = dwmPersonId(item.declaredById);
    if (!declaredOn || !declaredById) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row without valid declaration provenance.`);
      continue;
    }
    const outcomeBasis = dwmText(item.outcomeBasis, L.basisMax + 1);
    if (outcomeBasis.length < L.basisMin || outcomeBasis.length > L.basisMax) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row without a bounded written outcome basis.`);
      continue;
    }
    const sourceKind = dwmText(item.sourceKind, 32);
    if (!SOURCE_SET.has(sourceKind)) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row with unknown sourceKind.`);
      continue;
    }
    const spec = dwmSourceByKey(sourceKind);
    const rawSourceId = dwmText(item.sourceId, L.sourceIdMax + 1);
    if (spec.needsId && (!rawSourceId || rawSourceId.length > L.sourceIdMax)) {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped row missing required sourceId for ${sourceKind}.`);
      continue;
    }
    if (!spec.needsId && rawSourceId !== '') {
      pushWarn(warnings, `dutyMeansDuties(${id}): dropped written-source row carrying unexpected sourceId.`);
      continue;
    }

    const hasRetiredOn = item.retiredOn !== null && item.retiredOn !== undefined && item.retiredOn !== '';
    const hasRetiredBy = Boolean(dwmText(item.retiredById, L.personIdMax));
    const hasRetireReason = Boolean(dwmText(item.retirementReason, L.reasonMax + 1));
    let retiredOn = null;
    let retiredById = '';
    let retirementReason = '';
    if (hasRetiredOn || hasRetiredBy || hasRetireReason) {
      retiredOn = dwmDay(item.retiredOn);
      retiredById = dwmPersonId(item.retiredById) || '';
      retirementReason = dwmText(item.retirementReason, L.reasonMax + 1);
      if (!retiredOn || retiredOn < declaredOn || !retiredById
        || retirementReason.length < L.reasonMin || retirementReason.length > L.reasonMax) {
        pushWarn(warnings, `dutyMeansDuties(${id}): dropped row with incomplete or pre-dated retirement fields.`);
        continue;
      }
    }

    seenIds.add(id);
    out.push({
      id,
      label,
      carrierId,
      demandingLineHolderId,
      windowFrom,
      windowTo,
      declaredOn,
      declaredById,
      outcomeBasis,
      sourceKind,
      sourceId: spec.needsId ? rawSourceId : '',
      retiredOn,
      retiredById,
      retirementReason,
    });
  }
  return out;
}

export function requirementUniqueSignature(row) {
  if (!row) return '';
  const disc = row.pillar === 'authority'
    ? (row.authorityScope || '')
    : row.pillar === 'budget'
      ? (row.currency || '')
      : 'hours';
  return `${row.dutyId}|${row.pillar}|${row.controllingHolderId}|${disc}`;
}

export function normalizeDutyMeansRequirements(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  const seenSigs = new Set();
  for (const item of raw) {
    if (out.length >= L.requirementsMax) {
      pushWarn(warnings, `dutyMeansRequirements: capped at ${L.requirementsMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'dutyMeansRequirements: dropped non-object row.');
      continue;
    }
    const id = dwmId(item.id);
    const dutyId = dwmId(item.dutyId);
    if (!id || !dutyId || seenIds.has(id)) {
      pushWarn(warnings, `dutyMeansRequirements: dropped row with invalid or duplicate id "${dwmText(item?.id, 40)}".`);
      continue;
    }
    const pillar = dwmText(item.pillar, 24);
    if (!PILLAR_SET.has(pillar)) {
      pushWarn(warnings, `dutyMeansRequirements(${id}): dropped row with unknown pillar.`);
      continue;
    }
    const controllingHolderId = dwmPersonId(item.controllingHolderId);
    const declaredOn = dwmDay(item.declaredOn);
    const declaredById = dwmPersonId(item.declaredById);
    const rationale = dwmText(item.rationale, L.rationaleMax + 1);
    if (!controllingHolderId || !declaredOn || !declaredById
      || rationale.length < L.rationaleMin || rationale.length > L.rationaleMax) {
      pushWarn(warnings, `dutyMeansRequirements(${id}): dropped row with missing controller, date, or rationale.`);
      continue;
    }

    let authorityScope = null;
    let currency = null;
    let requiredCents = null;
    let requiredHours = null;

    if (pillar === 'authority') {
      const scope = dwmText(item.authorityScope, 32);
      if (!SCOPE_SET.has(scope) || item.requiredHours !== null && item.requiredHours !== undefined) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped authority row with invalid scope or hours field.`);
        continue;
      }
      authorityScope = scope;
      const scopeSpec = dwmAuthorityScopeByKey(scope);
      if (scopeSpec.needsMoney) {
        currency = dwmCurrency(item.currency);
        requiredCents = readStoredDwmCents(item.requiredCents);
        if (!currency || requiredCents === null) {
          pushWarn(warnings, `dutyMeansRequirements(${id}): dropped spend-commit authority row without currency and integer cents.`);
          continue;
        }
      } else if ((item.currency !== null && item.currency !== undefined)
        || (item.requiredCents !== null && item.requiredCents !== undefined)) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped non-spend authority row carrying money fields.`);
        continue;
      }
    } else if (pillar === 'budget') {
      if ((item.authorityScope !== null && item.authorityScope !== undefined)
        || (item.requiredHours !== null && item.requiredHours !== undefined)) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped budget row carrying authority or hours fields.`);
        continue;
      }
      currency = dwmCurrency(item.currency);
      requiredCents = readStoredDwmCents(item.requiredCents);
      if (!currency || requiredCents === null) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped budget row without valid currency and integer cents.`);
        continue;
      }
    } else if (pillar === 'time') {
      if ((item.authorityScope !== null && item.authorityScope !== undefined)
        || (item.currency !== null && item.currency !== undefined)
        || (item.requiredCents !== null && item.requiredCents !== undefined)) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped time row carrying authority or money fields.`);
        continue;
      }
      requiredHours = readStoredDwmHours(item.requiredHours);
      if (requiredHours === null) {
        pushWarn(warnings, `dutyMeansRequirements(${id}): dropped time row without valid whole hours.`);
        continue;
      }
    }

    const candidate = {
      id,
      dutyId,
      pillar,
      controllingHolderId,
      authorityScope,
      currency,
      requiredCents,
      requiredHours,
      rationale,
      declaredOn,
      declaredById,
    };
    const sig = requirementUniqueSignature(candidate);
    if (seenSigs.has(sig)) {
      pushWarn(warnings, `dutyMeansRequirements(${id}): dropped duplicate requirement key on duty ${dutyId}.`);
      continue;
    }
    seenIds.add(id);
    seenSigs.add(sig);
    out.push(candidate);
  }
  return out;
}

export function normalizeDutyMeansActs(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.actsMax) {
      pushWarn(warnings, `dutyMeansActs: capped at ${L.actsMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'dutyMeansActs: dropped non-object row.');
      continue;
    }
    const id = dwmId(item.id);
    const requirementId = dwmId(item.requirementId);
    if (!id || !requirementId || seenIds.has(id)) {
      pushWarn(warnings, `dutyMeansActs: dropped row with invalid or duplicate id "${dwmText(item?.id, 40)}".`);
      continue;
    }
    const state = dwmText(item.state, 24);
    if (!ACT_STATE_SET.has(state)) {
      pushWarn(warnings, `dutyMeansActs(${id}): dropped row with unknown act state.`);
      continue;
    }
    const on = dwmDay(item.on);
    const byId = dwmPersonId(item.byId);
    if (!on || !byId) {
      pushWarn(warnings, `dutyMeansActs(${id}): dropped row without valid date or actor.`);
      continue;
    }

    let suppliedCents = null;
    let suppliedHours = null;
    let currency = null;
    let evidenceKind = '';
    let evidenceId = '';
    let reason = dwmText(item.reason, L.reasonMax + 1);
    if (reason.length > L.reasonMax) {
      pushWarn(warnings, `dutyMeansActs(${id}): dropped row with overlong reason.`);
      continue;
    }

    if (state === 'supplied') {
      evidenceKind = dwmText(item.evidenceKind, 32);
      evidenceId = dwmText(item.evidenceId, L.evidenceIdMax + 1);
      if (!EVIDENCE_SET.has(evidenceKind) || !evidenceId || evidenceId.length > L.evidenceIdMax) {
        pushWarn(warnings, `dutyMeansActs(${id}): dropped supplied act without valid evidenceKind and evidenceId.`);
        continue;
      }
      const hasCents = item.suppliedCents !== null && item.suppliedCents !== undefined;
      const hasHours = item.suppliedHours !== null && item.suppliedHours !== undefined;
      if (hasCents && hasHours) {
        pushWarn(warnings, `dutyMeansActs(${id}): dropped supplied act mixing cents and hours.`);
        continue;
      }
      if (hasCents) {
        currency = dwmCurrency(item.currency);
        suppliedCents = readStoredDwmCents(item.suppliedCents, { allowZero: false });
        if (!currency || suppliedCents === null) {
          pushWarn(warnings, `dutyMeansActs(${id}): dropped money supply act without currency and positive integer cents.`);
          continue;
        }
      } else if (item.currency !== null && item.currency !== undefined && item.currency !== '') {
        pushWarn(warnings, `dutyMeansActs(${id}): dropped non-money supply act carrying currency.`);
        continue;
      }
      if (hasHours) {
        suppliedHours = readStoredDwmHours(item.suppliedHours, { allowZero: false });
        if (suppliedHours === null) {
          pushWarn(warnings, `dutyMeansActs(${id}): dropped time supply act without positive whole hours.`);
          continue;
        }
      }
    } else {
      if ((item.suppliedCents !== null && item.suppliedCents !== undefined)
        || (item.suppliedHours !== null && item.suppliedHours !== undefined)) {
        pushWarn(warnings, `dutyMeansActs(${id}): dropped ${state} act carrying supply quantities.`);
        continue;
      }
      if (reason.length < L.reasonMin) {
        pushWarn(warnings, `dutyMeansActs(${id}): dropped ${state} act without a bounded written reason.`);
        continue;
      }
      if (item.evidenceKind) {
        const ek = dwmText(item.evidenceKind, 32);
        if (EVIDENCE_SET.has(ek)) evidenceKind = ek;
      }
      if (item.evidenceId) evidenceId = dwmText(item.evidenceId, L.evidenceIdMax);
    }

    seenIds.add(id);
    out.push({
      id,
      requirementId,
      state,
      on,
      byId,
      currency,
      suppliedCents,
      suppliedHours,
      evidenceKind,
      evidenceId,
      reason,
    });
  }
  return out;
}

export function normalizeDutyMeansMarkers(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.markersMax) break;
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'dutyMeansMarkers: dropped non-object marker.');
      continue;
    }
    const id = dwmId(item.id);
    const signature = dwmText(item.signature, 160);
    const reason = dwmText(item.reason, 64);
    const observedOn = dwmDay(item.observedOn);
    if (!id || seenIds.has(id) || !signature || !MARKER_REASON_SET.has(reason) || !observedOn) {
      pushWarn(warnings, 'dutyMeansMarkers: dropped malformed marker.');
      continue;
    }
    seenIds.add(id);
    out.push({
      id,
      ruleId: DWM_RULE_ID,
      signature,
      reason,
      observedOn,
      resolvedOn: dwmDay(item.resolvedOn),
    });
  }
  return out;
}

export function normalizeDutyMeansSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawDays = Number(source[DWM_SETTING_KEYS.responseDays]);
  const responseDays = Number.isFinite(rawDays)
    ? Math.min(DWM_BOUNDS.responseDays.max, Math.max(DWM_BOUNDS.responseDays.min, Math.round(rawDays)))
    : DWM_DEFAULTS.responseDays;
  const autoPropagate = source[DWM_SETTING_KEYS.autoPropagate] === undefined
    ? DWM_DEFAULTS.autoPropagate
    : Boolean(source[DWM_SETTING_KEYS.autoPropagate]);
  return {
    [DWM_SETTING_KEYS.responseDays]: responseDays,
    [DWM_SETTING_KEYS.autoPropagate]: autoPropagate,
  };
}

export function dwmAskSummary(signature) {
  return `${DWM_RULE_ID}|${signature}`;
}

export function parseDwmAskSummary(summary) {
  if (typeof summary !== 'string' || !summary.startsWith(`${DWM_RULE_ID}|`)) return null;
  const signature = summary.slice(DWM_RULE_ID.length + 1).trim();
  return signature || null;
}
