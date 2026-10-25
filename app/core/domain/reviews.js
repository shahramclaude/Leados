/**
 * app/core/domain/reviews.js — evidence-backed performance review packets.
 *
 * A review is a period boundary plus a frozen-at-completion set of source
 * excerpts, not an invented score. Every generated statement identifies the
 * record it came from. Current goal/plan values are explicitly labelled as
 * capture-time values; the app does not pretend it can reconstruct history it
 * never stored.
 *
 * Pure module: no DOM, storage, or implicit clock.
 */

import { daysBetween, dayKey } from '../time.js';
import { goalProgress } from './goals.js';
import { feedbackLatency } from './feedback.js';
import { authorityFor, DELEGATION_STATUS } from './delegations.js';
import { planProgress } from './growth.js';
import { REVIEW_RATINGS, REVIEW_RATING_LABELS } from '../schema.js';

export const SELF_REFLECTION_PROMPTS = [
  { key: 'achievements', label: 'What are you most proud of, and what changed because of your work?', shortLabel: 'Proud of' },
  { key: 'challenges', label: 'What was difficult, and what context should your manager understand?', shortLabel: 'Challenges & context' },
  { key: 'growth', label: 'What did you learn, and what do you want to grow next?', shortLabel: 'Learning & growth' },
  { key: 'support', label: 'What support or change would help you do your best work?', shortLabel: 'Support needed' },
];

export const MANAGER_PROMPTS = [
  { key: 'achievements', label: 'Which outcomes and behaviours should continue? Name specific examples.', shortLabel: 'Outcomes & strengths' },
  { key: 'development', label: 'What should change or develop? Ground it in behaviour and impact, not personality.', shortLabel: 'Development' },
  { key: 'nextSteps', label: 'What will you and this person do next, and by when?', shortLabel: 'Next-period commitments' },
];

export { REVIEW_RATINGS, REVIEW_RATING_LABELS };

const SOURCE_LABELS = {
  oneonone: '1:1',
  feedback: 'Feedback',
  goal: 'Goal',
  growth: 'Growth plan',
  recognition: 'Recognition',
  delegation: 'Delegation',
};

export function reviewSourceLabel(type) {
  return SOURCE_LABELS[type] || 'Record';
}

function cleanDay(value) {
  return dayKey(value);
}

export function validPeriod(periodStart, periodEnd) {
  const start = cleanDay(periodStart);
  const end = cleanDay(periodEnd);
  return Boolean(start && end && start === periodStart && end === periodEnd && start <= end);
}

export function inReviewPeriod(date, periodStart, periodEnd) {
  const day = cleanDay(date);
  return Boolean(day && day >= periodStart && day <= periodEnd);
}

function sourceRoute(type, sourceId, personId) {
  const id = encodeURIComponent(sourceId);
  const person = encodeURIComponent(personId);
  if (type === 'oneonone') return `#/oneonones?person=${person}&meeting=${id}`;
  if (type === 'feedback') return `#/feedback?person=${person}&item=${id}`;
  if (type === 'goal') return `#/goals?goal=${id}`;
  if (type === 'growth') return `#/growth?plan=${id}`;
  if (type === 'delegation') return `#/delegations?delegation=${id}`;
  return `#/recognition?item=${id}`;
}

function evidenceItem({ type, sourceId, personId, date = null, title, detail = '', meta = '', valence = 'neutral', basis = '' }) {
  return {
    id: `${type}:${sourceId}:${date || 'capture'}`,
    sourceType: type,
    sourceId,
    date,
    title: String(title || '').slice(0, 1000),
    detail: String(detail || '').slice(0, 4000),
    meta: String(meta || '').slice(0, 1000),
    basis: String(basis || '').slice(0, 300),
    route: sourceRoute(type, sourceId, personId),
    valence: ['positive', 'constructive', 'neutral'].includes(valence) ? valence : 'neutral',
  };
}

/**
 * Assemble source excerpts for one person and period, inclusive of both dates.
 *
 * Upward feedback (`direction: received`) is feedback *from* the person about
 * their manager, so it is deliberately not used as evidence about the person.
 * Anonymous pulse responses are never attributed here.
 */
export function buildReviewEvidence(state, personId, periodStart, periodEnd) {
  if (!validPeriod(periodStart, periodEnd)) return [];
  const items = [];
  const mine = (record) => record.personId === personId;

  for (const meeting of (state.oneOnOnes || []).filter((m) => mine(m) && inReviewPeriod(m.date, periodStart, periodEnd))) {
    const actionCount = (meeting.actions || []).length;
    const doneCount = (meeting.actions || []).filter((a) => a.done).length;
    const carriedCount = (meeting.actions || []).filter((a) => !a.done && !a.dropped && a.carriedToMeetingId).length;
    const droppedCount = (meeting.actions || []).filter((a) => a.dropped).length;
    items.push(evidenceItem({
      type: 'oneonone', sourceId: meeting.id, personId, date: meeting.date,
      title: `1:1 ${meeting.status}`,
      detail: meeting.notes || 'No notes recorded for this conversation.',
      meta: [
        `${actionCount} action${actionCount === 1 ? '' : 's'} at capture`,
        `${doneCount} done`,
        carriedCount ? `${carriedCount} carried forward` : null,
        droppedCount ? `${droppedCount} dropped` : null,
      ].filter(Boolean).join(' · '),
      basis: 'Conversation date',
    }));
  }

  for (const feedback of (state.feedback || []).filter((f) => mine(f) && f.direction === 'given' && inReviewPeriod(f.date, periodStart, periodEnd))) {
    const sbi = [feedback.situation, feedback.behavior, feedback.impact ? `Impact: ${feedback.impact}` : ''].filter(Boolean).join(' — ');
    const latency = feedbackLatency(feedback);
    const latencyMeta = feedback.observedOn
      ? `observed ${feedback.observedOn} · ${latency.status === 'measured' ? `${latency.days}d observation-to-conversation gap` : 'invalid observation/conversation dates'}`
      : 'observation date not recorded';
    items.push(evidenceItem({
      type: 'feedback', sourceId: feedback.id, personId, date: feedback.date,
      title: feedback.kind === 'praise' ? 'Praise' : 'Constructive feedback',
      detail: sbi,
      meta: `${feedback.kind === 'praise' ? 'Reinforce' : 'Develop'} · ${latencyMeta}${feedback.followUpOn ? ` · follow-up ${feedback.followUpDone ? 'closed' : `due ${feedback.followUpOn}`}` : ''}`,
      basis: 'Feedback conversation date',
      valence: feedback.kind === 'praise' ? 'positive' : 'constructive',
    }));
  }

  for (const recognition of (state.recognition || []).filter((r) => mine(r) && inReviewPeriod(r.date, periodStart, periodEnd))) {
    items.push(evidenceItem({
      type: 'recognition', sourceId: recognition.id, personId, date: recognition.date,
      title: 'Recognised contribution', detail: recognition.what,
      meta: (recognition.values || []).length ? `Values: ${recognition.values.join(', ')}` : 'Specific recognition',
      basis: 'Recognition date', valence: 'positive',
    }));
  }

  for (const goal of (state.goals || []).filter((g) => g.ownerId === personId)) {
    const createdDay = cleanDay(goal.createdAt);
    if (createdDay && createdDay > periodEnd) continue;
    const checkins = (goal.checkins || []).filter((c) => inReviewPeriod(c.date, periodStart, periodEnd)).slice().sort((a, b) => a.date.localeCompare(b.date));
    const createdInPeriod = createdDay && inReviewPeriod(createdDay, periodStart, periodEnd);
    const dueInPeriod = goal.dueDate && inReviewPeriod(goal.dueDate, periodStart, periodEnd);
    // A currently active goal that overlaps the period is useful context. A
    // historical goal with no event in the period is not guessed to be active.
    if (goal.status !== 'active' && !createdInPeriod && !dueInPeriod && !checkins.length) continue;
    const lastCheckin = checkins.at(-1) || null;
    const date = lastCheckin?.date || (createdInPeriod ? createdDay : null);
    const progress = goalProgress(goal);
    const confidence = goal.confidence || 'on-track';
    const valence = goal.status === 'done' || progress === 100
      ? 'positive'
      : ['at-risk', 'off-track'].includes(confidence) || goal.status === 'dropped'
        ? 'constructive'
        : 'neutral';
    items.push(evidenceItem({
      type: 'goal', sourceId: goal.id, personId, date,
      title: goal.title,
      detail: lastCheckin?.note || goal.description || 'No check-in note recorded in this period.',
      meta: `${progress === null ? 'Unmeasured at capture' : `${progress}% progress at capture`} · ${goal.status} · ${confidence.replace('-', ' ')} · ${goal.coAuthored === true ? 'co-authored' : goal.coAuthored === false ? 'explicitly leader-set' : 'authorship unknown'} · ${checkins.length} check-in${checkins.length === 1 ? '' : 's'} in period`,
      basis: lastCheckin ? 'Latest in-period check-in' : createdInPeriod ? 'Goal created in period' : 'Current goal snapshot; no dated goal event in period',
      valence,
    }));
  }

  for (const delegation of (state.delegations || []).filter((d) => mine(d))) {
    const events = [];
    if (inReviewPeriod(delegation.delegatedOn, periodStart, periodEnd)) {
      events.push({
        date: delegation.delegatedOn,
        kind: 'delegated',
        detail: delegation.expectedOutcome || 'No expected outcome recorded.',
        basis: 'Delegated in period',
        valence: 'neutral',
      });
    }
    const checkins = (delegation.checkins || []).filter((checkin) => inReviewPeriod(checkin.date, periodStart, periodEnd));
    for (const checkin of checkins) {
      events.push({
        date: checkin.date,
        kind: checkin.progress,
        detail: checkin.note,
        basis: 'Delegation check-in',
        valence: checkin.progress === 'blocked' ? 'constructive' : 'neutral',
      });
    }
    if (delegation.status === 'done' && inReviewPeriod(delegation.completedOn, periodStart, periodEnd)) {
      events.push({ date: delegation.completedOn, kind: 'done', detail: delegation.completionNote || 'Completion note not recorded.', basis: 'Outcome completed in period', valence: 'positive' });
    }
    if (delegation.status === 'returned' && inReviewPeriod(delegation.returnedOn, periodStart, periodEnd)) {
      events.push({ date: delegation.returnedOn, kind: 'returned', detail: delegation.returnReason || 'Return reason not recorded.', basis: 'Work returned to leader in period', valence: 'constructive' });
    }
    if (!events.length) continue;
    events.sort((a, b) => a.date.localeCompare(b.date));
    const latest = events.at(-1);
    const authority = authorityFor(delegation);
    items.push(evidenceItem({
      type: 'delegation', sourceId: delegation.id, personId, date: latest.date,
      title: delegation.title,
      detail: latest.detail,
      meta: `${DELEGATION_STATUS[delegation.status] || delegation.status} at capture · ${authority.label} · due ${delegation.dueOn || 'not recorded'} · ${checkins.length} check-in${checkins.length === 1 ? '' : 's'} in period`,
      basis: `${latest.basis}; status and authority are capture-time values`,
      valence: latest.valence,
    }));
  }

  for (const plan of (state.growthPlans || []).filter((p) => mine(p))) {
    const createdDay = cleanDay(plan.createdAt);
    if (createdDay && createdDay > periodEnd) continue;
    const createdInPeriod = createdDay && inReviewPeriod(createdDay, periodStart, periodEnd);
    const reviewInPeriod = plan.reviewOn && inReviewPeriod(plan.reviewOn, periodStart, periodEnd);
    const actionInPeriod = (plan.will || []).some((a) => a.due && inReviewPeriod(a.due, periodStart, periodEnd));
    if (plan.status !== 'active' && !createdInPeriod && !reviewInPeriod && !actionInPeriod) continue;
    const progress = planProgress(plan, new Date(`${periodEnd}T00:00:00.000Z`));
    items.push(evidenceItem({
      type: 'growth', sourceId: plan.id, personId, date: createdInPeriod ? createdDay : null,
      title: 'Development plan',
      detail: plan.goal,
      meta: `${progress.done}/${progress.total} commitments done at capture${plan.reviewOn ? ` · review ${plan.reviewOn}` : ''}`,
      basis: createdInPeriod ? 'Plan created in period' : 'Current development snapshot; no plan creation in period',
      valence: progress.done > 0 ? 'positive' : 'neutral',
    }));
  }

  // Oldest evidence first: the UI deliberately makes the start of the period
  // as visible as its final weeks instead of anchoring the reviewer on recency.
  return items.sort((a, b) => {
    if (a.date === null && b.date !== null) return 1;
    if (a.date !== null && b.date === null) return -1;
    if (a.date !== b.date) return (a.date || '').localeCompare(b.date || '');
    return a.sourceType.localeCompare(b.sourceType) || a.id.localeCompare(b.id);
  });
}

export function summarizeReviewEvidence(evidence, periodStart, periodEnd) {
  const dated = (evidence || [])
    .filter((e) => e.date && inReviewPeriod(e.date, periodStart, periodEnd))
    .sort((a, b) => a.date.localeCompare(b.date));
  const periodDays = Math.max(1, (daysBetween(periodStart, periodEnd) ?? 0) + 1);
  const midpointOffset = Math.floor(periodDays / 2);
  const midpoint = dayKey(new Date(new Date(`${periodStart}T00:00:00.000Z`).getTime() + midpointOffset * 86400000));
  const byType = {};
  for (const item of evidence || []) byType[item.sourceType] = (byType[item.sourceType] || 0) + 1;
  const early = dated.filter((e) => e.date < midpoint);
  const late = dated.filter((e) => e.date >= midpoint);
  return {
    total: (evidence || []).length,
    dated: dated.length,
    byType,
    sourceTypes: Object.keys(byType).length,
    positive: dated.filter((e) => e.valence === 'positive').length,
    constructive: dated.filter((e) => e.valence === 'constructive').length,
    early: early.length,
    late: late.length,
    periodDays,
    midpoint,
    firstDate: dated[0]?.date || null,
    lastDate: dated.at(-1)?.date || null,
  };
}

/**
 * Calibration warnings are challenges to examine, not automated verdicts about
 * a person. They never change a rating or invent one.
 */
export function calibrateReview(review, evidence = review.evidence || []) {
  const warnings = [];
  const summary = summarizeReviewEvidence(evidence, review.periodStart, review.periodEnd);
  const add = (id, title, detail, tone = 'warn') => warnings.push({ id, title, detail, tone });

  if (summary.dated < 2 || summary.sourceTypes < 2) {
    add('CAL-01', 'The evidence base is thin', `${summary.dated} dated source record${summary.dated === 1 ? '' : 's'} across ${summary.sourceTypes} source type${summary.sourceTypes === 1 ? '' : 's'}. Look for missing context before treating this packet as the whole period.`, summary.dated === 0 ? 'bad' : 'warn');
  }
  if (summary.periodDays >= 60 && summary.dated >= 2 && summary.early === 0) {
    add('CAL-02', 'All dated evidence is in the later part of the period', `The first dated record is ${summary.firstDate}. Check earlier work so the most recent weeks do not stand in for the full ${summary.periodDays}-day period.`);
  }

  const rating = review.manager?.rating || '';
  if (['often-exceeds', 'sets-standard'].includes(rating) && summary.positive === 0) {
    add('CAL-03', 'High rating has no dated positive evidence', `${REVIEW_RATING_LABELS[rating]} is selected, but the packet has no dated praise, recognition, completed goal, completed delegation, or completed development evidence. Add the missing example or reconsider the rating.`);
  }
  if (rating === 'needs-development' && summary.constructive === 0) {
    add('CAL-04', 'Development rating has no dated constructive evidence', 'Needs development is selected, but the packet has no dated constructive feedback, at-risk goal, or dropped goal. Record the specific behaviour or outcome that supports the assessment.');
  }
  if (rating && `${review.manager?.achievements || ''}${review.manager?.development || ''}`.trim().length < 80) {
    add('CAL-05', 'The rating needs a fuller evidence narrative', 'A rating without specific outcomes and behaviours is an assertion. Use the linked records to explain what happened and its impact.', 'caution');
  }
  if (summary.dated >= 3 && summary.positive > 0 && summary.constructive === 0) {
    add('CAL-06', 'The dated evidence is entirely positive', 'Strengths are visible, but no development evidence is recorded. Check whether a useful challenge or missed expectation has been omitted.', 'caution');
  }
  if (summary.dated >= 3 && summary.constructive > 0 && summary.positive === 0) {
    add('CAL-07', 'The dated evidence is entirely developmental', 'Development needs are visible, but no strengths are recorded. Check whether outcomes worth sustaining have been omitted.', 'caution');
  }
  return warnings;
}

export function hasSelfReflection(review) {
  return SELF_REFLECTION_PROMPTS.some(({ key }) => (review.selfReflection?.[key] || '').trim().length > 0);
}

/** Completion checks are intentionally explicit; self-reflection is invited,
 * never required, because a local manager app cannot compel another person to
 * submit one and must not pretend that it did. */
export function reviewReadiness(review, evidence = review.evidence || []) {
  const summary = summarizeReviewEvidence(evidence, review.periodStart, review.periodEnd);
  const checks = [
    { key: 'evidence', label: 'At least one dated source record in the period', met: summary.dated > 0 },
    { key: 'achievements', label: 'Specific outcomes and strengths (20+ characters)', met: (review.manager?.achievements || '').trim().length >= 20 },
    { key: 'development', label: 'A specific development or change area (20+ characters)', met: (review.manager?.development || '').trim().length >= 20 },
    { key: 'nextSteps', label: 'Forward commitments with an owner or timing (10+ characters)', met: (review.manager?.nextSteps || '').trim().length >= 10 },
  ];
  return {
    checks,
    missing: checks.filter((c) => !c.met),
    canComplete: checks.every((c) => c.met),
    selfReflectionPresent: hasSelfReflection(review),
  };
}

export function reviewsForPerson(state, personId) {
  return (state.reviews || []).filter((r) => r.personId === personId).sort((a, b) => b.periodEnd.localeCompare(a.periodEnd));
}
