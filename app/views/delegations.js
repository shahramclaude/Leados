/**
 * app/views/delegations.js — authority, support and follow-through.
 * A delegation remains open until it is completed or explicitly returns to
 * the leader; check-ins are dated evidence, not a replacement for ownership.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, personChip, emptyState, tabs } from '../ui/components.js';
import { authorityFor, DELEGATION_AUTHORITY, delegationSummary } from '../core/domain/delegations.js';
import { delegationGrowthHandoff } from '../core/domain/growth.js';
import { formatDate } from '../core/time.js';
import { linksForEntity, isCaseOpen } from '../core/domain/cases.js';
import { buildCaseFromUpstreamEntity } from '../core/domain/automation.js';
import {
  openDelegationDialog,
  openDelegationCheckInDialog,
  openCompleteDelegationDialog,
  openReturnDelegationDialog,
  openGrowthPlanDialog,
  openWillActionDialog,
  openCaseDialog,
} from '../ui/modals.js';

const FILTERS = ['active', 'attention', 'all', 'done', 'returned'];
const STATUS_RANK = { blocked: 6, overdue: 5, unscheduled: 4, 'checkin-due': 3, 'on-track': 2, returned: 1, done: 0 };

export function renderDelegations(ctx) {
  const { state, now } = ctx;
  const summary = delegationSummary(state, now, state.settings);
  const focusId = ctx.query.get('delegation');
  const personId = ctx.query.get('person');
  const requestedFilter = ctx.query.get('filter');
  const filter = FILTERS.includes(requestedFilter) ? requestedFilter : 'active';

  const sorted = summary.rows.slice().sort((a, b) =>
    (STATUS_RANK[b.health.status] || 0) - (STATUS_RANK[a.health.status] || 0)
    || String(a.delegation.dueOn || '9999').localeCompare(String(b.delegation.dueOn || '9999')),
  );
  const rows = sorted.filter(({ delegation, health }) => {
    if (focusId && delegation.id !== focusId) return false;
    if (personId && delegation.personId !== personId) return false;
    if (focusId) return true;
    if (filter === 'all') return true;
    if (filter === 'attention') return ['blocked', 'overdue', 'unscheduled', 'checkin-due'].includes(health.status);
    return delegation.status === filter;
  });

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      eyebrow: 'Delegation',
      title: 'Transfer outcomes, not just tasks',
      subtitle: 'One accountable owner, a clear result, explicit decision authority, real support, and a dated close. Nothing here silently reassigns work.',
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDelegationDialog(ctx, { personId }) }, 'Delegate an outcome')],
    }),

    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Active', value: summary.active, hint: 'outcomes with an owner' }),
      stat({ label: 'Overdue', value: summary.overdue, hint: 'past the agreed due date', tone: summary.overdue ? 'bad' : 'good' }),
      stat({ label: 'Blocked', value: summary.blocked, hint: 'latest check-in needs support', tone: summary.blocked ? 'bad' : 'good' }),
      stat({ label: 'Check-ins due', value: summary.checkinDue, hint: `team convention: ${state.settings.delegationCheckinDays}d`, tone: summary.checkinDue ? 'warn' : 'good' }),
      stat({ label: 'Returned', value: summary.returned, hint: 'accountability back with leader', tone: summary.returned ? 'warn' : '' }),
    ),

    card({
      title: 'Make the decision boundary explicit',
      subtitle: 'Authority is a conversation and a record, not an inference from someone’s seniority. Choose the smallest boundary that lets the owner succeed.',
      body: h(
        'div',
        { class: 'authority-grid' },
        ...Object.entries(DELEGATION_AUTHORITY).map(([id, authority]) =>
          h('div', { class: 'authority-item' }, h('strong', null, authority.label), h('p', { class: 'muted tiny' }, authority.description)),
        ),
      ),
    }),

    tabs({
      items: [
        { key: 'active', label: 'Active', count: summary.active },
        { key: 'attention', label: 'Needs attention', count: summary.attention.length },
        { key: 'all', label: 'All', count: summary.rows.length },
        { key: 'done', label: 'Completed', count: summary.done },
        { key: 'returned', label: 'Returned', count: summary.returned },
      ],
      active: focusId ? 'all' : filter,
      onSelect: (id) => ctx.navigate(`#/delegations?filter=${id}`),
      ariaLabel: 'Delegation views',
    }),

    (focusId || personId)
      ? h('p', { class: 'filter-note' }, `${rows.length} matching delegation${rows.length === 1 ? '' : 's'}. `, h('a', { href: '#/delegations' }, 'Clear filters'))
      : null,

    rows.length
      ? h('div', { class: 'delegation-list' }, ...rows.map(({ delegation, health }) => delegationCard(ctx, delegation, health, delegation.id === focusId)))
      : emptyState({
          title: summary.rows.length ? 'Nothing in this view' : 'No outcomes delegated yet',
          body: summary.rows.length
            ? 'Choose another view or clear the filters. Completed and returned work remains in history.'
            : 'Start with one outcome you can describe, a decision boundary you can say out loud, and support you can actually provide.',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openDelegationDialog(ctx, { personId }) }, 'Delegate an outcome'),
        }),
  );
}

function delegationCard(ctx, delegation, health, focused) {
  const person = ctx.state.people.find((p) => p.id === delegation.personId) || null;
  const authority = authorityFor(delegation);
  const latest = health.latest;
  const handoff = delegationGrowthHandoff(ctx.state, delegation.id, ctx.now);
  const caseLinks = linksForEntity(ctx.state, 'delegation', delegation.id).filter((l) => l.peer.type === 'case');
  const hasOpenCase = caseLinks.some((l) => isCaseOpen(l.peer.raw));
  const escalateBtn = delegation.status === 'active' && !hasOpenCase
    ? h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => {
            const built = buildCaseFromUpstreamEntity(ctx.state, {
              sourceType: 'delegation',
              sourceId: delegation.id,
              now: ctx.now,
            });
            if (built.ok) {
              openCaseDialog(ctx, {
                prefill: { ...built.payload, _upstreamLink: { sourceType: 'delegation', sourceId: delegation.id } },
                onSaved: (res) => res?.id && ctx.navigate(`#/cases/${res.id}`),
              });
            }
          },
        },
        'Escalate to case',
      )
    : null;
  const handoffBtn = handoff.available
    ? h(
        'button',
        {
          class: 'btn btn-ghost btn-sm',
          type: 'button',
          onClick: () => (handoff.mode === 'add-will'
            ? openWillActionDialog(ctx, { planId: handoff.activePlan.id, delegation })
            : openGrowthPlanDialog(ctx, { personId: delegation.personId, delegation })),
        },
        handoff.mode === 'add-will' ? 'Add to GROW' : 'Start GROW plan',
      )
    : null;

  return card({
    title: delegation.title,
    subtitle: person ? `${person.name} · delegated ${formatDate(delegation.delegatedOn)}` : `Owner no longer in roster · delegated ${formatDate(delegation.delegatedOn)}`,
    className: `delegation-card ${focused ? 'is-focused' : ''}`,
    actions: [badge(health.label, health.tone)],
    body: h(
      'div',
      { class: 'stack' },
      person ? personChip(person, { sub: person.role }) : h('p', { class: 'inline-warn' }, 'The owner is no longer in the roster. The record is preserved as history.'),
      h(
        'div',
        { class: 'delegation-meta' },
        badge(authority.label, delegation.authority ? 'neutral' : 'warn'),
        handoff.existingLink
          ? badge(`GROW · ${handoff.existingLink.state}`, handoff.existingLink.state === 'done' ? 'good' : 'neutral')
          : null,
        h('span', { class: `tiny ${health.overdue ? 'text-bad' : 'muted'}` }, delegation.dueOn
          ? `Due ${formatDate(delegation.dueOn)}${health.daysLeft !== null ? health.daysLeft < 0 ? ` · ${Math.abs(health.daysLeft)}d over` : health.daysLeft === 0 ? ' · today' : ` · ${health.daysLeft}d left` : ''}`
          : 'No due date recorded'),
        h('span', { class: 'muted tiny' }, `${delegation.checkins.length} check-in${delegation.checkins.length === 1 ? '' : 's'}`),
      ),
      handoff.existingLink
        ? h(
            'p',
            { class: 'tiny muted' },
            'Linked development commitment: ',
            h(
              'a',
              { class: 'link', href: `#/growth?plan=${encodeURIComponent(handoff.existingLink.plan.id)}` },
              `“${handoff.existingLink.action.text}” (${handoff.existingLink.state}) →`,
            ),
          )
        : null,
      caseLinks.length
        ? h(
            'p',
            { class: 'tiny muted' },
            'Linked operational case: ',
            ...caseLinks.map((l, idx) =>
              h(
                'span',
                null,
                idx > 0 ? ' · ' : '',
                h('a', { class: 'link', href: l.peer.route }, `${l.peer.title} (${l.peer.status}) →`),
              ),
            ),
          )
        : null,
      h(
        'div',
        { class: 'delegation-outcome' },
        h('span', { class: 'tiny uppercase muted' }, 'Expected outcome'),
        h('p', null, delegation.expectedOutcome || 'No expected outcome recorded. Clarify this before relying on the handoff.'),
      ),
      h(
        'div',
        { class: 'delegation-outcome' },
        h('span', { class: 'tiny uppercase muted' }, 'Authority and support'),
        h('p', null, authority.description),
        h('p', { class: delegation.support ? 'muted' : 'inline-warn' }, delegation.support || 'No support or resources recorded.'),
      ),

      delegation.status === 'active'
        ? h(
            'div',
            { class: `delegation-checkpoint ${health.checkinDue || health.blocked ? 'needs-attention' : ''}` },
            h('strong', null, health.blocked ? 'Support is needed now' : health.checkinDue ? 'A check-in is due' : 'Follow-through'),
            h('p', { class: 'muted tiny' }, health.checkpointDate
              ? `Last checkpoint ${formatDate(health.checkpointDate)}${health.checkinAge !== null ? ` · ${health.checkinAge}d ago` : ''} · team convention ${health.target}d`
              : 'No checkpoint date is recorded.'),
            latest ? h('p', null, latest.note) : h('p', { class: 'muted' }, 'No check-in yet. Agree the first checkpoint without taking the work back.'),
          )
        : h(
            'div',
            { class: `delegation-result ${delegation.status === 'done' ? 'is-done' : 'is-returned'}` },
            h('strong', null, delegation.status === 'done' ? 'Outcome completed' : 'Work returned to the leader'),
            h('p', { class: 'muted tiny' }, formatDate(delegation.status === 'done' ? delegation.completedOn : delegation.returnedOn)),
            h('p', null, delegation.status === 'done'
              ? delegation.completionNote || 'Completion note not recorded.'
              : delegation.returnReason || 'Return reason not recorded.'),
          ),

      delegation.checkins.length
        ? h(
            'details',
            { class: 'checkin-history' },
            h('summary', null, `Check-in history (${delegation.checkins.length})`),
            h(
              'ol',
              null,
              ...delegation.checkins.slice().sort((a, b) => b.date.localeCompare(a.date)).map((checkin) =>
                h('li', null,
                  h('div', null, h('strong', null, formatDate(checkin.date)), badge(checkin.progress === 'blocked' ? 'Blocked' : 'On track', checkin.progress === 'blocked' ? 'bad' : 'good')),
                  h('p', null, checkin.note),
                ),
              ),
            ),
          )
        : null,

      delegation.status === 'active'
        ? h(
            'div',
            { class: 'card-actions' },
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', onClick: () => openDelegationCheckInDialog(ctx, { delegation }) }, 'Check in'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openCompleteDelegationDialog(ctx, { delegation }) }, 'Mark completed'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openReturnDelegationDialog(ctx, { delegation }) }, 'Accept back'),
            handoffBtn,
            escalateBtn,
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: () => openDelegationDialog(ctx, { delegation }) }, 'Edit'),
          )
        : handoffBtn
          ? h('div', { class: 'card-actions' }, handoffBtn)
          : null,
    ),
  });
}
