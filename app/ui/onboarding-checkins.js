/** Shared actionable phase-conversation queue for Today and the all-due view. */
import { h } from './dom.js';
import { card, personChip, emptyState } from './components.js';
import { openOnboardingReviewDialog } from './modals.js';
import { dueOnboardingReviews, KIND_LABELS, planKind } from '../core/domain/onboarding.js';
import { formatDate } from '../core/time.js';

export function onboardingCheckinsCard(ctx, { rows = dueOnboardingReviews(ctx.state, ctx.now), limit = Infinity, showEmpty = false } = {}) {
  if (!rows.length && !showEmpty) return null;
  const overdue = rows.filter((row) => row.review.state === 'overdue').length;
  const soon = rows.length - overdue;
  const visible = rows.slice(0, limit);
  const planCount = new Set(rows.map((row) => row.plan.id)).size;
  return card({
    id: 'onboarding-checkins',
    title: '30-60-90 check-ins',
    subtitle: rows.length
      ? `${overdue} overdue · ${soon} due today or within 7 days · ${planCount} active plan${planCount === 1 ? '' : 's'}. Record the two-way conversation, not just checklist completion.`
      : 'No unheld phase conversations are overdue or due within 7 days for these filters.',
    actions: visible.length < rows.length
      ? [h('a', { class: 'btn btn-small btn-ghost', href: '#/onboarding?status=checkins' }, `All ${rows.length} check-ins`)]
      : [],
    body: rows.length
      ? h(
          'div',
          { class: 'stack' },
          visible.length < rows.length ? h('p', { class: 'muted tiny' }, `Showing ${visible.length} of ${rows.length}, oldest due date first.`) : null,
          h(
            'ul',
            { class: 'attention-list onboarding-checkin-list' },
            ...visible.map(({ plan, person, review }) => {
              const kind = KIND_LABELS[planKind(plan)];
              const timing = review.state === 'overdue'
                ? `${review.overdueDays}d overdue`
                : review.daysUntil === 0 ? 'due today' : `in ${review.daysUntil}d`;
              return h(
                'li',
                { 'data-plan-id': plan.id, 'data-horizon': review.horizon },
                personChip(person, {
                  onClick: () => ctx.navigate(`#/people/${encodeURIComponent(person.id)}`),
                  sub: [kind, plan.label, `Day ${review.horizon} · target ${formatDate(review.dueOn, { withYear: false })}`].filter(Boolean).join(' · '),
                }),
                h(
                  'div',
                  { class: 'promise-actions' },
                  h('span', { class: `badge ${review.state === 'overdue' ? 'badge-bad' : 'badge-caution'}` }, timing),
                  h('a', {
                    class: 'btn btn-small btn-ghost',
                    href: `#/onboarding?plan=${encodeURIComponent(plan.id)}`,
                    'aria-label': `Open plan — 30-60-90 plan for ${person.name}`,
                  }, 'Open plan'),
                  h('button', {
                    class: `btn btn-small ${review.state === 'overdue' ? 'btn-primary' : 'btn-ghost'}`,
                    type: 'button',
                    'aria-label': `Log Day ${review.horizon} check-in for ${person.name} (${kind})`,
                    onClick: () => openOnboardingReviewDialog(ctx, plan, { horizon: review.horizon }),
                  }, `Log Day ${review.horizon} check-in`),
                ),
              );
            }),
          ),
        )
      : emptyState({ title: 'No phase check-ins due', body: 'Held conversations, inactive plans and archived people are excluded. Other onboarding checkpoints can still need attention.' }),
  });
}
