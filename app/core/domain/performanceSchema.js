/**
 * app/core/domain/performanceSchema.js — the persisted contract for the
 * Performance Recovery terminal (Schema v62).
 *
 * A `performanceConcern` is the leader's *own* record of a performance gap and
 * of the process they have run about it. It is deliberately not a person
 * record: it stores no rating, no potential, no protected characteristic, no
 * score and no verdict about anyone's worth. The unit of analysis is the gap
 * between a stated expectation and observed behaviour, and the question the
 * record has to answer later is "was this handled fairly and was it handled at
 * all", not "how good is this person".
 *
 * Shape, and why each part exists:
 *
 *   standard       what was expected, where it was recorded, and when. The date
 *                  is the notice test: an expectation dated after the first
 *                  observation cannot have given the person notice.
 *   observations   dated, specific instances (SBI). This is the evidence, and
 *                  it is the only thing the audit will count.
 *   conversations  recorded two-way conversations. Voice is a procedural
 *                  requirement, not a nicety.
 *   supports       what the leader actually changed to help. A plan without
 *                  support is a trap with a calendar.
 *   answers        the leader's declared answers to the performance-analysis
 *                  questions (Mager & Pipe). Tri-state on purpose: an
 *                  unanswered question is `null`, never a silent "no".
 *   plan           objectives, a review date, the support it assumes, and a
 *                  written probability the plan will work — frozen at adoption
 *                  so it can be scored honestly later, never rewritten.
 *   outcome        how it actually ended, with a verdict; the frozen prediction
 *                  is scored from this and no earlier.
 *
 * Normalisation follows the workspace's rules for prediction-shaped records:
 * frozen numbers are read back as stored, dangling pointers are cleared rather
 * than followed, unreadable records are dropped with a warning instead of
 * being repaired into something plausible, and every append-only array is
 * bounded.
 */

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function calendarDayOrNull(value) {
  const raw = str(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function isoOrNull(value) {
  const raw = str(value).trim();
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function clampText(value, max) {
  return str(value).trim().slice(0, max);
}

function rateOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;
}

function triOrNull(value) {
  return value === true || value === false ? value : null;
}

/** Frozen probabilities use the same 5–95 clamp as every other forecast here. */
function probabilityOrNull(value) {
  const n = num(value);
  if (n === null) return null;
  return Math.round(Math.min(95, Math.max(5, n)) * 100) / 100;
}

export const PERFORMANCE_SCHEMA_VERSION = 1;

export const CONCERN_STATUSES = Object.freeze(['assessing', 'plan', 'monitoring', 'resolved', 'withdrawn']);
export const CONCERN_STATUS_LABELS = Object.freeze({
  assessing: 'Assessing',
  plan: 'Plan adopted',
  monitoring: 'Monitoring',
  resolved: 'Resolved',
  withdrawn: 'Withdrawn',
});

export const EXPECTATION_SOURCES = Object.freeze(['goal', 'role', 'verbal', 'none']);
export const EXPECTATION_SOURCE_LABELS = Object.freeze({
  goal: 'Recorded goal',
  role: 'Role expectation',
  verbal: 'Said out loud, not written',
  none: 'Never stated',
});

export const OBSERVATION_SOURCES = Object.freeze(['direct', 'feedback', 'oneonone', 'case', 'delegation', 'goal']);
export const OBSERVATION_SOURCE_LABELS = Object.freeze({
  direct: 'I observed it',
  feedback: 'Feedback I gave',
  oneonone: '1:1 conversation',
  case: 'Operational case',
  delegation: 'Delegation',
  goal: 'Goal check-in',
});

export const CONVERSATION_KINDS = Object.freeze(['two-way', 'notice']);
export const CONVERSATION_KIND_LABELS = Object.freeze({
  'two-way': 'Two-way conversation (they spoke too)',
  notice: 'I told them (no recorded reply)',
});

export const SUPPORT_KINDS = Object.freeze(['training', 'coaching', 'clarity', 'tooling', 'workload', 'feedback', 'none']);
export const SUPPORT_KIND_LABELS = Object.freeze({
  training: 'Training or practice',
  coaching: 'Coaching',
  clarity: 'Clearer expectations',
  tooling: 'Tooling or access',
  workload: 'Workload or priorities',
  feedback: 'Faster feedback loop',
  none: 'Nothing yet',
});

export const OUTCOME_VERDICTS = Object.freeze(['met', 'partial', 'not-met']);
export const OUTCOME_VERDICT_LABELS = Object.freeze({
  met: 'Met the expectation',
  partial: 'Partially met',
  'not-met': 'Not met',
});

export const ANSWER_KEYS = Object.freeze([
  'couldDoIfTried',
  'knowsWhat',
  'knowsWhen',
  'obstacle',
  'consequenceMissing',
  'capacity',
  'feedbackLoop',
]);

const MAX_CONCERNS = 120;
const MAX_OBSERVATIONS = 80;
const MAX_CONVERSATIONS = 60;
const MAX_SUPPORTS = 60;
const MAX_OBJECTIVES = 4;
const MAX_HISTORY = 80;
const MAX_MARKERS = 160;
const MAX_NOTES = 20;

function normalizeAnswers(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const key of ANSWER_KEYS) out[key] = triOrNull(source[key]);
  return out;
}

function normalizeObservations(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row) && calendarDayOrNull(row.date))
    .map((row) => ({
      id: clampText(row.id, 80),
      date: calendarDayOrNull(row.date),
      source: OBSERVATION_SOURCES.includes(row.source) ? row.source : 'direct',
      sourceId: clampText(row.sourceId, 120) || null,
      situation: clampText(row.situation, 600),
      behavior: clampText(row.behavior, 900),
      impact: clampText(row.impact, 600),
      note: clampText(row.note, 600),
    }))
    .filter((row) => row.id && (row.behavior || row.situation || row.note))
    .slice(-MAX_OBSERVATIONS);
}

function normalizeConversations(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row) && calendarDayOrNull(row.date))
    .map((row) => ({
      id: clampText(row.id, 80),
      date: calendarDayOrNull(row.date),
      kind: CONVERSATION_KINDS.includes(row.kind) ? row.kind : 'notice',
      note: clampText(row.note, 900),
      sourceId: clampText(row.sourceId, 120) || null,
    }))
    .filter((row) => row.id)
    .slice(-MAX_CONVERSATIONS);
}

function normalizeSupports(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row) && calendarDayOrNull(row.date))
    .map((row) => ({
      id: clampText(row.id, 80),
      date: calendarDayOrNull(row.date),
      kind: SUPPORT_KINDS.includes(row.kind) ? row.kind : 'none',
      note: clampText(row.note, 900),
    }))
    .filter((row) => row.id)
    .slice(-MAX_SUPPORTS);
}

function normalizeStandard(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    expectation: clampText(source.expectation, 1200),
    source: EXPECTATION_SOURCES.includes(source.source) ? source.source : 'none',
    recordedOn: calendarDayOrNull(source.recordedOn),
    recordId: clampText(source.recordId, 120) || null,
  };
}

function normalizeGap(raw) {
  const source = isPlainObject(raw) ? raw : {};
  return {
    observed: clampText(source.observed, 1200),
    impact: clampText(source.impact, 1200),
    gapSharePct: rateOrNull(source.gapSharePct),
    currency: /^[A-Z]{3}$/.test(str(source.currency)) ? str(source.currency) : 'USD',
    teamHoursPerWeek: num(source.teamHoursPerWeek) === null ? null : Math.max(0, Math.round(Number(source.teamHoursPerWeek) * 10) / 10),
  };
}

function normalizePlan(raw) {
  if (!isPlainObject(raw)) return null;
  const objectives = (Array.isArray(raw.objectives) ? raw.objectives : [])
    .filter((row) => isPlainObject(row) && str(row.text).trim())
    .map((row) => ({
      id: clampText(row.id, 80),
      text: clampText(row.text, 500),
      measure: clampText(row.measure, 500),
      byWhen: calendarDayOrNull(row.byWhen),
    }))
    .slice(0, MAX_OBJECTIVES);
  if (!objectives.length) return null;
  const prediction = isPlainObject(raw.prediction)
    ? {
        probabilityPct: probabilityOrNull(raw.prediction.probabilityPct),
        frozenOn: calendarDayOrNull(raw.prediction.frozenOn),
        horizonDays: num(raw.prediction.horizonDays) === null ? null : Math.max(1, Math.round(Number(raw.prediction.horizonDays))),
      }
    : null;
  return {
    adoptedOn: calendarDayOrNull(raw.adoptedOn),
    reviewOn: calendarDayOrNull(raw.reviewOn),
    cadenceDays: num(raw.cadenceDays) === null ? null : Math.max(1, Math.round(Number(raw.cadenceDays))),
    objectives,
    supportKinds: (Array.isArray(raw.supportKinds) ? raw.supportKinds : []).filter((k) => SUPPORT_KINDS.includes(k)),
    prediction,
    // An override is a recorded exception, never a silent bypass. It is kept
    // verbatim because it is the only defence a later reader has.
    overrideReason: clampText(raw.overrideReason, 1200),
  };
}

function normalizeOutcome(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    reviewedOn: calendarDayOrNull(raw.reviewedOn),
    verdict: OUTCOME_VERDICTS.includes(raw.verdict) ? raw.verdict : null,
    notes: clampText(raw.notes, 1500),
  };
}

function normalizeHistory(raw, now) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row))
    .map((row) => ({
      at: isoOrNull(row.at) || now,
      type: clampText(row.type, 40) || 'updated',
      summary: clampText(row.summary, 400),
    }))
    .slice(-MAX_HISTORY);
}

function normalizeNotes(raw, now) {
  return (Array.isArray(raw) ? raw : [])
    .filter((row) => isPlainObject(row) && str(row.text).trim())
    .map((row) => ({
      at: isoOrNull(row.at) || now,
      source: clampText(row.source, 80),
      text: clampText(row.text, 900),
    }))
    .slice(-MAX_NOTES);
}

function normalizeMarkers(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((marker) => typeof marker === 'string' && marker.length > 0)
    .map((marker) => marker.slice(0, 200))
    .slice(0, MAX_MARKERS);
}

/**
 * Normalize the whole collection. Fail-closed per record: an unreadable record
 * is dropped with a human-readable warning rather than guessed at.
 */
export function normalizePerformanceConcerns(raw, state = {}, now = new Date().toISOString(), warnings = []) {
  if (!Array.isArray(raw)) return [];
  const people = new Map((Array.isArray(state.people) ? state.people : []).map((p) => [p.id, p]));
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!isPlainObject(item) || !str(item.id).trim()) {
      warnings.push('A performance concern was dropped because it had no readable identifier.');
      continue;
    }
    const id = clampText(item.id, 80);
    if (seen.has(id)) {
      warnings.push(`Duplicate performance concern ${id} was dropped.`);
      continue;
    }
    seen.add(id);
    const personId = clampText(item.personId, 80) || null;
    const person = personId ? people.get(personId) : null;
    if (personId && !person) {
      warnings.push(`Performance concern “${clampText(item.label, 60) || id}” refers to a person who is no longer in the roster; the pointer was cleared and the record kept.`);
    }
    const observations = normalizeObservations(item.observations);
    const conversations = normalizeConversations(item.conversations);
    const plan = normalizePlan(item.plan);
    const status = CONCERN_STATUSES.includes(item.status)
      ? item.status
      : plan ? 'plan' : 'assessing';
    out.push({
      id,
      personId: person ? personId : null,
      label: clampText(item.label, 200) || 'Performance concern',
      status,
      openedOn: calendarDayOrNull(item.openedOn) || String(now).slice(0, 10),
      closedOn: calendarDayOrNull(item.closedOn),
      standard: normalizeStandard(item.standard),
      gap: normalizeGap(item.gap),
      observations,
      conversations,
      supports: normalizeSupports(item.supports),
      answers: normalizeAnswers(item.answers),
      plan,
      outcome: normalizeOutcome(item.outcome),
      // `withdrawnReason` is kept because withdrawing a concern is itself a
      // decision a later reader is entitled to see the reason for.
      withdrawnReason: clampText(item.withdrawnReason, 900),
      history: normalizeHistory(item.history, now),
      notes: normalizeNotes(item.notes, now),
      markers: normalizeMarkers(item.markers),
    });
  }
  if (out.length > MAX_CONCERNS) {
    warnings.push(`Only the most recent ${MAX_CONCERNS} performance concerns were kept.`);
  }
  return out.slice(-MAX_CONCERNS);
}
