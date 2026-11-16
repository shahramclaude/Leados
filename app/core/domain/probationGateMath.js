/**
 * app/core/domain/probationGateMath.js — the exact arithmetic and the
 * deterministic ask signatures of the Probation Confirmation Gate Register
 * (ADR-0233, `RULE-PBG-01`).
 *
 * Nothing here rounds, divides with floats or repairs a row. The one rate the
 * register publishes is EXACT FLOOR BASIS POINTS over exact integer counts,
 * and a rate whose denominator is zero or unreadable is null — printed blank
 * with its reason, never as zero.
 *
 * The rule's signatures are deterministic in the gate id (and the line id
 * where the condition belongs to a line), so a scan and a post-commit run file
 * the same ask and never two.
 */

import { PBG_LIMITS as L } from './probationRegistry.js';

/** Floor basis points `numerator * 10000 / denominator`; null when unsupported. */
export function pbgBp(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0) return null;
  return Math.floor((n * 10000) / d);
}

export const pbgEvidenceSignature = (gateId, lineId) => `pbg1:evidence:${String(gateId || '').trim()}|${String(lineId || 'home').trim()}`;
export const pbgDecisionSignature = (gateId) => `pbg1:decision:${String(gateId || '').trim()}`;
export const pbgLapseSignature = (gateId) => `pbg1:lapse:${String(gateId || '').trim()}`;
export const pbgNotifySignature = (gateId) => `pbg1:notify:${String(gateId || '').trim()}`;

const PBG_ASK_PREFIX = 'pbg1-ask';

export function pbgAskSummary(signature) {
  return `${PBG_ASK_PREFIX} ${String(signature || '').trim()}`;
}

export function parsePbgAskSummary(text) {
  const raw = String(text || '').trim();
  if (!raw.startsWith(PBG_ASK_PREFIX)) return null;
  const signature = raw.slice(PBG_ASK_PREFIX.length).trim();
  return signature ? { signature } : null;
}

/**
 * Decision-window buckets — open gates by how many days remain before the
 * effective end day. `past` is the lapsed band: the day has gone and the
 * register is still waiting for a decision.
 */
export const PBG_WINDOW_BUCKETS = Object.freeze([
  Object.freeze({ key: 'past', label: 'Window day passed, undecided', min: -Infinity, max: -1 }),
  Object.freeze({ key: '0-7', label: '0–7 days to the window day', min: 0, max: 7 }),
  Object.freeze({ key: '8-30', label: '8–30 days to the window day', min: 8, max: 30 }),
  Object.freeze({ key: '31+', label: 'More than 30 days to the window day', min: 31, max: Infinity }),
]);

export function pbgWindowBucket(daysRemaining) {
  const days = Number(daysRemaining);
  if (!Number.isFinite(days)) return null;
  const bucket = PBG_WINDOW_BUCKETS.find((row) => days >= row.min && days <= row.max);
  return bucket ? bucket.key : null;
}

/** The privacy floor the register publishes below: three, named once. */
export const PBG_FLOOR = L.privacyFloor;
