/**
 * app/core/domain/matrixInterfaceSchema.js — normalization and structural
 * validation for ADR-0162 (Schema v131).
 *
 * Stored collections:
 *   - `matrixInterfaceAgreements`: append-only dated bilateral human acts
 *     (`affirm` or `retire`), one side per record. Malformed, side-mismatched,
 *     undated, termless or reasonless records are DROPPED with explicit
 *     warnings — never repaired into synthetic agreements.
 *   - `matrixInterfaceMarkers`: bounded idempotency marker ledger for
 *     RULE-MIA-01.
 *
 * Settings conventions:
 *   - `matrixInterfaceDefaultTermDays`   (30..365, default 180)
 *   - `matrixInterfaceDueWarnDays`       (1..90, default 14)
 *   - `matrixInterfaceReviewAskDays`     (1..60, default 14)
 *   - `matrixInterfaceAutoPropagate`     (boolean, default true)
 */

import {
  MATRIX_INTERFACE_BOUNDS,
  MATRIX_INTERFACE_CONSULTATION_KEYS,
  MATRIX_INTERFACE_DEFAULTS,
  MATRIX_INTERFACE_LIMITS,
} from './matrixInterfaceRegistry.js';

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const isPlainObject = (v) => Boolean(v && typeof v === 'object' && !Array.isArray(v));

function clampInt(value, [min, max], fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function calendarDayOrNull(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === s ? s : null;
}

function isoOrNull(value) {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Canonical unordered pair key (`managerAId < managerBId`).
 * Refuses missing, identical, or separator-polluted IDs.
 */
export function canonicalPairKey(leftId, rightId) {
  const m1 = str(leftId).trim();
  const m2 = str(rightId).trim();
  if (!m1 || !m2 || m1 === m2 || m1.includes('|') || m2.includes('|')) return null;
  const [managerAId, managerBId] = m1 < m2 ? [m1, m2] : [m2, m1];
  return {
    pairKey: `${managerAId}|${managerBId}`,
    managerAId,
    managerBId,
  };
}

export function normalizeMatrixInterfaceSettings(raw = {}) {
  const src = isPlainObject(raw) ? raw : {};
  return {
    matrixInterfaceDefaultTermDays: clampInt(
      src.matrixInterfaceDefaultTermDays,
      MATRIX_INTERFACE_BOUNDS.termDays,
      MATRIX_INTERFACE_DEFAULTS.termDays,
    ),
    matrixInterfaceDueWarnDays: clampInt(
      src.matrixInterfaceDueWarnDays,
      MATRIX_INTERFACE_BOUNDS.dueWarnDays,
      MATRIX_INTERFACE_DEFAULTS.dueWarnDays,
    ),
    matrixInterfaceReviewAskDays: clampInt(
      src.matrixInterfaceReviewAskDays,
      MATRIX_INTERFACE_BOUNDS.reviewAskDays,
      MATRIX_INTERFACE_DEFAULTS.reviewAskDays,
    ),
    matrixInterfaceAutoPropagate: src.matrixInterfaceAutoPropagate !== false,
  };
}

export function normalizeMatrixInterfaceAgreements(raw, warnings = []) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seenIds = new Set();
  let dropped = 0;

  for (let i = 0; i < arr.length; i += 1) {
    const item = arr[i];
    if (!isPlainObject(item)) { dropped += 1; continue; }

    const id = str(item.id).trim();
    if (!id || seenIds.has(id)) { dropped += 1; continue; }

    const pair = canonicalPairKey(item.managerAId, item.managerBId);
    if (!pair || str(item.pairKey).trim() !== pair.pairKey) { dropped += 1; continue; }

    const actingSide = item.actingSide === 'a' || item.actingSide === 'b' ? item.actingSide : '';
    const actingManagerId = str(item.actingManagerId).trim();
    const expectedActor = actingSide === 'a' ? pair.managerAId : actingSide === 'b' ? pair.managerBId : '';
    if (!actingSide || actingManagerId !== expectedActor) { dropped += 1; continue; }

    const outcome = item.outcome === 'affirm' || item.outcome === 'retire' ? item.outcome : '';
    const decidedOn = calendarDayOrNull(item.decidedOn);
    if (!outcome || !decidedOn) { dropped += 1; continue; }

    const decidedBySeatId = str(item.decidedBySeatId).trim().slice(0, 80) || null;
    const via = str(item.via).trim().slice(0, 40) || 'action';
    const at = isoOrNull(item.at) || `${decidedOn}T00:00:00.000Z`;

    if (outcome === 'affirm') {
      const consultationRule = str(item.consultationRule).trim();
      const effectiveFrom = calendarDayOrNull(item.effectiveFrom);
      const reviewByOn = calendarDayOrNull(item.reviewByOn);
      const escalationSeatId = str(item.escalationSeatId).trim();
      const forumId = str(item.forumId).trim() || null;
      const basis = str(item.basis).trim().slice(0, MATRIX_INTERFACE_LIMITS.basisMax);

      if (
        !MATRIX_INTERFACE_CONSULTATION_KEYS.includes(consultationRule)
        || !effectiveFrom
        || !reviewByOn
        || reviewByOn < effectiveFrom
        || !escalationSeatId
        || basis.length < MATRIX_INTERFACE_LIMITS.basisMin
      ) {
        dropped += 1;
        continue;
      }

      seenIds.add(id);
      out.push({
        id,
        pairKey: pair.pairKey,
        managerAId: pair.managerAId,
        managerBId: pair.managerBId,
        actingSide,
        actingManagerId,
        outcome: 'affirm',
        consultationRule,
        effectiveFrom,
        reviewByOn,
        forumId,
        escalationSeatId,
        basis,
        reason: '',
        decidedOn,
        decidedBySeatId,
        via,
        at,
      });
      continue;
    }

    // `retire` act requires an explicit written reason
    const reason = str(item.reason).trim().slice(0, MATRIX_INTERFACE_LIMITS.reasonMax);
    if (reason.length < MATRIX_INTERFACE_LIMITS.reasonMin) {
      dropped += 1;
      continue;
    }

    seenIds.add(id);
    out.push({
      id,
      pairKey: pair.pairKey,
      managerAId: pair.managerAId,
      managerBId: pair.managerBId,
      actingSide,
      actingManagerId,
      outcome: 'retire',
      consultationRule: null,
      effectiveFrom: null,
      reviewByOn: null,
      forumId: null,
      escalationSeatId: null,
      basis: '',
      reason,
      decidedOn,
      decidedBySeatId,
      via,
      at,
    });
  }

  if (dropped) {
    warnings.push(`Matrix interface agreements: dropped ${dropped} malformed, forged-side, undated or incomplete record(s)`);
  }
  return out.slice(-MATRIX_INTERFACE_LIMITS.acts);
}

export function normalizeMatrixInterfaceMarkers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const m of arr) {
    if (!isPlainObject(m)) continue;
    const key = str(m.key).trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key: key.slice(0, 200),
      kind: str(m.kind).trim().slice(0, 40) || 'ask',
      pairKey: str(m.pairKey).trim().slice(0, 160) || '',
      apexId: str(m.apexId).trim().slice(0, 80) || '',
      state: str(m.state).trim().slice(0, 40) || '',
      taskId: str(m.taskId).trim().slice(0, 80) || '',
      recordedOn: calendarDayOrNull(m.recordedOn) || null,
      summary: str(m.summary).trim().slice(0, 300),
    });
  }
  return out.slice(-MATRIX_INTERFACE_LIMITS.markers);
}
