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

const REVIEW_URGENCY = { overdue: 0, soon: 1, none: 2 };

/** Decisions with no chosen option, sorted by age. */
export function openDecisions(state, now) {
  return (state.decisions || [])
    .filter((d) => !d.chosen)
    .map((d) => ({ ...d, ageDays: daysSince(d.date, now) ?? 0 }))
    .sort((a, b) => b.ageDays - a.ageDays);
}

/**
 * Outcome review status for a single decision record.
 * An undecided record (`!d.chosen`) cannot be due for outcome review because
 * no choice has been made yet.
 */
export function decisionReviewState(decision, now) {
  if (!decision?.chosen) {
    return { state: 'undecided', daysUntil: null, overdueDays: 0 };
  }
  if (decision.reviewedOn) {
    return {
      state: 'reviewed',
      daysUntil: null,
      overdueDays: 0,
      reviewedOn: decision.reviewedOn,
      outcome: decision.outcome,
    };
  }
  if (!decision.reviewOn) {
    return { state: 'none', daysUntil: null, overdueDays: 0 };
  }
  const since = daysSince(decision.reviewOn, now);
  const daysUntil = since === null ? null : -since;
  if (isOverdue(decision.reviewOn, now)) {
    return { state: 'overdue', daysUntil, overdueDays: Math.max(0, since ?? 0) };
  }
  if (daysUntil !== null && daysUntil <= 7) {
    return { state: 'soon', daysUntil, overdueDays: 0 };
  }
  return { state: 'scheduled', daysUntil, overdueDays: 0 };
}

/** Decided calls whose review date has passed without a recorded outcome review. */
export function reviewsDue(state, now) {
  return (state.decisions || [])
    .filter((d) => Boolean(d.chosen) && d.reviewOn && !d.reviewedOn && isOverdue(d.reviewOn, now))
    .map((d) => ({ ...d, overdueDays: daysSince(d.reviewOn, now) ?? 0 }))
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

/**
 * Decided, unreviewed calls whose outcome review is overdue or due within 7
 * days (`soon`, including today), ordered most-overdue first, then soonest due,
 * then irreversible calls ahead of reversible ones.
 */
export function dueDecisionReviews(state, now, { includeUnscheduled = false } = {}) {
  const rows = [];
  for (const decision of state.decisions || []) {
    if (!decision.chosen || decision.reviewedOn) continue;
    const review = decisionReviewState(decision, now);
    const eligible =
      review.state === 'overdue' ||
      review.state === 'soon' ||
      (includeUnscheduled && review.state === 'none');
    if (!eligible) continue;
    rows.push({ decision, review });
  }
  return rows.sort((a, b) => {
    const rankDiff = (REVIEW_URGENCY[a.review.state] ?? 9) - (REVIEW_URGENCY[b.review.state] ?? 9);
    if (rankDiff !== 0) return rankDiff;
    if (typeof a.review.daysUntil === 'number' && typeof b.review.daysUntil === 'number' && a.review.daysUntil !== b.review.daysUntil) {
      return a.review.daysUntil - b.review.daysUntil;
    }
    if (a.decision.reversibility !== b.decision.reversibility) {
      return a.decision.reversibility === 'irreversible' ? -1 : 1;
    }
    return String(a.decision.date || '').localeCompare(String(b.decision.date || ''));
  });
}

/** Default review date for a new decision. */
export function defaultReviewDate(state, now) {
  return addDays(now, state.settings?.decisionReviewDays ?? 14);
}

export function decisionsSummary(state, now) {
  const all = state.decisions || [];
  const decided = all.filter((d) => d.chosen);
  const reviewed = decided.filter((d) => d.reviewedOn);
  const good = reviewed.filter((d) => d.outcome === 'good').length;
  const mixed = reviewed.filter((d) => d.outcome === 'mixed').length;
  const bad = reviewed.filter((d) => d.outcome === 'bad').length;
  const dueQueue = dueDecisionReviews(state, now);
  return {
    total: all.length,
    decided: decided.length,
    open: all.length - decided.length,
    reviewsDue: reviewsDue(state, now),
    dueQueue,
    reviewed: reviewed.length,
    good,
    mixed,
    bad,
    hitRate: reviewed.length ? round((good / reviewed.length) * 100) : null,
    irreversible: all.filter((d) => d.reversibility === 'irreversible').length,
    missingApprover: all.filter((d) => !d.approver).length,
    missingReview: all.filter((d) => !d.reviewOn).length,
    unscheduledDecided: decided.filter((d) => !d.reviewedOn && !d.reviewOn).length,
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

function splitParticipants(value) {
  return String(value || '')
    .split(/[,;&]|\band\b/i)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Decisions involving a specific person across DACI fields with exact
 * participant-name matching (avoiding substring false positives such as "Bo"
 * inside "Bob"), sorted newest first with their recorded role(s).
 */
export function decisionsForPerson(state, personName) {
  const target = String(personName || '').trim().toLowerCase();
  if (!target) return [];
  const roleNames = {
    driver: 'Driver',
    approver: 'Approver',
    contributors: 'Contributor',
    informed: 'Informed',
  };
  const out = [];
  for (const decision of state.decisions || []) {
    const roles = [];
    for (const [key, label] of Object.entries(roleNames)) {
      if (splitParticipants(decision[key]).includes(target)) roles.push(label);
    }
    if (roles.length) out.push({ decision, roles });
  }
  return out.sort((a, b) => String(b.decision.date || '').localeCompare(String(a.decision.date || '')));
}

/** Decisions involving a specific person by role, for callers wanting records. */
export function decisionsInvolving(state, personName) {
  return decisionsForPerson(state, personName).map((entry) => entry.decision);
}
