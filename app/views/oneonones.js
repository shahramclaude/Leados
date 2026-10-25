/**
 * app/views/oneonones.js — the meeting board: who is due, what was promised,
 * and what actually happened.
 */

import { h } from '../ui/dom.js';
import { pageHeader, card, stat, badge, personChip, emptyState, table } from '../ui/components.js';
import { dueMeetings, openActions, allActions, followThroughStats, gradeMeeting, meetingsNewestFirst, cadence } from '../core/domain/oneonone.js';
import { formatDate } from '../core/time.js';
import { openOneOnOneDialog, openActionDialog } from '../ui/modals.js';

export function renderOneOnOnes(ctx) {
  const { state, now } = ctx;
  const due = dueMeetings(state, now, state.settings);
  const actions = openActions(state, { now });
  const overdue = actions.filter((a) => a.overdue);
  const stats = followThroughStats(state, null, now);
  const personFilter = ctx.query.get('person');
  const meetingFilter = ctx.query.get('meeting');
  const statusTab = ctx.query.get('tab') || 'open'; // 'open' | 'all' | 'resolved'
  const filterPersonId = personFilter || null;
  const filteredActions = allActions(state, {
    personId: filterPersonId,
    status: statusTab === 'all' ? 'all' : statusTab === 'resolved' ? 'completed' : 'open',
    now,
  });
  const allMeetings = state.oneOnOnes
    .filter((meeting) => (!personFilter || meeting.personId === personFilter) && (!meetingFilter || meeting.id === meetingFilter))
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, meetingFilter ? 1 : 12);

  const personFor = (id) => state.people.find((p) => p.id === id) || null;

  const heldRecent = state.oneOnOnes.filter((m) => m.status === 'held').slice(0, 12);
  const avgQuality = heldRecent.length
    ? Math.round(heldRecent.reduce((sum, m) => sum + gradeMeeting(m).score, 0) / heldRecent.length)
    : null;
  const skipped = state.oneOnOnes.filter((m) => m.status !== 'held').length;

  const actionColumns = [
    {
      label: 'Action',
      render: (a) =>
        h('div', { class: 'action-cell' },
          h('span', { class: a.status === 'completed' ? 'is-done' : a.status === 'dropped' ? 'is-dropped' : '' }, a.text),
          a.status === 'dropped' && a.dropReason ? h('span', { class: 'action-drop-reason' }, `Dropped: ${a.dropReason}`) : null,
        ),
    },
    { label: 'Person', render: (a) => (personFor(a.personId) ? personChip(personFor(a.personId), { sub: null }) : h('span', { class: 'muted' }, '—')) },
    {
      label: 'Status / Due',
      render: (a) => {
        if (a.status === 'completed') {
          return badge('completed', 'good');
        }
        if (a.status === 'dropped') {
          return badge('dropped', 'neutral');
        }
        return h('span', { class: a.overdue ? 'text-bad' : 'muted' }, a.due ? `${formatDate(a.due, { withYear: false })}${a.overdue ? ` · ${Math.abs(a.daysUntilDue)}d late` : ''}` : 'no date');
      },
    },
    {
      label: 'Resolution',
      render: (a) => {
        if (a.status === 'completed') {
          return h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => ctx.api.resolveOneOnOneAction(a.id, { status: 'open' }),
          }, 'Reopen');
        }
        if (a.status === 'dropped') {
          return h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => ctx.api.resolveOneOnOneAction(a.id, { status: 'open' }),
          }, 'Reopen');
        }
        return h('div', { class: 'btn-row-tight' },
          h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => ctx.api.resolveOneOnOneAction(a.id, { status: 'completed' }),
          }, 'Done'),
          h('button', {
            class: 'btn btn-tiny btn-ghost',
            type: 'button',
            onClick: () => {
              const reason = prompt('Reason for dropping commitment:');
              if (reason !== null) {
                ctx.api.resolveOneOnOneAction(a.id, { status: 'dropped', dropReason: reason });
              }
            },
          }, 'Drop'),
        );
      },
    },
  ];

  return h(
    'div',
    { class: 'page' },
    pageHeader({
      title: '1:1s',
      subtitle: `Cadence every ${state.settings.oneOnOneCadenceDays} days. Overdue means 1.5× that.`,
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log a 1:1')],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Held', value: state.oneOnOnes.filter((m) => m.status === 'held').length, hint: `${state.oneOnOnes.length} logged in total` }),
      stat({ label: 'Due or overdue', value: due.length, hint: `${due.filter((d) => d.cadence.status === 'overdue').length} overdue`, tone: due.length ? 'warn' : 'good' }),
      stat({ label: 'Avg quality', value: avgQuality === null ? '—' : `${avgQuality}/100`, hint: 'notes, action, mood, agenda' }),
      stat({ label: 'Skipped or moved', value: skipped, hint: 'reschedules are a signal', tone: skipped > 2 ? 'warn' : '' }),
    ),
    due.length
      ? card({
          title: 'Up next',
          subtitle: 'Most overdue first. Open the person page for a prepared agenda.',
          body: h(
            'ul',
            { class: 'attention-list' },
            ...due.map(({ person, cadence: cad }) =>
              h(
                'li',
                null,
                personChip(person, {
                  sub: cad.lastHeldDate ? `last held ${cad.lastHeldDate}` : 'never met',
                  onClick: () => ctx.navigate(`#/people/${person.id}`),
                  right: badge(
                    cad.status === 'never' ? 'no 1:1 ever' : cad.status === 'overdue' ? `${cad.overdueDays}d overdue` : 'due',
                    cad.status === 'never' ? 'warn' : cad.status === 'overdue' ? 'bad' : 'caution',
                  ),
                }),
                h('button', { class: 'btn btn-small btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: person.id }) }, 'Log'),
              ),
            ),
          ),
        })
      : card({ body: emptyState({ title: 'Everyone is inside cadence', body: 'Nothing to schedule right now.', icon: '✓' }) }),
    card({
      title: 'Follow-through & promise reconciliation',
      subtitle: 'Commitments made in 1:1s tracked across their full lifecycle (open, completed, or dropped).',
      actions: [
        h('div', { class: 'btn-group' },
          h('button', {
            class: `btn btn-tiny ${statusTab === 'open' ? 'btn-primary' : 'btn-ghost'}`,
            type: 'button',
            onClick: () => ctx.navigate('#/1-on-1s?tab=open'),
          }, `Open (${stats.open})`),
          h('button', {
            class: `btn btn-tiny ${statusTab === 'resolved' ? 'btn-primary' : 'btn-ghost'}`,
            type: 'button',
            onClick: () => ctx.navigate('#/1-on-1s?tab=resolved'),
          }, `Resolved (${stats.resolved})`),
          h('button', {
            class: `btn btn-tiny ${statusTab === 'all' ? 'btn-primary' : 'btn-ghost'}`,
            type: 'button',
            onClick: () => ctx.navigate('#/1-on-1s?tab=all'),
          }, `All (${stats.total})`),
        ),
      ],
      body: h('div', { class: 'follow-through-container' },
        h('div', { class: 'stat-row follow-through-metrics' },
          stat({
            label: 'Promise integrity',
            value: stats.promiseIntegrityRate === null ? '—' : `${stats.promiseIntegrityRate}%`,
            hint: stats.resolved ? `${stats.completed} kept of ${stats.resolved} resolved` : 'no resolved actions yet',
            tone: stats.promiseIntegrityRate !== null && stats.promiseIntegrityRate >= 80 ? 'good' : stats.promiseIntegrityRate !== null ? 'warn' : '',
          }),
          stat({
            label: 'On-time completion',
            value: stats.onTimeCompletionRate === null ? '—' : `${stats.onTimeCompletionRate}%`,
            hint: 'completed on or before due date',
            tone: stats.onTimeCompletionRate !== null && stats.onTimeCompletionRate >= 75 ? 'good' : '',
          }),
          stat({
            label: 'Avg days to resolve',
            value: stats.avgDaysToResolve === null ? '—' : `${stats.avgDaysToResolve}d`,
            hint: 'from meeting to resolution',
          }),
          stat({
            label: 'Dropped with rationale',
            value: stats.dropped,
            hint: stats.dropped ? 'conscious descope' : 'none dropped',
          }),
        ),
        filteredActions.length
          ? table({ columns: actionColumns, rows: filteredActions.slice(0, 15) })
          : emptyState({
              title: statusTab === 'open' ? 'No open commitments' : 'No commitments match this filter',
              body: 'Actions are captured during 1:1s and reconciled in follow-up conversations.',
            }),
      ),
    }),
    card({
      title: 'Recent history',
      subtitle: 'Notes and quality, newest first.',
      body: allMeetings.length
        ? h(
            'ul',
            { class: 'meeting-list' },
            ...allMeetings.map((meeting) => {
              const person = personFor(meeting.personId);
              const grade = gradeMeeting(meeting);
              return h(
                'li',
                { class: 'meeting-item' },
                h(
                  'div',
                  { class: 'meeting-head' },
                  h('span', { class: 'meeting-date' }, formatDate(meeting.date)),
                  person ? h('a', { class: 'link', href: `#/people/${person.id}` }, person.name) : h('span', { class: 'muted' }, 'Unknown person'),
                  badge(meeting.status, meeting.status === 'held' ? 'good' : 'warn'),
                  h('span', { class: 'muted tiny' }, `quality ${grade.score}/100`),
                  meeting.actions.length ? h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openActionDialog(ctx, { meetingId: meeting.id }) }, 'Add action') : null,
                ),
                meeting.notes ? h('p', { class: 'meeting-notes' }, meeting.notes) : h('p', { class: 'muted' }, 'No notes recorded.'),
                grade.notes.length ? h('p', { class: 'note note-warn' }, grade.notes.join(' ')) : null,
              );
            }),
          )
        : emptyState({ title: 'No 1:1s logged yet', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log the first one') }),
    }),
  );
}
