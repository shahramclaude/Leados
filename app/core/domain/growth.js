/**
 * app/core/domain/growth.js — GROW coaching plans.
 *
 * GROW (Whitmore): Goal → Reality → Options → Will. Most "development plans"
 * fail because they stop after Goal ("get better at influencing") and never
 * reach Will (a dated, owned action). This module scores a plan on how far down
 * that chain it actually got, and refuses to call a plan healthy when it has no
 * committed action.
 */

import { clamp, daysBetween, daysSince, isOverdue, round } from '../time.js';

export const GROW_STAGES = [
  { key: 'goal', label: 'Goal', question: 'What does better look like, specifically, in 3–6 months?' },
  { key: 'reality', label: 'Reality', question: 'What is actually happening now, with evidence?' },
  { key: 'options', label: 'Options', question: 'What are at least two routes forward?' },
  { key: 'will', label: 'Will', question: 'What will you do, by when?' },
];

export const COMPETENCIES = [
  'Decision-making',
  'Delegation',
  'Feedback',
  'Coaching',
  'Written communication',
  'Influence without authority',
  'Stakeholder management',
  'Prioritisation',
  'Conflict resolution',
  'Hiring & interviewing',
  'Technical depth',
  'Process design',
  'Team leadership',
  'Commercial judgement',
  'Cross-functional collaboration',
];

export function plansFor(state, personId) {
  return state.growthPlans.filter((p) => p.personId === personId);
}

export function activePlan(state, personId) {
  return state.growthPlans
    .filter((p) => p.personId === personId && p.status === 'active')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] || null;
}

/** Which GROW stages have real content behind them. */
export function growCompleteness(plan) {
  if (!plan) return { percent: 0, stages: [], complete: false };
  const has = {
    goal: (plan.goal || '').trim().length >= 20,
    reality: (plan.reality || '').trim().length >= 20,
    options: (plan.options || []).filter((o) => o.text.trim()).length >= 2,
    will: (plan.will || []).some((a) => a.text && a.due),
  };
  const stages = GROW_STAGES.map((stage) => ({ ...stage, met: has[stage.key] }));
  const percent = round((Object.values(has).filter(Boolean).length / 4) * 100);
  return { percent, stages, complete: percent === 100 };
}

/* ------------------------------------------------ development commitment ledger */

/**
 * A commitment is open until it is delivered, abandoned or explicitly moved
 * into a later one. A carried original is history; its successor is the live
 * promise.
 */
export function isOpenWill(action) {
  return !action?.done && !action?.dropped && !action?.carriedToId;
}

/**
 * Walk a commitment back to the one it replaced. Returns the carry depth and
 * the day the promise was first recorded, so "carried 2× since 4 September" is
 * derived from the chain rather than from a counter that can drift.
 *
 * Cycle-safe: a corrupted file cannot hang the render.
 */
export function willChain(plan, action) {
  const byId = new Map((plan.will || []).map((a) => [a.id, a]));
  const planDay = (plan.createdAt || '').slice(0, 10) || null;
  let depth = 0;
  let cursor = action;
  const seen = new Set([action.id]);
  while (cursor?.carriedFromId && !seen.has(cursor.carriedFromId)) {
    seen.add(cursor.carriedFromId);
    const previous = byId.get(cursor.carriedFromId);
    if (!previous) break;
    depth += 1;
    cursor = previous;
  }
  return { depth, firstAgreedOn: cursor?.addedOn || planDay };
}

/** One pass over a plan: carry depth and first-agreed date for every commitment. */
export function willIndex(plan) {
  const map = new Map();
  for (const action of plan.will || []) map.set(action.id, willChain(plan, action));
  return map;
}

export function willState(action) {
  if (action.done) return 'done';
  if (action.dropped) return 'dropped';
  if (action.carriedToId) return 'carried-forward';
  return 'open';
}

/** Live commitments, most urgent first: late, then soonest due, then oldest. */
export function openWillActions(plan, now) {
  const index = willIndex(plan);
  return (plan.will || [])
    .filter(isOpenWill)
    .map((action) => {
      const info = index.get(action.id) || { depth: 0, firstAgreedOn: null };
      return {
        ...action,
        carryCount: info.depth,
        firstAgreedOn: info.firstAgreedOn,
        overdue: Boolean(action.due && isOverdue(action.due, now)),
        daysUntilDue: action.due ? daysSince(action.due, now) : null,
      };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
      if (a.due && !b.due) return -1;
      if (!a.due && b.due) return 1;
      return b.carryCount - a.carryCount;
    });
}

/** Commitments that have already been moved at least once and are still open. */
export function carriedWillActions(plan, now) {
  return openWillActions(plan, now).filter((action) => action.carryCount > 0);
}

/**
 * Action completion across the live commitments only.
 *
 * A carried original is excluded from both the numerator and the denominator:
 * counting it as an unfinished action would make carrying a commitment look
 * identical to ignoring it, which is the distinction this ledger exists to draw.
 */
export function planProgress(plan, now) {
  const will = plan.will || [];
  const live = will.filter((a) => !a.carriedToId);
  const done = live.filter((a) => a.done).length;
  const dropped = live.filter((a) => a.dropped).length;
  const open = live.filter((a) => !a.done && !a.dropped);
  const next = open.slice().sort((a, b) => {
    if (a.due && b.due) return a.due < b.due ? -1 : 1;
    if (a.due) return -1;
    if (b.due) return 1;
    return 0;
  })[0] || null;
  const overdue = open.filter((a) => a.due && isOverdue(a.due, now)).length;
  return {
    total: live.length,
    done,
    dropped,
    open: open.length,
    carriedForward: will.filter((a) => a.carriedToId).length,
    // Dropped commitments are decisions, not failures: they leave the base.
    percent: live.length ? round((done / live.length) * 100) : 0,
    next,
    overdue,
  };
}

/* ------------------------------------------------------- review conversations */

/** Recorded reviews, newest first. */
export function reviewHistory(plan) {
  return (plan?.reviews || [])
    .slice()
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
}

export function lastReview(plan) {
  return reviewHistory(plan)[0] || null;
}

/** What one recorded review settled, derived from the commitments themselves. */
export function reviewedIn(plan, reviewId) {
  const will = plan?.will || [];
  return {
    closed: will.filter((a) => a.completedInReviewId === reviewId),
    dropped: will.filter((a) => a.droppedInReviewId === reviewId),
    carried: will.filter((a) => a.carriedInReviewId === reviewId),
  };
}

/** Review date state, including how often the date has been pushed. */
export function reviewState(plan, now) {
  const deferrals = plan?.reviewDeferrals || 0;
  const last = lastReview(plan);
  if (!plan?.reviewOn) {
    return { state: 'none', daysUntil: null, deferrals, lastReviewedOn: last?.date || null, reviewCount: (plan?.reviews || []).length };
  }
  const daysUntil = -daysSince(plan.reviewOn, now);
  const base = { deferrals, lastReviewedOn: last?.date || null, reviewCount: (plan?.reviews || []).length };
  if (isOverdue(plan.reviewOn, now)) return { state: 'overdue', daysUntil, ...base };
  if (daysUntil <= 7) return { state: 'soon', daysUntil, ...base };
  return { state: 'scheduled', daysUntil, ...base };
}

/**
 * A plan is "healthy" only when it has all four stages *and* at least one
 * action completed or in flight. Otherwise it is paperwork.
 */
export function planHealth(plan, now) {
  const completeness = growCompleteness(plan);
  const progress = planProgress(plan, now);
  const review = reviewState(plan, now);
  const issues = [];
  if (!completeness.complete) {
    const missing = completeness.stages.filter((s) => !s.met).map((s) => s.label);
    issues.push(`GROW stages not yet filled: ${missing.join(', ')}`);
  }
  if (!plan.will?.length) issues.push('No committed action — this is a hope, not a plan');
  if (progress.overdue > 0) issues.push(`${progress.overdue} development action(s) overdue`);
  if (progress.carriedForward > 0) issues.push(`${progress.carriedForward} commitment(s) carried forward at least once`);
  if (review.state === 'overdue') issues.push('Review date has passed');
  if (review.state === 'none') issues.push('No review date set');
  if (review.deferrals >= 2) issues.push(`Review date moved ${review.deferrals} times without a recorded review`);
  return {
    completeness,
    progress,
    review,
    issues,
    health: review.state === 'overdue' || (plan.will?.length === 0) ? 'attention' : completeness.complete ? 'healthy' : 'incomplete',
  };
}

/** Competency coverage across the team, for the gap matrix. */
export function competencyGaps(state) {
  const people = state.people.filter((p) => p.status !== 'archived');
  const covered = new Map();
  for (const plan of state.growthPlans.filter((p) => p.status === 'active')) {
    for (const c of plan.competencies || []) {
      covered.set(c, (covered.get(c) || 0) + 1);
    }
  }
  const rows = COMPETENCIES.map((name) => {
    const focus = people
      .filter((p) => {
        const plan = activePlan(state, p.id);
        return plan && (plan.competencies || []).includes(name);
      })
      .map((p) => p.name);
    return { name, count: covered.get(name) || 0, people: focus };
  });
  return {
    rows,
    uncovered: rows.filter((r) => r.count === 0),
    peopleWithoutPlan: people.filter((p) => !activePlan(state, p.id)),
    planCoverage: people.length ? round((people.filter((p) => activePlan(state, p.id)).length / people.length) * 100) : 0,
  };
}

/** Days a person has been in their plan without a completed action. */
export function stagnationDays(plan, now) {
  if (!plan) return null;
  const markers = [
    ...(plan.will || []).filter((a) => a.done).map((a) => a.completedOn).filter(Boolean),
    // A held review is development work even when no action was closed: the
    // conversation happened, so the plan is not "still".
    ...(plan.reviews || []).map((r) => r.date),
    plan.stagesUpdatedOn,
  ].filter(Boolean).sort();
  const latest = markers[markers.length - 1];
  if (!latest) return daysBetween(plan.createdAt, now);
  return daysSince(latest, now);
}

export { clamp };
