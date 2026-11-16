/**
 * app/core/domain/undertakingMath.js — the exact arithmetic and the
 * deterministic ask signatures of the Undertaking Closure Register (ADR-0234,
 * `RULE-UDT-01`).
 *
 * Nothing here rounds, divides with floats or repairs a row. The one rate the
 * register publishes is EXACT FLOOR BASIS POINTS over exact integer counts, and
 * a rate whose denominator is zero or unreadable is null — printed blank with
 * its reason, never as zero.
 *
 * The rule's signatures are deterministic in the undertaking id (and the line
 * id where the condition belongs to a line), so a scan and a post-commit run
 * file the same ask and never two.
 */

import { UDT_LIMITS as L } from './undertakingRegistry.js';

/** Floor basis points `numerator * 10000 / denominator`; null when unsupported. */
export function udtBp(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0) return null;
  return Math.floor((n * 10000) / d);
}

export const udtLineSignature = (undertakingId, lineId) => `udt1:line:${String(undertakingId || '').trim()}|${String(lineId || '').trim()}`;
export const udtReportSignature = (undertakingId) => `udt1:report:${String(undertakingId || '').trim()}`;
export const udtLapseSignature = (undertakingId) => `udt1:lapse:${String(undertakingId || '').trim()}`;
export const udtNotifySignature = (undertakingId) => `udt1:notify:${String(undertakingId || '').trim()}`;
export const udtAssignSignature = (undertakingId) => `udt1:assign:${String(undertakingId || '').trim()}`;

const UDT_ASK_PREFIX = 'udt1-ask';

export function udtAskSummary(signature) {
  return `${UDT_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseUdtAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(UDT_ASK_PREFIX)) return null;
  const signature = raw.slice(UDT_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/**
 * Due-window buckets — undertakings by how many days remain before the due
 * day. `past` is the lapsed band: the day has gone and the counterparty has
 * still not been told.
 */
export const UDT_WINDOW_BUCKETS = Object.freeze([
  Object.freeze({ key: 'past', label: 'Due day passed, unreported', min: -Infinity, max: -1 }),
  Object.freeze({ key: '0-14', label: '0–14 days to the due day', min: 0, max: 14 }),
  Object.freeze({ key: '15-60', label: '15–60 days to the due day', min: 15, max: 60 }),
  Object.freeze({ key: '61+', label: 'More than 60 days to the due day', min: 61, max: Infinity }),
]);

export function udtWindowBucket(daysRemaining) {
  const days = Number(daysRemaining);
  if (!Number.isFinite(days)) return null;
  const bucket = UDT_WINDOW_BUCKETS.find((row) => days >= row.min && days <= row.max);
  return bucket ? bucket.key : null;
}

/** The privacy floor the register publishes below: three, named once. */
export const UDT_FLOOR = L.privacyFloor;
