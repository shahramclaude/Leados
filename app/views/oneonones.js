/**
 * app/views/oneonones.js — the meeting board: who is due, what was promised,
 * what happened to it, and what actually moved.
 */

import { h, toast } from '../ui/dom.js';
import { pageHeader, card, stat, badge, personChip, emptyState, table } from '../ui/components.js';
import {
  dueMeetings,
  openActions,
  gradeMeeting,
  commitmentCounts,
  reconciledInMeeting,
  ownershipSummary,
  ownerPhrase,
  OWNER_LABELS,
} from '../core/domain/oneonone.js';
import { formatDate } from '../core/time.js';
import { openOneOnOneDialog, openActionDialog } from '../ui/modals.js';

const OWNER_OPTIONS = [
  { value: '', label: 'Owner not recorded' },
  { value: 'them', label: 'They own it' },
  { value: 'leader', label: 'You own it' },
  { value: 'shared', label: 'Shared' },
];

/**
 * Ownership is editable in place: the board is where a leader notices that
 * nobody (or they themselves) own a promise, so the correction should not
 * require opening a meeting that already happened.
 */
function ownerCell(ctx, action) {
  if (action.sourceType === 'managerSupport') return badge('You own it', 'good');
  return h(
    'select',
    {
      class: `owner-select ${action.owner === 'leader' ? 'is-mine' : ''}`,
      'aria-label': `Who owes “${action.text}”`,
      onChange: (event) => {
        const result = ctx.api.setActionOwner(action.meetingId, action.id, event.target.value || null);
        if (!result.ok) {
          toast(result.error, 'bad');
          event.target.value = action.owner || '';
          return;
        }
        toast(result.owner
          ? `Owner set — ${OWNER_LABELS[result.owner].toLowerCase()}`
          : 'Owner cleared — this promise now has nobody named', 'good');
      },
    },
    ...OWNER_OPTIONS.map((option) => h('option', { value: option.value, selected: (action.owner || '') === option.value }, option.label)),
  );
}

function promiseState(action) {
  if (action.overdue) return badge(`${Math.abs(action.daysUntilDue)}d late`, 'bad');
  if (action.carryCount > 0) return badge(`carried ${action.carryCount}×`, 'warn');
  if (!action.due) return badge('no date', 'neutral');
  return badge('open', 'neutral');
}

export function renderOneOnOnes(ctx) {
  const { state, now } = ctx;
  const due = dueMeetings(state, now, state.settings);
  const actions = openActions(state, { now });
  const overdue = actions.filter((a) => a.overdue);
  const carried = actions
    .filter((a) => a.carryCount > 0)
    .sort((a, b) => b.carryCount - a.carryCount || (a.firstAgreedOn < b.firstAgreedOn ? -1 : 1))
    .slice(0, 6);
  const counts = commitmentCounts(state, now);
  const owners = ownershipSummary(state, { now });
  const personFilter = ctx.query.get('person');
  const meetingFilter = ctx.query.get('meeting');
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
      label: 'Promise',
      render: (a) => h(
        'div',
        { class: 'promise-cell' },
        h('span', { class: a.done ? 'is-done' : '' }, a.text),
        h('span', { class: 'muted tiny' }, `agreed ${formatDate(a.firstAgreedOn, { withYear: false })}${a.carryCount ? ` · carried forward ${a.carryCount}×` : ''}`),
        a.sourceType === 'managerSupport'
          ? a.sourceLinkValid
            ? h('a', { class: 'link tiny', href: `#/onboarding?plan=${encodeURIComponent(a.sourcePlanId || '')}` }, `Day ${a.sourceHorizon || ''} check-in · ${formatDate(a.sourceHeldOn, { withYear: false })}`)
            : h('span', { class: 'muted tiny' }, 'Source check-in link unavailable')
          : null,
      ),
    },
    { label: 'Person', render: (a) => (personFor(a.personId) ? personChip(personFor(a.personId), { sub: null }) : h('span', { class: 'muted' }, '—')) },
    { label: 'Owner', render: (a) => ownerCell(ctx, a) },
    { label: 'Due', render: (a) => h('span', { class: a.overdue ? 'text-bad' : 'muted' }, a.due ? formatDate(a.due, { withYear: false }) : 'no date') },
    { label: 'State', render: (a) => promiseState(a) },
    {
      label: 'Actions',
      render: (a) => h(
        'div',
        { class: 'promise-actions' },
        h('button', {
          class: 'btn btn-tiny btn-ghost',
          type: 'button',
          onClick: () => {
            const result = a.sourceType === 'managerSupport'
              ? ctx.api.toggleManagerSupportCommitment(a.managerSupportId || a.id, { done: true })
              : ctx.api.toggleMeetingAction(a.meetingId, a.id);
            if (!result.ok) toast(result.error, 'bad');
          },
        }, 'Mark done'),
        h('button', { class: 'btn btn-tiny btn-ghost', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: a.personId }) }, 'Log 1:1'),
      ),
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
      stat({
        label: 'Promises kept',
        value: counts.closedInMeeting,
        hint: `${counts.carriedForward} carried forward · ${counts.dropped} dropped`,
        tone: counts.carriedForward ? 'warn' : '',
      }),
      stat({
        label: 'Still open',
        value: counts.open,
        hint: counts.overdue ? `${counts.overdue} past due` : 'none past due',
        tone: counts.overdue ? 'warn' : '',
      }),
      stat({
        label: 'I owe',
        value: counts.leaderOwned,
        hint: counts.leaderOverdue ? `${counts.leaderOverdue} past due` : 'on you (incl. shared)',
        tone: counts.leaderOverdue ? 'bad' : '',
      }),
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
    carried.length
      ? card({
          title: 'Commitments that keep moving',
          subtitle: `${counts.carriedOpen} open promise${counts.carriedOpen === 1 ? '' : 's'} ha${counts.carriedOpen === 1 ? 's' : 've'} already been carried forward at least once.`,
          body: h(
            'div',
            null,
            h(
              'p',
              { class: 'muted small' },
              'A promise that survives several 1:1s is usually blocked, not forgotten. Open it in the next conversation and decide: re-scope it, get help, or drop it explicitly.',
            ),
            h(
              'ul',
              { class: 'attention-list' },
              ...carried.map((action) =>
                h(
                  'li',
                  null,
                  h(
                    'div',
                    { class: 'commitment-line' },
                    h('span', { class: 'commitment-text' }, action.text),
                    h(
                      'span',
                      { class: 'muted tiny' },
                      `${personFor(action.personId)?.name || 'Unknown'} · ${ownerPhrase(action.owner)} · first agreed ${formatDate(action.firstAgreedOn, { withYear: false })} · carried ${action.carryCount}×${action.overdue ? ' · past due' : ''}`,
                    ),
                  ),
                  h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => openOneOnOneDialog(ctx, { personId: action.personId }) }, 'Resolve'),
                ),
              ),
            ),
          ),
        })
      : null,
    card({
      title: 'Promises in flight',
      subtitle: [
        overdue.length ? `${overdue.length} past due. An agreed action you did not do is worse than none.` : 'Nothing overdue.',
        owners.unknown ? `${owners.unknown} with no owner named.` : null,
      ].filter(Boolean).join(' '),
      body: actions.length
        ? table({ columns: actionColumns, rows: actions.slice(0, 10) })
        : emptyState({ title: 'No open promises', body: 'Actions are added when you log a 1:1.' }),
    }),
    card({
      title: 'Recent history',
      subtitle: `Notes, promises and what each meeting settled. Average log quality ${avgQuality === null ? '—' : `${avgQuality}/100`}.`,
      body: allMeetings.length
        ? h(
            'ul',
            { class: 'meeting-list' },
            ...allMeetings.map((meeting) => {
              const person = personFor(meeting.personId);
              const grade = gradeMeeting(meeting);
              const ledger = reconciledInMeeting(state, meeting.id);
              const settledParts = [
                ledger.closed.length ? `closed ${ledger.closed.length}` : null,
                ledger.carriedIn.length ? `carried forward ${ledger.carriedIn.length}` : null,
                ledger.dropped.length ? `dropped ${ledger.dropped.length}` : null,
              ].filter(Boolean);
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
                settledParts.length ? h('p', { class: 'meeting-ledger muted tiny' }, `Follow-through: ${settledParts.join(' · ')}`) : null,
                grade.notes.length ? h('p', { class: 'note note-warn' }, grade.notes.join(' ')) : null,
              );
            }),
          )
        : emptyState({ title: 'No 1:1s logged yet', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log the first one') }),
    }),
  );
}
