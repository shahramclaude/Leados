/**
 * app/views/speakUp.js — `#/speak-up`, the Speak-Up Concern Routing &
 * Impartiality Register (ADR-0215, Schema v169, CSV scope #157, `RULE-SUP-01`).
 *
 * ONE reader (`buildSpeakUpReport`) stands behind every count, every row, the
 * brief and the CSV. This file formats counts and sentences the reader already
 * computed, so what the screen prints is what the engine computed — and every
 * figure carries a `data-testid` so a test can prove that claim rather than
 * trust it.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART, because collapsing any two of them is
 * how a speak-up register becomes decoration:
 *   1. a concern NOBODY MAY HEAR — the graph holds no impartial seat;
 *   2. a concern nobody HAS heard YET — a live acknowledgement clock;
 *   3. a receiver who WAS impartial when it was routed and IS NOT NOW;
 *   4. a window that closed with nothing recorded, which is refused information
 *      and never a clearance.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { speakUpBriefText } from '../core/domain/speakUp.js';
import {
  SPEAK_UP_BOUNDS,
  SPEAK_UP_CATEGORIES,
  SPEAK_UP_CSV_COLUMNS,
  SPEAK_UP_FRAMEWORKS,
  SPEAK_UP_HREF,
  SPEAK_UP_LIMITS,
  SPEAK_UP_METHOD,
  SPEAK_UP_OUTCOMES,
  SPEAK_UP_ROUTE_KINDS,
  SPEAK_UP_RULE_ID,
  SPEAK_UP_SETTING_KEYS,
  SPEAK_UP_SETTING_LABELS,
  SPEAK_UP_VIEWS,
  SPEAK_UP_WATCH_VERDICTS,
  speakUpCategoryByKey,
} from '../core/domain/speakUpRegistry.js';

const L = SPEAK_UP_LIMITS;
const DIAGRAM_URL = './app/assets/speak-up-routing.jpg';
const TONE = { bad: 'bad', caution: 'caution', good: 'good', info: 'info', neutral: 'neutral' };

function button(label, onClick, { primary = false, testid = null, disabled = false } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    ...(disabled ? { disabled: true } : {}),
    onClick,
  }, label);
}

function openDialog(title, body) {
  openModal({ title, body, actions: [{ label: 'Close', onClick: () => closeAllModals() }] });
}

/* ------------------------------------------------------------------ dialogs */

function raiseDialog(ctx, onDone) {
  const boot = ctx.api.speakUpCandidates({ subjectKind: 'practice' });
  if (!boot?.ok) { toast(boot?.error || 'The routing test could not be read.', 'bad'); return; }
  const people = boot.people || [];

  let board = boot;
  const refreshBoard = (subjectKind, subjectPersonId) => {
    const result = ctx.api.speakUpCandidates({ subjectKind, subjectPersonId });
    if (result?.ok) board = result;
    return board;
  };

  const routeOptions = SPEAK_UP_ROUTE_KINDS.map((row) => ({ value: row.key, label: row.label }));
  const roleSuffix = (roles) => (roles?.managesSubject ? ' — escalation route (manages the subject)'
    : roles?.managesReporter ? ' — manages the reporter on a line' : '');
  const receiverOptions = () => {
    const list = board.candidates || [];
    if (!list.length) return [{ value: '', label: 'No impartial seat exists in this record' }];
    return list.map((row) => ({ value: row.id, label: `${row.name}${roleSuffix(row.roles)}` }));
  };

  const form = buildForm([
    {
      name: 'subjectKind',
      label: 'What is the concern about?',
      type: 'select',
      required: true,
      options: [
        { value: 'practice', label: 'A practice, not a person' },
        { value: 'person', label: 'A person on the roster' },
      ],
      value: 'practice',
      help: 'Naming a person changes the impartiality test: the receiver must then hold neither party. Both are legitimate; neither is inferred from what you type.',
    },
    {
      name: 'subjectPersonId',
      label: 'Which person?',
      type: 'select',
      options: [{ value: '', label: 'Not about a person' }, ...people.map((person) => ({ value: person.id, label: person.name }))],
      help: 'The subject of a concern never reads it, and never conducts the retaliation check about it.',
    },
    { name: 'subjectLabel', label: 'Which practice?', type: 'text', help: 'A practice needs a name a receiver can act on — the rota, the sign-off, the escalation route.' },
    {
      name: 'categoryKey',
      label: 'Category',
      type: 'select',
      required: true,
      options: SPEAK_UP_CATEGORIES.map((row) => ({ value: row.key, label: row.label })),
      value: 'conduct',
      help: 'A closed list. The register never guesses a category from the text of a concern.',
    },
    { name: 'summary', label: 'What happened?', type: 'textarea', required: true, help: `At least ${L.summaryMin} characters. Shown only to the receiver and, where they stated one, to the reporter.` },
    {
      name: 'routeKey',
      label: 'How is it routed?',
      type: 'select',
      required: true,
      options: routeOptions,
      value: 'internal-person',
      help: 'The action re-tests the graph at the moment of writing: a receiver the screen offered and the graph has since disqualified is refused by name.',
    },
    {
      name: 'receiverId',
      label: 'Which impartial receiver?',
      type: 'select',
      options: receiverOptions(),
      help: 'Computed from the whole reporting graph — home line and every declared line — in both directions, against both parties.',
    },
    { name: 'externalLabel', label: 'Which external channel?', type: 'text', help: 'Only for an externally referred concern. The register records the referral; it does not claim to hear it.' },
    { name: 'channelBasis', label: 'Why this route?', type: 'textarea', required: true, help: `At least ${L.basisMin} characters. The reason is part of the record: it is how a later reader checks that the route was chosen, not fallen into.` },
    { name: 'raisedOn', label: 'The day it was raised', type: 'date', help: 'Defaults to today. A concern reported late is recorded on the day it was raised, never on the day it was typed.' },
    { name: 'unnamed', label: 'Record it without a named reporter', type: 'checkbox', help: 'An anonymous report is a legitimate row. Impartiality is then tested against the subject alone.' },
    { name: 'note', label: '', type: 'hidden', value: '' },
  ]);

  const kindField = form.field('subjectKind');
  const personField = form.field('subjectPersonId');
  const routeField = form.field('routeKey');
  const receiverField = form.field('receiverId');

  const repopulate = () => {
    const subjectKind = kindField?.value === 'person' ? 'person' : 'practice';
    refreshBoard(subjectKind, personField?.value || null);
    if (receiverField) {
      receiverField.replaceChildren(...receiverOptions().map((row) => h('option', { value: row.value }, row.label)));
      receiverField.value = (board.candidates && board.candidates[0]?.id) || '';
    }
  };
  kindField?.addEventListener('change', repopulate);
  personField?.addEventListener('change', repopulate);

  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.speakUpRaiseConcern(values);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The concern was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(result.receiverState === 'none'
      ? 'Concern recorded. The graph holds no impartial seat for it, and the register prints that as a finding rather than inventing a receiver.'
      : `Concern recorded and routed. Acknowledgement is owed within ${board.settings?.ackDays ?? L.ackDays} day(s).`, 'good');
    onDone?.();
  };

  openModal({
    title: 'Raise a concern',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'This records a route, not a verdict',
        body: 'The register does not investigate and does not decide whether a concern is well founded. It records who raised it, what it is about, who can hear it impartially, and whether the clock that follows actually ran. It is not a substitute for a statutory external channel.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Raise it', primary: true, onClick: submit },
    ],
  });
}

function answerDialog(ctx, row, kind, onDone) {
  const titles = {
    acknowledge: 'Acknowledge the concern',
    outcome: 'Record the outcome',
    watch: 'Record the retaliation check',
    close: 'Close the concern',
  };
  const fields = [];
  if (kind === 'outcome') {
    fields.push({
      name: 'outcomeKey',
      label: 'What was determined?',
      type: 'select',
      required: true,
      options: SPEAK_UP_OUTCOMES.map((item) => ({ value: item.key, label: item.label })),
      value: 'unable-to-determine',
      help: 'A closed list. “Unable to determine” is its own outcome and is never read as a clearance.',
    });
  }
  if (kind === 'watch') {
    fields.push({
      name: 'verdictKey',
      label: 'What did the check find?',
      type: 'select',
      required: true,
      options: SPEAK_UP_WATCH_VERDICTS.map((item) => ({ value: item.key, label: item.label })),
      value: 'no-adverse-act',
      help: 'A declaration made by a person, not surveillance. It is recorded inside the declared window and cannot be filed late.',
    });
  }
  fields.push({ name: 'on', label: 'The day of this act', type: 'date', help: 'Defaults to today. An act cannot be dated after today, or before the act it follows.' });
  fields.push({ name: 'note', label: 'What is recorded, in writing', type: 'textarea', required: true, help: `At least ${L.noteMin} characters. “Handled” is not a record.` });
  const form = buildForm(fields);

  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const call = kind === 'acknowledge' ? 'speakUpAcknowledge'
      : kind === 'outcome' ? 'speakUpRecordOutcome'
        : kind === 'watch' ? 'speakUpRecordWatch' : 'speakUpCloseConcern';
    const result = ctx.api[call]({ reportId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The act was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recorded.', 'good');
    onDone?.();
  };

  openModal({
    title: titles[kind] || 'Record an act',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: `What this act does, and does not, settle`,
        body: kind === 'watch'
          ? 'The check is about what happened to the reporter AFTER an outcome — not about whether the concern was true. A window that ends with no check is printed as overdue, never as clear.'
          : kind === 'outcome'
            ? 'The outcome is the receiver’s record of what was determined. It does not re-open the concern, does not rate the reporter and does not close the retaliation window.'
            : 'The act is dated and kept. Nothing already recorded about this concern is edited or removed.',
      }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record it', primary: true, onClick: submit },
    ],
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { name: 'on', label: 'The day of the withdrawal', type: 'date', help: 'Defaults to today.' },
    { name: 'note', label: 'Why is it withdrawn?', type: 'textarea', required: true, help: `At least ${L.noteMin} characters. Every act that happened before the withdrawal is kept.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.speakUpWithdrawConcern({ reportId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The withdrawal was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Concern withdrawn. Nothing was deleted.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Withdraw the concern',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'Only the reporter may withdraw',
        body: 'A manager withdrawing somebody else’s concern is the exact act this register exists to prevent. Withdrawing keeps every act already recorded and ends the clocks.',
      }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Withdraw it', primary: true, onClick: submit }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const form = buildForm([
    {
      name: SPEAK_UP_SETTING_KEYS.ackDays,
      label: SPEAK_UP_SETTING_LABELS.ackDays,
      type: 'number',
      required: true,
      value: String(report.conventions.ackDays),
      help: `A whole number from ${SPEAK_UP_BOUNDS.ackDays[0]} to ${SPEAK_UP_BOUNDS.ackDays[1]}. Outside that range the value is refused, never clamped.`,
    },
    {
      name: SPEAK_UP_SETTING_KEYS.feedbackDays,
      label: SPEAK_UP_SETTING_LABELS.feedbackDays,
      type: 'number',
      required: true,
      value: String(report.conventions.feedbackDays),
      help: `A whole number from ${SPEAK_UP_BOUNDS.feedbackDays[0]} to ${SPEAK_UP_BOUNDS.feedbackDays[1]}.`,
    },
    {
      name: SPEAK_UP_SETTING_KEYS.watchDays,
      label: SPEAK_UP_SETTING_LABELS.watchDays,
      type: 'number',
      required: true,
      value: String(report.conventions.watchDays),
      help: `A whole number from ${SPEAK_UP_BOUNDS.watchDays[0]} to ${SPEAK_UP_BOUNDS.watchDays[1]}.`,
    },
    {
      name: SPEAK_UP_SETTING_KEYS.autoPropagate,
      label: SPEAK_UP_SETTING_LABELS.autoPropagate,
      type: 'checkbox',
      value: report.conventions.autoPropagate,
      help: 'Silencing this stops the register from chasing an overdue acknowledgement or retaliation check on its own. The clock keeps running and the panel keeps printing it.',
    },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const patch = {
      [SPEAK_UP_SETTING_KEYS.ackDays]: Number(values[SPEAK_UP_SETTING_KEYS.ackDays]),
      [SPEAK_UP_SETTING_KEYS.feedbackDays]: Number(values[SPEAK_UP_SETTING_KEYS.feedbackDays]),
      [SPEAK_UP_SETTING_KEYS.watchDays]: Number(values[SPEAK_UP_SETTING_KEYS.watchDays]),
      [SPEAK_UP_SETTING_KEYS.autoPropagate]: Boolean(values[SPEAK_UP_SETTING_KEYS.autoPropagate]),
    };
    const result = ctx.api.speakUpSetConventions(patch);
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions saved. A concern already on the record keeps the window it was raised under.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Speak-up conventions',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'A window changed today does not rewrite yesterday’s promise',
        body: 'Each concern stores the windows in force on the day it was raised. The panel prints both when they differ, so a later tightening cannot make a late acknowledgement retroactively on time.',
      }),
      form.node),
    actions: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Save', primary: true, onClick: submit }],
  });
}

/* -------------------------------------------------------------------- cards */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds',
    subtitle: 'Counts, not verdicts: the register records that a channel ran and what it owed. It does not decide whether a concern was well founded.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Concerns', value: h('span', { 'data-testid': 'sup-count-total' }, String(t.reports)), hint: `${t.live} live, ${t.reports - t.live} withdrawn` }),
      stat({ label: 'Overdue', value: h('span', { 'data-testid': 'sup-count-overdue' }, String(report.overdueN)), tone: report.overdueN ? 'warn' : '', hint: `ack ${report.ackOverdueN} · outcome ${report.feedbackOverdueN} · check ${report.watchOverdueN}` }),
      stat({ label: 'No impartial route', value: h('span', { 'data-testid': 'sup-count-no-route' }, String(report.noRouteN)), tone: report.noRouteN ? 'bad' : '', hint: 'every seat in the record holds a party' }),
      stat({ label: 'Receiver no longer impartial', value: h('span', { 'data-testid': 'sup-count-drifted' }, String(report.driftedN)), tone: report.driftedN ? 'bad' : '', hint: 'the graph moved after the concern was routed' }),
      stat({
        label: 'Acknowledgement latency',
        value: h('span', { 'data-testid': 'sup-latency' }, report.latency.medianDays !== null ? `${report.latency.medianDays} d` : 'withheld'),
        hint: report.latency.medianDays !== null ? `${report.latency.rule}, n=${report.latency.n}` : report.latency.withheldReason,
      }),
    ),
  });
}

function rowCard(ctx, row, { onDone }) {
  const acts = row.acts || [];
  const canAck = row.canAnswer && ['unacknowledged', 'ack-overdue'].includes(row.stateKey);
  const canOutcome = row.canAnswer && ['acknowledged', 'feedback-overdue'].includes(row.stateKey);
  const canCheck = row.canAnswer && row.stateKey === 'outcome-recorded';
  const canClose = row.canAnswer && ['outcome-recorded', 'watched', 'watch-overdue'].includes(row.stateKey);
  const canWithdraw = row.canWithdraw && !['withdrawn', 'closed'].includes(row.stateKey);

  return h('article', {
    class: 'decision-card',
    'data-testid': `sup-row-${row.ref}`,
    'data-state': row.stateKey,
    'data-detail': row.detail,
    'data-category': row.categoryKey,
    'data-route': row.routeKey,
    'data-ref': row.ref,
  },
    h('header', { class: 'decision-head' },
      h('div', null,
        h('h3', null, `${row.ref} · ${row.categoryLabel}${row.detail === 'full' && row.subjectRef ? ` — ${row.subjectRef}` : ''}`),
        h('p', { class: 'muted tiny' },
          `raised ${row.raisedOn} · ${row.daysOpen} day(s) open · ${row.routeLabel}`
          + (row.detail === 'full' && row.receiverRef ? ` · receiver ${row.receiverRef}` : '')
          + (row.detail === 'full' && row.externalLabel ? ` · ${row.externalLabel}` : ''))),
      h('div', { class: 'row-gap' },
        badge(row.stateLabel, TONE[row.tone] || 'neutral', row.stateSays),
        row.detail !== 'full' ? badge('counted only', 'neutral', row.detailReason || '') : null,
        row.detail === 'full' && row.receiverRoleLabel ? badge('role printed', 'info', row.receiverRoleLabel) : null,
        row.receiverImpartial === false ? badge('receiver no longer impartial', 'bad', row.receiverDriftLabel || '') : null,
        row.windowsMoved ? badge('window moved since', 'caution', 'The conventions changed after this concern was raised. The stored window is what this row is judged by.') : null)),
    row.detail === 'full' && row.summary ? h('p', { class: 'small' }, row.summary) : null,
    row.detail === 'full' && row.channelBasis ? h('p', { class: 'muted small' }, h('strong', null, 'Why this route: '), row.channelBasis) : null,
    row.detail === 'full' && row.receiverRoleLabel ? h('p', { class: 'muted small' }, h('strong', null, 'In what role: '), row.receiverRoleLabel) : null,
    row.detail === 'counted' ? h('p', { class: 'muted small' }, `Held back from this seat: ${row.detailReason}. The concern is counted in the totals and never described here.`) : null,
    h('p', { class: 'muted tiny' },
      `Acknowledgement due ${row.ackDueOn}${row.ackOn ? ` · acknowledged ${row.ackOn}${row.acknowledgedLate ? ' (late)' : ''}` : ' · not acknowledged'}`
      + (row.feedbackDueOn ? ` · outcome due ${row.feedbackDueOn}` : '')
      + (row.outcomeOn ? ` · outcome ${row.outcomeOn}${row.resolvedLate ? ' (late)' : ''}` : '')
      + (row.watchDueOn ? ` · retaliation window closes ${row.watchDueOn}` : '')),
    row.outcomeLabel ? h('p', { class: 'small' }, h('strong', null, 'Outcome: '), row.outcomeLabel) : null,
    row.watchState === 'overdue'
      ? h('p', { class: 'text-warn small' }, 'The retaliation window closed with NO check on the record. This is refused information, not a clearance.')
      : row.watchState === 'skipped-by-close'
        ? h('p', { class: 'text-warn small' }, 'This concern was closed before any retaliation check was recorded. The gap stays on the record.')
        : row.watchVerdictLabel
          ? h('p', { class: 'small' }, h('strong', null, 'Retaliation check: '), row.watchVerdictLabel)
          : null,
    acts.length
      ? h('details', { class: 'muted small' },
        h('summary', null, `${acts.length} dated act(s) — nothing erased`),
        h('ul', null, ...acts.map((act) => h('li', null,
          `${act.on} · ${act.kind}${act.outcomeKey ? ` (${act.outcomeKey})` : ''}${act.verdictKey ? ` (${act.verdictKey})` : ''}${act.byRef ? ` · ${act.byRef}` : ''} — ${act.note}`))))
      : null,
    (canAck || canOutcome || canCheck || canClose || canWithdraw)
      ? h('div', { class: 'row-gap' },
        canAck ? button('Acknowledge', () => answerDialog(ctx, row, 'acknowledge', onDone), { primary: true, testid: `sup-ack-${row.ref}` }) : null,
        canOutcome ? button('Record outcome', () => answerDialog(ctx, row, 'outcome', onDone), { primary: true, testid: `sup-outcome-${row.ref}` }) : null,
        canCheck ? button('Record retaliation check', () => answerDialog(ctx, row, 'watch', onDone), { primary: true, testid: `sup-watch-${row.ref}` }) : null,
        canClose ? button('Close', () => answerDialog(ctx, row, 'close', onDone), { testid: `sup-close-${row.ref}` }) : null,
        canWithdraw ? button('Withdraw', () => withdrawDialog(ctx, row, onDone), { testid: `sup-withdraw-${row.ref}` }) : null)
      : null,
  );
}

/* -------------------------------------------------------------------- views */

function registerView(ctx, report, caps, onDone) {
  if (!report.rows.length) {
    return card({
      body: emptyState({
        title: 'No concern has been raised in this workspace',
        body: 'The register is empty, which is a fact about the record and not evidence that nobody has anything to raise. A channel nobody has needed yet is the normal case; a channel nobody can use is this register’s whole subject.',
        action: caps.canRaise ? button('Raise a concern', () => raiseDialog(ctx, onDone), { primary: true, testid: 'sup-raise-empty' }) : null,
      }),
    });
  }
  return h('div', { class: 'stack' },
    card({
      title: `Concerns (${report.rows.length})`,
      subtitle: 'Each row is a dated route and a set of clocks. What you can read here depends on the seat you are operating, and the row says which level it gave you and why.',
      body: h('div', { class: 'stack-sm' }, ...report.rows.map((row) => rowCard(ctx, row, { onDone }))),
    }),
    report.withheldN
      ? card({ body: h('p', { class: 'muted small' }, `${report.withheldN} concern(s) are counted in the totals above but not described to this seat. The reason is printed on each row. Aggregate counts are the whole of what a seat outside a concern’s span receives.`) })
      : null,
  );
}

function routesView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Who could hear each live concern',
      subtitle: 'The impartiality test is computed from the whole reporting graph — home line and every declared line — in both directions, against both parties. It is not a declaration the receiver makes about themselves.',
      body: report.routesRows.length
        ? table({
          caption: 'Impartial candidates per live concern',
          columns: [
            { key: 'ref', header: 'Reference' },
            { key: 'categoryLabel', header: 'Category' },
            { key: 'routeKey', header: 'Route' },
            { key: 'candidatesN', header: 'Seats that could hear it' },
            { key: 'excludedN', header: 'Seats disqualified' },
            { key: 'stateKey', header: 'State' },
            { key: 'drifted', header: 'Receiver still impartial?' },
          ],
          rows: report.routesRows.map((row) => ({
            ...row,
            drifted: row.drifted ? 'NO — the graph moved' : (row.routeKey === 'internal-person' ? 'yes' : '—'),
            candidatesN: row.noRoute ? 'none' : String(row.candidatesN),
          })),
        })
        : emptyState({ title: 'No live concern', body: 'Every concern on the register is withdrawn or closed, so there is no route to test.' }),
    }),
    card({
      title: 'Why a seat is disqualified',
      subtitle: 'The exclusions, counted by the relationship that produced them. A register that only listed candidates would hide the finding that matters most: who is structurally unable to hear a concern.',
      body: report.routesRows.length
        ? h('div', { class: 'stack-sm' }, ...report.routesRows.filter((row) => row.excludedN).map((row) => h('div', null,
          h('p', { class: 'small' }, h('strong', null, row.ref), ` — ${row.excludedN} seat(s) disqualified`),
          h('ul', { class: 'muted small' }, ...row.excluded.map((entry) => h('li', null, `${entry.reason}: ${entry.count}`))))))
        : h('p', { class: 'muted small' }, 'Nothing to exclude.'),
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register computes, and what it refuses to',
      body: h('dl', { class: 'stack-sm' },
        Object.entries(SPEAK_UP_METHOD).map(([key, value]) => h('div', null,
          h('dt', { class: 'small strong' }, key.charAt(0).toUpperCase() + key.slice(1)),
          h('dd', { class: 'muted small' }, value)))),
    }),
    card({
      title: 'Frameworks applied',
      subtitle: 'Named, so a reader can check the register against the practice it claims to implement. Nothing here claims certification against any of them.',
      body: h('dl', { class: 'stack-sm' }, ...SPEAK_UP_FRAMEWORKS.map((row) => h('div', null,
        h('dt', { class: 'small strong' }, row.label),
        h('dd', { class: 'muted small' }, row.says)))),
    }),
    card({
      title: 'How a concern is routed',
      body: h('div', { class: 'stack-sm' },
        h('img', { src: DIAGRAM_URL, alt: 'Method illustration, two rows. Above, the allowed route: a solid teal line carries a raised note to a receiver standing on a side branch rather than above the reporter, and the note arrives as a sealed envelope on a record card with a teal tab. Below, the refused route: the only available line runs into the reporter\u2019s own manager, stopped by a red prohibition mark, the note withheld behind a warning triangle and the record card left empty with a red tab.', class: 'method-diagram', loading: 'lazy', width: '1672', height: '941' }),
        h('p', { class: 'muted tiny' }, 'Generated asset, not workspace data. It illustrates the method; every number on this page comes from the record.'),
        h('p', { class: 'muted small' }, `Refusals are named, not generic. The register carries ${30}+ named refusals — a receiver who holds either party, an outcome before an acknowledgement, a retaliation check outside its window, a withdrawal by a manager — and each prints its own sentence.`)),
    }),
    card({
      title: 'What this workspace cannot do',
      body: h('p', { class: 'muted small' },
        'Seats are workflow declarations, not authentication. The confidentiality described on this page is a rendering contract enforced by the reader — it decides what each seat is SHOWN, and it cannot stop one person operating another seat on one keyboard. This register also does not investigate, discipline, or stand in for a statutory external channel; where no impartial internal route exists it says so, and that sentence is the product.'),
    }),
  );
}

/* ------------------------------------------------------------------- render */

export function renderSpeakUp(ctx) {
  const result = ctx.api.speakUpReport();
  if (!result?.ok) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Governance', title: 'Speak-up', subtitle: 'Who can hear a concern, and did the clock run?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat refused the read.' }));
  }
  const report = result.report;
  const requested = ctx.query?.get?.('view');
  const view = SPEAK_UP_VIEWS.some((row) => row.key === requested) ? requested : 'register';
  const caps = {
    canRaise: Boolean(ctx.api.speakUpRaiseConcern),
    canGovern: Boolean(ctx.api.speakUpSetConventions),
  };
  const onDone = () => ctx.refresh?.();

  const openBrief = () => openDialog('Speak-up brief (identity-free)', h('pre', { class: 'pre-wrap small', 'data-testid': 'sup-brief' }, speakUpBriefText(report)));
  const downloadCsv = () => {
    const csvRows = ctx.api.speakUpCsvRows();
    if (!csvRows?.ok) { toast(csvRows?.error || 'The export was refused.', 'bad'); return; }
    const text = serializeCsv(SPEAK_UP_CSV_COLUMNS.map((key) => ({ key, header: key })), csvRows.rows);
    downloadText(`leados-speak-up-${report.asOf}.csv`, text);
  };

  return h('div', { class: 'page', 'data-testid': 'speak-up-panel' },
    pageHeader({
      eyebrow: 'Governance',
      title: 'Who can hear a concern — and did the clock run?',
      subtitle: 'A right to raise a concern with no instrument is a sentence. This register records the route, proves the receiver impartial against the whole reporting graph, and holds the three clocks a speak-up process owes: acknowledgement, outcome and a dated check that nobody was punished for speaking.',
      actions: [
        button('Brief', openBrief, { testid: 'sup-brief-open' }),
        button('Download CSV', downloadCsv, { testid: 'sup-csv' }),
        caps.canRaise ? button('Raise a concern', () => raiseDialog(ctx, onDone), { primary: true, testid: 'sup-raise-open' }) : null,
        caps.canGovern ? button('Conventions', () => conventionsDialog(ctx, report, onDone), { testid: 'sup-conventions-open' }) : null,
      ].filter(Boolean),
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    summaryCard(report),
    banner({
      tone: report.balances && report.auditClean ? 'info' : 'bad',
      title: report.balances && report.auditClean ? 'The printed figures are the computed figures' : 'A claim on this page does not reconcile',
      body: report.claimReason,
    }),
    tabs({
      items: SPEAK_UP_VIEWS.map((row) => ({
        key: row.key,
        label: row.label,
        count: row.key === 'register' ? report.rows.length : row.key === 'routes' ? report.routesRows.length : undefined,
      })),
      active: view,
      ariaLabel: 'Speak-up register views',
      onSelect: (key) => ctx.navigate(`${SPEAK_UP_HREF}?view=${key}`),
    }),
    view === 'register' ? registerView(ctx, report, caps, onDone) : null,
    view === 'routes' ? routesView(report) : null,
    view === 'method' ? methodView() : null,
  );
}

export default renderSpeakUp;
