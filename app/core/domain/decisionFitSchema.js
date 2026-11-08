/**
 * app/core/domain/decisionFitSchema.js — fail-closed storage for the Decision-Fit
 * Ledger (ADR-0108, Schema v110).
 *
 * ONLY immutable declarations are stored: the classification frozen for a
 * decision, the governed delegation the spine proposed, the span reading frozen
 * for later grading, and the bounded marker ids that make a rescan converge.
 * Every price, deficit, saving, share and interval is re-derived on read from
 * those declarations plus the dated source records, so a stored figure can never
 * drift away from the evidence it claims to summarise.
 *
 * NO title, note, person name, case title or call text is copied into this
 * ledger. A snapshot carries a decision id and a class; that is all the detail it
 * holds, which is why the upward reading cannot leak detail by accident.
 *
 * A malformed row is DROPPED with a warning, never repaired into a saving a
 * leader might act on.
 */
import {
  AUTHORITY_CLASS_KEYS, FIT_CONVENTION_BOUNDS, FIT_CONVENTION_DEFAULTS, FIT_LIMITS,
  FIT_ENGINE_VERSION,
} from './decisionFitRegistry.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null);
// `Number(null)` is 0, so a plain finite() check reads an ABSENT figure as a
// declared zero. That broke this schema's own round trip: a proposal with no
// predicted saving was written with `predictedSaving: null`, read back as 0,
// and then dropped for "a saving with no currency" — so the record survived one
// load and vanished on the next. Absent means absent.
const finite = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const rank = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

export const FIT_SETTINGS_DEFAULTS = Object.freeze({ ...FIT_CONVENTION_DEFAULTS });

/** Conventions are DECLARED and CLAMPED, never fitted from the record. */
export function normalizeFitSettings(settings = {}) {
  const s = isObject(settings) ? settings : {};
  const out = {};
  for (const [key, fallback] of Object.entries(FIT_CONVENTION_DEFAULTS)) {
    if (typeof fallback === 'boolean') { out[key] = s[key] === false ? false : true; continue; }
    const [min, max] = FIT_CONVENTION_BOUNDS[key] || [fallback, fallback];
    const n = Number(s[key]);
    out[key] = Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }
  return out;
}

/**
 * One frozen classification per (decision, class, owner rung). Re-classifying a
 * decision opens a NEW snapshot and marks the old one superseded; a snapshot is
 * never re-priced in place, because a saving that silently changed after the
 * fact would be a hindsight the leader could not audit.
 */
export function normalizeFitSnapshots(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, FIT_LIMITS.snapshots * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 140);
    const decisionId = text(raw.decisionId, 120);
    const classKey = AUTHORITY_CLASS_KEYS.includes(raw.classKey) ? raw.classKey : null;
    const ownerNodeId = text(raw.ownerNodeId, 120);
    const ownerRank = rank(raw.ownerRank);
    const frozenAt = iso(raw.frozenAt);
    const declared = raw.declared === true;
    const priced = raw.priced === true;
    const currency = text(raw.currency, 6).toUpperCase() || null;
    const valuePerWeek = finite(raw.valuePerWeek);
    const bestRank = raw.bestRank === null || raw.bestRank === undefined ? null : rank(raw.bestRank);
    const bestNetSaving = raw.bestNetSaving === null || raw.bestNetSaving === undefined ? null : finite(raw.bestNetSaving);
    const status = ['frozen', 'superseded'].includes(raw.status) ? raw.status : null;
    const bad = !id || !decisionId || !classKey || !ownerNodeId || !ownerRank || !frozenAt || !status
      || (priced && (valuePerWeek === null || !currency))
      || seen.has(id);
    if (bad) { warnings.push(`Decision-fit: dropped a malformed or duplicate authority snapshot (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({
      id, decisionId, classKey, ownerNodeId, ownerRank, declared, priced, currency, valuePerWeek,
      floorRank: rank(raw.floorRank) || 1, bestRank, bestNetSaving,
      status, frozenAt, supersededOn: day(raw.supersededOn),
      engineVersion: text(raw.engineVersion, 60) || FIT_ENGINE_VERSION,
    });
  }
  return out.sort((a, b) => a.frozenAt.localeCompare(b.frozenAt));
}

/**
 * The governed delegation the spine proposed. It always points at a real
 * bounded-authority contract (ADR-0078) or a real decision; a proposal with
 * neither is dropped rather than kept as an orphan the page would render as
 * a recommendation nobody can act on.
 */
export function normalizeFitProposals(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, FIT_LIMITS.proposals * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 140);
    const decisionId = text(raw.decisionId, 120);
    const fromNodeId = text(raw.fromNodeId, 120);
    const toNodeId = text(raw.toNodeId, 120);
    const toRank = rank(raw.toRank);
    const proposedOn = day(raw.proposedOn);
    const week = text(raw.week, 12);
    const contractId = text(raw.contractId, 120) || null;
    const optionDecisionId = text(raw.optionDecisionId, 120) || null;
    const saving = finite(raw.predictedSaving);
    const errorPct = finite(raw.predictedErrorPct);
    const daysSaved = finite(raw.predictedDaysSaved);
    const currency = text(raw.currency, 6).toUpperCase() || null;
    const status = ['proposed', 'graded', 'withdrawn'].includes(raw.status) ? raw.status : null;
    const bad = !id || !decisionId || !fromNodeId || !toNodeId || !toRank || !proposedOn || !week || !status
      || (!contractId && !optionDecisionId) || seen.has(id)
      || (saving !== null && !currency);
    if (bad) { warnings.push(`Decision-fit: dropped a malformed or duplicate delegation proposal (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({
      id, decisionId, fromNodeId, toNodeId, toRank, week, proposedOn, contractId, optionDecisionId,
      currency, predictedSaving: saving, predictedErrorPct: errorPct, predictedDaysSaved: daysSaved,
      status, gradedOn: day(raw.gradedOn),
      actualSaving: raw.actualSaving === null || raw.actualSaving === undefined ? null : finite(raw.actualSaving),
      actualDays: raw.actualDays === null || raw.actualDays === undefined ? null : finite(raw.actualDays),
      gradeNote: text(raw.gradeNote, FIT_LIMITS.reasonChars),
    });
  }
  return out.sort((a, b) => b.proposedOn.localeCompare(a.proposedOn));
}

/** One frozen span reading. Aggregate by contract: counts, rates, never an id. */
export function normalizeFitReadings(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, FIT_LIMITS.readings * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 140);
    const nodeId = text(raw.nodeId, 120);
    const nodeRank = rank(raw.nodeRank);
    const frozenAt = iso(raw.frozenAt);
    const reviewOn = day(raw.reviewOn);
    const open = int(raw.open);
    const priced = int(raw.priced);
    const status = ['frozen', 'graded'].includes(raw.status) ? raw.status : null;
    const bad = !id || !nodeId || !nodeRank || !frozenAt || !reviewOn || open === null || open < 0
      || priced === null || priced < 0 || !status || seen.has(id);
    if (bad) { warnings.push(`Decision-fit: dropped a malformed or duplicate span reading (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({
      id, nodeId, nodeRank, frozenAt, reviewOn, open, priced,
      recommendations: int(raw.recommendations) ?? 0,
      heldPastHorizon: int(raw.heldPastHorizon) ?? 0,
      rightsRefused: int(raw.rightsRefused) ?? 0,
      sharePct: finite(raw.sharePct),
      shareLoPct: finite(raw.shareLoPct),
      shareHiPct: finite(raw.shareHiPct),
      eligibleN: int(raw.eligibleN) ?? 0,
      status, gradedOn: day(raw.gradedOn), gradeNote: text(raw.gradeNote, FIT_LIMITS.reasonChars),
      engineVersion: text(raw.engineVersion, 60) || FIT_ENGINE_VERSION,
    });
  }
  return out.sort((a, b) => b.frozenAt.localeCompare(a.frozenAt));
}

export function normalizeFitMarkers(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const value of rows) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 200 && !out.includes(value)) out.push(value);
    if (out.length >= FIT_LIMITS.markers) break;
  }
  return out;
}
