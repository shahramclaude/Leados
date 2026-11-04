/**
 * app/core/domain/boardSchema.js — fail-closed normalizers for the Board Room
 * (Schema v91, ADR-0085).
 *
 * A half-written or hostile blob must never become a disclosure. Every unknown
 * claim key is dropped, an out-of-range threshold becomes "not declared"
 * (which the evaluator refuses), a comparator is taken from the registry rather
 * than from the blob (so a stored record cannot flip a floor into a ceiling),
 * and a memo claiming to be committed without a frozen snapshot is reopened —
 * a committed memo with no snapshot is an assertion with a timestamp, which is
 * exactly what this module exists to prevent.
 */

import {
  BOARD_CLAIM_KEYS,
  BOARD_CONVENTION_DEFAULTS,
  BOARD_LIMITS,
  BOARD_STATUSES,
  boardClaim,
} from './boardRegistry.js';

const object = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const isoOrNull = (v) => (typeof v === 'string' && !Number.isNaN(Date.parse(v)) ? v : null);
const dayOrNull = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

function thresholdFor(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < BOARD_LIMITS.thresholdMin || rounded > BOARD_LIMITS.thresholdMax) return null;
  return rounded;
}

export function normalizeBoardClaims(raw, warnings = [], memoId = 'memo') {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!object(item)) continue;
    const key = text(item.key);
    const declared = boardClaim(key);
    if (!declared) {
      if (key) warnings.push(`Board memo ${memoId}: an undeclared claim (“${key.slice(0, 40)}”) was dropped. A claim no module can measure is not a claim.`);
      continue;
    }
    const threshold = thresholdFor(item.threshold);
    if (seen.has(key)) {
      // A duplicate is dropped, with one exception: a later VALID declaration
      // repairs an earlier row that could not be read. A missing threshold is
      // never repaired into a guess.
      const existing = out.find((row) => row.key === key);
      if (existing && existing.threshold === null && threshold !== null) {
        existing.threshold = threshold;
        existing.declaredAt = isoOrNull(item.declaredAt) || existing.declaredAt;
        existing.note = text(item.note).slice(0, BOARD_LIMITS.noteChars);
      }
      continue;
    }
    seen.add(key);
    if (threshold === null) {
      warnings.push(`Board memo ${memoId}: “${declared.label}” had no usable threshold in ${BOARD_LIMITS.thresholdMin}–${BOARD_LIMITS.thresholdMax}; it was kept as declared-without-threshold, which the terminal refuses to evaluate.`);
    }
    out.push({
      key,
      // The comparator and unit are ALWAYS the registry's. A stored blob cannot
      // reverse the direction of a test after the fact.
      comparator: declared.comparator,
      unit: declared.unit,
      threshold,
      declaredAt: isoOrNull(item.declaredAt) || isoOrNull(item.createdAt) || null,
      declaredBy: text(item.declaredBy).slice(0, 80) || null,
      lookedAt: isoOrNull(item.lookedAt),
      lastLookAt: isoOrNull(item.lastLookAt) || isoOrNull(item.lookedAt),
      revisedAfterLook: item.revisedAfterLook === true,
      revisionCount: Math.max(0, Math.round(Number(item.revisionCount) || 0)),
      note: text(item.note).slice(0, BOARD_LIMITS.noteChars),
    });
  }
  // Registry order keeps the memo's argument stable across edits.
  out.sort((a, b) => BOARD_CLAIM_KEYS.indexOf(a.key) - BOARD_CLAIM_KEYS.indexOf(b.key));
  return out.slice(0, BOARD_LIMITS.claims);
}

function normalizeSnapshot(raw, warnings = [], memoId = 'memo') {
  if (!object(raw)) return null;
  const rows = Array.isArray(raw.claims) ? raw.claims : [];
  if (!rows.length) return null;
  const claims = [];
  for (const row of rows) {
    if (!object(row)) continue;
    const declared = boardClaim(text(row.key));
    if (!declared) continue;
    const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
    claims.push({
      key: declared.key,
      verdict: text(row.verdict).slice(0, 24) || 'refused',
      value: num(row.value),
      lower: num(row.lower),
      upper: num(row.upper),
      n: Number.isFinite(Number(row.n)) ? Math.max(0, Math.round(Number(row.n))) : 0,
      threshold: thresholdFor(row.threshold),
      tag: text(row.tag).slice(0, 24) || 'refused',
    });
  }
  if (!claims.length) return null;
  if (!isoOrNull(raw.takenAt)) warnings.push(`Board memo ${memoId}: the frozen snapshot had no timestamp and was ignored.`);
  return {
    takenAt: isoOrNull(raw.takenAt),
    fingerprint: text(raw.fingerprint).slice(0, 8) || null,
    claims,
  };
}

export function normalizeBoardMemo(raw, warnings = []) {
  if (!object(raw)) return null;
  const id = text(raw.id).slice(0, 80);
  if (!id) return null;
  const title = text(raw.title).slice(0, BOARD_LIMITS.titleChars) || 'Board disclosure memorandum';
  const claims = normalizeBoardClaims(raw.claims, warnings, id);
  let status = BOARD_STATUSES.includes(raw.status) ? raw.status : 'draft';
  const committedAt = isoOrNull(raw.committedAt);
  const frozenAt = isoOrNull(raw.frozenAt);
  let snapshot = normalizeSnapshot(raw.snapshot, warnings, id);
  if (status === 'committed' && (!committedAt || !snapshot)) {
    warnings.push(`Board memo ${id}: claimed COMMITTED with no frozen snapshot; reopened as a draft. A committed memo without a snapshot is an assertion, not a disclosure.`);
    status = 'draft';
  }
  if (status === 'frozen' && (!frozenAt || !snapshot)) {
    warnings.push(`Board memo ${id}: claimed FROZEN with no snapshot; reopened as a draft.`);
    status = 'draft';
  }
  if (status !== 'committed' && status !== 'frozen') snapshot = null;
  return {
    id,
    revision: Math.max(1, Math.round(Number(raw.revision) || 1)),
    title,
    cycle: text(raw.cycle).slice(0, 24) || '',
    status,
    ownerNodeId: text(raw.ownerNodeId).slice(0, 80) || null,
    ownerSeatId: text(raw.ownerSeatId).slice(0, 80) || null,
    claims,
    snapshot,
    lookCount: Math.max(0, Math.round(Number(raw.lookCount) || 0)),
    lastLookAt: isoOrNull(raw.lastLookAt),
    openedAt: isoOrNull(raw.openedAt) || isoOrNull(raw.createdAt),
    openedBy: text(raw.openedBy).slice(0, 80) || null,
    committedAt: status === 'committed' || status === 'frozen' ? committedAt : null,
    frozenAt: status === 'frozen' ? frozenAt : null,
    frozenBy: status === 'frozen' ? (text(raw.frozenBy).slice(0, 80) || null) : null,
    supersededAt: status === 'superseded' ? isoOrNull(raw.supersededAt) : null,
    supersededBy: status === 'superseded' ? (text(raw.supersededBy).slice(0, 80) || null) : null,
    createdAt: isoOrNull(raw.createdAt),
    updatedAt: isoOrNull(raw.updatedAt),
  };
}

export function normalizeBoardMemos(raw, warnings = [], { cap = BOARD_LIMITS.memos } = {}) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    const normalized = normalizeBoardMemo(row, warnings);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    out.push(normalized);
  }
  out.sort((a, b) => String(b.openedAt || b.createdAt || '').localeCompare(String(a.openedAt || a.createdAt || '')));
  const limit = Number.isFinite(Number(cap)) && Number(cap) > 0 ? Math.min(BOARD_LIMITS.memos, Math.round(Number(cap))) : BOARD_LIMITS.memos;
  if (out.length > limit) {
    warnings.push(`Board Room: ${out.length - limit} older memo(s) beyond the ledger cap were left out of the read model — they were not deleted from the workspace.`);
    return out.slice(0, limit);
  }
  return out;
}

export function normalizeBoardMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const tag of raw) {
    if (typeof tag !== 'string' || !tag || out.includes(tag)) continue;
    out.push(tag.slice(0, 160));
  }
  const cap = BOARD_LIMITS.markers;
  if (out.length > cap) {
    warnings.push(`Board Room: ${out.length - cap} idempotency marker(s) beyond the cap were dropped; an explicit scan may re-open an old obligation.`);
    return out.slice(out.length - cap);
  }
  return out;
}

export function normalizeBoardSettings(settings = {}) {
  const d = BOARD_CONVENTION_DEFAULTS;
  const within = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  return {
    boardCellFloor: within(settings.boardCellFloor, 1, 50, d.boardCellFloor),
    boardEvidenceFloor: within(settings.boardEvidenceFloor, 1, 20, d.boardEvidenceFloor),
    boardMaterialityPct: within(settings.boardMaterialityPct, 1, 90, d.boardMaterialityPct),
    boardRecheckDays: within(settings.boardRecheckDays, 7, 365, d.boardRecheckDays),
    boardAutoPropagate: settings.boardAutoPropagate === undefined
      ? d.boardAutoPropagate
      : bool(settings.boardAutoPropagate, d.boardAutoPropagate),
  };
}
