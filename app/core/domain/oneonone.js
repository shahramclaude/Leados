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
import { activeOnboarding, onboardingHealth } from './onboarding.js';
import { openWillActions } from './growth.js';
import { openCasesForPerson } from './cases.js';
import { openChangesForPerson } from './changes.js';

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

/* ------------------------------------------------- follow-through ledger */

/**
 * Who owes a commitment. The 1:1 has exactly two participants, so ownership is
 * a two-way question — and the leader's own half is the part teams notice and
 * managers forget (see RESEARCH §21). `null` means "not recorded"; it is shown
 * as a gap rather than assumed to be the report's job.
 */
export const OWNER_LABELS = {
  them: 'They own it',
  leader: 'You own it',
  shared: 'Shared',
};

export const OWNER_SHORT = {
  them: 'them',
  leader: 'you',
  shared: 'shared',
};

export function ownerLabel(owner) {
  return OWNER_LABELS[owner] || '';
}

/** Lower-case phrase for dense meta lines and ledger rows. */
export function ownerPhrase(owner) {
  if (owner === 'leader') return 'you owe it';
  if (owner === 'shared') return 'shared';
  if (owner === 'them') return 'they owe it';
  return 'no owner';
}

/** True when the leader carries any of the obligation (alone or jointly). */
export function isLeaderOwned(action) {
  return action?.owner === 'leader' || action?.owner === 'shared';
}

/**
 * An action is open until it is either done or explicitly carried into a later
 * 1:1. It is never silently duplicated: the carry sets a successor on this
 * action (`carriedTo*`) and a back-reference on the new one (`carriedFrom`), so
 * the whole history survives a reload, an export and an import.
 */
export function isOpenAction(action) {
  return !action?.done && !action?.dropped && !action?.carriedToMeetingId;
}

function actionLookup(state) {
  const index = new Map();
  for (const meeting of state.oneOnOnes || []) {
    for (const action of meeting.actions || []) index.set(`${meeting.id}|${action.id}`, { meeting, action });
  }
  return index;
}

/**
 * Walk a carried action backwards to its origin. Returns the predecessor hops,
 * newest first, so callers can count carries and recover the first date the
 * promise was made. Cycle-safe even if a corrupted blob reaches here.
 */
export function carryHistory(state, meetingId, action, lookup = null) {
  const index = lookup || actionLookup(state);
  const hops = [];
  const seen = new Set([`${meetingId}|${action.id}`]);
  let current = action;
  while (current?.carriedFrom) {
    const key = `${current.carriedFrom.meetingId}|${current.carriedFrom.actionId}`;
    if (seen.has(key)) break;
    const previous = index.get(key);
    if (!previous) break;
    seen.add(key);
    hops.push(previous);
    current = previous.action;
  }
  return hops;
}

/**
 * One pass over every action: how many times it was carried forward and the
 * date the promise was first made. Views, CSV and the signal engine all read
 * the same numbers instead of re-deriving them differently.
 */
export function followThroughIndex(state) {
  const lookup = actionLookup(state);
  const map = new Map();
  for (const meeting of state.oneOnOnes || []) {
    for (const action of meeting.actions || []) {
      const hops = carryHistory(state, meeting.id, action, lookup);
      map.set(`${meeting.id}|${action.id}`, {
        depth: hops.length,
        firstAgreedOn: hops.length ? hops[hops.length - 1].meeting.date : meeting.date,
      });
    }
  }
  return map;
}

/**
 * Open action items from any 1:1, optionally for one person. Late items come
 * first, then by due date, then by how often the promise has already been
 * carried — the most-often-deferred commitment should not hide at the bottom.
 */
export function openActions(state, { personId = null, now = new Date() } = {}) {
  const rows = [];
  const index = followThroughIndex(state);
  for (const meeting of state.oneOnOnes) {
    if (personId && meeting.personId !== personId) continue;
    for (const action of meeting.actions || []) {
      if (!isOpenAction(action)) continue;
      const info = index.get(`${meeting.id}|${action.id}`) || { depth: 0, firstAgreedOn: meeting.date };
      const carryCount = info.depth;
      const firstAgreedOn = info.firstAgreedOn;
      rows.push({
        ...action,
        sourceType: 'oneOnOne',
        personId: meeting.personId,
        meetingId: meeting.id,
        meetingDate: meeting.date,
        overdue: action.due ? isOverdue(action.due, now) : false,
        daysUntilDue: action.due ? -daysSince(action.due, now) : null,
        carryCount,
        carriedOn: action.carriedFrom ? meeting.date : null,
        firstAgreedOn,
        ageDays: daysSince(firstAgreedOn, now),
        owner: action.owner || null,
        ownerLabel: ownerLabel(action.owner),
      });
    }
  }
  const supportById = new Map((state.managerSupport || []).map((record) => [record.id, record]));
  const onboardingById = new Map((state.onboarding || []).map((plan) => [plan.id, plan]));
  for (const record of state.managerSupport || []) {
    if (personId && record.personId !== personId) continue;
    if (record.status !== 'open') continue;
    let depth = 0;
    let origin = record;
    const seen = new Set([record.id]);
    while (origin.carriedFromId && supportById.has(origin.carriedFromId) && !seen.has(origin.carriedFromId)) {
      origin = supportById.get(origin.carriedFromId);
      seen.add(origin.id);
      depth += 1;
    }
    const sourcePlan = onboardingById.get(record.sourcePlanId);
    const sourceLinkValid = sourcePlan?.personId === record.personId
      && sourcePlan.reviews?.[record.sourceHorizon]?.id === record.sourceCheckinId;
    rows.push({
      ...record,
      sourceType: 'managerSupport',
      sourceLinkValid,
      managerSupportId: record.id,
      meetingId: null,
      meetingDate: null,
      overdue: record.due ? isOverdue(record.due, now) : false,
      daysUntilDue: record.due ? -daysSince(record.due, now) : null,
      carryCount: depth,
      carriedOn: record.carriedFromId ? record.addedOn : null,
      firstAgreedOn: origin.addedOn,
      ageDays: daysSince(origin.addedOn, now),
      owner: 'leader',
      ownerLabel: ownerLabel('leader'),
    });
  }
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    return b.carryCount - a.carryCount;
  });
}

/**
 * The promises a 1:1 on `meetingDate` can legitimately reconcile for a person:
 * everything open that was agreed in an earlier (or same-day) meeting.
 *
 * A future-dated meeting is excluded: you cannot confirm that something
 * happened in a conversation that has not taken place yet.
 */
export function reconciliationCandidates(state, personId, meetingDate, now = new Date()) {
  const index = followThroughIndex(state);
  const rows = [];
  const onboardingById = new Map((state.onboarding || []).map((plan) => [plan.id, plan]));
  for (const meeting of state.oneOnOnes) {
    if (meeting.personId !== personId) continue;
    if (meetingDate && meeting.date > meetingDate) continue;
    for (const action of meeting.actions || []) {
      if (!isOpenAction(action)) continue;
      const info = index.get(`${meeting.id}|${action.id}`) || { depth: 0, firstAgreedOn: meeting.date };
      const carryCount = info.depth;
      const firstAgreedOn = info.firstAgreedOn;
      rows.push({
        sourceType: 'oneOnOne',
        meetingId: meeting.id,
        actionId: action.id,
        text: action.text,
        due: action.due,
        overdue: action.due ? isOverdue(action.due, now) : false,
        daysUntilDue: action.due ? -daysSince(action.due, now) : null,
        carryCount,
        agreedOn: meeting.date,
        firstAgreedOn,
        ageDays: daysSince(firstAgreedOn, now),
        owner: action.owner || null,
        ownerLabel: ownerLabel(action.owner),
      });
    }
  }
  for (const record of state.managerSupport || []) {
    if (record.personId !== personId || record.status !== 'open') continue;
    if (meetingDate && record.addedOn > meetingDate) continue;
    let origin = record;
    let carryCount = 0;
    const seen = new Set([record.id]);
    while (origin.carriedFromId && !seen.has(origin.carriedFromId)) {
      const prior = (state.managerSupport || []).find((candidate) => candidate.id === origin.carriedFromId);
      if (!prior) break;
      origin = prior;
      seen.add(origin.id);
      carryCount += 1;
    }
    const sourcePlan = onboardingById.get(record.sourcePlanId);
    const sourceLinkValid = sourcePlan?.personId === record.personId
      && sourcePlan.reviews?.[record.sourceHorizon]?.id === record.sourceCheckinId;
    rows.push({
      sourceType: 'managerSupport',
      sourceLinkValid,
      managerSupportId: record.id,
      text: record.text,
      due: record.due,
      overdue: record.due ? isOverdue(record.due, now) : false,
      daysUntilDue: record.due ? -daysSince(record.due, now) : null,
      carryCount,
      agreedOn: record.addedOn,
      firstAgreedOn: origin.addedOn,
      ageDays: daysSince(origin.addedOn, now),
      owner: 'leader',
      ownerLabel: ownerLabel('leader'),
      sourcePlanId: record.sourcePlanId,
      sourceCheckinId: record.sourceCheckinId,
      sourceHorizon: record.sourceHorizon,
      sourceHeldOn: record.sourceHeldOn,
    });
  }
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.carryCount !== b.carryCount) return b.carryCount - a.carryCount;
    if (a.firstAgreedOn !== b.firstAgreedOn) return a.firstAgreedOn < b.firstAgreedOn ? -1 : 1;
    return a.text < b.text ? -1 : 1;
  });
}

/**
 * What the leader still owes their team.
 *
 * Deliberately includes `shared`: a jointly owned promise is still the
 * leader's to move, and a team that watches the manager drop their half learns
 * that accountability flows one way (RESEARCH §21).
 *
 * Sorted the way a person would triage: late first, then soonest due, then the
 * promise that has been alive longest.
 */
export function leaderObligations(state, { now = new Date(), personId = null } = {}) {
  return openActions(state, { now, personId })
    .filter((action) => isLeaderOwned(action))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return a.firstAgreedOn < b.firstAgreedOn ? -1 : a.firstAgreedOn > b.firstAgreedOn ? 1 : 0;
    });
}

/** How open commitments split across owners. `unknown` is a gap, not a default. */
export function ownershipSummary(state, { now = new Date() } = {}) {
  const open = openActions(state, { now });
  const summary = { them: 0, leader: 0, shared: 0, unknown: 0, total: open.length, leaderOverdue: 0 };
  for (const action of open) {
    if (action.owner && action.owner in summary) summary[action.owner] += 1;
    else summary.unknown += 1;
    if (isLeaderOwned(action) && action.overdue) summary.leaderOverdue += 1;
  }
  return summary;
}

/** Who and what a single meeting closed or inherited. */
export function reconciledInMeeting(state, meetingId) {
  const meeting = (state.oneOnOnes || []).find((m) => m.id === meetingId);
  if (!meeting) return { closed: [], dropped: [], carriedIn: [], carriedOut: [] };
  const closed = [];
  const dropped = [];
  for (const other of state.oneOnOnes) {
    for (const action of other.actions || []) {
      const row = { ...action, personId: other.personId, meetingId: other.id, meetingDate: other.date };
      if (action.completedInMeetingId === meetingId) closed.push(row);
      if (action.droppedInMeetingId === meetingId) dropped.push(row);
    }
  }
  const managerSupport = state.managerSupport || [];
  for (const record of managerSupport) {
    const row = { ...record, sourceType: 'managerSupport', meetingId: meeting.id, meetingDate: meeting.date };
    if (record.completedInMeetingId === meetingId) closed.push(row);
    if (record.droppedInMeetingId === meetingId) dropped.push(row);
  }
  return {
    closed,
    dropped,
    carriedIn: [
      ...(meeting.actions || []).filter((a) => a.carriedFrom),
      ...managerSupport.filter((record) => record.carriedFromMeetingId === meetingId),
    ],
    carriedOut: [
      ...(meeting.actions || []).filter((a) => a.carriedToMeetingId),
      ...managerSupport.filter((record) => record.carriedInMeetingId === meetingId),
    ],
  };
}

/** Counts for the board. No ratio: a completion rate over manager-entered data is a grade in disguise. */
export function commitmentCounts(state, now = new Date()) {
  const open = openActions(state, { now });
  const all = (state.oneOnOnes || []).flatMap((m) => m.actions || []);
  return {
    open: open.length,
    overdue: open.filter((a) => a.overdue).length,
    carriedOpen: open.filter((a) => a.carryCount > 0).length,
    leaderOwned: open.filter((a) => isLeaderOwned(a)).length,
    leaderOverdue: open.filter((a) => isLeaderOwned(a) && a.overdue).length,
    unattributed: open.filter((a) => !a.owner).length,
    maxCarry: open.reduce((max, a) => Math.max(max, a.carryCount), 0),
    firstAgreedOn: open.length ? open.reduce((oldest, a) => (a.firstAgreedOn < oldest ? a.firstAgreedOn : oldest), open[0].firstAgreedOn) : null,
    done: all.filter((a) => a.done).length,
    closedInMeeting: all.filter((a) => a.done && a.completedInMeetingId).length,
    carriedForward: all.filter((a) => !a.done && !a.dropped && a.carriedToMeetingId).length,
    dropped: all.filter((a) => a.dropped).length,
  };
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

  const openForPerson = openActions(state, { personId, now });
  // A promise that has moved between several meetings is not "in progress" —
  // it is stuck. Ask what the actual obstacle is and force a decision.
  for (const action of openForPerson.filter((a) => a.carryCount >= 2).slice(0, 2)) {
    push(
      `Decide what happens to "${action.text}" — carried forward ${action.carryCount} times since ${action.firstAgreedOn}.`,
      'followthrough',
      'A commitment that keeps moving between 1:1s is stuck, not busy: name the block, re-scope it, or drop it explicitly.',
    );
  }
  const overdueActions = openForPerson.filter((a) => a.overdue && a.carryCount < 2);
  for (const action of overdueActions.slice(0, 2)) {
    const managerSupport = action.sourceType === 'managerSupport';
    push(
      `Follow up on "${action.text}" — it was due ${action.due}.`,
      managerSupport ? 'manager-support' : 'action',
      managerSupport
        ? 'A manager-owned support commitment is past due; decide the next step in conversation.'
        : 'An action item from a previous 1:1 is past its due date.',
    );
  }

  const onbPlan = activeOnboarding(state, personId);
  if (onbPlan) {
    const onbHealth = onboardingHealth(onbPlan, state, now, settings);
    const planNoun = onbHealth.isTransition
      ? 'transition'
      : onbHealth.isReboarding
        ? 're-boarding'
        : 'onboarding';
    const planLabel = onbHealth.isTransition
      ? 'Role transition'
      : onbHealth.isReboarding
        ? 'Return to work'
        : 'Onboarding';
    for (const rev of [...onbHealth.overdueReviews, ...onbHealth.dueSoonReviews].slice(0, 1)) {
      push(
        `Run the Day ${rev.horizon} ${planNoun} check-in — what is clear, what is surprising, and what is blocking you?`,
        'onboarding',
        onbHealth.overdueReviews.some((r) => r.horizon === rev.horizon)
          ? `The Day ${rev.horizon} ${planNoun} conversation was due ${rev.dueOn}.`
          : `The Day ${rev.horizon} ${planNoun} conversation is due ${rev.dueOn}.`,
      );
    }
    const dueCps = onbHealth.checkpointStats.items.filter((cp) => !cp.done && (cp.overdue || cp.dueSoon));
    for (const cp of dueCps.slice(0, 2)) {
      push(
        `${planLabel} (Day ${cp.horizon}): "${cp.title}".`,
        'onboarding',
        cp.overdue
          ? `This ${planNoun} checkpoint passed its ${cp.due} target.`
          : `This ${planNoun} checkpoint is due ${cp.due}.`,
      );
    }
    if (onbHealth.stakeholderStats.unmet > 0 && (onbHealth.dayNumber ?? 0) >= 14) {
      const nextPerson = onbHealth.stakeholderStats.items.find((s) => !s.met);
      if (nextPerson) {
        push(
          `Check ${planNoun} introduction to ${nextPerson.name}${nextPerson.purpose ? ` (${nextPerson.purpose})` : ''}.`,
          'onboarding',
          'Key stakeholder introductions rarely happen on their own without manager air-cover.',
        );
      }
    }
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

  const activeCases = openCasesForPerson(state, personId, now);
  for (const item of activeCases.slice(0, 2)) {
    const roleLabel = item.caseRecord.ownerId === personId ? 'owner' : 'involved';
    push(
      `Check support & systemic barriers on case "${item.caseRecord.title}" (${item.fmea.rated ? `${item.fmea.actionPriority.toUpperCase()} priority` : 'FMEA not rated'}, ${roleLabel}).`,
      'case',
      'Active operational cases require blameless barrier removal, stakeholder air-cover, and capacity protection.',
    );
  }

  const activeChanges = openChangesForPerson(state, personId, now).filter(
    (s) => s.change.status === 'active' || s.change.status === 'stabilising',
  );
  for (const item of activeChanges.slice(0, 2)) {
    const impact = (item.change.impacts || []).find((i) => i.personId === personId);
    const roleLabel = item.change.ownerId === personId
      ? 'change owner'
      : impact?.newRoleLabel
        ? `transitioning to ${impact.newRoleLabel}`
        : 'impacted';
    push(
      `Check role clarity, cognitive load & handoff friction on change "${item.change.title}" (${roleLabel}).`,
      'change',
      'Active organizational changes create temporary J-curve friction; check boundaries and support needs directly.',
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
    // Only live commitments belong on the agenda: carried-forward originals are
    // retired history and intentionally dropped commitments are closed decisions.
    const openWill = openWillActions(plan, now);
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
 * Combined agenda candidates for `Log a 1:1`: employee-raised `talkingPoints`
 * appear first (`source: 'their-topic'`), followed by record-derived
 * `suggestAgenda` items with their true provenance (`source`), de-duplicated
 * case-insensitively.
 */
export function buildMeetingAgendaCandidates(state, personId, now, settings) {
  const person = (state.people || []).find((p) => p.id === personId) || null;
  const seen = new Set();
  const theirTopics = [];
  for (const raw of person?.talkingPoints || []) {
    const text = String(raw || '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    theirTopics.push({
      text,
      source: 'their-topic',
      reason: 'Raised by them — employee-owned topic on their waiting list.',
      isTheirTopic: true,
    });
  }
  const suggestions = [];
  for (const item of suggestAgenda(state, personId, now, settings)) {
    const key = item.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      ...item,
      isTheirTopic: false,
    });
  }
  return {
    theirTopics,
    suggestions,
    all: [...theirTopics, ...suggestions],
  };
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
