/**
 * app/core/domain/portfolioReviewSchema.js — fail-closed loaders and exact
 * integer parsers for the Enterprise Portfolio Review Register (ADR-0222,
 * Schema v176).
 *
 * FAIL-CLOSED BY CONSTRUCTION
 * ---------------------------
 *   1. Major-unit money strings are converted to integer cents ONCE at the
 *      action boundary (`parsePrvMoneyToCents` via `BigInt`). Stored rows
 *      carry only integer cents (`readStoredPrvCents`) and are never passed
 *      back through the major-unit parser, making a ×100 reload inflation
 *      impossible.
 *   2. Every verdict owns its exact fields (`keep` carries none; `fix` carries
 *      `reReviewOn`; `sell`/`exit` carry `expectedProceedsCents` +
 *      `expectedOn`). Cross-contaminated rows are dropped with a counted
 *      warning, never repaired.
 *   3. A unit boundary is declared by a human (`portfolioUnits`); nothing is
 *      inferred from the org chart, a goal, or a budget at upgrade time.
 */

import { dayKey, daysBetween } from '../time.js';
import {
  PRV_BOUNDS,
  PRV_DEFAULTS,
  PRV_EVIDENCE_KIND_KEYS,
  PRV_LIMITS,
  PRV_MARKER_REASONS,
  PRV_RULE_ID,
  PRV_SETTING_KEYS,
  PRV_VERDICT_KEYS,
} from './portfolioReviewRegistry.js';

const L = PRV_LIMITS;
const DECIMAL_RE = /^\d+(\.\d+)?$/;
const EVIDENCE_SET = new Set(PRV_EVIDENCE_KIND_KEYS);
const VERDICT_SET = new Set(PRV_VERDICT_KEYS);
const MARKER_REASON_SET = new Set(Object.values(PRV_MARKER_REASONS));

export function prvDay(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const key = dayKey(trimmed);
  if (!key || key !== trimmed || key < L.dayMin || key > L.dayMax) return null;
  return key;
}

export function prvDaysBetween(from, to) {
  const a = prvDay(from);
  const b = prvDay(to);
  if (!a || !b) return null;
  const diff = daysBetween(`${a}T00:00:00.000Z`, `${b}T00:00:00.000Z`);
  return Number.isInteger(diff) ? diff : null;
}

export function prvText(value, max = 200) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\s+/g, ' ').trim().slice(0, max);
}

export function prvId(value, max = L.idMax) {
  const text = prvText(value, max);
  return text && /^[A-Za-z0-9._:-]+$/.test(text) ? text : null;
}

export function prvPersonId(value) {
  return prvId(value, L.personIdMax);
}

export function prvCurrency(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

/**
 * Parse user-supplied major-unit money text into whole integer cents ONCE via
 * `BigInt`. Commas, scientific notation, negatives, and >2 decimals are refused.
 */
export function parsePrvMoneyToCents(value, { allowZero = false } = {}) {
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
export function readStoredPrvCents(value, { allowZero = false } = {}) {
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

export function formatPrvMoney(currency, cents) {
  if (!currency || typeof cents !== 'number' || !Number.isSafeInteger(cents) || cents < 0) return '—';
  const big = BigInt(cents);
  const whole = (big / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = String(big % 100n).padStart(2, '0');
  return `${currency} ${whole}.${frac}`;
}

function pushWarn(warnings, message) {
  if (Array.isArray(warnings) && warnings.length < 100) warnings.push(message);
}

export function normalizePortfolioUnits(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.unitsMax) {
      pushWarn(warnings, `portfolioUnits: capped at ${L.unitsMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'portfolioUnits: dropped non-object row.');
      continue;
    }
    const id = prvId(item.id);
    if (!id || seenIds.has(id)) {
      pushWarn(warnings, `portfolioUnits: dropped row with missing or duplicate id "${prvText(item?.id, 40)}".`);
      continue;
    }
    const name = prvText(item.name, L.labelMax + 1);
    if (name.length < L.labelMin || name.length > L.labelMax) {
      pushWarn(warnings, `portfolioUnits(${id}): dropped row with out-of-bounds name.`);
      continue;
    }
    const owningLineHolderId = prvPersonId(item.owningLineHolderId);
    const currency = prvCurrency(item.currency);
    const reviewDueOn = prvDay(item.reviewDueOn);
    const declaredOn = prvDay(item.declaredOn);
    const declaredById = prvPersonId(item.declaredById);
    const basis = prvText(item.basis, L.basisMax + 1);
    if (!owningLineHolderId || !currency || !reviewDueOn || !declaredOn || !declaredById
      || basis.length < L.basisMin || basis.length > L.basisMax) {
      pushWarn(warnings, `portfolioUnits(${id}): dropped row with missing owner, currency, dates, or basis.`);
      continue;
    }

    const hasRetiredOn = item.retiredOn !== null && item.retiredOn !== undefined && item.retiredOn !== '';
    const hasRetiredBy = Boolean(prvText(item.retiredById, L.personIdMax));
    const hasRetireReason = Boolean(prvText(item.retirementReason, L.reasonMax + 1));
    let retiredOn = null;
    let retiredById = '';
    let retirementReason = '';
    if (hasRetiredOn || hasRetiredBy || hasRetireReason) {
      retiredOn = prvDay(item.retiredOn);
      retiredById = prvPersonId(item.retiredById) || '';
      retirementReason = prvText(item.retirementReason, L.reasonMax + 1);
      if (!retiredOn || retiredOn < declaredOn || !retiredById
        || retirementReason.length < L.reasonMin || retirementReason.length > L.reasonMax) {
        pushWarn(warnings, `portfolioUnits(${id}): dropped row with incomplete or pre-dated retirement fields.`);
        continue;
      }
    }

    seenIds.add(id);
    out.push({
      id,
      name,
      owningLineHolderId,
      currency,
      reviewDueOn,
      declaredOn,
      declaredById,
      basis,
      retiredOn,
      retiredById,
      retirementReason,
    });
  }
  return out;
}

export function normalizePortfolioReviews(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.reviewsMax) {
      pushWarn(warnings, `portfolioReviews: capped at ${L.reviewsMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'portfolioReviews: dropped non-object row.');
      continue;
    }
    const id = prvId(item.id);
    const unitId = prvId(item.unitId);
    if (!id || !unitId || seenIds.has(id)) {
      pushWarn(warnings, `portfolioReviews: dropped row with invalid or duplicate id "${prvText(item?.id, 40)}".`);
      continue;
    }
    const assessedOn = prvDay(item.assessedOn);
    const assessedById = prvPersonId(item.assessedById);
    const basis = prvText(item.basis, L.basisMax + 1);
    if (!assessedOn || !assessedById || basis.length < L.basisMin || basis.length > L.basisMax) {
      pushWarn(warnings, `portfolioReviews(${id}): dropped row without valid date, assessor, or basis.`);
      continue;
    }
    const measuredCents = readStoredPrvCents(item.measuredCents, { allowZero: true });
    if (measuredCents === null) {
      pushWarn(warnings, `portfolioReviews(${id}): dropped row without integer measured cents.`);
      continue;
    }
    const evidenceKind = prvText(item.evidenceKind, 32);
    const evidenceId = prvText(item.evidenceId, L.evidenceIdMax + 1);
    if (!EVIDENCE_SET.has(evidenceKind) || !evidenceId || evidenceId.length > L.evidenceIdMax) {
      pushWarn(warnings, `portfolioReviews(${id}): dropped row without valid evidenceKind and evidenceId.`);
      continue;
    }
    seenIds.add(id);
    out.push({
      id,
      unitId,
      assessedOn,
      assessedById,
      basis,
      measuredCents,
      evidenceKind,
      evidenceId,
    });
  }
  return out;
}

export function normalizePortfolioVerdicts(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.verdictsMax) {
      pushWarn(warnings, `portfolioVerdicts: capped at ${L.verdictsMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'portfolioVerdicts: dropped non-object row.');
      continue;
    }
    const id = prvId(item.id);
    const unitId = prvId(item.unitId);
    if (!id || !unitId || seenIds.has(id)) {
      pushWarn(warnings, `portfolioVerdicts: dropped row with invalid or duplicate id "${prvText(item?.id, 40)}".`);
      continue;
    }
    const verdict = prvText(item.verdict, 16);
    if (!VERDICT_SET.has(verdict)) {
      pushWarn(warnings, `portfolioVerdicts(${id}): dropped row with unknown verdict.`);
      continue;
    }
    const reviewId = prvId(item.reviewId);
    if (!reviewId) { pushWarn(warnings, `portfolioVerdicts(${id}): missing reviewed evidence reference.`); continue; }
    const decidedOn = prvDay(item.decidedOn);
    const decidedById = prvPersonId(item.decidedById);
    const rationale = prvText(item.rationale, L.rationaleMax + 1);
    if (!decidedOn || !decidedById || rationale.length < L.rationaleMin || rationale.length > L.rationaleMax) {
      pushWarn(warnings, `portfolioVerdicts(${id}): dropped row without valid date, decider, or rationale.`);
      continue;
    }

    let expectedProceedsCents = null;
    let expectedOn = null;
    let reReviewOn = null;

    if (verdict === 'keep') {
      if ((item.expectedProceedsCents !== null && item.expectedProceedsCents !== undefined)
        || (item.expectedOn !== null && item.expectedOn !== undefined)
        || (item.reReviewOn !== null && item.reReviewOn !== undefined)) {
        pushWarn(warnings, `portfolioVerdicts(${id}): dropped keep verdict carrying fix/sell fields.`);
        continue;
      }
    } else if (verdict === 'fix') {
      if ((item.expectedProceedsCents !== null && item.expectedProceedsCents !== undefined)
        || (item.expectedOn !== null && item.expectedOn !== undefined)) {
        pushWarn(warnings, `portfolioVerdicts(${id}): dropped fix verdict carrying sell fields.`);
        continue;
      }
      reReviewOn = prvDay(item.reReviewOn);
      if (!reReviewOn || reReviewOn <= decidedOn) {
        pushWarn(warnings, `portfolioVerdicts(${id}): dropped fix verdict without a future re-review date.`);
        continue;
      }
    } else if (verdict === 'sell' || verdict === 'exit') {
      if (item.reReviewOn !== null && item.reReviewOn !== undefined) {
        pushWarn(warnings, `portfolioVerdicts(${id}): dropped ${verdict} verdict carrying re-review field.`);
        continue;
      }
      expectedProceedsCents = readStoredPrvCents(item.expectedProceedsCents, { allowZero: true });
      expectedOn = prvDay(item.expectedOn);
      if (expectedProceedsCents === null || !expectedOn || expectedOn <= decidedOn) {
        pushWarn(warnings, `portfolioVerdicts(${id}): dropped ${verdict} verdict without proceeds and a future expected date.`);
        continue;
      }
    }

    seenIds.add(id);
    out.push({
      id,
      unitId,
      verdict,
      reviewId,
      decidedOn,
      decidedById,
      rationale,
      expectedProceedsCents,
      expectedOn,
      reReviewOn,
    });
  }
  return out;
}

export function normalizePortfolioMilestones(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.milestonesMax) {
      pushWarn(warnings, `portfolioMilestones: capped at ${L.milestonesMax} rows.`);
      break;
    }
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'portfolioMilestones: dropped non-object row.');
      continue;
    }
    const id = prvId(item.id);
    const verdictId = prvId(item.verdictId);
    if (!id || !verdictId || seenIds.has(id)) {
      pushWarn(warnings, `portfolioMilestones: dropped row with invalid or duplicate id "${prvText(item?.id, 40)}".`);
      continue;
    }
    const label = prvText(item.label, L.labelMax + 1);
    const dueOn = prvDay(item.dueOn);
    if (label.length < L.labelMin || label.length > L.labelMax || !dueOn) {
      pushWarn(warnings, `portfolioMilestones(${id}): dropped row with out-of-bounds label or invalid due date.`);
      continue;
    }
    const hasDoneOn = item.doneOn !== null && item.doneOn !== undefined && item.doneOn !== '';
    const hasDoneBy = Boolean(prvText(item.doneById, L.personIdMax));
    let doneOn = null;
    let doneById = '';
    if (hasDoneOn || hasDoneBy) {
      doneOn = prvDay(item.doneOn);
      doneById = prvPersonId(item.doneById) || '';
      if (!doneOn || !doneById) {
        pushWarn(warnings, `portfolioMilestones(${id}): dropped row with incomplete completion fields.`);
        continue;
      }
    }
    const note = prvText(item.note, L.noteMax);
    seenIds.add(id);
    out.push({
      id,
      verdictId,
      label,
      dueOn,
      doneOn,
      doneById,
      note,
    });
  }
  return out;
}

export function normalizePortfolioMarkers(raw, warnings = null) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seenIds = new Set();
  for (const item of raw) {
    if (out.length >= L.markersMax) break;
    if (!item || typeof item !== 'object') {
      pushWarn(warnings, 'portfolioMarkers: dropped non-object marker.');
      continue;
    }
    const id = prvId(item.id);
    const signature = prvText(item.signature, 160);
    const reason = prvText(item.reason, 64);
    const observedOn = prvDay(item.observedOn);
    if (!id || seenIds.has(id) || !signature || !MARKER_REASON_SET.has(reason) || !observedOn) {
      pushWarn(warnings, 'portfolioMarkers: dropped malformed marker.');
      continue;
    }
    seenIds.add(id);
    out.push({
      id,
      ruleId: PRV_RULE_ID,
      signature,
      reason,
      observedOn,
      resolvedOn: prvDay(item.resolvedOn),
    });
  }
  return out;
}

export function normalizePortfolioSettings(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const rawDays = Number(source[PRV_SETTING_KEYS.reviewDays]);
  const reviewDays = Number.isFinite(rawDays)
    ? Math.min(PRV_BOUNDS.reviewDays.max, Math.max(PRV_BOUNDS.reviewDays.min, Math.round(rawDays)))
    : PRV_DEFAULTS.reviewDays;
  const autoPropagate = source[PRV_SETTING_KEYS.autoPropagate] === undefined
    ? PRV_DEFAULTS.autoPropagate
    : Boolean(source[PRV_SETTING_KEYS.autoPropagate]);
  return {
    [PRV_SETTING_KEYS.reviewDays]: reviewDays,
    [PRV_SETTING_KEYS.autoPropagate]: autoPropagate,
  };
}

export function prvAskSummary(signature) {
  return `${PRV_RULE_ID}|${signature}`;
}

export function parsePrvAskSummary(summary) {
  if (typeof summary !== 'string' || !summary.startsWith(`${PRV_RULE_ID}|`)) return null;
  const signature = summary.slice(PRV_RULE_ID.length + 1).trim();
  return signature || null;
}
