/**
 * app/core/domain/assuranceFindingMath.js — the exact arithmetic and the
 * deterministic ask signatures of the Assurance Finding & Remediation Register
 * (ADR-0232, `RULE-AFR-01`).
 *
 * Nothing here rounds money, divides with floats or repairs a row. The rates
 * the register publishes are EXACT FLOOR BASIS POINTS over exact integer
 * counts, and a rate whose denominator is zero or unreadable is null — printed
 * blank with its reason, never as zero.
 *
 * The rule's signatures are deterministic in the finding id alone, so a scan
 * and a post-commit run file the same ask and never two.
 */

import { AFR_LIMITS as L } from './assuranceRegistry.js';

/** Floor basis points `numerator * 10000 / denominator`; null when unsupported. */
export function afrBp(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0) return null;
  return Math.floor((n * 10000) / d);
}

export const afrRemediationSignature = (findingId) => `afr1:remediation:${String(findingId || '').trim()}`;
export const afrVerificationSignature = (findingId) => `afr1:verification:${String(findingId || '').trim()}`;
export const afrRecurrenceSignature = (findingId) => `afr1:recurrence:${String(findingId || '').trim()}`;

const AFR_ASK_PREFIX = 'afr1-ask';

export function afrAskSummary(signature) {
  return `${AFR_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseAfrAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(AFR_ASK_PREFIX)) return null;
  const signature = raw.slice(AFR_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/** Aging buckets — open findings by how long they have been open. */
export const AFR_AGE_BUCKETS = Object.freeze([
  Object.freeze({ key: '0-30', label: '0–30 days open', min: 0, max: 30 }),
  Object.freeze({ key: '31-90', label: '31–90 days open', min: 31, max: 90 }),
  Object.freeze({ key: '91-180', label: '91–180 days open', min: 91, max: 180 }),
  Object.freeze({ key: '181+', label: '181 days or more', min: 181, max: Infinity }),
]);

export function afrAgeBucket(ageDays) {
  const days = Number(ageDays);
  if (!Number.isFinite(days) || days < 0) return null;
  const bucket = AFR_AGE_BUCKETS.find((row) => days >= row.min && days <= row.max);
  return bucket ? bucket.key : null;
}

/** The privacy floor the register publishes below: three, named once. */
export const AFR_FLOOR = L.privacyFloor;
