/**
 * app/views/feedback.js — the SBI library, the balance meter, and the
 * follow-ups that make constructive feedback credible.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, table, personChip, emptyState } from '../ui/components.js';
import { teamFeedbackSummary, followUpsDue, validateSBI, QUALITY_LABELS, BALANCE_LABELS, feedbackLatency } from '../core/domain/feedback.js';
import { formatDate } from '../core/time.js';
import { openFeedbackDialog, openFeedbackDatesDialog } from '../ui/modals.js';

export function renderFeedback(ctx) {
  const { state, now } = ctx;
  const summary = teamFeedbackSummary(state, now, state.settings);
  const followUps = followUpsDue(state, now);
  const personFilter = ctx.query.get('person');
  const itemFilter = ctx.query.get('item');
  const followupFilter = ctx.query.get('filter') === 'followup';
  const latencyFilter = ctx.query.get('filter') === 'latency';

  const personFor = (id) => state.people.find((p) => p.id === id) || null;

  let items = state.feedback.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (personFilter) items = items.filter((f) => f.personId === personFilter);
  if (itemFilter) items = items.filter((f) => f.id === itemFilter);
  if (followupFilter) items = items.filter((f) => f.followUpOn && !f.followUpDone);
  if (latencyFilter) {
    items = items.filter((f) => {
      const latency = feedbackLatency(f);
      return f.direction === 'given' && latency.status === 'measured' && latency.days > state.settings.feedbackLatencyTargetDays;
    });
  }

  const columns = [
    { label: 'Conversation', render: (f) => h('span', { class: 'muted' }, formatDate(f.date, { withYear: false })) },
    { label: 'Person', render: (f) => (personFor(f.personId) ? personChip(personFor(f.personId)) : h('span', { class: 'muted' }, '—')) },
    { label: 'Type', render: (f) => badge(f.kind === 'praise' ? 'Praise' : 'Constructive', f.kind === 'praise' ? 'good' : 'caution') },
    {
      label: 'Observed → discussed',
      render: (f) => {
        const latency = feedbackLatency(f);
        return h(
          'div',
          { class: 'latency-cell' },
          h('span', { class: 'muted tiny' }, f.observedOn ? `Observed ${formatDate(f.observedOn, { withYear: false })}` : 'Observation date not recorded'),
          latency.status === 'measured'
            ? badge(`${latency.days}d to discuss`, latency.days > state.settings.feedbackLatencyTargetDays ? 'warn' : 'good')
            : badge(latency.status === 'invalid' ? 'Check dates' : 'Unmeasured', latency.status === 'invalid' ? 'bad' : 'neutral'),
          h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openFeedbackDatesDialog(ctx, { feedback: f }) }, 'Edit dates'),
        );
      },
    },
    {
      label: 'Note',
      render: (f) => {
        const validation = validateSBI(f);
        return h(
          'div',
          { class: 'sbi-cell' },
          h('span', { class: 'sbi-situation' }, f.situation || '—'),
          h('span', { class: 'sbi-behavior' }, f.behavior),
          f.impact ? h('span', { class: 'sbi-impact' }, `→ ${f.impact}`) : null,
          h('span', { class: 'muted tiny' }, `Quality: ${QUALITY_LABELS[validation.quality]}`),
        );
      },
    },
    {
      label: 'Follow-up',
      render: (f) =>
        f.followUpOn
          ? f.followUpDone
            ? badge('closed', 'good')
            : h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.api.completeFollowUp(f.id, true) }, `${f.followUpOn} · close`)
          : h('span', { class: 'muted' }, '—'),
    },
  ];

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: 'Feedback',
      subtitle: 'Situation → Behaviour → Impact. Specific enough that the person can repeat it (or stop it).',
      actions: [
        h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => openFeedbackDialog(ctx, { kind: 'praise' }) }, 'Give praise'),
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openFeedbackDialog(ctx, { kind: 'constructive' }) }, 'Give constructive'),
      ],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Praise (90d)', value: summary.praise, hint: 'what to keep doing' }),
      stat({ label: 'Constructive (90d)', value: summary.constructive, hint: 'what to change' }),
      stat({ label: 'People overdue', value: summary.staleCount, hint: `target: every ${state.settings.feedbackTargetDays} days`, tone: summary.staleCount ? 'warn' : 'good' }),
      stat({ label: 'Follow-ups due', value: followUps.length, hint: 'close the loop', tone: followUps.length ? 'warn' : '' }),
      stat({
        label: 'Observed → discussed',
        value: summary.averageLatency === null ? '—' : `${summary.averageLatency}d`,
        hint: `${summary.delayedLatency} beyond ${summary.latencyTargetDays}d · ${summary.latencySamples} measured · ${summary.unmeasuredLatency} unknown`,
        tone: summary.delayedLatency ? 'warn' : summary.latencySamples ? 'good' : '',
      }),
    ),
    card({
      title: 'Balance by person',
      subtitle: 'Radical Candor, measured: praise-only is ruinous empathy; criticism-only erodes trust.',
      actions: personFilter ? [h('a', { class: 'btn btn-small btn-ghost', href: '#/feedback' }, 'Show everyone')] : [],
      body: summary.people.length
        ? h(
            'div',
            { class: 'balance-grid' },
            ...summary.people.map((row) =>
              h(
                'button',
                {
                  class: `balance-card ${row.balance === 'balanced' ? 'is-good' : row.balance === 'no-feedback' ? 'is-neutral' : 'is-warn'} ${personFilter === row.person.id ? 'is-selected' : ''}`,
                  type: 'button',
                  onClick: () => ctx.navigate(`#/feedback?person=${row.person.id}`),
                },
                personChip(row.person, { sub: row.daysSinceGiven === null ? 'never given' : `last ${row.daysSinceGiven}d ago` }),
                h('span', { class: 'balance-label' }, BALANCE_LABELS[row.balance]),
                h('span', { class: 'muted tiny' }, `${row.praise} praise · ${row.constructive} constructive`),
                h('span', { class: 'muted tiny' }, row.latencySamples
                  ? `Avg discussion delay ${row.averageLatency}d (${row.latencySamples} measured)`
                  : 'Discussion delay unmeasured'),
              ),
            ),
          )
        : emptyState({ title: 'No people yet', body: 'Add your team first.' }),
    }),
    followUps.length
      ? card({
          title: 'Follow-ups due',
          subtitle: 'Constructive feedback needs a second conversation, or it reads as a verdict.',
          body: h(
            'ul',
            { class: 'plain-list' },
            ...followUps.map((f) =>
              h(
                'li',
                null,
                h('span', null, `${personFor(f.personId)?.name || 'Someone'} — “${f.situation || f.behavior}”`),
                h('span', { class: 'muted tiny' }, ` ${f.overdueDays}d late`),
                h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => ctx.api.completeFollowUp(f.id, true) }, 'Close'),
              ),
            ),
          ),
        })
      : null,
    card({
      title: latencyFilter ? 'Feedback beyond the latency convention' : personFilter ? `Feedback for ${personFor(personFilter)?.name || 'this person'}` : 'All feedback',
      subtitle: `${items.length} item${items.length === 1 ? '' : 's'}${latencyFilter ? ` · more than ${state.settings.feedbackLatencyTargetDays} days from observation to conversation` : ''}`,
      actions: (personFilter || itemFilter || followupFilter || latencyFilter) ? [h('a', { class: 'btn btn-small btn-ghost', href: '#/feedback' }, 'Show all')] : [],
      body: items.length
        ? table({ columns, rows: items.slice(0, 40) })
        : emptyState({ title: 'No feedback recorded', body: 'The most common reason people feel invisible is that nobody wrote anything down.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openFeedbackDialog(ctx) }, 'Record feedback') }),
    }),
  );
}
