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

export const SCHEMA_VERSION = 11;
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
  'onboarding',
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
        carriedFromId: str(a.carriedFromId) || null,
        carriedToId: done || dropped ? null : str(a.carriedToId) || null,
        carriedInReviewId: str(a.carriedInReviewId) || null,
      };
    })
    .filter((a) => a.text);
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

function normalizeOnboardingReviews(raw, startDate, todayDay, warnings) {
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
      heldOn,
      summary,
      blockers,
    };
  }
  return out;
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
    const reviewsObj = normalizeOnboardingReviews(plan.reviews, startDate, todayDay, warnings);
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
      id: str(plan.id) || `onb-${i}`,
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
  ];
  for (const [key, getter] of orphanChecks) {
    const orphans = state[key].filter((r) => getter(r) && !personIds.has(getter(r))).length;
    if (orphans) warnings.push(`${key}: ${orphans} record(s) reference a person who is no longer in the roster`);
  }

  return { state, warnings };
}

/**
 * Migration table. Each entry takes the previous version's object and returns
 * the next one. Versions 2–10 add records and nullable context without
 * changing the storage key, so an existing workspace upgrades in place.
 * Unknown historical dates, snapshots, goal authorship and follow-through
 * links stay null, never false/zero.
 */
export const MIGRATIONS = {
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
