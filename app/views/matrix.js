/**
 * app/views/matrix.js — `#/matrix`, the Matrix Accountability Ledger
 * (ADR-0140, Schema v119).
 *
 * Four panels, four questions a single-chain org chart cannot answer:
 *
 *   Desk    does the roll-up add up? Every manager's span, added together,
 *           against the headcount, as exact integer hundredths.
 *   Lines   every declared reporting line, dated in and dated out.
 *   Rights  who decides what, for each person on more than one line.
 *   Review  the bounded queue, worst first.
 *
 * WHAT THIS SCREEN REFUSES TO PRINT
 * ---------------------------------
 *  - An undeclared allocation as a number. It prints "undeclared" and counts it.
 *  - A total that balances when the rows do not. `balances` and `auditClean` are
 *    two separate claims and are printed as two separate lines.
 *  - A named manager row above the declared detail ceiling, or below the export
 *    cell floor: it prints the counts and the reason instead.
 *  - A resolved owner for work that touches someone with three managers. The
 *    ledger names all three and calls the routing ambiguous, because picking one
 *    silently is a decision the system is not entitled to make.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import {
  MATRIX_CSV_COLUMNS,
  MATRIX_FINDINGS,
  MATRIX_METHOD,
  MATRIX_PANELS,
  MATRIX_RIGHTS,
  MATRIX_RIGHT_STATE_LABELS,
  MATRIX_SHARE_STATE_LABELS,
  matrixLineKind,
} from '../core/domain/matrixRegistry.js';

const PANELS = MATRIX_PANELS;

let apiRef = null;

const panelFor = (query) => {
  const key = query?.get?.('panel');
  return PANELS.some((p) => p.key === key) ? key : 'desk';
};
const go = (ctx, panel) => ctx.navigate(`#/matrix?panel=${encodeURIComponent(panel)}`);
const num = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const findingsLabel = (key) => MATRIX_FINDINGS.find((f) => f.key === key)?.label || key;

function notify(result, message) {
  if (!result?.ok) { toast(result?.error || 'The matrix action was refused.', 'bad'); return false; }
  toast(message, 'good');
  return true;
}

function toneForShareState(state) {
  if (state === 'over') return 'bad';
  if (state === 'under' || state === 'undeclared') return 'warn';
  return 'good';
}

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, candidates, presetPersonId = null) {
  const people = candidates.people || [];
  const managers = candidates.managers || [];
  if (!people.length || !managers.length) {
    toast('There is nobody in this seat’s span to declare a line for, and nobody to declare it to.', 'bad');
    return;
  }
  const kinds = (candidates.kinds || []).filter((k) => k.role === 'secondary');
  const form = buildForm([
    {
      name: 'personId', label: 'Who is this line about?', type: 'select',
      value: presetPersonId || people[0].personId,
      help: 'The person who becomes accountable to a second manager. Only people this seat can see are offered.',
      options: people.map((p) => ({ value: p.personId, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` })),
    },
    {
      name: 'managerId', label: 'Accountable to', type: 'select', value: managers[0].managerId,
      help: 'The additional manager. Their home-line manager is not offered: the roster already records that line.',
      options: managers.map((m) => ({ value: m.managerId, label: `${m.name}${m.isLeader ? ' (the workspace leader)' : ''}` })),
    },
    {
      name: 'kind', label: 'What kind of line is it?', type: 'select', value: kinds[0]?.key || 'project',
      help: 'Project is a dated piece of work; product is what gets built and in what order; cross-functional is a capability that cuts several units; administrative is time, expenses and leave only.',
      options: (candidates.kinds || []).map((k) => ({ value: k.key, label: `${k.label} — ${k.hint}` })),
    },
    {
      name: 'shareH', label: 'Allocation (whole %) — leave blank if it is not agreed yet', type: 'number', value: '',
      help: 'The share of this person’s capacity this line owns. Blank is honest and prints as UNDECLARED; the engine never splits the difference for you.',
    },
    {
      name: 'rights', label: 'Which decision rights does this line hold?', type: 'boolean-block', value: [],
      help: 'The home line is presumed to hold pay, performance assessment and absence approval. Anything you tick here is held as well — and if the home line also holds it, that right becomes CONTESTED, which is the truth about the decision.',
      options: (candidates.rights || []).map((r) => ({ value: r.key, label: `${r.label} — ${r.question}` })),
    },
    { name: 'fromISO', label: 'From (YYYY-MM-DD)', type: 'date', value: '', help: 'Blank means today. A line that has not started yet is not active and is attributed to nobody.' },
    { name: 'toISO', label: 'Until (optional)', type: 'date', value: '', help: 'A dated line stops being counted the day after it ends. Blank means open-ended.' },
    { name: 'note', label: 'What is this person answerable for on this line?', type: 'textarea', value: '', rows: 3, help: 'One line. These are the words the next reader sees, not a summary.' },
  ]);
  openModal({
    title: 'Declare a reporting line',
    description: 'A line is an accountability, not a mailing list: the manager you name will see this person’s open work from the moment you save.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.matrixDeclareLine({
            ...values,
            shareH: values.shareH === '' ? null : values.shareH,
            fromISO: values.fromISO || null,
            toISO: values.toISO || null,
          });
          if (!notify(result, 'Reporting line declared — the work now reaches both managers.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Declare the line'),
    ],
  });
}

function retuneDialog(ctx, line, candidates) {
  const form = buildForm([
    {
      name: 'shareH', label: 'Allocation (whole %)', type: 'number',
      value: line.declaredShareH === null ? '' : String(line.declaredShareH),
      help: `Currently ${line.shareDisplay === null ? 'UNDECLARED — attributed to nobody' : line.shareDisplay}. The previous value is kept on the row.`,
    },
    {
      name: 'rights', label: 'Decision rights this line holds', type: 'boolean-block', value: line.rights || [],
      options: (candidates.rights || []).map((r) => ({ value: r.key, label: `${r.label} — ${r.question}` })),
      help: 'Tick only what this line actually decides. Two managers holding the same right is reported as contested, not averaged away.',
    },
  ]);
  openModal({
    title: `Retune — ${line.personName} → ${line.managerName}`,
    description: `${matrixLineKind(line.kind)?.label || line.kind} line, from ${line.fromISO || '—'}. A retuned allocation is a new agreement, so the old one stays on the record.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.matrixRetuneLine({
            id: line.declarationId,
            shareH: values.shareH === '' ? null : values.shareH,
            rights: values.rights,
          });
          if (!notify(result, 'Allocation retuned — the previous value stays on the row.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'Record the new allocation'),
    ],
  });
}

function endDialog(ctx, line) {
  const form = buildForm([
    { name: 'reason', label: 'Why does this line no longer hold?', type: 'textarea', value: '', rows: 3, help: 'Append-only: the row is dated out with this reason and never deleted.' },
    { name: 'toISO', label: 'Ends on (YYYY-MM-DD)', type: 'date', value: '', help: 'Blank means today.' },
  ]);
  openModal({
    title: `End — ${line.personName} → ${line.managerName}`,
    description: 'The line stops being counted from the day after the end date. Everything it attributed before that stays attributed.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const values = form.getValues();
          const result = ctx.api.matrixEndLine({ id: line.declarationId, reason: values.reason, toISO: values.toISO || null });
          if (!notify(result, 'Line dated out. The history stays.')) return;
          closeAllModals();
          ctx.refresh();
        },
      }, 'End the line'),
    ],
  });
}

/* ------------------------------------------------------------------- panels */

function deskPanel(ctx, report) {
  const r = report.reconciliation;
  const headline = r.balances
    ? h('p', { class: 'lede' }, `Every span adds back to the headcount. ${r.assertedDisplay} of a person is attributed across ${r.resolvedN} attributable people, against ${r.expectedDisplay} expected.`)
    : h('p', { class: 'lede' }, `The allocations do not add back to the headcount. ${r.assertedDisplay} is attributed against ${r.expectedDisplay} expected — a net ${r.netErrorDisplay} of a person.`);

  const audit = r.auditClean
    ? h('p', { class: 'muted small' }, `Audit: the printed net figure is exactly the sum of the printed per-person deviations (${r.sumOfDeviationsH} hundredths), and the ${r.managerN} manager span(s) sum to the same ${r.fanOutH}. Nothing on this page is rounded into agreement.`)
    : banner({ tone: 'bad', title: 'The ledger is unsound', body: 'The printed total is not the sum of the printed rows. Treat every figure on this page as unverified and report it.' });

  return h('div', { class: 'stack' },
    headline,
    audit,
    h('div', { class: 'stat-grid' },
      stat({ label: 'People', value: num(r.peopleN), hint: 'active roster' }),
      stat({ label: 'Reporting lines', value: num(r.lineN), hint: `${r.secondaryLineN} additional` }),
      stat({ label: 'On more than one line', value: num(r.multiLineN), hint: 'the matrix', tone: r.multiLineN ? 'warn' : '' }),
      stat({ label: 'Attributed', value: r.assertedDisplay, hint: `expected ${r.expectedDisplay}` }),
      stat({ label: 'Net error', value: r.netErrorDisplay, hint: r.balances ? 'the roll-up balances' : 'does not balance', tone: r.balances ? 'good' : 'bad' }),
      stat({ label: 'Undeclared', value: num(r.undeclaredN), hint: 'attributed to nobody', tone: r.undeclaredN ? 'warn' : '' }),
      stat({ label: 'Over-committed', value: num(r.overN), hint: 'more than one person', tone: r.overN ? 'bad' : '' }),
      stat({ label: 'Under-allocated', value: num(r.underN), hint: 'accountable to nobody', tone: r.underN ? 'warn' : '' }),
    ),

    card({
      title: 'Every span, added up',
      subtitle: `Attributed shares in whole hundredths of a person. ${r.soleLineN} person(s) hold a single line, so the whole person is theirs by arithmetic — this is labelled, never assumed.`,
      actions: [h('button', {
        class: 'btn btn-small', type: 'button',
        onClick: () => { const c = ctx.api.matrixCandidates?.(); if (c?.ok) declareDialog(ctx, c); },
      }, 'Declare a line')],
      body: report.spans.length
        ? table({
          caption: 'Attributed capacity per manager, across every reporting line',
          columns: [
            { label: 'Manager', render: (row) => (row.withheld ? h('span', { class: 'muted' }, 'withheld') : row.name) },
            { label: 'Direct', key: 'directN' },
            { label: 'Attributed', render: (row) => row.attributedDisplay },
            { label: 'Also on another line', key: 'sharedN' },
            { label: 'Undeclared', key: 'undeclaredN' },
            { label: 'Over-committed', key: 'overN' },
          ],
          rows: report.spans,
        })
        : emptyState({ title: 'No reporting line reaches anybody yet', body: 'Declare an additional line and this table fills in.' }),
    }),
    report.spansRemainderN
      ? h('p', { class: 'muted small' }, `${report.spansRemainderN} further manager row(s) are not shown: the table is capped at ${report.conventions.managerCap}. The cap is declared and the remainder is counted, not dropped.`)
      : null,

    card({
      title: 'Per person',
      subtitle: 'The share states a leader acts on. An undeclared split is attributed to nobody rather than divided by guesswork.',
      body: report.people.length
        ? table({
          caption: 'Declared allocations per person',
          columns: [
            { label: 'Person', key: 'name' },
            { label: 'Lines', key: 'lineN' },
            { label: 'Total', render: (row) => (row.totalDisplay ?? h('span', { class: 'muted' }, 'undeclared')) },
            { label: 'State', render: (row) => badge(row.shareStateLabel, toneForShareState(row.shareState)) },
            { label: 'Deviation', render: (row) => (row.deviationDisplay ?? '—') },
            { label: 'Source', render: (row) => (row.shareSource === 'sole-line' ? h('span', { class: 'muted small' }, 'sole line — by arithmetic') : row.shareSource === 'refused' ? h('span', { class: 'muted small' }, 'refused') : 'declared') },
          ],
          rows: report.people,
        })
        : emptyState({ title: 'Nobody in this seat’s span' }),
    }),
    report.peopleRemainderN
      ? h('p', { class: 'muted small' }, `${report.peopleRemainderN} further person row(s) are not shown: the table is capped at ${report.conventions.peopleCap}. The remainder is counted.`)
      : null,
  );
}

function linesPanel(ctx, report) {
  const rows = [];
  for (const person of report.people) {
    for (const line of person.lines) {
      rows.push({ ...line, personName: person.name, personId: person.personId });
    }
  }
  const ended = report.inactiveLines || [];
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'One row per reporting line. A line is dated in, dated out and never deleted: a reporting line that quietly disappeared is an accountability nobody can be asked about.'),
    rows.length
      ? card({
        title: 'Active lines',
        subtitle: `${rows.length} line(s) across ${report.people.length} person(s) in this seat’s span.`,
        body: table({
          caption: 'Active reporting lines',
          columns: [
            { label: 'Person', key: 'personName' },
            { label: 'Manager', key: 'managerName' },
            { label: 'Kind', render: (row) => `${row.kindLabel}${row.role === 'primary' ? ' (home)' : ''}` },
            { label: 'Allocation', render: (row) => (row.shareDisplay ?? h('span', { class: 'muted' }, 'undeclared')) },
            { label: 'Rights', render: (row) => (row.rights.length
              ? h('span', { class: 'small' }, row.rights.map((k) => MATRIX_RIGHTS.find((x) => x.key === k)?.label || k).join(', ')
                + (row.presumedRights.length ? ' (presumed: ' + row.presumedRights.map((k) => MATRIX_RIGHTS.find((x) => x.key === k)?.label || k).join(', ') + ')' : ''))
              : h('span', { class: 'muted small' }, 'none declared')) },
            { label: 'Window', render: (row) => `${row.fromISO || '—'} → ${row.toISO || 'open'}` },
            { label: 'Actions', render: (row) => h('div', { class: 'row-actions' },
              row.role === 'primary'
                ? h('span', { class: 'muted small' }, 'edit on the roster')
                : h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => retuneDialog(ctx, row, ctx.api.matrixCandidates?.() || {}) }, 'Retune'),
              row.role !== 'primary'
                ? h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => endDialog(ctx, row) }, 'End')
                : null) },
          ],
          rows,
        }),
      })
      : emptyState({ title: 'No active reporting line', body: 'Declare the first one and this page becomes the register.' }),
    ended.length
      ? card({
        title: 'Dated out',
        subtitle: 'Kept, never deleted. Each row carries the day and the reason it stopped holding.',
        body: table({
          caption: 'Ended reporting lines',
          columns: [
            { label: 'Person', render: (row) => report.people.find((p) => p.personId === row.personId)?.name || row.personId },
            { label: 'Manager', render: (row) => row.managerId },
            { label: 'Kind', render: (row) => matrixLineKind(row.kind)?.label || row.kind },
            { label: 'Window', render: (row) => `${row.fromISO || '—'} → ${row.toISO || '—'}` },
            { label: 'Reason', render: (row) => row.endReason || h('span', { class: 'muted' }, '—') },
          ],
          rows: ended,
        }),
      })
      : null,
  );
}

function seatsPanel(ctx, report) {
  const s = report.seats;
  const lineLabel = (row) => row.kinds.map((k) => matrixLineKind(k)?.label || k).join(', ') || '—';
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'A tree can route work to one manager. A matrix routes it to every manager on the person’s lines — and then the seat has to be able to read what arrived. This panel is the read side: who holds people on a declared line, how much open work reaches them only through that line, and which line holders the roster cannot seat at all.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'Line managers', value: num(s.managerN), hint: 'hold people on a declared line', tone: s.managerN ? 'warn' : '' }),
      stat({ label: 'People on a line', value: num(s.peopleOnLinesN), hint: `${s.lineOnlyPeopleN} the tree hides from that manager` }),
      stat({ label: 'Seatable', value: num(s.seatableN), hint: `${s.refusedN} refused`, tone: s.refusedN ? 'bad' : '' }),
      stat({ label: 'Open work in scope', value: num(s.workTotalN), hint: 'before the line is applied' }),
      stat({ label: 'Reaches only via a line', value: num(s.workLineOnlyN), hint: 'hidden by a single-chain seat', tone: s.workLineOnlyN ? 'warn' : '' }),
      stat({ label: 'Several owners', value: num(s.workSharedN), hint: 'named, never collapsed to one', tone: s.workSharedN ? 'warn' : '' }),
    ),

    h('p', { class: 'muted small' }, s.identityHolds
      ? `Audit: ${s.workTreeN} item(s) reach a manager through the reporting tree and ${s.workLineOnlyN} only through a declared line. Those two counts are built from the same ${s.workReachN} scoped item row(s), so they add to the total exactly — the split is a fact, not a proportion.`
      : banner({ tone: 'bad', title: 'The seat split does not reconcile', body: 'The tree count and the line count do not add to the scoped work total. Treat every figure on this panel as unverified and report it.' })),

    s.refusedN
      ? card({
        title: 'Refused a seat',
        subtitle: 'The matrix gave them accountability and the roster gave them no rung. A seat is refused, never invented.',
        body: h('ul', { class: 'stack small' }, s.refused.map((row) => h('li', { key: row.managerId }, row.seatReason))),
      })
      : null,

    card({
      title: 'Who the line reaches',
      subtitle: `One row per manager holding people on a declared line. “Only via line” is the subset the reporting tree does not put under them — the people a single-chain reading silently drops.`,
      body: s.rows.length
        ? table({
          caption: 'Declared-line holders and the work their line carries',
          columns: [
            { label: 'Manager', render: (row) => (row.isLeader ? `${row.name} (workspace leader)` : row.name) },
            { label: 'Tree span', key: 'treeSpanN' },
            { label: 'On a line', key: 'linePersonN' },
            { label: 'Only via line', key: 'lineOnlyN' },
            { label: 'Matrix span', key: 'matrixSpanN' },
            { label: 'Lines', render: (row) => lineLabel(row) },
            { label: 'Seat', render: (row) => badge(row.seatEligible ? 'seated' : 'refused', row.seatEligible ? 'good' : 'bad') },
          ],
          rows: s.rows,
        })
        : emptyState({ title: 'No declared additional line', body: 'Declare one on the Lines panel and the work it carries appears here.' }),
    }),
    s.remainderN
      ? h('p', { class: 'muted small' }, `${s.remainderN} further line manager row(s) are not shown: the table is capped at ${report.conventions.managerCap}. The remainder is counted, not dropped.`)
      : null,

    h('p', { class: 'muted small' }, 'A declared line is a second accountability, not a second chain. The reporting tree still decides the home line, the altitude and the disclosure class; the line only decides who else the work is owed to. Where an item has more than one accountable manager, this ledger names all of them and resolves none of them — picking one silently is a decision the engine is not entitled to make.'),
  );
}

function rightsPanel(ctx, report) {
  const s = report.rightsSummary;
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'In a matrix the question is never “who is my manager” but “who decides this”. Each of the six rights below is attributed to a named line; a right two managers hold is a conflict the structure created, and a right nobody holds is a gap the structure created. The register records both and adjudicates neither.'),
    h('div', { class: 'stat-grid' },
      stat({ label: 'Contested', value: num(s.contestedN), hint: 'held by 2+ managers', tone: s.contestedN ? 'bad' : '' }),
      stat({ label: 'Unowned', value: num(s.unownedN), hint: 'held by nobody', tone: s.unownedN ? 'warn' : '' }),
      stat({ label: 'Held by one', value: num(s.heldN), hint: 'unambiguous' }),
      stat({ label: 'People affected', value: num(s.contestedPeopleN + s.unownedPeopleN), hint: 'on more than one line' }),
    ),
    card({
      title: 'By right',
      subtitle: 'Where the structure, not the individual, is producing the conflict.',
      body: table({
        caption: 'Decision-right ownership across every multi-line person',
        columns: [
          { label: 'Right', key: 'label' },
          { label: 'Contested', key: 'contested' },
          { label: 'Unowned', key: 'unowned' },
          { label: 'Held', key: 'held' },
        ],
        rows: s.byRight,
      }),
    }),
    card({
      title: 'By person',
      subtitle: 'Only people on more than one line appear: a single line decides everything by default, and printing six rows for them would be noise.',
      body: report.rights.length
        ? table({
          caption: 'Decision rights per person on more than one line',
          columns: [
            { label: 'Person', key: 'personName' },
            { label: 'Right', key: 'rightLabel' },
            { label: 'State', render: (row) => badge(row.stateLabel, row.state === 'contested' ? 'bad' : row.state === 'unowned' ? 'warn' : 'good') },
            { label: 'Held by', render: (row) => (row.holderNames.length ? row.holderNames.join(', ') : h('span', { class: 'muted' }, 'nobody')) },
          ],
          rows: report.rights,
        })
        : emptyState({ title: 'Nobody is on more than one line yet', body: 'The rights question only exists once there are two managers to disagree.' }),
    }),
  );
}

function queuePanel(ctx, report) {
  const f = report.findings;
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'The bounded review queue, dispatched worst first. An over-commitment outranks a contested right, which outranks a right nobody owns, which outranks an undeclared allocation.'),
    h('div', { class: 'stat-grid' },
      stat({ label: 'In the queue', value: num(f.carriedN), hint: `of ${f.total}` }),
      stat({ label: 'Over-committed', value: num(report.reconciliation.overN), tone: report.reconciliation.overN ? 'bad' : '' }),
      stat({ label: 'Contested rights', value: num(report.rightsSummary.contestedN), tone: report.rightsSummary.contestedN ? 'bad' : '' }),
      stat({ label: 'Expiring', value: num(report.expiringN), hint: `within ${report.conventions.expiringDays}d` }),
    ),
    f.rows.length
      ? table({
        caption: 'Matrix review queue',
        columns: [
          { label: 'Finding', render: (row) => findingsLabel(row.finding) },
          { label: 'Person', key: 'personName' },
          { label: 'Why', key: 'detail' },
          { label: 'Managers', key: 'managers' },
        ],
        rows: f.rows,
      })
      : emptyState({ title: 'Nothing in the queue', body: 'Every declared line is balanced, every right is held by exactly one manager, and no line is about to expire.' }),
    f.remainderN
      ? h('p', { class: 'muted small' }, `${f.remainderN} further finding(s) are not shown: the queue is capped at ${report.conventions.queueCap}. The remainder is counted, never dropped.`)
      : null,
    report.defects.length
      ? card({
        title: 'Lines the engine refused',
        subtitle: 'A refused line is never repaired into a plausible one: an invented reporting line is an accountability nobody accepted.',
        body: table({
          caption: 'Refused reporting lines',
          columns: [
            { label: 'Defect', render: (row) => row.defect },
            { label: 'Person', key: 'personId' },
            { label: 'Manager', key: 'managerId' },
            { label: 'Why', key: 'detail' },
          ],
          rows: report.defects,
        }),
      })
      : null,
  );
}

function methodPanel(report) {
  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'What is declared, what is derived, and what is refused. The methods are named rather than paraphrased so they can be argued with.'),
    ...report.method.map((m) => card({ title: m.name, body: h('p', { class: 'muted' }, m.why) })),
    card({
      title: 'Declared conventions',
      subtitle: 'Printed on the page they govern, so they can be argued with before they are changed.',
      body: table({
        caption: 'Conventions',
        columns: [{ label: 'Convention', key: 'label' }, { label: 'Value', key: 'value' }],
        rows: [
          { label: 'Balance tolerance', value: `±${report.conventions.balanceHundredths} hundredths` },
          { label: 'Expiring window', value: `${report.conventions.expiringDays} days` },
          { label: 'Additional lines per person', value: report.conventions.linesPerPerson },
          { label: 'Review queue cap', value: report.conventions.queueCap },
          { label: 'Manager table cap', value: report.conventions.managerCap },
          { label: 'Person table cap', value: report.conventions.peopleCap },
          { label: 'Name withheld above rank', value: report.conventions.detailRank },
          { label: 'Automatic fan-out', value: report.conventions.autoPropagate ? 'on' : 'off' },
        ],
      }),
    }),
  );
}

/* -------------------------------------------------------------------- route */

export function renderMatrix(ctx) {
  apiRef = ctx.api;
  const result = ctx.api.matrixReport?.();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Structure', title: 'Matrix accountability' }),
      banner({ tone: 'bad', title: 'This page is not available', body: result?.error || 'The matrix report could not be built.' }));
  }
  const report = result.report;
  const panel = panelFor(ctx.query);
  const r = report.reconciliation;

  return h('div', { class: 'page' },
    pageHeader({
      eyebrow: 'Structure',
      title: 'Matrix accountability',
      subtitle: 'Who is accountable to whom, how much of them, and who decides what — with a roll-up that has to add up.',
      actions: [
        h('button', {
          class: 'btn btn-small', type: 'button',
          onClick: () => {
            const rows = apiRef?.matrixCsvRows?.();
            if (!rows?.ok) { toast(rows?.error || 'The matrix export was refused.', 'bad'); return; }
            downloadText({
              filename: `leados-matrix-${new Date().toISOString().slice(0, 10)}.csv`,
              text: serializeCsv(MATRIX_CSV_COLUMNS.map((key) => ({ key, header: key })), rows.rows),
            });
          },
        }, 'Download CSV'),
      ],
      meta: h('div', { class: 'row-actions' },
        badge(r.balances ? 'The roll-up balances' : `Net ${r.netErrorDisplay}`, r.balances ? 'good' : 'bad'),
        badge(r.auditClean ? 'audit clean' : 'AUDIT FAILED', r.auditClean ? 'good' : 'bad'),
        badge(`${r.multiLineN} on more than one line`, r.multiLineN ? 'warn' : 'neutral'),
        h('span', { class: 'muted small' }, `read from ${report.seat.label}`)),
    }),

    tabs({
      items: PANELS.map((p) => ({ key: p.key, label: p.label, hint: p.hint })),
      active: panel,
      onSelect: (key) => go(ctx, key),
      ariaLabel: 'Matrix accountability sections',
    }),
    h('p', { class: 'muted small' }, PANELS.find((p) => p.key === panel)?.hint || ''),

    panel === 'desk' ? deskPanel(ctx, report) : null,
    panel === 'lines' ? linesPanel(ctx, report) : null,
    panel === 'rights' ? rightsPanel(ctx, report) : null,
    panel === 'seats' ? seatsPanel(ctx, report) : null,
    panel === 'queue' ? queuePanel(ctx, report) : null,
    panel === 'method' ? methodPanel(report) : null,
  );
}

export default renderMatrix;
