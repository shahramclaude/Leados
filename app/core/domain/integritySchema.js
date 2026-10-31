/**
 * app/core/domain/integritySchema.js — persistence for the Signal Integrity
 * Board (Schema v70). Four collections, all fail-closed.
 *
 *  - `integrityLooks` — a dated record that the detector suite ran: how many
 *    series were tested, how many candidates it produced and what their p
 *    values were, plus the plan that was in force at that moment. The stored
 *    p values are FACTS about that look; the boundary and the survivor count
 *    are DERIVED on read, never stored, so a later change of plan cannot
 *    silently rewrite history.
 *  - `signalVerdicts` — the leader's one-way judgement on a surfaced finding,
 *    across every family. The key is a de-identified digest of the finding, so
 *    no person's name or id enters the ledger; the verdict is about the RULE.
 *  - `integrityReviews` — a frozen programme review: the state of the error
 *    budget on a date plus exactly one prospective claim about the next
 *    `horizonAlerts` alerts, graded once afterwards.
 *  - `integrityMarkers` — rule idempotency markers.
 *
 * An unreadable record is dropped with a warning. Nothing is clamped into a
 * plausible-looking figure: a p value of 1.4 is not a p value, and a review
 * that claimed a Brier score without an outcome returns to frozen.
 */

import { INTEGRITY_DEFAULTS } from './integrityRegistry.js';

export const INTEGRITY_LOOK_CAP = 240;
export const SIGNAL_VERDICT_CAP = 600;
export const INTEGRITY_REVIEW_CAP = 20;
const MARKER_CAP = 400;

const day = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
};
const iso = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
};
const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const finite = (value, min, max) => (typeof value === 'number' && Number.isFinite(value)
  && value >= min && value <= max ? value : null);
const whole = (value, min, max, fallback) => {
  const n = finite(value, min, max);
  return n === null ? fallback : Math.round(n);
};

/** A p value is legal only in [0, 1]; anything else is dropped, never clipped. */
const pValues = (value, max = 24) => (Array.isArray(value)
  ? value.filter((p) => typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1)
    .map((p) => Math.round(p * 1e6) / 1e6)
    .slice(0, max)
  : []);

export function normalizeIntegrityLooks(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, INTEGRITY_LOOK_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const lookOn = day(item.lookOn);
    const recordedAt = iso(item.recordedAt);
    if (!id || !lookOn || !recordedAt || seen.has(id)) {
      warnings.push('Integrity looks: dropped an unreadable or duplicate look.');
      continue;
    }
    const source = item.source === 'manual' ? 'manual' : 'scan';
    const seriesTested = whole(item.seriesTested, 0, 400, null);
    if (seriesTested === null) {
      warnings.push(`Integrity looks: dropped ${id} with no series count — a look that tested nothing is not a look.`);
      continue;
    }
    seen.add(id);
    rows.push({
      id,
      lookOn,
      recordedAt,
      source,
      seriesTested,
      candidates: whole(item.candidates, 0, 400, 0),
      promoted: whole(item.promoted, 0, 400, 0),
      pValues: pValues(item.pValues),
      // The plan in force at the moment of the look. Nullable on purpose: a
      // look recorded before the leader had a plan is not given one
      // retrospectively.
      alphaPctAtLook: finite(item.alphaPctAtLook, 1, 50),
      plannedLooksAtLook: finite(item.plannedLooksAtLook, 2, 260),
      spendingAtLook: item.spendingAtLook === 'pocock' || item.spendingAtLook === 'obf'
        ? item.spendingAtLook : null,
      note: text(item.note, 300),
    });
  }
  // A look is keyed by day: the detectors run per day, and two rows for one day
  // would charge the error budget twice for one look. Latest wins.
  const byDay = new Map();
  for (const row of rows.sort((a, b) => (a.lookOn < b.lookOn ? -1 : a.lookOn > b.lookOn ? 1 : 0))) {
    const existing = byDay.get(row.lookOn);
    if (!existing || existing.recordedAt <= row.recordedAt) byDay.set(row.lookOn, row);
  }
  return [...byDay.values()].slice(-INTEGRITY_LOOK_CAP);
}

/**
 * Verdict normalisation. Two rows for one finding keep the later judgement: a
 * leader may correct a verdict, and the event log keeps the correction even
 * though the ledger keeps one answer.
 */
export function normalizeSignalVerdicts(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map();
  for (const item of raw.slice(0, SIGNAL_VERDICT_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const instanceKey = text(item.instanceKey, 80);
    const domain = text(item.domain, 60);
    const verdict = text(item.verdict, 20);
    const recordedAt = iso(item.recordedAt);
    const legalVerdict = verdict === 'confirmed' || verdict === 'explained'
      || verdict === 'dismissed' || verdict === 'false-alarm';
    if (!instanceKey || !domain || !legalVerdict || !recordedAt) {
      warnings.push('Signal verdicts: dropped a verdict without a finding key, a family, a legal verdict or a timestamp.');
      continue;
    }
    const row = {
      id: text(item.id, 60) || `verdict-${instanceKey}`,
      instanceKey,
      domain,
      ruleId: text(item.ruleId, 40),
      verdict,
      day: day(item.day) || recordedAt.slice(0, 10),
      recordedAt,
      severityAtVerdict: whole(item.severityAtVerdict, 1, 5, null),
      note: text(item.note, 300),
      source: item.source === 'watch' ? 'watch' : 'board',
    };
    const existing = byKey.get(instanceKey);
    if (existing && existing.recordedAt > row.recordedAt) continue;
    byKey.set(instanceKey, row);
  }
  return [...byKey.values()]
    .sort((a, b) => (a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : 0))
    .slice(-SIGNAL_VERDICT_CAP);
}

export function normalizeIntegrityReviews(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, INTEGRITY_REVIEW_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const frozenAt = iso(item.frozenAt);
    const reviewOn = day(item.reviewOn);
    const predicted = finite(item.predictedAnyFalseAlarmPct, 0, 100);
    const horizonAlerts = whole(item.horizonAlerts, 1, 40, null);
    if (!id || !frozenAt || !reviewOn || seen.has(id) || reviewOn < frozenAt.slice(0, 10)
      || predicted === null || horizonAlerts === null) {
      warnings.push('Integrity reviews: dropped a review without a date, a review day, a horizon or its one frozen probability.');
      continue;
    }
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object' && !Array.isArray(rawGrade)
      && iso(rawGrade.gradedAt)
      && typeof rawGrade.anyFalse === 'boolean'
      && finite(rawGrade.brier, 0, 1) !== null
      && iso(rawGrade.gradedAt).slice(0, 10) >= reviewOn
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        anyFalse: rawGrade.anyFalse,
        scored: whole(rawGrade.scored, 1, 400, 1),
        falseAlarms: whole(rawGrade.falseAlarms, 0, 400, 0),
        brier: rawGrade.brier,
      } : null;
    if (rawGrade && !graded) {
      warnings.push(`Integrity reviews: ${id} claimed a grade without an outcome; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id,
      label: text(item.label, 200),
      frozenAt,
      reviewOn,
      alphaPct: finite(item.alphaPct, 1, 50) ?? INTEGRITY_DEFAULTS.integrityAlphaPct,
      plannedLooks: whole(item.plannedLooks, 2, 260, INTEGRITY_DEFAULTS.integrityPlannedLooks),
      spending: item.spending === 'pocock' ? 'pocock' : 'obf',
      looksUsed: whole(item.looksUsed, 0, 400, 0),
      cumulativeAlphaPct: finite(item.cumulativeAlphaPct, 0, 50),
      perTestThreshold: finite(item.perTestThreshold, 0, 1),
      seriesTested: whole(item.seriesTested, 0, 400, 0),
      mEff: finite(item.mEff, 1, 400),
      verdictsScored: whole(item.verdictsScored, 0, 1200, 0),
      familiesScored: whole(item.familiesScored, 0, 60, 0),
      pooledDetectionPct: finite(item.pooledDetectionPct, 0, 100),
      pooledActionablePct: finite(item.pooledActionablePct, 0, 100),
      pooledFalseAlarmPct: finite(item.pooledFalseAlarmPct, 0, 100),
      familyStatuses: (Array.isArray(item.familyStatuses)
        ? item.familyStatuses.filter((row) => row && typeof row === 'object'
          && typeof row.domain === 'string' && typeof row.status === 'string')
          .map((row) => ({
            domain: text(row.domain, 60),
            n: whole(row.n, 0, 400, 0),
            actionablePct: finite(row.actionablePct, 0, 100),
            status: text(row.status, 20),
          })) : []).slice(0, 16),
      horizonAlerts,
      predictedAnyFalseAlarmPct: predicted,
      graded,
      challengeNotes: (Array.isArray(item.challengeNotes)
        ? item.challengeNotes.filter((note) => typeof note === 'string').map((note) => note.slice(0, 240))
        : []).slice(-8),
    });
  }
  return rows.sort((a, b) => (a.frozenAt < b.frozenAt ? 1 : a.frozenAt > b.frozenAt ? -1 : 0));
}

export function normalizeIntegrityMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200)))].slice(-MARKER_CAP);
}
