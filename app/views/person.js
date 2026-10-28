/**
 * app/views/person.js — one person, everything recorded about them, and the
 * next conversation prepared for you.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, kv, emptyState, progressBar } from '../ui/components.js';
import { cadence, suggestAgenda, openActions, gradeMeeting, meetingsNewestFirst } from '../core/domain/oneonone.js';
import { personFeedbackStats, BALANCE_LABELS } from '../core/domain/feedback.js';
import { goalsFor, goalHealth, checkinStale } from '../core/domain/goals.js';
import {
  activePlan,
  growCompleteness,
  planProgress,
  reviewState,
  openWillActions,
  lastReview,
  linkedDelegationForWill,
} from '../core/domain/growth.js';
import { decisionsForPerson } from '../core/domain/decisions.js';
import { assess, transitionHandoff } from '../core/domain/readiness.js';
import { insightsForPerson } from '../core/domain/insights.js';
import { personTimeline, levelLabel, tenureDays, isNewJoiner } from '../core/domain/people.js';
import { onboardingFor, onboardingHealth } from '../core/domain/onboarding.js';
import { openCasesForPerson } from '../core/domain/cases.js';
import { openChangesForPerson } from '../core/domain/changes.js';
import { dependenciesForPerson } from '../core/domain/resilience.js';
import { humanDays, formatDate } from '../core/time.js';
import {
  openPersonDialog, openOneOnOneDialog, openFeedbackDialog, openGoalDialog,
  openGrowthPlanDialog, openReadinessDialog, confirmArchive,
  openCheckInDialog, openWillActionDialog, openCarryWillDialog, openDropWillDialog,
  openPerformanceReviewDialog, openDelegationDialog,
  openGrowthReviewDialog,
  openOnboardingPlanDialog, openOnboardingReviewDialog,
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
  const delegations = (state.delegations || []).filter((delegation) => delegation.personId === person.id);
  const plan = activePlan(state, person.id);
  const open = plan ? openWillActions(plan, now) : [];
  const planHealth = plan ? { completeness: growCompleteness(plan), progress: planProgress(plan, now), review: reviewState(plan, now) } : null;
  const readiness = assess(state, person.id, now, state.settings);
  const suggestions = suggestAgenda(state, person.id, now, state.settings);
  const personDecisions = decisionsForPerson(state, person.name);
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
      h('a', { class: 'btn btn-ghost', href: `#/delegations?person=${encodeURIComponent(person.id)}` }, 'Delegations'),
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openDelegationDialog(ctx, { personId: person.id }) }, 'Delegate'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id }) }, 'Log a 1:1'),
    ],
  });

  const focusCard = person.focus
    ? card({ title: 'Focus right now', body: h('p', { class: 'prose' }, person.focus) })
    : null;

  const onboardingPlans = onboardingFor(state, person.id);
  const currentOnboarding = onboardingPlans.find((p) => p.status === 'active') || onboardingPlans[0] || null;
  const onbHealth = currentOnboarding ? onboardingHealth(currentOnboarding, state, now, state.settings) : null;
  const newJoiner = isNewJoiner(person, now, state.settings);

  const onboardingCard = currentOnboarding
    ? card({
        title: onbHealth.isTransition
          ? 'Role transition (30-60-90)'
          : onbHealth.isReboarding
            ? 'Return to work (30-60-90)'
            : 'Onboarding (30-60-90)',
        subtitle: [
          onbHealth.isTransition && onbHealth.label
            ? `New scope: ${onbHealth.label}`
            : onbHealth.isReboarding && onbHealth.label
              ? `Context: ${onbHealth.label}`
              : '',
          currentOnboarding.status === 'completed'
            ? `Completed ${formatDate(currentOnboarding.completedOn || currentOnboarding.startDate)} · started ${formatDate(currentOnboarding.startDate)}`
            : `Day ${onbHealth.dayNumber ?? '—'} · current horizon: Day ${onbHealth.currentHorizon}`,
        ].filter(Boolean).join(' · '),
        actions: [
          badge(onbHealth.statusLabel, onbHealth.statusTone),
          h('a', { class: 'btn btn-small btn-ghost', href: `#/onboarding?person=${encodeURIComponent(person.id)}` }, 'Open 30-60-90 plan'),
          currentOnboarding.status === 'active'
            ? h(
                'button',
                {
                  class: 'btn btn-small btn-primary',
                  type: 'button',
                  onClick: () => openOnboardingReviewDialog(ctx, currentOnboarding, {
                    horizon: onbHealth.overdueReviews[0]?.horizon || onbHealth.currentHorizon,
                  }),
                },
                `Log Day ${onbHealth.overdueReviews[0]?.horizon || onbHealth.currentHorizon} check-in`,
              )
            : null,
        ],
        body: h(
          'div',
          { class: 'stack-sm' },
          h(
            'div',
            { class: 'kv-row' },
            kv('Peer buddy', onbHealth.hasBuddy ? onbHealth.buddyDisplay : 'None assigned'),
            kv('Checkpoints', `${onbHealth.checkpointStats.done}/${onbHealth.checkpointStats.total} done`),
            kv('Introductions', `${onbHealth.stakeholderStats.met}/${onbHealth.stakeholderStats.total} met`),
            kv(
              'Check-ins held',
              [30, 60, 90].filter((hVal) => onbHealth.reviewStatus[hVal].held).map((hVal) => `Day ${hVal}`).join(', ') || 'None yet',
            ),
          ),
          currentOnboarding.earlyWin
            ? h('p', { class: 'small muted' }, h('strong', null, 'Early win: '), currentOnboarding.earlyWin)
            : null,
          onbHealth.scaffoldingGaps.length
            ? h('p', { class: 'note note-warn' }, `Scaffolding still owed: ${onbHealth.scaffoldingGaps.map((g) => g.evidence).join(' · ')}`)
            : null,
        ),
      })
    : newJoiner && person.status !== 'archived'
      ? card({
          title: 'Onboarding (30-60-90)',
          subtitle: `${tenure} days into the role · within ${state.settings.onboardingDays}-day onboarding window`,
          actions: [
            h(
              'button',
              {
                class: 'btn btn-small btn-primary',
                type: 'button',
                onClick: () => openOnboardingPlanDialog(ctx, { personId: person.id }),
              },
              'Start 30-60-90 plan',
            ),
          ],
          body: h(
            'p',
            { class: 'small muted' },
            'Steady-state goal and growth-plan reminders wait until onboarding ends. Capture role clarity, a peer buddy, stakeholder introductions and a scoped early win so the first 90 days do not run on memory.',
          ),
        })
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
    stat({
      label: 'Open actions',
      value: actions.length,
      hint: [
        actions.filter((a) => a.overdue).length ? `${actions.filter((a) => a.overdue).length} overdue` : 'none overdue',
        actions.filter((a) => a.carryCount > 0).length ? `${actions.filter((a) => a.carryCount > 0).length} carried forward` : null,
        actions.filter((a) => a.owner === 'leader' || a.owner === 'shared').length
          ? `${actions.filter((a) => a.owner === 'leader' || a.owner === 'shared').length} on you`
          : null,
      ].filter(Boolean).join(' · '),
      tone: actions.some((a) => a.overdue || a.carryCount >= 2) ? 'warn' : '',
    }),
    stat({ label: 'Delegated', value: delegations.filter((d) => d.status === 'active').length, hint: `${delegations.filter((d) => d.status === 'done').length} completed · ${delegations.filter((d) => d.status === 'returned').length} returned` }),
  );

  const talkingPoints = person.talkingPoints || [];
  const agendaCard = card({
    title: 'Prepared agenda for the next 1:1',
    subtitle: talkingPoints.length
      ? `${talkingPoints.length} topic${talkingPoints.length === 1 ? '' : 's'} they asked to raise, followed by items from their records.`
      : 'Built from this person’s open items. Each suggestion says why it is there.',
    body: h(
      'div',
      { class: 'stack-sm' },
      talkingPoints.length
        ? h(
            'div',
            { class: 'their-topics-box' },
            h(
              'div',
              { class: 'row-between' },
              h('span', { class: 'tiny uppercase muted' }, 'Topics they want to raise'),
              h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openPersonDialog(ctx, { person }) }, 'Edit topics'),
            ),
            h(
              'ul',
              { class: 'plain-list' },
              ...talkingPoints.map((topic) => h('li', null, h('strong', null, topic))),
            ),
          )
        : null,
      h(
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
    ),
    actions: [
      h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id, useFullAgenda: true }) }, 'Use this agenda'),
      h('a', { class: 'btn btn-small btn-ghost', href: `#/prep/${encodeURIComponent(person.id)}` }, 'Print prep sheet'),
    ],
  });

  const feedbackCard = card({
    title: 'Feedback',
    subtitle: `${fb.givenCount} given · ${fb.receivedCount} received · ${BALANCE_LABELS[fb.balance]}${fb.latencySamples ? ` · avg ${fb.averageLatency}d observed → discussed` : ' · latency unmeasured'}`,
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
      plan ? h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openGrowthReviewDialog(ctx, { plan }) }, 'Hold review') : null,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: person.id }) }, plan ? 'Edit plan' : 'Start plan'),
      plan ? h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Add action') : null,
    ].filter(Boolean),
    body: plan
      ? h(
          'div',
          { class: 'stack' },
          h('p', { class: 'prose' }, plan.goal),
          plan.reality ? h('p', { class: 'muted small' }, `Reality: ${plan.reality}`) : null,
          open.length
            ? h(
                'ul',
                { class: 'will-list' },
                ...open.map((action) => {
                  const delLink = linkedDelegationForWill(state, action, now);
                  return h(
                    'li',
                    { class: `will-row ${action.overdue ? 'is-late' : ''}` },
                    h(
                      'div',
                      { class: 'will-main' },
                      h(
                        'label',
                        { class: 'check-row' },
                        h('input', {
                          type: 'checkbox',
                          'aria-label': `Mark "${action.text}" as done`,
                          onChange: () => {
                            const result = ctx.api.toggleWillAction(plan.id, action.id);
                            if (!result.ok) toast(result.error, 'bad');
                          },
                        }),
                        h('span', { class: 'will-text' }, action.text),
                      ),
                      h(
                        'span',
                        { class: `will-meta tiny ${action.overdue ? 'text-bad' : 'muted'}` },
                        [
                          action.due ? `due ${formatDate(action.due, { withYear: false })}` : 'no date',
                          action.carryCount ? `carried ${action.carryCount}×` : null,
                          action.carryCount && action.firstAgreedOn ? `agreed ${formatDate(action.firstAgreedOn, { withYear: false })}` : null,
                        ].filter(Boolean).join(' · '),
                      ),
                      delLink
                        ? h(
                            'span',
                            { class: 'will-meta tiny' },
                            h(
                              'a',
                              { class: 'link', href: `#/delegations?delegation=${encodeURIComponent(delLink.delegation.id)}` },
                              `Delegated outcome: ${delLink.delegation.title} (${delLink.health.label}) →`,
                            ),
                          )
                        : null,
                      delLink?.awaitingReflection
                        ? h('p', { class: 'tiny good-text' }, `Delegated outcome completed ${formatDate(delLink.delegation.completedOn, { withYear: false })} — confirm what was learned before closing.`)
                        : delLink?.wasReturned
                          ? h('p', { class: 'tiny text-warn' }, `Delegation returned to leader ${formatDate(delLink.delegation.returnedOn, { withYear: false })} — re-scope or drop this commitment.`)
                          : null,
                    ),
                    h(
                      'div',
                      { class: 'will-side' },
                      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openCarryWillDialog(ctx, { plan, action }) }, 'Carry'),
                      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openDropWillDialog(ctx, { plan, action }) }, 'Drop'),
                    ),
                  );
                }),
              )
            : h('p', { class: 'tiny muted' }, 'No live commitments — the plan has nothing to move.'),
          h(
            'p',
            { class: 'tiny muted' },
            `Reviews held: ${plan.reviews?.length || 0}${lastReview(plan) ? ` · last ${formatDate(lastReview(plan).date)}` : ' — moving the date is not a review'}`,
          ),
          plan.options.length ? h('p', { class: 'muted small' }, `Options considered: ${plan.options.map((o) => o.text).join(' · ')}`) : null,
        )
      : emptyState({ title: 'No development plan', body: 'A GROW plan turns a vague intention into a dated commitment.', action: h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: person.id }) }, 'Start a plan') }),
  });

  const personHandoff = readiness.record?.seat
    ? transitionHandoff(state, person.id, readiness.record.seat, now, state.settings)
    : null;
  const readinessCard = card({
    title: 'Succession readiness',
    subtitle: readiness.record ? `${readiness.record.seat} · ${readiness.label}` : 'Not assessed',
    actions: [
      personHandoff?.canStartTransition
        ? h(
            'button',
            {
              class: 'btn btn-small btn-primary',
              type: 'button',
              onClick: () => openOnboardingPlanDialog(ctx, personHandoff.prefill),
            },
            'Start transition',
          )
        : null,
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openReadinessDialog(ctx, { personId: person.id, seat: readiness.record?.seat || person.role }) }, 'Assess'),
    ].filter(Boolean),
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
              meeting.actions.length
                ? h('p', { class: 'muted tiny' }, `Actions: ${meeting.actions.map((a) => {
                    const owner = a.owner === 'leader' ? ' (you)' : a.owner === 'shared' ? ' (shared)' : a.owner === 'them' ? ' (them)' : '';
                    const state = a.done ? ' ✓ done' : a.dropped ? ' ⊘ dropped' : a.carriedToMeetingId ? ' → carried forward' : '';
                    return `${a.text}${owner}${state}`;
                  }).join(' · ')}`)
                : null,
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

  const decisionsCard = personDecisions.length
    ? card({
        title: 'Decisions (DACI)',
        subtitle: `${personDecisions.length} decision${personDecisions.length === 1 ? '' : 's'} involving ${person.name}.`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/decisions' }, 'Decision log')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...personDecisions.slice(0, 6).map(({ decision, roles }) =>
            h(
              'li',
              null,
              h(
                'a',
                { class: 'link', href: `#/decisions?decision=${encodeURIComponent(decision.id)}` },
                decision.title,
              ),
              h('span', { class: 'muted tiny' }, ` · ${roles.join(', ')} · ${formatDate(decision.date, { withYear: false })} `),
              badge(decision.chosen ? 'decided' : 'open', decision.chosen ? 'good' : 'caution'),
            ),
          ),
        ),
      })
    : null;

  const personCases = openCasesForPerson(state, person.id, now);
  const casesCard = personCases.length
    ? card({
        title: 'Active operational cases (blameless support)',
        subtitle: `${personCases.length} open case${personCases.length === 1 ? '' : 's'} where ${person.name} needs air-cover, barrier removal, or capacity protection.`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/cases' }, 'All cases')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...personCases.map((item) =>
            h(
              'li',
              null,
              h('a', { class: 'link', href: `#/cases/${encodeURIComponent(item.caseRecord.id)}` }, item.caseRecord.title),
              h(
                'span',
                { class: 'muted tiny' },
                ` · ${item.caseRecord.ownerId === person.id ? 'Owner' : 'Involved'}${item.fmea.rated ? ` · RPN ${item.fmea.rpn}` : ''} `,
              ),
              item.fmea.rated
                ? badge(item.fmea.actionPriority.toUpperCase(), item.fmea.actionPriority === 'high' ? 'bad' : 'caution')
                : badge('FMEA not rated', 'caution'),
            ),
          ),
        ),
      })
    : null;

  const personChanges = openChangesForPerson(state, person.id, now);
  const changesCard = personChanges.length
    ? card({
        title: 'Active organizational changes & role transitions',
        subtitle: `${personChanges.length} open boundary/process change${personChanges.length === 1 ? '' : 's'} involving ${person.name}.`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/changes' }, 'All changes')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...personChanges.map((item) => {
            const imp = (item.change.impacts || []).find((i) => i.personId === person.id);
            return h(
              'li',
              null,
              h('a', { class: 'link', href: `#/changes/${encodeURIComponent(item.change.id)}` }, item.change.title),
              h(
                'span',
                { class: 'muted tiny' },
                ` · ${item.change.ownerId === person.id ? 'Owner' : imp?.newRoleLabel ? `Transition → ${imp.newRoleLabel}` : 'Impacted'} · Kotter ${item.kotter.completedCount}/8 `,
              ),
              badge(item.change.status, item.change.status === 'active' ? 'accent' : 'neutral'),
            );
          }),
        ),
      })
    : null;

  const personDeps = dependenciesForPerson(state, person.id, now);
  const resilienceCard = personDeps.length
    ? card({
        title: 'Operational stewardship & continuity',
        subtitle: `${personDeps.length} capability/vendor node${personDeps.length === 1 ? '' : 's'} stewarded by ${person.name}.`,
        actions: [h('a', { class: 'btn btn-small btn-ghost', href: '#/resilience' }, 'Resilience terminal')],
        body: h(
          'ul',
          { class: 'plain-list' },
          ...personDeps.map((d) =>
            h(
              'li',
              null,
              h('a', { class: 'link', href: `#/resilience/${encodeURIComponent(d.id)}` }, d.name),
              h('span', { class: 'muted tiny' }, ` · ${d.roleLabel} · ${d.criticality} `),
              badge(
                d.isSoleSteward ? 'Sole steward (BF 1)' : d.qualified ? `BF ${d.busFactor}` : 'In training',
                d.isSoleSteward ? 'warn' : d.qualified ? 'good' : 'caution',
              ),
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
    onboardingCard,
    statsRow,
    h('div', { class: 'grid grid-2' }, agendaCard, feedbackCard),
    h('div', { class: 'grid grid-2' }, goalsCard, growthCard),
    casesCard,
    changesCard,
    resilienceCard,
    h('div', { class: 'grid grid-2' }, readinessCard, findingsCard || decisionsCard || timelineCard),
    decisionsCard && findingsCard ? decisionsCard : null,
    findingsCard || decisionsCard ? timelineCard : null,
    meetingsCard,
  );
}

function habitButton(label, onClick) {
  return h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick }, label);
}
