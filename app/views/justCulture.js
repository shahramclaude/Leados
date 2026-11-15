/**
 * app/views/justCulture.js — `#/just-culture`, the Just Culture Decision Record
 * (ADR-0218, Schema v172).
 *
 * ONE reader (`buildJustCultureReport`) stands behind every state, count, row and
 * finding this page prints. The page formats what the reader returned. The one
 * computation done in the browser is the "answers point to" hint while a manager is
 * answering — and it calls the same pure function (`justCultureExpectation`) the
 * reader and the action use, so the hint can never disagree with the decision the
 * action will accept.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART:
 *   1. a response that FOLLOWS from the answers;
 *   2. a response that DEPARTS from them, which is recorded with a written reason;
 *   3. a review waiting for another line's answer — settled is never implied;
 *   4. a review whose deciding line has ended — orphaned, not quietly re-owned.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table } from '../ui/components.js';
import {
  JC_CHOICE,
  JC_DEVIATION,
  JC_RISK,
  JC_RESPONSES,
  JC_STATES,
  JC_SUBSTITUTION,
  JC_SYSTEM,
  JUST_CULTURE_HREF,
  JUST_CULTURE_LIMITS,
  JUST_CULTURE_METHOD,
  justCultureExpectation,
} from '../core/domain/justCultureRegistry.js';

const L = JUST_CULTURE_LIMITS;
const DIAGRAM_URL = './app/assets/just-culture-method.jpg';
const VIEWS = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'lines', label: 'Lines' },
  { key: 'method', label: 'Method' },
];
const SHORT_RESPONSE = { console: 'Console', coach: 'Coach', 'formal-review': 'Formal review' };
const STATE_TONE = { 'awaiting-decision': 'caution', 'awaiting-concurrence': 'info', contested: 'bad', settled: 'good', orphaned: 'bad', withdrawn: 'neutral' };
const STATE_SHORT = {
  'awaiting-decision': 'Awaiting decision',
  'awaiting-concurrence': 'Awaiting concurrence',
  contested: 'Contested',
  settled: 'Settled',
  orphaned: 'Orphaned',
  withdrawn: 'Withdrawn',
};

function button(label, onClick, { primary = false, testid = null } = {}) {
  return h('button', {
    type: 'button',
    class: `btn btn-small ${primary ? 'btn-primary' : 'btn-ghost'}`,
    ...(testid ? { 'data-testid': testid } : {}),
    onClick,
  }, label);
}

const select = (options, value = '') => options.map((row) => h('option', { value: row.value, ...(row.value === value ? { selected: true } : {}) }, row.label));

/** Answers as options, with the question's own wording so the manager reads what they are answering. */
const answerOptions = (list) => list.map((row) => ({ value: row.key, label: row.label }));

/* ------------------------------------------------------------------ dialogs */

function openReviewDialog(ctx, report, onDone) {
  const boot = ctx.api.justCultureCandidates();
  if (!boot || boot.ok === false) { toast(boot?.error || 'The candidate list could not be read.', 'bad'); return; }
  const people = boot.candidates || [];
  if (!people.length) {
    openModal({
      title: 'Open a review',
      body: banner({ tone: 'info', title: 'No person is held by this seat', body: boot.reason || 'A review can only be opened by a manager of the person.' }),
      actions: [{ label: 'Close', onClick: () => closeAllModals() }],
    });
    return;
  }
  const byId = new Map(people.map((p) => [p.personId, p]));
  const linesFor = (personId) => {
    const row = byId.get(personId);
    if (!row) return [];
    return row.lines.filter((line) => report.seat?.fullAccess || row.heldByMe.includes(line.managerId));
  };
  const deciderOptions = (personId) => {
    const lines = linesFor(personId);
    const multi = (byId.get(personId)?.lines.length || 0) > 1;
    const opts = lines.map((line) => ({ value: line.managerId, label: `${line.managerName} (${line.kind})` }));
    return multi ? [{ value: '', label: 'Choose the deciding line — the record will not choose for you' }, ...opts] : opts;
  };

  const form = buildForm([
    {
      name: 'personId',
      label: 'Whose conduct?',
      type: 'select',
      required: true,
      options: [{ value: '', label: 'Choose a person' }, ...people.map((p) => ({ value: p.personId, label: p.personName }))],
      value: '',
      help: 'Only people whose line you hold appear here. A review of your own conduct is opened by the line above you.',
    },
    {
      name: 'decidingManagerId',
      label: 'Which line decides?',
      type: 'select',
      options: [{ value: '', label: 'Choose a person first' }],
      help: 'A person with several lines must have one named. The record never picks one of several managers for you.',
    },
    { name: 'eventOn', label: 'The day it happened', type: 'date', required: true, value: report.asOf, help: 'Cannot be after today.' },
    { name: 'eventSummary', label: 'What happened?', type: 'textarea', required: true, help: `At least ${L.summaryMin} characters. What was observed, not what it says about the person.` },
    { name: 'eventRef', label: 'Reference (optional)', type: 'text', help: `An incident or ticket reference, up to ${L.refMax} characters.` },
  ]);
  const personField = form.field('personId');
  const deciderField = form.field('decidingManagerId');
  personField?.addEventListener('change', () => {
    deciderField.replaceChildren(...select(deciderOptions(personField.value)));
    deciderField.value = deciderOptions(personField.value).length === 1 ? deciderOptions(personField.value)[0].value : '';
  });

  const submit = () => {
    form.clearErrors();
    const result = ctx.api.justCultureOpen(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The review was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(`Review opened on ${report.asOf}. It is awaiting the deciding line's answers.`, 'good');
    onDone?.();
  };
  openModal({
    title: 'Open a review',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'This opens a review, not a verdict', body: 'Opening a review records the event and who decides. Nothing is decided, and no response is implied, until the deciding line answers the questions.' }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Open review', primary: true, onClick: submit },
    ],
  });
}

function decideDialog(ctx, row, report, onDone) {
  const revising = Boolean(row.decision);
  const form = buildForm([
    { name: 'deviation', label: '1. Did the person depart from a known rule, procedure or agreed standard?', type: 'select', required: true, options: [{ value: '', label: 'Choose' }, ...answerOptions(JC_DEVIATION)], value: '' },
    { name: 'choice', label: '2. If departure: was it a slip or a choice?', type: 'select', options: [{ value: '', label: 'Not asked — no departure' }, ...answerOptions(JC_CHOICE)], value: '', help: 'Asked only when there was a departure.' },
    { name: 'risk', label: '3. If choice: was the risk judged justified, or consciously disregarded?', type: 'select', options: [{ value: '', label: 'Not asked' }, ...answerOptions(JC_RISK)], value: '', help: 'Asked only when the departure was a choice.' },
    { name: 'substitution', label: '4. Substitution test: would a peer with the same training, in the same situation, have done the same?', type: 'select', options: [{ value: '', label: 'Not asked — no departure' }, ...answerOptions(JC_SUBSTITUTION)], value: '', help: 'Asked whenever there was a departure.' },
    { name: 'system', label: '5. Did a system condition contribute?', type: 'select', required: true, options: [{ value: '', label: 'Choose' }, ...answerOptions(JC_SYSTEM)], value: '', help: 'Always asked (latent conditions, Reason 1997).' },
    { name: 'response', label: 'Response chosen', type: 'select', required: true, options: [{ value: '', label: 'Choose a response' }, ...JC_RESPONSES.map((r) => ({ value: r.key, label: r.label }))], value: '' },
    { name: 'departureReason', label: 'If the response departs from the answers: why?', type: 'textarea', help: `Required when the response differs from what the answers point to. At least ${L.noteMin} characters.` },
    { name: 'systemAction', label: 'If a system condition contributed: what system action is owed?', type: 'textarea', help: `Required when question 5 is "present". At least ${L.noteMin} characters.` },
    { name: 'note', label: 'Basis for the decision', type: 'textarea', required: true, help: `At least ${L.noteMin} characters. What you saw and what you weighed.` },
    { name: 'on', label: 'Dated', type: 'date', value: report.asOf, help: 'Cannot be before the review was opened, or before the last act on it.' },
  ]);
  const hint = h('p', { class: 'small', 'data-testid': 'jc-expected-hint' }, '');
  const refreshHint = () => {
    const values = form.getValues();
    const answers = {
      deviation: values.deviation || null,
      choice: values.choice || null,
      risk: values.risk || null,
      substitution: values.substitution || null,
      system: values.system || null,
    };
    const e = justCultureExpectation({
      deviation: answers.deviation,
      choice: answers.deviation === 'departure' ? answers.choice : null,
      risk: answers.deviation === 'departure' && answers.choice === 'intended' ? answers.risk : null,
      substitution: answers.deviation === 'departure' ? answers.substitution : null,
      system: answers.system,
    });
    hint.textContent = e.response
      ? `The answers point to: ${SHORT_RESPONSE[e.response]}. The response you choose is compared with this, and a difference needs your reason.`
      : `Still owed before a response can be compared: ${e.pending.join(', ')}.`;
  };
  for (const name of ['deviation', 'choice', 'risk', 'substitution', 'system']) form.field(name)?.addEventListener('change', refreshHint);
  refreshHint();

  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.justCultureDecide({ reviewId: row.id, ...values });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The decision was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(result.followsAnswers
      ? `${revising ? 'Decision revised' : 'Decision recorded'}: the response follows from the answers.`
      : `${revising ? 'Decision revised' : 'Decision recorded'}: the response departs from the answers, and your reason is on the record.`, 'good');
    onDone?.();
  };
  openModal({
    title: revising ? 'Revise the decision' : 'Decide the review',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Answer the questions in order', body: 'The register does not choose the response. It shows the response the answers point to, and records yours beside it.' }),
      revising ? banner({ tone: 'caution', title: 'A revision resets concurrence', body: 'Every other line the person holds must answer this revision. Earlier concurrence no longer counts.' }) : null,
      hint,
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: revising ? 'Record revision' : 'Record decision', primary: true, onClick: submit },
    ],
  });
}

function concurDialog(ctx, row, report, onDone) {
  const operator = Boolean(report.seat?.fullAccess);
  const owed = row.owedLines;
  const fields = [];
  if (operator) {
    fields.push({ name: 'lineManagerId', label: 'For which line?', type: 'select', required: true, options: [{ value: '', label: 'Choose a line' }, ...owed.map((l) => ({ value: l.managerId, label: l.name }))], value: '' });
  }
  fields.push(
    { name: 'verdict', label: 'Concur or dissent?', type: 'select', required: true, options: [{ value: '', label: 'Choose' }, { value: 'concur', label: 'Concur with the decision in force' }, { value: 'dissent', label: 'Dissent — the decision is not settled' }], value: '' },
    { name: 'note', label: 'Reason', type: 'textarea', help: `Required for a dissent. At least ${L.noteMin} characters.` },
    { name: 'on', label: 'Dated', type: 'date', value: report.asOf, help: 'Cannot be before the decision it answers.' },
  );
  const form = buildForm(fields);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.justCultureConcur({ reviewId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The answer was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast(result.verdict === 'dissented' ? 'Dissent recorded. The decision is contested until it is revised.' : 'Concurrence recorded.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Concur or dissent',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: operator ? 'Operator view' : `Answering as ${report.seat?.label || 'this seat'}`, body: operator ? 'The operator answers for the named line. A declared seat answers only for the line it holds.' : 'You answer for the line you hold. The deciding line does not concur with its own decision.' }),
      form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Record answer', primary: true, onClick: submit },
    ],
  });
}

function withdrawDialog(ctx, row, report, onDone) {
  const form = buildForm([
    { name: 'note', label: 'Why is the review withdrawn?', type: 'textarea', required: true, help: `At least ${L.noteMin} characters. Withdrawal is only possible before any decision.` },
    { name: 'on', label: 'Dated', type: 'date', value: report.asOf },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.justCultureWithdraw({ reviewId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The review was not withdrawn.', 'bad');
      return;
    }
    closeAllModals();
    toast('Review withdrawn. It remains on the record as withdrawn.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Withdraw the review',
    body: h('div', { class: 'stack' }, banner({ tone: 'caution', title: 'Withdrawal keeps the record', body: 'A withdrawn review stays on the register, with its reason. It is not deleted.' }), form.node),
    actions: [
      { label: 'Cancel', onClick: () => closeAllModals() },
      { label: 'Withdraw', primary: true, onClick: submit },
    ],
  });
}

/* ------------------------------------------------------------------ views */

function summaryCard(report) {
  const t = report.totals;
  const s = t.byState;
  return card({
    title: 'What the register holds',
    subtitle: 'Counts of reviews this seat may read, and counts of every review held. A count is a fact about the record, not a verdict on anyone.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Reviews held', value: h('span', { 'data-testid': 'jc-count-total' }, String(t.reviewsN)), hint: `${t.visibleN} shown to this seat · ${t.hiddenN} counted only` }),
      stat({ label: 'Awaiting decision', value: h('span', { 'data-testid': 'jc-count-awaiting-decision' }, String(s['awaiting-decision'])), hint: 'the deciding line owes the answers' }),
      stat({ label: 'Awaiting concurrence', value: h('span', { 'data-testid': 'jc-count-awaiting-concurrence' }, String(s['awaiting-concurrence'])), hint: 'another line the person holds has not answered' }),
      stat({ label: 'Contested', value: h('span', { 'data-testid': 'jc-count-contested' }, String(s.contested)), hint: 'a dissent is open' }),
      stat({ label: 'Orphaned', value: h('span', { 'data-testid': 'jc-count-orphaned' }, String(s.orphaned)), hint: 'the deciding line has ended' }),
      stat({ label: 'Response departs from answers', value: h('span', { 'data-testid': 'jc-count-departs' }, String(t.departsN)), hint: 'each carries a written reason' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'jc-count-attention' }, String(report.attention)), hint: report.attentionReason || 'nothing owed by this seat' }),
    ),
  });
}

function reviewsView(ctx, report, onDone) {
  const canOpen = Boolean(ctx.api.justCultureOpen) && (report.seat?.fullAccess || (report.seat?.rank ?? 99) <= 2);
  const actionsFor = (row) => {
    if (!row.owedByMe) return h('span', { class: 'small muted' }, '—');
    const out = [];
    if (row.state === 'awaiting-decision' || row.state === 'contested') {
      out.push(button(row.state === 'contested' ? 'Revise decision' : 'Decide', () => decideDialog(ctx, row, report, onDone), { testid: `jc-decide-${row.id}` }));
    }
    if (row.state === 'awaiting-concurrence') {
      out.push(button('Concur or dissent', () => concurDialog(ctx, row, report, onDone), { testid: `jc-concur-${row.id}` }));
    }
    if (row.state === 'awaiting-decision') {
      out.push(button('Withdraw', () => withdrawDialog(ctx, row, report, onDone), { testid: `jc-withdraw-${row.id}` }));
    }
    return h('div', { class: 'row gap-s' }, ...out);
  };
  const responseCell = (row) => {
    if (!row.decision) return h('span', { class: 'small muted' }, 'No decision yet');
    const d = row.decision;
    return h('span', null,
      h('strong', null, SHORT_RESPONSE[d.response] || d.response),
      ' ',
      badge(d.followsAnswers ? 'follows answers' : `departs — answers point to ${SHORT_RESPONSE[d.expectedResponse]}`, d.followsAnswers ? 'good' : 'caution'),
      d.revisions ? h('span', { class: 'small muted' }, ` · revised ${d.revisions}×`) : null);
  };
  const columns = [
    { label: 'Person', render: (r) => h('strong', null, r.personName) },
    { label: 'Event', render: (r) => h('span', null, h('span', { class: 'small muted' }, `${r.eventOn} · `), r.eventSummary.length > 120 ? `${r.eventSummary.slice(0, 120)}…` : r.eventSummary) },
    { label: 'State', render: (r) => badge(STATE_SHORT[r.state] || r.state, STATE_TONE[r.state] || 'neutral', r.stateLabel) },
    { label: 'Deciding line', render: (r) => r.deciderName },
    { label: 'Lines held', render: (r) => String(r.lineCount) },
    { label: 'Response', render: responseCell },
    { label: 'Owed by', render: (r) => (r.owedLines.length ? r.owedLines.map((l) => l.name).join(', ') : '—') },
    { label: 'Your action', render: actionsFor },
  ];
  const note = [];
  if (report.totals.hiddenN) note.push(banner({ tone: 'info', title: `${report.totals.hiddenN} review(s) counted, not shown`, body: report.totals.hiddenReason }));
  if (report.rowsCapped > 0) note.push(banner({ tone: 'info', title: `Showing ${report.rowsShown} of ${report.rowsShown + report.rowsCapped} visible reviews`, body: 'The cap is printed, not hidden: the remainder is counted here and readable in order of opening.' }));
  return h('div', { class: 'stack', 'data-testid': 'jc-reviews' },
    canOpen ? h('div', { class: 'row' }, button('Open a review', () => openReviewDialog(ctx, report, onDone), { primary: true, testid: 'jc-open' })) : null,
    ...note,
    table({
      caption: 'Just Culture reviews visible to this seat',
      columns,
      rows: report.rows.map((row) => ({ ...row, attrs: { 'data-testid': `jc-row-${row.id}`, 'data-state': row.state } })),
      emptyMessage: report.totals.reviewsN ? 'No review is visible to this seat. Those held are counted above.' : 'No review has been opened yet.',
    }),
  );
}

function linesView(report) {
  const rows = report.lines.map((line) => {
    const attrs = { 'data-testid': `jc-line-${line.managerId}` };
    if (line.withheld) {
      // A withheld line prints its reason in the counts' place. Never a zero.
      return {
        managerName: line.managerName,
        reviewsN: String(line.reviewsN),
        states: h('span', { class: 'small muted' }, line.withheldReason),
        responses: h('span', { class: 'small muted' }, 'withheld'),
        departs: h('span', { class: 'small muted' }, 'withheld'),
        attrs,
      };
    }
    return {
      managerName: line.managerName,
      reviewsN: String(line.reviewsN),
      states: `${line.byState['awaiting-decision']} / ${line.byState['awaiting-concurrence']} / ${line.byState.contested} / ${line.byState.settled} / ${line.byState.orphaned}`,
      responses: `Console ${line.responses.console} · Coach ${line.responses.coach} · Formal ${line.responses['formal-review']}`,
      departs: String(line.departsN),
      attrs,
    };
  });
  return h('div', { class: 'stack', 'data-testid': 'jc-lines' },
    banner({
      tone: report.totals.withheldLines ? 'info' : 'neutral',
      title: report.totals.withheldLines ? `${report.totals.withheldLines} line(s) withheld below the floor` : 'Every line reaches the floor',
      body: `A line with fewer than ${L.lineFloorN} reviews prints no state or response counts: a count of one would name a person. Withheld is not zero.`,
    }),
    table({
      caption: 'Per deciding line',
      columns: [
        { label: 'Deciding line', key: 'managerName' },
        { label: 'Reviews held', key: 'reviewsN' },
        { label: 'Decide / concur / contested / settled / orphaned', key: 'states' },
        { label: 'Responses', key: 'responses' },
        { label: 'Departs from answers', key: 'departs' },
      ],
      rows,
      emptyMessage: 'No line holds a review yet.',
    }),
  );
}

function methodView() {
  return h('div', { class: 'stack', 'data-testid': 'jc-method' },
    card({
      title: 'The decision path',
      subtitle: 'Marx’s Just Culture algorithm, with the substitution test (Dekker) and latent conditions (Reason). The register computes the response the answers point to; it never chooses it.',
      body: h('figure', { class: 'figure' },
        h('img', { src: DIAGRAM_URL, alt: 'Decision path: departure, then slip or choice, then risk judged justified, then the substitution test. Responses are console, coach and formal review.', class: 'figure-img', 'data-testid': 'jc-diagram' }),
        h('figcaption', { class: 'small muted' }, 'Each branch is a question the manager answers. A system condition is asked on every path.')),
    }),
    card({
      title: 'Frameworks encoded',
      body: h('ul', { class: 'list' }, ...JUST_CULTURE_METHOD.frameworks.map((f) => h('li', null, f))),
    }),
    card({
      title: 'What the page prints, and how',
      body: h('ul', { class: 'list' }, ...JUST_CULTURE_METHOD.printed.map((f) => h('li', null, f))),
    }),
    card({
      title: 'What it deliberately does not do',
      body: h('ul', { class: 'list' }, ...JUST_CULTURE_METHOD.deliberatelyAbsent.map((f) => h('li', null, f))),
    }),
  );
}

export function renderJustCulture(ctx) {
  const report = ctx.api.justCultureReport ? ctx.api.justCultureReport() : null;
  if (!report || report.ok === false || !report.totals) {
    return h('div', { class: 'page' },
      pageHeader({ eyebrow: 'Frontline & mid-manager · matrix', title: 'Just Culture decision record', subtitle: 'Did the person depart, and was it a slip, a choice, or a system condition?' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: report?.error || 'The seat refused the read.' }));
  }
  const requested = ctx.query?.get?.('view');
  const view = VIEWS.some((row) => row.key === requested) ? requested : 'reviews';
  const onDone = () => ctx.refresh?.();
  const matrixNote = report.matrixError ? banner({ tone: 'bad', title: 'Ownership cannot be proved right now', body: report.matrixError }) : null;
  return h('div', { class: 'page', 'data-testid': 'just-culture-panel' },
    pageHeader({
      eyebrow: 'Frontline & mid-manager · matrix',
      title: 'Did the person depart — and was it a slip, a choice, or the system?',
      subtitle: 'A review is owned by the line that decides it, and is settled only when every other line the person holds has answered. The register shows the response the answers point to beside the one chosen, and never corrects it.',
    }),
    ctx.persistError ? card({ body: h('p', { class: 'text-warn small' }, `Changes are not being saved: ${ctx.persistError}`) }) : null,
    matrixNote,
    summaryCard(report),
    banner({
      tone: report.totals.reconciles ? 'info' : 'bad',
      title: report.totals.reconciles ? 'The per-state counts add up to the reviews held' : 'The per-state counts do not add up to the reviews held',
      body: 'Two separate claims. This one is about the counts. The second is that every figure on this page is the figure the reader computed: the page prints the reader’s fields unchanged, and the test suite checks that they match. Neither claim implies the other.',
    }),
    tabs({
      items: VIEWS.map((row) => ({ key: row.key, label: row.label, count: row.key === 'reviews' ? report.rowsShown : row.key === 'lines' ? report.lines.length : undefined })),
      active: view,
      ariaLabel: 'Just Culture views',
      onSelect: (key) => ctx.navigate(`${JUST_CULTURE_HREF}?view=${key}`),
    }),
    view === 'reviews' ? reviewsView(ctx, report, onDone) : null,
    view === 'lines' ? linesView(report) : null,
    view === 'method' ? methodView() : null,
    view === 'reviews' && !report.rows.length && !report.totals.reviewsN
      ? emptyState({ title: 'No review is open', body: 'Opening a review names the deciding line. Nothing is inferred from incidents, feedback or 1:1 notes.' })
      : null,
  );
}

export default renderJustCulture;
