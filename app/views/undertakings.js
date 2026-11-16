/**
 * app/views/undertakings.js — `#/undertakings`, the Regulatory Undertaking &
 * Outward-Commitment Closure Register (ADR-0234, Schema v189).
 *
 * ONE reader (`buildUndertakingReport`, standing on the `buildUndertakings`
 * kernel) behind every state, flag, count and rate this page prints. The page
 * formats what the reader returned; it computes no state, no lapse, no test
 * verdict and no rate of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART, because collapsing them is how a
 * promise is reported as met when it is not:
 *   1. THE PROMISE — who it was made to, under which instrument, over what
 *      scope, and the day the counterparty expects to hear.
 *   2. THE LINES — each obligation line, the person holding it, whether the
 *      deliverable is asserted, and whether an INDEPENDENT seat has tested it.
 *   3. THE REPORT — the one written act that discharges the promise to the
 *      counterparty, and what came back.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  UDT_HREF,
  UDT_INSTRUMENTS,
  UDT_LIMITS,
  UDT_METHOD,
  UDT_STATES,
  UDT_ACKNOWLEDGEMENTS,
  UDT_COUNTERPARTY_KINDS,
} from '../core/domain/undertakingRegistry.js';

const L = UDT_LIMITS;
const DIAGRAM_URL = './app/assets/undertaking-closure-method.jpg';
const VIEWS = [
  { key: 'rows', label: 'Undertakings' },
  { key: 'lines', label: 'Obligation lines' },
  { key: 'counts', label: 'Counts, days & closure' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];

const STATE_TONE = {
  'lapsed-unreported': 'bad',
  'report-disputed': 'bad',
  rejected: 'bad',
  'reported-met': 'good',
  'confirmed-unreported': 'caution',
  'delivered-untested': 'info',
  'in-progress': 'neutral',
  declared: 'neutral',
};
const STATE_SHORT = Object.fromEntries(UDT_STATES.map((row) => [row.key, row.label.split(' — ')[0]]));
const LINE_TONE = { unassigned: 'warn', working: 'neutral', delivered: 'info', confirmed: 'good', rejected: 'bad' };
const ACK_TONE = { acknowledged: 'good', 'no-response': 'caution', disputed: 'bad' };
const ACK_SHORT = Object.fromEntries(UDT_ACKNOWLEDGEMENTS.map((row) => [row.key, row.label.split(' — ')[0]]));
const KIND_SHORT = Object.fromEntries(UDT_COUNTERPARTY_KINDS.map((row) => [row.key, row.label]));
const INSTRUMENT_SHORT = Object.fromEntries(UDT_INSTRUMENTS.map((row) => [row.key, row.label]));

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const options = (rows, { blank = null } = {}) => [
  ...(blank ? [{ value: '', label: blank }] : []),
  ...rows.map((row) => ({ value: row.value, label: row.label })),
];

const when = (day) => (day ? String(day) : '—');
const pct = (bp) => (bp === null || bp === undefined ? '—' : `${(bp / 100).toFixed(2)}%`);

/** A single field renderer that reports a refusal against the field it names. */
function submitVia(ctx, fn, payload, form, onDone, successToast, tone = 'good') {
  form.clearErrors();
  const values = form.getValues();
  const result = fn({ ...payload, ...values });
  if (!result?.ok) {
    if (result?.field) form.setFieldError(result.field, result.error || '');
    toast(result?.error || 'The act was refused.', 'bad');
    return false;
  }
  closeAllModals();
  toast(typeof successToast === 'function' ? successToast(values) : successToast, tone);
  onDone?.();
  return true;
}

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, candidates, onDone) {
  const people = (candidates?.people || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` }));
  const form = buildForm([
    { name: 'counterparty', label: 'Who was the promise made to', type: 'text', required: true, help: `At least ${L.counterpartyMin} characters — the supervisor by name, the customer, the board committee. This is who the register will hold us to.` },
    {
      name: 'counterpartyKind', label: 'What kind of counterparty', type: 'select', required: true,
      options: options(UDT_COUNTERPARTY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the kind' }),
      help: 'A closed list, because a promise to a supervisor and a promise to a customer carry different enforcement and a different consequence when the day passes.',
    },
    {
      name: 'instrument', label: 'Under which instrument', type: 'select', required: true,
      options: options(UDT_INSTRUMENTS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the instrument' }),
      help: 'A licence condition’s date is not the entity’s alone to move. The register reads this and refuses a unilateral extension on an external instrument.',
    },
    { name: 'instrumentRef', label: 'The instrument reference', type: 'text', required: true, help: `At least ${L.refMin} characters — the undertaking number, the licence condition, the resolution a reviewer could go and read.` },
    { name: 'scope', label: 'What the promise covers', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what it applies to and what it does NOT. A representation given over an undeclared scope is not a representation.` },
    { name: 'dueOn', label: 'The day it is due', type: 'date', required: true, help: 'The day the counterparty expects to hear. A due day in the past is refused; the register records what is actually owed.' },
  ]);
  // Obligation lines: the promise is about something in particular, held by somebody.
  const holderSelect = (index) => ({
    name: `holder_${index}`, label: `Line ${index + 1} — the named holder (optional)`, type: 'select',
    options: options(people, { blank: 'Leave unassigned — name a holder later' }),
    help: 'A holder is NAMED, never inferred from the org chart. Leave it blank if the line is not yet staffed; the register prints `unassigned` rather than guessing a name.',
  });
  const lineFields = [];
  for (let i = 0; i < 1; i += 1) {
    lineFields.push(
      { name: `roleLabel_${i}`, label: `Line ${i + 1} — what part of the promise this line carries`, type: 'text', help: 'A short label — “operations”, “legal”, “finance”. Optional.' },
      { name: `deliverable_${i}`, label: `Line ${i + 1} — what this line owes`, type: 'textarea', required: true, help: `At least ${L.textMin} characters. The thing that will exist, not the activity that produces it.` },
      { name: `dueOn_${i}`, label: `Line ${i + 1} — owed by`, type: 'date', required: true, help: 'Inside the promise’s own due day.' },
      holderSelect(i),
    );
  }
  const form2 = buildForm(lineFields);
  const submit = () => {
    form.clearErrors();
    form2.clearErrors();
    const values = form.getValues();
    const lineValues = form2.getValues();
    const lines = [{
      lineId: 'ln-1',
      roleLabel: lineValues.roleLabel_0 || '',
      deliverable: lineValues.deliverable_0 || '',
      dueOn: lineValues.dueOn_0 || '',
      holderId: lineValues.holder_0 || undefined,
    }];
    const result = ctx.api.undertakingDeclare({ ...values, lines });
    if (!result?.ok) {
      const target = result?.field && result.field.startsWith('lines') ? form2 : form;
      if (result?.field) target.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The undertaking was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recorded. It closes only when every line is independently confirmed and the counterparty has been told in writing.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record a promise given to an outside party',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared, never inferred', body: 'No undertaking is inferred from an assurance finding, a risk statement, a board memo or a contract record. A promise is a dated human declaration naming the counterparty, the instrument and the scope — and the record keeps your name on it.' }),
      form.node,
      banner({ tone: 'caution', title: 'More than one line?', body: 'A licence condition usually lands on several lines at once. Declare this undertaking with its first line, then add further lines from the undertaking row — each names its own holder, deliverable and day.' }),
      form2.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the undertaking', onClick: submit }],
  });
}

function assignDialog(ctx, row, candidates, onDone) {
  const unassigned = row.lines.filter((line) => !line.holderId);
  const lineRows = unassigned.map((line) => ({ value: line.lineId, label: `${line.lineId}${line.roleLabel ? ` · ${line.roleLabel}` : ''} — owed ${line.dueOn}` }));
  const people = (candidates?.people || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` }));
  const form = buildForm([
    {
      name: 'lineId', label: 'The line to staff', type: 'select', required: true,
      options: options(lineRows, { blank: 'Choose the line' }),
      help: 'Only lines that carry no holder appear here. A line that already has one is re-assigned by a human decision on the decision log, not silently here.',
    },
    { name: 'holderId', label: 'The person who holds it', type: 'select', required: true, options: options(people, { blank: 'Choose the holder' }), help: 'Named, never inferred from the org chart.' },
    { name: 'deliverable', label: 'What the line owes', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the thing that will exist.` },
    { name: 'dueOn', label: 'Owed by', type: 'date', required: true, help: `Inside the promise’s own due day (${row.effectiveDueOn}).` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingAssign.bind(ctx.api), { undertakingId: row.id }, form, onDone,
    'Holder named. They answer with their own dated assertion — an independent test is owed once they assert it.');
  openModal({
    title: 'Name a holder on an obligation line',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'A duty is placed, not assumed', body: 'The register never infers a holder from position, tenure or the reporting graph. Naming one is a human act, and the person named is the only one who can assert the deliverable.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Name the holder', onClick: submit }],
  });
}

function deliverDialog(ctx, row, line, onDone) {
  const form = buildForm([
    { name: 'evidenceText', label: 'What you delivered, and what can be seen of it', type: 'textarea', required: true, help: `At least ${L.textMin} characters. An impression is not a delivery; the independent seat will read this and then go and look.` },
    { name: 'referenceRef', label: 'Where it can be found', type: 'text', required: true, help: `At least ${L.refMin} characters — a system, a document, a register reference.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingDeliver.bind(ctx.api), { undertakingId: row.id, lineId: line.lineId }, form, onDone,
    'Delivered. It closes nothing: an independent test from above you is now owed before the counterparty can be told.', 'caution');
  openModal({
    title: 'Assert this line’s deliverable',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Your line, your name, your words', body: `This line is held by you and owed ${line.dueOn}. Your assertion opens the independent test; it does not close the promise, and it is not a grade of anyone.` }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Assert the deliverable', onClick: submit }],
  });
}

function verifyDialog(ctx, row, line, onDone) {
  const form = buildForm([
    {
      name: 'verdict', label: 'What the test found', type: 'select', required: true,
      options: options([
        { value: 'confirm', label: 'Confirm — the deliverable is really there' },
        { value: 'reject', label: 'Reject — it is not there, or not what was promised' },
      ], { blank: 'Choose the verdict' }),
      help: 'A closed list. A rejection returns the line to working, and a fresh assertion is owed before it can be tested again.',
    },
    { name: 'methodText', label: 'How you tested it', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what you looked at, and what you saw. The person who delivered does not grade this; you do, with your name on it.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingVerify.bind(ctx.api), { undertakingId: row.id, lineId: line.lineId }, form, onDone,
    (v) => (v.verdict === 'reject'
      ? 'Rejected. The line is owed again, and the counterparty is not told the promise is met.'
      : 'Confirmed. When every line is confirmed, the counterparty report is owed.'), 'good');
  openModal({
    title: 'Test this line’s deliverable',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'An independent key', body: 'Only a seat strictly above the line’s holder can test it — never the holder, never below them, never an unrelated branch. This is the separation the register exists to enforce.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the test', onClick: submit }],
  });
}

function reportDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'reportRef', label: 'The written instrument the counterparty was told through', type: 'text', required: true, help: `At least ${L.refMin} characters — the letter, the filing, the email. This register does not draft or send it; it records that it went and how.` },
    { name: 'reportText', label: 'What they were told', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Every line is independently confirmed — this is the act that turns that into a discharged promise.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingReportClosure.bind(ctx.api), { undertakingId: row.id }, form, onDone,
    'Reported. The counterparty’s reply is now owed — a promise told and never answered is not known to be discharged.');
  openModal({
    title: 'Report the closure to the counterparty',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'Doing the work is not telling them', body: 'In the instruments that matter the promise is not discharged by doing the work — it is discharged by doing it and reporting it. Every obligation line is independently confirmed, so this report is supported.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the report', onClick: submit }],
  });
}

function notifyDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'acknowledgement', label: 'What came back', type: 'select', required: true,
      options: options(UDT_ACKNOWLEDGEMENTS.map((row2) => ({ value: row2.key, label: row2.label })), { blank: 'Choose the reply' }),
      help: 'A closed list. “Acknowledged”, “no response yet” and “disputed” are different facts and the register never averages them.',
    },
    { name: 'acknowledgementRef', label: 'The written record of the reply — or of its absence', type: 'text', required: true, help: `At least ${L.refMin} characters.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingNotify.bind(ctx.api), { undertakingId: row.id }, form, onDone,
    (v) => (v.acknowledgement === 'disputed'
      ? 'Recorded as disputed. The promise reads as disputed, never as met, until the record says otherwise.'
      : 'Acknowledgement recorded.'), 'good');
  openModal({
    title: 'Record the counterparty’s reply',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Told is not the same as accepted', body: 'A report the counterparty does not accept is a disputed promise. The register prints it as disputed and never as met.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the reply', onClick: submit }],
  });
}

function extendDialog(ctx, row, onDone) {
  const external = (UDT_INSTRUMENTS.find((i) => i.key === row.instrument) || {}).external;
  const form = buildForm([
    { name: 'newDueOn', label: 'The day the promise moves to', type: 'date', required: true, help: `Must move forward from ${row.effectiveDueOn}. A lapsed promise is refused: a passed day is not un-lapsed by moving the date.` },
    {
      name: 'counterpartyAgreementRef', label: 'The counterparty’s written agreement (required for an external instrument)', type: 'text',
      help: external
        ? 'REQUIRED here. This instrument’s date is not the entity’s alone to move; without the counterparty’s own recorded agreement the extension is refused.'
        : 'Optional for an instrument the entity may move internally. Record it if one exists.',
    },
    { name: 'reason', label: 'Why the date is moving', type: 'textarea', required: true, help: `At least ${L.textMin} characters.` },
  ]);
  const submit = () => submitVia(ctx, ctx.api.undertakingExtend.bind(ctx.api), { undertakingId: row.id }, form, onDone,
    'Due day moved. It closes nothing — the promise is still open until every line is confirmed and the counterparty is told.', 'caution');
  openModal({
    title: 'Move the due day',
    body: h('div', { class: 'stack' },
      external
        ? banner({ tone: 'bad', title: 'This instrument is not yours alone to move', body: 'A licence condition, an undertaking, a covenant or a representation given to an outside party carries a date the counterparty holds you to. The register refuses a unilateral postponement — record their agreement, or record the failure honestly.' })
        : banner({ tone: 'caution', title: 'A promise the entity may move internally', body: 'This instrument is the entity’s own governance. Moving the day is allowed, and the reason is on the record with your name.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Move the due day', onClick: submit }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The register in eight numbers',
    subtitle: 'States, flags and counts are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Undertakings', value: String(c.undertakings) }),
      stat({ label: 'Open', value: String(c.open), tone: c.open ? 'warn' : undefined }),
      stat({ label: 'Due within 14 days', value: String(c.closing), tone: c.closing ? 'warn' : undefined }),
      stat({ label: 'Lapsed — no report', value: String(c.lapsed), tone: c.lapsed ? 'bad' : undefined }),
      stat({ label: 'Confirmed, not reported', value: String(c.unreported), tone: c.unreported ? 'warn' : undefined }),
      stat({ label: 'Rejected deliverables', value: String(c.rejected), tone: c.rejected ? 'bad' : undefined }),
      stat({ label: 'Lines without a holder', value: String(c.unassignedLines), tone: c.unassignedLines ? 'warn' : undefined }),
      stat({ label: 'Dropped rows', value: String(c.droppedRows || 0), tone: c.droppedRows ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.partitionReconciles
      ? banner({ tone: 'good', title: 'The rows add up', body: 'Every printed state count sums to the undertaking total (`partitionReconciles`).' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the undertaking total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped, every line staffed', body: 'No dropped row and no unassigned line sits behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'These figures carry an incomplete record behind them', body: `${report.counts.droppedRows} stored row(s) were refused by the loader and ${report.counts.unassignedLines} obligation line(s) carry no named holder. Both are counted, not repaired, and nothing on this page was invented from them.` }),
  );
}

function rowActionButtons(ctx, row, candidates, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const isExecutive = self && row.declaredById === self;
  const cells = [];
  if (isExecutive && row.unassignedLineCount > 0 && !row.reported) {
    cells.push(button('Name a holder', () => assignDialog(ctx, row, candidates, onDone), { testid: `udt-assign-${row.id}` }));
  }
  if (!row.reported) {
    for (const line of row.lines) {
      if (line.holderId === self && line.lineState === 'working') {
        cells.push(button('Assert delivery', () => deliverDialog(ctx, row, line, onDone), { primary: true, testid: `udt-deliver-${row.id}-${line.lineId}` }));
      }
    }
  }
  if (isExecutive && row.allConfirmed && !row.reported) {
    cells.push(button('Report to counterparty', () => reportDialog(ctx, row, onDone), { primary: true, testid: `udt-report-${row.id}` }));
  }
  if (isExecutive && row.reported && !row.acknowledgedOn) {
    cells.push(button('Record their reply', () => notifyDialog(ctx, row, onDone), { testid: `udt-notify-${row.id}` }));
  }
  if (isExecutive && !row.reported && !row.lapsed) {
    cells.push(button('Move the due day', () => extendDialog(ctx, row, onDone), { testid: `udt-extend-${row.id}` }));
  }
  return h('div', { class: 'row gap-s' }, ...cells);
}

function linesCellMarkup(ctx, row, onDone) {
  return h('div', { class: 'stack-tight' }, ...row.lines.map((line) => h('div', { class: 'small' },
    badge(line.lineState, LINE_TONE[line.lineState] || 'neutral'),
    ` ${line.roleLabel || line.lineId}`,
    line.holderId ? h('span', { class: 'muted' }, ` · ${line.holderName}`) : h('span', { class: 'text-warn' }, ' · no holder named'),
    h('span', { class: 'muted' }, ` · owed ${line.dueOn}`),
    line.verdict === 'reject' ? h('span', { class: 'text-warn' }, ' · TESTED, NOT THERE') : null,
    line.lineState === 'delivered' ? h('span', { class: 'text-warn' }, ' · awaits independent test') : null,
    line.holderId === (ctx.state?.settings?.activeSeatId || null) && line.lineState === 'working'
      ? h('span', null, ' ', button('Assert', () => deliverDialog(ctx, row, line, onDone), { primary: true, testid: `udt-inline-deliver-${row.id}-${line.lineId}` }))
      : null)));
}

function rowsView(ctx, report, candidates, onDone) {
  const canDeclare = Boolean(ctx.state?.settings?.activeSeatId);
  const columns = [
    {
      label: 'The promise',
      render: (r) => h('div', { class: 'stack-tight' },
        h('strong', null, r.counterparty),
        h('span', { class: 'small muted' }, `${KIND_SHORT[r.counterpartyKind] || r.counterpartyKind} · ${INSTRUMENT_SHORT[r.instrument] || r.instrument}`),
        h('span', { class: 'small muted' }, `${r.instrumentRef} · declared by ${r.declarerName}`)),
    },
    { label: 'Scope', render: (r) => h('span', { class: 'small' }, r.scope) },
    { label: 'Obligation lines', render: (r) => linesCellMarkup(ctx, r, onDone) },
    {
      label: 'Due',
      render: (r) => {
        if (r.reported) return h('span', null, `${when(r.effectiveDueOn)} · reported ${r.reportedOn}`);
        if (r.lapsed) return h('span', { class: 'text-warn' }, `${when(r.effectiveDueOn)} · LAPSED`);
        if (r.closing) return h('span', { class: 'text-warn' }, `${when(r.effectiveDueOn)} · DUE IN ${r.daysRemaining}d`);
        return `${when(r.effectiveDueOn)} · ${r.daysRemaining}d left`;
      },
    },
    {
      label: 'State',
      render: (r) => h('div', { class: 'stack-tight' },
        badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral'),
        r.accountability === 'no-authority' ? h('span', { class: 'small text-warn' }, 'no seat above every line — none invented') : null,
        r.accountability === 'joint-apex' ? h('span', { class: 'small muted' }, 'answered at the joint apex above every line') : null,
        r.flags.includes('external-instrument-extended-unilaterally') ? h('span', { class: 'small text-warn' }, 'external instrument extended without recorded agreement') : null,
        r.lines.some((l) => l.holderId && !l.holderActive) ? h('span', { class: 'small text-warn' }, 'a line holder is no longer active on the roster') : null,
        r.acknowledgedOn ? h('span', { class: 'small muted' }, `reply: ${ACK_SHORT[r.acknowledgement] || r.acknowledgement} ${r.acknowledgedOn}`) : null,
        r.reportOverdue ? h('span', { class: 'small text-warn' }, 'reported, reply owed') : null),
    },
    { label: '', render: (r) => rowActionButtons(ctx, r, candidates, onDone) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'udt-rows' },
    h('div', { class: 'row gap-s' },
      button('Record an undertaking', () => declareDialog(ctx, candidates, onDone), { primary: true, testid: 'udt-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.undertakingScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Untested deliverables, confirmed-but-unreported promises and lapsed due days were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'udt-scan' })),
    canDeclare ? null : banner({ tone: 'caution', title: 'Declare a seat to act', body: 'The register reads from any seat. Declaring, reporting and moving a due day need a declared seat that carries the executive right — the undeclared operator view speaks for nobody.' }),
    report.counts.hidden > 0
      ? banner({ tone: 'info', title: `${report.counts.hidden} undertaking(s) withheld from this seat`, body: 'An undertaking is readable by the seats that are parties to it — its declarer, its line holders, the seats that tested them and the seat that reported — and by the span or lines that hold them. Everything else is withheld and counted — never printed and never dropped.' })
      : null,
    table({
      caption: 'Undertakings — the promise, its obligation lines, the day it is owed and the report that discharges it',
      columns,
      rows: report.rows.map((row) => ({
        ...row,
        attrs: {
          'data-testid': `udt-row-${row.id}`,
          'data-state': row.state,
          'data-lapsed': String(row.lapsed),
          'data-reported': String(row.reported),
          'data-acknowledgement': row.acknowledgement || '',
        },
      })),
      emptyMessage: 'No undertaking is readable from this seat. Until one is declared, a promise to a regulator with a date on it stays invisible — which is exactly the failure this register exists to prevent.',
    }),
  );
}

function linesView(ctx, report, onDone) {
  const rows = report.rows.flatMap((row) => row.lines.map((line) => ({ ...line, row })));
  const self = ctx.state?.settings?.activeSeatId || null;
  const columns = [
    { label: 'Promise', render: (r) => h('div', { class: 'stack-tight' }, h('strong', null, `${r.row.counterparty} · ${r.row.id}`), h('span', { class: 'small muted' }, r.row.instrumentRef)) },
    { label: 'Line', render: (r) => (r.roleLabel || String(r.lineId)) },
    { label: 'Holder', render: (r) => (r.holderId ? h('span', null, r.holderName, r.holderActive ? null : h('span', { class: 'text-warn' }, ' · not active')) : h('span', { class: 'text-warn' }, 'unnamed')) },
    { label: 'Line state', render: (r) => badge(r.lineState, LINE_TONE[r.lineState] || 'neutral') },
    { label: 'Owed by', render: (r) => when(r.dueOn) },
    { label: 'Delivered', render: (r) => (r.deliveredOn ? `${r.deliveredOn} · ${r.referenceRef || ''}` : '—') },
    { label: 'Independently tested', render: (r) => (r.tested ? `${r.verdict} ${r.verifiedOn}` : '—') },
    {
      label: 'Act',
      render: (r) => {
        if (r.holderId === self && r.lineState === 'working') {
          return button('Assert delivery', () => deliverDialog(ctx, r.row, r, onDone), { primary: true, testid: `udt-lines-deliver-${r.row.id}-${r.lineId}` });
        }
        if (r.lineState === 'delivered') {
          return button('Test it', () => verifyDialog(ctx, r.row, r, onDone), { testid: `udt-verify-${r.row.id}-${r.lineId}` });
        }
        return '—';
      },
    },
  ];
  return h('div', { class: 'stack', 'data-testid': 'udt-lines' },
    banner({ tone: 'info', title: 'One promise, many holders — each line tested by somebody above it', body: 'A licence condition lands on several lines at once, held by different people under different managers. Every line names its own holder, and every deliverable is tested from a seat strictly above that holder — never by the person who delivered it.' }),
    table({
      caption: 'Obligation lines — every line of every readable undertaking',
      columns,
      rows,
      emptyMessage: 'No obligation line is on the record from this seat.',
    }),
  );
}

function countsView(report) {
  const c = report.counts;
  const rates = report.rates || {};
  const ratesWithheld = Boolean(report.ratesWithheld);
  return h('div', { class: 'stack', 'data-testid': 'udt-counts' },
    ratesWithheld
      ? banner({ tone: 'caution', title: 'The rate is withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the enterprise’s.' })
      : h('div', { class: 'stat-row' },
        stat({ label: 'Undertakings whose due day has passed', value: String(rates.reportedInsideWindow?.owed ?? 0) }),
        stat({ label: 'Reported on or before the day', value: String(rates.reportedInsideWindow?.onTime ?? 0) }),
        stat({ label: 'On-time rate', value: pct(rates.reportedInsideWindow?.onTimeBp), hint: 'denominator is the passed-due count above; a lapsed promise is never in the numerator' })),
    card({
      title: 'Undertakings by state',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.byState || {}).map(([key, value]) => stat({ label: STATE_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'By counterparty kind',
      subtitle: 'A count below the privacy floor of three is withheld in the CSV export rather than printed as a small number that would name a relationship.',
      body: h('div', { class: 'stat-row' }, ...UDT_COUNTERPARTY_KINDS.map((row) => stat({ label: row.label, value: String(c.byCounterparty?.[row.key] ?? 0) }))),
    }),
    card({
      title: 'By instrument',
      subtitle: 'An external instrument’s date is not the entity’s alone to move; an internal one is.',
      body: h('div', { class: 'stat-row' }, ...UDT_INSTRUMENTS.map((row) => stat({ label: row.label, value: String(c.byInstrument?.[row.key] ?? 0) }))),
    }),
    card({
      title: 'Open undertakings by days to the due day',
      subtitle: 'The `past` band is the lapsed band: the day has gone and the counterparty has still not been told.',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.windows || {}).map(([key, value]) => stat({ label: key, value: String(value) }))),
    }),
    card({
      title: 'The separation this register exists to make',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Delivered, untested', value: String(c.byState?.['delivered-untested'] ?? 0) }),
          stat({ label: 'Confirmed, not reported', value: String(c.unreported ?? 0), tone: c.unreported ? 'warn' : undefined }),
          stat({ label: 'Disputed by counterparty', value: String(c.disputed ?? 0), tone: c.disputed ? 'bad' : undefined })),
        h('p', { class: 'small muted' }, 'Doing the work, having it independently tested, and telling the counterparty are three different facts. This register holds them apart on the record and only `reported-met` asserts all three.')),
    }),
  );
}

function refusalsView(report) {
  return h('div', { class: 'stack', 'data-testid': 'udt-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'A report to a counterparty while one line is untested is refused rather than recorded; an extension of an external instrument without the counterparty’s agreement is refused rather than warned about; an extension after the due day is refused rather than back-fitted; a holder inferred from position is refused rather than guessed. The refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    card({
      title: 'Identity-free observations from RULE-UDT-01',
      subtitle: 'Where the record owes an ask and the reporting graph names nobody who can be asked',
      body: (report.markers || []).length
        ? h('ul', { class: 'list' }, ...report.markers.map((m) => h('li', { class: 'small' }, `${m.at.slice(0, 10)} — ${m.detail}`)))
        : h('p', { class: 'small muted' }, 'No observation recorded.'),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'udt-method' },
    card({
      title: 'One promise, three separate facts, one report',
      subtitle: 'Declare → assign → deliver → test independently → report to the counterparty → record the reply. The day never decides.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Regulatory undertaking closure flow: an executive declares a promise to an outside party under a named instrument, over a declared scope, with a due day, and it carries one or more obligation lines. Each line names its own holder and deliverable. The holder asserts delivery with dated evidence; a seat strictly above that holder independently confirms or rejects it. Only when EVERY line is independently confirmed may the accountable executive report the closure to the counterparty in writing, and the counterparty’s reply is then recorded as acknowledged, no response, or disputed. A due day that passes with no report reads lapsed; the register never substitutes the passage of time for a decision, and never lets the person who delivered grade their own work.',
          class: 'figure-img',
          'data-testid': 'udt-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'Doing the work, having it independently tested, and telling the counterparty are three different facts. Only a confirmed-and-reported promise reads as met.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...UDT_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...UDT_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...UDT_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderUndertakings(ctx) {
  const report = ctx.api.undertakingReport ? ctx.api.undertakingReport() : null;
  if (!report || report.ok === false || !report.counts) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'CEO / C-suite · matrix and single-chain', title: 'Undertakings', subtitle: 'The promise made outward — what was promised, to whom, on which lines, and whether the counterparty was ever told it was met.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const candidates = ctx.api.undertakingCandidates ? ctx.api.undertakingCandidates() : null;
  const view = viewKey(ctx.query?.get?.('view'));
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'undertaking-panel' },
    pageHeader({
      eyebrow: 'CEO / C-suite primary · single-chain and matrix',
      title: 'The promise made outward — and whether they were ever told',
      subtitle: 'A promise to a regulator, a board, a lender or a customer is discharged by doing the work AND telling them in writing. This register records the declared promise across every obligation line it lands on, separately records each line’s delivery and its independent test, and refuses a closure report until every line is confirmed. A due day that passes unreported is printed `lapsed` — the register never converts a passed day into a met promise.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    ...(report.warnings || []).map((warning) => banner({ tone: 'caution', title: 'A stored row was refused', body: warning })),
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'rows' ? report.rows.length : row.key === 'lines' ? report.rows.reduce((sum, r) => sum + r.lines.length, 0) : undefined,
      })),
      active: view,
      ariaLabel: 'Undertaking register views',
      onSelect: (key) => ctx.navigate?.(`${UDT_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, candidates, onDone) : null,
    view === 'lines' ? linesView(ctx, report, onDone) : null,
    view === 'counts' ? countsView(report) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

const viewKey = (value) => (VIEWS.some((row) => row.key === value) ? value : 'rows');

export default renderUndertakings;
