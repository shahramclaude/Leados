/**
 * app/views/growth.js — GROW plans and the competency map.
 *
 * The page refuses to call a plan "healthy" just because it exists. A plan is
 * scored on how far down GROW it actually travelled, and on whether it ends in
 * a dated commitment rather than an aspiration.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, personChip } from '../ui/components.js';
import { openGrowthPlanDialog, openWillActionDialog } from '../ui/modals.js';
import { GROW_STAGES, COMPETENCIES, planHealth, competencyGaps, stagnationDays } from '../core/domain/growth.js';
import { activePeople } from '../core/domain/people.js';
import { formatDate } from '../core/time.js';

const HEALTH_TONE = { healthy: 'good', incomplete: 'warn', attention: 'bad' };

export function renderGrowth(ctx) {
  const { state, now } = ctx;
  const plans = state.growthPlans
    .filter((p) => p.status === 'active')
    .map((plan) => ({ plan, health: planHealth(plan, now), person: state.people.find((p) => p.id === plan.personId) || null }))
    .sort((a, b) => (a.health.health === 'attention' ? -1 : 1) - (b.health.health === 'attention' ? -1 : 1));

  const gaps = competencyGaps(state);
  const people = activePeople(state);
  const coverage = people.length ? Math.round((people.filter((p) => plans.some((row) => row.person?.id === p.id)).length / people.length) * 100) : 0;

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Growth',
      title: 'Development that ends in a dated action',
      subtitle: 'GROW: Goal, Reality, Options, Will. A plan that stops at "get better at X" has not been made yet — it has been named.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGrowthPlanDialog(ctx) }, 'Start a plan')],
    }),

    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Active plans', value: plans.length, hint: `${coverage}% of the team`, tone: coverage < 50 ? 'warn' : 'good' }),
      stat({ label: 'Ending in a commitment', value: plans.filter((p) => p.plan.will?.length).length, hint: 'with a dated action' }),
      stat({ label: 'Needing attention', value: plans.filter((p) => p.health.health === 'attention').length, hint: 'overdue or uncommitted', tone: plans.some((p) => p.health.health === 'attention') ? 'bad' : '' }),
      stat({ label: 'Unmapped skills', value: gaps.uncovered.length, hint: `of ${COMPETENCIES.length} competencies`, tone: gaps.uncovered.length ? 'warn' : 'good' }),
    ),

    plans.length
      ? h('div', { class: 'grid grid-2' }, ...plans.map(({ plan, health, person }) => planCard(ctx, plan, health, person)))
      : emptyState({
          title: 'No development plans yet',
          body: 'Growth is the dimension leaders skip, and the one people leave over. Start with one person and one skill, and finish the Will stage — a dated action they own.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGrowthPlanDialog(ctx) }, 'Start a plan'),
        }),

    card({
      title: 'Competency coverage',
      subtitle: 'Which capabilities someone is actively developing. Blank rows are not failures — but fifteen blanks is a strategy.',
      body: h(
        'div',
        { class: 'competency-grid' },
        ...gaps.rows.map((row) =>
          h(
            'div',
            { class: `competency ${row.count ? 'is-covered' : 'is-empty'}` },
            h('span', { class: 'competency-name' }, row.name),
            row.count
              ? h('span', { class: 'competency-people' }, row.people.join(', '))
              : h('span', { class: 'muted tiny' }, 'nobody developing this'),
          ),
        ),
      ),
    }),

    gaps.peopleWithoutPlan.length
      ? card({
          title: 'No plan at all',
          subtitle: 'Every person below has a start date older than the onboarding window and no active development plan.',
          body: h(
            'ul',
            { class: 'list' },
            ...gaps.peopleWithoutPlan.map((person) =>
              h(
                'li',
                { class: 'list-row' },
                personChip(person, { sub: person.role || null }),
                h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { personId: person.id }) }, 'Start a plan'),
              ),
            ),
          ),
        })
      : null,
  );
}

function planCard(ctx, plan, health, person) {
  const { now } = ctx;
  const stagnant = stagnationDays(plan, now);
  return card({
    title: person ? person.name : 'Unassigned plan',
    subtitle: person?.role || null,
    actions: [badge(health.health, HEALTH_TONE[health.health] || 'neutral')],
    body: h(
      'div',
      { class: 'stack' },

      h(
        'div',
        { class: 'grow-steps' },
        ...GROW_STAGES.map((stage, index) => {
          const met = health.completeness.stages[index]?.met;
          return h(
            'div',
            { class: `grow-step ${met ? 'is-met' : ''}` },
            h('span', { class: 'grow-step-dot', 'aria-hidden': 'true' }, met ? '✓' : String(index + 1)),
            h('div', null, h('p', { class: 'grow-step-label' }, stage.label), h('p', { class: 'grow-step-q tiny' }, stage.question)),
            h('span', { class: 'sr-only' }, met ? 'complete' : 'not yet filled in'),
          );
        }),
      ),

      h('p', { class: 'plan-goal' }, plan.goal || 'No goal written yet.'),
      plan.competencies?.length ? h('div', { class: 'tag-row' }, ...plan.competencies.map((c) => h('span', { class: 'tag' }, c))) : null,

      health.issues.length
        ? h('ul', { class: 'issue-list' }, ...health.issues.map((issue) => h('li', null, issue)))
        : h('p', { class: 'tiny good-text' }, 'All four GROW stages are filled and every action has a date.'),

      plan.will?.length
        ? h(
            'ul',
            { class: 'will-list' },
            ...plan.will.map((action) =>
              h(
                'li',
                { class: `will-row ${action.done ? 'is-done' : ''}` },
                h(
                  'label',
                  { class: 'check-row' },
                  h('input', {
                    type: 'checkbox',
                    checked: action.done ? 'checked' : null,
                    onChange: () => {
                      const result = ctx.api.toggleWillAction(plan.id, action.id);
                      if (!result.ok) toast(result.error, 'bad');
                    },
                    'aria-label': `Mark "${action.text}" as ${action.done ? 'not done' : 'done'}`,
                  }),
                  h('span', null, action.text),
                ),
                h('span', { class: 'muted tiny' }, action.due ? formatDate(action.due, { withYear: false }) : 'no date'),
              ),
            ),
          )
        : h(
            'div',
            { class: 'inline-warn' },
            h('p', null, 'No committed action. Without one, this plan is a conversation, not a plan.'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Commit to an action'),
          ),

      h(
        'div',
        { class: 'card-actions' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Add action'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { plan }) }, 'Edit plan'),
        stagnant !== null && stagnant > 30 ? badge(`${stagnant}d unchanged`, 'warn') : null,
      ),

      health.review.state !== 'none'
        ? h('p', { class: 'tiny muted' }, `Review ${health.review.state === 'overdue' ? 'was due' : 'is due'} ${formatDate(plan.reviewOn)}`)
        : h('p', { class: 'tiny muted' }, 'No review date — a plan without a review is a file, not a process.'),
    ),
  });
}
