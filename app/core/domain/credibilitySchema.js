/**
 * app/core/domain/credibilitySchema.js — persistence for the Borrowed Evidence
 * Engine (Schema v71). Three collections, all fail-closed.
 *
 *  - `credibilityFrames` — a frozen borrowing forecast: the pooled and own-data
 *    estimates for ONE unit at the moment it was frozen, plus exactly one
 *    prospective claim (the chance the next N observations in that unit are
 *    successes). Graded once, after the window, from what actually followed.
 *    The borrowed and raw figures are frozen as FACTS so a later change of
 *    convention cannot rewrite a forecast the leader was shown.
 *  - `credibilityDeclarations` — the leader's own exchangeability ruling per
 *    group: "borrow for this group" / "do not". The engine will not pool a group
 *    the leader has refused, whatever the arithmetic says, because whether units
 *    are draws from one distribution is a judgement about the world and not a
 *    statistic.
 *  - `credibilityMarkers` — rule idempotency markers.
 *
 * An unreadable record is dropped with a warning. Nothing is clamped into a
 * plausible-looking figure: a probability of 1.4 is not a probability, and a
 * frame that claimed a grade without an outcome returns to frozen.
 */

import {
  CREDIBILITY_DECLARATION_CAP,
  CREDIBILITY_FRAME_CAP,
  CREDIBILITY_GROUP_IDS,
  CREDIBILITY_MARKER_CAP,
  CREDIBILITY_MAX_PCT,
  CREDIBILITY_MIN_PCT,
} from './credibilityRegistry.js';

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

/**
 * Linkable provenance. Only entity types the case graph can resolve are kept,
 * because a frame that points at a node nobody can open is a dead end dressed
 * as an audit trail.
 */
const EVIDENCE_REF_TYPES = Object.freeze(['premise', 'alert']);
const evidenceRefs = (value) => (Array.isArray(value)
  ? value
    .filter((row) => row && typeof row === 'object'
      && EVIDENCE_REF_TYPES.includes(row.type)
      && typeof row.id === 'string' && row.id.length > 0)
    .map((row) => ({ type: row.type, id: row.id.slice(0, 60) }))
    .slice(0, 4)
  : []);

export function normalizeCredibilityFrames(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const rows = [];
  for (const item of raw.slice(0, CREDIBILITY_FRAME_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = text(item.id, 60);
    const groupId = text(item.groupId, 40);
    const unitId = text(item.unitId, 80);
    const frozenAt = iso(item.frozenAt);
    const reviewOn = day(item.reviewOn);
    const borrowedPct = finite(item.borrowedPct, CREDIBILITY_MIN_PCT, CREDIBILITY_MAX_PCT);
    const rawPct = finite(item.rawPct, CREDIBILITY_MIN_PCT, CREDIBILITY_MAX_PCT);
    const horizonN = whole(item.horizonN, 1, 40, null);
    if (!id || !CREDIBILITY_GROUP_IDS.includes(groupId) || !unitId || !frozenAt
      || !reviewOn || reviewOn < frozenAt.slice(0, 10)
      || borrowedPct === null || rawPct === null || horizonN === null || seen.has(id)) {
      warnings.push('Credibility frames: dropped a frame without a registered group, a unit, two frozen probabilities, a future review day or a horizon.');
      continue;
    }
    const rawGrade = item.graded;
    const graded = rawGrade && typeof rawGrade === 'object' && !Array.isArray(rawGrade)
      && iso(rawGrade.gradedAt)
      && whole(rawGrade.observed, 1, 400, null) !== null
      && finite(rawGrade.brierBorrowed, 0, 1) !== null
      && finite(rawGrade.brierRaw, 0, 1) !== null
      && iso(rawGrade.gradedAt).slice(0, 10) >= reviewOn
      ? {
        gradedAt: iso(rawGrade.gradedAt),
        observed: whole(rawGrade.observed, 1, 400, 1),
        successes: whole(rawGrade.successes, 0, 400, 0),
        brierBorrowed: rawGrade.brierBorrowed,
        brierRaw: rawGrade.brierRaw,
        // Skill is a DERIVED figure and is recomputed on read from the two
        // frozen Brier scores, so a stored one cannot disagree with them.
        skill: null,
      } : null;
    if (rawGrade && !graded) {
      warnings.push(`Credibility frames: ${id} claimed a grade without a complete outcome; returned to frozen.`);
    }
    seen.add(id);
    rows.push({
      id,
      groupId,
      unitId,
      label: text(item.label, 120),
      frozenAt,
      reviewOn,
      borrowedPct,
      rawPct,
      nAtFreeze: whole(item.nAtFreeze, 0, 400, 0),
      zAtFreeze: finite(item.zAtFreeze, 0, 100),
      credibleLoPct: finite(item.credibleLoPct, 0, 100),
      credibleHiPct: finite(item.credibleHiPct, 0, 100),
      horizonN,
      regime: typeof item.regime === 'string' ? text(item.regime, 20) : '',
      pooledMeanPct: finite(item.pooledMeanPct, CREDIBILITY_MIN_PCT, CREDIBILITY_MAX_PCT),
      priorStrength: finite(item.priorStrength, 0, 100000),
      evidenceRefs: evidenceRefs(item.evidenceRefs),
      graded,
      // A frame whose window closed with no outcome is marked lapsed rather
      // than graded: an untested forecast is not a correct one. A graded frame
      // cannot also be lapsed.
      lapsedOn: graded ? null : (day(item.lapsedOn) && day(item.lapsedOn) >= reviewOn ? day(item.lapsedOn) : null),
      notes: (Array.isArray(item.notes)
        ? item.notes.filter((note) => typeof note === 'string').map((note) => note.slice(0, 240))
        : []).slice(-8),
    });
  }
  return rows.sort((a, b) => (a.frozenAt < b.frozenAt ? 1 : a.frozenAt > b.frozenAt ? -1 : 0));
}

export function normalizeCredibilityDeclarations(raw, warnings = []) {
  if (!Array.isArray(raw)) return [];
  const byGroup = new Map();
  for (const item of raw.slice(0, CREDIBILITY_DECLARATION_CAP * 2)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const groupId = text(item.groupId, 40);
    const declaredAt = iso(item.declaredAt);
    if (!CREDIBILITY_GROUP_IDS.includes(groupId) || !declaredAt || typeof item.allowed !== 'boolean') {
      warnings.push('Credibility declarations: dropped a ruling without a registered group, a date or an allow/refuse flag.');
      continue;
    }
    const row = {
      id: text(item.id, 60) || `credecl-${groupId}`,
      groupId,
      allowed: item.allowed,
      reason: text(item.reason, 400),
      declaredAt,
    };
    // One ruling per group: the later declaration wins, and the event log keeps
    // the reversal even though the collection keeps one answer.
    const existing = byGroup.get(groupId);
    if (!existing || existing.declaredAt <= row.declaredAt) byGroup.set(groupId, row);
  }
  return [...byGroup.values()]
    .sort((a, b) => (a.declaredAt < b.declaredAt ? 1 : -1))
    .slice(0, CREDIBILITY_DECLARATION_CAP);
}

export function normalizeCredibilityMarkers(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m) => typeof m === 'string' && m.length > 0)
    .map((m) => m.slice(0, 200)))].slice(-CREDIBILITY_MARKER_CAP);
}

/** The group ids a leader has explicitly refused to pool, as a Set. */
export function refusedGroups(state) {
  const rows = Array.isArray(state?.credibilityDeclarations) ? state.credibilityDeclarations : [];
  return new Set(rows.filter((row) => row && row.allowed === false).map((row) => row.groupId));
}
