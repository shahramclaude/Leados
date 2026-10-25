/**
 * app/views/growth.js — GROW plans and the competency map.
 *
 * The page refuses to call a plan "healthy" just because it exists. A plan is
 * scored on how far down GROW it actually travelled, and on whether it ends in
 * a dated commitment rather than an aspiration.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, emptyState, personChip } from '../ui/components.js';
import {
  openGrowthPlanDialog,
  openWillActionDialog,
  openCarryWillDialog,
  openDropWillDialog,
  openGrowthReviewDialog,
} from '../ui/modals.js';
import {
  GROW_STAGES,
  planHealth,
  competencyGaps,
  stagnationDays,
  openWillActions,
  carriedWillActions,
  reviewHistory,
  reviewedIn,
  linkedDelegationForWill,
} from '../core/domain/growth.js';
import { activePeople } from '../core/domain/people.js';
import { formatDate } from '../core/time.js';

const HEALTH_TONE = { healthy: 'good', incomplete: 'warn', attention: 'bad' };

export function renderGrowth(ctx) {
  const { state, now } = ctx;
  const planFilter = ctx.query.get('plan');
  const plans = state.growthPlans
    .filter((p) => planFilter ? p.id === planFilter : p.status === 'active')
    .map((plan) => ({ plan, health: planHealth(plan, now), person: state.people.find((p) => p.id === plan.personId) || null }))
    .sort((a, b) => (a.health.health === 'attention' ? -1 : 1) - (b.health.health === 'attention' ? -1 : 1));

  const gaps = competencyGaps(state);
  const people = activePeople(state);
  const openTotal = plans.reduce((sum, row) => sum + openWillActions(row.plan, now).length, 0);
  const overdueTotal = plans.reduce((sum, row) => sum + openWillActions(row.plan, now).filter((a) => a.overdue).length, 0);
  const carriedTotal = plans.reduce((sum, row) => sum + carriedWillActions(row.plan, now).length, 0);
  const reviewsTotal = plans.reduce((sum, row) => sum + (row.plan.reviews?.length || 0), 0);
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
      stat({
        label: 'Open commitments',
        value: openTotal,
        hint: overdueTotal ? `${overdueTotal} past due` : 'all still in time',
        tone: overdueTotal ? 'warn' : 'good',
      }),
      stat({
        label: 'Carried forward',
        value: carriedTotal,
        hint: carriedTotal ? 'moved at least once' : 'nothing has slipped',
        tone: carriedTotal ? 'warn' : 'good',
      }),
      stat({
        label: 'Reviews held',
        value: reviewsTotal,
        hint: reviewsTotal ? `across ${plans.filter((p) => p.health.review.reviewCount).length} plan(s)` : 'a date is not a review',
        tone: reviewsTotal ? 'good' : 'warn',
      }),
      stat({ label: 'Needing attention', value: plans.filter((p) => p.health.health === 'attention').length, hint: 'overdue or uncommitted', tone: plans.some((p) => p.health.health === 'attention') ? 'bad' : '' }),
    ),

    planFilter
      ? h('p', { class: 'filter-note' }, `${plans.length} matching plan${plans.length === 1 ? '' : 's'}. `, h('a', { href: '#/growth' }, 'Clear filter'))
      : null,

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
  const open = openWillActions(plan, now);
  const will = plan.will || [];
  // A carried original is retired, not unfinished: it is replaced by the clone
  // that now owns the due date. Showing it in the open list would double-count
  // the same promise; hiding it entirely would erase the fact that it moved.
  const retired = will.filter((a) => a.carriedToId);
  const settled = will.filter((a) => a.done || a.dropped);
  const byId = new Map(will.map((a) => [a.id, a]));
  const reviews = reviewHistory(plan);
  const review = health.review;
  const reviewDue = review.state === 'overdue' || review.state === 'soon';

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

      open.length
        ? h('ul', { class: 'will-list' }, ...open.map((action) => openWillRow(ctx, plan, action)))
        : h(
            'div',
            { class: 'inline-warn' },
            h('p', null, will.length ? 'No live commitment. Everything on this plan is closed or was dropped — the next step needs a new dated action.' : 'No committed action. Without one, this plan is a conversation, not a plan.'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Commit to an action'),
          ),

      retired.length
        ? h(
            'p',
            { class: 'tiny muted' },
            `${retired.length} earlier ${retired.length === 1 ? 'version' : 'versions'} of carried commitments are kept in the plan record.`,
          )
        : null,

      retired.length || settled.length
        ? h(
            'details',
            { class: 'will-history' },
            h('summary', null, `Closed and moved commitments (${retired.length + settled.length})`),
            h(
              'ul',
              { class: 'will-list' },
              ...retired.map((action) => {
                const next = action.carriedToId ? byId.get(action.carriedToId) : null;
                const meta = [];
                if (action.addedOn) meta.push(`agreed ${formatDate(action.addedOn, { withYear: false })}`);
                if (action.due) meta.push(`was due ${formatDate(action.due, { withYear: false })}`);
                meta.push('carried forward');
                return h(
                  'li',
                  { class: 'will-row is-closed' },
                  h(
                    'div',
                    { class: 'will-main' },
                    h('span', { class: 'will-text' }, action.text),
                    h('span', { class: 'will-meta tiny muted' }, meta.join(' · ')),
                  ),
                  h('span', { class: 'tiny muted' }, next?.due ? `now due ${formatDate(next.due, { withYear: false })}` : 'replaced'),
                );
              }),
              ...settled.map((action) =>
                h(
                  'li',
                  { class: `will-row is-closed ${action.done ? 'is-done' : ''}` },
                  h(
                    'div',
                    { class: 'will-main' },
                    h('span', { class: 'will-text' }, action.text),
                    h('span', { class: 'will-meta tiny muted' }, action.done
                      ? `done${action.completedOn ? ` ${formatDate(action.completedOn, { withYear: false })}` : ''}${action.completedInReviewId ? ' · in a review' : ''}`
                      : `dropped${action.droppedOn ? ` ${formatDate(action.droppedOn, { withYear: false })}` : ''}${action.droppedInReviewId ? ' · in a review' : ''}${action.droppedReason ? ` — ${action.droppedReason}` : ''}`),
                  ),
                  h('span', { class: 'tiny muted' }, action.done ? '✓' : '—'),
                ),
              ),
            ),
          )
        : null,

      reviewBlock(ctx, plan, review, reviews),

      h(
        'div',
        { class: 'card-actions' },
        h(
          'button',
          {
            class: `btn btn-sm ${reviewDue ? 'btn-primary' : 'btn-ghost'}`,
            type: 'button',
            onClick: () => openGrowthReviewDialog(ctx, { plan }),
          },
          'Hold review',
        ),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openWillActionDialog(ctx, { planId: plan.id }) }, 'Add action'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openGrowthPlanDialog(ctx, { plan }) }, 'Edit plan'),
        stagnant !== null && stagnant > 30 ? badge(`${stagnant}d unchanged`, 'warn') : null,
      ),
    ),
  });
}

/** One live commitment: settle it, move it, or drop it — but decide. */
function openWillRow(ctx, plan, action) {
  const delLink = linkedDelegationForWill(ctx.state, action, ctx.now);
  const meta = [];
  if (action.carryCount) meta.push(`carried ${action.carryCount}×`);
  if (action.carryCount && action.firstAgreedOn) meta.push(`agreed ${formatDate(action.firstAgreedOn, { withYear: false })}`);
  if (action.due) {
    meta.push(action.overdue
      ? `${Math.abs(action.daysUntilDue)}d overdue (was ${formatDate(action.due, { withYear: false })})`
      : `due ${formatDate(action.due, { withYear: false })}`);
  } else {
    meta.push('no due date');
  }

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
      h('span', { class: `will-meta tiny ${action.overdue ? 'text-bad' : 'muted'}` }, meta.join(' · ')),
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
        ? h('p', { class: 'tiny good-text' }, `Delegated outcome completed ${formatDate(delLink.delegation.completedOn, { withYear: false })} — confirm what was learned before closing this commitment.`)
        : delLink?.wasReturned
          ? h('p', { class: 'tiny text-warn' }, `Delegation returned to leader ${formatDate(delLink.delegation.returnedOn, { withYear: false })} — re-scope or drop this commitment.`)
          : null,
      action.carryCount >= 2
        ? h('p', { class: 'tiny text-warn' }, 'This has moved twice. Either it is not the real next step, or the date was never realistic — say which in the review.')
        : null,
    ),
    h(
      'div',
      { class: 'will-side' },
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openCarryWillDialog(ctx, { plan, action }) }, 'Carry'),
      h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openDropWillDialog(ctx, { plan, action }) }, 'Drop'),
    ),
  );
}

/** Review date, the record of what was discussed, and the way in. */
function reviewBlock(ctx, plan, review, reviews) {
  const line =
    review.state === 'overdue'
      ? `Review was due ${formatDate(plan.reviewOn)} — ${Math.abs(review.daysUntil)}d ago`
      : review.state === 'soon'
        ? `Review due ${formatDate(plan.reviewOn, { withYear: false })} — in ${review.daysUntil}d`
        : review.state === 'scheduled'
          ? `Next review ${formatDate(plan.reviewOn)}`
          : 'No review scheduled — a plan without a review is a file, not a process.';

  return h(
    'div',
    { class: 'review-block' },
    h(
      'div',
      { class: 'review-head' },
      h('span', { class: `review-when ${review.state === 'overdue' ? 'text-bad' : review.state === 'soon' ? 'text-warn' : ''}` }, line),
      review.lastReviewedOn ? h('span', { class: 'tiny muted' }, `last held ${formatDate(review.lastReviewedOn)}`) : null,
    ),
    review.deferrals
      ? h('p', { class: 'tiny text-warn' }, `The review date has moved ${review.deferrals}× without a review being held.`)
      : null,
    reviews.length
      ? h(
          'ul',
          { class: 'review-log' },
          ...reviews.slice(0, 3).map((entry) => {
            const settled = reviewedIn(plan, entry.id);
            const parts = [];
            if (settled.closed.length) parts.push(`${settled.closed.length} closed`);
            if (settled.carried.length) parts.push(`${settled.carried.length} carried`);
            if (settled.dropped.length) parts.push(`${settled.dropped.length} dropped`);
            return h(
              'li',
              { class: 'review-item' },
              h(
                'div',
                { class: 'review-head' },
                h('span', { class: 'review-date' }, formatDate(entry.date)),
                parts.length ? h('span', { class: 'tiny muted' }, parts.join(' · ')) : h('span', { class: 'tiny muted' }, 'no commitments settled'),
              ),
              h('p', { class: 'review-note tiny' }, entry.notes.length > 180 ? `${entry.notes.slice(0, 177).trimEnd()}…` : entry.notes),
            );
          }),
        )
      : h('p', { class: 'tiny muted' }, 'No review has been recorded yet.'),
    reviews.length > 3 ? h('p', { class: 'tiny muted' }, `+${reviews.length - 3} earlier review(s) in the record.`) : null,
  );
}
