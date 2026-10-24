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

/** Action completion + next open action. */
export function planProgress(plan, now) {
  const will = plan.will || [];
  const done = will.filter((a) => a.done).length;
  const next = will.find((a) => !a.done) || null;
  const overdue = will.filter((a) => !a.done && a.due && isOverdue(a.due, now)).length;
  return {
    total: will.length,
    done,
    percent: will.length ? round((done / will.length) * 100) : 0,
    next,
    overdue,
  };
}

/** Review date state. */
export function reviewState(plan, now) {
  if (!plan.reviewOn) return { state: 'none', daysUntil: null };
  const daysUntil = -daysSince(plan.reviewOn, now);
  if (isOverdue(plan.reviewOn, now)) return { state: 'overdue', daysUntil };
  if (daysUntil <= 7) return { state: 'soon', daysUntil };
  return { state: 'scheduled', daysUntil };
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
  if (review.state === 'overdue') issues.push('Review date has passed');
  if (review.state === 'none') issues.push('No review date set');
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
  const done = (plan.will || []).filter((a) => a.done);
  const latest = done.length
    ? done.map((a) => a.due).filter(Boolean).sort().pop()
    : null;
  if (!latest) return daysBetween(plan.createdAt, now);
  return daysSince(latest, now);
}

export { clamp };
