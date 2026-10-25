/**
 * app/core/domain/readiness.js — succession readiness that has to be earned.
 *
 * The failure mode of every "9-box" talent grid is that a confident manager
 * marks someone "ready now" because they are likeable, and the label then
 * outlives the evidence. Here a rating is stored, but the app also computes
 * what evidence exists, and a `ready-now` rating with thin evidence is
 * surfaced as a finding rather than displayed as fact.
 *
 * Evidence is deliberately behavioural and checkable from the record:
 * meeting cadence, recent feedback in both directions, a live growth plan with
 * a completed commitment, an owned goal with key results, and recognition.
 */

import { daysSince, isOverdue, round } from '../time.js';
import { cadence } from './oneonone.js';
import { activePlan, planProgress } from './growth.js';
import { goalProgress } from './goals.js';
import { activeOnboarding, planKind, planKindRecordNoun } from './onboarding.js';

const WINDOW_DAYS = 90;

export const EVIDENCE_DEFINITIONS = [
  {
    id: 'cadence',
    label: 'Regular 1:1s',
    detail: 'At least two 1:1s held in the last 90 days',
  },
  {
    id: 'feedback',
    label: 'Recent feedback',
    detail: 'Feedback given in the last 90 days',
  },
  {
    id: 'goal',
    label: 'Owns a goal with key results',
    detail: 'An active goal with at least one key result',
  },
  {
    id: 'growth',
    label: 'Development in motion',
    detail: 'An active growth plan with at least one completed action',
  },
  {
    id: 'recognition',
    label: 'Recognised contribution',
    detail: 'Recognition logged in the last 90 days',
  },
];

/**
 * @returns {{ items: Array<{id,label,detail,met,note}>, metCount:number,
 *            required:number, strengthProven:boolean, strengthEmerging:boolean }}
 */
export function evidenceFor(state, personId, now, settings) {
  const meetings = state.oneOnOnes.filter((m) => m.personId === personId && m.status === 'held');
  const recentMeetings = meetings.filter((m) => (daysSince(m.date, now) ?? Infinity) <= WINDOW_DAYS);
  const feedback = state.feedback.filter((f) => f.personId === personId);
  const recentFeedback = feedback.filter((f) => (daysSince(f.date, now) ?? Infinity) <= WINDOW_DAYS);
  const goals = state.goals.filter((g) => g.ownerId === personId && g.status === 'active' && (g.keyResults || []).length > 0);
  const plan = activePlan(state, personId);
  const progress = plan ? planProgress(plan, now) : null;
  const recognition = state.recognition.filter((r) => r.personId === personId && (daysSince(r.date, now) ?? Infinity) <= WINDOW_DAYS);
  const cad = cadence(state, personId, now, settings);

  const items = [
    {
      id: 'cadence',
      label: EVIDENCE_DEFINITIONS[0].label,
      detail: EVIDENCE_DEFINITIONS[0].detail,
      met: recentMeetings.length >= 2,
      note: `${recentMeetings.length} held in the last 90 days${cad.status === 'overdue' ? ` · cadence now overdue` : ''}`,
    },
    {
      id: 'feedback',
      label: EVIDENCE_DEFINITIONS[1].label,
      detail: EVIDENCE_DEFINITIONS[1].detail,
      met: recentFeedback.length >= 1,
      note: recentFeedback.length
        ? `${recentFeedback.length} item(s), including ${recentFeedback.filter((f) => f.kind === 'constructive').length} constructive`
        : 'No feedback recorded in 90 days',
    },
    {
      id: 'goal',
      label: EVIDENCE_DEFINITIONS[2].label,
      detail: EVIDENCE_DEFINITIONS[2].detail,
      met: goals.length >= 1,
      note: goals.length ? `${goals.length} goal(s), average progress ${round(goals.reduce((sum, g) => sum + (goalProgress(g) ?? 0), 0) / goals.length)}%` : 'No active goal with key results',
    },
    {
      id: 'growth',
      label: EVIDENCE_DEFINITIONS[3].label,
      detail: EVIDENCE_DEFINITIONS[3].detail,
      met: Boolean(plan && progress.done >= 1),
      note: plan ? `${progress.done} of ${progress.total} development actions completed` : 'No active growth plan',
    },
    {
      id: 'recognition',
      label: EVIDENCE_DEFINITIONS[4].label,
      detail: EVIDENCE_DEFINITIONS[4].detail,
      met: recognition.length >= 1,
      note: recognition.length ? `${recognition.length} recognition(s) in 90 days` : 'No recognition in 90 days',
    },
  ];

  const metCount = items.filter((i) => i.met).length;
  return {
    items,
    metCount,
    required: 3,
    strengthProven: metCount >= 4,
    strengthEmerging: metCount === 3,
  };
}

/** Latest readiness record for a person/seat. */
export function readinessFor(state, personId, seat = null) {
  const rows = state.readiness
    .filter((r) => r.personId === personId && (!seat || r.seat === seat))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return rows[0] || null;
}

/**
 * The stored rating, plus whether the evidence supports it.
 * @returns {{ rating:string, label:string, record:object|null, evidence:object,
 *             supported:boolean, warning:string|null }}
 */
export function assess(state, personId, now, settings, seat = null) {
  const record = readinessFor(state, personId, seat);
  const evidence = evidenceFor(state, personId, now, settings);
  const rating = record ? record.rating : 'not-ready';
  let supported = true;
  let warning = null;
  if (rating === 'ready-now' && !evidence.strengthProven) {
    supported = false;
    warning = `Marked ready now, but only ${evidence.metCount} of ${EVIDENCE_DEFINITIONS.length} evidence signals are present (4 needed).`;
  } else if (rating === 'ready-later' && evidence.metCount <= 1) {
    supported = false;
    warning = 'Marked as a future successor with almost no evidence on record.';
  }
  return {
    rating,
    record,
    evidence,
    supported,
    warning,
    label: readinessLabel(rating),
  };
}

export function readinessLabel(rating) {
  return { 'ready-now': 'Ready now', 'ready-later': 'Ready in 1–2 years', 'not-ready': 'Not yet ready' }[rating] || 'Not yet ready';
}

/** One row per named seat, with who (if anyone) can step in. */
export function successionGaps(state, now, settings) {
  const seats = new Map();
  for (const record of state.readiness) {
    if (!seats.has(record.seat)) seats.set(record.seat, []);
    seats.get(record.seat).push(record);
  }
  const rows = [];
  for (const [seat, records] of seats.entries()) {
    const candidates = records.map((record) => {
      const person = state.people.find((p) => p.id === record.personId);
      return { record, person, assessment: assess(state, record.personId, now, settings, seat) };
    });
    const readyNow = candidates.filter((c) => c.record.rating === 'ready-now' && c.assessment.supported);
    const future = candidates.filter((c) => c.record.rating === 'ready-later');
    rows.push({
      seat,
      candidates,
      readyNow,
      future,
      gap: readyNow.length === 0,
      unsupported: candidates.filter((c) => !c.assessment.supported),
      reviewOverdue: records.some((r) => isOverdue(r.updatedAt.slice(0, 10), now) && daysSince(r.updatedAt.slice(0, 10), now) > 180),
    });
  }
  return rows.sort((a, b) => Number(b.gap) - Number(a.gap) || a.seat.localeCompare(b.seat));
}

/** Seats that exist because someone's role implies they are hard to replace. */
export function suggestedSeats(state) {
  return state.people
    .filter((p) => p.status !== 'archived' && ['lead', 'manager', 'director', 'vp'].includes(p.level))
    .map((p) => ({ person: p, seat: p.role || 'Leadership seat' }));
}

/**
 * Pure bridge from a succession seat/candidate to a 30-60-90 role-transition
 * plan. Inspects whether the candidate is active and whether they already have
 * an active 30-60-90 plan (either for this seat or another), returning clean
 * prefill values without rewriting `person` or fabricating `roleClarity`.
 */
export function transitionHandoff(state, personId, seat, now = new Date(), settings = state?.settings) {
  const person = (state?.people || []).find((p) => p.id === personId) || null;
  const cleanSeat = String(seat || '').trim();
  const eligible = Boolean(person && person.status !== 'archived' && cleanSeat);
  const currentPlan = person ? activeOnboarding(state, person.id) : null;
  const currentKind = currentPlan ? planKind(currentPlan) : null;
  const matchingSeatTransition = Boolean(
    currentPlan &&
      currentKind === 'role-transition' &&
      String(currentPlan.label || '').trim().toLowerCase() === cleanSeat.toLowerCase(),
  );
  const assessment = person ? assess(state, person.id, now, settings, cleanSeat || null) : null;

  return {
    person,
    seat: cleanSeat,
    eligible,
    canStartTransition: Boolean(eligible && !currentPlan),
    activePlan: currentPlan,
    activePlanKind: currentKind,
    activePlanNoun: currentPlan ? planKindRecordNoun(currentPlan) : null,
    matchingSeatTransition,
    prefill: {
      personId: person?.id || '',
      kind: 'role-transition',
      label: cleanSeat,
      handoffContext: person && cleanSeat
        ? {
            seat: cleanSeat,
            ratingLabel: assessment?.label || 'Not assessed',
            supported: Boolean(assessment?.supported),
            metCount: assessment?.evidence?.metCount ?? 0,
            totalEvidence: EVIDENCE_DEFINITIONS.length,
            warning: assessment?.warning || null,
            notes: (assessment?.record?.notes || '').trim(),
          }
        : null,
    },
  };
}
