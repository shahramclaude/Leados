/**
 * app/views/matrixWorkReassignmentPanel.js — `#/matrix?panel=reassignments`.
 *
 * ADR-0196's screen is intentionally a gate, not a drag-and-drop reassignment
 * board. It records what one source line proposes, lets only the receiving line
 * answer, checks declared share-day capacity, and leaves delegation ownership
 * untouched. The panel consumes the same reader as the brief and CSV.
 */

import { h, toast, openModal, closeAllModals, buildForm } from '../ui/dom.js';
import { downloadText } from '../ui/download.js';
import { badge, banner, card, emptyState, stat, table } from '../ui/components.js';
import { serializeCsv } from '../core/csv.js';
import { workReassignmentBriefText, workReassignmentCsvRows } from '../core/domain/workReassignment.js';
import {
  WORK_REASSIGNMENT_ADR,
  WORK_REASSIGNMENT_CSV_COLUMNS,
  WORK_REASSIGNMENT_LIMITS,
  WORK_REASSIGNMENT_METHOD,
  WORK_REASSIGNMENT_OPERATION_REASONS,
  WORK_REASSIGNMENT_OPERATION_TONES,
  WORK_REASSIGNMENT_RECORD_STATE_TONES,
} from '../core/domain/workReassignmentRegistry.js';

const pd = (value) => (Number.isInteger(value) ? (value / 100).toFixed(2) : '—');
const num = (value) => (value === null || value === undefined ? '—' : String(value));
const tone = (value) => (value === 'bad' ? 'bad' : value === 'warn' ? 'warn' : value === 'good' ? 'good' : 'neutral');

function refresh(ctx) {
  if (typeof ctx?.refresh === 'function') ctx.refresh();
  else if (typeof ctx?.rerender === 'function') ctx.rerender();
  else if (typeof ctx?.render === 'function') ctx.render();
}

function notify(ctx, result, success) {
  if (!result?.ok) { toast(result?.error || 'The work-transfer action was refused.', 'bad'); return false; }
  toast(result.warning || success, result.warning ? 'warn' : 'good');
  refresh(ctx);
  return true;
}

function decode(value) {
  try { return JSON.parse(String(value || '')); } catch { return null; }
}

function proposeDialog(ctx) {
  const result = ctx.api?.workReassignmentCandidates?.();
  if (!result?.ok) { toast(result?.error || 'No eligible transfer candidate could be read.', 'bad'); return; }
  const sourceOptions = [];
  for (const ask of result.rotationAsks || []) {
    for (const source of ask.sources || []) {
      sourceOptions.push({
        value: JSON.stringify({ rotationAskId: ask.id, ...source }),
        label: `${ask.title} · move from ${source.sourcePersonName} / ${source.sourceManagerName}`,
      });
    }
  }
  const recipientOptions = [];
  for (const recipient of result.recipients || []) {
    for (const line of recipient.lines || []) {
      recipientOptions.push({
        value: JSON.stringify({ recipientId: recipient.personId, receivingLineId: line.lineId, receivingManagerId: line.managerId }),
        label: `${recipient.personName} → ${line.managerName}`,
      });
    }
  }
  if (!sourceOptions.length || !recipientOptions.length) {
    toast('No source rotation ask or privacy-authorised receiving line is available from this seat. The operator view can scribe a cross-span proposal; a receiving line must still answer for itself.', 'warn');
    return;
  }
  const form = buildForm([
    { name: 'source', type: 'select', label: 'Which current turn finding and source line?', value: sourceOptions[0].value, options: sourceOptions, help: 'Only a source line that owns work in the current RULE-NPW-01 finding is offered. The proposal does not move a delegation yet.' },
    { name: 'recipient', type: 'select', label: 'Who and which receiving line would take it?', value: recipientOptions[0].value, options: recipientOptions, help: 'Only people inside this seat’s authorised span or declared lines are listed. The receiving manager is the only person who can accept or decline.' },
    { name: 'workTitle', label: 'Next non-promotable piece of work', type: 'text', value: '', required: true, help: 'Name the concrete next piece; no work title is inferred from the historical asks that made the turn finding.' },
    { name: 'effortPersonDays', label: 'Declared effort (person-days)', type: 'number', value: '', required: true, help: `Positive, at most two decimals, up to ${(WORK_REASSIGNMENT_LIMITS.maxEffortShareDaysH / 100).toFixed(2)}. The receiving-capacity gate reads this exact value.` },
    { name: 'note', label: 'Source context (optional)', type: 'textarea', rows: 3, value: '', help: 'Visible only inside the seat-scoped record; the aggregate CSV never exports it.' },
  ]);
  openModal({
    title: 'Propose a cross-line work-turn transfer',
    description: 'This asks the receiving line to take a named next piece of non-promotable work. It records no reassignment and reserves no capacity until that manager accepts.',
    size: 'lg',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'work-reassignment-propose',
        onClick: () => {
          const values = form.getValues();
          const source = decode(values.source);
          const recipient = decode(values.recipient);
          if (!source || !recipient) { toast('Choose both a source and a receiving line.', 'bad'); return; }
          const action = ctx.api?.workReassignmentPropose?.({
            ...source,
            ...recipient,
            workTitle: values.workTitle,
            effortPersonDays: values.effortPersonDays,
            note: values.note,
          });
          if (notify(ctx, action, 'Transfer proposed. It awaits the receiving line; no delegation owner changed.')) closeAllModals();
        },
      }, 'Ask the receiving line'),
    ],
  });
}

function acceptDialog(ctx, row) {
  const form = buildForm([{ name: 'note', label: 'Receiving-line note (optional)', type: 'textarea', rows: 3, value: '', help: 'Acceptance freezes the capacity reading that passed today. The live reader will still re-check capacity after later intakes or retunes.' }]);
  openModal({
    title: `Accept ${row.workTitle}`,
    description: `Reserve ${pd(row.effortShareDaysH)} person-days on ${row.receivingManagerName}’s line for ${row.periodKey}. The door refuses if current recorded intake and accepted transfers exceed that line’s declared ceiling.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-testid': `work-reassignment-accept-${row.transferId}`, onClick: () => {
        const action = ctx.api?.workReassignmentAccept?.(row.transferId, { note: form.getValues().note });
        if (notify(ctx, action, 'Receiving line accepted and capacity was reserved. No delegation owner changed.')) closeAllModals();
      } }, 'Accept + reserve capacity'),
    ],
  });
}

function declineDialog(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why can this line not take it?', type: 'textarea', rows: 3, value: '', required: true, help: `Required: at least ${WORK_REASSIGNMENT_LIMITS.reasonMin} characters. A decline remains visible and reserves no capacity.` }]);
  openModal({
    title: `Decline ${row.workTitle}`,
    description: `Only ${row.receivingManagerName}, the manager holding the receiving line, may make this statement.`,
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-danger', type: 'button', 'data-testid': `work-reassignment-decline-${row.transferId}`, onClick: () => {
        const action = ctx.api?.workReassignmentDecline?.(row.transferId, { reason: form.getValues().reason });
        if (notify(ctx, action, 'Receiving-line decline recorded. No capacity was reserved.')) closeAllModals();
      } }, 'Record decline'),
    ],
  });
}

function withdrawDialog(ctx, row) {
  const form = buildForm([{ name: 'reason', label: 'Why is this transfer being withdrawn?', type: 'textarea', rows: 3, value: '', required: true, help: `Required: at least ${WORK_REASSIGNMENT_LIMITS.reasonMin} characters. An accepted transfer releases its capacity reservation only through this dated act.` }]);
  openModal({
    title: `Withdraw ${row.workTitle}`,
    description: 'Either current line holder may withdraw. A historical acceptance remains visible; withdrawal does not change any delegation owner.',
    body: form.node,
    footer: [
      h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => closeAllModals() }, 'Cancel'),
      h('button', { class: 'btn btn-danger', type: 'button', 'data-testid': `work-reassignment-withdraw-${row.transferId}`, onClick: () => {
        const action = ctx.api?.workReassignmentWithdraw?.(row.transferId, { reason: form.getValues().reason });
        if (notify(ctx, action, 'Transfer withdrawn; any receiving capacity reservation was released.')) closeAllModals();
      } }, 'Withdraw transfer'),
    ],
  });
}

function actionCell(ctx, report, row) {
  const seat = report?.seat || {};
  const canAnswer = seat.fullAccess || seat.id === row.receivingManagerId;
  const canWithdraw = seat.fullAccess || seat.id === row.sourceManagerId || seat.id === row.receivingManagerId;
  const canClose = seat.fullAccess || seat.id === row.sourceManagerId;
  const controls = [];
  if (row.operationState === 'awaiting-receiving-line' && canAnswer) {
    controls.push(
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => acceptDialog(ctx, row) }, 'Accept'),
      h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => declineDialog(ctx, row) }, 'Decline'),
    );
  }
  if (row.operationState === 'ready' && canClose) {
    // The source manager owns RULE-NPW-01's rotation ask. A receiving manager
    // can accept the work, but cannot close somebody else's delegation; the
    // seat check remains at `completeDelegation` too. The operator can scribe
    // the close in an undeclared workspace.
    controls.push(h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': `work-reassignment-serve-${row.transferId}`, onClick: () => {
      const action = ctx.api?.completeDelegation?.(row.rotationAskId, {
        completionNote: `The next named non-promotable work transfer was agreed through receiving-line consent and capacity check ${row.transferId}; follow through manually with the receiving line.`,
      });
      notify(ctx, action, 'Rotation ask completed as served. The underlying delegation was not reassigned automatically.');
    } }, 'Close rotation as served'));
  } else if (row.operationState === 'ready' && seat.id === row.receivingManagerId) {
    controls.push(h('span', { class: 'muted small' }, 'Source manager closes the rotation ask'));
  }
  if (['awaiting-receiving-line', 'ready'].includes(row.operationState) && canWithdraw) {
    controls.push(h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => withdrawDialog(ctx, row) }, 'Withdraw'));
  } else if (row.recordState === 'accepted' && canWithdraw) {
    controls.push(h('button', { class: 'btn btn-small btn-ghost', type: 'button', onClick: () => withdrawDialog(ctx, row) }, 'Withdraw'));
  }
  if (!controls.length) {
    if (row.operationState === 'ready' && seat.id === row.receivingManagerId) return h('span', { class: 'muted small' }, 'Source manager closes the rotation ask');
    return h('span', { class: 'muted small' }, 'No action authority at this seat');
  }
  return h('div', { class: 'row gap' }, controls);
}

function boardCard(ctx, report) {
  const b = report.board;
  return card({
    title: 'Receiving-line consent and capacity',
    subtitle: 'A work-turn finding asks who should take the next piece; this gate records whether the receiving line agrees and whether its declared share-days still cover it.',
    actions: [
      h('button', { class: 'btn btn-small btn-primary', type: 'button', 'data-testid': 'work-reassignment-open-propose', onClick: () => proposeDialog(ctx) }, 'Propose transfer'),
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => downloadText({ filename: `leados-work-reassignments-brief-${report.generatedOn}.txt`, text: `${workReassignmentBriefText(report)}\n`, mime: 'text/plain' }) }, 'Download brief'),
      h('button', { class: 'btn btn-small', type: 'button', onClick: () => downloadText({ filename: `leados-work-reassignments-${report.generatedOn}.csv`, text: serializeCsv(WORK_REASSIGNMENT_CSV_COLUMNS.map((key) => ({ key, header: key })), workReassignmentCsvRows(report)), mime: 'text/csv' }) }, 'Export CSV (#147)'),
    ],
    body: h('div', { class: 'stack-sm' },
      h('div', { class: 'grid grid-3' },
        stat({ label: 'Transfers', value: num(b.transfersN), hint: `${b.withheldN} outside this seat` }),
        stat({ label: 'Awaiting receiving line', value: num(b.recordStates['awaiting-receiving-line']), tone: b.recordStates['awaiting-receiving-line'] ? 'warn' : '' }),
        stat({ label: 'Ready to serve', value: num(b.operations.ready), tone: b.operations.ready ? 'good' : '' }),
        stat({ label: 'Capacity cannot be proved', value: num(b.operations['capacity-unprovable']), tone: b.operations['capacity-unprovable'] ? 'bad' : '' }),
        stat({ label: 'Capacity exceeded', value: num(b.operations['capacity-exceeded']), tone: b.operations['capacity-exceeded'] ? 'bad' : '' }),
        stat({ label: 'Accepted reserved effort', value: `${pd(b.reservedEffortH)} days`, hint: `${b.operations.served} served · ${b.recordStates.declined} declined · ${b.recordStates.withdrawn} withdrawn` }),
      ),
      h('pre', { class: 'small', 'data-testid': 'work-reassignment-brief' }, workReassignmentBriefText(report)),
      b.withheldN ? banner({ tone: 'info', title: `${b.withheldN} transfer record(s) are outside this seat`, body: 'They are counted in the aggregate only. The panel does not turn a cross-line transfer into a sideways roster lookup.' }) : null,
    ),
  });
}

function rowsCard(ctx, report) {
  if (!report.rows.length) return emptyState({ title: 'No work-turn transfer has been proposed in this seat.', body: 'A RULE-NPW-01 rotation ask still names a pattern, not a consent. Propose a concrete next piece of work only when there is a source line and a privacy-authorised receiving line to name.' });
  return card({
    title: 'Dated transfer records',
    subtitle: 'The acceptance snapshot says what capacity passed then; the live capacity columns re-check it now. A changing line, intake or retune never rewrites the human answer.',
    body: table({
      caption: 'Cross-line work-turn transfers',
      columns: [
        { label: 'Rotation ask / work', render: (row) => h('div', { class: 'stack-xs' }, h('strong', {}, row.workTitle), h('span', { class: 'small muted' }, row.rotationTitle)) },
        { label: 'From', render: (row) => `${row.sourcePersonName} · ${row.sourceManagerName}` },
        { label: 'To', render: (row) => `${row.recipientName} · ${row.receivingManagerName}` },
        { label: 'Effort', render: (row) => `${pd(row.effortShareDaysH)} days (${row.periodKey})` },
        { label: 'Record', render: (row) => badge(row.recordStateLabel, tone(WORK_REASSIGNMENT_RECORD_STATE_TONES[row.recordState])) },
        { label: 'Live gate', render: (row) => badge(row.operationLabel, tone(WORK_REASSIGNMENT_OPERATION_TONES[row.operationState]), row.operationReason || WORK_REASSIGNMENT_OPERATION_REASONS[row.operationState]) },
        { label: 'Live capacity', render: (row) => row.capacity ? `${pd(row.capacity.consumedH)} / ${pd(row.capacity.ceilingH)} days${row.capacity.headroomH === null ? '' : ` · ${pd(row.capacity.headroomH)} left`}` : 'Not claimed before acceptance' },
        { label: 'Action', render: (row) => actionCell(ctx, report, row) },
      ],
      rows: report.rows,
    }),
  });
}

function spansCard(report) {
  if (!report.spans.length && !report.disclosure.spanRowsSuppressedN) return null;
  return card({
    title: 'Receiving-span counts',
    subtitle: `Counts are named only at this seat’s disclosure floor (${report.disclosure.floor}). A small span is not printed as a zero or a named cell.`,
    body: h('div', { class: 'stack-sm' },
      report.spans.length ? table({
        caption: 'Released receiving-span counts',
        columns: [
          { label: 'Receiving manager', render: (row) => row.managerName },
          { label: 'Transfers', render: (row) => String(row.transfersN) },
          { label: 'Ready', render: (row) => String(row.readyN) },
          { label: 'Served', render: (row) => String(row.servedN) },
          { label: 'Capacity refused', render: (row) => String(row.refusedN) },
        ],
        rows: report.spans,
      }) : null,
      report.disclosure.spanRowsSuppressedN ? h('p', { class: 'muted small' }, `${report.disclosure.spanRowsSuppressedN} receiving span row(s) stayed below the disclosure floor and are counted, not named.`) : null,
    ),
  });
}

export function renderMatrixWorkReassignmentPanel(ctx, { now = new Date() } = {}) {
  const result = ctx.api?.workReassignmentReport?.();
  if (!result?.ok) {
    return card({ title: 'Cross-line work-reassignment gate', body: banner({ tone: 'bad', title: 'Gate refused', body: result?.error || 'The reader could not run.' }) });
  }
  const report = result.report;
  return h('div', { class: 'stack', 'data-testid': 'work-reassignment-panel' },
    h('p', { class: 'lede' }, 'A fair-turn finding does not prove that somebody else can take the work. Name the next non-promotable piece, ask one receiving line, and accept only when that line’s declared share-day ceiling still covers recorded intake and accepted transfer reservations. Silence is not consent. No delegation is reassigned automatically.'),
    boardCard(ctx, report),
    rowsCard(ctx, report),
    spansCard(report),
    card({
      title: `Method and refusal contract (${WORK_REASSIGNMENT_ADR})`,
      body: h('ol', { class: 'stack small' }, ...WORK_REASSIGNMENT_METHOD.map((line) => h('li', {}, line))),
    }),
  );
}

export default renderMatrixWorkReassignmentPanel;
