/**
 * app/core/domain/jurisdictionSchema.js — fail-closed storage for the
 * Jurisdiction Compiler (ADR-0109, Schema v111).
 *
 * ONLY immutable declarations are stored: the frozen governance finding for a
 * cross-span objective, the identity-free span reading, and the bounded
 * idempotency markers. Every cost, coalition, confidence interval and grade is
 * RE-DERIVED on read from those declarations plus the dated source records and
 * the reporting tree, so a stored figure can never drift away from the evidence
 * it claims to summarise.
 *
 * NO title, note, person name, case text or decision question is copied into
 * this ledger. A finding carries an opaque objective key, node ids and numbers;
 * that is all the detail it holds, which is why the upward reading cannot leak
 * workflow minutiae by accident.
 *
 * A malformed row is DROPPED with a warning, never repaired into a boundary
 * recommendation a leader might act on.
 */
import {
  JUR_CONVENTION_BOUNDS, JUR_CONVENTION_DEFAULTS, JUR_ENGINE_VERSION,
  JUR_LIMITS, JUR_OPTION_KEYS,
} from './jurisdictionRegistry.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 160) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = (v) => (typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && iso(v)?.slice(0, 10) === v ? v : null);
const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const rank = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const ids = (v, cap) => (Array.isArray(v)
  ? [...new Set(v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim().slice(0, 120)))].slice(0, cap)
  : []);

export const JUR_SETTINGS_DEFAULTS = Object.freeze({ ...JUR_CONVENTION_DEFAULTS });

/** Conventions are DECLARED and CLAMPED, never fitted from the record. */
export function normalizeJurSettings(settings = {}) {
  const s = isObject(settings) ? settings : {};
  const out = {};
  for (const [key, fallback] of Object.entries(JUR_CONVENTION_DEFAULTS)) {
    if (typeof fallback === 'boolean') { out[key] = s[key] === false ? false : true; continue; }
    const [min, max] = JUR_CONVENTION_BOUNDS[key] || [fallback, fallback];
    const n = Number(s[key]);
    out[key] = Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  }
  return out;
}

/**
 * One frozen governance finding per (objective, ISO week). A rescan in the same
 * week is a no-op: the cluster is a computation over the record, and freezing it
 * twice would be a claim that two boundary decisions were made. A finding is
 * graded IN PLACE, exactly once, out of sample.
 */
export function normalizeJurFindings(rows, warnings = []) {
  if (!Array.isArray(rows)) {
    warnings.push('Jurisdiction: repaired a non-array declaration to an empty list.');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, JUR_LIMITS.findings * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 160);
    const objectiveKey = text(raw.objectiveKey, 120);
    const week = text(raw.week, 12);
    const frozenAt = iso(raw.frozenAt);
    const reviewOn = day(raw.reviewOn);
    const memberIds = ids(raw.memberIds, JUR_LIMITS.membersPerCluster);
    const spanNodeIds = ids(raw.spanNodeIds, JUR_LIMITS.branchesCap);
    const branchSeatIds = ids(raw.branchSeatIds, JUR_LIMITS.branchesCap);
    const lcaNodeId = text(raw.lcaNodeId, 120);
    const memberCount = int(raw.memberCount);
    const coalitionSize = int(raw.coalitionSize);
    const status = ['frozen', 'graded', 'superseded', 'ungradable'].includes(raw.status) ? raw.status : null;
    const verdict = ['priced', 'refused'].includes(raw.verdict) ? raw.verdict : null;
    const predictedOption = JUR_OPTION_KEYS.includes(raw.predictedOption) ? raw.predictedOption : null;
    const bad = !id || !objectiveKey || !week || !frozenAt || !reviewOn || !lcaNodeId
      || memberCount === null || memberCount < 0 || coalitionSize === null || coalitionSize < 0
      || !status || !verdict || seen.has(id)
      // A priced finding must name a route and a probability; a refused one
      // must name its refusal. Neither may be half-stored.
      || (verdict === 'priced' && (!predictedOption || finite(raw.predictedProbability) === null))
      || (verdict === 'refused' && !text(raw.refusalKey, 60));
    if (bad) { warnings.push(`Jurisdiction: dropped a malformed or duplicate governance finding (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({
      id, objectiveKey, week, frozenAt, reviewOn,
      firstSeenOn: day(raw.firstSeenOn),
      memberIds, memberCount,
      spanNodeIds, branchSeatIds, lcaNodeId,
      accountableSpanIds: ids(raw.accountableSpanIds, JUR_LIMITS.branchesCap),
      matrixApexIds: ids(raw.matrixApexIds, JUR_LIMITS.branchesCap),
      lcaBasis: ['tree', 'matrix-apex', 'ambiguous-matrix'].includes(raw.lcaBasis) ? raw.lcaBasis : 'tree',
      matrixAmbiguous: raw.matrixAmbiguous === true,
      matrixLineCount: int(raw.matrixLineCount) ?? 0,
      lcaRank: rank(raw.lcaRank), maxSpanRank: rank(raw.maxSpanRank),
      coalitionSize, escalationRungs: int(raw.escalationRungs) ?? 0,
      handoffPairs: int(raw.handoffPairs) ?? 0,
      costCoalition: finite(raw.costCoalition), costEscalate: finite(raw.costEscalate),
      costRedraw: finite(raw.costRedraw),
      predictedOption, predictedProbability: finite(raw.predictedProbability),
      confidencePct: finite(raw.confidencePct), confidenceLoPct: finite(raw.confidenceLoPct),
      confidenceHiPct: finite(raw.confidenceHiPct),
      attributionPct: finite(raw.attributionPct), evidenceN: int(raw.evidenceN) ?? 0,
      verdict, refusalKey: text(raw.refusalKey, 60), refusalNote: text(raw.refusalNote, JUR_LIMITS.reasonChars),
      governedDecisionId: text(raw.governedDecisionId, 120) || null,
      status, gradedOn: day(raw.gradedOn),
      actualOption: JUR_OPTION_KEYS.includes(raw.actualOption) ? raw.actualOption : null,
      brier: finite(raw.brier), baseBrier: finite(raw.baseBrier), skill: finite(raw.skill),
      gradeNote: text(raw.gradeNote, JUR_LIMITS.reasonChars),
      engineVersion: text(raw.engineVersion, 60) || JUR_ENGINE_VERSION,
    });
  }
  return out.sort((a, b) => a.frozenAt.localeCompare(b.frozenAt));
}

/** One identity-free span reading. Counts only, never an id from another module. */
export function normalizeJurReadings(rows, warnings = []) {
  if (!Array.isArray(rows)) {
    warnings.push('Jurisdiction: repaired a non-array declaration to an empty list.');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const raw of rows.slice(0, JUR_LIMITS.readings * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 160);
    const nodeId = text(raw.nodeId, 120);
    const nodeRank = rank(raw.nodeRank);
    const week = text(raw.week, 12);
    const frozenAt = iso(raw.frozenAt);
    const reviewOn = day(raw.reviewOn);
    const clusters = int(raw.clusters);
    const status = ['frozen', 'graded'].includes(raw.status) ? raw.status : null;
    const bad = !id || !nodeId || !nodeRank || !week || !frozenAt || !reviewOn
      || clusters === null || clusters < 0 || !status || seen.has(id);
    if (bad) { warnings.push(`Jurisdiction: dropped a malformed or duplicate span reading (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    // A SUPPRESSED cell stays NULL all the way through storage. Coercing it to
    // 0 here would turn a withheld figure into a printed zero on the next read —
    // the exact "BLANK never zero" defect this module's CSV contract forbids.
    const nullableInt = (v) => {
      if (v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isInteger(n) ? n : null;
    };
    out.push({
      id, nodeId, nodeRank, week, frozenAt, reviewOn, clusters,
      // ADR-0115: the denominator of the cross-branch SHARE. Additive and
      // NULLABLE: a reading frozen before v112's drift reader has no objective
      // count, and the drift reader refuses that week's share rather than
      // back-filling a number. No schema bump — old rows round-trip unchanged.
      objectives: nullableInt(raw.objectives),
      crossBranch: nullableInt(raw.crossBranch) ?? 0,
      priced: nullableInt(raw.priced),
      governed: nullableInt(raw.governed),
      refusals: nullableInt(raw.refusals),
      suppressed: nullableInt(raw.suppressed) ?? 0,
      medianCoalitionSize: finite(raw.medianCoalitionSize),
      status, gradedOn: day(raw.gradedOn), gradeNote: text(raw.gradeNote, JUR_LIMITS.reasonChars),
      engineVersion: text(raw.engineVersion, 60) || JUR_ENGINE_VERSION,
    });
  }
  return out.sort((a, b) => b.frozenAt.localeCompare(a.frozenAt));
}

export function normalizeJurMarkers(rows, warnings = []) {
  if (!Array.isArray(rows)) {
    warnings.push('Jurisdiction: repaired a non-array declaration to an empty list.');
    return [];
  }
  const out = [];
  for (const value of rows) {
    if (typeof value === 'string' && value.length > 0 && value.length <= 200 && !out.includes(value)) out.push(value);
    else warnings.push('Jurisdiction: dropped a malformed or duplicate governance marker.');
    if (out.length >= JUR_LIMITS.markers) break;
  }
  return out;
}
