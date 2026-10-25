/**
 * app/core/domain/prep.js — one-meeting preparation for a 1:1.
 *
 * A 1:1 fails most often before it starts: the manager walks in remembering the
 * last two topics and forgets the promise made three meetings ago, the blocked
 * delegation, the feedback that was never closed. This module assembles everything
 * a single meeting genuinely needs into one plain, printable structure:
 *
 *   - the agenda the record already suggests (each item keeps its reason),
 *   - the topics the person has asked to raise (theirs, not the leader's),
 *   - every open commitment, grouped by where it came from, so nothing is
 *     silently dropped between systems,
 *   - what happened since you last spoke, so the conversation starts from fact.
 *
 * It is deliberately read-only and pure: no store writes, no DOM. The privacy
 * rule it enforces is negative — it never reads `state.conflicts` (confidential
 * working records) and never reads individual pulse rows (anonymous by design),
 * so a sheet that gets printed or handed over cannot carry either.
 */

import { daysSince, isOverdue, latestByDate } from '../time.js';
import { normalizeTalkingPoints } from '../schema.js';
import { cadence, suggestAgenda, openActions, lastHeld, nextMeetingDate } from './oneonone.js';
import { activePlan } from './growth.js';
import { delegationHealth } from './delegations.js';
import { goalsFor, goalProgress } from './goals.js';
import { activeOnboarding, onboardingHealth } from './onboarding.js';

/** Delegation states that mean a checkpoint is owed before the meeting ends. */
const DELEGATION_FLAG_STATUSES = ['blocked', 'overdue', 'unscheduled', 'checkin-due'];

const CONFIDENCE_LABELS = { 'on-track': 'On track', 'at-risk': 'At risk', 'off-track': 'Off track' };

/** Topics the person raised, as a list of single-line entries. */
export function normalizeTopics(value) {
  return normalizeTalkingPoints(value).map((text) => ({ text }));
}

/** Constructive feedback given to this person whose loop is not yet closed. */
function feedbackFollowUps(state, personId, now) {
  const open = state.feedback
    .filter((f) => f.personId === personId && f.direction === 'given' && f.kind === 'constructive' && !f.followUpDone)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 4);
  return open.map((f) => {
    const situation = (f.situation || '').trim();
    const due = f.followUpOn || null;
    return {
      text: situation ? `Close the loop on: ${situation}` : 'Close the loop on recent constructive feedback',
      due,
      overdue: Boolean(due && isOverdue(due, now)),
      source: 'feedback follow-up',
    };
  });
}

/** Open development actions from the person's active GROW plan. */
function developmentActions(state, personId, now) {
  const plan = activePlan(state, personId);
  if (!plan) return [];
  return (plan.will || [])
    .filter((action) => !action.done)
    .slice(0, 4)
    .map((action) => ({
      text: action.text,
      due: action.due || null,
      overdue: Boolean(action.due && isOverdue(action.due, now)),
      source: 'development action',
    }));
}

/** Active delegations whose checkpoint is due, blocked or unscheduled. */
function delegationCheckpoints(state, personId, now, settings) {
  return (state.delegations || [])
    .filter((delegation) => delegation.personId === personId && delegation.status === 'active')
    .map((delegation) => ({ ...delegation, health: delegationHealth(delegation, now, settings) }))
    .filter(({ health }) => DELEGATION_FLAG_STATUSES.includes(health.status))
    .slice(0, 4)
    .map(({ title, health, dueOn }) => ({
      text: title,
      detail: health.label,
      due: dueOn || null,
      overdue: Boolean(dueOn && isOverdue(dueOn, now)),
      source: 'delegation checkpoint',
    }));
}

/** Active goals this person owns that are not on track. */
function goalsAtRisk(state, personId) {
  return goalsFor(state, personId)
    .filter((goal) => goal.status === 'active' && goal.confidence !== 'on-track')
    .slice(0, 4)
    .map((goal) => ({ title: goal.title, confidence: goal.confidence, progressPct: goalProgress(goal) }));
}

/** Due or overdue onboarding checkpoints and phase check-ins for an active plan. */
function onboardingCommitments(state, personId, now, settings) {
  const plan = activeOnboarding(state, personId);
  if (!plan) return [];
  const health = onboardingHealth(plan, state, now, settings);
  const items = [];
  for (const rev of health.overdueReviews) {
    items.push({
      text: `Hold Day ${rev.horizon} onboarding check-in`,
      detail: 'Phase check-in overdue',
      due: rev.dueOn,
      overdue: true,
      source: 'onboarding',
    });
  }
  for (const rev of health.dueSoonReviews) {
    items.push({
      text: `Hold Day ${rev.horizon} onboarding check-in`,
      detail: 'Due within 7 days',
      due: rev.dueOn,
      overdue: false,
      source: 'onboarding',
    });
  }
  for (const cp of health.checkpointStats.items.filter((c) => !c.done)) {
    if (cp.overdue || cp.dueSoon || cp.horizon <= health.currentHorizon) {
      items.push({
        text: cp.title,
        detail: `Day ${cp.horizon}`,
        due: cp.due || null,
        overdue: Boolean(cp.overdue),
        source: 'onboarding',
      });
    }
  }
  return items.slice(0, 6);
}

/**
 * Assemble the preparation sheet for one person.
 *
 * @param {object} state  the workspace
 * @param {string} personId
 * @param {Date}   now
 * @param {object} settings
 * @returns {object|{missing:true}} structured, printable sheet data
 */
export function buildPrepSheet(state, personId, now, settings) {
  const person = (state.people || []).find((p) => p.id === personId);
  if (!person) return { missing: true };

  const theirTopics = normalizeTopics(person.talkingPoints);
  const agenda = suggestAgenda(state, personId, now, settings);
  const cad = cadence(state, personId, now, settings);

  const commitments = {
    actions: openActions(state, { personId, now }).map((action) => ({
      text: action.text,
      due: action.due || null,
      overdue: Boolean(action.overdue),
      source: '1:1 action',
    })),
    onboarding: onboardingCommitments(state, personId, now, settings),
    feedback: feedbackFollowUps(state, personId, now),
    development: developmentActions(state, personId, now),
    delegations: delegationCheckpoints(state, personId, now, settings),
  };
  for (const group of Object.values(commitments)) {
    group.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.due && b.due) return a.due < b.due ? -1 : 1;
      return 0;
    });
  }

  const last = lastHeld(state, personId);
  const recognition = latestByDate(state.recognition.filter((r) => r.personId === personId));

  const commitmentCount =
    commitments.actions.length +
    commitments.onboarding.length +
    commitments.feedback.length +
    commitments.development.length +
    commitments.delegations.length;

  return {
    missing: false,
    person: {
      id: person.id,
      name: person.name,
      role: person.role,
      team: person.team,
      level: person.level,
      focus: person.focus,
    },
    generatedAt: now.toISOString(),
    nextMeetingOn: nextMeetingDate(state, personId, now, settings),
    cadence: {
      status: cad.status,
      lastHeldDate: cad.lastHeldDate,
      daysSinceHeld: cad.daysSinceHeld,
      overdueDays: cad.overdueDays,
      expectedDays: cad.expectedDays,
      skippedStreak: cad.skippedStreak,
    },
    theirTopics,
    agenda,
    commitments,
    goalsAtRisk: goalsAtRisk(state, personId),
    sinceLast: {
      lastHeldDate: last ? last.date : null,
      notes: last ? (last.notes || '') : '',
      mood: last && typeof last.mood === 'number' ? last.mood : null,
      openActions: last ? (last.actions || []).filter((a) => !a.done).map((a) => a.text) : [],
      recognition: recognition ? { date: recognition.date, what: recognition.what } : null,
      daysSinceHeld: last ? daysSince(last.date, now) : null,
    },
    commitmentCount,
    confidenceLabels: CONFIDENCE_LABELS,
    excluded: ['Confidential conflict working records', 'Anonymous pulse responses'],
  };
}

export { CONFIDENCE_LABELS };
