/**
 * app/core/domain/diligenceSchema.js — the stored contract for Schema v106
 * (ADR-0104, the Diligence Ledger).
 *
 * `diligence.js` is the analysis; this module decides what a half-written,
 * hand-edited or older record is allowed to become on load. The rules are the
 * same discipline every other ledger in this app applies:
 *
 *  - A FROZEN KNOWABLE SET keeps its decision, its decision date and its fact
 *    POINTERS. A checklist without them is dropped, never repaired into a claim
 *    a reader might act on. A fact carries a type, an id, a class, a date and a
 *    severity — never a title, a note or a person's name.
 *  - A CONSULTATION is append-only evidence that a leader looked. It requires a
 *    checklist id, a fact pointer, a declared disposition and a reason for a
 *    `ruled-out` judgement. A duplicate (checklist, fact) is refused. A consult
 *    dated in the future is dropped: nobody looked at a day that has not happened.
 *  - A FORECAST is a pre-decision claim. It is refused at normalization if it
 *    carries a grade date but no claim, or a probability outside (0, 100).
 *  - A GRADE is written once. Its Brier figures are re-derived on read; here we
 *    only bound the stored scalars so a hand-edited blob cannot print a lie.
 *  - CONVENTIONS are declared, clamped and printed — never fitted values.
 */

import {
  CONSULT_DISPOSITION_KEYS,
  DILIGENCE_BOUNDS,
  DILIGENCE_DEFAULTS,
  DILIGENCE_LIMITS,
  EVIDENCE_CLASS_KEYS,
  GRADE_VERDICT_KEYS,
} from './diligenceRegistry.js';

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
function clampPct(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n * 10) / 10));
}
function finiteOrNull(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 10000) / 10000));
}

/* ---------------------------------------------------------- conventions */

export function normalizeDiligenceSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = DILIGENCE_DEFAULTS;
  const B = DILIGENCE_BOUNDS;
  return {
    diligenceKnowableFloor: clampInt(s.diligenceKnowableFloor, ...B.diligenceKnowableFloor, d.diligenceKnowableFloor),
    diligenceCoverageFloorPct: clampPct(s.diligenceCoverageFloorPct, ...B.diligenceCoverageFloorPct, d.diligenceCoverageFloorPct),
    diligenceClassFloor: clampInt(s.diligenceClassFloor, ...B.diligenceClassFloor, d.diligenceClassFloor),
    diligenceDarkCeilingPct: clampPct(s.diligenceDarkCeilingPct, ...B.diligenceDarkCeilingPct, d.diligenceDarkCeilingPct),
    diligenceGradeClaimFloor: clampInt(s.diligenceGradeClaimFloor, ...B.diligenceGradeClaimFloor, d.diligenceGradeClaimFloor),
    diligenceForecastHorizonDays: clampInt(s.diligenceForecastHorizonDays, ...B.diligenceForecastHorizonDays, d.diligenceForecastHorizonDays),
    diligenceReviewDays: clampInt(s.diligenceReviewDays, ...B.diligenceReviewDays, d.diligenceReviewDays),
    diligenceStaleDays: clampInt(s.diligenceStaleDays, ...B.diligenceStaleDays, d.diligenceStaleDays),
    diligenceAutoPropagate: s.diligenceAutoPropagate !== false,
  };
}

export function diligenceConventions(rawSettings = {}) {
  return normalizeDiligenceSettings(rawSettings);
}

/* ------------------------------------------------------------- checklists */

function normalizeFacts(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const fact of raw) {
    if (!isPlainObject(fact)) continue;
    const sourceType = clean(fact.sourceType, 40);
    const sourceId = clean(fact.sourceId, 120);
    const evidenceClass = EVIDENCE_CLASS_KEYS.includes(fact.evidenceClass) ? fact.evidenceClass : null;
    const evidencesOn = day(fact.evidencesOn);
    if (!sourceType || !sourceId || !evidenceClass || !evidencesOn) continue;
    const key = `${sourceType}:${sourceId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      sourceType, sourceId, evidenceClass, evidencesOn,
      severity: clampInt(fact.severity, 1, 3, 2),
    });
    if (out.length >= DILIGENCE_LIMITS.factsPerChecklist) break;
  }
  return out;
}

/** A pre-decision process forecast, declared BEFORE the decision settled. */
function normalizeForecast(raw) {
  if (!isPlainObject(raw)) return null;
  const declaredOn = day(raw.declaredOn);
  if (!declaredOn) return null;
  const classes = Array.isArray(raw.classes)
    ? [...new Set(raw.classes.filter((key) => EVIDENCE_CLASS_KEYS.includes(key)))].slice(0, EVIDENCE_CLASS_KEYS.length)
    : [];
  const confidencePct = clampInt(raw.confidencePct, 1, 99, 70);
  if (!classes.length) return null;
  return { declaredOn, classes, confidencePct, question: clean(raw.question, 300) };
}

export function normalizeDiligenceChecklists(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  let unreadable = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const decisionId = clean(row.decisionId, 120);
    const decisionOn = day(row.decisionOn);
    const frozenOn = day(row.frozenOn);
    if (!id || !decisionId || !decisionOn || !frozenOn) { unreadable += 1; continue; }
    if (seen.has(id)) { warnings.push(`Diligence checklists: duplicate id "${id.slice(0, 14)}…" dropped`); continue; }
    const facts = normalizeFacts(row.facts);
    const forecast = normalizeForecast(row.forecast);
    // A checklist that claims settlement but has no outcome day is reopened, not
    // believed: settlement is a fact the decision record owns, not a stored flag.
    const status = ['open', 'settled', 'lapsed'].includes(row.status) ? row.status : 'open';
    seen.add(id);
    out.push({
      id, decisionId, decisionOn, frozenOn,
      facts,
      factN: facts.length,
      status,
      outcome: ['pending', 'good', 'mixed', 'bad'].includes(row.outcome) ? row.outcome : 'pending',
      forecast,
      gradedOn: day(row.gradedOn),
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
      updatedAt: isoOrNull(row.updatedAt),
    });
  }
  if (unreadable) warnings.push(`Diligence checklists: dropped ${unreadable} unreadable row(s) (no id, decision, decision date or freeze date)`);
  return out.slice(-DILIGENCE_LIMITS.checklists);
}

/* -------------------------------------------------------------- consults */

export function normalizeDiligenceConsults(raw, warnings = [], { now = new Date() } = {}) {
  if (!Array.isArray(raw)) return [];
  const today = new Date(now).toISOString().slice(0, 10);
  const seen = new Set();
  const out = [];
  let future = 0;
  let badState = 0;
  let unreadable = 0;
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const checklistId = clean(row.checklistId, 100);
    const sourceType = clean(row.sourceType, 40);
    const sourceId = clean(row.sourceId, 120);
    const evidenceClass = EVIDENCE_CLASS_KEYS.includes(row.evidenceClass) ? row.evidenceClass : null;
    const disposition = CONSULT_DISPOSITION_KEYS.includes(row.disposition) ? row.disposition : null;
    const consultedOn = day(row.consultedOn);
    if (!id || !checklistId || !sourceType || !sourceId || !evidenceClass || !disposition || !consultedOn) { unreadable += 1; continue; }
    const key = `${checklistId}|${sourceType}:${sourceId}`;
    if (seen.has(key)) { warnings.push(`Diligence consults: duplicate (checklist, fact) dropped`); continue; }
    if (consultedOn > today) { future += 1; continue; }
    const reason = clean(row.reason, DILIGENCE_LIMITS.reasonChars);
    // A "ruled-out" judgement without a reason is not a judgement; drop the
    // claim of diligence rather than inventing why the fact was dismissed.
    if (disposition === 'ruled-out' && !reason) { badState += 1; continue; }
    seen.add(key);
    out.push({
      id, checklistId, sourceType, sourceId, evidenceClass, disposition,
      consultedOn, reason,
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  if (future) warnings.push(`Diligence consults: dropped ${future} consultation(s) dated in the future — nobody looked at a day that has not happened`);
  if (unreadable) warnings.push(`Diligence consults: dropped ${unreadable} unreadable row(s)`);
  if (badState) warnings.push(`Diligence consults: dropped ${badState} "ruled-out" row(s) with no written reason — looking and dismissing needs the reason to be diligence`);
  return out.slice(-DILIGENCE_LIMITS.consults);
}

/* ---------------------------------------------------------------- grades */

export function normalizeDiligenceGrades(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 100);
    const checklistId = clean(row.checklistId, 100);
    const gradedOn = day(row.gradedOn);
    if (!id || !checklistId || !gradedOn || seen.has(checklistId)) continue;
    seen.add(checklistId);
    out.push({
      id, checklistId, gradedOn,
      claimsN: clampInt(row.claimsN, 0, 100, 0),
      hitsN: clampInt(row.hitsN, 0, 100, 0),
      brier: finiteOrNull(row.brier, 0, 1),
      baseBrier: finiteOrNull(row.baseBrier, 0, 1),
      skill: finiteOrNull(row.skill, -10, 1),
      coveragePct: finiteOrNull(row.coveragePct, 0, 100),
      verdict: GRADE_VERDICT_KEYS.includes(row.verdict) ? row.verdict : 'refused',
      ownerSeatId: clean(row.ownerSeatId, 80) || null,
      altitudeKey: clean(row.altitudeKey, 40) || null,
      rank: clampInt(row.rank, 1, 5, 5),
      engineVersion: clean(row.engineVersion, 80),
      createdAt: isoOrNull(row.createdAt),
    });
  }
  return out.slice(-DILIGENCE_LIMITS.grades);
}

/* --------------------------------------------------------------- markers */

export function normalizeDiligenceMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const row of raw) {
    if (!isPlainObject(row)) continue;
    const id = clean(row.id, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind: clean(row.kind, 40) || 'unknown',
      key: clean(row.key, 240),
      checklistId: clean(row.checklistId, 100) || null,
      decisionId: clean(row.decisionId, 100) || null,
      gradeId: clean(row.gradeId, 100) || null,
      weekKey: clean(row.weekKey, 20) || null,
      recordedOn: day(row.recordedOn),
      note: clean(row.note, 300),
    });
  }
  return out.slice(-DILIGENCE_LIMITS.markers);
}
