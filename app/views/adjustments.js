/**
 * app/views/adjustments.js — `#/adjustments`, the Workplace Adjustment &
 * Functional-Restriction Register (ADR-0241, Schema v195).
 *
 * ONE reader (`buildWorkplaceAdjustment`) stands behind every state, conflict,
 * duration, median, acknowledgement gap and count this page prints. The page
 * formats what the reader returned; it computes no conflict, no duration and no
 * verdict of its own.
 *
 * THE FOUR THINGS THIS SCREEN KEEPS APART
 *  - what the work must respect (the restriction, with its instrument);
 *  - what somebody actually DID about it (the adjustment, with its two dates);
 *  - whether declared work on ANY line breaks it (an exact test, or a printed
 *    refusal — never a reassuring blank);
 *  - whether every line that hands this person work has been TOLD (the per-line
 *    acknowledgement, which a handover re-opens by itself).
 *
 * DISCLOSURE LADDER. The reader narrows this page: below the executive altitude
 * it shows per-person rows with names; above it the same aggregates with names
 * withheld — counts at the top. The page prints that it is a rendering contract
 * and not an authentication boundary, because this workspace has no
 * authentication and implying otherwise would be the lie that hurts people.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, badge, banner, tabs, emptyState, table, kv } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  WPA_ADJUSTMENT_KINDS,
  WPA_CSV_SCOPE,
  WPA_DOMAIN_BY_KEY,
  WPA_DOMAINS,
  WPA_HREF,
  WPA_INSTRUMENT_BY_KEY,
  WPA_INSTRUMENTS,
  WPA_LIMITS,
  WPA_METHOD,
  WPA_NIGHT_WINDOW_DEFAULTS,
  WPA_REVIEW_DECISIONS,
  WPA_SECTION_TITLES,
  WPA_STATE_BY_KEY,
} from '../core/domain/workplaceAdjustmentRegistry.js';

const L = WPA_LIMITS;
const DIAGRAM_URL = './app/assets/workplace-adjustment-method.jpg';
const VIEWS = [
  { key: 'register', label: WPA_SECTION_TITLES.register },
  { key: 'conflicts', label: WPA_SECTION_TITLES.conflicts },
  { key: 'lines', label: WPA_SECTION_TITLES.lines },
  { key: 'method', label: WPA_SECTION_TITLES.method },
];

const TONE = { bad: 'bad', warn: 'warn', good: 'good', muted: 'neutral' };
const clock = (minutes) => {
  if (!Number.isInteger(minutes)) return '—';
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const minutesLabel = (value) => {
  if (!Number.isInteger(value)) return '—';
  if (value < 60) return `${value} min`;
  const hh = Math.floor(value / 60);
  const mm = value % 60;
  return mm ? `${hh} h ${mm} min` : `${hh} h`;
};
const gramsLabel = (value) => (Number.isInteger(value) ? `${value} g` : '—');
const daysBetween = (from, to) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000));
const limitLabel = (restriction) => {
  const domain = WPA_DOMAIN_BY_KEY[restriction.domain];
  if (!domain?.limit) return 'prohibition';
  return domain.limit === 'grams' ? gramsLabel(restriction.limitValue) : minutesLabel(restriction.limitValue);
};
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

function stateBadge(state) {
  return h('span', {
    class: `badge badge-${TONE[state.tone] || 'neutral'}`,
    title: state.says,
    'data-testid': `wpa-state-${state.key}`,
  }, state.label);
}

/* ------------------------------------------------------------------ dialogs */

function declareRestrictionDialog(ctx, report, onDone) {
  const form = buildForm([
    {
      name: 'personId', label: 'Whose restriction?', type: 'select', required: true,
      options: options(ctx.candidates.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), { blank: 'Choose a person' }),
      help: 'Only people this seat holds through the span or a declared line are listed. One line does not write another line’s people.',
    },
    {
      name: 'domain', label: 'What does the work have to respect?', type: 'select', required: true,
      options: options(WPA_DOMAINS.map((row) => ({ value: row.key, label: `${row.label}${row.testable ? ' — tested against declared work' : ' — recorded, not testable from this record'}` })), { blank: 'Choose a functional domain' }),
      help: 'A closed list on purpose. Free text is where a diagnosis ends up, and it is also what makes an exact test impossible.',
    },
    {
      name: 'instrument', label: 'Where does it come from?', type: 'select', required: true,
      options: options(WPA_INSTRUMENTS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose the instrument' }),
      help: WPA_INSTRUMENTS.map((row) => `${row.label}: ${row.says}`).join(' '),
    },
    {
      name: 'limitValue', label: 'Declared limit (leave blank for a prohibition)', type: 'number', min: 0,
      help: `Whole ${'minutes'} for the hours domains, whole grams for a handling limit. A fraction is refused, never rounded. Leave blank for a pure prohibition such as no night work.`,
    },
    {
      name: 'statement', label: 'The limitation, in the words the work must respect', type: 'textarea', required: true,
      help: `At least ${L.statementMin} characters. Write the LIMITATION — “no lifting above 5 kg”, “no work between 22:00 and 06:00” — never the condition behind it. This register holds no diagnosis and has no field for one.`,
    },
    {
      name: 'sourceRef', label: 'Where this came from (the note’s own wording)', type: 'textarea', required: true,
      help: `At least ${L.textMin} characters: who wrote it and when. A restriction nobody can trace is one nobody can defend.`,
    },
    { name: 'reviewOn', label: 'Review day (optional)', type: 'date', help: 'A restriction with no review day never falls into a review cycle, and the screen says so. A review day is a plan, so it may be ahead.' },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ]);
  const submit = () => {
    form.clearErrors();
    const values = form.getValues();
    const result = ctx.api.workplaceAdjustmentDeclareRestriction({
      ...values,
      limitValue: values.limitValue === '' || values.limitValue === undefined ? null : Number(values.limitValue),
    });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The restriction was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Restriction declared. Every line that holds this person now owes an acknowledgement, and the register prints the gap until it gives one.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Declare a functional restriction',
    description: 'What the work must respect, and where that came from.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'info',
        title: 'No diagnosis, and no field to put one in',
        body: 'This register records the LIMITATION the work must respect — never the condition, symptom or treatment behind it. A manager needs the restriction; the record must not become a medical file.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Declare restriction', onClick: submit, primary: true }],
  });
}

function recordAdjustmentDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Restriction', value: h('p', null, `${row.restriction.statement} — ${WPA_DOMAIN_BY_KEY[row.restriction.domain].label}`) },
    {
      name: 'kind', label: 'What was actually done?', type: 'select', required: true,
      options: options(WPA_ADJUSTMENT_KINDS.map((kind) => ({ value: kind.key, label: kind.label })), { blank: 'Choose what was done' }),
      help: WPA_ADJUSTMENT_KINDS.map((kind) => `${kind.label}: ${kind.says}`).join(' '),
    },
    { name: 'detail', label: 'What exactly changed?', type: 'textarea', required: true, help: `At least ${L.statementMin} characters. “Task substitution” alone does not say which task left the rota.` },
    { name: 'agreedOn', label: 'Day it was agreed', type: 'date', required: true },
    { name: 'costNote', label: 'What it cost (optional)', type: 'textarea', help: 'An aid bought, an agency hour, a lost output — the price of the duty, in the record.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentRecordAdjustment({ restrictionId: row.restriction.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The adjustment was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Adjustment recorded as AGREED. It is not operational yet — that is a separate dated act, and the register prints the distance until it happens.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record an adjustment',
    description: 'What was done, and the day it was agreed.',
    body: h('div', { class: 'stack' },
      banner({
        tone: 'caution',
        title: 'Agreed is not in place',
        body: 'The register holds the agreement day and the operational day separately, because the distance between them is where the cost sits. An adjustment agreed and never made operational reads as its own state, never as done.',
      }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record adjustment', onClick: submit, primary: true }],
  });
}

function operationalDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Adjustment', value: h('p', null, row.detail) },
    { type: 'static', label: 'Agreed on', value: h('p', null, row.agreedOn) },
    { name: 'operationalOn', label: 'The day it actually took effect', type: 'date', required: true, help: 'The exact day the change reached the person’s work — not the day the decision was made.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentMarkOperational({ adjustmentId: row.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The record was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Recorded operational. The register now prints the exact days between agreement and effect.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Mark this adjustment operational',
    body: h('div', { class: 'stack' }, form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record operational', onClick: submit, primary: true }],
  });
}

function reviewDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Restriction', value: h('p', null, `${row.restriction.statement} — review day ${row.restriction.reviewOn || 'none set'}`) },
    {
      name: 'decision', label: 'What did the review decide?', type: 'select', required: true,
      options: options(WPA_REVIEW_DECISIONS.map((d) => ({ value: d.key, label: `${d.label} — ${d.says}` })), { blank: 'Choose the decision' }),
    },
    { name: 'basis', label: 'What did it rest on?', type: 'textarea', required: true, help: `At least ${L.textMin} characters. A recorded refusal WITH a reason is a defensible position; an unanswered request is not, and neither is a decision nobody wrote down.` },
    { name: 'reviewedOn', label: 'Day of the review', type: 'date', required: true },
    { name: 'nextReviewOn', label: 'Next review day (required for “continue”)', type: 'date', help: 'A decision to continue without a next review day lets the restriction fall out of the cycle for ever, so the door refuses it.' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentRecordReview({ restrictionId: row.restriction.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The review was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Review recorded. To LIFT the restriction you must now withdraw it, naming this review as its basis.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Record the review',
    description: 'The decision a human reached, the day, and the basis.',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'The review is the control', body: 'A live restriction can only be lifted on a recorded review that decided to close or amend it. Nobody can delete a duty from this record by typing a reason into a dialog.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Record review', onClick: submit, primary: true }],
  });
}

function withdrawDialog(ctx, row, onDone) {
  const form = buildForm([
    { type: 'static', label: 'Restriction', value: h('p', null, row.restriction.statement) },
    { name: 'reason', label: 'Basis for lifting it', type: 'textarea', required: true, help: `At least ${L.textMin} characters. Work already done under the restriction stays on the record and is never cleared by lifting it.` },
    { name: 'on', label: 'Day it is lifted', type: 'date', required: true },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentWithdrawRestriction({ restrictionId: row.restriction.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The withdrawal was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Restriction lifted. Work done under it remains on the record.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Lift this restriction',
    body: h('div', { class: 'stack' },
      banner({ tone: 'caution', title: 'A recorded review must already exist', body: 'This act is refused unless a review on the record decided to close or amend the restriction. That refusal is the control, not an obstacle.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Lift restriction', onClick: submit, primary: true }],
  });
}

function acknowledgeDialog(ctx, row, onDone) {
  const lines = (row.ack?.lines || []).filter((line) => !line.acknowledged);
  if (!lines.length) {
    toast('Every line holding this person has already acknowledged this restriction.', 'neutral');
    return;
  }
  const form = buildForm([
    { type: 'static', label: 'Restriction', value: h('p', null, row.restriction.statement) },
    {
      name: 'lineManagerId', label: 'Which line is acknowledging?', type: 'select', required: true,
      options: options(lines.map((line) => ({ value: line.managerId, label: line.managerId })), { blank: 'Choose the line' }),
      help: 'An acknowledgement is a dated statement by the holder of ONE line that they have been shown the restriction. A handover re-opens it.',
    },
    { name: 'acknowledgedOn', label: 'Day acknowledged', type: 'date', required: true },
    { name: 'note', label: 'Note (optional)', type: 'textarea' },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentAcknowledgeLine({ restrictionId: row.restriction.id, ...form.getValues() });
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The acknowledgement was refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Line acknowledged. The gap re-opens by itself if the manager changes.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Acknowledge on a line',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Why this row exists', body: 'An adjustment does not survive a handover. Requiring an acknowledgement per line means a manager change re-opens the gap without anybody remembering to look.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Acknowledge', onClick: submit, primary: true }],
  });
}

function conventionsDialog(ctx, report, onDone) {
  const c = report.conventions;
  const form = buildForm([
    { name: 'wpaAdjustmentGraceDays', label: 'Grace before an agreed adjustment is overdue (days)', type: 'number', min: 0, max: 365, value: c.wpaAdjustmentGraceDays, required: true, help: 'A declared convention, not a legal period. The register prints the value it used on every finding.' },
    { name: 'wpaReviewWarnDays', label: 'Review warning window (days)', type: 'number', min: 0, max: 180, value: c.wpaReviewWarnDays, required: true },
    { name: 'wpaPrivacyFloor', label: 'Privacy floor (people)', type: 'number', min: 2, max: 20, value: c.wpaPrivacyFloor, required: true, help: 'Below this many adjustments carrying both dates, no median is printed — a median over fewer rows is a proportion of nothing.' },
    { name: 'wpaNightStartMinute', label: 'Night window opens (minutes after midnight)', type: 'number', min: 0, max: 1439, value: report.nightWindow.startMinute, required: true, help: `Default ${WPA_NIGHT_WINDOW_DEFAULTS.startMinute} (22:00). The window a no-night-work restriction is tested against is DECLARED, never assumed.` },
    { name: 'wpaNightEndMinute', label: 'Night window closes (minutes after midnight)', type: 'number', min: 0, max: 1440, value: report.nightWindow.endMinute, required: true, help: `Default ${WPA_NIGHT_WINDOW_DEFAULTS.endMinute} (06:00 next day). A zero-length window is refused: it would make every night test vacuously pass.` },
  ]);
  const submit = () => {
    form.clearErrors();
    const result = ctx.api.workplaceAdjustmentSetConventions(form.getValues());
    if (!result?.ok) {
      if (result?.field) form.setFieldError(result.field, result.error || '');
      toast(result?.error || 'The conventions were refused.', 'bad');
      return;
    }
    closeAllModals();
    toast('Conventions set. Every finding on this page is re-read against them.', 'good');
    onDone?.();
  };
  openModal({
    title: 'Set the register’s conventions',
    body: h('div', { class: 'stack' },
      banner({ tone: 'info', title: 'Declared, not fitted', body: 'The night window, the grace and the floors are declarations. None is inferred from the record, and the register prints the value it used.' }),
      form.node),
    footer: [{ label: 'Cancel', onClick: () => closeAllModals() }, { label: 'Set conventions', onClick: submit, primary: true }],
  });
}

/* -------------------------------------------------------------------- views */

function summaryCard(report) {
  const t = report.totals;
  return card({
    title: 'What the register holds',
    subtitle: 'Every figure is derived on read from dated declarations and the live reporting graph. A limit the record cannot test is printed with its reason, never as clear.',
    body: h('div', { class: 'stat-grid' },
      stat({ label: 'Live restrictions', value: h('span', { 'data-testid': 'wpa-count-live' }, String(t.live)), hint: `${t.peopleN} person(s) · ${t.withdrawn} withdrawn` }),
      stat({ label: 'In proven conflict', value: h('span', { 'data-testid': 'wpa-count-conflict' }, String(t.conflictN)), hint: `${t.conflictMinutes} minute(s) of declared exposure` }),
      stat({ label: 'Agreed, not in place', value: h('span', { 'data-testid': 'wpa-count-agreed' }, String(t.agreedNotInPlaceN)), hint: report.medianAgreedToOperational ? `median ${report.medianAgreedToOperational.formatted} day(s) to operational` : 'median withheld' }),
      stat({ label: 'In place', value: h('span', { 'data-testid': 'wpa-count-inplace' }, String(t.inPlaceN)), hint: 'agreed AND recorded operational' }),
      stat({ label: 'No adjustment', value: h('span', { 'data-testid': 'wpa-count-no-adjustment' }, String(t.noAdjustmentN)), hint: `${t.declinedN} declined with a reason` }),
      stat({ label: 'Past review date', value: h('span', { 'data-testid': 'wpa-count-overdue' }, String(t.reviewOverdueN)), hint: 'time never lifts a restriction' }),
      stat({ label: 'Not testable', value: h('span', { 'data-testid': 'wpa-count-unproven' }, String(t.unprovenN)), hint: 'reason printed on each — never a clearance' }),
      stat({ label: 'Your attention', value: h('span', { 'data-testid': 'wpa-count-attention' }, String(report.attention.total)), hint: 'conflicts, overdue reviews, agreed-not-in-place, line gaps' }),
    ),
  });
}

function claimsBanners(report) {
  return h('div', { class: 'stack' },
    banner({
      tone: report.balances.statesReconcile && report.balances.linesReconcile ? 'info' : 'bad',
      title: report.balances.statesReconcile && report.balances.linesReconcile
        ? 'The parts re-add: every state count and every line acknowledgement ties to the rows it summarises'
        : 'The printed counts do NOT re-add to the rows they summarise',
      body: `States ${report.stateTotal} of ${report.totals.live} live restrictions · lines ${report.totals.linesAcknowledgedN} acknowledged of ${report.totals.linesN}. This is the first claim. It says nothing about whether the register could see everything.`,
    }),
    banner({
      tone: report.figuresComplete ? 'good' : 'caution',
      title: report.figuresComplete
        ? 'Coverage is complete: every restriction was tested or explicitly refused, and every line was acknowledged'
        : 'NOT CERTIFIED — the register could not see the whole picture',
      body: report.figuresComplete
        ? 'The second claim, separate from the first: no unreadable row, no orphan, no unacknowledged line and no untestable limit is outstanding.'
        : report.incompleteReasons.join(' '),
    }),
    banner({
      tone: report.medianAgreedToOperational ? 'info' : 'caution',
      title: 'Agreed to operational',
      body: report.medianAgreedToOperational
        ? `Median ${report.medianAgreedToOperational.formatted} day(s) between the agreement day and the day ${report.medianAgreedToOperational.n} adjustment(s) became operational. The two dates are the ones the adjustment-register category says employers cannot produce.`
        : report.medianReason,
    }),
    report.detailed ? null : banner({ tone: 'caution', title: 'Names withheld at this altitude', body: report.disclosure.reason }),
  );
}

function registerTable(ctx, report, onDone) {
  if (!report.liveRows.length) {
    return card({
      title: 'Live restrictions',
      body: emptyState({
        title: 'No live restriction is on the record',
        body: 'A restriction is declared by a seat that holds the person, on a written instrument, as a functional limitation. Nothing is inferred from an absence, a plan or a shift pattern.',
        action: button('Declare a restriction', () => declareRestrictionDialog(ctx, report, onDone), { primary: true, testid: 'wpa-declare' }),
      }),
    });
  }
  const columns = [
    { label: 'Person', render: (row) => (report.detailed
      ? h('div', null,
        h('strong', { 'data-testid': `wpa-person-${row.restriction.id}` }, row.personName || 'Not on the graph'),
        row.orphan ? h('div', { class: 'small text-warn' }, 'outside the reporting graph — limits untested') : null)
      : h('span', { class: 'muted' }, 'withheld')) },
    { label: 'What the work must respect', render: (row) => h('div', null,
      h('div', null, row.restriction.statement),
      h('div', { class: 'small muted' }, `${WPA_DOMAIN_BY_KEY[row.restriction.domain].label} · limit ${limitLabel(row.restriction)} · ${WPA_INSTRUMENT_BY_KEY[row.restriction.instrument].label}`)) },
    { label: 'State', render: (row) => stateBadge(row.state) },
    { label: 'Declared work', render: (row) => {
      const test = row.test;
      if (!test) return h('span', { class: 'muted' }, '—');
      if (test.testable === false) return h('span', { class: 'small text-warn', 'data-testid': `wpa-test-${row.restriction.id}` }, 'not testable', h('div', { class: 'small muted' }, test.reason));
      if (test.verdict === 'breached') return h('span', { class: 'small text-bad', 'data-testid': `wpa-test-${row.restriction.id}`, 'data-minutes': String(test.measuredMinutes) }, `${minutesLabel(test.measuredMinutes)} of conflict`);
      if (test.verdict === 'within') return h('span', { class: 'small' }, 'within the limit', h('div', { class: 'small muted' }, test.basis || ''));
      return h('span', { class: 'small text-warn' }, 'unproven', h('div', { class: 'small muted' }, test.unprovenReason || 'The measurement could not be taken.'));
    } },
    { label: 'Lines', render: (row) => (row.ack
      ? h('span', { 'data-testid': `wpa-lines-${row.restriction.id}` }, `${row.ack.acknowledgedN}/${row.ack.linesN} acknowledged`,
        row.ack.missingN ? h('div', { class: 'small text-warn' }, `${row.ack.missingN} line(s) never shown`) : null)
      : h('span', { class: 'muted' }, '—')) },
    { label: 'Review', render: (row) => (row.restriction.reviewOn
      ? h('span', { class: row.state.key === 'review-overdue' ? 'small text-bad' : 'small' }, row.restriction.reviewOn)
      : h('span', { class: 'small muted', title: 'A restriction with no review day never falls into a review cycle.' }, 'none set')) },
    { label: 'Actions', render: (row) => h('div', { class: 'row-actions' },
      button('Review', () => reviewDialog(ctx, row, onDone), { testid: `wpa-review-${row.restriction.id}` }),
      button('Adjust', () => recordAdjustmentDialog(ctx, row, onDone)),
      row.ack?.missingN ? button('Acknowledge', () => acknowledgeDialog(ctx, row, onDone)) : null,
      button('Lift', () => withdrawDialog(ctx, row, onDone))) },
  ];
  return card({
    title: 'Live restrictions',
    subtitle: 'The limitation, what the record can prove about the work, and whether every line has been told. Rows are grouped by nothing and ranked by nobody.',
    actions: [button('Declare a restriction', () => declareRestrictionDialog(ctx, report, onDone), { primary: true, testid: 'wpa-declare' })],
    body: table({ columns, rows: report.liveRows, caption: 'Live functional restrictions', emptyMessage: 'No live restriction.' }),
  });
}

function adjustmentsCard(ctx, report, onDone) {
  const rows = report.liveRows.filter((row) => row.adjustments.length);
  if (!rows.length) return null;
  return card({
    title: 'Adjustments on the record',
    subtitle: 'The agreed day and the operational day are separate facts. The distance between them is where the cost sits, and it is printed exactly.',
    body: h('div', { class: 'stack' }, ...rows.map((row) => h('div', { class: 'stack-tight', 'data-testid': `wpa-adjustments-${row.restriction.id}` },
      h('div', { class: 'row-between' },
        h('strong', null, report.detailed ? (row.personName || 'Not on the graph') : 'withheld'),
        stateBadge(row.state)),
      ...row.adjustments.map((adjustment) => h('div', { class: 'stack-tight' },
        kv(
          WPA_ADJUSTMENT_KINDS.find((kind) => kind.key === adjustment.kind)?.label || adjustment.kind,
          h('div', null,
            h('div', null, adjustment.detail),
            h('div', { class: 'small muted', 'data-testid': `wpa-adjustment-dates-${adjustment.id}` },
              `agreed ${adjustment.agreedOn}`,
              adjustment.operationalOn
                ? ` \u00b7 operational ${adjustment.operationalOn} \u00b7 ${daysBetween(adjustment.agreedOn, adjustment.operationalOn)} day(s) to take effect`
                : ' \u00b7 NOT operational'),
            adjustment.status === 'retired'
              ? h('div', { class: 'small text-warn' }, `retired ${adjustment.retiredOn}: ${adjustment.retiredReason}`)
              : null),
        ),
        adjustment.status === 'active' && !adjustment.operationalOn
          ? button('Mark operational', () => operationalDialog(ctx, adjustment, onDone), { testid: `wpa-operational-${adjustment.id}` })
          : null,
      )),
    ))),
  });
}

function conflictsView(report) {
  const conflicted = report.liveRows.filter((row) => row.test?.verdict === 'breached');
  const unproven = report.liveRows.filter((row) => row.test?.testable === false || row.test?.verdict === 'unproven');
  return h('div', { class: 'stack' },
    card({
      title: 'Declared work that breaks a limit this record can prove',
      subtitle: `Tested exactly against declared shifts on EVERY reporting line, inside a declared night window of ${clock(report.nightWindow.startMinute)}–${clock(report.nightWindow.endMinute)}. Whole minutes, no averaging.`,
      body: conflicted.length
        ? h('div', { class: 'stack' }, ...conflicted.map((row) => h('div', { class: 'stack-tight', 'data-testid': `wpa-conflict-${row.restriction.id}` },
          h('div', { class: 'row-between' },
            h('strong', null, report.detailed ? (row.personName || 'Not on the graph') : 'withheld'),
            badge(`${minutesLabel(row.test.measuredMinutes)} of exposure`, 'bad')),
          h('p', { class: 'small' }, row.restriction.statement),
          h('p', { class: 'small muted' }, row.test.basis),
          ...(row.test.exposures || []).slice(0, 8).map((exposure) => kv(
            `${exposure.startText} → ${exposure.endText}`,
            `${minutesLabel(exposure.minutes)} on a line held by ${report.detailed ? (report.matrix?.nodes?.get(exposure.lineManagerId)?.name || exposure.lineManagerId) : 'a line'}`,
          )),
          row.state.key === 'operational-conflict'
            ? banner({ tone: 'caution', title: 'An adjustment is also in place', body: 'Both facts are true and both are printed. An adjustment existing does not make the rostered work lawful.' })
            : null,
        )))
        : emptyState({ title: 'No proven conflict with declared work', body: 'Either every tested limit is respected by the declared shifts, or the limits that could conflict are untestable from this record — the next card lists those, and none of them is a clearance.' }),
    }),
    card({
      title: 'Limits this record cannot test',
      subtitle: 'The register refuses rather than guesses what a lifting task weighs, how long somebody stood, or what the noise level was. A blank here is not a clearance.',
      body: unproven.length
        ? table({
          columns: [
            { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
            { label: 'Domain', render: (row) => WPA_DOMAIN_BY_KEY[row.restriction.domain].label },
            { label: 'Why no test', render: (row) => h('span', { class: 'small text-warn', 'data-testid': `wpa-unproven-${row.restriction.id}` }, row.test.reason) },
          ],
          rows: unproven,
          caption: 'Restrictions that could not be tested against declared work',
          emptyMessage: 'Every live restriction was testable.',
        })
        : emptyState({ title: 'Every live limit was tested', body: 'No restriction on the record is in an untestable domain.' }),
    }),
    card({
      title: 'By functional domain',
      subtitle: 'A closed vocabulary, so the kind of limitation carried is visible without naming a person.',
      body: table({
        columns: [
          { label: 'Domain', key: 'label' },
          { label: 'Rules', key: 'rulesN' },
          { label: 'People', key: 'peopleN' },
          { label: 'Proven conflicts', key: 'conflictN' },
          { label: 'Not testable', key: 'unprovenN' },
          { label: 'In place', key: 'inPlaceN' },
        ],
        rows: report.domainRows,
        caption: 'Live restrictions by functional demand domain',
        emptyMessage: 'No live restriction.',
      }),
    }),
  );
}

function linesView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'Per line: who has been told',
      subtitle: 'An adjustment does not survive a handover. Every active line that holds a restricted person owes a dated acknowledgement, and a manager change re-opens it by itself. A person on two lines is counted once in every people figure and appears on both lines.',
      body: table({
        columns: [
          { label: 'Line holder', render: (row) => (report.detailed ? row.managerName : 'withheld') },
          { label: 'Restricted people', render: (row) => h('span', { 'data-testid': `wpa-line-people-${row.managerId}` }, String(row.restrictedPeopleN)) },
          { label: 'Lines held', key: 'linesN' },
          { label: 'Acknowledged', render: (row) => h('span', { class: row.missingN ? 'text-warn' : '', 'data-testid': `wpa-line-ack-${row.managerId}` }, `${row.acknowledgedN}/${row.linesN}`) },
          { label: 'Not acknowledged', render: (row) => (row.missingN ? badge(`${row.missingN} owed`, 'bad') : badge('complete', 'good')) },
          { label: 'Proven conflicts', key: 'conflictsN' },
          { label: 'No adjustment', key: 'noAdjustmentN' },
        ],
        rows: report.lineRows,
        caption: 'Acknowledgement position per reporting line',
        emptyMessage: 'No active line holds a restricted person.',
      }),
    }),
    card({
      title: 'Review horizon',
      subtitle: 'A review date that has passed does not lift a restriction: the duty is still live and nobody has re-checked it. Overdue rows lead.',
      body: table({
        columns: [
          { label: 'Person', render: (row) => (report.detailed ? (row.personName || 'Not on the graph') : 'withheld') },
          { label: 'Domain', render: (row) => WPA_DOMAIN_BY_KEY[row.domain]?.label || row.domain },
          { label: 'Review day', key: 'reviewOn' },
          { label: 'Position', render: (row) => (row.overdue
            ? badge(`${Math.abs(row.daysRemaining)} day(s) overdue`, 'bad')
            : row.warn ? badge(`${row.daysRemaining} day(s)`, 'warn') : badge(`${row.daysRemaining} day(s)`, 'neutral')) },
        ],
        rows: report.reviewRows,
        caption: 'Restrictions with a declared review day',
        emptyMessage: 'No live restriction carries a review day. That is itself a finding: nothing here will ever ask for a review.',
      }),
    }),
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'What this register is, and what it refuses to be',
      body: h('div', { class: 'stack' },
        h('img', { src: DIAGRAM_URL, alt: 'A method figure showing a functional restriction moving from instrument to declaration, agreed and operational dates, declared work tested across every reporting line, and per-line acknowledgement — with the register refusing where the record cannot prove a limit.', class: 'method-figure' }),
        kv('Engine', WPA_METHOD.engine),
        kv('Decision record', WPA_METHOD.adr),
        h('h3', null, 'Frameworks applied'),
        h('ul', null, ...WPA_METHOD.frameworks.map((line) => h('li', null, line))),
        h('h3', null, 'What is printed'),
        h('ul', null, ...WPA_METHOD.printed.map((line) => h('li', null, line))),
        h('h3', null, 'Deliberately absent'),
        h('ul', null, ...WPA_METHOD.deliberatelyAbsent.map((line) => h('li', null, line))),
        h('h3', null, 'Disclosure'),
        banner({ tone: 'caution', title: 'A rendering contract, not an authentication boundary', body: 'Seats in this workspace are workflow declarations, not logins. The reader withholds person-level rows above rank 3, and this page says so rather than implying a permission system the workspace cannot enforce.' }),
      ),
    }),
  );
}

/* -------------------------------------------------------------------- page */

export function renderAdjustments(ctx) {
  const view = ctx.query?.get?.('view') || 'register';
  let report;
  try {
    const result = ctx.api.workplaceAdjustmentReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'Workplace adjustments', title: 'Workplace adjustments', subtitle: 'Functional restrictions and what was done about them.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'Workplace adjustments', title: 'Workplace adjustments' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = [];
  try {
    const result = ctx.api.workplaceAdjustmentCandidates();
    if (result?.ok) candidates = result.people;
  } catch { candidates = []; }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: WPA_HREF } }));
    ctx.rerender?.();
  };
  const local = { api: ctx.api, candidates };

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, WPA_CSV_SCOPE);
      if (!file) { toast('The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.content, 'text/csv');
      toast('Exported. Counts only: no person, statement, reference or date crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'People · adjustments',
    title: 'Workplace adjustments',
    subtitle: 'What work a person must not do, what somebody actually did about it, whether declared work on any line breaks it, and whether every line has been told.',
    actions: [
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(local, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.live} live restriction(s)`,
      `${report.totals.peopleN} person(s)`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({ items: VIEWS, active: VIEWS.some((row) => row.key === view) ? view : 'register', onSelect: (key) => { window.location.hash = `${WPA_HREF}?view=${key}`; }, ariaLabel: 'Workplace adjustment sections' }),
    view === 'conflicts' ? conflictsView(report)
      : view === 'lines' ? linesView(report)
        : view === 'method' ? methodView(report)
          : h('div', { class: 'stack' }, registerTable(local, report, onDone), adjustmentsCard(local, report, onDone)),
    report.warnings.length
      ? card({
        title: 'Unreadable rows, counted and refused',
        subtitle: 'Nothing here was repaired: a stored row this register cannot read exactly is dropped with a count rather than guessed at.',
        body: h('ul', null, ...report.warnings.slice(0, 20).map((line) => h('li', { class: 'small' }, line))),
      })
      : null,
  );

  return h('div', { class: 'stack' }, header, body);
}
