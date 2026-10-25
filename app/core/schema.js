/**
 * app/core/schema.js — the data contract.
 *
 * The shape below is the single source of truth for what the application
 * stores. `normalizeState` is the safety net: it is run on every load and on
 * every import, so a partially written blob, an older blob, or a hand-edited
 * file degrades into a valid state plus a list of human-readable warnings
 * instead of a blank screen or a crash.
 *
 * Pure module: no storage access, no clock.
 */

import { normalizeConflicts } from './conflict-schema.js';

export const SCHEMA_VERSION = 5;
export const APP_ID = 'leados.lifecycle';

export const LEVELS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];
export const LEVEL_LABELS = {
  ic: 'Individual contributor',
  senior: 'Senior IC',
  lead: 'Team lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP / Executive',
};

export const PULSE_DIMENSIONS = ['safety', 'clarity', 'workload', 'growth'];
export const PULSE_LABELS = {
  safety: 'Psychological safety',
  clarity: 'Clarity of priorities',
  workload: 'Sustainable workload',
  growth: 'Growth & learning',
};
export const PULSE_PROMPTS = {
  safety: 'I can raise problems or mistakes on this team without being penalised.',
  clarity: 'I know what the most important thing to do this week is.',
  workload: 'My workload this week was sustainable.',
  growth: 'I am learning something that matters to my development.',
};

export const CONFIDENCE = ['on-track', 'at-risk', 'off-track'];
export const CONFIDENCE_LABELS = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
};

export const READINESS = ['ready-now', 'ready-later', 'not-ready'];
export const READINESS_LABELS = {
  'ready-now': 'Ready now',
  'ready-later': 'Ready in 1–2 years',
  'not-ready': 'Not yet ready',
};

// Optional, behaviour-anchored manager ratings. There is deliberately no
// self-rating: reflection supplies context, not a second score to average.
export const REVIEW_RATINGS = ['needs-development', 'meets-expectations', 'often-exceeds', 'sets-standard'];
export const REVIEW_RATING_LABELS = {
  'needs-development': 'Needs development',
  'meets-expectations': 'Consistently meets expectations',
  'often-exceeds': 'Often exceeds expectations',
  'sets-standard': 'Sets a new standard',
};

export const DEFAULT_SETTINGS = Object.freeze({
  leaderName: '',
  teamName: 'My team',
  orgName: '',
  oneOnOneCadenceDays: 7,
  feedbackTargetDays: 21,
  // Team conventions, not universal scores: both are user-configurable.
  feedbackLatencyTargetDays: 7,
  recognitionTargetDays: 21,
  goalCheckinDays: 14,
  delegationCheckinDays: 7,
  decisionReviewDays: 14,
  onboardingDays: 90,
  growthReviewDays: 30,
  maxReportsPerManager: 8,
  // Aggregates (including comments) are suppressed below this many responses.
  // Survey vendors publish floors between 3 and 10; 5 is the most common
  // default (Culture Amp, 15Five); 3 is a documented vendor minimum, not
  // an anonymity guarantee. Five is the default here.
  pulseMinResponses: 5,
  // Idle auto-lock: only meaningful for an encrypted workspace. 0 disables
  // it. An unlocked tab holding sensitive notes is the one situation the
  // passphrase does not protect against, so a sensible locked-by-default
  // window is provided and can be turned off in Settings.
  idleLockMinutes: 30,
  });

export const COLLECTIONS = [
  'people',
  'oneOnOnes',
  'feedback',
  'goals',
  'delegations',
  'conflicts',
  'growthPlans',
  'pulses',
  'decisions',
  'recognition',
  'readiness',
  'reviews',
  'events',
];

/** Stable empty state. `now` is an ISO string so the result is a pure value. */
export function createEmptyState(now = new Date().toISOString()) {
  const state = {
    schemaVersion: SCHEMA_VERSION,
    appId: APP_ID,
    meta: { createdAt: now, updatedAt: now, isDemo: false, revision: 0 },
    settings: { ...DEFAULT_SETTINGS },
  };
  for (const key of COLLECTIONS) state[key] = [];
  return state;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v, fallback = '') {
  return typeof v === 'string' ? v : fallback;
}

function num(v, fallback) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, min, max, fallback) {
  const n = Math.round(num(v, fallback));
  return Math.min(max, Math.max(min, n));
}

function isoOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function dayOrNull(v) {
  if (typeof v !== 'string' || !v) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// Calendar-day fields drive inclusive filtering, chronology and latency. A regex
// alone would accept impossible dates such as 2026-02-31 in a hand-edited import.
function calendarDayOrNull(v) {
  const day = dayOrNull(v);
  if (!day) return null;
  const parsed = new Date(`${day}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : null;
}

/**
 * Normalize settings, coercing and clamping every field so downstream code can
 * treat them as trusted numbers.
 */
export function normalizeSettings(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const d = DEFAULT_SETTINGS;
  return {
    leaderName: str(s.leaderName, d.leaderName).slice(0, 120),
    teamName: str(s.teamName, d.teamName).slice(0, 120) || d.teamName,
    orgName: str(s.orgName, d.orgName).slice(0, 120),
    oneOnOneCadenceDays: clampInt(s.oneOnOneCadenceDays, 1, 90, d.oneOnOneCadenceDays),
    feedbackTargetDays: clampInt(s.feedbackTargetDays, 1, 365, d.feedbackTargetDays),
    feedbackLatencyTargetDays: clampInt(s.feedbackLatencyTargetDays, 1, 90, d.feedbackLatencyTargetDays),
    recognitionTargetDays: clampInt(s.recognitionTargetDays, 1, 365, d.recognitionTargetDays),
    goalCheckinDays: clampInt(s.goalCheckinDays, 1, 180, d.goalCheckinDays),
    delegationCheckinDays: clampInt(s.delegationCheckinDays, 1, 90, d.delegationCheckinDays),
    decisionReviewDays: clampInt(s.decisionReviewDays, 1, 365, d.decisionReviewDays),
    onboardingDays: clampInt(s.onboardingDays, 7, 365, d.onboardingDays),
    growthReviewDays: clampInt(s.growthReviewDays, 1, 365, d.growthReviewDays),
    maxReportsPerManager: clampInt(s.maxReportsPerManager, 1, 30, d.maxReportsPerManager),
    pulseMinResponses: clampInt(s.pulseMinResponses, 3, 25, d.pulseMinResponses),
    idleLockMinutes: clampInt(s.idleLockMinutes, 0, 480, d.idleLockMinutes),
  };
}

/**
 * Topics a person has asked to raise in a 1:1. One line each, trimmed, capped
 * and de-duplicated. Stored as a plain string array so it stays readable in an
 * export and survives a copy/paste into the person dialog.
 */
export function normalizeTalkingPoints(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const text = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 12) break;
  }
  return out;
}

function normalizeAgenda(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => ({
      id: str(a.id) || `ag-${i}`,
      text: str(a.text).slice(0, 300),
      done: a.done === true,
      source: str(a.source, 'manual').slice(0, 40),
    }))
    .filter((a) => a.text);
}

function normalizeActions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => ({
      id: str(a.id) || `ac-${i}`,
      text: str(a.text).slice(0, 300),
      due: dayOrNull(a.due),
      done: a.done === true,
      completedOn: a.done === true ? calendarDayOrNull(a.completedOn) : null,
      personId: str(a.personId),
    }))
    .filter((a) => a.text);
}

function normalizeKeyResults(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((k, i) => {
      const start = num(k.start, 0);
      const target = num(k.target, 100);
      const current = num(k.current, start);
      const initialCurrent = k.initialCurrent === null || k.initialCurrent === undefined || typeof k.initialCurrent === 'boolean' || (typeof k.initialCurrent === 'string' && !k.initialCurrent.trim())
        ? null
        : num(k.initialCurrent, null);
      return {
        id: str(k.id) || `kr-${i}`,
        title: str(k.title).slice(0, 200),
        start,
        target,
        current,
        initialCurrent,
        unit: str(k.unit, '').slice(0, 12),
      };
    })
    .filter((k) => k.title);
}

function normalizeScores(raw) {
  const s = isPlainObject(raw) ? raw : {};
  const out = {};
  for (const dim of PULSE_DIMENSIONS) {
    if (s[dim] === null || s[dim] === undefined || typeof s[dim] === 'boolean' || (typeof s[dim] === 'string' && !s[dim].trim())) continue;
    const v = num(s[dim], null);
    if (v === null) continue;
    out[dim] = Math.min(5, Math.max(1, Math.round(v)));
  }
  return out;
}

function normalizeReviewEvidence(items) {
  if (!Array.isArray(items)) return [];
  const types = ['oneonone', 'feedback', 'goal', 'growth', 'recognition', 'delegation'];
  return items
    .filter(isPlainObject)
    .map((item, i) => {
      const sourceType = types.includes(item.sourceType) ? item.sourceType : 'goal';
      const sourceId = str(item.sourceId).slice(0, 200);
      const route = str(item.route);
      return {
        id: str(item.id) || `${sourceType}:${sourceId || i}`,
        sourceType,
        sourceId,
        date: calendarDayOrNull(item.date),
        title: str(item.title).slice(0, 1000),
        detail: str(item.detail).slice(0, 4000),
        meta: str(item.meta).slice(0, 1000),
        basis: str(item.basis).slice(0, 300),
        // Only local fragment routes survive import. This is a second line of
        // defence behind the DOM renderer, which never injects raw HTML.
        route: route.startsWith('#/') ? route.slice(0, 500) : '#/reviews',
        valence: ['positive', 'constructive', 'neutral'].includes(item.valence) ? item.valence : 'neutral',
      };
    })
    .filter((item) => item.sourceId && item.title);
}

function normalizeReflection(raw, prompts) {
  const source = isPlainObject(raw) ? raw : {};
  return Object.fromEntries(prompts.map((key) => [key, str(source[key]).slice(0, 10000)]));
}

function uniqueIds(list, label, warnings) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item.id) {
      warnings.push(`${label}: dropped a record with no id`);
      continue;
    }
    if (seen.has(item.id)) {
      warnings.push(`${label}: dropped a duplicate id (${item.id})`);
      continue;
    }
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function asArray(raw, key, warnings) {
  const value = raw[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push(`"${key}" was not a list and has been reset to empty`);
    return [];
  }
  return value.filter(isPlainObject);
}

/**
 * Coerce an arbitrary object into the current schema.
 * @returns {{ state: object, warnings: string[] }}
 */
export function normalizeState(raw, { now: normalizationTime = new Date() } = {}) {
  const warnings = [];
  if (!isPlainObject(raw)) {
    return {
      state: createEmptyState(),
      warnings: ['The file did not contain a LeadOS data object; started from an empty workspace.'],
    };
  }

  const now = normalizationTime.toISOString();
  const state = createEmptyState(now);
  state.schemaVersion = SCHEMA_VERSION;
  state.settings = normalizeSettings(raw.settings);
  if (raw.settings?.pulseMinResponses !== undefined && Number(raw.settings.pulseMinResponses) !== state.settings.pulseMinResponses) {
    warnings.push('Pulse privacy floor was repaired to the supported range of 3–25 responses; the default is 5.');
  }
  state.meta = {
    createdAt: isoOrNull(raw.meta?.createdAt) || now,
    updatedAt: isoOrNull(raw.meta?.updatedAt) || now,
    isDemo: raw.meta?.isDemo === true,
    revision: Math.max(0, Math.round(num(raw.meta?.revision, 0))),
  };

  const people = asArray(raw, 'people', warnings).map((p, i) => ({
    id: str(p.id) || `person-${i}`,
    name: str(p.name).trim().slice(0, 120),
    role: str(p.role).slice(0, 120),
    level: LEVELS.includes(p.level) ? p.level : 'ic',
    team: str(p.team).slice(0, 80),
    managerId: p.managerId ? str(p.managerId) : null,
    startDate: dayOrNull(p.startDate),
    focus: str(p.focus).slice(0, 300),
    talkingPoints: normalizeTalkingPoints(p.talkingPoints),
    status: p.status === 'archived' ? 'archived' : 'active',
    createdAt: isoOrNull(p.createdAt) || now,
    archivedAt: isoOrNull(p.archivedAt),
  }));
  state.people = uniqueIds(people.filter((p) => p.name), 'People', warnings);

  const oneOnOnes = asArray(raw, 'oneOnOnes', warnings).map((m, i) => ({
    id: str(m.id) || `oo-${i}`,
    personId: str(m.personId),
    date: dayOrNull(m.date) || now.slice(0, 10),
    status: ['held', 'skipped', 'moved'].includes(m.status) ? m.status : 'held',
    mood: m.mood === null || m.mood === undefined ? null : clampInt(m.mood, 1, 5, 3),
    agenda: normalizeAgenda(m.agenda),
    notes: str(m.notes).slice(0, 20000),
    actions: normalizeActions(m.actions),
    createdAt: isoOrNull(m.createdAt) || now,
  }));
  state.oneOnOnes = uniqueIds(oneOnOnes, '1:1s', warnings);

  const rawFeedback = asArray(raw, 'feedback', warnings);
  const feedback = rawFeedback.map((f, i) => ({
    id: str(f.id) || `fb-${i}`,
    personId: str(f.personId),
    direction: f.direction === 'received' ? 'received' : 'given',
    kind: f.kind === 'constructive' ? 'constructive' : 'praise',
    situation: str(f.situation).slice(0, 2000),
    behavior: str(f.behavior).slice(0, 2000),
    impact: str(f.impact).slice(0, 2000),
    tags: Array.isArray(f.tags) ? f.tags.filter((t) => typeof t === 'string').slice(0, 8) : [],
    date: calendarDayOrNull(f.date) || now.slice(0, 10),
    observedOn: calendarDayOrNull(f.observedOn),
    followUpOn: dayOrNull(f.followUpOn),
    followUpDone: f.followUpDone === true,
    followUpCompletedOn: f.followUpDone === true ? calendarDayOrNull(f.followUpCompletedOn) : null,
    createdAt: isoOrNull(f.createdAt) || now,
  }));
  state.feedback = uniqueIds(feedback, 'Feedback', warnings);
  const invalidObservations = rawFeedback.filter((f) => f.observedOn && !calendarDayOrNull(f.observedOn)).length;
  if (invalidObservations) warnings.push(`Feedback: ${invalidObservations} invalid observation date(s) were left unmeasured`);
  const reversedObservations = state.feedback.filter((f) => f.observedOn && f.observedOn > f.date).length;
  if (reversedObservations) warnings.push(`Feedback: ${reversedObservations} observation date(s) are after the conversation and need correction`);

  const rawGoals = asArray(raw, 'goals', warnings);
  const invalidGoalAuthorship = rawGoals.filter((g) => g.coAuthored !== null && g.coAuthored !== undefined && typeof g.coAuthored !== 'boolean').length;
  if (invalidGoalAuthorship) warnings.push(`Goals: ${invalidGoalAuthorship} invalid authorship value(s) were left unknown`);
  const goals = rawGoals.map((g, i) => {
    const status = ['active', 'done', 'dropped'].includes(g.status) ? g.status : 'active';
    return {
      id: str(g.id) || `goal-${i}`,
      title: str(g.title).slice(0, 200),
      description: str(g.description).slice(0, 4000),
      ownerId: g.ownerId ? str(g.ownerId) : null,
      scope: g.scope === 'team' ? 'team' : 'person',
      // Tri-state: true = co-authored, false = explicitly leader-set, null = unknown/N/A.
      coAuthored: g.ownerId ? (g.coAuthored === true ? true : g.coAuthored === false ? false : null) : null,
      dueDate: dayOrNull(g.dueDate),
      keyResults: normalizeKeyResults(g.keyResults),
      confidence: CONFIDENCE.includes(g.confidence) ? g.confidence : 'on-track',
      initialConfidence: CONFIDENCE.includes(g.initialConfidence) ? g.initialConfidence : null,
      status,
      completedOn: status === 'done' ? calendarDayOrNull(g.completedOn) : null,
      krUpdatedOn: calendarDayOrNull(g.krUpdatedOn),
      checkins: Array.isArray(g.checkins)
        ? g.checkins
            .filter(isPlainObject)
            .map((c, k) => ({
              id: str(c.id) || `chk-${k}`,
              date: dayOrNull(c.date) || now.slice(0, 10),
              note: str(c.note).slice(0, 2000),
              confidence: CONFIDENCE.includes(c.confidence) ? c.confidence : 'on-track',
              progressPct: typeof c.progressPct === 'number' && Number.isFinite(c.progressPct)
                ? Math.min(100, Math.max(0, Math.round(c.progressPct)))
                : null,
              keyResults: Array.isArray(c.keyResults)
                ? c.keyResults
                    .filter((kr) => isPlainObject(kr) && str(kr.id) && typeof kr.current === 'number' && Number.isFinite(kr.current))
                    .map((kr) => ({ id: str(kr.id), current: kr.current }))
                : null,
            }))
        : [],
      createdAt: isoOrNull(g.createdAt) || now,
    };
  });
  state.goals = uniqueIds(goals.filter((g) => g.title), 'Goals', warnings);

  let droppedDelegationCheckins = 0;
  const delegations = asArray(raw, 'delegations', warnings).map((d, i) => {
    const delegatedOn = calendarDayOrNull(d.delegatedOn);
    const status = ['active', 'done', 'returned'].includes(d.status) ? d.status : 'active';
    const completedOn = status === 'done' ? calendarDayOrNull(d.completedOn) : null;
    const returnedOn = status === 'returned' ? calendarDayOrNull(d.returnedOn) : null;
    const terminalOn = completedOn || returnedOn;
    const rawCheckins = Array.isArray(d.checkins) ? d.checkins.filter(isPlainObject) : [];
    const checkins = rawCheckins.map((c, k) => ({
      id: str(c.id) || `dchk-${k}`,
      date: calendarDayOrNull(c.date),
      progress: c.progress === 'blocked' ? 'blocked' : c.progress === 'on-track' ? 'on-track' : '',
      note: str(c.note).slice(0, 4000),
      createdAt: isoOrNull(c.createdAt),
    })).filter((c) => c.date && c.note && c.progress && (!delegatedOn || c.date >= delegatedOn) && (!terminalOn || c.date <= terminalOn));
    droppedDelegationCheckins += rawCheckins.length - checkins.length;
    return {
      id: str(d.id) || `delegation-${i}`,
      personId: str(d.personId),
      title: str(d.title).trim().slice(0, 200),
      expectedOutcome: str(d.expectedOutcome).slice(0, 4000),
      authority: ['recommend', 'agree', 'act-inform', 'own'].includes(d.authority) ? d.authority : '',
      support: str(d.support).slice(0, 4000),
      delegatedOn,
      dueOn: calendarDayOrNull(d.dueOn),
      status,
      checkins,
      completedOn,
      completionNote: status === 'done' ? str(d.completionNote).slice(0, 4000) : '',
      returnedOn,
      returnReason: status === 'returned' ? str(d.returnReason).slice(0, 4000) : '',
      createdAt: isoOrNull(d.createdAt) || now,
      updatedAt: isoOrNull(d.updatedAt) || isoOrNull(d.createdAt) || now,
    };
  });
  const validDelegations = delegations.filter((d) =>
    d.title && d.personId && d.delegatedOn
    && (!d.dueOn || d.dueOn >= d.delegatedOn)
    && (d.status !== 'done' || d.completedOn)
    && (d.status !== 'returned' || d.returnedOn)
    && (!d.completedOn || d.completedOn >= d.delegatedOn)
    && (!d.returnedOn || d.returnedOn >= d.delegatedOn),
  );
  if (validDelegations.length !== delegations.length) {
    warnings.push(`Delegations: dropped ${delegations.length - validDelegations.length} record(s) with a missing title, owner, terminal date or inconsistent dates`);
  }
  if (droppedDelegationCheckins) warnings.push(`Delegations: dropped ${droppedDelegationCheckins} incomplete, invalid or post-terminal check-in(s)`);
  state.delegations = uniqueIds(validDelegations, 'Delegations', warnings);

  state.conflicts = normalizeConflicts(raw.conflicts, warnings, now);

  const growthPlans = asArray(raw, 'growthPlans', warnings).map((p, i) => {
    const status = p.status === 'done' ? 'done' : 'active';
    return {
      id: str(p.id) || `gp-${i}`,
      personId: str(p.personId),
      goal: str(p.goal).slice(0, 2000),
      reality: str(p.reality).slice(0, 2000),
      options: Array.isArray(p.options)
        ? p.options.filter(isPlainObject).map((o, k) => ({ id: str(o.id) || `opt-${k}`, text: str(o.text).slice(0, 400) })).filter((o) => o.text)
        : [],
      will: normalizeActions(p.will),
      competencies: Array.isArray(p.competencies)
        ? p.competencies.filter((c) => typeof c === 'string').slice(0, 12)
        : [],
      reviewOn: dayOrNull(p.reviewOn),
      status,
      closedOn: status === 'done' ? calendarDayOrNull(p.closedOn) : null,
      stagesUpdatedOn: calendarDayOrNull(p.stagesUpdatedOn),
      createdAt: isoOrNull(p.createdAt) || now,
    };
  });
  state.growthPlans = uniqueIds(growthPlans.filter((p) => p.goal), 'Growth plans', warnings);

  const pulses = asArray(raw, 'pulses', warnings).map((p, i) => ({
    id: str(p.id) || `pulse-${i}`,
    date: dayOrNull(p.date) || now.slice(0, 10),
    // Anonymous responses never store a personId — enforced here, not in the UI.
    personId: p.anonymity === 'anonymous' ? null : p.personId ? str(p.personId) : null,
    anonymity: p.anonymity === 'named' && p.personId ? 'named' : 'anonymous',
    scores: normalizeScores(p.scores),
    comment: str(p.comment).slice(0, 2000),
    createdAt: isoOrNull(p.createdAt) || now,
  }));
  state.pulses = uniqueIds(pulses, 'Pulse responses', warnings);

  const decisions = asArray(raw, 'decisions', warnings).map((d, i) => ({
    id: str(d.id) || `dec-${i}`,
    title: str(d.title).slice(0, 200),
    question: str(d.question).slice(0, 2000),
    date: dayOrNull(d.date) || now.slice(0, 10),
    reversibility: d.reversibility === 'irreversible' ? 'irreversible' : 'reversible',
    driver: str(d.driver).slice(0, 120),
    approver: str(d.approver).slice(0, 120),
    contributors: str(d.contributors).slice(0, 300),
    informed: str(d.informed).slice(0, 300),
    options: Array.isArray(d.options)
      ? d.options
          .filter(isPlainObject)
          .map((o, k) => ({
            id: str(o.id) || `dopt-${k}`,
            label: str(o.label).slice(0, 300),
            pros: str(o.pros).slice(0, 1000),
            cons: str(o.cons).slice(0, 1000),
          }))
          .filter((o) => o.label)
      : [],
    chosen: str(d.chosen).slice(0, 300),
    rationale: str(d.rationale).slice(0, 4000),
    reviewOn: dayOrNull(d.reviewOn),
    reviewedOn: dayOrNull(d.reviewedOn),
    outcome: ['pending', 'good', 'mixed', 'bad'].includes(d.outcome) ? d.outcome : 'pending',
    outcomeNotes: str(d.outcomeNotes).slice(0, 4000),
    createdAt: isoOrNull(d.createdAt) || now,
  }));
  state.decisions = uniqueIds(decisions.filter((d) => d.title), 'Decisions', warnings);

  const recognition = asArray(raw, 'recognition', warnings).map((r, i) => ({
    id: str(r.id) || `rec-${i}`,
    personId: str(r.personId),
    what: str(r.what).slice(0, 2000),
    values: Array.isArray(r.values) ? r.values.filter((v) => typeof v === 'string').slice(0, 8) : [],
    visibility: r.visibility === 'private' ? 'private' : 'public',
    date: dayOrNull(r.date) || now.slice(0, 10),
    createdAt: isoOrNull(r.createdAt) || now,
  }));
  state.recognition = uniqueIds(recognition.filter((r) => r.what), 'Recognition', warnings);

  const readiness = asArray(raw, 'readiness', warnings).map((r, i) => ({
    id: str(r.id) || `rd-${i}`,
    personId: str(r.personId),
    seat: str(r.seat).slice(0, 160),
    rating: READINESS.includes(r.rating) ? r.rating : 'not-ready',
    updatedAt: isoOrNull(r.updatedAt) || now,
  }));
  state.readiness = uniqueIds(readiness.filter((r) => r.personId && r.seat), 'Readiness', warnings);

  const reviews = asArray(raw, 'reviews', warnings).map((review, i) => {
    const status = review.status === 'complete' ? 'complete' : 'draft';
    const updatedAt = isoOrNull(review.updatedAt) || isoOrNull(review.createdAt) || now;
    return {
      id: str(review.id) || `review-${i}`,
      personId: str(review.personId),
      periodStart: calendarDayOrNull(review.periodStart),
      periodEnd: calendarDayOrNull(review.periodEnd),
      status,
      selfReflection: normalizeReflection(review.selfReflection, ['achievements', 'challenges', 'growth', 'support']),
      selfReflectionRecordedAt: isoOrNull(review.selfReflectionRecordedAt),
      manager: {
        ...normalizeReflection(review.manager, ['achievements', 'development', 'nextSteps']),
        rating: REVIEW_RATINGS.includes(review.manager?.rating) ? review.manager.rating : '',
      },
      evidence: normalizeReviewEvidence(review.evidence),
      evidenceCapturedAt: isoOrNull(review.evidenceCapturedAt) || updatedAt,
      createdAt: isoOrNull(review.createdAt) || now,
      updatedAt,
      completedAt: status === 'complete' ? isoOrNull(review.completedAt) || updatedAt : null,
    };
  });
  const validReviews = reviews.filter((r) => r.personId && r.periodStart && r.periodEnd && r.periodStart <= r.periodEnd);
  if (validReviews.length !== reviews.length) warnings.push(`Reviews: dropped ${reviews.length - validReviews.length} record(s) with a missing person or invalid period`);
  state.reviews = uniqueIds(validReviews, 'Reviews', warnings);

  const events = asArray(raw, 'events', warnings).map((e, i) => ({
    id: str(e.id) || `ev-${i}`,
    ts: isoOrNull(e.ts) || now,
    type: str(e.type, 'unknown').slice(0, 60),
    entity: str(e.entity).slice(0, 40),
    entityId: str(e.entityId),
    summary: str(e.summary).slice(0, 300),
  }));
  state.events = uniqueIds(events, 'Event log', warnings);

  // Referential integrity: records pointing at people who no longer exist are
  // kept (history matters) but counted so the UI can say so honestly.
  const personIds = new Set(state.people.map((p) => p.id));
  const orphanChecks = [
    ['oneOnOnes', (r) => r.personId],
    ['feedback', (r) => r.personId],
    ['delegations', (r) => r.personId],
    ['growthPlans', (r) => r.personId],
    ['recognition', (r) => r.personId],
    ['readiness', (r) => r.personId],
    ['reviews', (r) => r.personId],
  ];
  for (const [key, getter] of orphanChecks) {
    const orphans = state[key].filter((r) => getter(r) && !personIds.has(getter(r))).length;
    if (orphans) warnings.push(`${key}: ${orphans} record(s) reference a person who is no longer in the roster`);
  }

  return { state, warnings };
}

/**
 * Migration table. Each entry takes the previous version's object and returns
 * the next one. Versions 2–5 add records and nullable context without
 * changing the storage key, so an existing workspace upgrades in place.
 * Unknown historical dates, snapshots and goal authorship stay null, never false/zero.
 */
export const MIGRATIONS = {
  4: (v4) => ({
    ...v4,
    schemaVersion: 5,
    feedback: Array.isArray(v4.feedback)
      ? v4.feedback.map((item) => (isPlainObject(item)
          ? {
              ...item,
              followUpCompletedOn: item.followUpDone === true && typeof item.followUpCompletedOn === 'string' ? item.followUpCompletedOn : null,
            }
          : item))
      : v4.feedback,
    goals: Array.isArray(v4.goals)
      ? v4.goals.map((goal) => {
          if (!isPlainObject(goal)) return goal;
          const hasCheckins = Array.isArray(goal.checkins) && goal.checkins.length > 0;
          return {
            ...goal,
            initialConfidence: CONFIDENCE.includes(goal.initialConfidence)
              ? goal.initialConfidence
              : !hasCheckins && CONFIDENCE.includes(goal.confidence)
                ? goal.confidence
                : null,
            completedOn: goal.status === 'done' && typeof goal.completedOn === 'string' ? goal.completedOn : null,
            krUpdatedOn: typeof goal.krUpdatedOn === 'string' ? goal.krUpdatedOn : null,
            keyResults: Array.isArray(goal.keyResults)
              ? goal.keyResults.map((kr) => (isPlainObject(kr)
                  ? {
                      ...kr,
                      initialCurrent: typeof kr.initialCurrent === 'number' && Number.isFinite(kr.initialCurrent)
                        ? kr.initialCurrent
                        : !hasCheckins && typeof kr.current === 'number' && Number.isFinite(kr.current)
                          ? kr.current
                          : null,
                    }
                  : kr))
              : goal.keyResults,
            checkins: Array.isArray(goal.checkins)
              ? goal.checkins.map((c) => (isPlainObject(c)
                  ? {
                      ...c,
                      progressPct: typeof c.progressPct === 'number' && Number.isFinite(c.progressPct) ? c.progressPct : null,
                      keyResults: Array.isArray(c.keyResults) ? c.keyResults : null,
                    }
                  : c))
              : goal.checkins,
          };
        })
      : v4.goals,
    growthPlans: Array.isArray(v4.growthPlans)
      ? v4.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              closedOn: plan.status === 'done' && typeof plan.closedOn === 'string' ? plan.closedOn : null,
              stagesUpdatedOn: typeof plan.stagesUpdatedOn === 'string' ? plan.stagesUpdatedOn : null,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        completedOn: w.done === true && typeof w.completedOn === 'string' ? w.completedOn : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v4.growthPlans,
  }),
  3: (v3) => ({ ...v3, schemaVersion: 4, conflicts: Array.isArray(v3.conflicts) ? v3.conflicts : [] }),
  1: (v1) => ({ ...v1, schemaVersion: 2, reviews: Array.isArray(v1.reviews) ? v1.reviews : [] }),
  2: (v2) => ({
    ...v2,
    schemaVersion: 3,
    settings: {
      ...v2.settings,
      feedbackLatencyTargetDays: v2.settings?.feedbackLatencyTargetDays ?? 7,
      delegationCheckinDays: v2.settings?.delegationCheckinDays ?? 7,
    },
    feedback: Array.isArray(v2.feedback)
      ? v2.feedback.map((item) => ({ ...item, observedOn: typeof item.observedOn === 'string' ? item.observedOn : null }))
      : [],
    goals: Array.isArray(v2.goals)
      ? v2.goals.map((goal) => ({
          ...goal,
          coAuthored: goal.ownerId && typeof goal.coAuthored === 'boolean' ? goal.coAuthored : null,
        }))
      : [],
    delegations: Array.isArray(v2.delegations) ? v2.delegations : [],
  }),
};

/** Apply migrations until the blob is current. Returns { raw, applied }. */
export function migrate(raw) {
  let current = isPlainObject(raw) ? { ...raw } : raw;
  const applied = [];
  if (!isPlainObject(current)) return { raw: current, applied };
  let version = Number.isFinite(current.schemaVersion) ? current.schemaVersion : 1;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    current = step(current);
    applied.push(`${version} → ${version + 1}`);
    version += 1;
  }
  return { raw: current, applied };
}
