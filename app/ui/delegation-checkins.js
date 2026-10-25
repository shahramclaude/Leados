/** Small, executable delegation follow-through queue for the Today dashboard. */
import { h } from './dom.js';
import { card } from './components.js';
import { authorityFor, dueDelegationCheckins } from '../core/domain/delegations.js';
import { formatDate } from '../core/time.js';
import { openDelegationCheckInDialog, openCompleteDelegationDialog } from './modals.js';

export function delegationCheckinsCard(ctx, { rows = dueDelegationCheckins(ctx.state, ctx.now, ctx.state.settings), limit = 4 } = {}) {
  if (!rows.length) return null;
  const counts = {
    blocked: rows.filter((row) => row.kind === 'blocked').length,
    overdue: rows.filter((row) => row.kind === 'overdue').length,
    unscheduled: rows.filter((row) => row.kind === 'unscheduled').length,
    checkin: rows.filter((row) => row.kind === 'checkin-due').length,
  };
  const visible = rows.slice(0, limit);
  const summary = [
    counts.blocked ? `${counts.blocked} blocked` : null,
    counts.overdue ? `${counts.overdue} past due` : null,
    counts.unscheduled ? `${counts.unscheduled} without a due date` : null,
    counts.checkin ? `${counts.checkin} check-in${counts.checkin === 1 ? '' : 's'} overdue` : null,
  ].filter(Boolean).join(' · ');

  return card({
    id: 'delegation-checkins',
    title: 'Delegated outcomes needing follow-through',
    subtitle: `${summary}. This is a prompt to offer support, not a rating of the owner. Check-in timing follows your ${ctx.state.settings.delegationCheckinDays}-day team convention.`,
    actions: [
      h('a', { class: 'btn btn-small btn-ghost', href: '#/delegations?filter=attention' }, `All ${rows.length} outcomes`),
    ],
    body: h(
      'div',
      { class: 'stack' },
      h(
        'ul',
        { class: 'attention-list delegation-checkin-list' },
        ...visible.map(({ delegation, person, health, kind }) => {
          const timing = kind === 'blocked'
            ? 'Support needed'
            : kind === 'overdue'
              ? `${health.daysOverdue}d past due`
              : kind === 'unscheduled'
                ? 'No due date'
                : `No check-in for ${health.checkinAge ?? 'an unknown number of'} days`;
          const due = delegation.dueOn ? `due ${formatDate(delegation.dueOn, { withYear: false })}` : null;
          const owner = person
            ? `${person.name}${person.status === 'archived' ? ' · archived' : ''}`
            : 'Owner no longer on roster';
          return h(
            'li',
            { 'data-delegation-id': delegation.id, 'data-kind': kind },
            h(
              'div',
              { class: 'delegation-checkin-main' },
              h('a', {
                class: 'link delegation-checkin-title',
                href: `#/delegations?delegation=${encodeURIComponent(delegation.id)}`,
              }, delegation.title),
              h('span', { class: 'muted tiny' }, [owner, due, authorityFor(delegation).shortLabel].filter(Boolean).join(' · ')),
            ),
            h(
              'div',
              { class: 'promise-actions' },
              h('span', { class: `badge ${kind === 'blocked' || kind === 'overdue' ? 'badge-bad' : 'badge-warn'}` }, timing),
              h('button', {
                class: `btn btn-small ${kind === 'blocked' || kind === 'overdue' ? 'btn-primary' : 'btn-ghost'}`,
                type: 'button',
                'aria-label': `Record check-in for ${delegation.title}`,
                onClick: () => openDelegationCheckInDialog(ctx, { delegation }),
              }, 'Record check-in'),
              h('button', {
                class: 'btn btn-small btn-ghost',
                type: 'button',
                'aria-label': `Complete delegated outcome: ${delegation.title}`,
                onClick: () => openCompleteDelegationDialog(ctx, { delegation }),
              }, 'Complete'),
            ),
          );
        }),
      ),
      visible.length < rows.length
        ? h('p', { class: 'muted tiny' }, `Showing ${visible.length} of ${rows.length}, highest-priority work first.`)
        : null,
    ),
  });
}
