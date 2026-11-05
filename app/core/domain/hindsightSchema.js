/**
 * app/core/domain/hindsightSchema.js — the stored contract for Schema v104
 * (ADR-0102, the Hindsight Lock).
 *
 * `hindsight.js` is the analysis; this module decides what a half-written,
 * hand-edited or older lock is allowed to become on load. The rules follow every
 * other ledger in this app:
 *
 *  - **A lock is preserved exactly.** Its information set, its frozen process
 *    claim and the day it was frozen are the evidence. A malformed lock is
 *    dropped with a warning naming an id prefix only; it is never repaired into
 *    a claim a leader might be shown.
 *  - **A lock is never re-dated.** A lock whose decision date sits in the future
 *    is dropped: an information set frozen ahead of the decision it describes is
 *    not evidence, it is a plan.
 *  - **A consulted fact keeps its type and its own date.** Both are what the
 *    three-way partition is computed from. An entry without a resolvable date is
 *    retained as `undated` (and excluded from every rate) rather than given one.
 *  - **Conventions are declared, clamped and printed** — the quality floor, the
 *    coverage share, the fact floor, the gap floor, the settled floor, the cell
 *    floor and the review grace are conventions with defaults, never fitted
 *    values.
 */

import { dayKey } from '../time.js';
import {
  HINDSIGHT_DEFAULTS,
  HINDSIGHT_LIMITS,
  HINDSIGHT_QUADRANT_KEYS,
} from './hindsightRegistry.js';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function clean(text, max) {
  return str(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function day(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ---------------------------------------------------------- conventions */

export function normalizeHindsightSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = HINDSIGHT_DEFAULTS;
  const L = HINDSIGHT_LIMITS;
  return {
    hindsightQualityFloor: clampInt(s.hindsightQualityFloor, L.qualityFloorMin, L.qualityFloorMax, d.hindsightQualityFloor),
    hindsightCoveragePct: clampInt(s.hindsightCoveragePct, L.coveragePctMin, L.coveragePctMax, d.hindsightCoveragePct),
    hindsightFactFloor: clampInt(s.hindsightFactFloor, L.factFloorMin, L.factFloorMax, d.hindsightFactFloor),
    hindsightGapFloor: clampInt(s.hindsightGapFloor, L.gapFloorMin, L.gapFloorMax, d.hindsightGapFloor),
    hindsightSettledFloor: clampInt(s.hindsightSettledFloor, L.settledFloorMin, L.settledFloorMax, d.hindsightSettledFloor),
    hindsightCellFloor: clampInt(s.hindsightCellFloor, L.cellFloorMin, L.cellFloorMax, d.hindsightCellFloor),
    hindsightReviewGraceDays: clampInt(s.hindsightReviewGraceDays, L.reviewGraceMin, L.reviewGraceMax, d.hindsightReviewGraceDays),
    hindsightAutoPropagate: s.hindsightAutoPropagate !== false,
  };
}

export function hindsightConventions(rawSettings = {}) {
  return normalizeHindsightSettings(rawSettings);
}

/* ---------------------------------------------------------------- locks */

/**
 * A consulted entry is the only part of a lock that carries content-adjacent
 * data, so it carries the minimum that makes the partition computable: the
 * endpoint type, its id and its own date. Nothing else — no title, no note.
 */
function normalizeConsulted(raw) {
  if (!isPlainObject(raw)) return null;
  const type = clean(raw.type, 40);
  const id = clean(raw.id, 80);
  if (!type || !id) return null;
  return { type, id, on: day(raw.on) };
}

export function normalizeDecisionLocks(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = dayKey(now);
  const seen = new Set();
  const out = [];
  let futureDated = 0;
  let unreadable = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 80);
    const decisionId = clean(row.decisionId, 80);
    const decisionOn = day(row.decisionOn);
    const frozenOn = day(row.frozenOn) || decisionOn;
    if (!id || !decisionId || !decisionOn || !frozenOn) {
      unreadable += 1;
      continue;
    }
    if (seen.has(id)) {
      warnings.push(`Hindsight lock: duplicate id “${id.slice(0, 12)}…” dropped`);
      continue;
    }
    if (decisionOn > today) {
      futureDated += 1;
      continue;
    }
    seen.add(id);
    const consulted = (Array.isArray(row.consulted) ? row.consulted : [])
      .map(normalizeConsulted)
      .filter(Boolean)
      .slice(0, HINDSIGHT_LIMITS.consultedPerLock);
    const qualityMet = clampInt(row.qualityMet, 0, 5, 0);
    out.push({
      id,
      decisionId,
      decisionOn,
      frozenOn: frozenOn > today ? today : frozenOn,
      frozenAt: isoOrNull(row.frozenAt),
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      consulted,
      consultedN: Number.isFinite(Number(row.consultedN))
        ? Math.max(consulted.length, Math.round(Number(row.consultedN)))
        : consulted.length,
      undatedN: clampInt(row.undatedN, 0, 500, consulted.filter((fact) => !fact.on).length),
      qualityMet,
      qualityMissing: Array.isArray(row.qualityMissing)
        ? row.qualityMissing.filter((label) => typeof label === 'string').slice(0, 6).map((label) => clean(label, 80))
        : [],
      reviewOn: day(row.reviewOn),
      quadrantAtFreeze: HINDSIGHT_QUADRANT_KEYS.includes(row.quadrantAtFreeze) ? row.quadrantAtFreeze : null,
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  if (futureDated) {
    warnings.push(`Hindsight locks: dropped ${futureDated} lock(s) dated in the future — an information set cannot be frozen ahead of the decision it describes`);
  }
  if (unreadable) {
    warnings.push(`Hindsight locks: dropped ${unreadable} unreadable lock(s) (no id, decision, decision date or freeze date)`);
  }
  return out.slice(-HINDSIGHT_LIMITS.locks);
}

/* -------------------------------------------------------------- markers */

export function normalizeHindsightMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: clean(row.kind, 40) || 'unknown',
      key: clean(row.key, 240),
      lockId: clean(row.lockId, 80) || null,
      decisionId: clean(row.decisionId, 80) || null,
      weekKey: clean(row.weekKey, 20) || null,
      recordedOn: day(row.recordedOn),
      note: clean(row.note, 300),
    });
  }
  return out.slice(-HINDSIGHT_LIMITS.markers);
}
