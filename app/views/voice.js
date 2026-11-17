/**
 * app/views/voice.js — `#/voice`, the Employee Voice & Collective Consultation
 * Register (ADR-0243, Schema v197).
 *
 * ONE reader (`buildVoice`) stands behind every state, window, days-early figure,
 * days-late figure, quorum finding and count this page prints. The page formats
 * what the reader returned; it computes no window, no lateness and no verdict of
 * its own.
 *
 * THE FIVE THINGS THIS SCREEN KEEPS APART
 *  - what was put to a body, on which written instrument, with which documents;
 *  - the period the body was given, the day it closed, and the exact days left;
 *  - what the body actually advised, in its own words, and whether it arrived
 *    late — kept, never silently forgiven;
 *  - whether the organisation answered, and whether the decision followed,
 *    departed or was taken with no advice at all;
 *  - whether the decision's day preceded the close of the window. That is the
 *    breach, it is printed with the exact days early, and it is never repaired.
 *
 * WHAT THE SCREEN REFUSES TO SAY. It never reads a lapsed window as agreement,
 * never summarises an advice it did not hear, never rates a representative or a
 * body, and never calls an unanswered advice a closed consultation.
 *
 * DISCLOSURE LADDER. Above rank 3 the reader withholds subjects, representative
 * names and written advice, and the page prints that narrowing as a rendering
 * contract rather than an authentication boundary — this workspace has no
 * authentication, and implying otherwise would be the lie that hurts people.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { pageHeader, card, stat, banner, tabs, emptyState, table } from '../ui/components.js';
import { downloadText } from '../ui/download.js';
import { exportWorkspaceCsv } from '../core/csv.js';
import {
  VOI_ADVICE_COURSES,
  VOI_BODY_KINDS,
  VOI_CSV_SCOPE,
  VOI_HREF,
  VOI_ITEM_KINDS,
  VOI_LIMITS,
  VOI_MEMBER_ROLES,
  VOI_METHOD,
  VOI_SECTION_TITLES,
} from '../core/domain/voiceRegistry.js';

const L = VOI_LIMITS;
const PANELS = [
  { key: 'board', label: VOI_SECTION_TITLES.board },
  { key: 'items', label: VOI_SECTION_TITLES.items },
  { key: 'sittings', label: VOI_SECTION_TITLES.sittings },
  { key: 'lines', label: VOI_SECTION_TITLES.lines },
  { key: 'method', label: VOI_SECTION_TITLES.method },
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

function declareBodyDialog(ctx, local, onDone) {
  dialog({
    title: 'Declare a consultation body',
    description: 'What the body is, the written instrument that constitutes it, its quorum and its term.',
    fields: [
      { name: 'name', label: 'Name of the body', type: 'text', required: true, help: `At least ${L.nameMin} characters. The name people use for it.` },
      { name: 'kind', label: 'Kind of body', type: 'select', required: true, options: options(VOI_BODY_KINDS.map((row) => ({ value: row.key, label: row.label })), { blank: 'Choose a kind' }) },
      { name: 'instrumentRef', label: 'The written instrument', type: 'text', required: true, help: `At least ${L.instrumentMin} characters: the constitution, the agreement, the clause. A body with no instrument has no quorum and no competence.` },
      { name: 'constitutedOn', label: 'Day it was constituted (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'termEndsOn', label: 'Day its term ends (optional, may be future)', type: 'text' },
      { name: 'quorumWhole', label: 'Quorum (whole representatives)', type: 'number', min: L.quorumMin, max: L.quorumMax, required: true, help: 'The body’s own number. The software never chooses one.' },
    ],
    call: (values) => ctx.api.voiceDeclareBody({ ...values, quorumWhole: Number(values.quorumWhole) }),
    success: () => 'Body declared. An item can now be put to it, and the door will refuse one after its term ends.',
    onDone,
  });
}

function declareMemberDialog(ctx, local, onDone) {
  dialog({
    title: 'Declare a representative',
    description: 'Who sits on the body, how they came by the seat, and the term that entitles them to advise.',
    fields: [
      { name: 'bodyId', label: 'Body', type: 'select', required: true, options: options(local.bodies.map((row) => ({ value: row.id, label: `${row.name} (${row.membersN} in term)` })), { blank: 'Choose a body' }) },
      { name: 'personId', label: 'Person', type: 'select', required: true, options: options(local.people.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), { blank: 'Choose a person' }) },
      { name: 'role', label: 'Standing', type: 'select', required: true, options: options(VOI_MEMBER_ROLES.map((row) => ({ value: row.key, label: row.label }))) },
      { name: 'basis', label: 'Elected or appointed', type: 'select', required: true, options: options([{ value: 'elected', label: 'Elected' }, { value: 'appointed', label: 'Appointed' }]) },
      { name: 'electedOn', label: 'Election day (required for an elected seat)', type: 'text' },
      { name: 'termStart', label: 'Term starts (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'termEnd', label: 'Term ends (optional)', type: 'text' },
    ],
    call: (values) => ctx.api.voiceDeclareMember(values),
    success: () => 'Representative declared with a dated mandate. Observers count for attendance but never for quorum.',
    onDone,
  });
}

function openItemDialog(ctx, local, onDone) {
  const bodyOptions = local.bodies.map((row) => ({ value: row.id, label: row.name }));
  dialog({
    title: 'Put an item to a body',
    description: 'What is being put, on which written instrument, over which declared period, affecting which lines.',
    fields: [
      { name: 'bodyId', label: 'Body', type: 'select', required: true, options: options(bodyOptions, { blank: 'Choose a body' }) },
      { name: 'subject', label: 'What is being put to it', type: 'text', required: true, help: `At least ${L.subjectMin} characters — the change itself, not “consultation”.` },
      { name: 'kind', label: 'What the body owes back', type: 'select', required: true, options: options(VOI_ITEM_KINDS.map((row) => ({ value: row.key, label: `${row.label} — ${row.says}` }))) },
      { name: 'instrumentRef', label: 'The written instrument that sets the period', type: 'text', required: true, help: `At least ${L.instrumentMin} characters. There is no default period in this register.` },
      { name: 'windowDays', label: 'Period declared, in whole days (0 for information)', type: 'number', min: 0, max: L.windowMax, required: true, help: 'From the instrument you cited. Consultation and negotiation need at least one day.' },
      { name: 'openedOn', label: 'Day it was put (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'ownerIds', label: 'Affected reporting lines', type: 'boolean-block', options: local.lines.map((row) => ({ value: row.id, label: `${row.name}${row.role ? ` — ${row.role}` : ''}` })), help: 'Name every line whose work the change touches. At least one is required. The decision will belong to the joint seat above all of them, never to one of them.' },
    ],
    call: (values) => ctx.api.voiceOpenItem({
      bodyId: values.bodyId,
      subject: values.subject,
      kind: values.kind,
      instrumentRef: values.instrumentRef,
      windowDays: Number(values.windowDays),
      openedOn: values.openedOn,
      ownerIds: Array.isArray(values.ownerIds) ? values.ownerIds : [],
    }),
    success: (result) => `Item opened${result?.closesOn ? `; the declared period closes on ${result.closesOn}` : '; nothing is owed back on an information item'}.`,
    onDone,
  });
}

function holdSittingDialog(ctx, local, onDone) {
  const bodyId = local.bodies[0]?.id || '';
  const membersOfBody = local.members.filter((row) => row.bodyId === bodyId);
  dialog({
    title: 'Record a sitting',
    description: 'When the body sat, who attended, which items it heard and — if they exist — its minutes.',
    fields: [
      { name: 'bodyId', label: 'Body', type: 'select', required: true, options: options(local.bodies.map((row) => ({ value: row.id, label: row.name })), { blank: 'Choose a body' }) },
      { name: 'on', label: 'Day it sat (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'presentIds', label: 'Members present', type: 'boolean-block', options: membersOfBody.map((row) => ({ value: row.id, label: `${row.name} (${row.role})` })), help: 'Attendance is declared against the body’s own quorum. Observers never make it quorate.' },
      { name: 'itemIds', label: 'Items heard', type: 'boolean-block', options: local.items.filter((row) => row.bodyId === bodyId).map((row) => ({ value: row.id, label: row.subject })) },
      { name: 'minutesOn', label: 'Day the minutes were recorded (optional)', type: 'text' },
      { name: 'minutesRef', label: 'Where the minutes are held (required with the day)', type: 'text' },
    ],
    call: (values) => ctx.api.voiceHoldSitting({
      bodyId: values.bodyId,
      on: values.on,
      presentIds: Array.isArray(values.presentIds) ? values.presentIds : [],
      itemIds: Array.isArray(values.itemIds) ? values.itemIds : [],
      minutesOn: values.minutesOn || null,
      minutesRef: values.minutesRef || null,
    }),
    success: () => 'Sitting recorded. The reader compares attendance with the body’s own quorum and prints the minutes finding.',
    onDone,
  });
}

function recordMinutesDialog(ctx, local, sittingId, onDone) {
  dialog({
    title: 'Record the minutes',
    description: 'The day the minutes were recorded and the reference that holds them. Both are needed.',
    fields: [
      { name: 'sittingId', label: 'Sitting', type: 'select', required: true, value: sittingId, options: options(local.sittings.filter((row) => !row.minutesOn).map((row) => ({ value: row.id, label: `Sitting of ${row.on}` })), { blank: 'Choose a sitting' }) },
      { name: 'on', label: 'Day recorded (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'reference', label: 'Reference that holds the minutes', type: 'text', required: true },
    ],
    call: (values) => ctx.api.voiceRecordMinutes(values),
    success: () => 'Minutes recorded. A late minute keeps its exact late days on the record.',
    onDone,
  });
}

function recordAdviceDialog(ctx, local, itemId, onDone) {
  dialog({
    title: 'Record what the body advised',
    description: 'The day it arrived, the course it took, and the body’s own words. The register never paraphrases.',
    fields: [
      { name: 'itemId', label: 'Item', type: 'select', required: true, value: itemId, options: options(local.items.filter((row) => !row.hasAdvice && row.kind !== 'information').map((row) => ({ value: row.id, label: row.subject })), { blank: 'Choose an item' }) },
      { name: 'receivedOn', label: 'Day the advice arrived (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'advice', label: 'What the body advised', type: 'select', required: true, options: options(VOI_ADVICE_COURSES.map((row) => ({ value: row.key, label: `${row.label} — ${row.says}` }))) },
      { name: 'note', label: 'The body’s own words', type: 'textarea', rows: 4, required: true, help: `At least ${L.textMin} characters. Stored and printed verbatim.` },
    ],
    call: (values) => ctx.api.voiceRecordAdvice(values),
    success: (result) => (result?.lateDays ? `Advice recorded ${result.lateDays} day(s) after the window closed. The lateness stays printed beside it.` : 'Advice recorded inside the declared window. The organisation’s written reply is now owed.'),
    onDone,
  });
}

function replyDialog(ctx, local, itemId, onDone) {
  dialog({
    title: 'Answer the advice in writing',
    description: 'A body that is consulted and never answered learns that consulting changes nothing.',
    fields: [
      { name: 'itemId', label: 'Item', type: 'select', required: true, value: itemId, options: options(local.items.filter((row) => row.hasAdvice && !row.hasReply).map((row) => ({ value: row.id, label: row.subject })), { blank: 'Choose an item' }) },
      { name: 'replyOn', label: 'Day of the reply (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'replyNote', label: 'The reply', type: 'textarea', rows: 4, required: true, help: `At least ${L.textMin} characters. “Noted” is not an answer.` },
    ],
    call: (values) => ctx.api.voiceReplyToAdvice(values),
    success: () => 'Reply recorded. The decision on this item is still owed and is recorded separately.',
    onDone,
  });
}

function decisionDialog(ctx, local, itemId, onDone) {
  dialog({
    title: 'Record the decision',
    description: 'The day, what it did with the body’s position, and the day the change took effect. The door refuses a decision before the declared window closes.',
    fields: [
      { name: 'itemId', label: 'Item', type: 'select', required: true, value: itemId, options: options(local.items.filter((row) => !row.hasDecision).map((row) => ({ value: row.id, label: row.subject })), { blank: 'Choose an item' }) },
      { name: 'decidedOn', label: 'Day the decision was taken (YYYY-MM-DD)', type: 'text', required: true },
      { name: 'course', label: 'What the decision did with the advice', type: 'select', required: true, options: options([
        { value: 'followed-advice', label: 'Followed the advice' },
        { value: 'departed', label: 'Departed from the advice (needs a written reason)' },
        { value: 'proceeded-without-advice', label: 'Proceeded with no advice (needs a written reason)' },
      ]) },
      { name: 'note', label: 'Written reason (required for a departure or no advice)', type: 'textarea', rows: 4 },
      { name: 'implementedOn', label: 'Day the change took effect (optional)', type: 'text' },
    ],
    call: (values) => ctx.api.voiceRecordDecision(values),
    success: () => 'Decision recorded at the joint seat above the affected lines.',
    onDone,
  });
}

function conventionsDialog(ctx, report, onDone) {
  dialog({
    title: 'Register conventions',
    description: 'The reply window, the minutes window and the privacy floor. None is fitted from the record.',
    fields: [
      { name: 'voiceReplyDays', label: 'Days to answer advice', type: 'number', min: 1, max: 60, required: true, value: report.conventions.voiceReplyDays },
      { name: 'voiceMinutesDueDays', label: 'Days to record minutes', type: 'number', min: 1, max: 60, required: true, value: report.conventions.voiceMinutesDueDays },
      { name: 'voicePrivacyFloor', label: 'Privacy floor for the per-state export', type: 'number', min: 2, max: 20, required: true, value: report.conventions.voicePrivacyFloor },
    ],
    call: (values) => ctx.api.voiceSetConventions({
      patch: {
        voiceReplyDays: Number(values.voiceReplyDays),
        voiceMinutesDueDays: Number(values.voiceMinutesDueDays),
        voicePrivacyFloor: Number(values.voicePrivacyFloor),
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
      stat({ label: 'Bodies', value: String(report.totals.bodies), hint: `${report.totals.liveMembers} representative(s) in term` }),
      stat({ label: 'Items', value: String(report.totals.items), hint: `${report.totals.consultations} consultation · ${report.totals.negotiations} negotiation · ${report.totals.information} information` }),
      stat({ label: 'Window closed, no advice', value: String(report.totals.adviceLapsedN), tone: report.totals.adviceLapsedN ? 'bad' : '', hint: 'Silence is not consent', action: h('span', { 'data-testid': 'voice-count-lapsed', class: 'sr-only' }, String(report.totals.adviceLapsedN)) }),
      stat({ label: 'Advice unanswered', value: String(report.totals.replyOverdueN), tone: report.totals.replyOverdueN ? 'warn' : '', hint: 'Past the declared reply day', action: h('span', { 'data-testid': 'voice-count-reply-overdue', class: 'sr-only' }, String(report.totals.replyOverdueN)) }),
      stat({ label: 'Decisions out of order', value: String(report.totals.breachesN), tone: report.totals.breachesN ? 'bad' : '', hint: 'Kept and printed, never repaired', action: h('span', { 'data-testid': 'voice-count-breaches', class: 'sr-only' }, String(report.totals.breachesN)) }),
      stat({ label: 'Decisions', value: String(report.totals.decisionsN), hint: `${report.totals.departedN} departed · ${report.totals.withoutAdviceN} with no advice` }),
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
  if (report.breaches.length) {
    nodes.push(banner({
      tone: 'bad',
      title: `${report.breaches.length} item(s) carry a decision or implementation out of order`,
      body: 'The commands cannot create these. They arrived in the record — imported or hand-edited — and the register keeps them rather than hiding them. Each one prints the exact days by which the act preceded the duty.',
    }));
  }
  nodes.push(banner({
    tone: 'info',
    title: 'Two claims, reported apart',
    body: `${report.balances.statesReconcile ? 'The printed state counts re-add to the items they summarise.' : 'The printed state counts do NOT re-add to the items.'} ${report.figuresComplete ? 'Every figure here is complete.' : 'Some figures are incomplete for the reasons above.'} They are different facts and neither one is folded into the other.`,
  }));
  return h('div', { class: 'stack' }, ...nodes);
}

function boardView(report) {
  const bodyRows = report.bodyRows.length
    ? table({
      caption: 'Consultation bodies',
      columns: [
        { label: 'Body', render: (row) => (report.detailed ? row.body.name : 'withheld at this disclosure level') },
        { label: 'Kind', key: 'kindLabel' },
        { label: 'In term', key: 'membersN' },
        { label: 'Quorum', render: (row) => String(row.body.quorumWhole) },
        { label: 'Term', render: (row) => (row.body.termEndsOn ? (row.termState === 'term-lapsed' ? `ended ${row.body.termEndsOn}` : `to ${row.body.termEndsOn}`) : 'unstasted') },
        { label: 'Items', key: 'itemsN' },
        { label: 'Lapsed', key: 'lapsedN' },
        { label: 'Sittings', key: 'sittingsN' },
        { label: 'Below quorum', key: 'belowQuorumN' },
      ],
      rows: report.bodyRows.map((row) => ({ ...row, kindLabel: row.body.kind })),
      emptyMessage: 'No consultation body is declared. A body is constituted by a written instrument, so none is inferred.',
    })
    : emptyState({ title: 'No consulting body yet', body: 'Declare the body first: its written instrument, its quorum and its term. Nothing is inferred from a change, a checklist tick or a meeting.' });

  return h('div', { class: 'stack' },
    bodyRows,
    report.breaches.length
      ? card({
        title: 'Decisions and implementations out of order',
        subtitle: 'Unreachable through the door, kept when imported, printed permanently.',
        body: h('ul', null, ...report.breaches.slice(0, 20).map((row) => h('li', { class: 'small' },
          `${report.detailed ? row.item.subject : 'an item'} — ${row.state.label} (${row.breaches.map((b) => (b.earlyDays ? `${b.key}: ${b.earlyDays} day(s)` : `${b.key}: ${b.afterDays || 0} day(s)`)).join('; ')})`))),
      })
      : null,
  );
}

function itemsView(ctx, local, report, onDone) {
  const rows = report.rows.map((row) => ({
    ...row,
    subjectLabel: report.detailed ? row.item.subject : 'withheld at this disclosure level',
    bodyLabel: report.detailed ? (row.body?.name || '—') : 'withheld',
    kindLabel: row.item.kind,
    opens: row.item.openedOn,
    closes: row.closesOn || '—',
    adviceLabel: row.response ? `${row.response.advice}${row.adviceLateDays ? ` (${row.adviceLateDays}d late)` : ''}` : (row.item.kind === 'information' ? 'not owed' : 'none'),
    replyLabel: row.response ? (row.response.replyOn || 'owed') : '—',
    decisionLabel: row.decision ? `${row.decision.course} · ${row.decision.decidedOn}` : 'owed',
  }));

  return card({
    title: 'Items put to a body',
    subtitle: 'The period the instrument gave, what came back, whether it was answered, and whether the decision preceded the close.',
    actions: [button('Put an item', () => openItemDialog(ctx, local, onDone), { primary: true })],
    body: rows.length
      ? table({
        caption: 'Consultation items',
        columns: [
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Subject', key: 'subjectLabel' },
          { label: 'Body', key: 'bodyLabel' },
          { label: 'Kind', key: 'kindLabel' },
          { label: 'Put', key: 'opens' },
          { label: 'Window closes', key: 'closes' },
          { label: 'Advice', key: 'adviceLabel' },
          { label: 'Reply', key: 'replyLabel' },
          { label: 'Decision', key: 'decisionLabel' },
          {
            label: 'Act',
            render: (row) => h('div', { class: 'row-actions' },
              (!row.response && row.item.kind !== 'information') ? button('Record advice', () => recordAdviceDialog(ctx, local, row.item.id, onDone)) : null,
              (row.response && !row.response.replyOn) ? button('Answer', () => replyDialog(ctx, local, row.item.id, onDone)) : null,
              !row.decision ? button('Decide', () => decisionDialog(ctx, local, row.item.id, onDone), { primary: false }) : null),
          },
        ],
        rows,
      })
      : emptyState({ title: 'Nothing has been put to a body yet', body: 'An item is a dated human act: the subject, the instrument that sets the period, and the reporting lines whose work changes.' }),
  });
}

function sittingsView(ctx, local, report, onDone) {
  const rows = report.sittingRows.map((row) => ({
    ...row,
    bodyLabel: report.detailed ? (row.body?.name || '—') : 'withheld',
    on: row.sitting.on,
    attendance: `${row.attendanceN} present / quorum ${row.quorum === null ? '—' : row.quorum}`,
    heard: row.sitting.itemIds.length,
    minutes: row.sitting.minutesOn || 'not recorded',
    lateLabel: row.minutesLateDays ? `${row.minutesLateDays} day(s) late` : (row.minutesOverdueDays ? `${row.minutesOverdueDays} day(s) overdue` : '—'),
  }));

  return card({
    title: 'Sittings',
    subtitle: 'Attendance against the body’s own quorum, and the minutes with their reference and their day.',
    actions: [button('Record a sitting', () => holdSittingDialog(ctx, local, onDone), { primary: true })],
    body: rows.length
      ? table({
        caption: 'Consultation sittings',
        columns: [
          { label: 'State', render: (row) => stateBadge(row.state) },
          { label: 'Body', key: 'bodyLabel' },
          { label: 'Sat', key: 'on' },
          { label: 'Attendance', key: 'attendance' },
          { label: 'Items heard', key: 'heard' },
          { label: 'Minutes', key: 'minutes' },
          { label: 'Timing', key: 'lateLabel' },
          { label: 'Act', render: (row) => (!row.sitting.minutesOn ? button('Record minutes', () => recordMinutesDialog(ctx, local, row.sitting.id, onDone)) : null) },
        ],
        rows,
      })
      : emptyState({ title: 'No sitting on the record', body: 'A sitting is dated, attended and minuted. The register compares attendance with the body’s own quorum and prints the finding.' }),
  });
}

function linesView(report) {
  const rows = report.lineRows.map((row) => ({
    ...row,
    nameLabel: report.detailed ? (row.name || row.managerId) : 'withheld at this disclosure level',
    bodiesLabel: report.detailed ? row.bodies.join(', ') : `${row.bodiesN} bod${row.bodiesN === 1 ? 'y' : 'ies'}`,
  }));

  return h('div', { class: 'stack' },
    card({
      title: 'Affected lines',
      subtitle: 'Who owns the work a body is being consulted about. A person is counted once, however many items name them.',
      body: rows.length
        ? table({
          caption: 'Affected reporting lines',
          columns: [
            { label: 'Line holder', key: 'nameLabel' },
            { label: 'Items', key: 'itemsN' },
            { label: 'Awaiting advice', key: 'openN' },
            { label: 'Window lapsed', key: 'lapsedN' },
            { label: 'Decisions', key: 'decidedN' },
            { label: 'Departed', key: 'departedN' },
            { label: 'Out of order', key: 'breachN' },
            { label: 'Bodies', key: 'bodiesLabel' },
          ],
          rows,
        })
        : emptyState({ title: 'No affected line yet', body: 'An item names at least one reporting line. A change nobody owns is a change nobody is accountable for.' }),
    }),
    card({
      title: 'The joint seat for each item',
      subtitle: 'Computed through the one matrix engine. One affected line never decides on the other’s behalf.',
      body: report.rows.length
        ? table({
          caption: 'Joint seats above the affected lines',
          columns: [
            { label: 'Item', render: (row) => (report.detailed ? row.item.subject : 'withheld at this disclosure level') },
            { label: 'Affected lines', render: (row) => row.owners.map((owner) => (report.detailed ? (owner.name || owner.id) : 'withheld')).join(', ') },
            { label: 'Joint seat', render: (row) => (row.apexNames.length ? row.apexNames.join(' · ') : 'no seat above both lines') },
            { label: 'Ambiguity', render: (row) => (row.ambiguousApex ? 'a diamond: more than one joint seat' : 'single seat') },
          ],
          rows: report.rows,
        })
        : emptyState({ title: 'No item to place', body: 'The joint seat is computed per item from the lines it names.' }),
    }),
  );
}

function methodView(report) {
  return h('div', { class: 'stack' },
    card({
      title: 'The frameworks this register applies',
      subtitle: `Engine ${VOI_METHOD.engine} · ${VOI_METHOD.adr}`,
      body: h('ul', null, ...VOI_METHOD.frameworks.map((line) => h('li', { class: 'small' }, line))),
    }),
    card({ title: 'Printed from the record', body: h('ul', null, ...VOI_METHOD.printed.map((line) => h('li', { class: 'small' }, line))) }),
    card({ title: 'Deliberately absent', body: h('ul', null, ...VOI_METHOD.deliberatelyAbsent.map((line) => h('li', { class: 'small' }, line))) }),
    card({
      title: 'Conventions in force',
      body: h('ul', null,
        h('li', { class: 'small' }, `Advice must be answered within ${report.conventions.voiceReplyDays} day(s) of the day it arrived.`),
        h('li', { class: 'small' }, `Minutes are due within ${report.conventions.voiceMinutesDueDays} day(s) of the sitting.`),
        h('li', { class: 'small' }, `The per-state export withholds counts below ${report.conventions.voicePrivacyFloor}.`),
        h('li', { class: 'small' }, 'The consultation period is NOT a convention: it is declared per item from the written instrument, and there is no default and no jurisdiction table anywhere in this register.')),
    }),
    card({
      title: 'Disclosure at this seat',
      subtitle: report.detailed ? 'Names, subjects and written advice are shown.' : 'Counts only at this altitude.',
      body: h('p', { class: 'small muted' }, report.disclosure.reason || 'This seat reads the register in full: subjects, representatives and the body’s own written advice. The narrowing above rank 3 is a rendering contract, not an authentication boundary — this workspace has no authentication and does not claim one.'),
    }),
  );
}

/* ------------------------------------------------------------------ route */

export function renderVoice(ctx) {
  const panel = PANELS.some((row) => row.key === ctx.query?.get?.('panel')) ? ctx.query.get('panel') : 'board';
  let report;
  try {
    const result = ctx.api.voiceReport();
    if (!result?.ok) {
      return h('div', { class: 'stack' },
        pageHeader({ eyebrow: 'People · employee voice', title: 'Employee voice', subtitle: 'What was put to a staff body, what it advised, and whether the decision came first.' }),
        banner({ tone: 'bad', title: 'The register could not be read', body: result?.error || 'The seat could not be resolved.' }));
    }
    report = result.report;
  } catch (error) {
    return h('div', { class: 'stack' },
      pageHeader({ eyebrow: 'People · employee voice', title: 'Employee voice' }),
      banner({ tone: 'bad', title: 'The register could not be read', body: error?.message || 'Unknown error.' }));
  }

  let candidates = { bodies: [], members: [], items: [], sittings: [], people: [], lines: [] };
  try {
    const result = ctx.api.voiceCandidates();
    if (result?.ok) candidates = result;
  } catch { /* an unreadable candidate list narrows the dialogs, never the screen */ }

  const onDone = () => {
    document.dispatchEvent(new CustomEvent('leados:navigate', { detail: { route: VOI_HREF } }));
    ctx.rerender?.();
  };
  const local = { ...candidates, api: ctx.api };

  const exportCsv = () => {
    try {
      const file = exportWorkspaceCsv(ctx.api.getState ? ctx.api.getState() : ctx.state, VOI_CSV_SCOPE);
      if (!file?.ok) { toast(file?.error || 'The export produced no file.', 'bad'); return; }
      downloadText(file.filename, file.csv, 'text/csv');
      toast('Exported. Counts and state keys only: no person, body name, subject, instrument, advice note, reply note or day crosses this boundary.', 'good');
    } catch (error) {
      toast(error?.message || 'The export failed.', 'bad');
    }
  };

  const header = pageHeader({
    eyebrow: 'People · employee voice',
    title: 'Employee voice',
    subtitle: 'What was put to a staff body, the period its own instrument gave it, what it advised in its own words, whether the organisation answered, and whether the decision preceded the close of the window.',
    actions: [
      { label: 'Declare a body', onClick: () => declareBodyDialog(ctx, local, onDone), primary: true },
      { label: 'Add representative', onClick: () => declareMemberDialog(ctx, local, onDone) },
      { label: 'Put an item', onClick: () => openItemDialog(ctx, local, onDone) },
      { label: 'Export (counts)', onClick: exportCsv },
      { label: 'Conventions', onClick: () => conventionsDialog(ctx, report, onDone) },
    ],
    meta: [
      `As at ${report.asOf}`,
      `${report.totals.items} item(s) · ${report.totals.bodies} body(ies)`,
      `${report.totals.sittingsN} sitting(s)`,
      report.detailed ? 'names shown' : 'counts only at this altitude',
    ],
  });

  const body = h('div', { class: 'stack' },
    summaryCard(report),
    claimsBanners(report),
    tabs({
      items: PANELS,
      active: panel,
      onSelect: (key) => { window.location.hash = `${VOI_HREF}?panel=${key}`; },
      ariaLabel: 'Employee voice sections',
    }),
    panel === 'items' ? itemsView(ctx, local, report, onDone)
      : panel === 'sittings' ? sittingsView(ctx, local, report, onDone)
        : panel === 'lines' ? linesView(report)
          : panel === 'method' ? methodView(report)
            : boardView(report),
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
