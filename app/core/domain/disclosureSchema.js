/**
 * app/core/domain/disclosureSchema.js — fail-closed normalizers for the
 * Disclosure Compiler (Schema v90, ADR-0086).
 *
 * A disclosure grant is the only record in LeadOS whose purpose is to widen who
 * may read something, so a half-written one must never be honoured. Every field
 * is re-derived: an unknown route or status drops the row, an expiry that has
 * already passed loads as `expired` rather than as live authority, and a grant
 * with no purpose, no consenting span or no requester is dropped outright — a
 * widened read that cannot say who asked, who agreed and why is not a record,
 * it is a hole.
 */

import {
  DISCLOSURE_CONVENTION_DEFAULTS,
  DISCLOSURE_LIMITS,
  GRANT_STATUSES,
} from './disclosureRegistry.js';
import { manifestFor } from './disclosureManifests.js';

const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function history(raw, now) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => object(row) && typeof row.summary === 'string')
    .slice(-DISCLOSURE_LIMITS.history)
    .map((row) => ({
      at: isoOrNull(row.at) || now,
      type: text(row.type).slice(0, 40) || 'updated',
      by: text(row.by).slice(0, 120),
      summary: text(row.summary).slice(0, 300),
    }));
}

/** One grant row. Returns null when the row could not be honoured safely. */
export function normalizeDisclosureGrant(raw, warnings = [], { now = new Date().toISOString(), today = null } = {}) {
  if (!object(raw)) return null;
  const id = text(raw.id).slice(0, 80);
  const route = text(raw.route).slice(0, 60);
  const manifest = manifestFor(route);
  if (!id || !route || !manifest) return null;
  const requesterId = text(raw.requesterId).slice(0, 80);
  const spanId = text(raw.spanId).slice(0, 80);
  const purpose = text(raw.purpose).trim().slice(0, DISCLOSURE_LIMITS.purposeChars);
  if (!requesterId || !spanId || purpose.length < DISCLOSURE_LIMITS.minPurposeChars) {
    warnings.push(`Disclosure grant ${id}: dropped — a released read needs a requester, a named span and a written purpose of at least ${DISCLOSURE_LIMITS.minPurposeChars} characters.`);
    return null;
  }
  if (requesterId === spanId) {
    warnings.push(`Disclosure grant ${id}: dropped — a span cannot request and consent to its own upward disclosure.`);
    return null;
  }
  let status = GRANT_STATUSES.includes(raw.status) ? raw.status : 'requested';
  const day = today || now.slice(0, 10);
  const expiresOn = dayOrNull(raw.expiresOn);
  const grantedOn = dayOrNull(raw.grantedOn);
  if (status === 'granted' && (!grantedOn || !expiresOn)) {
    warnings.push(`Disclosure grant ${id}: claimed granted without a consent date and an expiry; reopened as requested. Authority without an end date is not a grant.`);
    status = 'requested';
  }
  if (status === 'granted' && expiresOn && expiresOn < day) status = 'expired';
  const days = Math.round(Number(raw.days));
  return {
    id,
    route,
    moduleLabel: text(raw.moduleLabel).slice(0, 120) || manifest.label,
    collection: text(raw.collection).slice(0, 60),
    classKey: text(raw.classKey).slice(0, 20),
    requesterId,
    requesterSeatId: text(raw.requesterSeatId).slice(0, 80) || requesterId,
    spanId,
    spanLabel: text(raw.spanLabel).slice(0, 120),
    purpose,
    days: Number.isFinite(days) ? Math.min(DISCLOSURE_LIMITS.maxDays, Math.max(DISCLOSURE_LIMITS.minDays, days)) : DISCLOSURE_CONVENTION_DEFAULTS.disclosureMaxDays,
    status,
    requestedOn: dayOrNull(raw.requestedOn) || day,
    requestedAt: isoOrNull(raw.requestedAt) || now,
    consentFromId: status === 'granted' || status === 'expired' ? text(raw.consentFromId).slice(0, 80) || null : null,
    grantedOn: status === 'granted' || status === 'expired' ? grantedOn : null,
    grantedAt: status === 'granted' || status === 'expired' ? isoOrNull(raw.grantedAt) : null,
    expiresOn: status === 'granted' || status === 'expired' ? expiresOn : null,
    refusedOn: status === 'refused' ? dayOrNull(raw.refusedOn) : null,
    refusedReason: status === 'refused' ? text(raw.refusedReason).slice(0, 300) : '',
    revokedOn: status === 'revoked' ? dayOrNull(raw.revokedOn) : null,
    revokedReason: status === 'revoked' ? text(raw.revokedReason).slice(0, 300) : '',
    expiredOn: status === 'expired' ? dayOrNull(raw.expiredOn) || expiresOn || day : null,
    decisionId: text(raw.decisionId).slice(0, 80) || null,
    reviewOn: dayOrNull(raw.reviewOn),
    reviewedOn: dayOrNull(raw.reviewedOn),
    createdAt: isoOrNull(raw.createdAt) || now,
    history: history(raw.history, now),
  };
}

export function normalizeDisclosureGrants(raw, warnings = [], opts = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const row = normalizeDisclosureGrant(item, warnings, opts);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  out.sort((a, b) => String(b.requestedAt).localeCompare(String(a.requestedAt)));
  if (out.length > DISCLOSURE_LIMITS.grants) {
    warnings.push(`Disclosure: ${out.length - DISCLOSURE_LIMITS.grants} older grant(s) beyond the ledger cap are not in the read model — they were not deleted, and none of them authorise a read.`);
    return out.slice(0, DISCLOSURE_LIMITS.grants);
  }
  return out;
}

export function normalizeDisclosureMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== 'string' || !tag || out.includes(tag)) continue;
    out.push(tag.slice(0, 160));
  }
  if (out.length > DISCLOSURE_LIMITS.markers) {
    warnings.push(`Disclosure: ${out.length - DISCLOSURE_LIMITS.markers} idempotency marker(s) beyond the cap were dropped; an explicit scan may re-open an old review.`);
    return out.slice(out.length - DISCLOSURE_LIMITS.markers);
  }
  return out;
}

export function normalizeDisclosureSettings(settings = {}) {
  const d = DISCLOSURE_CONVENTION_DEFAULTS;
  const within = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    disclosureCellFloor: within(settings.disclosureCellFloor, 2, 50, d.disclosureCellFloor),
    disclosureMaxDays: within(settings.disclosureMaxDays, 1, DISCLOSURE_LIMITS.maxDays, d.disclosureMaxDays),
    disclosureMaxActiveGrants: within(settings.disclosureMaxActiveGrants, 1, 20, d.disclosureMaxActiveGrants),
    disclosureReviewDays: within(settings.disclosureReviewDays, 1, 90, d.disclosureReviewDays),
    disclosureAutoPropagate: settings.disclosureAutoPropagate === undefined
      ? d.disclosureAutoPropagate
      : bool(settings.disclosureAutoPropagate, d.disclosureAutoPropagate),
  };
}
