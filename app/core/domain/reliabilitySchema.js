/**
 * app/core/domain/reliabilitySchema.js — fail-closed schema normalizers for
 * `state.reliabilityReadings`, `state.reliabilityMarkers` and the Measurement
 * Reliability settings (Schema v77, ADR-0069).
 *
 * Invariants enforced on load/import:
 *  1. Ids are exact strings ≤ 80 chars; duplicates and overlong ids are dropped
 *     rather than truncated into dangling references.
 *  2. A reading with no freeze date is not a forecast; it is dropped.
 *  3. A reading that claims a grade without a later re-estimation is returned to
 *     `frozen` and counted. A grade dated before the freeze cannot exist.
 *  4. **No person identifier is admitted.** A frozen reading is aggregate-only by
 *     contract: counts, coefficients and probabilities. If an imported file
 *     carries a `personId`, `personIds`, `members` or `tiers` array of people,
 *     it is removed here rather than trusted downstream. This is the same
 *     boundary the Evidence Terminal holds, for the same reason: a frozen
 *     instrument reading must not become a second, unredacted copy of a person's
 *     standing that survives an export the rest of the app redacts.
 *  5. Every stored number is finite and inside its documented range. A figure
 *     outside it is nulled with a warning — an intraclass correlation of 1.4 is
 *     not a rounding error, it is a corrupted file.
 *  6. Personal-blame language is scrubbed from every note, so no imported file
 *     can smuggle a judgement about a person into a measurement finding.
 */

import {
  RELIABILITY_LIMITS,
  RELIABILITY_VERDICTS,
} from './reliabilityRegistry.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isObj(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function validId(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 && s.length <= 80 ? s : null;
}

function validDay(v) {
  if (typeof v !== 'string' || !DAY_RE.test(v)) return null;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10) === v ? v : null;
}

function validIso(v) {
  if (typeof v !== 'string' || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

/**
 * Blame scrubbing is duplicated (not imported) on purpose: the schema layer must
 * not depend on the registry's regex being present at load time, and an import
 * cycle through `schema.js` is exactly the failure this file exists to avoid.
 */
const BLAME = /\b(careless|lazy|incompetent|negligent|stupid|blamed?|fault of|human error|sloppy|poor performer|dead ?weight|low ?performer)\b/i;

function cleanNote(v, max) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return BLAME.test(s) ? '' : s.slice(0, max);
}

function finiteOrNull(v, { min = -1e12, max = 1e12, decimals = 4 } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function countOrNull(v, cap = 1e6) {
  const n = finiteOrNull(v, { min: 0, max: cap, decimals: 0 });
  return n === null ? null : n;
}

function probOrNull(v) {
  return finiteOrNull(v, { min: 0, max: 1, decimals: 4 });
}

function normalizeDesign(raw) {
  if (!isObj(raw)) return null;
  return {
    persons: countOrNull(raw.persons),
    occasions: countOrNull(raw.occasions),
    observations: countOrNull(raw.observations),
    medianObsPerPerson: countOrNull(raw.medianObsPerPerson),
    balanceRatio: finiteOrNull(raw.balanceRatio, { min: 0, max: 100, decimals: 2 }),
  };
}

function normalizeGrade(raw, frozenAt, warnings, id) {
  if (!isObj(raw)) return null;
  const gradedAt = validIso(raw.gradedAt);
  if (!gradedAt) return null;
  if (gradedAt <= frozenAt) {
    warnings?.push(`Reliability readings: ${id} carried a grade dated before its freeze; returned to frozen.`);
    return null;
  }
  return {
    gradedAt,
    icc: finiteOrNull(raw.icc, { min: 0, max: 1, decimals: 4 }),
    tiers: countOrNull(raw.tiers, 10000),
    pairs: countOrNull(raw.pairs, 100000),
    indistinguishablePairs: countOrNull(raw.indistinguishablePairs, 100000),
    newObservations: countOrNull(raw.newObservations, 100000),
    exceeded: raw.exceeded === true || raw.exceeded === false ? raw.exceeded : null,
    // Brier against the frozen probability, or null when the window lapsed.
    brier: finiteOrNull(raw.brier, { min: 0, max: 1, decimals: 4 }),
    note: cleanNote(raw.note, RELIABILITY_LIMITS.maxNotes),
  };
}

export function normalizeReliabilityReadings(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, RELIABILITY_LIMITS.maxReadings)) {
    if (!isObj(item)) continue;
    const id = validId(item.id);
    const frozenAt = validIso(item.frozenAt);
    if (!id || !frozenAt || seen.has(id)) continue;
    const frozenOn = validDay(item.frozenOn) || frozenAt.slice(0, 10);
    const grade = normalizeGrade(item.grade, frozenAt, warnings, id);
    // Invariant 4: a frozen reading is aggregate-only. Anything naming a person,
    // or listing the tiers as members rather than as a count, is discarded here.
    if (item.personId || Array.isArray(item.personIds) || Array.isArray(item.members)
      || (Array.isArray(item.tiers) && item.tiers.some((t) => t && typeof t === 'object' && t.personId))) {
      warnings?.push(`Reliability readings: ${id} carried person-level fields; they were removed. A frozen reading is aggregate-only by contract.`);
    }
    seen.add(id);
    out.push({
      id,
      label: cleanText(item.label, RELIABILITY_LIMITS.maxLabel),
      instrument: 'review',
      frozenAt,
      frozenOn,
      horizonDays: finiteOrNull(item.horizonDays, { min: 14, max: 730, decimals: 0 }) ?? 90,
      status: grade ? 'graded' : 'frozen',
      design: normalizeDesign(item.design),
      icc: finiteOrNull(item.icc, { min: 0, max: 1, decimals: 4 }),
      tau: finiteOrNull(item.tau, { min: 0, max: 1e6, decimals: 6 }),
      sigma: finiteOrNull(item.sigma, { min: 0, max: 1e6, decimals: 6 }),
      occasionShare: finiteOrNull(item.occasionShare, { min: 0, max: 1, decimals: 4 }),
      verdict: RELIABILITY_VERDICTS.includes(item.verdict) ? item.verdict : 'insufficient',
      thresholdPct: finiteOrNull(item.thresholdPct, { min: 1, max: 99, decimals: 0 }),
      predictedExceed: probOrNull(item.predictedExceed),
      tierCount: countOrNull(item.tierCount, 10000),
      pairCount: countOrNull(item.pairCount, 100000),
      indistinguishablePairs: countOrNull(item.indistinguishablePairs, 100000),
      predictedStablePairs: countOrNull(item.predictedStablePairs, 100000),
      predictedTopTierSize: countOrNull(item.predictedTopTierSize, 10000),
      grade,
      history: (Array.isArray(item.history) ? item.history : [])
        .filter(isObj)
        .slice(-RELIABILITY_LIMITS.maxHistory)
        .map((h) => ({
          at: validIso(h.at) || frozenAt,
          type: cleanText(h.type, 40) || 'updated',
          summary: cleanNote(h.summary, 300),
        })),
      updatedAt: validIso(item.updatedAt) || frozenAt,
    });
  }
  return out;
}

const MARKER_KINDS = ['observation', 'qualify', 'temper', 'converge'];

export function normalizeReliabilityMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, RELIABILITY_LIMITS.maxMarkers)) {
    if (!isObj(item)) continue;
    const key = cleanText(item.key, 160);
    if (!key || seen.has(key)) continue;
    const kind = MARKER_KINDS.includes(item.kind) ? item.kind : null;
    const day = validDay(item.day);
    // A marker with no kind or no day can never be reconciled or idempotent.
    if (!kind || !day) continue;
    seen.add(key);
    out.push({
      key,
      kind,
      reviewId: cleanText(item.reviewId, 80),
      note: cleanNote(item.note, 240),
      day,
      createdAt: validIso(item.createdAt) || new Date(`${day}T00:00:00.000Z`).toISOString(),
    });
  }
  if (!MARKER_KINDS.every((k) => k)) warnings?.push('Reliability markers: an unknown marker kind was dropped.');
  return out;
}

export function normalizeReliabilitySettings(raw = {}) {
  const src = isObj(raw) ? raw : {};
  const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    reliabilityAutoPropagate: src.reliabilityAutoPropagate !== false,
    // The evidence floor is a convention the leader declares, not a statistic.
    reliabilityMinPersons: int(src.reliabilityMinPersons, 3, 12, RELIABILITY_LIMITS.minPersons),
    // The separability floor and the separation bar are two different bars and
    // they are deliberately separate settings: one asks whether the instrument
    // carries signal at all, the other how sure a pair-level call must be.
    reliabilityIccFloorPct: int(src.reliabilityIccFloorPct, 20, 90, RELIABILITY_LIMITS.iccFloorPct),
    reliabilitySeparationPct: int(src.reliabilitySeparationPct, 70, 99, RELIABILITY_LIMITS.separationPct),
    reliabilityTargetReliabilityPct: int(src.reliabilityTargetReliabilityPct, 50, 95, RELIABILITY_LIMITS.targetReliabilityPct),
  };
}

export const RELIABILITY_DEFAULT_SETTINGS = Object.freeze(normalizeReliabilitySettings({}));
