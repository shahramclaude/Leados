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

/**
 * Matrix line cadence is deliberately shown beside (not substituted for) the
 * existing person-wide board. The report API applies the canonical matrix and
 * seat disclosure rules; this view never reconstructs reporting lines.
 */
function matrixLineCoverageCard(ctx) {
  if (typeof ctx.api.oneOnOneLineReport !== 'function') {
    return card({ title: 'Matrix 1:1 line coverage', body: h('p', { class: 'text-bad' }, 'The matrix coverage reader is unavailable; line-level cadence is not being inferred from the person-wide board.') });
  }
  const result = ctx.api.oneOnOneLineReport();
  if (!result?.ok || !result.report) {
    return card({ title: 'Matrix 1:1 line coverage', body: h('p', { class: 'text-bad' }, result?.error || 'The matrix coverage reading failed; no line-level conclusion is available.') });
  }
  const report = result.report;
  if (report.aggregateWithheld) {
    return card({
      title: 'Matrix 1:1 line coverage',
      subtitle: report.scopeLabel,
      body: h('p', { class: 'muted' }, report.aggregateWithheldReason || 'Aggregate coverage is withheld by the disclosure policy. No totals or unprotected details are shown.'),
    });
  }
  if (!report.isMatrix) {
    return card({ title: 'Matrix 1:1 line coverage', subtitle: report.scopeLabel, body: h('p', { class: 'muted' }, report.singleChainNote) });
  }

  const board = report.board;
  const totalsReconcile = Boolean(board?.statesReconcile && board?.meetingsReconcile);
  const lines = report.persons.flatMap((person) => person.lines.map((line) => ({ person, line })));
  const lineRows = lines.map(({ person, line }) => ({
    personId: person.personId,
    personName: person.personName,
    managerId: line.managerId,
    managerName: line.managerName,
    role: line.role,
    kind: line.kind,
    share: line.role === 'home' ? 'Home line' : line.shareDeclared ? `${line.sharePct}%` : 'Undeclared — no exemption assumed',
    state: line.stateLabel,
    tone: line.tone,
    lastHeld: line.lastHeldOn || 'No attributed held 1:1',
    reason: line.reason,
  }));
  const columns = [
    { label: 'Person', render: (row) => h('a', { class: 'link', href: `#/people/${encodeURIComponent(row.personId)}` }, row.personName) },
    { label: 'Accountable line', render: (row) => `${row.managerName} · ${row.role === 'home' ? 'home' : row.kind || 'additional'}` },
    { label: 'Declared share', render: (row) => row.share },
    { label: 'Line state', render: (row) => badge(row.state, row.tone) },
    { label: 'Last attributed 1:1', render: (row) => row.lastHeld },
    { label: 'Why', render: (row) => h('span', { class: 'muted small' }, row.reason) },
  ];
  const refused = report.refusedPersons || [];
  const body = [
    report.isMatrix ? null : h('p', { class: 'muted' }, report.singleChainNote),
    board && totalsReconcile
      ? h('div', null,
          h('p', { class: 'small' }, `${board.peopleN} readable people · ${board.pairsN} person–line pairs · ${board.owingN} lines owe a standing 1:1.`),
          h('div', { class: 'stat-row' },
            stat({ label: 'On cadence', value: board.okN }),
            stat({ label: 'Due', value: board.dueN, tone: board.dueN ? 'warn' : '' }),
            stat({ label: 'Overdue / never', value: `${board.overdueN} / ${board.neverN}`, tone: board.overdueN + board.neverN ? 'bad' : '' }),
            stat({ label: 'Cannot be read', value: board.unprovenN, tone: board.unprovenN ? 'warn' : '' }),
            stat({ label: 'People masked by another line', value: board.maskedN, tone: board.maskedN ? 'bad' : '' }),
          ),
          h('p', { class: 'muted tiny' }, `Pair identity: ${board.okN} on cadence + ${board.dueN} due + ${board.overdueN} overdue + ${board.neverN} never held + ${board.newN} new + ${board.unprovenN} unreadable + ${board.exemptN} exempt = ${board.pairsN}. Held-meeting attribution: ${board.homeN} home + ${board.lineN} additional + ${board.otherN} other + ${board.danglingN} former holder + ${board.unattributedN} unattributed = ${board.heldN}.`),
        )
      : h('p', { class: 'text-bad' }, 'Coverage totals withheld: the pair-state or held-meeting identity does not reconcile. The row details below are not a complete roll-up.'),
    lineRows.length ? table({ columns, rows: lineRows }) : h('p', { class: 'muted' }, 'No named line rows are available in this seat’s disclosure scope.'),
    report.claimable?.length && report.actor?.canClaim && typeof ctx.api.oneOnOneLineClaim === 'function'
      ? h('div', { class: 'stack' },
          h('p', { class: 'small muted' }, 'Unattributed held 1:1s you may claim as yours:'),
          h('div', { class: 'row-actions' },
            ...report.claimable.map((item) => h('button', {
              class: 'btn btn-tiny btn-ghost',
              type: 'button',
              onClick: () => {
                const res = ctx.api.oneOnOneLineClaim(item.meetingId);
                if (!res?.ok) { toast(res?.error || 'Could not claim this 1:1.', 'bad'); return; }
                toast(`Claimed 1:1 with ${item.personName} on ${item.date}.`, 'good');
                if (typeof ctx.refresh === 'function') ctx.refresh();
              },
            }, `Claim ${item.personName} (${item.date})`)),
          ),
        )
      : null,
    refused.length ? h('div', { class: 'banner banner-caution', role: 'status' },
      h('div', { class: 'banner-text' },
        h('strong', null, `${refused.length} reporting-graph issue${refused.length === 1 ? '' : 's'} refused.`),
        h('ul', null, ...refused.map((row) => h('li', null, `${row.personName}: ${row.reason}`))),
      ),
    ) : null,
    h('p', { class: 'muted tiny' }, `As of ${report.generatedOn}. A meeting is credited only to its recorded holder; an unattributed meeting is not guessed onto either line. Open #/matrix?panel=one-on-ones for CSV #130, disclosure controls, and convention governance.`),
  ].filter(Boolean);
  const actions = [
    h('a', { class: 'btn btn-tiny btn-ghost', href: '#/matrix?panel=one-on-ones' }, 'Matrix 1:1 panel'),
  ];
  if (report.actor?.canScan && typeof ctx.api.oneOnOneLineScan === 'function') {
    actions.push(h('button', {
      class: 'btn btn-tiny btn-primary',
      type: 'button',
      onClick: () => {
        const res = ctx.api.oneOnOneLineScan();
        if (!res?.ok) { toast(res?.error || 'Silent-line scan refused.', 'bad'); return; }
        toast('Scanned matrix 1:1 line coverage for silent lines.', 'good');
        if (typeof ctx.refresh === 'function') ctx.refresh();
      },
    }, 'Scan silent lines'));
  }
  return card({
    title: 'Matrix 1:1 line coverage',
    subtitle: `${report.scopeLabel} · home cadence ${report.conventions.homeCadenceDays} days · additional-line cadence ${report.conventions.lineCadenceDays} days · exempt only below ${report.conventions.minSharePct}% declared share.`,
    actions,
    body: h('div', { class: 'stack' }, ...body),
  });
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

  const withheldN = state.oneOnOnes.filter((m) => m.bodyWithheld).length;
  const heldRecent = state.oneOnOnes.filter((m) => m.status === 'held' && !m.bodyWithheld).slice(0, 12);
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
      subtitle: [
        `Cadence every ${state.settings.oneOnOneCadenceDays} days. Overdue means 1.5× that.`,
        withheldN ? `${withheldN} 1:1${withheldN === 1 ? '' : 's'} from another line ${withheldN === 1 ? 'is' : 'are'} shown as the fact that they happened only — never the content.` : null,
      ].filter(Boolean).join(' '),
      actions: [h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openOneOnOneDialog(ctx) }, 'Log a 1:1')],
    }),
    h(
      'div',
      { class: 'stat-row' },
      stat({ label: 'Held', value: state.oneOnOnes.filter((m) => m.status === 'held').length, hint: `${state.oneOnOnes.length} logged in total${withheldN ? ` · ${withheldN} fact-only` : ''}` }),
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
    matrixLineCoverageCard(ctx),
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
                h('div', { class: 'promise-actions' },
                  h('button', {
                    class: 'btn btn-small btn-primary',
                    type: 'button',
                    'aria-label': `Prepare 1:1 with ${person.name}`,
                    onClick: () => ctx.navigate(`#/prep/${encodeURIComponent(person.id)}`),
                  }, 'Prepare'),
                  h('button', {
                    class: 'btn btn-small btn-ghost',
                    type: 'button',
                    'aria-label': `Log 1:1 with ${person.name} without opening preparation`,
                    onClick: () => openOneOnOneDialog(ctx, { personId: person.id }),
                  }, 'Log'),
                ),
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
              if (meeting.bodyWithheld) {
                // ADR-0165: another line's conversation. The fact (date, status,
                // holder) may be shown; no grade, no note, no promise.
                return h(
                  'li',
                  { class: 'meeting-item meeting-item-withheld' },
                  h(
                    'div',
                    { class: 'meeting-head' },
                    h('span', { class: 'meeting-date' }, meeting.dateUncertain ? 'Date unverified' : formatDate(meeting.date)),
                    person ? h('a', { class: 'link', href: `#/people/${person.id}` }, person.name) : h('span', { class: 'muted' }, 'Unknown person'),
                    badge(meeting.status, meeting.status === 'held' ? 'good' : 'warn'),
                    meeting.status === 'held' ? h('span', { class: 'muted tiny' }, meeting.heldById
                      ? `Held by: ${meeting.heldById === 'leader' ? (state.settings.leaderName || 'Workspace leader') : personFor(meeting.heldById)?.name || 'holder not visible'}`
                      : 'Holder not recorded') : null,
                  ),
                  h('p', { class: 'note note-lock' }, meeting.bodyWithheldReason || 'This conversation belongs to the people in the room; this seat sees that it happened.'),
                );
              }
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
                  h('span', { class: 'meeting-date' }, meeting.dateUncertain ? 'Date unverified' : formatDate(meeting.date)),
                  person ? h('a', { class: 'link', href: `#/people/${person.id}` }, person.name) : h('span', { class: 'muted' }, 'Unknown person'),
                  badge(meeting.status, meeting.status === 'held' ? 'good' : 'warn'),
                  meeting.status === 'held' ? h('span', { class: 'muted tiny' }, meeting.heldById
                    ? `Held by: ${meeting.heldById === 'leader' ? (state.settings.leaderName || 'Workspace leader') : personFor(meeting.heldById)?.name || 'holder not visible'}`
                    : 'Holder not recorded') : null,
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
