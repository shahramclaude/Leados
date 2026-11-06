/**
 * ADR-0107 — fail-closed storage for the Outcome Learning Loop (Schema v109).
 *
 * ONLY immutable declarations are stored: the probability and horizon frozen at
 * adoption, the one-shot grade, and bounded marker ids. Every score, interval,
 * pooled rate, verdict and hierarchy cell is re-derived on read from these
 * inputs plus the dated source records, so a stored figure can never drift away
 * from the evidence it claims to summarise. No title, note, person name, case
 * title, proof body or outcome note is copied into this ledger.
 *
 * A malformed row is DROPPED with a warning, never repaired into a verdict a
 * leader might act on. A grade claiming an outcome without its value, a forecast
 * outside 5–95%, or a duplicate id all fail closed.
 */
import {
  OUTCOME_CONTRACT_STATES, OUTCOME_FORECAST_SOURCES, OUTCOME_GRADE_STATES,
  OUTCOME_LIMITS, OUTCOME_VALUES, OUTCOME_VERDICTS, OUTCOME_VERSION,
} from './outcomeRegistry.js';
import { outcomeConventions } from './outcomePrior.js';

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v ? v : null;
const iso = (v) => typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : null; };

export const OUTCOME_SETTINGS_DEFAULTS = Object.freeze({
  outcomeAutoLearn: true,
  outcomeMinGrades: 5,
  outcomeMinCell: 5,
  outcomeShrinkK: 8,
  outcomeStaleDays: 14,
  outcomeMaterialityPp: 15,
  outcomeConformalCoverage: 0.8,
  outcomeFidelityFloorPct: 75,
});

/** Conventions are DECLARED and CLAMPED, never fitted from the record. */
export function normalizeOutcomeSettings(s = {}) {
  const c = outcomeConventions({ ...OUTCOME_SETTINGS_DEFAULTS, ...(isObject(s) ? s : {}) });
  return {
    outcomeAutoLearn: isObject(s) && s.outcomeAutoLearn === false ? false : true,
    outcomeMinGrades: c.minGrades,
    outcomeMinCell: c.minCell,
    outcomeShrinkK: c.shrinkK,
    outcomeStaleDays: c.staleDays,
    outcomeMaterialityPp: c.materialityPp,
    outcomeConformalCoverage: c.conformalCoverage,
    outcomeFidelityFloorPct: c.fidelityFloorPct,
  };
}

export function normalizeOutcomeContracts(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = []; const seen = new Set();
  for (const raw of rows.slice(0, OUTCOME_LIMITS.contracts * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 120); const bundleId = text(raw.bundleId, 120);
    const sourceCaseId = text(raw.sourceCaseId, 120); const ownerNodeId = text(raw.ownerNodeId, 120);
    const declaredOn = day(raw.declaredOn); const horizonOn = raw.horizonOn === null ? null : day(raw.horizonOn);
    const forecastPct = raw.forecastPct === null || raw.forecastPct === undefined || raw.forecastPct === '' ? null : finite(raw.forecastPct);
    const fingerprint = text(raw.fingerprint, 40); const version = text(raw.version, 60);
    const status = OUTCOME_CONTRACT_STATES.includes(raw.status) ? raw.status : null;
    const forecastSource = OUTCOME_FORECAST_SOURCES.includes(raw.forecastSource) ? raw.forecastSource : null;
    const expectedActions = int(raw.expectedActions);
    const expectedSpend = Array.isArray(raw.expectedSpend) ? raw.expectedSpend.slice(0, 8).filter(isObject).map((r) => ({
      currency: text(r.currency, 6).toUpperCase() || 'USD', amount: finite(r.amount),
    })).filter((r) => r.amount !== null && r.amount >= 0) : [];
    const sourcePointers = Array.isArray(raw.sourcePointers) ? raw.sourcePointers.slice(0, OUTCOME_LIMITS.pointers).filter(isObject)
      .map((r) => ({ type: text(r.type, 40), id: text(r.id, 120) })).filter((r) => r.type && r.id) : [];
    const createdAt = iso(raw.createdAt);
    const bad = !id || !bundleId || !sourceCaseId || !ownerNodeId || !declaredOn || (raw.horizonOn !== null && raw.horizonOn !== undefined && !horizonOn)
      || (forecastPct !== null && (forecastPct < 5 || forecastPct > 95)) || !fingerprint || !status || !forecastSource
      || expectedActions === null || expectedActions < 0 || !createdAt || version !== OUTCOME_VERSION || seen.has(id);
    if (bad) { warnings.push(`Outcome contracts: dropped a malformed or duplicate frozen expectation (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({ id, bundleId, sourceCaseId, ownerNodeId, declaredOn, horizonOn, forecastPct, forecastSource,
      expectedActions, expectedSpend, sourcePointers, fingerprint, version, status,
      closedOn: day(raw.closedOn), gradedOn: day(raw.gradedOn),
      priorDeclaredOn: day(raw.priorDeclaredOn), priorDeclaredBy: text(raw.priorDeclaredBy, 120) || null,
      createdAt });
  }
  return out.slice(-OUTCOME_LIMITS.contracts);
}

export function normalizeOutcomeGrades(rows, warnings = []) {
  if (!Array.isArray(rows)) return [];
  const out = []; const seen = new Set();
  for (const raw of rows.slice(0, OUTCOME_LIMITS.grades * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 120); const contractId = text(raw.contractId, 120); const bundleId = text(raw.bundleId, 120);
    const ownerNodeId = text(raw.ownerNodeId, 120); const gradedOn = day(raw.gradedOn); const closedOn = day(raw.closedOn);
    const outcome = text(raw.outcome, 20); const status = OUTCOME_GRADE_STATES.includes(raw.status) ? raw.status : null;
    const verdict = OUTCOME_VERDICTS.includes(raw.verdict) ? raw.verdict : null;
    const outcomeValue = finite(raw.outcomeValue); const forecastPct = finite(raw.forecastPct);
    const brier = finite(raw.brier); const baseBrier = finite(raw.baseBrier);
    const skill = raw.skill === null || raw.skill === undefined ? null : finite(raw.skill);
    const cycleDays = raw.cycleDays === null ? null : int(raw.cycleDays);
    const horizonDays = raw.horizonDays === null ? null : int(raw.horizonDays);
    const delayDays = raw.delayDays === null ? null : int(raw.delayDays);
    const fidelityPct = finite(raw.fidelityPct); const fingerprint = text(raw.fingerprint, 40);
    const reason = text(raw.reason, 300); const version = text(raw.version, 60);
    const graded = status === 'graded';
    // A stored score is NEVER trusted: it is re-derived from the frozen
    // probability and the human outcome value. A hand-edited blob that improves
    // its own Brier is DROPPED with a warning, not repaired into a verdict.
    const expectedBrier = graded && forecastPct !== null && outcomeValue !== null ? Math.round(((forecastPct / 100 - outcomeValue) ** 2) * 1e6) / 1e6 : null;
    const expectedBase = graded && outcomeValue !== null ? Math.round(((0.5 - outcomeValue) ** 2) * 1e6) / 1e6 : null;
    const scoreConsistent = !graded || (expectedBrier !== null && brier !== null && Math.abs(brier - expectedBrier) < 1e-6
      && expectedBase !== null && baseBrier !== null && Math.abs(baseBrier - expectedBase) < 1e-6);
    const valueOk = graded ? OUTCOME_VALUES[outcome] === outcomeValue && forecastPct !== null && forecastPct >= 5 && forecastPct <= 95
      && brier !== null && brier >= 0 && brier <= 1 && baseBrier !== null && baseBrier >= 0 && baseBrier <= 0.25 && scoreConsistent
      && fidelityPct !== null && fidelityPct >= 0 && fidelityPct <= 100 && verdict !== 'ungradable' && closedOn
      : true;
    const bad = !id || !contractId || !bundleId || !ownerNodeId || !gradedOn || !fingerprint || !status || !verdict
      || version !== OUTCOME_VERSION || seen.has(id) || (graded && !outcome) || !valueOk
      || (graded && (cycleDays === null || horizonDays === null && raw.horizonDays !== null));
    if (bad) { warnings.push(`Outcome grades: dropped a malformed or duplicate one-shot grade (${id || 'unnamed'}).`); continue; }
    seen.add(id);
    out.push({ id, contractId, bundleId, ownerNodeId, gradedOn, closedOn, outcome: graded ? outcome : null,
      outcomeValue: graded ? outcomeValue : null, forecastPct: graded ? forecastPct : null,
      brier: graded ? brier : null, baseBrier: graded ? baseBrier : null, skill: graded ? skill : null,
      cycleDays, horizonDays, delayDays, fidelityPct: graded ? fidelityPct : null,
      verdict, status, reason, fingerprint, version });
  }
  return out.slice(-OUTCOME_LIMITS.grades);
}

export function normalizeOutcomeMarkers(rows) {
  if (!Array.isArray(rows)) return [];
  const out = []; const seen = new Set();
  for (const raw of rows.slice(-OUTCOME_LIMITS.markers * 2)) {
    if (!isObject(raw)) continue;
    const id = text(raw.id, 160); const kind = text(raw.kind, 40); const recordedOn = day(raw.recordedOn);
    if (!id || !kind || !recordedOn || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, kind, week: day(raw.week), seatId: text(raw.seatId, 120) || null, recordedOn, decisionId: text(raw.decisionId, 120) || null });
  }
  return out.slice(-OUTCOME_LIMITS.markers);
}
