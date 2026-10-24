/**
 * app/core/domain/decisions.js — decision log health (DACI + reversibility).
 *
 * A decision log is only worth keeping if it does two things: it names who
 * actually decided, and it comes back for review. Everything here is derived
 * from those two facts.
 */

import { addDays, daysSince, isOverdue, round } from '../time.js';

export const DACI_ROLES = [
  { key: 'driver', label: 'Driver', help: 'Makes the process happen and gathers input.' },
  { key: 'approver', label: 'Approver', help: 'The one person who says yes or no. Exactly one.' },
  { key: 'contributors', label: 'Contributors', help: 'Consulted before the call; their advice can be overruled.' },
  { key: 'informed', label: 'Informed', help: 'Told after the call — not consulted.' },
];

export const REVERSIBILITY_HELP = {
  reversible: 'Cheap to undo. Decide fast, at the lowest level that has the information.',
  irreversible: 'Expensive to undo. Slow down, write the rationale, name the approver.',
};

/** Decisions with no chosen option, sorted by age. */
export function openDecisions(state, now) {
  return state.decisions
    .filter((d) => !d.chosen)
    .map((d) => ({ ...d, ageDays: daysSince(d.date, now) ?? 0 }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

/** Decisions whose review date has arrived and that have not been reviewed. */
export function reviewsDue(state, now) {
  return state.decisions
    .filter((d) => d.reviewOn && !d.reviewedOn && isOverdue(d.reviewOn, now))
    .map((d) => ({ ...d, overdueDays: daysSince(d.reviewOn, now) ?? 0 }))
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

/** Default review date for a new decision. */
export function defaultReviewDate(state, now) {
  return addDays(now, state.settings?.decisionReviewDays ?? 14);
}

export function decisionsSummary(state, now) {
  const all = state.decisions;
  const decided = all.filter((d) => d.chosen);
  const reviewed = all.filter((d) => d.reviewedOn);
  const good = reviewed.filter((d) => d.outcome === 'good').length;
  const mixed = reviewed.filter((d) => d.outcome === 'mixed').length;
  const bad = reviewed.filter((d) => d.outcome === 'bad').length;
  return {
    total: all.length,
    decided: decided.length,
    open: all.length - decided.length,
    reviewsDue: reviewsDue(state, now),
    reviewed: reviewed.length,
    good,
    mixed,
    bad,
    hitRate: reviewed.length ? round((good / reviewed.length) * 100) : null,
    irreversible: all.filter((d) => d.reversibility === 'irreversible').length,
    missingApprover: all.filter((d) => !d.approver).length,
    missingReview: all.filter((d) => !d.reviewOn).length,
  };
}

/**
 * A quick, honest quality read on a single decision record.
 * @returns {{ score:number, checks:Array<{label,met,why}>, verdict:string }}
 */
export function decisionQuality(decision) {
  const checks = [
    { label: 'Approver named', met: Boolean(decision.approver), why: 'Without one approver, nobody is accountable for the call.' },
    { label: 'More than one option considered', met: (decision.options || []).length >= 2, why: 'A single option is a decision already made by someone else.' },
    { label: 'Rationale written', met: (decision.rationale || '').trim().length >= 30, why: 'Future-you needs the reasoning, not just the outcome.' },
    { label: 'Review date set', met: Boolean(decision.reviewOn), why: 'A decision with no review is never learned from.' },
    { label: 'Reversibility classified', met: Boolean(decision.reversibility), why: 'Reversible calls should be made faster than irreversible ones.' },
  ];
  const met = checks.filter((c) => c.met).length;
  const score = round((met / checks.length) * 100);
  return {
    score,
    checks,
    verdict: score >= 80 ? 'Well formed' : score >= 60 ? 'Adequate' : 'Thin record',
  };
}

/** Decisions involving a specific person by role, for the person detail page. */
export function decisionsInvolving(state, personName) {
  if (!personName) return [];
  return state.decisions.filter(
    (d) =>
      d.driver === personName ||
      d.approver === personName ||
      (d.contributors || '').includes(personName) ||
      (d.informed || '').includes(personName),
  );
}
