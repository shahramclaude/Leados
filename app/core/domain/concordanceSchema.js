/**
 * app/core/domain/concordanceSchema.js — fail-closed normalizers for the
 * Concordance Terminal (Schema v89, ADR-0082).
 *
 * A hostile or half-written blob must never produce a statistic. Every unknown
 * dimension key is dropped, every out-of-range rating becomes "not answered",
 * a round that claims to be closed without two sides is reopened with a warning
 * (a closed round with one side would publish an agreement figure computed
 * against nothing), and duplicate ids are removed rather than merged.
 */

import {
  CONCORDANCE_CONVENTION_DEFAULTS,
  CONCORDANCE_DIMENSION_KEYS,
  CONCORDANCE_LIMITS,
  CONCORDANCE_SCALE,
} from './concordanceRegistry.js';

const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const STATUSES = Object.freeze(['open', 'closed', 'withdrawn']);

function rating(v) {
  const n = Number(v);
  if (!Number.isInteger(n)) return null;
  return n >= 1 && n <= CONCORDANCE_SCALE ? n : null;
}

function normalizeItems(raw, warnings, id) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!object(item)) continue;
    const key = text(item.key);
    if (!CONCORDANCE_DIMENSION_KEYS.includes(key) || seen.has(key)) {
      if (key && !CONCORDANCE_DIMENSION_KEYS.includes(key)) warnings.push(`Concordance round ${id}: an unknown dimension was dropped.`);
      continue;
    }
    seen.add(key);
    const leader = rating(item.leader);
    const member = rating(item.member);
    if ((item.leader !== undefined && item.leader !== null && leader === null)
      || (item.member !== undefined && item.member !== null && member === null)) {
      warnings.push(`Concordance round ${id}: a rating outside 1–${CONCORDANCE_SCALE} was treated as not answered.`);
    }
    out.push({ key, leader, member });
  }
  return out;
}

/** One row per round; a malformed row is dropped, never repaired into a claim. */
export function normalizeConcordanceRound(raw, warnings = []) {
  if (!object(raw)) return null;
  const id = text(raw.id).slice(0, 80);
  const leaderId = text(raw.leaderId);
  const memberId = text(raw.memberId);
  if (!id || !leaderId || !memberId || leaderId === memberId) return null;
  const items = normalizeItems(raw.items, warnings, id);
  let status = STATUSES.includes(raw.status) ? raw.status : 'open';
  const leaderSubmittedAt = isoOrNull(raw.leaderSubmittedAt);
  const memberSubmittedAt = isoOrNull(raw.memberSubmittedAt);
  const bothIn = Boolean(leaderSubmittedAt && memberSubmittedAt) && items.some((i) => i.leader !== null && i.member !== null);
  if (status === 'closed' && !bothIn) {
    warnings.push(`Concordance round ${id}: claimed closed with a missing side and was reopened. An agreement figure against one side is not a figure.`);
    status = 'open';
  }
  if (status === 'closed' && !bothIn) return null;
  return {
    id,
    leaderId,
    memberId,
    cycle: text(raw.cycle).slice(0, CONCORDANCE_LIMITS.cycleChars) || 'unlabelled',
    openedOn: dayOrNull(raw.openedOn) || (isoOrNull(raw.openedAt) || '').slice(0, 10) || null,
    openedAt: isoOrNull(raw.openedAt),
    openedBy: text(raw.openedBy).slice(0, 80) || null,
    status,
    items,
    leaderSubmittedAt,
    memberSubmittedAt,
    leaderNote: text(raw.leaderNote).slice(0, CONCORDANCE_LIMITS.noteChars),
    memberNote: text(raw.memberNote).slice(0, CONCORDANCE_LIMITS.noteChars),
    closedOn: status === 'closed' ? dayOrNull(raw.closedOn) : dayOrNull(raw.closedOn),
    closedAt: status === 'closed' ? isoOrNull(raw.closedAt) : isoOrNull(raw.closedAt),
    withdrawnReason: text(raw.withdrawnReason).slice(0, 300),
    // The reporting path the round was opened against. A reorganisation makes a
    // saved draft stale instead of silently re-homing it to a different span.
    pathKey: text(raw.pathKey).slice(0, 16),
    createdAt: isoOrNull(raw.createdAt),
  };
}

export function normalizeConcordanceRounds(raw, warnings = [], { cap = CONCORDANCE_LIMITS.rounds } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const normalized = normalizeConcordanceRound(row, warnings);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  out.sort((a, b) => String(b.openedAt || b.openedOn || '').localeCompare(String(a.openedAt || a.openedOn || '')));
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Math.min(CONCORDANCE_LIMITS.rounds, Math.round(Number(cap))) : CONCORDANCE_LIMITS.rounds;
  if (out.length > limit) {
    warnings.push(`Concordance: ${out.length - limit} older round(s) beyond the ledger cap were left out of the read model — they were not deleted from the workspace.`);
    return out.slice(0, limit);
  }
  return out;
}

export function normalizeConcordanceMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== 'string' || !tag || out.includes(tag)) continue;
    out.push(tag.slice(0, 160));
  }
  const cap = CONCORDANCE_LIMITS.markers;
  if (out.length > cap) {
    warnings.push(`Concordance: ${out.length - cap} idempotency marker(s) beyond the cap were dropped; an explicit scan may re-grade an old round.`);
    return out.slice(out.length - cap);
  }
  return out;
}

export function normalizeConcordanceSettings(settings = {}) {
  const d = CONCORDANCE_CONVENTION_DEFAULTS;
  const within = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    concordanceAgreementFloorPct: within(settings.concordanceAgreementFloorPct, 20, 95, d.concordanceAgreementFloorPct),
    concordanceCellFloor: within(settings.concordanceCellFloor, 1, 50, d.concordanceCellFloor),
    concordanceEvidenceFloor: within(settings.concordanceEvidenceFloor, 1, 50, d.concordanceEvidenceFloor),
    concordanceRetestDays: within(settings.concordanceRetestDays, 3, 180, d.concordanceRetestDays),
    concordanceReviewDays: within(settings.concordanceReviewDays, 3, 90, d.concordanceReviewDays),
    concordanceAutoPropagate: settings.concordanceAutoPropagate === undefined
      ? d.concordanceAutoPropagate
      : bool(settings.concordanceAutoPropagate, d.concordanceAutoPropagate),
  };
}
