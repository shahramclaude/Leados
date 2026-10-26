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
import {
  CASE_KINDS,
  CASE_STATUSES,
  FORBIDDEN_LINK_TYPES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
} from './domain/cases.js';

import {
  PORTFOLIO_DECISIONS,
  PORTFOLIO_KINDS,
  PORTFOLIO_SOURCE_TYPES,
  PORTFOLIO_STATUSES,
} from './domain/capacity.js';

import {
  CANDIDATE_STAGES,
  EVIDENCE_KIND_BY_ID,
  REQUISITION_REASONS,
  REQUISITION_STATUSES,
} from './domain/hiring.js';

import {
  CHANGE_IMPACT_KINDS,
  CHANGE_KINDS,
  CHANGE_STATUSES,
  FORCE_CATEGORIES,
  FORCE_SIDES,
  KOTTER_STEPS,
  STAR_PILLARS,
  TEAM_TOPOLOGY_TYPES,
  TOPOLOGY_INTERACTION_MODES,
} from './domain/changes.js';

export {
  CASE_KINDS,
  CASE_STATUSES,
  LINK_ENTITY_TYPES,
  LINK_RELATIONS,
  STAKEHOLDER_CADENCES,
  STAKEHOLDER_STANCES,
  PORTFOLIO_DECISIONS,
  PORTFOLIO_KINDS,
  PORTFOLIO_SOURCE_TYPES,
  PORTFOLIO_STATUSES,
  CANDIDATE_STAGES,
  REQUISITION_REASONS,
  REQUISITION_STATUSES,
  CHANGE_IMPACT_KINDS,
  CHANGE_KINDS,
  CHANGE_STATUSES,
  FORCE_CATEGORIES,
  FORCE_SIDES,
  KOTTER_STEPS,
  STAR_PILLARS,
  TEAM_TOPOLOGY_TYPES,
  TOPOLOGY_INTERACTION_MODES,
};

export const SCHEMA_VERSION = 21;
export const APP_ID = 'leados.lifecycle';
export const DECISION_OUTCOMES = ['pending', 'good', 'mixed', 'bad'];

export const LEVELS = ['ic', 'senior', 'lead', 'manager', 'director', 'vp'];
export const LEVEL_LABELS = {
  ic: 'Individual contributor',
  senior: 'Senior IC',
  lead: 'Team lead',
  manager: 'Manager',
  director: 'Director',
  vp: 'VP / Executive',
};

/**
 * Who owes a 1:1 commitment. There are exactly two people in the room, so the
 * vocabulary is deliberately small: the report, the leader, or both.
 *
 * `null` is a first-class value meaning "not recorded". It is never silently
 * replaced with a guess: an unrecorded owner is a real gap in a leader's
 * follow-through system, and the app surfaces it rather than papering over it.
 */
export const ACTION_OWNERS = ['them', 'leader', 'shared'];

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

export const ONBOARDING_HORIZONS = [30, 60, 90];
export const ONBOARDING_CATEGORIES = ['clarity', 'connection', 'culture', 'contribution', 'ownership'];
export const ONBOARDING_STATUSES = ['active', 'completed', 'archived'];
// A 30-60-90 plan is onboarding for someone joining the team, a role
// transition for a tenured person moving into a new scope (promotion, lateral
// move, IC -> Lead), or return-to-work ("re-boarding") after extended leave.
// The distinction is recorded, never inferred from tenure, never rewrites
// `person.startDate`, and never stores medical or leave reasons.
export const ONBOARDING_KINDS = ['new-hire', 'role-transition', 'reboarding'];

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
  caseReviewDays: 14,
  changeReviewDays: 21,
  // Selection & hiring conventions (Schema v17). The base rate is an explicit
  // assumption about how often a candidate who clears the bar succeeds — not a
  // validated constant — and the evidence floor is a convention, not a cutoff.
  hiringBaseRate: 0.45,
  hiringStallDays: 30,
  interviewHoursPerStage: 3,
  // Data minimisation (Schema v18). Candidate records are the most sensitive
  // thing this app holds and the least useful once a role is closed. This is a
  // *reminder* window, never a deletion timer: the app tells the leader which
  // records have outlived their usefulness and lets them decide. 0 disables it.
  candidateRetentionDays: 180,
  // Capacity & flow planning conventions (Schema v16). Hours are *focused*
  // hours per person per week: meetings and support are what the operational
  // reserve models, so counting them twice would overstate supply.
  capacityHoursPerWeek: 32,
  planningHorizonWeeks: 4,
  operationalLoadPct: 20,
  wipLimitPerPerson: 2,
  maxReportsPerManager: 8,
  // Seeded Monte Carlo portfolio & J-curve simulation conventions (Schema v20).
  // Fixed default seed makes every stochastic forecast reproducible across
  // sessions and machines; leaders can alter the seed or trial count anytime.
  simulationSeed: 42,
  simulationTrials: 1000,
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
  'onboarding',
  'managerSupport',
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
  'cases',
  'requisitions',
  'candidates',
  'changes',
  'links',
  'portfolio',
  'events',
];

/** Stable empty state. `now` is an ISO string so the result is a pure value. */
/**
 * `0` disables the retention reminder and must survive normalization intact.
 * Every other value is clamped to a real window; a negative or non-numeric
 * value is treated as "not answered" and gets the default, because clamping it
 * to 0 would switch a privacy reminder off as a side effect of a typo.
 */
function normalizeRetentionWindow(value, fallback) {
  if (value === 0 || value === '0') return 0;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(3650, Math.max(1, n));
}

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

/**
 * Schema v21: a recorded decision forecast ("P(this works out well)", %).
 * Clamped to 5–95 (Cromwell's rule — 0% and 100% are not defensible
 * probabilities); anything non-numeric stays null, never a defaulted 50.
 */
function normalizeForecastProbability(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(95, Math.max(5, Math.round(n)));
}

function finiteOrNull(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function nonNegativeOrNull(v) {
  const n = finiteOrNull(v);
  return n !== null && n >= 0 ? n : null;
}

/**
 * Schema v21: the forecast frozen when a plan item was funded (RULE-FCT-01).
 * Scoring compares recorded actuals against this belief, so the snapshot is
 * validated strictly: without a positive expected effort there is no forecast
 * to score and the whole snapshot is dropped rather than half-kept.
 */
function normalizeForecastSnapshot(raw) {
  if (!isPlainObject(raw)) return null;
  const effortExpected = nonNegativeOrNull(raw.effortExpected);
  if (effortExpected === null || effortExpected <= 0) return null;
  return {
    fundedOn: calendarDayOrNull(raw.fundedOn),
    targetOn: calendarDayOrNull(raw.targetOn),
    effortOptimistic: nonNegativeOrNull(raw.effortOptimistic) ?? 0,
    effortMostLikely: nonNegativeOrNull(raw.effortMostLikely) ?? 0,
    effortPessimistic: nonNegativeOrNull(raw.effortPessimistic) ?? 0,
    effortExpected,
    effortStdDev: nonNegativeOrNull(raw.effortStdDev) ?? 0,
    effortP10: nonNegativeOrNull(raw.effortP10) ?? 0,
    effortP80: nonNegativeOrNull(raw.effortP80) ?? effortExpected,
    effortP90: nonNegativeOrNull(raw.effortP90) ?? effortExpected,
    valueExpected: nonNegativeOrNull(raw.valueExpected),
    currency: (str(raw.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
  };
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
    caseReviewDays: clampInt(s.caseReviewDays, 1, 365, d.caseReviewDays),
    changeReviewDays: clampInt(s.changeReviewDays, 7, 365, d.changeReviewDays),
    hiringBaseRate: Math.min(0.95, Math.max(0.05, Math.round((Number(s.hiringBaseRate) || d.hiringBaseRate) * 100) / 100)),
    hiringStallDays: clampInt(s.hiringStallDays, 7, 180, d.hiringStallDays),
    interviewHoursPerStage: clampInt(s.interviewHoursPerStage, 1, 12, d.interviewHoursPerStage),
    // Zero is a deliberate "off". Anything invalid (negative, non-numeric)
    // falls back to the default rather than to 0: silently disabling a
    // data-minimisation reminder because of a typo is the wrong failure
    // direction, and the reminder never deletes anything by itself.
    candidateRetentionDays: normalizeRetentionWindow(s.candidateRetentionDays, d.candidateRetentionDays),
    capacityHoursPerWeek: clampInt(s.capacityHoursPerWeek, 1, 60, d.capacityHoursPerWeek),
    planningHorizonWeeks: clampInt(s.planningHorizonWeeks, 1, 26, d.planningHorizonWeeks),
    operationalLoadPct: clampInt(s.operationalLoadPct, 0, 80, d.operationalLoadPct),
    wipLimitPerPerson: clampInt(s.wipLimitPerPerson, 1, 12, d.wipLimitPerPerson),
    maxReportsPerManager: clampInt(s.maxReportsPerManager, 1, 30, d.maxReportsPerManager),
    simulationSeed: clampInt(s.simulationSeed, 1, 999999999, d.simulationSeed),
    simulationTrials: clampInt(s.simulationTrials, 200, 5000, d.simulationTrials),
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

/**
 * A 1:1 action carries its own follow-through history so a promise can never
 * be "carried forward" invisibly:
 *   completedInMeetingId  the 1:1 where completion was confirmed face to face
 *                         (null when it was ticked off outside a conversation)
 *   carriedFrom           the exact action this one replaced, when it was
 *                         explicitly moved into a later meeting
 *   carriedTo*            the successor, set on the original at the same time
 *   dropped*              an explicit decision not to do it, with the reason
 *   owner                 who owes it (`them` / `leader` / `shared` / null)
 * A promise can be done, dropped or carried forward — never two at once.
 * `done` wins because a completion is evidence; a stale link is not.
 *
 * `owner` is only written where ownership is meaningful (1:1 actions). A GROW
 * "will" action is the report's by definition, so it is not given the field.
 */
function normalizeActions(items, { withOwner = false } = {}) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => {
      const done = a.done === true;
      const dropped = !done && a.dropped === true;
      const carriedFrom = isPlainObject(a.carriedFrom) && str(a.carriedFrom.meetingId) && str(a.carriedFrom.actionId)
        ? { meetingId: str(a.carriedFrom.meetingId), actionId: str(a.carriedFrom.actionId) }
        : null;
      return {
        id: str(a.id) || `ac-${i}`,
        text: str(a.text).slice(0, 300),
        due: dayOrNull(a.due),
        done,
        completedOn: done ? calendarDayOrNull(a.completedOn) : null,
        completedInMeetingId: done ? str(a.completedInMeetingId) || null : null,
        dropped,
        droppedOn: dropped ? calendarDayOrNull(a.droppedOn) : null,
        droppedReason: dropped ? str(a.droppedReason).slice(0, 300) : '',
        droppedInMeetingId: dropped ? str(a.droppedInMeetingId) || null : null,
        personId: str(a.personId),
        // Keep a corrupted value as text so `auditActionOwners` can report the
        // repair rather than silently swallowing it.
        ...(withOwner ? {
          owner: a.owner === null || a.owner === undefined || a.owner === ''
            ? null
            : String(a.owner).trim().toLowerCase() || null,
        } : {}),
        carriedFrom,
        carriedToMeetingId: done || dropped ? null : str(a.carriedToMeetingId) || null,
        carriedToActionId: done || dropped ? null : str(a.carriedToActionId) || null,
      };
    })
    .filter((a) => a.text);
}

/**
 * A GROW "will" commitment carries the same follow-through history as a 1:1
 * promise, scoped to its own plan (a later plan supersedes the earlier one, so
 * a carry never crosses plans):
 *   done / completedOn           delivered, and when
 *   dropped*                     an explicit decision to stop, with the reason
 *   carriedFromId / carriedToId  the promise this one replaced and its successor
 *   completedInReviewId          the development review that closed it
 *   droppedInReviewId            the development review that dropped it
 *   carriedInReviewId            the development review that moved it
 * One commitment is done, dropped or carried forward — never two at once.
 * `done` wins, because a completion is evidence and a stale link is not.
 *
 * There is deliberately no `owner`: a development action belongs to the person
 * whose plan it is by definition.
 */
function normalizeWillActions(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((a, i) => {
      const done = a.done === true;
      const dropped = !done && a.dropped === true;
      return {
        id: str(a.id) || `ac-${i}`,
        text: str(a.text).slice(0, 300),
        due: dayOrNull(a.due),
        // When the commitment was written down. `first_agreed_on` in the export
        // and the "carried N× since" line both derive from it.
        addedOn: calendarDayOrNull(a.addedOn),
        done,
        completedOn: done ? calendarDayOrNull(a.completedOn) : null,
        completedInReviewId: done ? str(a.completedInReviewId) || null : null,
        dropped,
        droppedOn: dropped ? calendarDayOrNull(a.droppedOn) : null,
        droppedReason: dropped ? str(a.droppedReason).slice(0, 300) : '',
        droppedInReviewId: dropped ? str(a.droppedInReviewId) || null : null,
        personId: str(a.personId),
        delegationId: str(a.delegationId) || null,
        carriedFromId: str(a.carriedFromId) || null,
        carriedToId: done || dropped ? null : str(a.carriedToId) || null,
        carriedInReviewId: str(a.carriedInReviewId) || null,
      };
    })
    .filter((a) => a.text);
}

/**
 * Audit explicit GROW commitment → delegation links after both collections
 * have been normalised. A commitment may only link to an existing delegation
 * owned by the same person; missing or cross-person links are cleared with a
 * warning rather than left dangling or matched heuristically.
 */
function auditWillDelegationLinks(plans, delegations, warnings) {
  const byId = new Map(delegations.map((d) => [d.id, d]));
  let cleared = 0;
  for (const plan of plans) {
    for (const action of plan.will) {
      if (!action.delegationId) continue;
      const target = byId.get(action.delegationId);
      if (!target || target.personId !== plan.personId) {
        action.delegationId = null;
        cleared += 1;
      }
    }
  }
  if (cleared) {
    warnings.push(`Growth plans: cleared ${cleared} broken delegation link(s) on development commitments`);
  }
}

/**
 * A recorded development review: the conversation, not the date.
 *
 * `nextReviewOn` is what the two of them agreed to, and it is the only thing
 * that moves a plan's review date legitimately. Pushing `reviewOn` without a
 * review is counted as a deferral instead (see `logGrowthReview` and
 * `GROW-07`), because a plan whose review keeps sliding is not being reviewed.
 */
function normalizeGrowthReviews(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(isPlainObject)
    .map((r, i) => ({
      id: str(r.id) || `grev-${i}`,
      date: calendarDayOrNull(r.date),
      notes: str(r.notes).slice(0, 4000),
      nextReviewOn: calendarDayOrNull(r.nextReviewOn),
      createdAt: isoOrNull(r.createdAt),
    }))
    .filter((r) => r.date);
}

/**
 * Repair carried-forward development chains inside each plan, using the same
 * rule as the 1:1 ledger: a link that cannot be honoured is cleared and the
 * commitment reopens, because losing a development promise silently is the
 * exact failure this ledger exists to prevent.
 */
function repairWillChains(plans, warnings) {
  let reopened = 0;
  let relinked = 0;
  let clearedBackrefs = 0;
  for (const plan of plans) {
    const byId = new Map(plan.will.map((a) => [a.id, a]));
    const seenIds = new Set();
    plan.will = plan.will.filter((action) => {
      if (seenIds.has(action.id)) return false;
      seenIds.add(action.id);
      return true;
    });
    for (const action of plan.will) {
      if (!action.carriedToId) continue;
      const target = byId.get(action.carriedToId);
      if (!target || target === action || (target.carriedFromId && target.carriedFromId !== action.id)) {
        action.carriedToId = null;
        reopened += 1;
        continue;
      }
      if (!target.carriedFromId) {
        target.carriedFromId = action.id;
        relinked += 1;
      }
    }
    for (const action of plan.will) {
      if (!action.carriedFromId) continue;
      const source = byId.get(action.carriedFromId);
      if (!source || source === action || source.done || source.dropped) {
        action.carriedFromId = null;
        clearedBackrefs += 1;
        continue;
      }
      if (!source.carriedToId) {
        source.carriedToId = action.id;
        relinked += 1;
      } else if (source.carriedToId !== action.id) {
        action.carriedFromId = null;
        clearedBackrefs += 1;
      }
    }
    // A cycle would make the chain infinite for anything that walks it.
    for (const action of plan.will) {
      const path = new Set();
      let cursor = action;
      while (cursor?.carriedToId && !path.has(cursor.id)) {
        path.add(cursor.id);
        cursor = byId.get(cursor.carriedToId);
      }
      if (cursor && path.has(cursor.id) && cursor.carriedToId) {
        cursor.carriedToId = null;
        reopened += 1;
      }
    }
  }
  if (reopened) warnings.push(`Growth plans: reopened ${reopened} carried-forward commitment(s) whose successor could not be honoured`);
  if (relinked) warnings.push(`Growth plans: rebuilt ${relinked} carry link(s) from the plan's own history`);
  if (clearedBackrefs) warnings.push(`Growth plans: cleared ${clearedBackrefs} carried-forward reference(s) that could not be honoured`);
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
 * Action ids only have to be unique inside their own meeting, but a carry link
 * names a pair, so a duplicated id makes the chain ambiguous. Drop the later
 * duplicate and say so, matching how duplicate record ids are handled.
 */
function dedupeActionIds(meetings, warnings) {
  let dropped = 0;
  for (const meeting of meetings) {
    const seen = new Set();
    meeting.actions = meeting.actions.filter((action) => {
      if (seen.has(action.id)) {
        dropped += 1;
        return false;
      }
      seen.add(action.id);
      return true;
    });
  }
  if (dropped) warnings.push(`1:1s: dropped ${dropped} duplicate action id(s)`);
}

/**
 * Ownership is only meaningful in the vocabulary above. Anything else (a
 * hand-edited file, a value from a future version, `true`) becomes "not
 * recorded" and is reported — quietly guessing who owes a promise would put a
 * fabricated name against a real person's commitment.
 */
function auditActionOwners(meetings, warnings) {
  let cleared = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (action.owner === null || action.owner === undefined) continue;
      if (ACTION_OWNERS.includes(action.owner)) continue;
      action.owner = null;
      cleared += 1;
    }
  }
  if (cleared) warnings.push(`1:1s: cleared ${cleared} unrecognised commitment owner(s)`);
}

/**
 * Repair carried-forward chains once every meeting has been normalised.
 *
 * An explicit carry is a claim: "this promise moved into that later meeting".
 * If the successor is missing, belongs to another person, moves backwards in
 * time or points back into a cycle, the honest repair is to reopen the
 * original with a warning. Silently keeping a broken link would make the
 * commitment vanish from every open-actions list — the exact failure this
 * feature exists to prevent.
 */
function repairCarryChains(meetings, warnings) {
  const byId = new Map(meetings.map((m) => [m.id, m]));
  const index = new Map();
  for (const meeting of meetings) {
    for (const action of meeting.actions) index.set(`${meeting.id}|${action.id}`, { meeting, action });
  }
  let reopened = 0;
  let relinked = 0;

  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (!action.carriedToMeetingId) continue;
      const targetMeeting = byId.get(action.carriedToMeetingId);
      const target = targetMeeting ? targetMeeting.actions.find((a) => a.id === action.carriedToActionId) : null;
      const invalid = !targetMeeting
        || !target
        || targetMeeting.personId !== meeting.personId
        || targetMeeting.date < meeting.date
        || Boolean(target.carriedFrom && (target.carriedFrom.meetingId !== meeting.id || target.carriedFrom.actionId !== action.id));
      if (invalid) {
        action.carriedToMeetingId = null;
        action.carriedToActionId = null;
        reopened += 1;
        continue;
      }
      if (!target.carriedFrom) {
        target.carriedFrom = { meetingId: meeting.id, actionId: action.id };
        relinked += 1;
      }
    }
  }

  // A successor that names its predecessor is itself evidence of a carry. If the
  // forward link is missing (a partial import, a hand-edited file), rebuild it
  // so the original is not counted as open at the same time as its copy.
  let linkedFromBackref = 0;
  let droppedBackref = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      if (!action.carriedFrom) continue;
      const from = index.get(`${action.carriedFrom.meetingId}|${action.carriedFrom.actionId}`);
      if (!from || from.meeting.personId !== meeting.personId || from.action.done || from.action.dropped) {
        action.carriedFrom = null;
        droppedBackref += 1;
        continue;
      }
      if (!from.action.carriedToMeetingId) {
        from.action.carriedToMeetingId = meeting.id;
        from.action.carriedToActionId = action.id;
        linkedFromBackref += 1;
      } else if (from.action.carriedToMeetingId !== meeting.id || from.action.carriedToActionId !== action.id) {
        action.carriedFrom = null;
        droppedBackref += 1;
      }
    }
  }

  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      const seen = new Set([`${meeting.id}|${action.id}`]);
      let cursor = { meeting, action };
      while (cursor.action.carriedToMeetingId) {
        const key = `${cursor.action.carriedToMeetingId}|${cursor.action.carriedToActionId}`;
        if (seen.has(key)) {
          cursor.action.carriedToMeetingId = null;
          cursor.action.carriedToActionId = null;
          reopened += 1;
          break;
        }
        seen.add(key);
        const next = index.get(key);
        if (!next) break;
        cursor = next;
      }
    }
  }

  let lostConfirmation = 0;
  for (const meeting of meetings) {
    for (const action of meeting.actions) {
      for (const field of ['completedInMeetingId', 'droppedInMeetingId']) {
        if (!action[field]) continue;
        const ref = byId.get(action[field]);
        if (!ref || ref.personId !== meeting.personId) {
          action[field] = null;
          if (field === 'completedInMeetingId') lostConfirmation += 1;
        }
      }
    }
  }

  if (reopened) {
    warnings.push(`1:1s: reopened ${reopened} carried-forward commitment(s) whose successor link was invalid`);
  }
  if (relinked) warnings.push(`1:1s: rebuilt ${relinked} missing carried-forward link(s)`);
  if (linkedFromBackref) warnings.push(`1:1s: rebuilt ${linkedFromBackref} carry link(s) from a successor's own history`);
  if (droppedBackref) warnings.push(`1:1s: cleared ${droppedBackref} carried-forward reference(s) that could not be honoured`);
  if (lostConfirmation) {
    warnings.push(`1:1s: kept ${lostConfirmation} completed action(s) but cleared a confirmation that pointed at a missing 1:1`);
  }
}

function normalizeOnboardingStakeholders(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenNames = new Set();
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 160);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) {
      if (warnings) warnings.push('Onboarding: dropped a duplicate stakeholder entry');
      continue;
    }
    seenNames.add(key);
    let id = str(raw.id) || `onbs-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const met = raw.met === true;
    out.push({
      id,
      name,
      purpose: str(raw.purpose).trim().slice(0, 300),
      met,
      metOn: met ? calendarDayOrNull(raw.metOn) : null,
    });
  }
  return out;
}

function normalizeOnboardingCheckpoints(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const title = str(raw.title).trim().slice(0, 300);
    if (!title) continue;
    const rawHorizon = Number(raw.horizon);
    const horizon = ONBOARDING_HORIZONS.includes(rawHorizon) ? rawHorizon : 30;
    const category = ONBOARDING_CATEGORIES.includes(raw.category) ? raw.category : 'clarity';
    let id = str(raw.id) || `onbc-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const done = raw.done === true;
    if (raw.due !== undefined && raw.due !== null && raw.due !== '' && !calendarDayOrNull(raw.due) && warnings) {
      warnings.push('Onboarding: repaired an invalid checkpoint due date');
    }
    out.push({
      id,
      horizon,
      category,
      title,
      due: calendarDayOrNull(raw.due),
      done,
      completedOn: done ? calendarDayOrNull(raw.completedOn) : null,
      notes: str(raw.notes).trim().slice(0, 1000),
    });
  }
  return out;
}

function normalizeOnboardingReviews(raw, startDate, todayDay, warnings, planId) {
  const out = { 30: null, 60: null, 90: null };
  if (!isPlainObject(raw)) return out;
  for (const h of ONBOARDING_HORIZONS) {
    const entry = raw[h] ?? raw[String(h)];
    if (!isPlainObject(entry)) continue;
    const heldOn = calendarDayOrNull(entry.heldOn);
    const summary = str(entry.summary).trim().slice(0, 2000);
    const blockers = str(entry.blockers).trim().slice(0, 2000);
    if (!heldOn && !summary && !blockers) continue;
    if (heldOn && todayDay && heldOn > todayDay) {
      if (warnings) warnings.push(`Onboarding: ignored a future Day ${h} check-in date`);
      continue;
    }
    if (heldOn && startDate && heldOn < startDate) {
      if (warnings) warnings.push(`Onboarding: ignored a Day ${h} check-in date before the start date`);
      continue;
    }
    out[h] = {
      // A stable identity lets explicitly created manager-support commitments
      // point to this exact check-in even if its date/notes are later corrected.
      id: str(entry.id).trim() || `onbr-${planId}-${h}`,
      heldOn,
      summary,
      blockers,
    };
  }
  return out;
}

function normalizeManagerSupport(raw, onboarding, people, now, warnings) {
  const peopleIds = new Set(people.map((person) => person.id));
  const plans = new Map(onboarding.map((plan) => [plan.id, plan]));
  const todayDay = now.slice(0, 10);
  const records = asArray({ managerSupport: raw }, 'managerSupport', warnings).map((item, i) => {
    if (!isPlainObject(item)) return null;
    const planId = str(item.sourcePlanId).trim();
    const checkinId = str(item.sourceCheckinId).trim();
    const horizon = ONBOARDING_HORIZONS.includes(Number(item.sourceHorizon)) ? Number(item.sourceHorizon) : null;
    const sourceHeldOn = calendarDayOrNull(item.sourceHeldOn);
    const plan = plans.get(planId);
    const review = plan && horizon ? plan.reviews?.[horizon] : null;
    if (!plan || plan.personId !== item.personId || !review || review.id !== checkinId) {
      warnings.push(`Manager support: commitment ${str(item.id) || i} has a missing or mismatched source check-in; its recorded source details were preserved.`);
    }
    const status = ['open', 'done', 'dropped', 'carried'].includes(item.status) ? item.status : 'open';
    const createdAt = isoOrNull(item.createdAt) || now;
    const addedOn = calendarDayOrNull(item.addedOn) || createdAt.slice(0, 10) || todayDay;
    return {
      id: str(item.id) || `msup-${i}`,
      personId: str(item.personId),
      text: str(item.text).trim().slice(0, 1000),
      due: calendarDayOrNull(item.due),
      owner: 'leader',
      sourcePlanId: planId || null,
      sourceCheckinId: checkinId || null,
      sourceHorizon: horizon,
      sourceHeldOn,
      addedOn,
      status,
      completedOn: status === 'done' ? calendarDayOrNull(item.completedOn) : null,
      completedInMeetingId: status === 'done' ? (str(item.completedInMeetingId) || null) : null,
      droppedOn: status === 'dropped' ? calendarDayOrNull(item.droppedOn) : null,
      droppedReason: status === 'dropped' ? str(item.droppedReason).trim().slice(0, 500) : '',
      droppedInMeetingId: status === 'dropped' ? (str(item.droppedInMeetingId) || null) : null,
      carriedFromId: str(item.carriedFromId) || null,
      carriedFromMeetingId: str(item.carriedFromMeetingId) || null,
      carriedToId: status === 'carried' ? (str(item.carriedToId) || null) : null,
      carriedOn: status === 'carried' ? calendarDayOrNull(item.carriedOn) : null,
      carriedInMeetingId: status === 'carried' ? (str(item.carriedInMeetingId) || null) : null,
      createdAt,
      updatedAt: isoOrNull(item.updatedAt) || createdAt,
    };
  }).filter(Boolean);
  const valid = records.filter((item) => {
    const ok = peopleIds.has(item.personId) && item.text;
    if (!ok) warnings.push(`Manager support: dropped ${item.id} because its person or commitment text was missing.`);
    return ok;
  });
  return uniqueIds(valid, 'Manager support', warnings);
}

function nonNegativeFinite(v, fallback = 0) {
  const n = num(v, fallback);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

function normalizePertTriple(rawO, rawM, rawP, label, warnings) {
  const o = nonNegativeFinite(rawO, 0);
  const m = nonNegativeFinite(rawM, 0);
  const p = nonNegativeFinite(rawP, 0);
  if (o > m || m > p) {
    if (warnings) warnings.push(`Operational cases: re-ordered ${label} PERT estimates so optimistic <= most likely <= pessimistic`);
    const sorted = [o, m, p].sort((a, b) => a - b);
    return { o: sorted[0], m: sorted[1], p: sorted[2] };
  }
  return { o, m, p };
}

function normalizeCaseStakeholders(items, warnings) {
  if (!Array.isArray(items)) return [];
  const seenIds = new Set();
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 160);
    if (!name) continue;
    let id = str(raw.id).trim() || `cstk-${i}`;
    while (seenIds.has(id)) id = `${id}-${i}`;
    seenIds.add(id);
    const power = clampInt(raw.power, 1, 5, 3);
    const interest = clampInt(raw.interest, 1, 5, 3);
    const stance = STAKEHOLDER_STANCES.includes(raw.stance) ? raw.stance : 'neutral';
    const commsCadence = STAKEHOLDER_CADENCES.includes(raw.commsCadence) ? raw.commsCadence : '';
    out.push({
      id,
      name,
      role: str(raw.role).trim().slice(0, 120),
      power,
      interest,
      stance,
      commsCadence,
      lastCommsOn: calendarDayOrNull(raw.lastCommsOn),
      nextCommsOn: calendarDayOrNull(raw.nextCommsOn),
      keyMessage: str(raw.keyMessage).trim().slice(0, 600),
    });
    if (out.length >= 25) break;
  }
  if (items.length > 25 && warnings) {
    warnings.push('Operational cases: trimmed stakeholders above the 25-entry maximum');
  }
  return out;
}

function normalizeCases(raw, state, todayDay, now, warnings) {
  const personIds = new Set(state.people.map((p) => p.id));
  const goalIds = new Set(state.goals.map((g) => g.id));
  let clearedGoalLinks = 0;
  let clearedInvolvedRefs = 0;

  const mapped = asArray({ cases: raw }, 'cases', warnings).map((c, i) => {
    const title = str(c.title).trim().slice(0, 200);
    const kind = CASE_KINDS.includes(c.kind) ? c.kind : 'risk';
    if (c.kind !== undefined && !CASE_KINDS.includes(c.kind)) {
      warnings.push('Operational cases: repaired an unrecognised case type to risk');
    }
    const status = CASE_STATUSES.includes(c.status) ? c.status : 'open';
    if (c.status !== undefined && !CASE_STATUSES.includes(c.status)) {
      warnings.push('Operational cases: repaired an unrecognised case status to open');
    }
    let openedOn = calendarDayOrNull(c.openedOn) || todayDay;
    if (openedOn > todayDay) {
      openedOn = todayDay;
      warnings.push('Operational cases: clamped a future openedOn date to today');
    }
    const isClosed = status === 'resolved' || status === 'closed';
    let resolvedOn = null;
    if (isClosed) {
      const candidate = calendarDayOrNull(c.resolvedOn);
      resolvedOn = candidate && candidate >= openedOn && candidate <= todayDay ? candidate : todayDay;
    }

    const ownerId = str(c.ownerId).trim() || null;
    const rawInvolved = Array.isArray(c.involvedPersonIds) ? c.involvedPersonIds : [];
    const involvedSet = new Set();
    for (const pid of rawInvolved) {
      const cleanPid = str(pid).trim();
      if (!cleanPid) continue;
      if (!personIds.has(cleanPid)) {
        clearedInvolvedRefs += 1;
        continue;
      }
      involvedSet.add(cleanPid);
    }

    let linkedGoalId = str(c.linkedGoalId).trim() || null;
    if (linkedGoalId && !goalIds.has(linkedGoalId)) {
      linkedGoalId = null;
      clearedGoalLinks += 1;
    }

    const rawFmea = isPlainObject(c.fmea) ? c.fmea : {};
    const hasResidual =
      rawFmea.residualSeverity != null &&
      rawFmea.residualProbability != null &&
      rawFmea.residualDetectability != null &&
      Number.isFinite(Number(rawFmea.residualSeverity)) &&
      Number.isFinite(Number(rawFmea.residualProbability)) &&
      Number.isFinite(Number(rawFmea.residualDetectability));

    const fmea = {
      severity: clampInt(rawFmea.severity, 1, 10, 5),
      probability: clampInt(rawFmea.probability, 1, 10, 5),
      detectability: clampInt(rawFmea.detectability, 1, 10, 5),
      failureMode: str(rawFmea.failureMode).trim().slice(0, 600),
      effect: str(rawFmea.effect).trim().slice(0, 600),
      controls: str(rawFmea.controls).trim().slice(0, 600),
      residualSeverity: hasResidual ? clampInt(rawFmea.residualSeverity, 1, 10, 5) : null,
      residualProbability: hasResidual ? clampInt(rawFmea.residualProbability, 1, 10, 5) : null,
      residualDetectability: hasResidual ? clampInt(rawFmea.residualDetectability, 1, 10, 5) : null,
    };

    const rawFin = isPlainObject(c.financial) ? c.financial : {};
    const costTriple = normalizePertTriple(rawFin.optimistic, rawFin.mostLikely, rawFin.pessimistic, 'cost', warnings);
    const capTriple = normalizePertTriple(
      rawFin.capacityDaysOptimistic,
      rawFin.capacityDaysMostLikely,
      rawFin.capacityDaysPessimistic,
      'capacity-days',
      warnings,
    );
    const financial = {
      currency: (str(rawFin.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      optimistic: costTriple.o,
      mostLikely: costTriple.m,
      pessimistic: costTriple.p,
      mitigationCost: nonNegativeFinite(rawFin.mitigationCost, 0),
      capacityDaysOptimistic: capTriple.o,
      capacityDaysMostLikely: capTriple.m,
      capacityDaysPessimistic: capTriple.p,
      opportunityCost: str(rawFin.opportunityCost).trim().slice(0, 600),
    };

    const rawRca = isPlainObject(c.rca) ? c.rca : {};
    const whys = Array.isArray(rawRca.whys)
      ? rawRca.whys
          .filter((w) => typeof w === 'string')
          .map((w) => w.trim().slice(0, 500))
          .filter(Boolean)
          .slice(0, 5)
      : [];
    const rca = {
      problemStatement: str(rawRca.problemStatement).trim().slice(0, 1000),
      whys,
      rootCause: str(rawRca.rootCause).trim().slice(0, 1000),
      systemicBarrier: str(rawRca.systemicBarrier).trim().slice(0, 1000),
      preventiveAction: str(rawRca.preventiveAction).trim().slice(0, 1000),
    };

    const createdAt = isoOrNull(c.createdAt) || now;
    const updatedAt = isoOrNull(c.updatedAt) || createdAt;

    return {
      id: str(c.id).trim() || `case-${i}`,
      kind,
      status,
      title,
      summary: str(c.summary).trim().slice(0, 4000),
      ownerId,
      involvedPersonIds: [...involvedSet],
      linkedGoalId,
      openedOn,
      reviewOn: calendarDayOrNull(c.reviewOn),
      resolvedOn,
      resolutionNotes: isClosed ? str(c.resolutionNotes).trim().slice(0, 4000) : '',
      fmea,
      financial,
      rca,
      stakeholders: normalizeCaseStakeholders(c.stakeholders, warnings),
      autoPropagate: c.autoPropagate !== false,
      createdAt,
      updatedAt,
    };
  });

  const valid = mapped.filter((c) => c.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Operational cases: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (clearedGoalLinks) {
    warnings.push(`Operational cases: cleared ${clearedGoalLinks} broken goal link(s)`);
  }
  if (clearedInvolvedRefs) {
    warnings.push(`Operational cases: cleared ${clearedInvolvedRefs} missing involved-person reference(s)`);
  }
  return uniqueIds(valid, 'Operational cases', warnings);
}


/**
 * Schema v16 — the portfolio (operating-plan demand ledger).
 *
 * Each entry is work that consumes team capacity: planned work, a capacity
 * reserve created automatically from an operational case, maintenance, or
 * compliance. Effort and value are three-point PERT estimates; an item with no
 * estimate keeps a blank triple (`0,0,0`) rather than a plausible default, and
 * the capacity model counts it as unmeasured.
 *
 * Provenance (`sourceType`/`sourceId`) is validated against the collection it
 * names, so a portfolio entry can never point at a person who does not exist or
 * a case that was deleted. Dangling provenance degrades to `manual` with a
 * warning instead of silently keeping a lie.
 */
function normalizePortfolio(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).filter((p) => p.status !== 'archived').map((p) => p.id));
  const sourceSets = {
    goal: new Set((state.goals || []).map((r) => r.id)),
    case: new Set((state.cases || []).map((r) => r.id)),
    delegation: new Set((state.delegations || []).map((r) => r.id)),
    requisition: new Set((state.requisitions || []).map((r) => r.id)),
    change: new Set((state.changes || []).map((r) => r.id)),
  };
  let repairedSources = 0;
  let clearedOwners = 0;
  let clampedDecisions = 0;

  const mapped = asArray({ portfolio: raw }, 'portfolio', warnings).map((item, i) => {
    const title = str(item.title).trim().slice(0, 200);
    const kind = PORTFOLIO_KINDS.includes(item.kind) ? item.kind : 'project';
    if (item.kind !== undefined && !PORTFOLIO_KINDS.includes(item.kind)) {
      warnings.push('Portfolio: repaired an unrecognised item type to planned work');
    }
    let sourceType = PORTFOLIO_SOURCE_TYPES.includes(item.sourceType) ? item.sourceType : 'manual';
    if (item.sourceType !== undefined && !PORTFOLIO_SOURCE_TYPES.includes(item.sourceType)) {
      repairedSources += 1;
      sourceType = 'manual';
    }
    let sourceId = str(item.sourceId).trim() || null;
    if (sourceType !== 'manual') {
      if (!sourceId || !sourceSets[sourceType]?.has(sourceId)) {
        repairedSources += 1;
        sourceType = 'manual';
        sourceId = null;
      }
    } else {
      sourceId = null;
    }

    const effort = normalizePertTriple(
      item.effortDays?.optimistic,
      item.effortDays?.mostLikely,
      item.effortDays?.pessimistic,
      'portfolio effort-day',
      warnings,
    );
    const value = normalizePertTriple(
      item.value?.optimistic,
      item.value?.mostLikely,
      item.value?.pessimistic,
      'portfolio value',
      warnings,
    );

    let ownerId = str(item.ownerId).trim() || null;
    if (ownerId && !personIds.has(ownerId)) {
      ownerId = null;
      clearedOwners += 1;
    }

    let status = PORTFOLIO_STATUSES.includes(item.status) ? item.status : 'open';
    if (item.status !== undefined && !PORTFOLIO_STATUSES.includes(item.status)) {
      warnings.push('Portfolio: repaired an unrecognised item status to open');
    }
    const createdOn = calendarDayOrNull(item.createdOn) || todayDay;
    const completedOn = status === 'done' ? calendarDayOrNull(item.completedOn) : null;
    if (status === 'done' && !completedOn) {
      warnings.push('Portfolio: a delivered item has no recorded completion date, so it is excluded from throughput history');
    }
    const releasedOn = status === 'released' ? calendarDayOrNull(item.releasedOn) : null;

    let decision = PORTFOLIO_DECISIONS.includes(item.decision) ? item.decision : 'undecided';
    if (item.decision !== undefined && !PORTFOLIO_DECISIONS.includes(item.decision)) {
      warnings.push('Portfolio: repaired an unrecognised funding decision to undecided');
    }
    // A capacity reserve is committed by definition: it is work that already
    // exists (an incident's mitigation), not work waiting to be chosen.
    if (kind === 'capacity-reserve' && decision !== 'funded') {
      decision = 'funded';
      clampedDecisions += 1;
    }
    let decisionOn = calendarDayOrNull(item.decisionOn);
    if (decisionOn && decisionOn > todayDay) {
      decisionOn = todayDay;
      warnings.push('Portfolio: clamped a future funding-decision date to today');
    }

    return {
      id: str(item.id).trim() || `pf-${i}`,
      title,
      kind,
      status,
      sourceType,
      sourceId,
      ownerId,
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      value: { optimistic: value.o, mostLikely: value.m, pessimistic: value.p },
      currency: (str(item.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      decision,
      decisionOn,
      rationale: str(item.rationale).trim().slice(0, 1000),
      targetOn: calendarDayOrNull(item.targetOn),
      createdOn,
      completedOn,
      releasedOn,
      // Schema v21: what delivery actually cost/produced (recorded at
      // completion; null = honestly unknown, never back-filled from the
      // estimate), and the forecast frozen at funding time (RULE-FCT-01).
      actualEffortDays: nonNegativeOrNull(item.actualEffortDays),
      actualValue: finiteOrNull(item.actualValue),
      forecastSnapshot: normalizeForecastSnapshot(item.forecastSnapshot),
      createdAt: isoOrNull(item.createdAt) || now,
      updatedAt: isoOrNull(item.updatedAt) || isoOrNull(item.createdAt) || now,
    };
  });

  const valid = mapped.filter((item) => item.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Portfolio: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (repairedSources) warnings.push(`Portfolio: reset ${repairedSources} item(s) with missing or invalid source provenance to manual`);
  if (clearedOwners) warnings.push(`Portfolio: cleared ${clearedOwners} owner reference(s) to archived or missing people`);
  if (clampedDecisions) warnings.push(`Portfolio: marked ${clampedDecisions} capacity reserve(s) as funded, because a reserve is committed work`);
  return uniqueIds(valid, 'Portfolio', warnings);
}


/* ------------------------------------------------------------------ */
/* Schema v17 — Selection & hiring                                     */
/* ------------------------------------------------------------------ */

const HIRING_DECISION_OUTCOMES = ['pending', 'advance', 'hold', 'hire', 'reject', 'withdraw'];

/**
 * The competencies a role must be able to demonstrate, and whether each is a
 * hard requirement. A role with no competencies cannot be assessed against
 * anything, and every candidate will be reported as having no coverage rather
 * than being scored on vibes.
 */
function normalizeCompetencies(items, warnings) {
  const list = asArray({ competencies: items }, 'competencies', warnings);
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const raw = list[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    out.push({
      id: str(raw.id).trim() || `cmp-${i}`,
      name,
      weight: clampInt(raw.weight, 1, 5, 1),
      // Defaulting to required keeps the gate honest: an unmarked competency is
      // one the role needs, not one that can be quietly skipped.
      required: raw.required !== false,
    });
    if (out.length >= 12) break;
  }
  return uniqueIds(out, 'Requisition competencies', warnings);
}

/**
 * A requisition is a role the team has decided to fill. It carries the
 * competencies to assess, the interviewers whose time it consumes, and the
 * *optional* three-point effort estimate that lets the capacity layer reserve
 * real work. No salary or effort figure is ever inferred.
 */
function normalizeRequisitions(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const caseIds = new Set((state.cases || []).map((c) => c.id));
  let repaired = 0;

  const mapped = asArray({ requisitions: raw }, 'requisitions', warnings).map((req, i) => {
    if (!isPlainObject(req)) return null;
    const title = str(req.title).trim().slice(0, 160);
    const status = REQUISITION_STATUSES.includes(req.status) ? req.status : 'open';
    if (req.status !== undefined && !REQUISITION_STATUSES.includes(req.status)) {
      warnings.push('Hiring: repaired an unrecognised requisition status to open');
    }
    const reason = REQUISITION_REASONS.includes(req.reason) ? req.reason : 'growth';
    const openedOn = calendarDayOrNull(req.openedOn) || todayDay;
    const terminal = status === 'filled' || status === 'cancelled';
    let closedOn = calendarDayOrNull(req.closedOn);
    if (terminal && !closedOn) {
      closedOn = todayDay;
      warnings.push(`Hiring: “${title || 'a requisition'}” was closed without a date, so today was recorded`);
    }
    if (!terminal) closedOn = null;

    const effort = normalizePertTriple(
      req.effortDays?.optimistic,
      req.effortDays?.mostLikely,
      req.effortDays?.pessimistic,
      'hiring effort-day',
      warnings,
    );

    const interviewers = [
      ...new Set(
        (Array.isArray(req.interviewers) ? req.interviewers : [])
          .map((pid) => str(pid).trim())
          .filter((pid) => pid && personIds.has(pid)),
      ),
    ];
    if (Array.isArray(req.interviewers) && interviewers.length !== req.interviewers.length) {
      repaired += 1;
    }

    let filledPersonId = str(req.filledPersonId).trim() || null;
    if (filledPersonId && !personIds.has(filledPersonId)) {
      filledPersonId = null;
      repaired += 1;
    }
    let escalatedCaseId = str(req.escalatedCaseId).trim() || null;
    if (escalatedCaseId && !caseIds.has(escalatedCaseId)) {
      escalatedCaseId = null;
      repaired += 1;
    }

    const dailyCost = num(req.dailyVacancyCost, 0);
    return {
      id: str(req.id).trim() || `req-${i}`,
      title,
      team: str(req.team).trim().slice(0, 80),
      level: LEVELS.includes(req.level) ? req.level : 'ic',
      reason,
      status,
      openedOn,
      targetStartOn: calendarDayOrNull(req.targetStartOn),
      closedOn,
      filledPersonId,
      interviewers,
      competencies: normalizeCompetencies(req.competencies, warnings),
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      // A cost of vacancy is only ever what the leader recorded. No salary-band
      // arithmetic is used to invent one.
      dailyVacancyCost: dailyCost > 0 ? Math.round(dailyCost * 100) / 100 : null,
      currency: (str(req.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      notes: str(req.notes).trim().slice(0, 2000),
      autoEscalated: req.autoEscalated === true,
      escalatedCaseId,
      createdAt: isoOrNull(req.createdAt) || now,
      updatedAt: isoOrNull(req.updatedAt) || isoOrNull(req.createdAt) || now,
    };
  });

  const valid = mapped.filter((req) => req && req.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Hiring: dropped ${mapped.length - valid.length} requisition(s) with a missing role title`);
  }
  if (repaired) warnings.push(`Hiring: repaired ${repaired} requisition reference(s) to missing people or cases`);
  return uniqueIds(valid, 'Requisitions', warnings);
}

/**
 * A candidate is a named person in the process, the evidence recorded about
 * them, and the decision. Evidence ratings are 1–5 with a neutral 3; the
 * decision is stored with its rationale so a rejection is explainable later.
 */
function normalizeCandidates(raw, state, todayDay, now, warnings) {
  const reqById = new Map((state.requisitions || []).map((r) => [r.id, r]));
  const personIds = new Set((state.people || []).map((p) => p.id));
  let droppedSignals = 0;
  let repairedSignals = 0;
  let repairedPeople = 0;

  const mapped = asArray({ candidates: raw }, 'candidates', warnings).map((c, i) => {
    if (!isPlainObject(c)) return null;
    const name = str(c.name).trim().slice(0, 120);
    const reqId = str(c.reqId).trim();
    const requisition = reqById.get(reqId);
    const stage = CANDIDATE_STAGES.includes(c.stage) ? c.stage : 'sourced';
    if (c.stage !== undefined && !CANDIDATE_STAGES.includes(c.stage)) {
      warnings.push('Hiring: repaired an unrecognised candidate stage to sourced');
    }
    const competencyIds = new Set((requisition?.competencies || []).map((cmp) => cmp.id));

    const signals = [];
    const rawSignals = Array.isArray(c.signals) ? c.signals : [];
    for (let k = 0; k < rawSignals.length && signals.length < 60; k += 1) {
      const sig = rawSignals[k];
      if (!isPlainObject(sig)) {
        droppedSignals += 1;
        continue;
      }
      if (!EVIDENCE_KIND_BY_ID[sig.kind]) {
        droppedSignals += 1;
        continue;
      }
      const rating = Math.round(num(sig.rating, 0));
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        droppedSignals += 1;
        continue;
      }
      let competencyId = str(sig.competencyId).trim() || null;
      if (competencyId && !competencyIds.has(competencyId)) {
        competencyId = null;
        repairedSignals += 1;
      }
      let interviewerId = str(sig.interviewerId).trim() || null;
      if (interviewerId && !personIds.has(interviewerId)) {
        interviewerId = null;
        repairedSignals += 1;
      }
      signals.push({
        id: str(sig.id).trim() || `sig-${i}-${k}`,
        kind: sig.kind,
        competencyId,
        rating,
        interviewerId,
        date: calendarDayOrNull(sig.date),
        note: str(sig.note).trim().slice(0, 1000),
      });
    }

    const decisionRaw = isPlainObject(c.decision) ? c.decision : {};
    const outcome = HIRING_DECISION_OUTCOMES.includes(decisionRaw.outcome) ? decisionRaw.outcome : 'pending';

    let personId = str(c.personId).trim() || null;
    if (personId && !personIds.has(personId)) {
      personId = null;
      repairedPeople += 1;
    }

    return {
      id: str(c.id).trim() || `cand-${i}`,
      reqId,
      name,
      stage,
      appliedOn: calendarDayOrNull(c.appliedOn) || todayDay,
      lastActivityOn: calendarDayOrNull(c.lastActivityOn) || calendarDayOrNull(c.appliedOn) || todayDay,
      source: str(c.source).trim().slice(0, 120),
      signals,
      decision: {
        outcome,
        decidedOn: calendarDayOrNull(decisionRaw.decidedOn),
        rationale: str(decisionRaw.rationale).trim().slice(0, 4000),
        evidenceGapAcknowledged: decisionRaw.evidenceGapAcknowledged === true,
      },
      offerOn: calendarDayOrNull(c.offerOn),
      offerAcceptedOn: calendarDayOrNull(c.offerAcceptedOn),
      hiredOn: calendarDayOrNull(c.hiredOn),
      startOn: calendarDayOrNull(c.startOn),
      personId,
      keepInTouch: c.keepInTouch === true,
      createdAt: isoOrNull(c.createdAt) || now,
      updatedAt: isoOrNull(c.updatedAt) || isoOrNull(c.createdAt) || now,
    };
  });

  const valid = mapped.filter((c) => {
    if (!c) return false;
    if (!c.name || !reqById.has(c.reqId)) {
      warnings.push('Hiring: dropped a candidate record with no name or no existing requisition');
      return false;
    }
    return true;
  });
  if (droppedSignals) warnings.push(`Hiring: dropped ${droppedSignals} evidence record(s) with an unknown method or an out-of-range rating`);
  if (repairedSignals) warnings.push(`Hiring: unlinked ${repairedSignals} evidence record(s) from a missing competency or interviewer`);
  if (repairedPeople) warnings.push(`Hiring: cleared ${repairedPeople} candidate link(s) to a person who is no longer in the roster`);
  return uniqueIds(valid, 'Candidates', warnings);
}

/* ------------------------------------------------------------------ */
/* Schema v19 — Organizational Design, Team Topologies & Change       */
/* ------------------------------------------------------------------ */

function normalizeChangeForces(items) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 30; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const label = str(raw.label).trim().slice(0, 240);
    if (!label) continue;
    let id = str(raw.id).trim() || `frc-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    out.push({
      id,
      side: FORCE_SIDES.includes(raw.side) ? raw.side : 'restraining',
      label,
      weight: clampInt(raw.weight, 1, 5, 3),
      category: FORCE_CATEGORIES.includes(raw.category) ? raw.category : 'governance',
      mitigation: str(raw.mitigation).trim().slice(0, 500),
      mitigated: raw.mitigated === true,
    });
  }
  return out;
}

function normalizeChangeCoalition(items, personIds) {
  if (!Array.isArray(items)) return [];
  const seen = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 25; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    let id = str(raw.id).trim() || `ccoa-${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    const rawPid = str(raw.personId).trim() || null;
    out.push({
      id,
      personId: rawPid && personIds.has(rawPid) ? rawPid : null,
      name,
      role: str(raw.role).trim().slice(0, 120),
      power: clampInt(raw.power, 1, 5, 3),
      interest: clampInt(raw.interest, 1, 5, 3),
      stance: STAKEHOLDER_STANCES.includes(raw.stance) ? raw.stance : 'neutral',
      vetoPlayer: raw.vetoPlayer === true,
      keyMessage: str(raw.keyMessage).trim().slice(0, 400),
      lastBriefedOn: calendarDayOrNull(raw.lastBriefedOn),
      nextBriefOn: calendarDayOrNull(raw.nextBriefOn),
    });
  }
  return out;
}

function normalizeChangeImpacts(items, personIds) {
  if (!Array.isArray(items)) return [];
  const seenPersons = new Set();
  const out = [];
  for (let i = 0; i < items.length && out.length < 40; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const personId = str(raw.personId).trim();
    if (!personId || !personIds.has(personId) || seenPersons.has(personId)) continue;
    seenPersons.add(personId);
    out.push({
      id: str(raw.id).trim() || `cimp-${i}`,
      personId,
      impactKind: CHANGE_IMPACT_KINDS.includes(raw.impactKind) ? raw.impactKind : 'scope-shift',
      newRoleLabel: str(raw.newRoleLabel).trim().slice(0, 160),
      createTransitionPlan: raw.createTransitionPlan === true,
    });
  }
  return out;
}

function normalizeChangeWins(items, todayDay) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length && out.length < 20; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const text = str(raw.text).trim().slice(0, 300);
    if (!text) continue;
    out.push({
      id: str(raw.id).trim() || `cwin-${i}`,
      text,
      achievedOn: calendarDayOrNull(raw.achievedOn) || todayDay,
      verified: raw.verified !== false,
    });
  }
  return out;
}

function normalizeChangeMetrics(items, todayDay) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (let i = 0; i < items.length && out.length < 10; i += 1) {
    const raw = items[i];
    if (!isPlainObject(raw)) continue;
    const name = str(raw.name).trim().slice(0, 120);
    if (!name) continue;
    const obsRaw = Array.isArray(raw.observations) ? raw.observations : [];
    const observations = [];
    for (let k = 0; k < obsRaw.length && observations.length < 60; k += 1) {
      const o = obsRaw[k];
      if (!isPlainObject(o)) continue;
      const val = Number(o.value);
      if (!Number.isFinite(val)) continue;
      observations.push({
        id: str(o.id).trim() || `cobs-${i}-${k}`,
        date: calendarDayOrNull(o.date) || todayDay,
        value: Math.round(val * 100) / 100,
        phase: o.phase === 'post' ? 'post' : 'baseline',
        note: str(o.note).trim().slice(0, 300),
      });
    }
    out.push({
      id: str(raw.id).trim() || `cmet-${i}`,
      name,
      unit: str(raw.unit).trim().slice(0, 32),
      desirableDirection: raw.desirableDirection === 'higher' ? 'higher' : 'lower',
      observations,
    });
  }
  return out;
}

function normalizeChanges(raw, state, todayDay, now, warnings) {
  const personIds = new Set((state.people || []).map((p) => p.id));
  const goalIds = new Set((state.goals || []).map((g) => g.id));
  let clearedGoals = 0;

  const mapped = asArray({ changes: raw }, 'changes', warnings).map((ch, i) => {
    if (!isPlainObject(ch)) return null;
    const title = str(ch.title).trim().slice(0, 200);
    const kind = CHANGE_KINDS.includes(ch.kind) ? ch.kind : 'topology';
    if (ch.kind !== undefined && !CHANGE_KINDS.includes(ch.kind)) {
      warnings.push('Organizational changes: repaired an unrecognised change type to topology');
    }
    const status = CHANGE_STATUSES.includes(ch.status) ? ch.status : 'proposed';
    if (ch.status !== undefined && !CHANGE_STATUSES.includes(ch.status)) {
      warnings.push('Organizational changes: repaired an unrecognised change status to proposed');
    }

    let openedOn = calendarDayOrNull(ch.openedOn) || todayDay;
    if (openedOn > todayDay) {
      openedOn = todayDay;
      warnings.push('Organizational changes: clamped a future openedOn date to today');
    }
    const anchoredOn = status === 'anchored' ? (calendarDayOrNull(ch.anchoredOn) || todayDay) : null;

    let linkedGoalId = str(ch.linkedGoalId).trim() || null;
    if (linkedGoalId && !goalIds.has(linkedGoalId)) {
      linkedGoalId = null;
      clearedGoals += 1;
    }

    const rawTop = isPlainObject(ch.topology) ? ch.topology : {};
    const loadBeforeRaw = rawTop.cognitiveLoadBefore;
    const loadTargetRaw = rawTop.cognitiveLoadTarget;
    const handoffsBeforeRaw = rawTop.blockingHandoffsBefore;
    const handoffsTargetRaw = rawTop.blockingHandoffsTarget;
    const topology = {
      teamName: str(rawTop.teamName).trim().slice(0, 120),
      currentType: TEAM_TOPOLOGY_TYPES.includes(rawTop.currentType) ? rawTop.currentType : 'stream-aligned',
      targetType: TEAM_TOPOLOGY_TYPES.includes(rawTop.targetType) ? rawTop.targetType : 'stream-aligned',
      interactionMode: TOPOLOGY_INTERACTION_MODES.includes(rawTop.interactionMode)
        ? rawTop.interactionMode
        : 'x-as-a-service',
      cognitiveLoadBefore:
        loadBeforeRaw !== null && loadBeforeRaw !== undefined && loadBeforeRaw !== '' && Number.isFinite(Number(loadBeforeRaw))
          ? clampInt(loadBeforeRaw, 1, 5, 3)
          : null,
      cognitiveLoadTarget:
        loadTargetRaw !== null && loadTargetRaw !== undefined && loadTargetRaw !== '' && Number.isFinite(Number(loadTargetRaw))
          ? clampInt(loadTargetRaw, 1, 5, 2)
          : null,
      blockingHandoffsBefore:
        handoffsBeforeRaw !== null && handoffsBeforeRaw !== undefined && handoffsBeforeRaw !== '' && Number.isFinite(Number(handoffsBeforeRaw))
          ? clampInt(handoffsBeforeRaw, 0, 50, 0)
          : null,
      blockingHandoffsTarget:
        handoffsTargetRaw !== null && handoffsTargetRaw !== undefined && handoffsTargetRaw !== '' && Number.isFinite(Number(handoffsTargetRaw))
          ? clampInt(handoffsTargetRaw, 0, 50, 0)
          : null,
      collaboratingTeamsCount: clampInt(rawTop.collaboratingTeamsCount, 0, 20, 0),
    };

    const rawStar = isPlainObject(ch.star) ? ch.star : {};
    const star = {};
    for (const pillar of STAR_PILLARS) {
      star[pillar] = str(rawStar[pillar]).trim().slice(0, 600);
    }

    const effort = normalizePertTriple(
      ch.effortDays?.optimistic,
      ch.effortDays?.mostLikely,
      ch.effortDays?.pessimistic,
      'change effort-day',
      warnings,
    );

    const rawEcon = isPlainObject(ch.economics) ? ch.economics : {};
    const benefit = normalizePertTriple(
      rawEcon.monthlyBenefit?.optimistic,
      rawEcon.monthlyBenefit?.mostLikely,
      rawEcon.monthlyBenefit?.pessimistic,
      'change monthly benefit',
      warnings,
    );
    const economics = {
      currency: (str(rawEcon.currency, 'USD').trim().toUpperCase().slice(0, 6)) || 'USD',
      transitionCost: nonNegativeFinite(rawEcon.transitionCost, 0),
      monthlyBenefit: { optimistic: benefit.o, mostLikely: benefit.m, pessimistic: benefit.p },
      horizonMonths: clampInt(rawEcon.horizonMonths, 1, 60, 12),
    };

    const kotterStage = KOTTER_STEPS.includes(ch.kotterStage) ? ch.kotterStage : 'urgency';
    const completedSteps = [
      ...new Set(
        (Array.isArray(ch.completedSteps) ? ch.completedSteps : []).filter((s) => KOTTER_STEPS.includes(s)),
      ),
    ];

    const createdAt = isoOrNull(ch.createdAt) || now;
    const updatedAt = isoOrNull(ch.updatedAt) || createdAt;
    const defaultReversibility = ['topology', 'reporting-line'].includes(kind) ? 'irreversible' : 'reversible';

    return {
      id: str(ch.id).trim() || `chg-${i}`,
      title,
      kind,
      status,
      summary: str(ch.summary).trim().slice(0, 2000),
      vision: str(ch.vision).trim().slice(0, 2000),
      nonGoals: str(ch.nonGoals).trim().slice(0, 1200),
      reversibility: ch.reversibility === 'reversible' || ch.reversibility === 'irreversible'
        ? ch.reversibility
        : defaultReversibility,
      ownerId: str(ch.ownerId).trim() || null,
      linkedGoalId,
      openedOn,
      targetOn: calendarDayOrNull(ch.targetOn),
      reviewOn: calendarDayOrNull(ch.reviewOn),
      anchoredOn,
      closedReason: str(ch.closedReason).trim().slice(0, 1500),
      kotterStage,
      completedSteps,
      shortTermWins: normalizeChangeWins(ch.shortTermWins, todayDay),
      topology,
      forces: normalizeChangeForces(ch.forces),
      star,
      coalition: normalizeChangeCoalition(ch.coalition, personIds),
      impacts: normalizeChangeImpacts(ch.impacts, personIds),
      effortDays: { optimistic: effort.o, mostLikely: effort.m, pessimistic: effort.p },
      economics,
      metrics: normalizeChangeMetrics(ch.metrics, todayDay),
      autoCreateDecision: ch.autoCreateDecision !== false,
      createdAt,
      updatedAt,
    };
  });

  const valid = mapped.filter((ch) => ch && ch.title);
  if (valid.length !== mapped.length) {
    warnings.push(`Organizational changes: dropped ${mapped.length - valid.length} record(s) with a missing title`);
  }
  if (clearedGoals) {
    warnings.push(`Organizational changes: cleared ${clearedGoals} broken goal link(s)`);
  }
  return uniqueIds(valid, 'Organizational changes', warnings);
}

function entityIdSetsForLinks(state) {
  return {
    case: new Set((state.cases || []).map((r) => r.id)),
    decision: new Set((state.decisions || []).map((r) => r.id)),
    delegation: new Set((state.delegations || []).map((r) => r.id)),
    goal: new Set((state.goals || []).map((r) => r.id)),
    growth: new Set((state.growthPlans || []).map((r) => r.id)),
    person: new Set((state.people || []).map((r) => r.id)),
    oneonone: new Set((state.oneOnOnes || []).map((r) => r.id)),
    feedback: new Set((state.feedback || []).map((r) => r.id)),
    onboarding: new Set((state.onboarding || []).map((r) => r.id)),
    review: new Set((state.reviews || []).map((r) => r.id)),
    readiness: new Set((state.readiness || []).map((r) => r.id)),
    recognition: new Set((state.recognition || []).map((r) => r.id)),
    portfolio: new Set((state.portfolio || []).map((r) => r.id)),
    requisition: new Set((state.requisitions || []).map((r) => r.id)),
    candidate: new Set((state.candidates || []).map((r) => r.id)),
    change: new Set((state.changes || []).map((r) => r.id)),
  };
}

function normalizeLinks(raw, state, todayDay, now, warnings) {
  const idSets = entityIdSetsForLinks(state);
  let droppedForbidden = 0;
  let droppedInvalid = 0;
  const seenEdges = new Set();
  const valid = [];

  const list = asArray({ links: raw }, 'links', warnings);
  for (let i = 0; i < list.length; i += 1) {
    const l = list[i];
    if (!isPlainObject(l)) {
      droppedInvalid += 1;
      continue;
    }
    const sourceType = str(l.sourceType).trim();
    const targetType = str(l.targetType).trim();
    const sourceId = str(l.sourceId).trim();
    const targetId = str(l.targetId).trim();
    const relation = str(l.relation).trim();

    if (FORBIDDEN_LINK_TYPES.includes(sourceType) || FORBIDDEN_LINK_TYPES.includes(targetType)) {
      droppedForbidden += 1;
      continue;
    }
    if (
      !LINK_ENTITY_TYPES.includes(sourceType) ||
      !LINK_ENTITY_TYPES.includes(targetType) ||
      !LINK_RELATIONS.includes(relation) ||
      !sourceId ||
      !targetId ||
      (sourceType === targetType && sourceId === targetId) ||
      !idSets[sourceType]?.has(sourceId) ||
      !idSets[targetType]?.has(targetId)
    ) {
      droppedInvalid += 1;
      continue;
    }

    const edgeKey = `${sourceType}:${sourceId}|${relation}|${targetType}:${targetId}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    const createdAt = isoOrNull(l.createdAt) || now;
    valid.push({
      id: str(l.id).trim() || `lnk-${i}`,
      sourceType,
      sourceId,
      targetType,
      targetId,
      relation,
      ruleId: str(l.ruleId).trim().slice(0, 40),
      summary: str(l.summary).trim().slice(0, 300),
      createdOn: calendarDayOrNull(l.createdOn) || createdAt.slice(0, 10) || todayDay,
      createdAt,
    });
  }

  if (droppedForbidden) {
    warnings.push(`Cross-module links: dropped ${droppedForbidden} forbidden confidential or anonymous link(s)`);
  }
  if (droppedInvalid) {
    warnings.push(`Cross-module links: cleared ${droppedInvalid} broken or unrecognised link(s)`);
  }
  return uniqueIds(valid, 'Cross-module links', warnings);
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
    actions: normalizeActions(m.actions, { withOwner: true }),
    createdAt: isoOrNull(m.createdAt) || now,
  }));
  state.oneOnOnes = uniqueIds(oneOnOnes, '1:1s', warnings);
  dedupeActionIds(state.oneOnOnes, warnings);
  repairCarryChains(state.oneOnOnes, warnings);
  auditActionOwners(state.oneOnOnes, warnings);

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
      sourceReviewId: str(g.sourceReviewId) || null,
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
      sourceReviewId: str(p.sourceReviewId) || null,
      personId: str(p.personId),
      goal: str(p.goal).slice(0, 2000),
      reality: str(p.reality).slice(0, 2000),
      options: Array.isArray(p.options)
        ? p.options.filter(isPlainObject).map((o, k) => ({ id: str(o.id) || `opt-${k}`, text: str(o.text).slice(0, 400) })).filter((o) => o.text)
        : [],
      will: normalizeWillActions(p.will),
      competencies: Array.isArray(p.competencies)
        ? p.competencies.filter((c) => typeof c === 'string').slice(0, 12)
        : [],
      reviewOn: dayOrNull(p.reviewOn),
      reviews: normalizeGrowthReviews(p.reviews),
      // Deferrals count pushes of the review date since the last held review.
      // A hand-edited negative or absurd value is clamped, not trusted.
      reviewDeferrals: clampInt(p.reviewDeferrals, 0, 99, 0),
      reviewMovedOn: calendarDayOrNull(p.reviewMovedOn),
      status,
      closedOn: status === 'done' ? calendarDayOrNull(p.closedOn) : null,
      stagesUpdatedOn: calendarDayOrNull(p.stagesUpdatedOn),
      createdAt: isoOrNull(p.createdAt) || now,
    };
  });
  repairWillChains(growthPlans, warnings);
  state.growthPlans = uniqueIds(growthPlans.filter((p) => p.goal), 'Growth plans', warnings);
  auditWillDelegationLinks(state.growthPlans, state.delegations, warnings);

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

  let clearedUndecidedReviews = 0;
  const decisions = asArray(raw, 'decisions', warnings).map((d, i) => {
    const chosen = str(d.chosen).trim().slice(0, 300);
    const rawReviewedOn = dayOrNull(d.reviewedOn);
    const rawOutcome = DECISION_OUTCOMES.includes(d.outcome) ? d.outcome : 'pending';
    const rawOutcomeNotes = str(d.outcomeNotes).slice(0, 4000);
    const invalidUndecidedReview = !chosen && Boolean(rawReviewedOn || rawOutcome !== 'pending' || rawOutcomeNotes.trim());
    if (invalidUndecidedReview) clearedUndecidedReviews += 1;
    return {
      id: str(d.id) || `dec-${i}`,
      title: str(d.title).trim().slice(0, 200),
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
      chosen,
      rationale: str(d.rationale).slice(0, 4000),
      reviewOn: dayOrNull(d.reviewOn),
      reviewedOn: chosen ? rawReviewedOn : null,
      outcome: chosen ? rawOutcome : 'pending',
      outcomeNotes: chosen ? rawOutcomeNotes : '',
      // Schema v21: the probability recorded when the call was made ("P(this
      // works out well)"), clamped to 5–95 per Cromwell's rule. A forecast on
      // an undecided record is meaningless and is dropped, mirroring the
      // outcome-review clearing above. Unknown stays null — never 50%.
      forecastProbability: chosen ? normalizeForecastProbability(d.forecastProbability) : null,
      createdAt: isoOrNull(d.createdAt) || now,
    };
  });
  if (clearedUndecidedReviews) {
    warnings.push(`Decisions: cleared ${clearedUndecidedReviews} outcome review(s) on undecided decision(s)`);
  }
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
    notes: str(r.notes).slice(0, 1200),
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

  // Review-origin links are created only by an explicit completed-review
  // handoff. Keep valid links even if that review is later reopened for a
  // correction; clear only missing or cross-person references.
  const reviewById = new Map(state.reviews.map((review) => [review.id, review]));
  let repairedReviewLinks = 0;
  for (const record of [...state.goals, ...state.growthPlans]) {
    if (!record.sourceReviewId) continue;
    const source = reviewById.get(record.sourceReviewId);
    if (!source || source.personId !== (record.ownerId || record.personId)) {
      record.sourceReviewId = null;
      repairedReviewLinks += 1;
    }
  }
  if (repairedReviewLinks) warnings.push(`Review follow-through: cleared ${repairedReviewLinks} missing or cross-person source link(s)`);

  const todayDay = now.slice(0, 10);
  const onboarding = asArray(raw, 'onboarding', warnings).map((plan, i) => {
    const personId = str(plan.personId);
    const startDate = calendarDayOrNull(plan.startDate);
    let status = ONBOARDING_STATUSES.includes(plan.status) ? plan.status : 'active';
    // Pre-v10 plans could only be new-joiner onboarding. An unrecognised kind
    // therefore falls back to 'new-hire' with a warning rather than being
    // guessed into a role transition the file never claimed.
    const kind = ONBOARDING_KINDS.includes(plan.kind) ? plan.kind : 'new-hire';
    if (plan.kind !== undefined && !ONBOARDING_KINDS.includes(plan.kind)) {
      warnings.push('Onboarding: an unrecognised plan type was treated as new-joiner onboarding');
    }
    const label = str(plan.label).trim().slice(0, 160);
    if (kind === 'role-transition' && !label) {
      warnings.push('Onboarding: a role-transition plan does not name the new role or scope yet');
    }
    const createdAt = isoOrNull(plan.createdAt) || now;
    const updatedAt = isoOrNull(plan.updatedAt) || createdAt;
    const planId = str(plan.id) || `onb-${i}`;
    const reviewsObj = normalizeOnboardingReviews(plan.reviews, startDate, todayDay, warnings, planId);
    if (status === 'completed' && !reviewsObj[90]?.heldOn) {
      status = 'active';
      warnings.push('Onboarding: reopened a completed plan whose Day 90 check-in was missing or invalid');
    }
    let buddyId = str(plan.buddyId) || null;
    if (buddyId && buddyId === personId) {
      buddyId = null;
      warnings.push('Onboarding: cleared a self-assigned buddy reference');
    }
    return {
      id: planId,
      personId,
      kind,
      label,
      startDate,
      buddyId,
      buddyName: str(plan.buddyName).trim().slice(0, 120),
      roleClarity: str(plan.roleClarity).trim().slice(0, 2000),
      earlyWin: str(plan.earlyWin).trim().slice(0, 2000),
      stakeholders: normalizeOnboardingStakeholders(plan.stakeholders, warnings),
      checkpoints: normalizeOnboardingCheckpoints(plan.checkpoints, warnings),
      reviews: reviewsObj,
      status,
      completedOn: status === 'completed' ? calendarDayOrNull(plan.completedOn) : null,
      createdAt,
      updatedAt,
    };
  });
  const validOnboarding = onboarding.filter((p) => p.personId && p.startDate);
  if (validOnboarding.length !== onboarding.length) {
    warnings.push(`Onboarding: dropped ${onboarding.length - validOnboarding.length} record(s) with a missing person or invalid start date`);
  }
  state.onboarding = uniqueIds(validOnboarding, 'Onboarding', warnings);
  state.managerSupport = normalizeManagerSupport(raw.managerSupport, state.onboarding, state.people, now, warnings);
  state.cases = normalizeCases(raw.cases, state, todayDay, now, warnings);
  state.requisitions = normalizeRequisitions(raw.requisitions, state, todayDay, now, warnings);
  state.candidates = normalizeCandidates(raw.candidates, state, todayDay, now, warnings);
  state.changes = normalizeChanges(raw.changes, state, todayDay, now, warnings);
  // Portfolio must run AFTER cases, requisitions, and changes so sourceType
  // provenance (`case`, `requisition`, `change`) resolves against populated
  // collections rather than degrading valid reserves to `manual` on reload.
  state.portfolio = normalizePortfolio(raw.portfolio, state, todayDay, now, warnings);
  state.links = normalizeLinks(raw.links, state, todayDay, now, warnings);

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
    ['onboarding', (r) => r.personId],
    ['oneOnOnes', (r) => r.personId],
    ['feedback', (r) => r.personId],
    ['delegations', (r) => r.personId],
    ['growthPlans', (r) => r.personId],
    ['recognition', (r) => r.personId],
    ['readiness', (r) => r.personId],
    ['reviews', (r) => r.personId],
    ['cases', (r) => r.ownerId],
    ['changes', (r) => r.ownerId],
  ];
  for (const [key, getter] of orphanChecks) {
    const orphans = state[key].filter((r) => getter(r) && !personIds.has(getter(r))).length;
    if (orphans) warnings.push(`${key}: ${orphans} record(s) reference a person who is no longer in the roster`);
  }

  return { state, warnings };
}

/**
 * Migration table. Each entry takes the previous version's object and returns
 * the next one. Migrations add records, nullable context and provenance without
 * changing the storage key, so an existing workspace upgrades in place.
 * Unknown historical dates, snapshots, authorship and source links stay null,
 * never inferred from titles or other text.
 */
export const MIGRATIONS = {
  20: (v20) => ({
    ...v20,
    schemaVersion: 21,
    // v21 adds forecast calibration: decisions gain an optional recorded
    // `forecastProbability` and plan items gain `actualEffortDays`,
    // `actualValue` and a funding-time `forecastSnapshot`. All are additive
    // and normalised to null for pre-existing records — no historical
    // forecast or actual is invented, because scoring a number nobody
    // recorded at the time would corrupt the calibration record.
  }),
  19: (v19) => ({
    ...v19,
    schemaVersion: 20,
    settings: isPlainObject(v19.settings)
      ? {
          ...v19.settings,
          simulationSeed: v19.settings.simulationSeed ?? 42,
          simulationTrials: v19.settings.simulationTrials ?? 1000,
        }
      : { ...DEFAULT_SETTINGS },
    // v20 adds deterministic seeded Monte Carlo simulation settings across
    // Capacity & Organizational Change J-Curves, plus pre-export retention &
    // contextual-integrity governance. No synthetic records are invented.
  }),
  18: (v18) => ({
    ...v18,
    schemaVersion: 19,
    settings: isPlainObject(v18.settings)
      ? { ...v18.settings, changeReviewDays: v18.settings.changeReviewDays ?? 21 }
      : { ...DEFAULT_SETTINGS },
    // v19 adds Organizational Design, Team Topologies & Change Execution.
    // Existing role transitions, cases, and decisions are NOT converted into
    // invented change records; the collection starts empty until recorded.
    changes: Array.isArray(v18.changes) ? v18.changes : [],
  }),
  17: (v17) => ({
    ...v17,
    schemaVersion: 18,
    settings: isPlainObject(v17.settings)
      ? { ...v17.settings, candidateRetentionDays: v17.settings.candidateRetentionDays ?? 180 }
      : { ...DEFAULT_SETTINGS },
    // v18 adds a data-minimisation *reminder* for candidate records. It does
    // not delete anything and does not add a field to existing candidates: a
    // retention clock has to start from a date that was actually recorded, and
    // the reviewer reads that from `decidedOn` / `updatedOn` at review time.
  }),
  16: (v16) => ({
    ...v16,
    schemaVersion: 17,
    settings: isPlainObject(v16.settings)
      ? {
          ...v16.settings,
          hiringBaseRate: v16.settings.hiringBaseRate ?? 0.45,
          hiringStallDays: v16.settings.hiringStallDays ?? 30,
          interviewHoursPerStage: v16.settings.interviewHoursPerStage ?? 3,
        }
      : { hiringBaseRate: 0.45, hiringStallDays: 30, interviewHoursPerStage: 3 },
    // v17 adds selection and hiring. Existing people, cases and portfolio items
    // are NOT converted into requisitions or candidates: a role the leader never
    // opened would be invented data, and so would evidence nobody recorded.
    requisitions: Array.isArray(v16.requisitions) ? v16.requisitions : [],
    candidates: Array.isArray(v16.candidates) ? v16.candidates : [],
  }),
  15: (v15) => ({
    ...v15,
    schemaVersion: 16,
    settings: isPlainObject(v15.settings)
      ? {
          ...v15.settings,
          capacityHoursPerWeek: v15.settings.capacityHoursPerWeek ?? 32,
          planningHorizonWeeks: v15.settings.planningHorizonWeeks ?? 4,
          operationalLoadPct: v15.settings.operationalLoadPct ?? 20,
          wipLimitPerPerson: v15.settings.wipLimitPerPerson ?? 2,
        }
      : { capacityHoursPerWeek: 32, planningHorizonWeeks: 4, operationalLoadPct: 20, wipLimitPerPerson: 2 },
    // v16 adds the operating-plan portfolio ledger. Existing goals, cases and
    // delegations are NOT auto-converted into portfolio items: an effort or
    // value estimate the leader never gave would be invented data. Open cases
    // with recorded capacity days still count as implicit capacity reserves.
    portfolio: Array.isArray(v15.portfolio) ? v15.portfolio : [],
  }),
  14: (v14) => ({
    ...v14,
    schemaVersion: 15,
    settings: isPlainObject(v14.settings)
      ? { ...v14.settings, caseReviewDays: v14.settings.caseReviewDays ?? 14 }
      : { caseReviewDays: 14 },
    // v15 adds cross-domain Operational Cases and typed Cross-Module Links.
    // Existing records are never guessed into fabricated cases or links.
    cases: Array.isArray(v14.cases) ? v14.cases : [],
    links: Array.isArray(v14.links) ? v14.links : [],
  }),
  13: (v13) => ({
    ...v13,
    schemaVersion: 14,
    // v14 introduces a separate manager-owned support ledger. Existing
    // 1:1 actions and check-ins are not transformed or inferred into it.
    managerSupport: Array.isArray(v13.managerSupport) ? v13.managerSupport : [],
  }),
  12: (v12) => ({
    ...v12,
    schemaVersion: 13,
    goals: Array.isArray(v12.goals)
      ? v12.goals.map((goal) => (isPlainObject(goal)
          ? { ...goal, sourceReviewId: typeof goal.sourceReviewId === 'string' && goal.sourceReviewId.trim() ? goal.sourceReviewId.trim() : null }
          : goal))
      : v12.goals,
    growthPlans: Array.isArray(v12.growthPlans)
      ? v12.growthPlans.map((plan) => (isPlainObject(plan)
          ? { ...plan, sourceReviewId: typeof plan.sourceReviewId === 'string' && plan.sourceReviewId.trim() ? plan.sourceReviewId.trim() : null }
          : plan))
      : v12.growthPlans,
  }),
  11: (v11) => ({
    ...v11,
    schemaVersion: 12,
    growthPlans: Array.isArray(v11.growthPlans)
      ? v11.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        // v12 adds explicit GROW commitment → delegation links.
                        // Earlier workspaces never stored this relationship, so
                        // `null` is preserved honestly rather than guessed from
                        // title text.
                        delegationId: typeof w.delegationId === 'string' && w.delegationId.trim()
                          ? w.delegationId.trim()
                          : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v11.growthPlans,
  }),
  10: (v10) => ({
    ...v10,
    schemaVersion: 11,
    onboarding: Array.isArray(v10.onboarding)
      ? v10.onboarding.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              // v11 adds 'reboarding' (return-to-work after extended leave)
              // without storing leave reasons or medical detail. Existing
              // 'new-hire' and 'role-transition' plans stay intact; any unknown
              // kind defaults honestly to 'new-hire'.
              kind: ONBOARDING_KINDS.includes(plan.kind) ? plan.kind : 'new-hire',
              label: typeof plan.label === 'string' ? plan.label : '',
            }
          : plan))
      : v10.onboarding,
    readiness: Array.isArray(v10.readiness)
      ? v10.readiness.map((rec) => (isPlainObject(rec)
          ? {
              ...rec,
              notes: typeof rec.notes === 'string' ? rec.notes : '',
            }
          : rec))
      : v10.readiness,
  }),
  9: (v9) => ({
    ...v9,
    schemaVersion: 10,
    onboarding: Array.isArray(v9.onboarding)
      ? v9.onboarding.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              // v9 knew only one kind of 30-60-90 plan — new-joiner
              // onboarding — so every pre-v10 plan is honestly a 'new-hire'
              // plan with no transition label. A file already relabelled v10
              // keeps a valid kind/label instead of losing them.
              kind: ['new-hire', 'role-transition'].includes(plan.kind) ? plan.kind : 'new-hire',
              label: typeof plan.label === 'string' ? plan.label : '',
            }
          : plan))
      : v9.onboarding,
  }),
  8: (v8) => ({
    ...v8,
    schemaVersion: 9,
    growthPlans: Array.isArray(v8.growthPlans)
      ? v8.growthPlans.map((plan) => (isPlainObject(plan)
          ? {
              ...plan,
              reviews: Array.isArray(plan.reviews) ? plan.reviews : [],
              reviewDeferrals: typeof plan.reviewDeferrals === 'number' ? plan.reviewDeferrals : 0,
              reviewMovedOn: typeof plan.reviewMovedOn === 'string' ? plan.reviewMovedOn : null,
              will: Array.isArray(plan.will)
                ? plan.will.map((w) => (isPlainObject(w)
                    ? {
                        ...w,
                        // v8 could only say done or not-done, and it never asked
                        // whether a commitment had been moved or abandoned, so
                        // those stay empty rather than being invented.
                        addedOn: typeof w.addedOn === 'string' ? w.addedOn : null,
                        dropped: w.dropped === true,
                        droppedOn: typeof w.droppedOn === 'string' ? w.droppedOn : null,
                        droppedReason: typeof w.droppedReason === 'string' ? w.droppedReason : '',
                        droppedInReviewId: typeof w.droppedInReviewId === 'string' ? w.droppedInReviewId : null,
                        completedInReviewId: typeof w.completedInReviewId === 'string' ? w.completedInReviewId : null,
                        carriedFromId: typeof w.carriedFromId === 'string' ? w.carriedFromId : null,
                        carriedToId: typeof w.carriedToId === 'string' ? w.carriedToId : null,
                        carriedInReviewId: typeof w.carriedInReviewId === 'string' ? w.carriedInReviewId : null,
                      }
                    : w))
                : plan.will,
            }
          : plan))
      : v8.growthPlans,
  }),
  7: (v7) => ({
    ...v7,
    schemaVersion: 8,
    oneOnOnes: Array.isArray(v7.oneOnOnes)
      ? v7.oneOnOnes.map((meeting) => (isPlainObject(meeting)
          ? {
              ...meeting,
              actions: Array.isArray(meeting.actions)
                ? meeting.actions.map((action) => (isPlainObject(action)
                    ? {
                        ...action,
                        // v7 never asked who owed a promise, so `null` is the
                        // honest value. A file already relabelled v8 keeps a
                        // valid owner rather than losing it.
                        owner: ACTION_OWNERS.includes(action.owner) ? action.owner : null,
                      }
                    : action))
                : meeting.actions,
            }
          : meeting))
      : v7.oneOnOnes,
  }),
  6: (v6) => ({
    ...v6,
    schemaVersion: 7,
    oneOnOnes: Array.isArray(v6.oneOnOnes)
      ? v6.oneOnOnes.map((meeting) => (isPlainObject(meeting)
          ? {
              ...meeting,
              actions: Array.isArray(meeting.actions)
                ? meeting.actions.map((action) => (isPlainObject(action)
                    ? {
                        ...action,
                        completedInMeetingId: action.done === true && typeof action.completedInMeetingId === 'string'
                          ? action.completedInMeetingId
                          : null,
                        // v6 could not express these, so there is nothing to
                        // invent — but a relabelled v7 file keeps what it has.
                        carriedFrom: isPlainObject(action.carriedFrom) ? action.carriedFrom : null,
                        carriedToMeetingId: typeof action.carriedToMeetingId === 'string' ? action.carriedToMeetingId : null,
                        carriedToActionId: typeof action.carriedToActionId === 'string' ? action.carriedToActionId : null,
                        dropped: action.dropped === true,
                        droppedOn: typeof action.droppedOn === 'string' ? action.droppedOn : null,
                        droppedReason: typeof action.droppedReason === 'string' ? action.droppedReason : '',
                        droppedInMeetingId: typeof action.droppedInMeetingId === 'string' ? action.droppedInMeetingId : null,
                      }
                    : action))
                : meeting.actions,
            }
          : meeting))
      : v6.oneOnOnes,
  }),
  5: (v5) => ({
    ...v5,
    schemaVersion: 6,
    onboarding: Array.isArray(v5.onboarding) ? v5.onboarding : [],
  }),
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
