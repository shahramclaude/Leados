/**
 * app/views/probation-gates.js — `#/probation`, the Probation Confirmation
 * Gate Register (ADR-0233, Schema v188).
 *
 * ONE reader (`buildProbationReport`, standing on the `buildProbationGates`
 * kernel) behind every state, flag, count and rate this page prints. The page
 * formats what the reader returned; it computes no state, no lapse, no overdue
 * ask and no rate of its own.
 *
 * THE THREE THINGS THIS SCREEN KEEPS APART:
 *   1. THE WINDOW — the joiner, the declared instrument terms, the days that
 *      matter, and whether the window is closing or has lapsed;
 *   2. THE EVIDENCE — the duty on every declared reporting line of the joiner,
 *      what each line's evidence says, and where it is outstanding;
 *   3. THE DECISION — the one final decision the gate exists for, and whether
 *      it was ever communicated to the joiner in writing.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, table } from '../ui/components.js';
import {
  PBG_HREF,
  PBG_INSTRUMENTS,
  PBG_LIMITS,
  PBG_METHOD,
  PBG_RECOMMENDATIONS,
  PBG_STATES,
} from '../core/domain/probationRegistry.js';

const L = PBG_LIMITS;
const DIAGRAM_URL = './app/assets/probation-gate-method.jpg';
const VIEWS = [
  { key: 'rows', label: 'Gates' },
  { key: 'lines', label: 'Evidence by line' },
  { key: 'counts', label: 'Counts, windows & on-time' },
  { key: 'refusals', label: 'Refused acts' },
  { key: 'method', label: 'Method' },
];

const STATE_TONE = {
  declared: 'neutral',
  'evidence-gathering': 'caution',
  'evidence-complete': 'info',
  'decided-confirmed': 'good',
  'decided-ended': 'neutral',
  'lapsed-no-decision': 'bad',
};
const STATE_SHORT = Object.fromEntries(PBG_STATES.map((row) => [row.key, row.label.split(' — ')[0]]));
const LINE_TONE = {
  unasked: 'bad',
  asked: 'caution',
  submitted: 'good',
};
const READING_TONE = {
  support: 'good',
  concern: 'bad',
  unresolved: 'caution',
};
const READING_SHORT = Object.fromEntries(PBG_RECOMMENDATIONS.map((row) => [row.key, row.label.split(' — ')[0]]));
const INSTRUMENT_SHORT = Object.fromEntries(PBG_INSTRUMENTS.map((row) => [row.key, row.label]));

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

/* ------------------------------------------------------------------ dialogs */

function declareDialog(ctx, candidates, onDone) {
  const joinerRows = (candidates?.joiners || []).map((p) => ({ value: p.id, label: `${p.name}${p.role ? ` · ${p.role}` : ''}` }));
  const form = buildForm([
    {
      name: 'joinerId', label: 'The joiner this window is about', type: 'select', required: true,
      options: options(joinerRows, { blank: 'Choose the joiner' }),
      help: 'Only your direct reports appear here, and only those without an open gate. The gate is opened by the manager who will answer for the decision.',
    },
    { name: 'startOn', label: 'The window starts on', type: 'date', required: true, help: 'The real calendar day the probation window begins — usually the engagement day. Declared, never inferred from a start-date field.' },
    { name: 'endOn', label: 'The window ends on', type: 'date', required: true, help: 'The day the DECISION is owed by. This is the gate: past this day the short-notice lever the window carried is gone.' },
    {
      name: 'instrument', label: 'Which instrument sets this window', type: 'select', required: true,
      options: options(PBG_INSTRUMENTS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the instrument' }),
      help: 'A closed list, because a statutory window and a contract term carry different ceilings and different consequences.',
    },
    { name: 'instrumentRef', label: 'The instrument reference', type: 'text', required: true, help: `At least ${L.refMin} characters — the contract clause, agreement section or appointment letter a reviewer could go and read.` },
    { name: 'expectations', label: 'What the joiner must demonstrate', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the expectations every line's evidence will be read against, in the words every line can see.` },
    { name: 'allowsExtension', label: 'The instrument allows an extension', type: 'checkbox', help: 'Leave unticked if the terms allow no extension. An extension without this declaration is refused at the door.' },
    { name: 'legalCapDays', label: 'Declared legal cap on the total window (days, optional)', type: 'text', help: `The maximum total probation days the instrument or the law allows (whole days). A window or an extension past it is REFUSED with a reason — never warned about. Leave blank if no cap is declared.` },
    { name: 'noticeDays', label: 'Notice inside the window (days, optional)', type: 'text', help: 'The short notice the window carries, where the instrument declares one. Declared here so the consequence of a lapsed window can be printed, never guessed.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateDeclare({
      ...values,
      legalCapDays: values.legalCapDays ? Number(values.legalCapDays) : undefined,
      noticeDays: values.noticeDays ? Number(values.noticeDays) : undefined,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The gate was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Gate opened. The evidence duty now sits on every declared reporting line of this joiner, and the decision is owed before the window ends.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Open a probation gate',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared terms, never inferred', body: 'The window, the instrument and its caps are read from this declaration from now on — nothing is inferred from a start date, a contract record or a jurisdiction database. You are the confirming manager; the decision carries your name.' }),
      joinerRows.length ? null : banner({ tone: 'caution', title: 'No direct report is eligible', body: 'Only your own active direct reports without an open gate can carry one. The register will not open a gate about somebody else’s report.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Open the gate', onClick: submit }],
  });
}

function askDialog(ctx, row, onDone) {
  const unasked = row.lines.filter((line) => line.lineKind === 'matrix' && !line.askCount);
  const lineRows = unasked.map((line) => ({ value: line.lineId, label: `${line.lineId} — held by ${line.lineHolderId}` }));
  const form = buildForm([
    {
      name: 'lineId', label: 'The declared line to ask', type: 'select', required: true,
      options: options(lineRows, { blank: 'Choose the line' }),
      help: 'The evidence duty sits on every declared reporting line of the joiner. This puts it to one line’s holder, by a day.',
    },
    { name: 'dueOn', label: 'Evidence owed by', type: 'date', required: true, help: `Inside the window (which ends ${row.effectiveEndOn}): an ask that comes due after the window closed cannot inform the decision, and the register refuses it.` },
    { name: 'note', label: 'What the evidence should cover', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the brief is what makes the evidence comparable across lines.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateAsk({ gateId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The ask was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Evidence duty put to the line. The holder answers with their own dated evidence, and the register chases it if the day passes.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Ask a declared line for evidence',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One ask per line', body: 'A second ask never overwrites the first. The line’s holder records the evidence themselves — a peer cannot answer for somebody else’s line.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Put the ask', onClick: submit }],
  });
}

function submitDialog(ctx, row, line, onDone) {
  const isHome = line.lineKind === 'home';
  const form = buildForm([
    { name: 'observedText', label: 'What you actually observed', type: 'textarea', required: true, help: `At least ${L.textMin} characters — dated work, named situations, what was seen. An impression is not evidence.` },
    {
      name: 'recommendation', label: 'Your reading', type: 'select', required: true,
      options: options(PBG_RECOMMENDATIONS.map((row2) => ({ value: row2.key, label: row2.label })), { blank: 'Choose the reading' }),
      help: 'Three words, closed, because support, concern and cannot-say are different facts and the register never averages them.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateSubmit({
      gateId: row.id,
      lineKind: line.lineKind,
      lineId: line.lineId || undefined,
      ...values,
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The evidence was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Evidence recorded. Submissions append — the latest is this line’s reading.', 'good');
    onDone?.();
  };
  openModal({
    title: isHome ? 'Record the home line’s evidence' : 'Record this line’s evidence',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: isHome ? 'Your own line, your own words' : 'Your line, your own words', body: 'Evidence is dated work in words and one of three readings. No score is computed from it anywhere — the weighing happens in the recorded decision, with the confirming manager’s name on it.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record evidence', onClick: submit }],
  });
}

function extendDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'newEndOn', label: 'The extended window ends on', type: 'date', required: true, help: `Must move the window forward (it currently ends ${row.effectiveEndOn})${row.legalCapDays ? ` and must keep the total span within the declared cap of ${row.legalCapDays} days` : ''}.` },
    { name: 'reason', label: 'Why the window is moving', type: 'textarea', required: true, help: `At least ${L.textMin} characters — what the extra time is for, and what will be different inside it. An extension without a reason is procrastination with a date.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateExtend({ gateId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The extension was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Window extended. It closes nothing: evidence is owed again inside the extended window, and the final decision is still owed.', 'caution');
    onDone?.();
  };
  openModal({
    title: 'Extend the window',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'An extension is not a decision', body: 'It moves the window forward under the declared instrument and closes nothing. Evidence must be dated inside the extended window before a confirmation can rest on it, and the register reads the declared cap as a refusal, not a warning.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Extend the window', onClick: submit }],
  });
}

function decideDialog(ctx, row, onDone) {
  const form = buildForm([
    {
      name: 'decision', label: 'The decision', type: 'select', required: true,
      options: options([
        { value: 'confirm', label: 'Confirm — the joiner is confirmed in the role' },
        { value: 'end', label: 'End — the engagement ends within the window’s short notice' },
      ], { blank: 'Choose the decision' }),
      help: 'A closed list, so the counts mean one thing. A confirmation is refused while any declared line carries no evidence; an end is allowed without it, because ending is the urgent path.',
    },
    { name: 'reason', label: 'What the decision rests on', type: 'textarea', required: true, help: `At least ${L.textMin} characters — the evidence read, the weight given to each line, and what was decided. The joiner reads this record.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateDecide({ gateId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(values.decision === 'confirm'
      ? 'Confirmed. The written notification is still owed until it is recorded — decided is not told.'
      : 'Recorded. The written notification is still owed until it is recorded — decided is not told.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the decision',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'One decision, your name on it', body: 'A second decision is refused — a changed decision is a new human act on the decision log, not an edit of this one. A decision dated after the window closed is refused: the short-notice lever is gone with the window.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the decision', onClick: submit }],
  });
}

function notifyDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'instrumentRef', label: 'The written instrument', type: 'text', required: true, help: `At least ${L.refMin} characters — the letter, the email, the documented conversation. This register does not draft it; it records that it was sent.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.probationGateNotify({ gateId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The notification was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recorded. The outcome is now on the record as communicated to the joiner in writing.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the written notification',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Decided is not told — until this act', body: 'The gap between “we decided” and “we told them” is where this duty actually fails. The register holds both dates apart and chases the second until it is on the record.' }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record the notification', onClick: submit }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const c = report.counts;
  return card({
    title: 'The register in eight numbers',
    subtitle: 'States, flags and counts are re-derived on every read; nothing here is stored.',
    body: h('div', { class: 'stat-row' },
      stat({ label: 'Gates', value: String(c.gates) }),
      stat({ label: 'Open', value: String(c.open), tone: c.open ? 'warn' : undefined }),
      stat({ label: 'Windows closing (≤7 days)', value: String(c.closing), tone: c.closing ? 'warn' : undefined }),
      stat({ label: 'Lapsed — no decision', value: String(c.lapsed), tone: c.lapsed ? 'bad' : undefined }),
      stat({ label: 'Evidence asks overdue', value: String(c.overdueAsks), tone: c.overdueAsks ? 'warn' : undefined }),
      stat({ label: 'Decided, not communicated', value: String(c.unnotified), tone: c.unnotified ? 'warn' : undefined }),
      stat({ label: 'Extensions recorded', value: String(c.extensions || 0) }),
      stat({ label: 'Dropped rows', value: String(c.droppedRows || 0), tone: c.droppedRows ? 'warn' : undefined }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    report.partitionReconciles
      ? banner({ tone: 'good', title: 'The rows add up', body: 'Every printed state count sums to the gate total (`partitionReconciles`).' })
      : banner({ tone: 'bad', title: 'The rows do NOT add up', body: 'The printed state counts do not sum to the gate total. Do not read a figure from this page until the record is repaired.' }),
    report.figuresComplete
      ? banner({ tone: 'good', title: 'Nothing refused, nothing dropped', body: 'No dropped row sits behind these figures (`figuresComplete`).' })
      : banner({ tone: 'caution', title: 'Figures carry dropped rows behind them', body: `${report.counts.droppedRows} stored row(s) were refused by the loader and are counted, not repaired. Nothing on this page was invented from them.` }),
  );
}

function gateActionButtons(ctx, row, onDone) {
  const self = ctx.state?.settings?.activeSeatId || null;
  const isManager = self && row.declaredById === self;
  const cells = [];
  if (row.closed) {
    if (isManager && row.unnotified) {
      cells.push(button('Record notification', () => notifyDialog(ctx, row, onDone), { primary: true, testid: `pbg-notify-${row.id}` }));
    }
    return h('div', { class: 'row gap-s' }, ...cells);
  }
  if (isManager) {
    const unasked = row.lines.filter((line) => line.lineKind === 'matrix' && !line.askCount);
    for (const line of unasked) {
      cells.push(button(`Ask ${line.lineId}`, () => askDialog(ctx, row, onDone), { testid: `pbg-ask-${row.id}-${line.lineId}` }));
    }
    const homeLine = row.lines.find((line) => line.lineKind === 'home');
    if (homeLine && !homeLine.submissions) {
      cells.push(button('Record home evidence', () => submitDialog(ctx, row, homeLine, onDone), { testid: `pbg-submit-${row.id}-home` }));
    }
    if (row.allowsExtension) {
      cells.push(button('Extend window', () => extendDialog(ctx, row, onDone), { testid: `pbg-extend-${row.id}` }));
    }
    cells.push(button('Decide', () => decideDialog(ctx, row, onDone), { primary: true, testid: `pbg-decide-${row.id}` }));
  } else if (self) {
    for (const line of row.lines) {
      if (line.lineKind === 'matrix' && line.lineHolderId === self && !line.submissions) {
        cells.push(button('Record line evidence', () => submitDialog(ctx, row, line, onDone), { primary: true, testid: `pbg-submit-${row.id}-${line.lineId}` }));
      }
    }
  }
  return h('div', { class: 'row gap-s' }, ...cells);
}

function rowsView(ctx, report, onDone) {
  const columns = [
    {
      label: 'Joiner / window',
      render: (r) => h('div', { class: 'stack-tight' },
        h('strong', null, r.joinerName),
        h('span', { class: 'small muted' }, `${r.startOn} → ${r.effectiveEndOn}${r.extendCount ? ` · extended ${r.extendCount}×` : ''}`),
        h('span', { class: 'small muted' }, `${INSTRUMENT_SHORT[r.instrument] || r.instrument} · ${r.instrumentRef}`)),
    },
    { label: 'Declared expectations', render: (r) => h('span', { class: 'small' }, r.expectations) },
    {
      label: 'Evidence by line',
      render: (r) => h('div', { class: 'stack-tight' }, ...r.lines.map((line) => h('div', { class: 'small' },
        badge(line.lineState, LINE_TONE[line.lineState] || 'neutral'),
        ` ${line.lineKind === 'home' ? 'home line' : line.lineId}`,
        line.askDueOn ? h('span', { class: 'muted' }, ` · evidence by ${line.askDueOn}`) : null,
        line.overdueAsk ? h('span', { class: 'text-warn' }, ' · ASK OVERDUE') : null,
        line.latestReading ? h('span', { class: 'muted' }, ` · “${READING_SHORT[line.latestReading] || line.latestReading}” ${line.latestSubmittedOn}`) : null,
        line.lineKind === 'matrix' && !line.resolved ? h('span', { class: 'text-warn' }, ' · line unresolved') : null))),
    },
    {
      label: 'Window',
      render: (r) => {
        if (r.closed) return when(r.effectiveEndOn);
        if (r.lapsed) return h('span', { class: 'text-warn' }, `${when(r.effectiveEndOn)} · LAPSED`);
        if (r.closing) return h('span', { class: 'text-warn' }, `${when(r.effectiveEndOn)} · CLOSING (${r.daysRemaining}d)`);
        return `${when(r.effectiveEndOn)} · ${r.daysRemaining}d left`;
      },
    },
    {
      label: 'State',
      render: (r) => h('div', { class: 'stack-tight' },
        badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral'),
        r.flags.includes('confirmed-over-concern') ? h('span', { class: 'small text-warn' }, 'confirmed over a line’s concern') : null,
        r.flags.includes('confirmed-over-unresolved') ? h('span', { class: 'small muted' }, 'confirmed over a “cannot say”') : null,
        r.unnotified ? h('span', { class: 'small text-warn' }, 'not yet communicated in writing') : null,
        r.notifiedOn ? h('span', { class: 'small muted' }, `communicated ${r.notifiedOn} · ${r.notifyInstrumentRef}`) : null,
        r.joinerActive ? null : h('span', { class: 'small text-warn' }, 'joiner no longer active on the roster')),
    },
    { label: '', render: (r) => gateActionButtons(ctx, r, onDone) },
  ];
  return h('div', { class: 'stack', 'data-testid': 'pbg-rows' },
    h('div', { class: 'row gap-s' },
      button('Open a probation gate', () => declareDialog(ctx, ctx.probationGateCandidates, onDone), { primary: true, testid: 'pbg-declare' }),
      button('Scan the register', () => {
        const result = ctx.api.probationGateScan();
        if (!result?.ok) { toast(result?.error || 'The scan was refused.', 'bad'); return; }
        toast('Register scanned. Overdue evidence asks, windows closing and lapsed gates were re-read from the record.', 'good');
        onDone?.();
      }, { testid: 'pbg-scan' })),
    report.counts.hidden > 0
      ? banner({ tone: 'info', title: `${report.counts.hidden} gate(s) withheld from this seat`, body: 'A gate is readable by its parties — the joiner included — and by the span or lines that hold them. Everything else is withheld and counted — never printed and never dropped.' })
      : null,
    table({
      caption: 'Probation gates — the joiner, the declared terms, the evidence duty and the decision',
      columns,
      rows: report.rows.map((row) => ({
        ...row,
        attrs: {
          'data-testid': `pbg-row-${row.id}`,
          'data-state': row.state,
          'data-lapsed': String(row.lapsed),
          'data-unnotified': String(row.unnotified),
        },
      })),
      emptyMessage: 'No gate is readable from this seat. Until one is opened, a probation window whose decision is owed stays invisible — which is exactly the failure this register exists to prevent.',
    }),
  );
}

function linesView(report) {
  const rows = report.rows.flatMap((row) => row.lines.map((line) => ({ ...line, row })));
  const columns = [
    { label: 'Joiner', render: (r) => h('strong', null, r.row.joinerName) },
    { label: 'Line', render: (r) => (r.lineKind === 'home' ? 'home line (the confirming manager’s own)' : String(r.lineId)) },
    { label: 'Evidence state', render: (r) => badge(r.lineState, LINE_TONE[r.lineState] || 'neutral') },
    { label: 'Evidence owed by', render: (r) => when(r.askDueOn), },
    { label: 'Latest reading', render: (r) => (r.latestReading
      ? h('span', null, badge(READING_SHORT[r.latestReading] || r.latestReading, READING_TONE[r.latestReading] || 'neutral'), h('span', { class: 'small muted' }, ` ${r.latestSubmittedOn}`))
      : '—') },
    { label: 'Submissions', render: (r) => String(r.submissions) },
    { label: 'Ask overdue', render: (r) => (r.overdueAsk ? h('span', { class: 'text-warn' }, 'OVERDUE') : '—') },
  ];
  return h('div', { class: 'stack', 'data-testid': 'pbg-lines' },
    banner({ tone: 'info', title: 'The evidence duty sits on every declared reporting line', body: 'A joiner’s home line evidence is the confirming manager’s own act; a matrix line’s evidence is that line’s holder’s own act. A confirmation is refused while any declared line carries none.' }),
    table({
      caption: 'Evidence by line — every declared line of every readable gate',
      columns,
      rows,
      emptyMessage: 'No evidence duty is on the record from this seat.',
    }),
  );
}

function countsView(report) {
  const c = report.counts;
  const rates = report.rates || {};
  const ratesWithheld = Boolean(report.ratesWithheld);
  return h('div', { class: 'stack', 'data-testid': 'pbg-counts' },
    ratesWithheld
      ? banner({ tone: 'caution', title: 'The rate is withheld from this seat', body: report.ratesWithheldReason || 'A rate built from part of the population would read as the enterprise’s.' })
      : h('div', { class: 'stat-row' },
        stat({ label: 'Windows whose day has passed', value: String(rates.decidedInsideWindow?.owed ?? 0) }),
        stat({ label: 'Decided inside the window', value: String(rates.decidedInsideWindow?.onTime ?? 0) }),
        stat({ label: 'On-time rate', value: pct(rates.decidedInsideWindow?.onTimeBp), hint: 'denominator is the passed-window count above' })),
    card({
      title: 'Gates by state',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.byState || {}).map(([key, value]) => stat({ label: STATE_SHORT[key] || key, value: String(value) }))),
    }),
    card({
      title: 'Outcomes',
      subtitle: 'A gate with an extension and no final decision is still open — the extension closed nothing.',
      body: h('div', { class: 'stat-row' },
        stat({ label: 'Confirmed', value: String(c.byOutcome?.confirmed ?? 0) }),
        stat({ label: 'Ended inside the window', value: String(c.byOutcome?.ended ?? 0) }),
        stat({ label: 'Extended, still open', value: String(c.byOutcome?.['extended-open'] ?? 0) })),
    }),
    card({
      title: 'Open gates by days to the window day',
      subtitle: 'The `past` band is the lapsed band: the day has gone and the register is still waiting for a decision.',
      body: h('div', { class: 'stat-row' }, ...Object.entries(c.windows || {}).map(([key, value]) => stat({ label: key, value: String(value) }))),
    }),
    card({
      title: 'The communication duty',
      body: h('div', { class: 'stack' },
        h('div', { class: 'stat-row' },
          stat({ label: 'Decided, not communicated', value: String(c.unnotified ?? 0), tone: c.unnotified ? 'warn' : undefined })),
        h('p', { class: 'small muted' }, 'A decision with no recorded written notification is printed and chased. The duty closes only on the confirming manager’s dated notification act — the gap between “we decided” and “we told them” is where this duty fails.')),
    }),
  );
}

function refusalsView(report) {
  return h('div', { class: 'stack', 'data-testid': 'pbg-refusals' },
    banner({ tone: 'info', title: 'Refused acts are never applied', body: 'Every act the door refused is counted and printed with its reason. A confirmation without every line’s evidence is refused rather than recorded; an extension past the declared cap is refused rather than warned about; a decision after the window is refused rather than back-fitted. The refusal is the control.' }),
    report.warnings?.length
      ? card({ title: 'Rows the loader refused at the door', subtitle: 'Malformed or duplicate rows are dropped and counted; nothing is repaired', body: h('ul', { class: 'list' }, ...report.warnings.map((w) => h('li', { class: 'small' }, w))) })
      : null,
    card({
      title: 'Identity-free observations from RULE-PBG-01',
      subtitle: 'Where the record owes an ask and the reporting graph names nobody who can be asked',
      body: (report.markers || []).length
        ? h('ul', { class: 'list' }, ...report.markers.map((m) => h('li', { class: 'small' }, `${m.at.slice(0, 10)} — ${m.detail}`)))
        : h('p', { class: 'small muted' }, 'No observation recorded.'),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'pbg-method' },
    card({
      title: 'One window, five acts, and the decision is owed before the day',
      subtitle: 'Declare → ask → submit → extend → decide → notify. The register never lets the window default itself.',
      body: h('figure', { class: 'figure' },
        h('img', {
          src: DIAGRAM_URL,
          alt: 'Probation confirmation gate flow: the joiner\'s home manager opens a gate with the declared window, instrument and caps. The evidence duty is put to every declared reporting line of the joiner — each line\'s holder records dated evidence with one of three readings (support, concern, cannot say). The manager may extend the window under the declared instrument, which closes nothing. Before the window ends the manager records the one final decision: confirm on evidence from every line, or end within the short notice. The register then chases the written notification until it is recorded. A window whose day passes with no decision reads lapsed — the register never substitutes the instrument\'s default outcome for a decision nobody made.',
          class: 'figure-img',
          'data-testid': 'pbg-diagram',
        }),
        h('figcaption', { class: 'small muted' }, 'The gate never defaults: a lapsed window is printed as a decision nobody made, never as the outcome the instrument would have produced.')),
    }),
    card({ title: 'Frameworks encoded', body: h('ul', { class: 'list' }, ...PBG_METHOD.frameworks.map((f) => h('li', null, f))) }),
    card({ title: 'Invariants', body: h('ul', { class: 'list' }, ...PBG_METHOD.invariants.map((f) => h('li', null, f))) }),
    card({ title: 'What it deliberately does not do', body: h('ul', { class: 'list' }, ...PBG_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))) }),
  );
}

export function renderProbationGates(ctx) {
  const report = ctx.api.probationGateReport ? ctx.api.probationGateReport() : null;
  if (!report || report.ok === false || !report.counts) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Frontline / mid-manager · matrix and single-chain', title: 'Probation gates', subtitle: 'The decision a joiner’s first window owes — made before the window closes, on evidence from every declared line, communicated in writing.' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  ctx.probationGateCandidates = ctx.api.probationGateCandidates ? ctx.api.probationGateCandidates() : null;
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'rows';
  const onDone = () => ctx.refresh?.();
  return h('div', { class: 'page', 'data-testid': 'probation-panel' },
    pageHeader({
      eyebrow: 'Frontline / mid-manager primary · single-chain and matrix',
      title: 'The decision a first window owes — before the day it lapses',
      subtitle: 'A probation window is a term of a relationship: it carries an end day, a short-notice lever and a decision somebody must actually make. This register holds the declared terms, puts the evidence duty on every declared reporting line of the joiner, takes the one final decision before the day, and chases the written notification until it is recorded. A window that passes undecided is printed `lapsed` — the register never substitutes the instrument’s default outcome for a decision nobody made.',
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
      ariaLabel: 'Probation gate views',
      onSelect: (key) => ctx.navigate(`${PBG_HREF}?view=${key}`),
    }),
    view === 'rows' ? rowsView(ctx, report, onDone) : null,
    view === 'lines' ? linesView(report) : null,
    view === 'counts' ? countsView(report) : null,
    view === 'refusals' ? refusalsView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderProbationGates;
