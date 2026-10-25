/**
 * app/core/domain/delegations.js — outcome ownership, decision authority and
 * follow-through. Pure module: no DOM, storage, or implicit clock.
 */

import { daysBetween, daysSince, isOverdue } from '../time.js';

export const DELEGATION_AUTHORITY = {
  recommend: {
    label: 'Recommend; I decide',
    shortLabel: 'Recommend',
    description: 'Explore the options and bring a reasoned recommendation. The leader makes the final decision.',
  },
  agree: {
    label: 'Decide together first',
    shortLabel: 'Agree first',
    description: 'Shape the decision together and do not act until both sides agree on the approach.',
  },
  'act-inform': {
    label: 'Act and keep me informed',
    shortLabel: 'Act + inform',
    description: 'Make the relevant decisions and act independently, then report what changed at the agreed checkpoint.',
  },
  own: {
    label: 'Own the outcome',
    shortLabel: 'Full ownership',
    description: 'Own both the decisions and the result within the recorded constraints. The leader reviews outcomes, not each step.',
  },
};

export const DELEGATION_STATUS = {
  active: 'Active',
  done: 'Completed',
  returned: 'Returned to leader',
};

export function authorityFor(delegation) {
  return DELEGATION_AUTHORITY[delegation?.authority] || {
    label: 'Authority not recorded',
    shortLabel: 'Unspecified',
    description: 'The decision boundary is missing. Clarify it before relying on this handoff.',
  };
}

export function latestDelegationCheckin(delegation) {
  // Later entries win a same-day tie, so a second check-in can unblock the first.
  return (delegation?.checkins || []).reduce((latest, checkin) => {
    if (!checkin?.date) return latest;
    return !latest || checkin.date >= latest.date ? checkin : latest;
  }, null);
}

/**
 * A delegation has independent overdue, blocked and checkpoint signals. The
 * headline status picks the most actionable one; the booleans retain the rest.
 */
export function delegationHealth(delegation, now, settings = {}) {
  const latest = latestDelegationCheckin(delegation);
  const active = delegation?.status === 'active';
  const overdue = Boolean(active && delegation.dueOn && isOverdue(delegation.dueOn, now));
  const blocked = Boolean(active && latest?.progress === 'blocked');
  const checkpointDate = latest?.date || delegation?.delegatedOn || null;
  const checkinAge = active ? daysSince(checkpointDate, now) : null;
  const target = settings?.delegationCheckinDays ?? 7;
  const checkinDue = Boolean(active && (checkinAge === null || checkinAge > target));
  const unscheduled = Boolean(active && !delegation?.dueOn);
  const daysLeft = active && delegation?.dueOn ? daysBetween(now, delegation.dueOn) : null;

  let status = delegation?.status || 'active';
  if (active) {
    if (unscheduled) status = 'unscheduled';
    else if (blocked) status = 'blocked';
    else if (overdue) status = 'overdue';
    else if (checkinDue) status = 'checkin-due';
    else status = 'on-track';
  }

  return {
    status,
    label: {
      active: 'Active', done: 'Completed', returned: 'Returned',
      unscheduled: 'No due date', blocked: 'Blocked', overdue: 'Overdue',
      'checkin-due': 'Check-in due', 'on-track': 'On track',
    }[status] || 'Active',
    tone: {
      done: 'good', returned: 'neutral', unscheduled: 'warn', blocked: 'bad',
      overdue: 'bad', 'checkin-due': 'warn', 'on-track': 'good', active: 'neutral',
    }[status] || 'neutral',
    active,
    latest,
    overdue,
    blocked,
    checkinDue,
    unscheduled,
    checkinAge,
    checkpointDate,
    target,
    daysLeft,
    daysOverdue: overdue ? Math.max(0, daysSince(delegation.dueOn, now) || 0) : 0,
  };
}

export function delegationsFor(state, personId) {
  return (state.delegations || []).filter((delegation) => delegation.personId === personId);
}

/**
 * Actionable delegation follow-through for Today. This derives from existing
 * records only: blocked work first, then late outcomes, missing due dates and
 * stale check-ins. The ordering is a triage aid, not a judgement of the owner.
 */
export function dueDelegationCheckins(state, now, settings = {}) {
  const priority = { blocked: 0, overdue: 1, unscheduled: 2, 'checkin-due': 3 };
  return (state?.delegations || [])
    .map((delegation) => {
      const health = delegationHealth(delegation, now, settings);
      const kind = health.blocked
        ? 'blocked'
        : health.overdue
          ? 'overdue'
          : health.unscheduled
            ? 'unscheduled'
            : health.checkinDue
              ? 'checkin-due'
              : null;
      if (!health.active || !kind) return null;
      const person = (state?.people || []).find((item) => item.id === delegation.personId) || null;
      return { delegation, person, health, kind };
    })
    .filter(Boolean)
    .sort((a, b) =>
      priority[a.kind] - priority[b.kind]
      || (b.kind === 'overdue' ? b.health.daysOverdue - a.health.daysOverdue : 0)
      || String(a.delegation.dueOn || '9999-12-31').localeCompare(String(b.delegation.dueOn || '9999-12-31'))
      || (b.health.checkinAge ?? -1) - (a.health.checkinAge ?? -1)
      || String(a.delegation.id).localeCompare(String(b.delegation.id)),
    );
}

export function delegationSummary(state, now, settings = {}) {
  const rows = (state.delegations || []).map((delegation) => ({
    delegation,
    health: delegationHealth(delegation, now, settings),
  }));
  const active = rows.filter((row) => row.delegation.status === 'active');
  return {
    rows,
    active: active.length,
    overdue: active.filter((row) => row.health.overdue).length,
    blocked: active.filter((row) => row.health.blocked).length,
    checkinDue: active.filter((row) => row.health.status === 'checkin-due').length,
    unscheduled: active.filter((row) => row.health.unscheduled).length,
    done: rows.filter((row) => row.delegation.status === 'done').length,
    returned: rows.filter((row) => row.delegation.status === 'returned').length,
    attention: active.filter((row) => ['unscheduled', 'blocked', 'overdue', 'checkin-due'].includes(row.health.status)),
  };
}
