/**
 * app/views/onboarding.js — 30-60-90 scaffolding for new joiners and for
 * tenured people moving into a new role (promotion, lateral move, IC -> Lead).
 *
 * Turns the first 90 days in a role into observable manager commitments:
 * written role clarity, an assigned peer buddy, deliberate stakeholder
 * introductions, a scoped early win, and 30 / 60 / 90 checkpoints + two-way
 * check-in conversations. A role transition is anchored to the day the new
 * role starts and never touches the person's original start date. Never
 * invents a numeric ramp score or personality grade.
 */

import { h, toast, confirmDialog } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, personChip } from '../ui/components.js';
import {
  ONBOARDING_HORIZONS,
  CATEGORY_LABELS,
  KIND_LABELS,
  onboardingSummary,
} from '../core/domain/onboarding.js';
import { activePeople, personById, tenureDays } from '../core/domain/people.js';
import { formatDate } from '../core/time.js';
import {
  openOnboardingPlanDialog,
  openOnboardingCheckpointDialog,
  openOnboardingStakeholderDialog,
  openOnboardingReviewDialog,
  openPersonDialog,
} from '../ui/modals.js';

function renderStakeholdersSection(ctx, plan, health, readOnly) {
  const { items, met, total } = health.stakeholderStats;
  return h(
    'div',
    { class: 'onboarding-section' },
    h(
      'div',
      { class: 'onboarding-section-head' },
      h(
        'div',
        null,
        h('h3', { class: 'onboarding-subhead' }, 'Stakeholder introductions'),
        h('p', { class: 'muted tiny' }, total ? `${met} of ${total} introduction${total === 1 ? '' : 's'} made` : 'No cross-team or key stakeholder introductions mapped yet.'),
      ),
      !readOnly
        ? h(
            'button',
            {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => openOnboardingStakeholderDialog(ctx, plan),
            },
            'Add stakeholder',
          )
        : null,
    ),
    items.length
      ? h(
          'ul',
          { class: 'onboarding-list' },
          ...items.map((item) =>
            h(
              'li',
              { class: 'onboarding-item' },
              h(
                'label',
                { class: 'check onboarding-check' },
                h('input', {
                  type: 'checkbox',
                  checked: item.met,
                  disabled: readOnly,
                  onChange: (ev) => {
                    const res = ctx.api.toggleOnboardingStakeholder(plan.id, item.id, { met: ev.target.checked });
                    if (!res.ok) toast(res.error, 'bad');
                  },
                }),
                h(
                  'span',
                  { class: item.met ? 'onboarding-done-text' : '' },
                  h('strong', null, item.name),
                  item.purpose ? ` — ${item.purpose}` : '',
                ),
              ),
              h(
                'div',
                { class: 'onboarding-item-meta' },
                item.met
                  ? badge(item.metOn ? `Met ${formatDate(item.metOn, { withYear: false })}` : 'Met', 'good')
                  : badge('Pending intro', 'neutral'),
                !readOnly
                  ? h(
                      'button',
                      {
                        class: 'btn btn-small btn-ghost',
                        type: 'button',
                        'aria-label': `Remove introduction to ${item.name}`,
                        onClick: () => {
                          const res = ctx.api.removeOnboardingStakeholder(plan.id, item.id);
                          if (!res.ok) toast(res.error, 'bad');
                        },
                      },
                      'Remove',
                    )
                  : null,
              ),
            ),
          ),
        )
      : null,
  );
}

function renderHorizonPanel(ctx, plan, health, horizon, readOnly) {
  const group = health.checkpointStats.byHorizon[horizon];
  const rev = health.reviewStatus[horizon];
  const revBadge = rev.state === 'done'
    ? badge(`Held ${formatDate(rev.heldOn, { withYear: false })}`, 'good')
    : rev.state === 'overdue'
      ? badge(`Check-in overdue (due ${formatDate(rev.dueOn, { withYear: false })})`, 'bad')
      : rev.state === 'due-soon'
        ? badge(`Due ${formatDate(rev.dueOn, { withYear: false })}`, 'warn')
        : badge(`Target ${formatDate(rev.dueOn, { withYear: false })}`, 'neutral');

  return h(
    'div',
    { class: `onboarding-horizon ${health.currentHorizon === horizon && plan.status === 'active' ? 'is-current' : ''}` },
    h(
      'div',
      { class: 'onboarding-horizon-head' },
      h(
        'div',
        null,
        h('h3', { class: 'onboarding-horizon-title' }, group.label),
        h('p', { class: 'muted tiny' }, group.subtitle),
      ),
      h(
        'div',
        { class: 'onboarding-horizon-badges' },
        badge(`${group.done}/${group.total} checkpoints`, group.overdue > 0 ? 'bad' : group.total > 0 && group.done === group.total ? 'good' : 'neutral'),
        !readOnly
          ? h(
              'button',
              {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                onClick: () => openOnboardingCheckpointDialog(ctx, plan, { horizon }),
              },
              `+ Day ${horizon} checkpoint`,
            )
          : null,
      ),
    ),
    group.items.length
      ? h(
          'ul',
          { class: 'onboarding-list' },
          ...group.items.map((cp) =>
            h(
              'li',
              { class: `onboarding-item ${cp.overdue ? 'is-overdue' : ''}` },
              h(
                'label',
                { class: 'check onboarding-check' },
                h('input', {
                  type: 'checkbox',
                  checked: cp.done,
                  disabled: readOnly,
                  onChange: (ev) => {
                    const res = ctx.api.toggleOnboardingCheckpoint(plan.id, cp.id, { done: ev.target.checked });
                    if (!res.ok) toast(res.error, 'bad');
                  },
                }),
                h(
                  'span',
                  { class: cp.done ? 'onboarding-done-text' : '' },
                  cp.title,
                  cp.notes ? h('span', { class: 'muted tiny onboarding-note' }, ` · ${cp.notes}`) : null,
                ),
              ),
              h(
                'div',
                { class: 'onboarding-item-meta' },
                badge(CATEGORY_LABELS[cp.category] || cp.category, 'neutral'),
                cp.done
                  ? badge(cp.completedOn ? `Done ${formatDate(cp.completedOn, { withYear: false })}` : 'Done', 'good')
                  : cp.overdue
                    ? badge(`Overdue (${formatDate(cp.due, { withYear: false })})`, 'bad')
                    : cp.due
                      ? h('span', { class: 'muted tiny' }, `Due ${formatDate(cp.due, { withYear: false })}`)
                      : null,
                !readOnly
                  ? h(
                      'button',
                      {
                        class: 'btn btn-small btn-ghost',
                        type: 'button',
                        'aria-label': `Remove checkpoint: ${cp.title}`,
                        onClick: () => {
                          const res = ctx.api.removeOnboardingCheckpoint(plan.id, cp.id);
                          if (!res.ok) toast(res.error, 'bad');
                        },
                      },
                      'Remove',
                    )
                  : null,
              ),
            ),
          ),
        )
      : h('p', { class: 'muted small' }, `No Day ${horizon} checkpoints listed yet.`),
    h(
      'div',
      { class: `onboarding-review-box ${rev.state === 'overdue' ? 'is-overdue' : rev.state === 'done' ? 'is-done' : ''}` },
      h(
        'div',
        { class: 'onboarding-review-head' },
        h('strong', { class: 'small' }, `Day ${horizon} check-in conversation`),
        h(
          'div',
          { class: 'onboarding-item-meta' },
          revBadge,
          !readOnly
            ? h(
                'button',
                {
                  class: `btn btn-small ${rev.state === 'overdue' || rev.state === 'due-soon' ? 'btn-primary' : 'btn-ghost'}`,
                  type: 'button',
                  onClick: () => openOnboardingReviewDialog(ctx, plan, { horizon }),
                },
                rev.held ? `Edit Day ${horizon} check-in` : `Log Day ${horizon} check-in`,
              )
            : null,
        ),
      ),
      rev.held
        ? h(
            'div',
            { class: 'onboarding-review-notes' },
            h('p', { class: 'small prose' }, rev.summary),
            rev.blockers
              ? h('p', { class: 'tiny muted' }, h('strong', null, 'Blockers / support needed: '), rev.blockers)
              : null,
          )
        : h(
            'p',
            { class: 'tiny muted' },
            horizon === 30
              ? 'Check role clarity, buddy connection and month-one surprises.'
              : horizon === 60
                ? 'Review early-win progress and exchange two-way calibration feedback.'
                : 'Confirm autonomous ownership and hand off to steady-state goals and a GROW plan.',
          ),
    ),
  );
}

function renderPlanCard(ctx, row) {
  const { plan, health } = row;
  const person = health.person || personById(ctx.state, plan.personId);
  const readOnly = plan.status !== 'active';
  const kindNoun = health.isTransition ? 'role transition' : 'onboarding';
  const dayLabel = health.dayNumber === null
    ? 'Start date unknown'
    : health.dayNumber < 0
      ? `Starts in ${Math.abs(health.dayNumber)}d (${formatDate(plan.startDate)})`
      : `Day ${health.dayNumber} · started ${formatDate(plan.startDate)}`;
  const subtitle = health.isTransition
    ? [health.label ? `New scope: ${health.label}` : 'Role transition', dayLabel].filter(Boolean).join(' · ')
    : [person?.role, health.label || '', dayLabel].filter(Boolean).join(' · ');

  const completeAction = plan.status === 'active'
    ? h(
        'button',
        {
          class: `btn btn-small ${health.readyToGraduate ? 'btn-primary' : 'btn-ghost'}`,
          type: 'button',
          disabled: !health.canComplete,
          title: health.canComplete
            ? `Mark 30-60-90 ${kindNoun} complete`
            : `Log the Day 90 check-in conversation before completing this ${kindNoun}`,
          onClick: () => {
            confirmDialog({
              title: `Complete 30-60-90 ${kindNoun} for ${person?.name || 'this person'}?`,
              message: health.checkpointStats.open > 0 || health.stakeholderStats.unmet > 0
                ? `${health.checkpointStats.open} checkpoint(s) and ${health.stakeholderStats.unmet} introduction(s) are still unchecked. Completing freezes this plan until reopened.`
                : 'Day 90 check-in is recorded and all checkpoints/introductions are complete.',
              confirmLabel: 'Complete plan',
              onConfirm: () => {
                const res = ctx.api.completeOnboardingPlan(plan.id);
                if (res.ok) toast(`30-60-90 ${kindNoun} completed`, 'good');
                else toast(res.error, 'bad');
              },
            });
          },
        },
        'Complete plan',
      )
    : h(
        'button',
        {
          class: 'btn btn-small btn-ghost',
          type: 'button',
          onClick: () => {
            const res = ctx.api.reopenOnboardingPlan(plan.id);
            if (res.ok) toast('Onboarding plan reopened', 'good');
            else toast(res.error, 'bad');
          },
        },
        'Reopen plan',
      );

  return card({
    className: 'onboarding-card',
    title: person ? person.name : 'Unknown person',
    subtitle,
    actions: [
      badge(KIND_LABELS[health.kind] || KIND_LABELS['new-hire'], 'neutral'),
      badge(health.statusLabel, health.statusTone),
      person
        ? h('a', { class: 'btn btn-small btn-ghost', href: `#/people/${encodeURIComponent(person.id)}` }, 'Person page')
        : null,
      person
        ? h('a', { class: 'btn btn-small btn-ghost', href: `#/prep/${encodeURIComponent(person.id)}` }, '1:1 prep sheet')
        : null,
      !readOnly
        ? h(
            'button',
            {
              class: 'btn btn-small btn-ghost',
              type: 'button',
              onClick: () => openOnboardingPlanDialog(ctx, { plan }),
            },
            'Edit scaffolding',
          )
        : null,
      completeAction,
    ],
    body: h(
      'div',
      { class: 'onboarding-body' },
      health.scaffoldingGaps.length > 0
        ? h(
            'div',
            { class: 'note note-warn' },
            h('strong', null, 'Scaffolding still owed by you: '),
            health.scaffoldingGaps.map((g) => g.evidence).join(' · '),
          )
        : null,
      h(
        'div',
        { class: 'onboarding-scaffolding-grid' },
        h(
          'div',
          { class: 'onboarding-scaffolding-cell' },
          h('span', { class: 'kv-label' }, 'Role clarity & 90-day expectations'),
          plan.roleClarity
            ? h('p', { class: 'small prose' }, plan.roleClarity)
            : h('p', { class: 'small muted' }, 'Not written down yet — capture what they own and what good looks like.'),
        ),
        h(
          'div',
          { class: 'onboarding-scaffolding-cell' },
          h('span', { class: 'kv-label' }, 'Scoped early win (~Day 60)'),
          plan.earlyWin
            ? h('p', { class: 'small prose' }, plan.earlyWin)
            : h('p', { class: 'small muted' }, 'No early win defined yet.'),
        ),
        h(
          'div',
          { class: 'onboarding-scaffolding-cell' },
          h('span', { class: 'kv-label' }, 'Peer buddy'),
          health.buddyPerson
            ? personChip(health.buddyPerson, {
                sub: health.buddyPerson.role || 'Roster buddy',
                onClick: () => ctx.navigate(`#/people/${encodeURIComponent(health.buddyPerson.id)}`),
              })
            : health.hasBuddy
              ? h('p', { class: 'small prose' }, health.buddyDisplay)
              : h('p', { class: 'small muted' }, 'None assigned yet.'),
        ),
      ),
      renderStakeholdersSection(ctx, plan, health, readOnly),
      h(
        'div',
        { class: 'onboarding-horizons' },
        ...ONBOARDING_HORIZONS.map((horizon) => renderHorizonPanel(ctx, plan, health, horizon, readOnly)),
      ),
    ),
  });
}

export function renderOnboarding(ctx) {
  const { state, now } = ctx;
  const people = activePeople(state);
  const summary = onboardingSummary(state, now, state.settings);

  const requestedFilter = ctx.query.get('status');
  const filter = ['active', 'attention', 'completed', 'all'].includes(requestedFilter) ? requestedFilter : 'active';
  const personFilter = ctx.query.get('person') || '';
  const filteredPerson = personFilter ? personById(state, personFilter) : null;

  const setFilter = (nextStatus) => {
    const params = new URLSearchParams();
    if (nextStatus && nextStatus !== 'active') params.set('status', nextStatus);
    if (personFilter) params.set('person', personFilter);
    const qs = params.toString();
    ctx.navigate(qs ? `#/onboarding?${qs}` : '#/onboarding');
  };

  const visibleRows = summary.rows.filter((row) => {
    if (personFilter && row.plan.personId !== personFilter) return false;
    if (filter === 'all') return true;
    if (filter === 'completed') return row.plan.status === 'completed';
    if (filter === 'attention') {
      return row.plan.status === 'active' && (row.health.statusTone === 'bad' || row.health.statusTone === 'warn');
    }
    return row.plan.status === 'active';
  });

  const unstarted = personFilter
    ? summary.unstartedJoiners.filter((p) => p.id === personFilter)
    : summary.unstartedJoiners;

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'First 90 days in a role',
      title: 'Onboarding & transitions (30-60-90)',
      subtitle: 'Explicit role clarity, peer buddy, stakeholder introductions and 30/60/90 checkpoints — manager scaffolding for new joiners and for people moving into a new role, never a personality or performance grade.',
      actions: [
        people.length
          ? h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                onClick: () => openOnboardingPlanDialog(ctx, { personId: personFilter || unstarted[0]?.id || null }),
              },
              'Start 30-60-90 plan',
            )
          : h(
              'button',
              {
                class: 'btn btn-primary',
                type: 'button',
                onClick: () => openPersonDialog(ctx),
              },
              'Add a person first',
            ),
      ],
    }),

    personFilter
      ? banner({
          tone: 'info',
          title: filteredPerson ? `Filtered to ${filteredPerson.name}` : 'Filtered to one person',
          body: 'Showing 30-60-90 plans for this team member.',
          actions: [
            h('a', { class: 'btn btn-small btn-ghost', href: '#/onboarding' }, 'Show everyone'),
          ],
        })
      : null,

    unstarted.length
      ? banner({
          tone: 'caution',
          title: `${unstarted.length} recent joiner${unstarted.length === 1 ? ' has' : 's have'} no 30-60-90 onboarding plan`,
          body: `${unstarted.map((p) => `${p.name} (day ${tenureDays(p, now)})`).join(', ')}. Steady-state goal and growth reminders pause during the ${state.settings.onboardingDays}-day onboarding window, so start an explicit plan instead of relying on memory.`,
          actions: unstarted.slice(0, 3).map((p) =>
            h(
              'button',
              {
                class: 'btn btn-small btn-primary',
                type: 'button',
                onClick: () => openOnboardingPlanDialog(ctx, { personId: p.id }),
              },
              `Start plan for ${p.name}`,
            ),
          ),
        })
      : null,

    h(
      'div',
      { class: 'stat-row' },
      stat({
        label: 'Active plans',
        value: summary.activeCount,
        hint: summary.activeCount
          ? `${summary.activeNewHireCount} onboarding · ${summary.activeTransitionCount} transition${summary.activeTransitionCount === 1 ? '' : 's'}`
          : `across ${state.settings.onboardingDays}-day window`,
      }),
      stat({
        label: 'Needs attention',
        value: summary.attentionCount,
        hint: summary.overdueCount ? `${summary.overdueCount} with overdue items` : 'scaffolding & due dates',
        tone: summary.overdueCount > 0 ? 'bad' : summary.attentionCount > 0 ? 'warn' : 'good',
      }),
      stat({
        label: 'Joiners without plan',
        value: summary.unstartedJoiners.length,
        hint: 'within onboarding window',
        tone: summary.unstartedJoiners.length > 0 ? 'warn' : 'good',
      }),
      stat({
        label: 'Completed',
        value: summary.completedCount,
        hint: 'graduated to steady state',
      }),
    ),

    tabs({
      ariaLabel: 'Filter 30-60-90 plans',
      active: filter,
      onSelect: setFilter,
      items: [
        { key: 'active', label: 'Active', count: summary.activeCount },
        { key: 'attention', label: 'Needs attention', count: summary.attentionCount },
        { key: 'completed', label: 'Completed', count: summary.completedCount },
        { key: 'all', label: 'All', count: summary.rows.length },
      ],
    }),

    visibleRows.length
      ? h('div', { class: 'stack' }, ...visibleRows.map((row) => renderPlanCard(ctx, row)))
      : card({
          title: '30-60-90 plans',
          body: emptyState({
            title: !people.length
              ? 'No team members yet'
              : filter === 'completed'
                ? 'No completed 30-60-90 plans yet'
                : filter === 'attention'
                  ? 'No active 30-60-90 plans need attention'
                  : 'No active 30-60-90 plans',
            body: !people.length
              ? 'Add the people you lead first, then start a 30-60-90 plan for anyone joining or changing roles.'
              : 'Start a 30-60-90 plan when someone joins the team or transitions into a new role so role clarity, buddy support, stakeholder introductions and check-ins are explicit.',
            action: people.length
              ? h(
                  'button',
                  {
                    class: 'btn btn-primary',
                    type: 'button',
                    onClick: () => openOnboardingPlanDialog(ctx, { personId: personFilter || unstarted[0]?.id || null }),
                  },
                  'Start 30-60-90 plan',
                )
              : h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openPersonDialog(ctx) }, 'Add a person'),
          }),
        }),
  );
}
