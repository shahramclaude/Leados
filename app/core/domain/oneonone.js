/**
 * app/core/domain/oneonone.js — cadence health and agenda generation.
 *
 * The cadence model is deliberately simple and explainable: a person's 1:1 is
 * "due" once `cadenceDays` have passed since the last *held* meeting, and
 * "overdue" at 1.5× that. Skipped and moved meetings still count as history —
 * a pattern of reschedules is a signal, not an absence of data.
 */

import { addDays, daysSince, isOverdue, latestByDate, round } from '../time.js';

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

  const activeGoals = state.goals.filter((g) => g.ownerId === personId && g.status === 'active');
  const risky = activeGoals.filter((g) => g.confidence !== 'on-track');
  for (const goal of risky.slice(0, 2)) {
    push(`Unblock "${goal.title}" — currently ${goal.confidence.replace('-', ' ')}.`, 'goal', 'A goal this person owns is not on track.');
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

  const lastRecognition = latestByDate(state.recognition.filter((r) => r.personId === personId));
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

/** The suggested next meeting date for a person. */
export function nextMeetingDate(state, personId, now, settings) {
  const last = lastHeld(state, personId);
  const cadenceDays = settings?.oneOnOneCadenceDays ?? 7;
  if (!last) return addDays(now, 0);
  return addDays(last.date, cadenceDays);
}
