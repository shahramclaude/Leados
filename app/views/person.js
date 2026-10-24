/**
 * app/views/person.js — one person, everything recorded about them, and the
 * next conversation prepared for you.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, kv, personChip, emptyState, progressBar } from '../ui/components.js';
import { cadence, suggestAgenda, openActions, gradeMeeting, meetingsNewestFirst } from '../core/domain/oneonone.js';
import { personFeedbackStats, BALANCE_LABELS } from '../core/domain/feedback.js';
import { goalsFor, goalHealth, checkinStale } from '../core/domain/goals.js';
import { activePlan, growCompleteness, planProgress, reviewState } from '../core/domain/growth.js';
import { assess } from '../core/domain/readiness.js';
import { insightsForPerson } from '../core/domain/insights.js';
import { personTimeline, levelLabel, tenureDays } from '../core/domain/people.js';
import { humanDays, formatDate, daysSince } from '../core/time.js';
import {
  openPersonDialog, openOneOnOneDialog, openFeedbackDialog, openGoalDialog,
  openGrowthPlanDialog, openReadinessDialog, confirmArchive,
  openCheckInDialog, openWillActionDialog, openPerformanceReviewDialog,
} from '../ui/modals.js';

export function renderPerson(ctx, personId) {
  const { state, now } = ctx;
  const person = state.people.find((p) => p.id === personId);
  if (!person) {
    return h('div', { class: 'page' }, pageHeader({ title: 'Person not found', subtitle: 'They may have been archived or removed.' }), card({ body: emptyState({ title: 'No such person', action: h('a', { class: 'btn btn-primary', href: '#/people' }, 'Back to people') }) }));
  }

  const cad = cadence(state, person.id, now, state.settings);
  const fb = personFeedbackStats(state, person.id, now, state.settings);
  const goals = goalsFor(state, person.id);
  const plan = activePlan(state, person.id);
  const planHealth = plan ? { completeness: growCompleteness(plan), progress: planProgress(plan, now), review: reviewState(plan, now) } : null;
  const readiness = assess(state, person.id, now, state.settings);
  const suggestions = suggestAgenda(state, person.id, now, state.settings);
  const findings = insightsForPerson(state, person.id, now);
  const actions = openActions(state, { personId: person.id, now });
  const tenure = tenureDays(person, now);
  const recentMeetings = meetingsNewestFirst(state, person.id).slice(0, 4);

  const header = pageHeader({
    title: person.name,
    subtitle: [person.role, levelLabel(person.level), person.team].filter(Boolean).join(' · '),
    meta: h(
      'div',
      { class: 'person-meta' },
      badge(person.status === 'archived' ? 'Archived' : 'Active', person.status === 'archived' ? 'neutral' : 'good'),
      tenure !== null ? h('span', { class: 'muted small' }, `${tenure < 90 ? `${tenure} days on the team` : `${(tenure / 365).toFixed(1)} years on the team`} · started ${formatDate(person.startDate)}`) : null,
      cad.status === 'overdue' ? badge(`1:1 ${cad.overdueDays}d overdue`, 'bad') : null,
    ),
    actions: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openPersonDialog(ctx, { person }) }, 'Edit'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => confirmArchive(ctx, person) }, 'Archive'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openPerformanceReviewDialog(ctx, { personId: person.id }) }, 'Prepare review'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id }) }, 'Log a 1:1'),
    ],
  });

  const focusCard = person.focus
    ? card({ title: 'Focus right now', body: h('p', { class: 'prose' }, person.focus) })
    : null;

  const statsRow = h(
    'div',
    { class: 'stat-row' },
    stat({
      label: 'Last 1:1',
      value: cad.lastHeldDate ? humanDays(cad.daysSinceHeld) : 'never',
      hint: cad.status === 'overdue' ? `${cad.overdueDays} days past cadence` : `every ${cad.expectedDays} days`,
      tone: cad.status === 'overdue' || cad.status === 'never' ? 'bad' : cad.status === 'due' ? 'warn' : 'good',
    }),
    stat({ label: 'Feedback', value: fb.daysSinceGiven === null ? 'never' : humanDays(fb.daysSinceGiven), hint: BALANCE_LABELS[fb.balance], tone: fb.isStale ? 'warn' : 'good' }),
    stat({ label: 'Active goals', value: goals.filter((g) => g.status === 'active').length, hint: goals.length ? 'owned outcomes' : 'none set' }),
    stat({ label: 'Open actions', value: actions.length, hint: actions.filter((a) => a.overdue).length ? `${actions.filter((a) => a.overdue).length} overdue` : 'none overdue', tone: actions.some((a) => a.overdue) ? 'warn' : '' }),
  );

  const agendaCard = card({
    title: 'Prepared agenda for the next 1:1',
    subtitle: 'Built from this person’s open items. Each suggestion says why it is there.',
    body: h(
      'ol',
      { class: 'agenda-list' },
      ...suggestions.map((s) =>
        h(
          'li',
          { class: 'agenda-item' },
          h('div', { class: 'agenda-item-text' }, h('span', null, s.text), h('span', { class: 'agenda-item-reason' }, `${s.source} · ${s.reason}`)),
        ),
      ),
    ),
    actions: [h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id }) }, 'Use this agenda')],
  });

  const feedbackCard = card({
    title: 'Feedback',
    subtitle: `${fb.givenCount} given · ${fb.receivedCount} received · ${BALANCE_LABELS[fb.balance]}`,
    actions: [
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openFeedbackDialog(ctx, { personId: person.id, kind: 'praise' }) }, 'Praise'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openFeedbackDialog(ctx, { personId: person.id, kind: 'constructive' }) }, 'Constructive'),
    ],
    body: h(
      'div',
      null,
      stat({ label: 'Last feedback given', value: fb.daysSinceGiven === null ? 'never' : humanDays(fb.daysSinceGiven), hint: `${fb.praise} praise · ${fb.constructive} constructive in 90 days` }),
      fb.balance === 'praise-only'
        ? h('p', { class: 'note note-warn' }, 'Only praise on record. Ruinous empathy: the person cannot improve on information they never receive.')
        : null,
      fb.balance === 'constructive-only'
        ? h('p', { class: 'note note-warn' }, 'Only criticism on record. Without praise, corrective feedback reads as a verdict on the person.')
        : null,
      h('a', { class: 'link', href: `#/feedback?person=${person.id}` }, 'See all feedback →'),
    ),
  });

  const goalsCard = card({
    title: 'Goals',
    subtitle: goals.length ? `${goals.filter((g) => g.status === 'active').length} active` : 'No goals recorded',
    actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openGoalDialog(ctx, { personId: person.id }) }, 'Set a goal')],
    body: goals.length
      ? h(
          'ul',
          { class: 'goal-list' },
          ...goals.map((goal) => {
            const health = goalHealth(goal, now);
            const stale = checkinStale(goal, now, state.settings);
            return h(
              'li',
              { class: 'goal-item' },
              h(
                'div',
                { class: 'goal-item-head' },
                h('span', { class: 'goal-title' }, goal.title),
                badge(health.health, health.health === 'on-track' ? 'good' : health.health === 'at-risk' ? 'warn' : 'bad'),
              ),
              h('div', { class: 'goal-progress' }, progressBar(health.progressPct, { label: `Progress on ${goal.title}` }), h('span', { class: 'muted tiny' }, `${health.progressPct ?? 0}% of target · expected ${health.expectedPct ?? 0}%`)),
              h(
                'div',
                { class: 'goal-meta' },
                h('span', { class: 'muted tiny' }, goal.dueDate ? `due ${goal.dueDate}` : 'no due date'),
                stale.stale ? badge(stale.never ? 'no check-in' : `check-in ${stale.days}d ago`, 'caution') : badge(`checked ${stale.days}d ago`, 'good'),
                habitButton('Check in', () => openCheckInDialog(ctx, { goal })),
              ),
            );
          }),
        )
      : emptyState({ title: 'No goals yet', body: 'One well-chosen outcome beats five vague ones.', action: h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openGoalDialog(ctx, { personId: person.id }) }, 'Set a goal') }),
  });

  const growthCard = card({
    title: 'Development',
    subtitle: plan ? reviewState(plan, now).state === 'overdue' ? 'Review overdue' : planHealth.completeness.complete ? 'GROW plan complete' : `GROW ${planHealth.completeness.percent}% filled in` : 'No active plan',
    actions: [
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: person.id }) }, plan ? 'Replace plan' : 'Start plan'),
      plan ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Add action') : null,
    ].filter(Boolean),
    body: plan
      ? h(
          'div',
          null,
          h('p', { class: 'prose' }, plan.goal),
          plan.reality ? h('p', { class: 'muted small' }, `Reality: ${plan.reality}`) : null,
          h(
            'ul',
            { class: 'will-list' },
            ...plan.will.map((action) =>
              h(
                'li',
                { class: `will-item ${action.done ? 'is-done' : ''}` },
                h('input', { type: 'checkbox', checked: action.done, 'aria-label': `Mark "${action.text}" ${action.done ? 'not done' : 'done'}`, onChange: () => ctx.api.toggleWillAction(plan.id, action.id) }),
                h('span', null, action.text),
                h('span', { class: 'muted tiny' }, action.due ? `due ${action.due}` : 'no date'),
              ),
            ),
          ),
          plan.options.length ? h('p', { class: 'muted small' }, `Options considered: ${plan.options.map((o) => o.text).join(' · ')}`) : null,
        )
      : emptyState({ title: 'No development plan', body: 'A GROW plan turns a vague intention into a dated commitment.', action: h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: person.id }) }, 'Start a plan') }),
  });

  const readinessCard = card({
    title: 'Succession readiness',
    subtitle: readiness.record ? readiness.label : 'Not assessed',
    actions: [h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openReadinessDialog(ctx, { personId: person.id, seat: readiness.record?.seat || person.role }) }, 'Assess')],
    body: h(
      'div',
      null,
      readiness.warning ? h('p', { class: 'note note-warn' }, readiness.warning) : null,
      h(
        'ul',
        { class: 'evidence-checks' },
        ...readiness.evidence.items.map((item) =>
          h('li', { class: item.met ? 'is-met' : '' }, h('span', { class: 'check-mark', 'aria-hidden': 'true' }, item.met ? '✓' : '·'), h('span', null, h('strong', null, item.label), h('span', { class: 'muted' }, ` — ${item.note}`))),
        ),
      ),
      h('p', { class: 'muted tiny' }, `${readiness.evidence.metCount} of ${readiness.evidence.items.length} evidence signals present (4 needed for "ready now").`),
    ),
  });

  const timelineCard = card({
    title: 'History',
    subtitle: 'Everything recorded, newest first.',
    body: personTimeline(state, person.id).length
      ? h(
          'ol',
          { class: 'timeline' },
          ...personTimeline(state, person.id).slice(0, 12).map((item) =>
            h(
              'li',
              { class: 'timeline-item' },
              h('span', { class: 'timeline-date' }, item.date),
              h('div', { class: 'timeline-body' }, h('span', { class: 'timeline-kind' }, item.kind), h('span', { class: 'timeline-title' }, item.title), item.detail ? h('p', { class: 'timeline-detail' }, item.detail) : null),
            ),
          ),
        )
      : emptyState({ title: 'Nothing recorded yet', body: 'The first 1:1 is the highest-value thing you can add.' }),
  });

  const meetingsCard = recentMeetings.length
    ? card({
        title: 'Recent 1:1s',
        subtitle: 'Quality as well as attendance.',
        body: h(
          'ul',
          { class: 'meeting-list' },
          ...recentMeetings.map((meeting) => {
            const grade = gradeMeeting(meeting);
            return h(
              'li',
              { class: 'meeting-item' },
              h('div', { class: 'meeting-head' }, h('span', { class: 'meeting-date' }, formatDate(meeting.date)), badge(meeting.status, meeting.status === 'held' ? 'good' : 'warn'), h('span', { class: 'muted tiny' }, `quality ${grade.score}/100`)),
              meeting.notes ? h('p', { class: 'meeting-notes' }, meeting.notes) : h('p', { class: 'muted' }, 'No notes recorded.'),
              meeting.actions.length ? h('p', { class: 'muted tiny' }, `Actions: ${meeting.actions.map((a) => `${a.text}${a.done ? ' ✓' : ''}`).join(' · ')}`) : null,
            );
          }),
        ),
      })
    : null;

  const findingsCard = findings.length
    ? card({
        title: 'Signals about this person',
        subtitle: `${findings.length} rule${findings.length === 1 ? '' : 's'} firing.`,
        body: h(
          'ul',
          { class: 'plain-list' },
          ...findings.map((f) =>
            h(
              'li',
              null,
              badge(f.severityLabel, f.severity >= 4 ? 'warn' : 'neutral'),
              h('span', { class: 'finding-inline-title' }, f.title),
              h('span', { class: 'muted tiny' }, ` ${f.ruleId}`),
            ),
          ),
        ),
      })
    : null;

  return h(
    'div',
    { class: 'page' },
    h('a', { class: 'back-link', href: '#/people' }, '← People'),
    header,
    focusCard,
    statsRow,
    h('div', { class: 'grid grid-2' }, agendaCard, feedbackCard),
    h('div', { class: 'grid grid-2' }, goalsCard, growthCard),
    h('div', { class: 'grid grid-2' }, readinessCard, findingsCard || timelineCard),
    findingsCard ? timelineCard : null,
    meetingsCard,
  );
}

function habitButton(label, onClick) {
  return h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick }, label);
}
