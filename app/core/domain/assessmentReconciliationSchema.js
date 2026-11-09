/**
 * app/core/domain/assessmentReconciliationSchema.js — fail-closed normalizers
 * for Cross-line assessment reconciliation (ADR-0151, Schema v126).
 *
 * WHAT IS STORED, AND WHERE
 * -------------------------
 * Nothing new at the top level. An optional `signal` field on
 * `stewardship.answers[]` records the declaring line holder's coarse
 * assessment on the shared scale. The field lives on the answer because it is
 * ABOUT one review, for ONE line, in ONE period, and must freeze with that
 * answer. No new collection is added.
 *
 * WHAT IS NEVER STORED
 * --------------------
 *  - a thin flag, a divergence verdict, an alignment badge or a count. Every one
 *    is DERIVED on read from the stored answers plus the stewardship state, so
 *    a printed reconciliation cannot drift from the record that produced it.
 *  - a second copy of the stewardship state or of the matrix lines.
 */

import {
  ASSESSMENT_RECONCILIATION_BOUNDS,
  ASSESSMENT_RECONCILIATION_DEFAULTS,
  ASSESSMENT_SIGNAL_KEYS,
} from './assessmentReconciliationRegistry.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function clampInt(value, [min, max], fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeAssessmentReconciliationSettings(settings = {}) {
  const source = isPlainObject(settings) ? settings : {};
  return {
    assessmentReconciliationThinChars: clampInt(
      source.assessmentReconciliationThinChars,
      ASSESSMENT_RECONCILIATION_BOUNDS.thinChars,
      ASSESSMENT_RECONCILIATION_DEFAULTS.thinChars,
    ),
    assessmentReconciliationThinRatio: clampInt(
      source.assessmentReconciliationThinRatio,
      ASSESSMENT_RECONCILIATION_BOUNDS.thinRatio,
      ASSESSMENT_RECONCILIATION_DEFAULTS.thinRatio,
    ),
    assessmentReconciliationDivergentSteps: clampInt(
      source.assessmentReconciliationDivergentSteps,
      ASSESSMENT_RECONCILIATION_BOUNDS.divergentSteps,
      ASSESSMENT_RECONCILIATION_DEFAULTS.divergentSteps,
    ),
  };
}

export const ASSESSMENT_RECONCILIATION_DEFAULTS_RESOLVED = Object.freeze(
  normalizeAssessmentReconciliationSettings({}),
);

/** Valid signals for an answer — `null` means \"the holder left this blank\". */
export function normalizeAssessmentSignal(value) {
  const key = text(value, 40);
  return ASSESSMENT_SIGNAL_KEYS.includes(key) ? key : null;
}
