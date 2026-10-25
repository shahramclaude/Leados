/**
 * app/views/goals.js — the goal portfolio.
 *
 * Every goal shows three things a status badge alone hides: measured progress,
 * progress *expected* at this point in time, and the last time a human looked
 * at it. A goal is only "on track" when the number agrees with the stated
 * confidence — where they disagree, the view says so.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, tabs } from '../ui/components.js';
import { progressBar } from '../ui/charts.js';
import { openGoalDialog, openCheckInDialog, openKeyResultDialog } from '../ui/modals.js';
import { activeGoals, goalHealth, goalProgress, formatKeyResult, goalsSummary } from '../core/domain/goals.js';
import { displayName } from '../core/domain/people.js';
import { formatDate } from '../core/time.js';

const HEALTH_TONE = { 'on-track': 'good', 'at-risk': 'warn', 'off-track': 'bad' };
const HEALTH_RANK = { 'off-track': 3, 'at-risk': 2, 'on-track': 1 };

export function renderGoals(ctx) {
  const { state, now } = ctx;
  const focusId = ctx.query.get('goal');
  const goals = focusId ? state.goals.filter((goal) => goal.id === focusId) : activeGoals(state);
  const summary = goalsSummary(state, now, state.settings);
  const filter = ctx.query.get('view') || 'all';

  const rows = goals
    .map((goal) => ({ goal, health: goalHealth(goal, now), owner: state.people.find((p) => p.id === goal.ownerId) || null }))
    .map((row) => ({ ...row, rank: (HEALTH_RANK[row.health.health] || 0) + (row.health.status === 'behind' || row.health.status === 'overdue' ? 1 : 0) }))
    .sort((a, b) => b.rank - a.rank || (a.health.progressPct ?? 0) - (b.health.progressPct ?? 0));

  const needsAttention = rows.filter((r) => r.health.status === 'behind' || r.health.status === 'overdue' || r.goal.confidence !== 'on-track');
  const filtered = rows.filter(({ goal, health }) => {
    if (filter === 'risk') return health.status === 'behind' || health.status === 'overdue' || goal.confidence !== 'on-track';
    if (filter === 'team') return !goal.ownerId;
    if (filter === 'done') return goal.status !== 'active';
    return true;
  });

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Goals',
      title: 'What the work is supposed to change',
      subtitle: 'Objectives with measurable key results. Without a number, progress can only be asserted — and assertive progress is how quarters disappear.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGoalDialog(ctx) }, 'Set a goal')],
    }),

    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Active', value: goals.length, hint: 'objectives in flight' }),
      stat({ label: 'On track', value: summary.onTrack, hint: 'number and pace agree', tone: summary.onTrack ? 'good' : '' }),
      stat({ label: 'At risk', value: summary.atRisk + summary.offTrack, hint: 'stated or measured', tone: summary.atRisk + summary.offTrack ? 'warn' : '' }),
      stat({ label: 'No key results', value: summary.noKr, hint: 'cannot be scored', tone: summary.noKr ? 'warn' : '' }),
      stat({ label: 'Check-in gap', value: summary.stale.length, hint: `older than ${state.settings.goalCheckinDays}d`, tone: summary.stale.length ? 'warn' : '' }),
      stat({
        label: 'Co-authored',
        value: summary.personOwned ? `${summary.coAuthored}/${summary.personOwned}` : '—',
        hint: `${summary.leaderAuthored} leader-set · ${summary.authorshipUnknown} unknown`,
        tone: summary.leaderAuthored ? 'warn' : summary.coAuthored ? 'good' : '',
      }),
    ),

    tabs({
      items: [
        { key: 'all', label: 'All goals', count: rows.length },
        { key: 'risk', label: 'Needs attention', count: needsAttention.length },
        { key: 'team', label: 'Team goals', count: rows.filter((r) => !r.goal.ownerId).length },
      ],
      active: filter,
      onSelect: (id) => ctx.navigate(`#/goals?view=${id}`),
      ariaLabel: 'Goal views',
    }),

    filtered.length
      ? h('div', { class: 'grid grid-2' }, ...filtered.map(({ goal, health, owner }) => goalCard(ctx, goal, health, owner, goal.id === focusId)))
      : emptyState({
          title: filter === 'all' ? 'No goals yet' : 'Nothing in this view',
          body:
            filter === 'all'
              ? 'A goal needs one objective and at least one number. Start with the outcome you would be embarrassed to discover was never defined.'
              : 'Switch back to all goals to see the full portfolio.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGoalDialog(ctx) }, 'Set a goal'),
        }),
  );
}

function goalCard(ctx, goal, health, owner, focused) {
  const progress = goalProgress(goal);
  const last = goal.checkins[goal.checkins.length - 1] || null;
  const overdue = health.status === 'overdue';

  return card({
    title: goal.title,
    subtitle: owner ? `${displayName(owner)} · due ${formatDate(goal.dueDate)}` : `Team goal · due ${formatDate(goal.dueDate)}`,
    className: focused ? 'is-focused' : '',
    actions: [
      goal.status === 'active'
        ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openCheckInDialog(ctx, { goal }) }, 'Check in')
        : badge('finished', 'neutral'),
    ],
    body: h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'goal-meta' },
        badge(`stated ${goal.confidence || 'on-track'}`, HEALTH_TONE[goal.confidence] || 'neutral'),
        overdue
          ? badge('past due', 'bad')
          : health.status === 'behind'
            ? badge(`${Math.abs(Math.round(health.gap ?? 0))}% behind pace`, 'warn')
            : health.status === 'ahead'
              ? badge(`${Math.round(health.gap ?? 0)}% ahead of pace`, 'good')
              : health.status === 'no-kr'
                ? badge('unmeasured', 'caution')
                : badge('on pace', 'good'),
        owner
          ? badge(goal.coAuthored === true ? 'co-authored' : goal.coAuthored === false ? 'leader-set' : 'authorship unknown', goal.coAuthored === true ? 'good' : goal.coAuthored === false ? 'warn' : 'neutral')
          : null,
        health.daysLeft !== null ? h('span', { class: 'muted tiny' }, health.daysLeft >= 0 ? `${health.daysLeft} days left` : `${Math.abs(health.daysLeft)} days over`) : null,
      ),

      health.mismatch
        ? h('p', { class: 'inline-note' }, 'You have marked this on track, but the numbers say otherwise. One of the two needs to change.')
        : null,
      goal.sourceReviewId
        ? h('p', { class: 'tiny muted' }, 'From completed review · ', h('a', { href: `#/reviews/${encodeURIComponent(goal.sourceReviewId)}` }, 'Open source review'))
        : null,

      h(
        'div',
        { class: 'progress-block' },
        h('div', { class: 'progress-head' }, h('span', null, 'Measured progress'), h('strong', null, progress === null ? '—' : `${progress}%`)),
        progressBar(progress, { label: `Progress on ${goal.title}`, tone: overdue || health.status === 'behind' ? 'bad' : undefined }),
        h('p', { class: 'muted tiny' }, `Expected by now: ${health.expectedPct === null ? '—' : `${health.expectedPct}%`}`),
      ),

      goal.keyResults.length
        ? h(
            'ul',
            { class: 'kr-list' },
            ...goal.keyResults.map((kr) =>
              h(
                'li',
                { class: 'kr-item' },
                h('span', { class: 'kr-label' }, formatKeyResult(kr)),
                h(
                  'span',
                  { class: 'kr-bar' },
                  progressBar(
                    kr.target === kr.start ? (kr.current === kr.target ? 100 : 0) : ((kr.current - kr.start) / (kr.target - kr.start)) * 100,
                    { label: formatKeyResult(kr), thin: true },
                  ),
                ),
              ),
            ),
          )
        : h(
            'div',
            { class: 'inline-warn' },
            h('p', null, 'No key results: this goal cannot be scored, so it is reported as unmeasured rather than as zero progress.'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openKeyResultDialog(ctx, { goalId: goal.id }) }, 'Add a key result'),
          ),

      last
        ? h(
            'div',
            { class: 'checkin' },
            h('p', { class: 'tiny muted' }, `Last check-in ${formatDate(last.date)} · ${last.confidence}`),
            last.note ? h('p', { class: 'checkin-note' }, last.note) : null,
          )
        : h('p', { class: 'tiny muted' }, 'No check-ins yet. A goal nobody revisits is a wish with a deadline.'),

      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openGoalDialog(ctx, { goal }) }, 'Edit goal'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openKeyResultDialog(ctx, { goalId: goal.id }) }, 'Add key result'),
        goal.status === 'active'
          ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openCheckInDialog(ctx, { goal }) }, 'Log a check-in')
          : null,
      ),
    ),
  });
}
