/**
 * app/core/domain/matrixRemedySchema.js — the stored shape of the Matrix Pattern
 * Repair Register (ADR-0170, Schema v136).
 *
 * `matrixRemedies` holds ONE thing: the dated, first-person act of naming an
 * owner and a review date for a recurring structural signature. Nothing else is
 * stored. No verdict, count, rate, window or "cleared" flag is written: every one
 * of those is re-derived on read from the decision log, so a printed figure
 * cannot drift from the record beneath it.
 *
 * Fail-closed: a row that does not carry every required field in its canonical
 * form is DROPPED with a printed warning. It is never repaired, because a
 * repaired owner or date would be an invented accountability.
 */

import { MATRIX_REMEDY_FINDING_KEYS, MATRIX_REMEDY_LIMITS } from './matrixRemedyRegistry.js';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDay(value) {
  if (typeof value !== 'string' || !ISO_DAY.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * The structural signature, in the one canonical string the concordance uses:
 * `JSON.stringify([kind, sortedUniqueLineKinds, sortedUniqueRightKeys])`.
 * A key that is not already canonical is refused, so two spellings of one
 * pattern can never both carry a remedy.
 */
export function canonicalSignatureKey(kind, lineKinds, rightKeys) {
  const lines = [...new Set((Array.isArray(lineKinds) ? lineKinds : []).map(String))].sort();
  const rights = [...new Set((Array.isArray(rightKeys) ? rightKeys : []).map(String))].sort();
  return JSON.stringify([String(kind), lines, rights]);
}

export function parseSignatureKey(key) {
  if (typeof key !== 'string' || !key) return null;
  let parsed;
  try { parsed = JSON.parse(key); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [kind, lineKinds, rightKeys] = parsed;
  if (!MATRIX_REMEDY_FINDING_KEYS.includes(kind)) return null;
  if (!Array.isArray(lineKinds) || !Array.isArray(rightKeys)) return null;
  if (!lineKinds.every((x) => typeof x === 'string' && x)) return null;
  if (!rightKeys.every((x) => typeof x === 'string' && x)) return null;
  const canonical = canonicalSignatureKey(kind, lineKinds, rightKeys);
  if (canonical !== key) return null;
  return { kind, lineKinds: [...lineKinds], rightKeys: [...rightKeys], signatureKey: key };
}

const clampText = (value, max) => String(value ?? '').trim().slice(0, max);

/** One stored remedy row, or null with nothing repaired. */
export function normalizeMatrixRemedy(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : '';
  const sig = parseSignatureKey(item.signatureKey);
  const ownerId = typeof item.ownerId === 'string' ? item.ownerId.trim() : '';
  const remedy = clampText(item.remedy, MATRIX_REMEDY_LIMITS.remedyChars);
  const decidedOn = isIsoDay(item.decidedOn) ? item.decidedOn : null;
  const reviewOn = isIsoDay(item.reviewOn) ? item.reviewOn : null;
  if (!id || !sig || !ownerId || ownerId.length > 80) return null;
  if (remedy.length < MATRIX_REMEDY_LIMITS.remedyMinChars) return null;
  if (!decidedOn || !reviewOn || reviewOn <= decidedOn) return null;
  if (item.status !== 'active') return null;
  return {
    id,
    signatureKey: sig.signatureKey,
    ownerId,
    remedy,
    basis: clampText(item.basis, MATRIX_REMEDY_LIMITS.basisChars),
    decidedOn,
    reviewOn,
    declaredAt: typeof item.declaredAt === 'string' ? item.declaredAt : null,
    declaredBySeatId: typeof item.declaredBySeatId === 'string' && item.declaredBySeatId ? item.declaredBySeatId : null,
    status: 'active',
  };
}

/**
 * Every stored row, normalised. Invalid rows and duplicate ids are dropped and
 * COUNTED into `warnings`; the count is printed, never hidden.
 */
export function normalizeMatrixRemedies(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  let dropped = 0;
  for (const item of raw) {
    const row = normalizeMatrixRemedy(item);
    if (!row || seen.has(row.id)) { dropped += 1; continue; }
    seen.add(row.id);
    out.push(row);
  }
  if (dropped && Array.isArray(warnings)) {
    warnings.push({ collection: 'matrixRemedies', dropped, reason: 'Rows failed the fail-closed normaliser and were dropped, not repaired.' });
  }
  return out;
}
