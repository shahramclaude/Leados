/**
 * app/core/domain/rqMath.js — the exact arithmetic, the reply clock and the
 * deterministic ask signatures of the Information-Request & Examination Response
 * Register (ADR-0235, `RULE-RQR-01`).
 *
 * Nothing here rounds, divides with floats or repairs a row. The one rate the
 * register publishes is EXACT FLOOR BASIS POINTS over exact integer counts, and
 * a rate whose denominator is zero or unreadable is null — printed blank with
 * its reason, never as zero.
 *
 * THE CLOCK IS DERIVED ONCE, HERE. `rqReplyDay` adds a DECLARED whole-day clock
 * to a DECLARED receipt day and refuses to answer when either is missing. There
 * is no default, no "usually 30", and no jurisdiction table anywhere in this
 * file — an invented deadline would be an invented fact, and the register would
 * then print a lapse that nobody set.
 *
 * The rule's signatures are deterministic in the request id (and the line id
 * where the condition belongs to a line), so a scan and a post-commit run file
 * the same ask and never two.
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { RQR_LIMITS as L } from './rqRegistry.js';

/** Floor basis points `numerator * 10000 / denominator`; null when unsupported. */
export function rqrBp(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0) return null;
  return Math.floor((n * 10000) / d);
}

/** Whole days between two day keys, or null. Integer, never a float. */
export const rqrDayDiff = (fromDay, toDay) => daysBetween(fromDay, toDay);

/**
 * THE REPLY DAY. `receivedOn` plus the DECLARED clock, and null if either is
 * missing or unreadable. A request with no declared clock has no reply day on
 * this register — it does not get a courtesy deadline, and it cannot lapse on a
 * date nobody set.
 */
export function rqReplyDay(receivedOn, clockDays) {
  const day = dayKey(String(receivedOn || '').slice(0, 10));
  const n = Number(clockDays);
  if (!day) return null;
  if (!Number.isInteger(n) || n < L.clockMinDays || n > L.clockMaxDays) return null;
  return addDays(day, n);
}

/** The privilege claim over material a line has NOT produced, as stored. */
export const rqrPrivilegeShape = (raw) => ({
  claimed: raw.claimed === true,
  withheldCount: Number.isInteger(raw.withheldCount) && raw.withheldCount >= 0 ? raw.withheldCount : null,
  basis: typeof raw.basis === 'string' ? raw.basis : '',
});

export const rqrLineSignature = (requestId, lineId) => `rqr1:line:${String(requestId || '').trim()}|${String(lineId || '').trim()}`;
export const rqrReleaseSignature = (requestId) => `rqr1:release:${String(requestId || '').trim()}`;
export const rqrLapseSignature = (requestId) => `rqr1:lapse:${String(requestId || '').trim()}`;
export const rqrResponseSignature = (requestId) => `rqr1:respond:${String(requestId || '').trim()}`;
export const rqrAssignSignature = (requestId) => `rqr1:assign:${String(requestId || '').trim()}`;
export const rqrPrivilegeSignature = (requestId, lineId) => `rqr1:privilege:${String(requestId || '').trim()}|${String(lineId || '').trim()}`;

const RQR_ASK_PREFIX = 'rqr1-ask';

export function rqrAskSummary(signature) {
  return `${RQR_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parseRqrAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(RQR_ASK_PREFIX)) return null;
  const signature = raw.slice(RQR_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/**
 * Reply-window buckets — requests by how many days remain before the reply day.
 * `past` is the lapsed band: the requester's day has gone and nothing has been
 * released.
 */
export const RQR_WINDOW_BUCKETS = Object.freeze([
  Object.freeze({ key: 'past', label: 'Reply day passed, nothing released', min: -Infinity, max: -1 }),
  Object.freeze({ key: '0-14', label: '0–14 days to the reply day', min: 0, max: 14 }),
  Object.freeze({ key: '15-60', label: '15–60 days to the reply day', min: 15, max: 60 }),
  Object.freeze({ key: '61+', label: 'More than 60 days to the reply day', min: 61, max: Infinity }),
]);

export function rqrWindowBucket(daysRemaining) {
  const days = Number(daysRemaining);
  if (!Number.isFinite(days)) return null;
  const bucket = RQR_WINDOW_BUCKETS.find((row) => days >= row.min && days <= row.max);
  return bucket ? bucket.key : null;
}

/** The privacy floor the register publishes below: three, named once. */
export const RQR_FLOOR = L.privacyFloor;
