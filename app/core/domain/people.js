/**
 * app/core/domain/people.js — roster queries and per-person derived facts.
 * Pure functions: state in, plain values out.
 */

import { daysBetween, daysSince, dayKey, toDate } from '../time.js';
import { LEVEL_LABELS } from '../schema.js';

export function activePeople(state) {
  return (state.people || []).filter((p) => p.status !== 'archived');
}

export function archivedPeople(state) {
  return (state.people || []).filter((p) => p.status === 'archived');
}

export function personById(state, id) {
  return (state.people || []).find((p) => p.id === id) || null;
}

export function peopleIndex(state) {
  const map = new Map();
  for (const p of state.people || []) map.set(p.id, p);
  return map;
}

export function displayName(person) {
  return person && person.name ? person.name : 'Unassigned';
}

export function initials(person) {
  const name = displayName(person).trim();
  if (!name || name === 'Unassigned') return '?';
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function levelLabel(level) {
  return LEVEL_LABELS[level] || 'Individual contributor';
}

/** Tenure in whole days, or null when no start date was recorded. */
export function tenureDays(person, now) {
  if (!person || !person.startDate) return null;
  return daysSince(person.startDate, now);
}

export function isNewJoiner(person, now, settings) {
  const tenure = tenureDays(person, now);
  if (tenure === null) return false;
  return tenure >= 0 && tenure <= (settings?.onboardingDays ?? 90);
}

export function directReports(state, managerId) {
  return activePeople(state).filter((p) => p.managerId && p.managerId === managerId);
}

export function managerOf(state, person) {
  if (!person || !person.managerId) return null;
  return personById(state, person.managerId);
}

/** Anyone the leader is directly responsible for. */
export function reportsOfLeader(state) {
  return activePeople(state).filter((p) => !p.managerId);
}

/**
 * Sort key that puts people needing attention first: no 1:1 ever, no goal,
 * then alphabetical. Used by the roster so the list is not just alphabetical.
 */
export function rosterOrder(state, now) {
  const people = activePeople(state);
  return people.slice().sort((a, b) => {
    const aHas = state.oneOnOnes.some((m) => m.personId === a.id);
    const bHas = state.oneOnOnes.some((m) => m.personId === b.id);
    if (aHas !== bHas) return aHas ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** All records about a person, newest first, for the person detail page. */
export function personTimeline(state, personId) {
  const items = [];
  for (const m of state.oneOnOnes.filter((r) => r.personId === personId)) {
    items.push({
      kind: '1:1',
      id: m.id,
      date: m.date,
      title: m.status === 'held' ? '1:1 held' : `1:1 ${m.status}`,
      detail: m.notes || '',
    });
  }
  for (const f of state.feedback.filter((r) => r.personId === personId)) {
    items.push({
      kind: f.direction === 'received' ? 'Feedback received' : 'Feedback given',
      id: f.id,
      date: f.date,
      title: `${f.kind === 'praise' ? 'Praise' : 'Constructive'} feedback ${f.direction === 'received' ? 'from' : 'to'} ${displayName(personById(state, personId))}`,
      detail: f.situation,
    });
  }
  for (const g of state.goals.filter((r) => r.ownerId === personId)) {
    items.push({ kind: 'Goal', id: g.id, date: g.createdAt, title: `Goal: ${g.title}`, detail: g.confidence });
  }
  for (const p of state.growthPlans.filter((r) => r.personId === personId)) {
    items.push({ kind: 'Growth plan', id: p.id, date: p.createdAt, title: 'GROW plan created', detail: p.goal });
  }
  for (const r of state.recognition.filter((x) => x.personId === personId)) {
    items.push({ kind: 'Recognition', id: r.id, date: r.date, title: 'Recognised', detail: r.what });
  }
  for (const d of (state.delegations || []).filter((x) => x.personId === personId)) {
    if (d.delegatedOn) {
      items.push({ kind: 'Delegation', id: d.id, date: d.delegatedOn, title: `Delegated: ${d.title}`, detail: d.expectedOutcome || '' });
    }
    if (d.status === 'done' && d.completedOn) {
      items.push({ kind: 'Delegation completed', id: `${d.id}-done`, date: d.completedOn, title: `Completed delegation: ${d.title}`, detail: d.completionNote || '' });
    }
    if (d.status === 'returned' && d.returnedOn) {
      items.push({ kind: 'Delegation returned', id: `${d.id}-returned`, date: d.returnedOn, title: `Returned delegation: ${d.title}`, detail: d.returnReason || '' });
    }
  }
  for (const review of (state.reviews || []).filter((r) => r.personId === personId)) {
    items.push({
      kind: 'Performance review', id: review.id, date: review.completedAt || review.updatedAt,
      title: `Performance review ${review.status === 'complete' ? 'completed' : 'started'}`,
      detail: `${review.periodStart} to ${review.periodEnd}`,
    });
  }
  return items
    .filter((i) => toDate(i.date))
    .sort((a, b) => (toDate(b.date)?.getTime() || 0) - (toDate(a.date)?.getTime() || 0));
}

/** Days between two day keys, exposed for views that show "joined N days ago". */
export { daysBetween, dayKey };
