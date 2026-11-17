/**
 * app/views/personalDealing.js — `#/personal-dealing`, the Personal-Account
 * Dealing & Insider-List Register (ADR-0245, Schema v199).
 *
 * ONE reader (`buildPersonalDealing`) stands behind every window verdict,
 * clearance state, dealing state, days-late figure, days-inside figure and count
 * this page prints. The page formats what the reader returned; it computes no
 * window, no validity and no verdict of its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - the written designation that puts a named person on the insider list;
 *  - the declared closed period, its anchor disclosure day and its exact
 *    first and last closed day;
 *  - the clearance request as its own dated act;
 *  - the decision as a SEPARATE dated act by a hand strictly above the
 *    requester, with its declared validity day or its written refusal reason;
 *  - the executed dealing against the window it fell in and the clearance it
 *    cites, with the exact days inside the window or outside the validity.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It never reads a request as an approval, never
 * prints silence as consent, never summarises a breach as a percentage, and never
 * scores a person. There is no risk rating here and there will not be one.
 *
 * DISCLOSURE LADDER. Above rank 2 the reader withholds every name, designation
 * basis, security reference, broker reference, quantity and day, and the page
 * prints that narrowing as a rendering contract rather than an authentication
 * boundary — this workspace has no authentication, and implying otherwise would be
 * the lie that hurts people.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  DWL_BASES,
  DWL_CSV_SCOPE,
  DWL_EVENT_KINDS,
  DWL_HREF,
  DWL_LIMITS,
  DWL_METHOD,
  DWL_SECTION_TITLES,
  DWL_SIDES,
} from '../core/domain/personalDealingRegistry.js';

const L = DWL_LIMITS;
const PANELS = [
  { key: 'list', label: DWL_SECTION_TITLES.list },
  { key: 'windows', label: DWL_SECTION_TITLES.windows },
  { key: 'clearances', label: DWL_SECTION_TITLES.clearances },
  { key: 'dealings', label: DWL_SECTION_TITLES.dealings },
  { key: 'method', label: DWL_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', neutral: 'neutral' };
const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

function stateBadge(state, testid) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    ...(testid ? { 'data-testid': testid } : {}),
  }, state.label);
}

const dayLabel = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : '—');
const daysLabel = (n) => (n === null || n === undefined ? '—' : n === 0 ? 'today' : n > 0 ? `${n} day${n === 1 ? '' : 's'} ago` : `in ${-n} day${n === -1 ? '' : 's'}`);

/* ------------------------------------------------------------------ dialogs */

/** One submit path for every dialog: refuse, show the field error, or close. */
function submitVia(form, call, { success, onDone }) {
  form.clearErrors();
  const result = call(form.getValues());
  if (!result?.ok) {
    if (result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The act was refused.', 'bad');
    return;
  }
  closeAllModals();
  toast(success(result), 'good');
  onDone?.();
}

function dialog({ title, description, fields, call, success, onDone }) {
  const form = buildForm(fields);
  openModal({
    title,
    description,
    body: form.node,
    footer: [
      button('Cancel', () => closeAllModals()),
      button('Record', () => submitVia(form, call, { success, onDone }), { primary: true }),
    ],
  });
}

function declareDesignationDialog(ctx, local, onDone) {
  dialog({
    title: 'Declare a designation',
    description: 'A named person on the insider list, on a written instrument, from a stated day.',
    fields: [
      { name: 'personId', label: 'Person', type: 'select', required: true, options: options((local.people || []).map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` · ${row.role}` : ''}` })), { blank: 'Choose a person' }), help: 'A designation is about a named hand. No list is inferred from a job title.' },
      { name: 'basis', label: 'Basis', type: 'select', required: true, options: options(DWL_BASES.map((row) => ({ value: row.key, label: row.label }))), help: 'A title is not a legal basis. Choose the one that actually applies.' },
      { name: 'instrumentRef', label: 'The written instrument', type: 'text', required: true, help: `At least ${L.instrumentRefMin} characters: the policy clause, the appointment letter, the engagement.` },
      { name: 'declaredOn', label: 'Day it takes effect (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'endsOn', label: 'Day it ends (optional, may be future)', type: 'text' },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.dwlDeclareDesignation(values),
    success: () => 'Designation declared on its written instrument.',
    onDone,
  });
}

function endDesignationDialog(ctx, local, designationId, onDone) {
  dialog({
    title: 'End a designation',
    description: 'The day the person comes off the insider list. A designation ends once.',
    fields: [
      { name: 'designationId', label: 'Designation', type: 'select', required: true, value: designationId, options: options((local.designations || []).filter((row) => !row.endsOn).map((row) => ({ value: row.id, label: `${row.personName} · ${row.basisLabel} · from ${row.declaredOn}` })), { blank: 'Choose a live designation' }) },
      { name: 'endsOn', label: 'Day it ends (YYYY-MM-DD)', type: 'text', required: true, help: 'On or after the day it began. The whole of that day still counts as designated.' },
    ],
    call: (values) => ctx.api.dwlEndDesignation(values),
    success: () => 'Designation ended.',
    onDone,
  });
}

function declareEventDialog(ctx, local, onDone) {
  dialog({
    title: 'Declare a closed period',
    description: 'The disclosure day and the exact whole days closed before and after it. There is no default window.',
    fields: [
      { name: 'kind', label: 'Kind of event', type: 'select', required: true, options: options(DWL_EVENT_KINDS.map((row) => ({ value: row.key, label: row.label }))) },
      { name: 'subject', label: 'What information this window protects', type: 'text', required: true, help: `At least ${L.subjectMin} characters.` },
      { name: 'disclosesOn', label: 'The day it is disclosed publicly (YYYY-MM-DD)', type: 'text', required: true, help: 'May be in the future: a scheduled results date is declared before it happens.' },
      { name: 'beforeDays', label: 'Whole days closed BEFORE it', type: 'number', min: L.beforeDaysMin, max: L.beforeDaysMax, required: true, help: 'Zero is a legitimate declaration. A missing number is not, and the register holds no default.' },
      { name: 'afterDays', label: 'Whole days closed AFTER it', type: 'number', min: L.afterDaysMin, max: L.afterDaysMax, required: true, help: 'Zero closes the disclosure day itself and re-opens the day after.' },
      { name: 'scopeLineIds', label: 'Scope — reporting line ids, comma-separated (blank = whole market)', type: 'text', help: 'Leave blank for a whole-market closed period that binds every designated person. Name lines to bind only the people they hold.' },
    ],
    call: (values) => ctx.api.dwlDeclareEvent({
      ...values,
      beforeDays: Number(values.beforeDays),
      afterDays: Number(values.afterDays),
      scopeLineIds: String(values.scopeLineIds || '').split(',').map((part) => part.trim()).filter(Boolean),
    }),
    success: () => 'Closed period declared with its exact window.',
    onDone,
  });
}

function requestClearanceDialog(ctx, local, personId, onDone) {
  dialog({
    title: 'Request a clearance',
    description: 'What you want to trade, on which side, and how much. A request is not an approval.',
    fields: [
      { name: 'personId', label: 'Person', type: 'select', required: true, value: personId, options: options((local.people || []).map((row) => ({ value: row.id, label: row.name })), { blank: 'Choose yourself or a hand you hold' }) },
      { name: 'securityRef', label: 'Security', type: 'text', required: true, help: `The reference the broker or the instrument uses, at least ${L.securityRefMin} characters. The register holds no market feed and resolves no ticker.` },
      { name: 'side', label: 'Side', type: 'select', required: true, options: options(DWL_SIDES.map((row) => ({ value: row.key, label: row.label }))) },
      { name: 'quantity', label: 'Whole quantity', type: 'number', min: L.quantityMin, max: L.quantityMax, required: true, help: 'Refused rather than rounded: a clearance for “about” a number of shares approves nothing exact.' },
      { name: 'reason', label: 'Note for the decider (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.dwlRequestClearance({ ...values, quantity: Number(values.quantity) }),
    success: (result) => `Clearance requested; a decision is owed by ${result.dueOn || 'the declared turnaround'}.`,
    onDone,
  });
}

function decideClearanceDialog(ctx, local, clearanceId, onDone) {
  const target = (local.clearances || []).find((row) => row.id === clearanceId) || null;
  dialog({
    title: 'Decide a clearance',
    description: 'Decision control must sit apart from decision management: only a hand strictly above the requester may decide this.',
    fields: [
      { name: 'clearanceId', label: 'Clearance', type: 'select', required: true, value: clearanceId, options: options((local.clearances || []).filter((row) => !row.hasDecision).map((row) => ({ value: row.id, label: `${row.personName} · ${row.quantity} ${row.side} · ${row.securityRef}` })), { blank: 'Choose an open clearance' }) },
      { name: 'outcome', label: 'Decision', type: 'select', required: true, options: options([{ value: 'cleared', label: 'Cleared' }, { value: 'refused', label: 'Refused' }]) },
      { name: 'decidedOn', label: 'Day of the decision (YYYY-MM-DD)', type: 'text', required: true, help: 'On or after the day it was requested.' },
      { name: 'validityDays', label: 'If cleared: whole days it stays valid', type: 'number', min: 1, max: L.validityMaxDays, help: 'Required when clearing. Without it a clearance would approve a trade indefinitely.' },
      { name: 'reason', label: 'Reason (required for a refusal)', type: 'textarea', rows: 3, help: `A refusal must state its written reason, at least ${L.textMin} characters. A refusal nobody explained is not a decision anybody can appeal.` },
    ],
    call: (values) => ctx.api.dwlDecideClearance({
      ...values,
      validityDays: values.validityDays === '' || values.validityDays === undefined ? null : Number(values.validityDays),
    }),
    success: (result) => (result.validThrough ? `Cleared, valid through ${result.validThrough}.` : 'Refused with its written reason.'),
    onDone,
  });
}

function recordDealingDialog(ctx, local, personId, onDone) {
  const openClearances = (local.clearances || []).filter((row) => row.decisionId ? false : true);
  dialog({
    title: 'Record an executed dealing',
    description: 'The broker has confirmed it. A bad trade is still a fact: this records it and the register prints what it breached.',
    fields: [
      { name: 'personId', label: 'Person', type: 'select', required: true, value: personId, options: options((local.people || []).map((row) => ({ value: row.id, label: row.name })), { blank: 'Choose a hand you hold' }) },
      { name: 'securityRef', label: 'Security', type: 'text', required: true, help: 'The reference the broker uses.' },
      { name: 'side', label: 'Side', type: 'select', required: true, options: options(DWL_SIDES.map((row) => ({ value: row.key, label: row.label }))) },
      { name: 'quantity', label: 'Whole quantity', type: 'number', min: L.quantityMin, max: L.quantityMax, required: true },
      { name: 'dealtOn', label: 'Day the trade executed (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'brokerRef', label: 'Broker contract-note reference', type: 'text', required: true, help: `At least ${L.brokerRefMin} characters. The trade is recorded against the note that proves it.` },
      { name: 'clearanceId', label: 'Clearance it cites (optional)', type: 'select', options: options(openClearances.map((row) => ({ value: row.id, label: `${row.personName} · ${row.quantity} ${row.side} · ${row.stateKey}` })), { blank: 'No clearance cited' }), help: 'Leave blank if nothing approved it. The register prints “no clearance” rather than inventing one.' },
      { name: 'note', label: 'Note (optional)', type: 'textarea', rows: 2 },
    ],
    call: (values) => ctx.api.dwlRecordDealing({ ...values, quantity: Number(values.quantity) }),
    success: () => 'Executed dealing recorded against its contract note.',
    onDone,
  });
}

function conventionsDialog(ctx, report, onDone) {
  dialog({
    title: 'Register conventions',
    description: 'The clearance turnaround and the privacy floor. Neither is fitted from the record, and there is no default window here.',
    fields: [
      { name: 'dwlClearanceTurnaroundDays', label: 'Whole days a clearance request stays open before it is overdue', type: 'number', min: 1, max: 30, required: true, value: report.conventions.dwlClearanceTurnaroundDays },
      { name: 'dwlPrivacyFloor', label: 'Privacy floor for the per-state export', type: 'number', min: 2, max: 20, required: true, value: report.conventions.dwlPrivacyFloor },
    ],
    call: (values) => ctx.api.dwlSetConventions({
      patch: {
        dwlClearanceTurnaroundDays: Number(values.dwlClearanceTurnaroundDays),
        dwlPrivacyFloor: Number(values.dwlPrivacyFloor),
      },
    }),
    success: () => 'Conventions re-declared.',
    onDone,
  });
}

/* ------------------------------------------------------------------- panels */

function summaryCard(report) {
  return card({
    title: 'What the register is carrying',
    subtitle: 'Every figure is the reader’s own; nothing is stored and nothing is rounded.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'On the insider list', value: String(report.totals.listedPeople), hint: `${report.totals.liveDesignations} live designation(s)`, action: h('span', { 'data-testid': 'dwl-count-listed', class: 'sr-only' }, String(report.totals.listedPeople)) }),
      stat({ label: 'Closed windows open today', value: String(report.totals.openWindowsN), tone: report.totals.openWindowsN ? 'warn' : '', hint: `${report.totals.events} declared event(s)`, action: h('span', { 'data-testid': 'dwl-count-windows', class: 'sr-only' }, String(report.totals.openWindowsN)) }),
      stat({ label: 'Clearances requested', value: String(report.totals.clearances), hint: `${report.totals.pendingN} awaiting a decision`, action: h('span', { 'data-testid': 'dwl-count-clearances', class: 'sr-only' }, String(report.totals.clearances)) }),
      stat({ label: 'Dealings recorded', value: String(report.totals.dealings), hint: `${report.totals.dealtWithClearanceN} under a clearance`, action: h('span', { 'data-testid': 'dwl-count-dealings', class: 'sr-only' }, String(report.totals.dealings)) }),
      stat({ label: 'Dealt inside a closed window', value: String(report.totals.dealtInClosedWindowN), tone: report.totals.dealtInClosedWindowN ? 'bad' : '', hint: 'Kept and printed, never repaired', action: h('span', { 'data-testid': 'dwl-count-closed-window', class: 'sr-only' }, String(report.totals.dealtInClosedWindowN)) }),
      stat({ label: 'Dealt with no clearance', value: String(report.totals.dealtWithoutClearanceN), tone: report.totals.dealtWithoutClearanceN ? 'warn' : '', hint: 'Nothing approved this trade', action: h('span', { 'data-testid': 'dwl-count-no-clearance', class: 'sr-only' }, String(report.totals.dealtWithoutClearanceN)) }),
      stat({ label: 'Decision owed past its day', value: String(report.totals.pendingOverdueN), tone: report.totals.pendingOverdueN ? 'bad' : '', hint: 'Silence is not an approval', action: h('span', { 'data-testid': 'dwl-count-overdue', class: 'sr-only' }, String(report.totals.pendingOverdueN)) }),
      stat({ label: 'Clearance breaches', value: String(report.totals.clearanceBreachesN), tone: report.totals.clearanceBreachesN ? 'bad' : '', hint: 'Self-decided or out of order', action: h('span', { 'data-testid': 'dwl-count-clearance-breach', class: 'sr-only' }, String(report.totals.clearanceBreachesN)) }),
    ),
  });
}

function claimsBanners(report) {
  const nodes = [];
  if (!report.figuresComplete) {
    nodes.push(banner({
      tone: 'warn',
      title: 'The figures on this page are not complete',
      body: report.incompleteReasons.join(' '),
    }));
  }
  if (report.totals.dealtInClosedWindowN) {
    nodes.push(banner({
      tone: 'bad',
      title: `${report.totals.dealtInClosedWindowN} dealing(s) fell inside a declared closed period`,
      body: 'Each one prints the window’s first and last closed day and the exact day the trade fell beside it. The commands cannot create these; they arrived in the record and the register keeps them rather than hiding them.',
    }));
  }
  if (report.totals.clearanceBreachesN) {
    nodes.push(banner({
      tone: 'bad',
      title: `${report.totals.clearanceBreachesN} clearance(s) carry a decision nobody should have made`,
      body: 'A clearance decided by the person who asked, or decided before it was asked. Decision control must sit apart from decision management; the register keeps both rather than hiding them.',
    }));
  }
  if (report.anyWithheld) {
    nodes.push(banner({
      tone: 'info',
      title: 'Detail follows the duty, not the rank alone',
      body: report.disclosure.reason,
    }));
  }
  if (report.totals.listedWithoutSeatN) {
    nodes.push(banner({
      tone: 'warn',
      title: `${report.totals.listedWithoutSeatN} listed person(s) hold no operating seat in this workspace`,
      body: 'An individual contributor with no reports and no declared line of their own has no seat here, so the gateway refuses every write from them — including their own clearance request. Their line holder records it on their behalf and the record keeps who asked beside who it was for. Read a record with no self-request as that limitation, never as evidence the person acted.',
    }));
  }
  nodes.push(banner({
    tone: 'info',
    title: 'Two claims, reported apart',
    body: `${report.balances.dealingStatesReconcile ? 'The printed dealing state counts re-add to the dealings they summarise.' : 'The printed dealing state counts do NOT re-add to the dealings.'} ${report.figuresComplete ? 'Every figure here is complete.' : 'Some figures are incomplete for the reasons above.'} They are different facts and neither one is folded into the other.`,
  }));
  return h('div', { class: 'stack' }, ...nodes);
}

function listView(ctx, local, report, onDone) {
  const rows = report.listedPeople.map((row) => ({
    ...row,
    personLabel: row.inDetail ? row.personName : 'withheld at this disclosure level',
    basisLabel: row.inDetail ? row.bases.join(', ') : 'withheld',
    linesLabel: row.inDetail ? (row.lines.length ? row.lines.map((line) => line.kind || line.id).join(', ') : 'no active line') : 'withheld',
    seatLabel: row.inDetail
      ? (row.holdsSeat === true ? 'holds a seat' : row.holdsSeat === false ? 'no seat — line holder records for them' : 'seat state unknown')
      : 'withheld',
  }));

  const body = rows.length
    ? table({
      caption: 'People on the insider list',
      columns: [
        { label: 'Person', key: 'personLabel' },
        { label: 'Basis', key: 'basisLabel' },
        { label: 'Held through', key: 'linesLabel' },
        { label: 'Lines', key: 'linesN' },
        { label: 'Listed from', render: (row) => (row.inDetail ? row.earliestStart : 'withheld') },
        { label: 'Ends', render: (row) => (row.inDetail ? (row.latestEnd || 'open-ended') : 'withheld') },
        { label: 'Acts for self', key: 'seatLabel' },
        {
          label: 'Act',
          render: (row) => h('div', { class: 'row-actions' },
            row.latestEnd ? null : button('End designation', () => endDesignationDialog(ctx, local, row.designationIds[0], onDone)),
            button('Request clearance', () => requestClearanceDialog(ctx, local, row.personId, onDone))),
        },
      ],
      rows,
      emptyMessage: 'Nobody is on the insider list. A designation is a written instrument, so none is inferred.',
    })
    : emptyState({ title: 'Nobody on the insider list yet', body: 'Declare the designation first: the person, the written instrument, the basis and the day it takes effect. No list is inferred from a title, a pay grade or a span.' });

  return h('div', { class: 'stack' },
    card({
      title: 'Insider list',
      subtitle: 'Each designated person once, with every line that holds them and the written basis they are listed on.',
      actions: [button('Declare designation', () => declareDesignationDialog(ctx, local, onDone), { primary: true })],
      body,
    }),
    report.designationRows.some((row) => row.multiLine)
      ? banner({ tone: 'info', title: 'Matrix designation', body: `${report.totals.multiLineListed} listed person(s) sit on more than one reporting line. The person is counted once, and every ask about their dealing reaches the joint seat above ALL of their lines — never one line on another's behalf, and never the person themselves.` })
      : null,
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
  );
}

function windowsView(ctx, local, report, onDone) {
  const rows = report.eventRows.map((row) => ({
    ...row,
    // A closed period's subject is not personal data — it is the reason the window
    // exists and the whole point is that everybody it binds can see it. It is
    // therefore NOT withheld from any seat: hiding the closed period from the people
    // it binds is the failure mode this register removes.
    subjectLabel: row.event.subject,
    kindLabel: row.event.kind,
    opensLabel: row.span ? row.span.opensOn : 'cannot be resolved',
    closesLabel: row.span ? row.span.closesOn : '—',
    anchorLabel: row.event.disclosesOn,
    stateLabel: row.resolvable ? (row.openOnAsOf ? 'closed today' : 'open today') : 'cannot be resolved',
    scopeLabel: row.scopeN ? `${row.scopeN} line(s)` : 'whole market',
  }));

  return card({
    title: 'Closed windows',
    subtitle: 'Every declared closed period with its anchor disclosure day and its exact first and last closed day. There is no default window.',
    actions: [button('Declare closed period', () => declareEventDialog(ctx, local, onDone), { primary: true })],
    body: rows.length
      ? table({
        caption: 'Declared closed periods',
        columns: [
          { label: 'Kind', key: 'kindLabel' },
          { label: 'What it protects', key: 'subjectLabel' },
          { label: 'Disclosure day', key: 'anchorLabel' },
          { label: 'First closed day', key: 'opensLabel' },
          { label: 'Last closed day', key: 'closesLabel' },
          { label: 'Scope', key: 'scopeLabel' },
          { label: 'Today', key: 'stateLabel' },
        ],
        rows,
      })
      : emptyState({ title: 'No closed period is declared', body: 'A closed period is anchored to a declared disclosure day with the exact whole days closed before and after it. Nothing is defaulted, because a default window would decide, silently and every day, that dealing was open.' }),
  });
}

function clearancesView(ctx, local, report, onDone) {
  const rows = report.clearanceRows.map((row) => ({
    ...row,
    personLabel: row.inDetail ? row.personName : 'withheld at this disclosure level',
    securityLabel: row.inDetail ? row.clearance.securityRef : 'withheld',
    quantityLabel: row.inDetail ? `${row.clearance.quantity} ${row.clearance.side}` : 'withheld',
    requestedLabel: row.inDetail ? row.clearance.requestedOn : 'withheld',
    dueLabel: row.dueOn || '—',
    timeline: !row.decision
      ? (row.overdue > 0 ? `${row.overdue}d overdue` : row.dueIn === null ? '—' : `${row.dueIn}d left`)
      : (row.clearanceValidThrough ? `valid to ${row.clearanceValidThrough}` : 'refused'),
    deciderLabel: row.inDetail ? (row.deciderName || '—') : 'withheld',
    independentLabel: row.independence?.ok ? row.independence.apexIds.length : 0,
  }));

  return card({
    title: 'Clearances',
    subtitle: 'The request as its own dated act and the decision as a separate one, by a hand strictly above the requester, with its validity or its written refusal reason.',
    actions: [
      button('Request clearance', () => requestClearanceDialog(ctx, local, null, onDone), { primary: true }),
      button('Decide clearance', () => decideClearanceDialog(ctx, local, null, onDone)),
    ],
    body: rows.length
      ? table({
        caption: 'Clearance requests and decisions',
        columns: [
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Person', key: 'personLabel' },
          { label: 'Security', key: 'securityLabel' },
          { label: 'Quantity', key: 'quantityLabel' },
          { label: 'Requested', key: 'requestedLabel' },
          { label: 'Decision owed by', key: 'dueLabel' },
          { label: 'Timeline', key: 'timeline' },
          { label: 'Decided by', key: 'deciderLabel' },
          { label: 'Independent seats', key: 'independentLabel' },
          {
            label: 'Act',
            render: (row) => h('div', { class: 'row-actions' },
              row.decision ? null : button('Decide', () => decideClearanceDialog(ctx, local, row.clearance.id, onDone)),
              button('Record dealing', () => recordDealingDialog(ctx, local, row.clearance.personId, onDone))),
          },
        ],
        rows,
      })
      : emptyState({ title: 'No clearance on the record', body: 'A clearance is requested, then decided by a hand strictly above the requester. A request is never an approval, and silence is never one either.' }),
  });
}

function dealingsView(ctx, local, report, onDone) {
  const rows = report.dealingRows.map((row) => ({
    ...row,
    personLabel: row.inDetail ? row.personName : 'withheld at this disclosure level',
    securityLabel: row.inDetail ? row.dealing.securityRef : 'withheld',
    quantityLabel: row.inDetail ? `${row.dealing.quantity} ${row.dealing.side}` : 'withheld',
    dealtLabel: row.inDetail ? row.dealing.dealtOn : 'withheld',
    windowLabel: !row.designatedAtDeal
      ? 'not on the list that day'
      : row.windowAnswer.state === 'closed'
        ? `closed ${row.windowAnswer.span.opensOn} → ${row.windowAnswer.span.closesOn}`
        : row.windowAnswer.state === 'undeterminable' ? 'cannot be resolved' : 'open',
    insideLabel: row.windowAnswer.state === 'closed'
      ? `${row.windowAnswer.daysInsideWindow}d from the edge`
      : '—',
    clearanceLabel: !row.clearance
      ? 'none cited'
      : row.decision
        ? `${row.decision.outcome}${row.clearanceValidThrough ? ` · to ${row.clearanceValidThrough}` : ''} by ${row.deciderName || '—'}`
        : 'no decision yet',
  }));

  return card({
    title: 'Dealings',
    subtitle: 'Every executed trade against the window it fell in and the clearance it cites, with the exact days inside or outside.',
    actions: [button('Record dealing', () => recordDealingDialog(ctx, local, null, onDone), { primary: true })],
    body: rows.length
      ? table({
        caption: 'Executed personal-account dealings',
        columns: [
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Person', key: 'personLabel' },
          { label: 'Security', key: 'securityLabel' },
          { label: 'Quantity', key: 'quantityLabel' },
          { label: 'Dealt', key: 'dealtLabel' },
          { label: 'Window', key: 'windowLabel' },
          { label: 'Inside by', key: 'insideLabel' },
          { label: 'Clearance', key: 'clearanceLabel' },
        ],
        rows,
      })
      : emptyState({ title: 'No executed dealing is recorded', body: 'A dealing is a dated human record cited to the broker’s own contract note. The register holds no broker feed and says so rather than implying one.' }),
  });
}

function methodView(report) {
  return card({
    title: 'Method',
    subtitle: `Engine ${report.engineVersion} · ${DWL_METHOD.adr}`,
    body: h('div', { class: 'stack' },
      h('div', { class: 'stack' },
        h('h3', null, 'The framework basis'),
        h('ul', null, ...DWL_METHOD.frameworks.map((line) => h('li', { class: 'small' }, line)))),
      h('div', { class: 'stack' },
        h('h3', null, 'What the register prints'),
        h('ul', null, ...DWL_METHOD.printed.map((line) => h('li', { class: 'small' }, line)))),
      h('div', { class: 'stack' },
        h('h3', null, 'What it deliberately does not do'),
        h('ul', null, ...DWL_METHOD.deliberatelyAbsent.map((line) => h('li', { class: 'small' }, line)))),
    ),
  });
}

/* ------------------------------------------------------------------ render */

export function renderPersonalDealing(ctx) {
  const panel = PANELS.some((row) => row.key === ctx.query?.get?.('panel')) ? ctx.query.get('panel') : 'list';
  let report;
  try {
    const result = ctx.api.dwlReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Governance · personal dealing', title: 'Personal dealing', subtitle: 'The insider list, the closed windows, the independent clearance and the trade that followed.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Governance · personal dealing', title: 'Personal dealing' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = { people: [], designations: [], clearances: [], decisions: [], events: [] };
  try {
    const result = ctx.api.dwlCandidates();
    if (result?.ok) candidates = result;
  } catch { /* an unreadable candidate list narrows the dialogs, never the screen */ }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: DWL_HREF } }));
    ctx.rerender?.();
  };
  const local = { ...candidates, api: ctx.api };

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, DWL_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts and state keys only: no person, basis, security, broker reference, quantity or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'Governance · personal dealing',
    title: 'Personal dealing',
    subtitle: 'Who is on the insider list and on what written basis, the closed period around each disclosure, the clearance as a request and a separate independent decision, and the executed trade against both.',
    actions: [
      { label: 'Declare designation', onClick: () => declareDesignationDialog(ctx, local, onDone), primary: true },
      { label: 'Declare closed period', onClick: () => declareEventDialog(ctx, local, onDone) },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(ctx, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.listedPeople} on the list · ${report.totals.events} event(s)`,
      `${report.totals.clearances} clearance(s) · ${report.totals.dealings} dealing(s)`,
      report.detailed ? 'detail shown' : 'detail follows the duty — see below',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: PANELS,
      active: panel,
      onSelect: (key) => { window.location.hash = `${DWL_HREF}?panel=${key}`; },
      ariaLabel: 'Personal dealing sections',
    }),
    panel === 'windows' ? windowsView(ctx, local, report, onDone)
      : panel === 'clearances' ? clearancesView(ctx, local, report, onDone)
        : panel === 'dealings' ? dealingsView(ctx, local, report, onDone)
          : panel === 'method' ? methodView(report)
            : listView(ctx, local, report, onDone),
  );

  return h('div', { class: 'stack' }, header, body);
}
