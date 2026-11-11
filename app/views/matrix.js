/**
 * app/views/matrix.js — `#/matrix`, the Matrix Accountability Ledger
 * (ADR-0140, Schema v119).
 *
 * Panels that answer questions a single-chain org chart cannot:
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
import {
  RIGHTS_CONCORDANCE_FINDINGS,
  RIGHTS_CONCORDANCE_LIMITS_TEXT,
} from '../core/domain/rightsConcordanceRegistry.js';
// ADR-0148: the consent register. A declared share is an ask until the manager it
// was given to answers it and the person whose hours it takes acknowledges it.
import { renderConsentPanel } from './matrixConsentPanel.js';
// ADR-0157: the re-affirmation register. A declared share is renewed by silence
// only because nobody asks; this panel is the asking, and the answer can end it.
import { renderReaffirmationPanel } from './matrixReaffirmationPanel.js';
// ADR-0152: the line-exit register. A line that is dated out does not close the
// work it created; this panel reads what it left behind and who settled it.
import { renderLineExitPanel } from './matrixExitPanel.js';
// ADR-0156: the authority continuity register. A chief asks about the
// PORTFOLIO of frozen decisions, not one decision type at a time.
import { renderContinuityPanel } from './matrixContinuityPanel.js';
// ADR-0158: the period-allocation ledger. Every other surface charges a line
// at today's single share; this panel weighs what a NAMED period actually
// consumed, in exact integer share-days, or refuses the figure.
import { renderPeriodAllocationPanel } from './matrixPeriodAllocationPanel.js';
// ADR-0160: the line-activity reconciliation. The period ledger says what a line
// was CHARGED; nothing said what each line DID. This panel joins the declared
// share-days to the dated acts each line actually originated about the person in
// the same window — or refuses, and prints which side it could not read.
import { renderActivityPanel } from './matrixActivityPanel.js';
// ADR-0161: a tree span cannot see whether its people couple a manager to one
// stable counterpart or many. The coordination panel derives that topology from
// the same matrix graph, allocation gate, seat scope and automation spine.
import { renderMatrixCoordinationPanel } from './matrixCoordinationPanel.js';
// ADR-0162: bilateral management-interface operating agreements across shared
// counterpart pairs — terms, cadence forum links, joint apex escalation, expiry.
import { renderMatrixInterfacePanel } from './matrixInterfacePanel.js';
// Session 225 read-only slice: current goal carriage through the canonical
// matrix DAG, with branch overlap printed separately from distinct span totals.
import { renderGoalCarriagePanel } from './matrixGoalCarriagePanel.js';
// ADR-0169: the meeting-load & coordination-tax ledger. The cadence register has
// stored each sitting's duration and room since Schema v93; this panel reads those
// minutes per person and per line, and refuses any sitting it cannot read.
import { renderMatrixMeetingLoadPanel } from './matrixMeetingLoadPanel.js';
// ADR-0170: the segregation-of-duties register. The decision log names a Driver
// and an Approver; this panel reads the two against each other and against the
// reporting graph of the decision day — every line, not only the home chain.
import { renderMatrixSodPanel } from './matrixSodPanel.js';

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
    card({
      title: 'Line-term exposure',
      subtitle: `As of ${report.today}; ending soon means 0–${report.conventions.expiringDays} days inclusive. Home lines are excluded.`,
      body: h('div', { class: 'stack' },
        h('p', {}, `${report.termExposure.totalN} active additional line(s), ${report.termExposure.peopleN} distinct person(s). No term declared: ${report.termExposure.counts['no-term-declared']}; ending soon: ${report.termExposure.counts['ending-soon']}; dated term: ${report.termExposure.counts['dated-term']}.`),
        h('p', { class: 'muted small' }, 'Sunset-clause governance: an explicit term makes a temporary accountability reviewable. An open-ended line is not evidence of consent or a missed renewal. This register does not renew or end a line; use the governed End action below. Two-sided re-affirmation is not yet supported.'),
        h('p', { class: 'muted small' }, `Category counts reconcile: ${report.termExposure.reconciles ? 'yes' : 'NO — do not rely on these totals'}. Refused declarations in scope: ${report.termExposure.refusedLineN}; refused lines are excluded, not certified as term-reviewed.`),
        report.termExposure.rows.length ? table({
          caption: 'Active additional reporting-line terms',
          columns: [
            { label: 'Person', key: 'personName' },
            { label: 'Manager', key: 'managerName' },
            { label: 'From', render: (row) => row.fromISO || 'not declared' },
            { label: 'Until', render: (row) => row.toISO || 'not declared' },
            { label: 'Term state', key: 'state' },
            { label: 'Days remaining', render: (row) => row.daysRemaining === null ? 'withheld — no end date' : String(row.daysRemaining) },
            { label: 'Action', render: (row) => h('button', { class: 'btn btn-ghost btn-small', type: 'button', onClick: () => endDialog(ctx, row) }, 'End') },
          ],
          rows: report.termExposure.rows,
        }) : h('p', {}, 'No active additional lines in this seat’s scope.'),
        report.termExposure.remainderN ? h('p', { class: 'muted small' }, `${report.termExposure.remainderN} further term row(s) withheld by the ${report.conventions.peopleCap}-row cap. Category counts include these rows; the visible table is not the complete register.`) : null,
      ),
    }),
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

function governancePanel(ctx, report) {
  const g = report.governance;
  if (!g) return emptyState({ title: 'Governance reading unavailable', body: 'Recompute the matrix report to view joint-apex governance.' });
  const c = g.coupling;
  const pctWithBand = (pct, iv, refused, reason) => (refused || pct === null
    ? 'withheld'
    : `${pct}% (${iv.lower}–${iv.upper}%)`);

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'At executive altitude the question is never which individual split changed, but where unresolved conflicts climb in the reporting DAG and whether two supposedly separate spans share the same people underneath.'),

    !g.hasMatrix
      ? banner({
        tone: 'neutral',
        title: 'Single-chain workspace: zero cross-line escalation tax',
        body: 'No additional reporting lines are declared in scope. Every work item and decision right has one path up the reporting tree.',
      })
      : banner({
        tone: g.alertN > 0 ? 'warn' : 'good',
        title: g.alertN > 0
          ? `${g.alertN} matrix governance condition(s) require structural resolution`
          : 'Declared matrix governance checks hold on this record',
        body: g.alertN > 0
          ? 'No composite score is computed here: each capacity, decision-right, seat and DAG convergence check prints its own verdict below.'
          : 'Allocations balance, operational and stewardship rights have single holders, all line managers seat cleanly and every cross-line escalation has a unique joint apex.',
      }),

    h('div', { class: 'stat-grid' },
      stat({
        label: 'Operational rights contested',
        value: num(g.contestedOperationalN),
        hint: `priority ${g.contestedPriorityN} · assignment ${g.contestedAssignmentN} · technical ${g.contestedTechnicalN}`,
        tone: g.contestedOperationalN ? 'bad' : '',
      }),
      stat({
        label: 'Stewardship rights contested',
        value: num(g.contestedStewardshipN),
        hint: `${g.unownedOperationalN + g.unownedStewardshipN} unowned right(s) overall`,
        tone: g.contestedStewardshipN ? 'warn' : '',
      }),
      stat({
        label: 'Joint escalation apexes',
        value: num(g.apexRows.length),
        hint: g.apexAmbiguousN ? `${g.apexAmbiguousN} ambiguous diamond tie(s)` : 'all converge cleanly',
        tone: g.apexAmbiguousN ? 'bad' : (g.apexRows.length ? 'warn' : ''),
      }),
      stat({
        label: 'Coupled span pairs',
        value: num(c.coupledSpanPairsN),
        hint: c.maxManagersOnPerson > 1 ? `up to ${c.maxManagersOnPerson} managers on one person` : 'independent spans',
        tone: c.coupledSpanPairsN ? 'warn' : '',
      }),
      stat({
        label: 'Multi-line headcount share',
        value: pctWithBand(c.multiLineSharePct, c.multiLineInterval, c.peopleRateRefused, c.peopleRateReason),
        hint: c.peopleRateRefused ? c.peopleRateReason : `${c.multiLinePeopleN} of ${c.peopleN} in scope (Wilson 95%)`,
      }),
      stat({
        label: 'Shared multi-owner work',
        value: pctWithBand(c.sharedWorkPct, c.sharedWorkInterval, c.workRateRefused, c.workRateReason),
        hint: c.workRateRefused ? c.workRateReason : `${c.workSharedN} of ${c.workTotalN} open item(s) · ${c.workLineOnlyN} tree-hidden`,
        tone: c.workLineOnlyN ? 'warn' : '',
      }),
    ),

    card({
      title: 'Where unresolved conflicts climb (joint apex in the reporting DAG)',
      subtitle: 'Each contested right or shared work item climbs until its accountable managers share a minimal common ancestor. Diamond ties list every minimal ancestor and choose none.',
      body: g.apexRows.length
        ? table({
          caption: 'Joint-apex escalations across contested rights and shared work',
          columns: [
            { label: 'Joint apex', render: (row) => row.displayLabel },
            { label: 'Altitude', key: 'altitudeLabel' },
            { label: 'Resolution', render: (row) => badge(
              row.disconnected ? 'disconnected' : row.ambiguous ? 'ambiguous tie' : 'unique apex',
              row.ambiguous || row.disconnected ? 'bad' : 'good',
            ) },
            { label: 'Operational contested', key: 'operationalContestedN' },
            { label: 'All contested rights', key: 'contestedRightsN' },
            { label: 'Shared work', key: 'sharedWorkN' },
            { label: 'Tree-hidden items', key: 'lineOnlyWorkN' },
            { label: 'Total load', key: 'totalEscalationsN' },
          ],
          rows: g.apexRows,
        })
        : emptyState({ title: 'No cross-line escalation in scope', body: 'When two lines contest a decision right or hold shared work, its joint apex in the reporting DAG prints here.' }),
    }),

    card({
      title: 'Structural governance checks',
      subtitle: 'Five explicit binary conditions across capacity, decision rights, seats and DAG convergence — never averaged into one score.',
      actions: [h('a', { class: 'btn btn-ghost btn-small', href: '#/board?panel=discrepancies' }, 'Open Board Room cross-checks')],
      body: table({
        caption: 'Structural matrix governance checks',
        columns: [
          { label: 'Check', key: 'label' },
          { label: 'Verdict', render: (row) => badge(row.holds ? 'holds' : 'attention', row.holds ? 'good' : 'bad') },
          { label: 'Reading', key: 'detail' },
        ],
        rows: g.checks,
      }),
    }),
  );
}

/* ---------------------------------------------------------- concordance */

const CONCORDANCE_TONE = {
  bypass: 'bad',
  'contested-decided': 'warn',
  'unresolved-authority': 'warn',
  'consult-gap': 'warn',
};

function concordancePanel(ctx, report) {
  const c = report.concordance;
  const d = c.decisions;
  const f = c.findings;
  const recurrence = c.recurrence || { rows: [], recurringPatternN: 0, oneOffObservationN: 0, observationN: 0, remainderN: 0 };

  if (!c || !d) {
    return emptyState({ title: 'Concordance unavailable', body: 'Recompute the matrix report to audit the decision log against the declared line rights.' });
  }

  if (report.reconciliation.secondaryLineN === 0) {
    return h('div', { class: 'stack' },
      banner({
        tone: 'neutral',
        title: 'Single-chain workspace: the concordance has nothing to audit',
        body: 'No additional reporting lines are declared. Every person sits on exactly one line, and the rights question the audit asks — whose declared right did this decision exercise — only exists when a person has more than one manager to compare.',
      }),
      h('p', { class: 'lede' }, 'Declare a reporting line on the Lines panel and the decision log starts being read against the rights in force on each line, date by date.'),
    );
  }

  const identityRows = [
    { label: 'Audited decisions', detail: d.auditedN === d.withFindingsN + d.cleanN ? `${d.withFindingsN} with findings + ${d.cleanN} clean = ${d.auditedN}` : 'THE COUNTS DO NOT ADD UP' },
    { label: 'Findings', detail: f.totalN === f.shownN + f.withheldN ? `${f.shownN} shown + ${f.withheldN} withheld = ${f.totalN}` : 'THE COUNTS DO NOT ADD UP' },
    { label: 'Decisions read', detail: d.completedN === d.auditedN + d.unscopedN + d.singleLineN ? `${d.auditedN} audited + ${d.unscopedN} unscoped + ${d.singleLineN} single-line = ${d.completedN}` : 'THE COUNTS DO NOT ADD UP' },
  ];

  return h('div', { class: 'stack' },
    h('p', { class: 'lede' }, 'The ledger declares who holds each decision right. The decision log records who actually decided. This panel reads the log backwards through the declared lines: every completed decision is checked against the rights that were in force on every active line of the person it concerned, on the day it was made.'),

    h('div', { class: 'stat-grid' },
      stat({ label: 'Decisions read', value: num(d.completedN), hint: `of ${d.totalN} logged` }),
      stat({ label: 'Audited', value: num(d.auditedN), hint: 'multi-line subject in the record' }),
      stat({ label: 'With findings', value: num(d.withFindingsN), tone: d.withFindingsN ? 'warn' : '' }),
      stat({ label: 'Recurring patterns', value: num(recurrence.recurringPatternN), hint: `${recurrence.oneOffObservationN} one-off structural observation(s)`, tone: recurrence.recurringPatternN ? 'warn' : '' }),
      stat({ label: 'Clean', value: num(d.cleanN), hint: 'decided inside the declared rights' }),
      stat({ label: 'Unscoped', value: num(d.unscopedN), hint: 'no subject in the record', tone: d.unscopedN ? 'warn' : '' }),
      stat({ label: 'Unresolved decider', value: num(d.unresolvedDeciderN), hint: 'not on the roster', tone: d.unresolvedDeciderN ? 'warn' : '' }),
    ),

    card({
      title: 'The reconciliation',
      subtitle: 'Every count on this page is one of these identities — printed, so a reader can check the arithmetic instead of trusting it.',
      body: table({
        caption: 'Concordance identities',
        columns: [
          { label: 'Identity', key: 'label' },
          { label: 'Reading', key: 'detail' },
        ],
        rows: identityRows,
      }),
    }),

    recurrence.rows.length
      ? card({
        title: 'Recurring structural patterns',
        subtitle: `${recurrence.recurringPatternN} pattern(s) recur across distinct decisions · ${recurrence.recurringObservationN} repeated observations · ${recurrence.oneOffObservationN} one-off observations. Grouped by process finding, line kinds and rights — never by person.`,
        body: table({
          caption: 'Repeated matrix decision-right patterns',
          columns: [
            { label: 'Structural finding', render: (row) => RIGHTS_CONCORDANCE_FINDINGS.find((f) => f.key === row.kind)?.label || row.kind },
            { label: 'Line kinds', render: (row) => row.lineKinds.join(' + ') || 'not declared' },
            { label: 'Rights', render: (row) => row.rightKeys.length ? row.rightKeys.join(', ') : 'none specified' },
            { label: 'Distinct decisions', key: 'decisionN' },
            { label: 'First', key: 'firstOn' },
            { label: 'Latest', key: 'lastOn' },
          ],
          rows: recurrence.rows,
        }),
      })
      : emptyState({
        title: 'No recurring structural pattern in the audited decisions',
        body: `${recurrence.observationN} distinct decision-pattern observation(s) were checked. A recurrence requires the same structural finding, line-kind set and right set on at least two distinct decisions; this is a design signal, not a rating of any person.`,
      }),

    recurrence.remainderN
      ? h('p', { class: 'muted small' }, `${recurrence.remainderN} further recurring pattern(s) are not shown; all are included in the exported audit and counted here.`)
      : null,

    f.rows.length
      ? card({
        title: 'Findings, worst first',
        subtitle: `${f.shownN} in scope under this seat · ${f.withheldN} withheld as outside the seat's span (counted, never shown).`,
        body: table({
          caption: 'Decision-right execution findings',
          columns: [
            { label: 'Finding', render: (row) => badge(row.kindLabel, CONCORDANCE_TONE[row.kind] || 'warn') },
            { label: 'Decision', key: 'title' },
            { label: 'Subject', render: (row) => (row.subjectName || h('span', { class: 'muted' }, 'outside this seat')) },
            { label: 'Decider', render: (row) => (row.approverName || h('span', { class: 'muted' }, row.approverResolved ? 'outside this seat' : 'not on roster')) },
            { label: 'Date', key: 'decidedOn' },
            { label: 'Detail', key: 'detail' },
          ],
          rows: f.rows,
        }),
      })
      : emptyState({
        title: 'Every audited decision was made inside the declared rights',
        body: 'No completed decision sits outside the rights the organisation declared on the person it concerned, no contested right was picked without arbitration, no unowned right was filled by the act, and every operational right-holder was consulted.',
      }),

    f.remainderN
      ? h('p', { class: 'muted small' }, `${f.remainderN} further finding(s) are not shown: the queue is capped at ${c.conventions.findingsCap}. The remainder is counted, never dropped.`)
      : null,

    d.unscopedN + d.unresolvedDeciderN + d.danglingSubjectN + c.scopeCounts['single-line-subject'] > 0
      ? card({
        title: 'What was counted out, and why',
        subtitle: 'These are limits of the comparison, not findings against anyone — printed so the audit cannot read as more complete than the record.',
        body: table({
          caption: 'Scope limits',
          columns: [
            { label: 'Limit', render: (row) => c.scopeLabels[row.key] || row.key },
            { label: 'Count', key: 'n' },
            { label: 'Why it is not a finding', key: 'why' },
          ],
          rows: [
            { key: 'unscoped-decision', n: d.unscopedN, why: 'The decision names a decider but no subject in the typed graph. The audit refuses to guess whose lines govern.' },
            { key: 'unresolved-decider', n: d.unresolvedDeciderN, why: 'The recorded approver is not on the roster (or the name matches several people). DACI names are free text by design.' },
            { key: 'single-line-subject', n: c.scopeCounts['single-line-subject'], why: 'The subject sits on exactly one line — the rights question only exists on more than one.' },
            { key: 'dangling-subject', n: d.danglingSubjectN, why: 'A linked subject who is not on the roster. Dropped and counted, never repaired.' },
          ],
        }),
      })
      : null,

    card({
      title: 'The method',
      subtitle: 'Named, so it can be argued with.',
      body: h('div', { class: 'stack' },
        ...c.method.map((m) => h('div', { class: 'stack-tight' },
          h('strong', {}, m.name),
          h('p', { class: 'muted small' }, m.why))),
      ),
    }),

    card({
      title: 'Honest limits',
      subtitle: 'Printed on the page, so the reading cannot be mistaken for a complete audit of the decision log.',
      body: h('ul', { class: 'muted small' },
        ...RIGHTS_CONCORDANCE_LIMITS_TEXT.map((text) => h('li', {}, text))),
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
    panel === 'exit' ? renderLineExitPanel(ctx) : null,
    panel === 'consent' ? renderConsentPanel(ctx) : null,
    panel === 'renewal' ? renderReaffirmationPanel(ctx) : null,
    panel === 'allocation' ? renderPeriodAllocationPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'activity' ? renderActivityPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'meeting-load' ? renderMatrixMeetingLoadPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'coordination' ? renderMatrixCoordinationPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'interfaces' ? renderMatrixInterfacePanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'goal-carriage' ? renderGoalCarriagePanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`), seat: report.seat }) : null,
    panel === 'rights' ? rightsPanel(ctx, report) : null,
    panel === 'concordance' ? concordancePanel(ctx, report) : null,
    panel === 'sod' ? renderMatrixSodPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'continuity' ? renderContinuityPanel(ctx, { now: new Date(`${report.today}T12:00:00.000Z`) }) : null,
    panel === 'seats' ? seatsPanel(ctx, report) : null,
    panel === 'governance' ? governancePanel(ctx, report) : null,
    panel === 'queue' ? queuePanel(ctx, report) : null,
    panel === 'method' ? methodPanel(report) : null,
  );
}

export default renderMatrix;
