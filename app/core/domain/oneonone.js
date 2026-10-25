/**
 * app/core/domain/oneonone.js — cadence health and agenda generation.
 *
 * The cadence model is deliberately simple and explainable: a person's 1:1 is
 * "due" once `cadenceDays` have passed since the last *held* meeting, and
 * "overdue" at 1.5× that. Skipped and moved meetings still count as history —
 * a pattern of reschedules is a signal, not an absence of data.
 */

import { addDays, daysSince, isOverdue, latestByDate, round } from '../time.js';
import { delegationHealth } from './delegations.js';

export const STATUS_LABELS = { held: 'Held', skipped: 'Skipped', moved: 'Moved' };

export function meetingsFor(state, personId) {
  return state.oneOnOnes.filter((m) => m.personId === personId);
}

export function meetingsNewestFirst(state, personId) {
  return meetingsFor(state, personId).sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function lastHeld(state, personId) {
  return latestByDate(meetingsFor(state, personId).filter((m) => m.status === 'held'));
}

export function lastOutcome(state, personId) {
  return latestByDate(meetingsFor(state, personId));
}

/**
 * @returns {{
 *   expectedDays:number, lastHeldDate:string|null, daysSinceHeld:number|null,
 *   dueInDays:number|null, overdueDays:number, isOverdue:boolean,
 *   heldLast4:number, scheduledLast4:number, adherence:number|null,
 *   skippedStreak:number, status:'never'|'ok'|'due'|'overdue'
 * }}
 */
export function cadence(state, personId, now, settings) {
  const expectedDays = settings?.oneOnOneCadenceDays ?? 7;
  const all = meetingsNewestFirst(state, personId);
  const held = all.filter((m) => m.status === 'held');
  const recent = all.slice(0, 4);
  const heldLast4 = recent.filter((m) => m.status === 'held').length;
  const adherence = recent.length ? heldLast4 / recent.length : null;

  let skippedStreak = 0;
  for (const m of all) {
    if (m.status === 'held') break;
    skippedStreak += 1;
  }

  const last = held[0] || null;
  const daysSinceHeld = last ? daysSince(last.date, now) : null;
  if (daysSinceHeld === null) {
    return {
      expectedDays,
      lastHeldDate: null,
      daysSinceHeld: null,
      dueInDays: null,
      overdueDays: 0,
      isOverdue: false,
      heldLast4,
      scheduledLast4: recent.length,
      adherence,
      skippedStreak,
      status: 'never',
    };
  }

  const dueInDays = expectedDays - daysSinceHeld;
  const overdue = daysSinceHeld > expectedDays * 1.5;
  return {
    expectedDays,
    lastHeldDate: last.date,
    daysSinceHeld,
    dueInDays,
    overdueDays: Math.max(0, daysSinceHeld - expectedDays),
    isOverdue: overdue,
    heldLast4,
    scheduledLast4: recent.length,
    adherence,
    skippedStreak,
    status: overdue ? 'overdue' : dueInDays <= 0 ? 'due' : 'ok',
  };
}

/** People whose next 1:1 is due or overdue, most urgent first. */
export function dueMeetings(state, now, settings) {
  return state.people
    .filter((p) => p.status !== 'archived')
    .map((person) => ({ person, cadence: cadence(state, person.id, now, settings) }))
    .filter((row) => row.cadence.status === 'due' || row.cadence.status === 'overdue' || row.cadence.status === 'never')
    .sort((a, b) => {
      const rank = (s) => (s === 'overdue' ? 3 : s === 'never' ? 2 : 1);
      const diff = rank(b.cadence.status) - rank(a.cadence.status);
      if (diff) return diff;
      return (b.cadence.daysSinceHeld ?? 9999) - (a.cadence.daysSinceHeld ?? 9999);
    });
}

/** Open action items from any 1:1, optionally for one person, oldest first. */
export function openActions(state, { personId = null, now = new Date() } = {}) {
  const rows = [];
  for (const meeting of state.oneOnOnes) {
    if (personId && meeting.personId !== personId) continue;
    for (const action of meeting.actions || []) {
      if (action.done) continue;
      rows.push({
        ...action,
        personId: meeting.personId,
        meetingId: meeting.id,
        meetingDate: meeting.date,
        overdue: action.due ? isOverdue(action.due, now) : false,
        daysUntilDue: action.due ? -daysSince(action.due, now) : null,
      });
    }
  }
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due && b.due) return a.due < b.due ? -1 : 1;
    return 0;
  });
}

/**
 * Build a starting agenda for the next 1:1 with a person.
 *
 * Every suggestion carries the reason it was proposed, so the leader can
 * accept or discard it knowing why it appeared. Nothing is auto-committed.
 */
export function suggestAgenda(state, personId, now, settings) {
  const person = state.people.find((p) => p.id === personId);
  if (!person) return [];
  const suggestions = [];
  const push = (text, source, reason) => {
    if (!text) return;
    if (suggestions.some((s) => s.text.toLowerCase() === text.toLowerCase())) return;
    suggestions.push({ text, source, reason });
  };

  const cad = cadence(state, personId, now, settings);
  if (cad.skippedStreak >= 2) {
    push(
      `Acknowledge the last ${cad.skippedStreak} 1:1s were rescheduled — what did we miss?`,
      'cadence',
      'Repeatedly moved meetings hide the topics that never got airtime.',
    );
  }
  if (cad.status === 'never') {
    push('First 1:1: what do you want from me, and how do you like to work?', 'cadence', 'No meeting has ever been logged with this person.');
  }

  const overdueActions = openActions(state, { personId, now }).filter((a) => a.overdue);
  for (const action of overdueActions.slice(0, 2)) {
    push(`Follow up on "${action.text}" — it was due ${action.due}.`, 'action', 'An action item from a previous 1:1 is past its due date.');
  }

  // Reconciliation: check commitments from the most recent held meeting
  const recon = previousMeetingCommitments(state, personId, null, now);
  if (recon && recon.hasPending) {
    const uncompletedCount = recon.pending.length;
    const topPending = recon.pending[0];
    push(
      `Review prior 1:1 commitments (${uncompletedCount} open from ${topPending.meetingDate}): "${topPending.text}".`,
      'reconciliation',
      `Commitments made in the ${topPending.meetingDate} 1:1 need follow-through confirmation before new ones are added.`,
    );
  }

  const activeGoals = state.goals.filter((g) => g.ownerId === personId && g.status === 'active');
  const risky = activeGoals.filter((g) => g.confidence !== 'on-track');
  for (const goal of risky.slice(0, 2)) {
    push(`Unblock "${goal.title}" — currently ${goal.confidence.replace('-', ' ')}.`, 'goal', 'A goal this person owns is not on track.');
  }

  const delegated = (state.delegations || [])
    .filter((delegation) => delegation.personId === personId && delegation.status === 'active')
    .map((delegation) => ({ delegation, health: delegationHealth(delegation, now, settings) }))
    .filter(({ health }) => ['blocked', 'overdue', 'unscheduled', 'checkin-due'].includes(health.status));
  for (const { delegation, health } of delegated.slice(0, 2)) {
    push(
      `Review delegated outcome "${delegation.title}" — ${health.label.toLowerCase()}.`,
      'delegation',
      health.blocked
        ? 'The latest delegation check-in says the owner is blocked and needs support.'
        : health.overdue
          ? 'A delegated outcome is past its due date without a recorded result.'
          : 'The delegation checkpoint is due under the team convention.',
    );
  }

  const constructive = state.feedback
    .filter((f) => f.personId === personId && f.kind === 'constructive' && f.direction === 'given')
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (constructive && (daysSince(constructive.date, now) ?? 999) <= 30) {
    push(`Close the loop on the feedback about "${constructive.situation}".`, 'feedback', 'Constructive feedback given in the last month should be revisited for impact.');
  }

  const plan = state.growthPlans.find((p) => p.personId === personId && p.status === 'active');
  if (plan) {
    const openWill = (plan.will || []).filter((a) => !a.done);
    if (openWill.length) {
      push(`Growth plan: check progress on "${openWill[0].text}".`, 'growth', 'The development plan for this person has an open action.');
    }
    if (plan.reviewOn && isOverdue(plan.reviewOn, now)) {
      push('Review the growth plan — the review date has passed.', 'growth', 'A development plan review is overdue.');
    }
  } else {
    push('Is there a development conversation worth having? No growth plan exists yet.', 'growth', 'There is no active development plan for this person.');
  }

  const lastRecognition = latestByDate((state.recognition || []).filter((r) => r.personId === personId));
  const sinceRec = lastRecognition ? daysSince(lastRecognition.date, now) : null;
  if (sinceRec === null || sinceRec > (settings?.recognitionTargetDays ?? 21)) {
    push('What has gone well since we last spoke that deserves recognition?', 'recognition', 'No recent recognition is recorded for this person.');
  }

  const recentMood = meetingsFor(state, personId)
    .filter((m) => m.status === 'held' && typeof m.mood === 'number')
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (recentMood && recentMood.mood <= 2) {
    push('Last 1:1 mood was low — ask what has changed.', 'mood', 'The previous meeting was logged as a low-mood conversation.');
  }

  push('What is on your mind that I have not asked about?', 'default', 'An open question keeps the agenda from becoming purely administrative.');
  push('What is blocking you that I could remove this week?', 'default', 'A standing blocker question catches load issues early.');

  return suggestions.slice(0, 8);
}

/**
 * Grade a logged 1:1 for quality, not just attendance.
 * @returns {{ score:number, checks:{id:string,label:string,met:boolean}[], notes:string[] }}
 */
export function gradeMeeting(meeting) {
  const noteText = (meeting.notes || '').trim();
  const actions = meeting.actions || [];
  const agenda = meeting.agenda || [];
  const notes = [];
  const checks = [
    { id: 'notes', label: 'Notes recorded', met: noteText.length >= 20 },
    { id: 'actions', label: 'At least one next action', met: actions.length > 0 },
    { id: 'mood', label: 'Mood logged', met: typeof meeting.mood === 'number' },
    {
      id: 'agenda',
      label: 'Not purely ad-hoc',
      met: agenda.length === 0 || agenda.some((a) => a.done),
    },
  ];
  const score = round((checks.filter((c) => c.met).length / checks.length) * 100);
  if (noteText.length === 0) notes.push('No notes: a 1:1 with no record cannot be followed up on.');
  if (actions.length === 0) notes.push('No action: most useful 1:1s end with something explicit to do.');
  return { score, checks, notes };
}

/**
 * All action items from 1:1 meetings across the roster or for one person,
 * supporting status filtering (open, completed, dropped, or all).
 */
export function allActions(state, { personId = null, status = 'all', now = new Date() } = {}) {
  const rows = [];
  for (const meeting of state.oneOnOnes || []) {
    if (personId && meeting.personId !== personId) continue;
    for (const action of meeting.actions || []) {
      const actStatus = action.status || (action.done ? 'completed' : 'open');
      if (status !== 'all' && actStatus !== status) continue;
      const done = actStatus === 'completed';
      rows.push({
        ...action,
        status: actStatus,
        done,
        personId: meeting.personId,
        meetingId: meeting.id,
        meetingDate: meeting.date,
        overdue: action.due && actStatus === 'open' ? isOverdue(action.due, now) : false,
        daysUntilDue: action.due ? -daysSince(action.due, now) : null,
      });
    }
  }
  return rows.sort((a, b) => {
    // Open overdue first, then open, then completed/dropped by completion or meeting date
    if (a.status === 'open' && b.status !== 'open') return -1;
    if (a.status !== 'open' && b.status === 'open') return 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due && b.due) return a.due < b.due ? -1 : 1;
    return (b.meetingDate || '') < (a.meetingDate || '') ? -1 : 1;
  });
}

/**
 * Compute commitment follow-through and promise integrity statistics.
 *
 * Invariant: Non-fabrication — if no resolved commitments exist, rates are null,
 * never fabricated as 0% or 100%.
 *
 * @param {object} state
 * @param {string|null} personId - null computes team-wide stats
 * @param {Date} now
 * @returns {{
 *   total: number,
 *   open: number,
 *   completed: number,
 *   dropped: number,
 *   resolved: number,
 *   promiseIntegrityRate: number|null, // completed / resolved (0 - 100)
 *   onTimeCompletionRate: number|null,  // completed on or before due / completed with due date
 *   avgDaysToResolve: number|null,
 *   overdueCount: number
 * }}
 */
export function followThroughStats(state, personId = null, now = new Date()) {
  const actions = allActions(state, { personId, status: 'all', now });
  const total = actions.length;
  const open = actions.filter((a) => a.status === 'open');
  const completed = actions.filter((a) => a.status === 'completed');
  const dropped = actions.filter((a) => a.status === 'dropped');
  const resolved = completed.length + dropped.length;

  const promiseIntegrityRate = resolved > 0
    ? Math.round((completed.length / resolved) * 100)
    : null;

  const completedWithDue = completed.filter((a) => a.due && a.completedOn);
  const onTimeCompleted = completedWithDue.filter((a) => a.completedOn <= a.due);
  const onTimeCompletionRate = completedWithDue.length > 0
    ? Math.round((onTimeCompleted.length / completedWithDue.length) * 100)
    : null;

  // Days from meeting creation date to completed/dropped date
  const resolvedWithDates = actions
    .filter((a) => a.status !== 'open' && a.meetingDate && (a.completedOn || a.resolvedOn))
    .map((a) => {
      const finishDate = a.completedOn || a.resolvedOn;
      return daysSince(a.meetingDate, finishDate);
    })
    .filter((d) => typeof d === 'number' && !isNaN(d) && d >= 0);

  const avgDaysToResolve = resolvedWithDates.length > 0
    ? Math.round((resolvedWithDates.reduce((s, d) => s + d, 0) / resolvedWithDates.length) * 10) / 10
    : null;

  const overdueCount = open.filter((a) => a.overdue).length;

  return {
    total,
    open: open.length,
    completed: completed.length,
    dropped: dropped.length,
    resolved,
    promiseIntegrityRate,
    onTimeCompletionRate,
    avgDaysToResolve,
    overdueCount,
  };
}

/**
 * Reconcile commitments from the most recent held 1:1 with a person.
 *
 * If `referenceDate` is provided, looks only at meetings held strictly before
 * that date (useful when logging or reviewing a meeting on that date).
 *
 * @param {object} state
 * @param {string} personId
 * @param {string|null} referenceDate calendar day (YYYY-MM-DD)
 * @param {Date} now
 * @returns {{
 *   previousMeeting: { id: string, date: string, notes: string } | null,
 *   actions: Array<object>,
 *   total: number,
 *   pending: Array<object>,
 *   completed: Array<object>,
 *   allDone: boolean,
 *   hasPending: boolean
 * }}
 */
export function previousMeetingCommitments(state, personId, referenceDate = null, now = new Date()) {
  const held = meetingsFor(state, personId)
    .filter((m) => m.status === 'held' && (!referenceDate || m.date < referenceDate))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const previous = held[0] || null;
  if (!previous) {
    return { previousMeeting: null, actions: [], total: 0, pending: [], completed: [], allDone: true, hasPending: false };
  }
  const actions = (previous.actions || []).map((action) => ({
    id: action.id,
    text: action.text,
    due: action.due || null,
    done: Boolean(action.done),
    completedOn: action.completedOn || null,
    overdue: Boolean(action.due && !action.done && isOverdue(action.due, now)),
    daysUntilDue: action.due ? -daysSince(action.due, now) : null,
    meetingId: previous.id,
    meetingDate: previous.date,
    personId,
  }));
  const pending = actions.filter((a) => !a.done);
  const completed = actions.filter((a) => a.done);
  return {
    previousMeeting: { id: previous.id, date: previous.date, notes: previous.notes || '' },
    actions,
    total: actions.length,
    pending,
    completed,
    allDone: actions.length > 0 && pending.length === 0,
    hasPending: pending.length > 0,
  };
}

/** The suggested next meeting date for a person. */
export function nextMeetingDate(state, personId, now, settings) {
  const last = lastHeld(state, personId);
  const cadenceDays = settings?.oneOnOneCadenceDays ?? 7;
  if (!last) return addDays(now, 0);
  return addDays(last.date, cadenceDays);
}
