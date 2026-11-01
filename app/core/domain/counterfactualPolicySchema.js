/**
 * app/core/domain/counterfactualPolicySchema.js — fail-closed schema
 * normalizers for `state.policyEvaluations`, `state.policyMarkers` and the
 * Counterfactual Policy settings (Schema v76, ADR-0068).
 *
 * Invariants enforced on load/import:
 *  1. Ids are exact strings <= 80 chars; duplicates or overlong ids are dropped
 *     rather than truncated into dangling references.
 *  2. A captured decision-point marker whose capture day is NOT strictly before
 *     the resolution day it claims is not a prequential log. The marker is
 *     demoted to `late` and counted, never silently trusted — a log written
 *     after its outcome cannot support an off-policy estimate.
 *  3. A frozen evaluation that claims a grade without a later re-estimation is
 *     dropped; a grade dated before the freeze returns the record to `frozen`.
 *  4. Every stored number is finite and inside its documented range. A figure
 *     outside it is nulled with a warning, because an off-policy weight of 40
 *     quietly lets one decision point stand for forty.
 *  5. Personal-blame language is scrubbed from notes so no imported file can
 *     smuggle scapegoating prose into a policy ruling.
 */

import {
  COUNTERFACTUAL_LIMITS,
  POLICY_FAMILIES,
  POLICY_IDS,
  POLICY_VERDICTS,
  hasBlameLanguage,
} from './counterfactualRegistry.js';

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

function finiteOrNull(v, { min = -1e12, max = 1e12, decimals = 4 } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/** A reward is a score on [0, 1]. Anything else is not a recorded outcome. */
function rewardOrNull(v) {
  return finiteOrNull(v, { min: 0, max: 1, decimals: 4 });
}

export function normalizePolicyMarkers(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, 4000)) {
    if (!isObj(item)) continue;
    const key = cleanText(item.key, 160);
    if (!key || seen.has(key)) continue;
    const capturedOn = validDay(item.capturedOn);
    const resolvedOn = validDay(item.resolvedOn);
    const family = POLICY_FAMILIES.includes(item.family) ? item.family : null;
    // A marker with no capture day, or one naming a family this terminal does
    // not harvest, can never be reconciled or resolved. Dropped, not guessed.
    if (!capturedOn || !family) continue;
    // Invariant 2: a log captured on or after the resolution it describes was
    // written with the answer already known. Demoted, counted, never trusted.
    const late = Boolean(resolvedOn && capturedOn >= resolvedOn);
    if (late) {
      warnings?.push('Policy markers: a decision point was captured on or after its recorded outcome; it is marked late and excluded from estimation.');
    }
    seen.add(key);
    out.push({
      key,
      family,
      sourceId: cleanText(item.sourceId, 80),
      capturedOn,
      resolvedOn,
      late,
      note: hasBlameLanguage(item.note) ? '' : cleanText(item.note, 240),
      createdAt: validIso(item.createdAt) || new Date(`${capturedOn}T00:00:00.000Z`).toISOString(),
    });
  }
  return out;
}

function normalizeRaceRow(raw) {
  if (!isObj(raw)) return null;
  if (!POLICY_IDS.includes(raw.policyId)) return null;
  return {
    policyId: raw.policyId,
    dr: rewardOrNull(raw.dr),
    snips: rewardOrNull(raw.snips),
    ips: rewardOrNull(raw.ips),
    dm: rewardOrNull(raw.dm),
    deltaPp: finiteOrNull(raw.deltaPp, { min: -100, max: 100, decimals: 2 }),
    ciLowPp: finiteOrNull(raw.ciLowPp, { min: -100, max: 100, decimals: 2 }),
    ciHighPp: finiteOrNull(raw.ciHighPp, { min: -100, max: 100, decimals: 2 }),
    manskiLowPp: finiteOrNull(raw.manskiLowPp, { min: -100, max: 100, decimals: 2 }),
    manskiHighPp: finiteOrNull(raw.manskiHighPp, { min: -100, max: 100, decimals: 2 }),
    effectiveSample: finiteOrNull(raw.effectiveSample, { min: 0, max: 1e6, decimals: 2 }),
    verdict: POLICY_VERDICTS.includes(raw.verdict) ? raw.verdict : 'insufficient',
  };
}

export function normalizePolicyEvaluations(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw.slice(0, COUNTERFACTUAL_LIMITS.maxEvaluations)) {
    if (!isObj(item)) continue;
    const id = validId(item.id);
    const frozenAt = validIso(item.frozenAt);
    if (!id || !frozenAt || seen.has(id)) continue;
    const status = item.status === 'graded' ? 'graded' : 'frozen';
    let grade = null;
    if (status === 'graded') {
      const g = item.grade;
      const gradedAt = isObj(g) ? validIso(g.gradedAt) : null;
      if (!g || !gradedAt || gradedAt <= frozenAt) {
        warnings?.push(`Policy evaluations: ${id} claimed a grade without a later re-estimation; returned to frozen.`);
      } else {
        grade = {
          gradedAt,
          // The forecast the frozen evaluation made about the NEXT window.
          predictedBestPolicy: POLICY_IDS.includes(g.predictedBestPolicy) ? g.predictedBestPolicy : null,
          realisedBestPolicy: POLICY_IDS.includes(g.realisedBestPolicy) ? g.realisedBestPolicy : null,
          unitsBefore: finiteOrNull(g.unitsBefore, { min: 0, max: 1e6, decimals: 0 }),
          unitsAfter: finiteOrNull(g.unitsAfter, { min: 0, max: 1e6, decimals: 0 }),
          held: g.held === true || g.held === false ? g.held : null,
          note: hasBlameLanguage(g.note) ? '' : cleanText(g.note, COUNTERFACTUAL_LIMITS.maxNotes),
        };
      }
    }
    seen.add(id);
    out.push({
      id,
      label: cleanText(item.label, COUNTERFACTUAL_LIMITS.maxLabel),
      scope: item.scope === 'family' && POLICY_FAMILIES.includes(item.family) ? 'family' : 'all',
      family: POLICY_FAMILIES.includes(item.family) ? item.family : null,
      frozenAt,
      frozenOn: validDay(item.frozenOn) || frozenAt.slice(0, 10),
      horizonDays: finiteOrNull(item.horizonDays, { min: 1, max: 730, decimals: 0 }) ?? 90,
      status: grade ? 'graded' : 'frozen',
      grade,
      units: finiteOrNull(item.units, { min: 0, max: 1e6, decimals: 0 }) ?? 0,
      observedValue: rewardOrNull(item.observedValue),
      designSensitivity: finiteOrNull(item.designSensitivity, { min: 0, max: COUNTERFACTUAL_LIMITS.maxGamma, decimals: 3 }),
      race: (Array.isArray(item.race) ? item.race : []).map(normalizeRaceRow).filter(Boolean).slice(0, POLICY_IDS.length),
      history: (Array.isArray(item.history) ? item.history : [])
        .filter(isObj)
        .slice(-COUNTERFACTUAL_LIMITS.maxHistory)
        .map((h) => ({
          at: validIso(h.at) || frozenAt,
          type: cleanText(h.type, 40),
          summary: hasBlameLanguage(h.summary) ? '' : cleanText(h.summary, 300),
        })),
      updatedAt: validIso(item.updatedAt) || frozenAt,
    });
  }
  return out;
}

export function normalizeCounterfactualSettings(raw = {}) {
  const src = isObj(raw) ? raw : {};
  const int = (v, min, max, fallback) => {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    counterfactualAutoPropagate: src.counterfactualAutoPropagate !== false,
    counterfactualMinUnits: int(src.counterfactualMinUnits, 6, 200, COUNTERFACTUAL_LIMITS.minUnits),
    counterfactualMaterialityPp: int(src.counterfactualMaterialityPp, 1, 25, COUNTERFACTUAL_LIMITS.materialityPp),
    counterfactualRobustGamma: int(src.counterfactualRobustGamma, 1, 10, COUNTERFACTUAL_LIMITS.robustGamma),
  };
}

export const COUNTERFACTUAL_DEFAULT_SETTINGS = Object.freeze(normalizeCounterfactualSettings({}));
