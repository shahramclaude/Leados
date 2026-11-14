/**
 * app/core/domain/workReassignment.js — pure read model for ADR-0196's
 * Cross-Line Work-Reassignment Consent & Receiving-Capacity Gate.
 *
 * A work-turn finding is evidence of an allocation pattern, not a licence to
 * move work. This module puts a receiving-line answer and a checkable
 * share-day capacity gate between that evidence and completion of the rotation
 * ask. It stores none of the states below: every one is re-derived from the
 * append-only acts, the live matrix, the intake gate and the work-turn reader.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildWorkTurns } from './workTurns.js';
import { lineCapacityUsage, lineCeiling } from './lineIntake.js';
import { compileWorkReassignmentActs, workReassignmentRotationProvenance } from './workReassignmentSchema.js';
import { workTurnAskProvenance } from './workTurnSchema.js';
import {
  WORK_REASSIGNMENT_CSV_COLUMNS,
  WORK_REASSIGNMENT_ENGINE_VERSION,
  WORK_REASSIGNMENT_OPERATION_LABELS,
  WORK_REASSIGNMENT_OPERATION_REASONS,
  WORK_REASSIGNMENT_OPERATION_STATES,
  WORK_REASSIGNMENT_RECORD_STATE_LABELS,
  WORK_REASSIGNMENT_RECORD_STATES,
} from './workReassignmentRegistry.js';

const counts = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const sum = (object) => Object.values(object).reduce((total, value) => total + value, 0);
const pd = (value) => (Number.isInteger(value) ? value / 100 : null);

function seatFor(state, now, matrix) {
  const scope = matrixLineScope(matrix);
  return activeSeat(buildSeats(state, { now, settings: state.settings || {}, lineScope: scope.byManager }));
}

function fullWorkTurnReport(state, now) {
  const settings = { ...(state.settings || {}), activeSeatId: null };
  return buildWorkTurns({ ...state, settings }, { now, settings });
}

function activeLine(matrix, personId, lineId, managerId) {
  return (matrix.nodes.get(personId)?.lines || [])
    .find((line) => line.id === lineId && line.managerId === managerId && line.active !== false) || null;
}

function nameOf(matrix, id) {
  return matrix.nodes.get(id)?.name || id;
}

function activeRotation(state, proposal) {
  const rotationAskId = typeof proposal === 'string' ? proposal : proposal?.rotationAskId;
  const provenance = proposal
    ? workReassignmentRotationProvenance(proposal, state, rotationAskId)
    : workTurnAskProvenance(state, rotationAskId);
  const task = provenance.task || (state.delegations || []).find((row) => row && row.id === rotationAskId) || null;
  return {
    task,
    marker: provenance.marker || null,
    provenance: provenance.provenance,
    isRotationAsk: provenance.ok,
    provenanceReason: provenance.reason || '',
  };
}

/** Source relevance is checked against the CURRENT full work-turn finding. */
function sourceStillMatches({ proposal, rotation, matrix, fullReport }) {
  if (!rotation.isRotationAsk) return { ok: false, reason: 'The linked delegation is not a recorded RULE-NPW-01 rotation ask.' };
  if (rotation.provenance !== 'explicit') return { ok: false, reason: 'Only a live marker that explicitly names RULE-NPW-01 can support a current transfer. Legacy-attested provenance retains completed history only; it does not recreate live source eligibility.' };
  if (!rotation.marker) return { ok: false, reason: 'The completed-marker ledger no longer retains this ask marker. Its historical rule provenance is retained, but a live source finding is not re-created from it.' };
  const finding = fullReport.findings.find((row) => row.subject === rotation.marker.subject) || null;
  if (!finding || !finding.personIds.includes(proposal.sourcePersonId)) {
    return { ok: false, reason: 'The recorded work-turn finding no longer names this source person. The proposal is not re-pointed to a new finding.' };
  }
  const line = activeLine(matrix, proposal.sourcePersonId, proposal.sourceLineId, proposal.sourceManagerId);
  if (!line) return { ok: false, reason: 'The named source line is no longer active for this person and manager. It is not re-pointed.' };
  if (finding.kind === 'pool' && finding.managerId !== proposal.sourceManagerId) {
    return { ok: false, reason: 'This is a pool finding, and the named source line is not the pool manager’s line.' };
  }
  if (finding.kind === 'stack') {
    const person = fullReport.people.find((row) => row.personId === proposal.sourcePersonId) || null;
    const carrying = person?.lines?.some((row) => row.managerId === proposal.sourceManagerId && row.carriedN > 0) || false;
    if (!carrying) return { ok: false, reason: 'This stack finding no longer records non-promotable work on the named source line.' };
  }
  return { ok: true, finding, line };
}

function detailVisible(seat, proposal) {
  if (seat.fullAccess) return true;
  if (seat.id === proposal.sourceManagerId || seat.id === proposal.receivingManagerId) return true;
  const visible = (id) => id === seat.id || Boolean(seat.scope?.has(id)) || Boolean(seat.lineScope?.has(id));
  return visible(proposal.sourcePersonId) && visible(proposal.recipientId);
}

function capacityFor(state, proposal, matrix, now) {
  const ceiling = lineCeiling(state, proposal.recipientId, proposal.receivingManagerId, proposal.periodKey, { now, matrix });
  const usage = lineCapacityUsage(state, proposal.recipientId, proposal.receivingManagerId, proposal.periodKey);
  if (ceiling.state !== 'computed') {
    return {
      state: 'capacity-unprovable',
      ceiling,
      usage,
      headroomH: null,
      reason: ceiling.reason,
    };
  }
  const headroomH = ceiling.ceilingH - usage.consumedH;
  if (usage.consumedH > ceiling.ceilingH) {
    return {
      state: 'capacity-exceeded',
      ceiling,
      usage,
      headroomH,
      reason: `Recorded intakes and accepted transfer reservations total ${(usage.consumedH / 100).toFixed(2)} person-days against a declared ceiling of ${(ceiling.ceilingH / 100).toFixed(2)} for ${proposal.periodKey}.`,
    };
  }
  return {
    state: 'ready',
    ceiling,
    usage,
    headroomH,
    reason: `The declared ceiling is ${(ceiling.ceilingH / 100).toFixed(2)} person-days; recorded intakes and accepted transfer reservations consume ${(usage.consumedH / 100).toFixed(2)}, leaving ${(headroomH / 100).toFixed(2)}.`,
  };
}

function operationFor(state, record, { now, matrix, fullReport }) {
  const proposal = record.proposal;
  const rotation = activeRotation(state, proposal);
  if (record.state === 'declined' || record.state === 'withdrawn') {
    return { key: record.state, rotation, source: null, receivingLine: null, capacity: null, served: false };
  }
  const receivingLine = activeLine(matrix, proposal.recipientId, proposal.receivingLineId, proposal.receivingManagerId);
  const recipientActive = matrix.roster.has(proposal.recipientId);
  const capacity = record.state === 'accepted' ? capacityFor(state, proposal, matrix, now) : null;
  const servedToken = `ADR-0196 transfer ${proposal.transferId}`;
  const served = Boolean(rotation.task?.status === 'done' && String(rotation.task.completionNote || '').includes(servedToken));
  // A bounded work-turn marker can be compacted after the task is done. The
  // proposal's persisted, independently attested rule provenance still lets us
  // show the exact served history; do not require a live finding just to read a
  // closed historical fact.
  if (served && rotation.isRotationAsk) return { key: 'served', rotation, source: null, receivingLine, capacity, served: true };
  const source = sourceStillMatches({ proposal, rotation, matrix, fullReport });
  if (!rotation.task || rotation.task.status !== 'active') return { key: 'rotation-closed', rotation, source, receivingLine, capacity, served: false };
  if (!source.ok) return { key: 'source-stale', rotation, source, receivingLine, capacity, served: false };
  if (!recipientActive) return { key: 'recipient-off-roster', rotation, source, receivingLine, capacity, served: false };
  if (!receivingLine) return { key: 'receiving-stale', rotation, source, receivingLine, capacity, served: false };
  if (record.state === 'awaiting-receiving-line') return { key: 'awaiting-receiving-line', rotation, source, receivingLine, capacity, served: false };
  if (capacity?.state === 'capacity-unprovable') return { key: 'capacity-unprovable', rotation, source, receivingLine, capacity, served: false };
  if (capacity?.state === 'capacity-exceeded') return { key: 'capacity-exceeded', rotation, source, receivingLine, capacity, served: false };
  return { key: 'ready', rotation, source, receivingLine, capacity, served: false };
}

function publicRow(record, operation, matrix) {
  const proposal = record.proposal;
  const answer = record.answer;
  const withdrawal = record.withdrawal;
  const capacity = operation.capacity;
  return {
    transferId: proposal.transferId,
    rotationAskId: proposal.rotationAskId,
    rotationTitle: operation.rotation.task?.title || proposal.rotationAskId,
    rotationDueOn: operation.rotation.task?.dueOn || null,
    workTitle: proposal.workTitle,
    sourcePersonId: proposal.sourcePersonId,
    sourcePersonName: nameOf(matrix, proposal.sourcePersonId),
    sourceManagerId: proposal.sourceManagerId,
    sourceManagerName: nameOf(matrix, proposal.sourceManagerId),
    sourceLineId: proposal.sourceLineId,
    recipientId: proposal.recipientId,
    recipientName: nameOf(matrix, proposal.recipientId),
    receivingManagerId: proposal.receivingManagerId,
    receivingManagerName: nameOf(matrix, proposal.receivingManagerId),
    receivingLineId: proposal.receivingLineId,
    periodKey: proposal.periodKey,
    effortShareDaysH: proposal.effortShareDaysH,
    effortPersonDays: pd(proposal.effortShareDaysH),
    recordState: record.state,
    recordStateLabel: WORK_REASSIGNMENT_RECORD_STATE_LABELS[record.state] || record.state,
    operationState: operation.key,
    operationLabel: WORK_REASSIGNMENT_OPERATION_LABELS[operation.key] || operation.key,
    operationReason: WORK_REASSIGNMENT_OPERATION_REASONS[operation.key] || '',
    proposedOn: proposal.decidedOn,
    proposedVia: proposal.via,
    proposedBySeatId: proposal.decidedBySeatId,
    proposedNote: proposal.note || '',
    acceptedOn: answer?.kind === 'accept' ? answer.decidedOn : null,
    acceptedVia: answer?.kind === 'accept' ? answer.via : null,
    acceptedBySeatId: answer?.kind === 'accept' ? answer.decidedBySeatId : null,
    acceptedNote: answer?.kind === 'accept' ? answer.note || '' : '',
    capacityAtAcceptance: answer?.kind === 'accept' ? {
      ceilingH: answer.capacityCeilingH,
      consumedH: answer.capacityConsumedH,
      projectedH: answer.capacityProjectedH,
    } : null,
    declinedOn: answer?.kind === 'decline' ? answer.decidedOn : null,
    declinedReason: answer?.kind === 'decline' ? answer.reason || '' : '',
    withdrawnOn: withdrawal?.decidedOn || null,
    withdrawnReason: withdrawal?.reason || '',
    capacity: capacity ? {
      state: capacity.state,
      ceilingH: capacity.ceiling?.ceilingH ?? null,
      intakeH: capacity.usage?.intakeH ?? null,
      transferReservationH: capacity.usage?.transferReservationH ?? null,
      consumedH: capacity.usage?.consumedH ?? null,
      headroomH: capacity.headroomH,
      reason: capacity.reason,
    } : null,
    rotationActive: operation.rotation.task?.status === 'active',
    served: operation.served,
  };
}

/**
 * The one report behind the panel, brief, CSV and completion gate. Detailed
 * rows are released only to an involved manager or a seat that reaches BOTH
 * named people. Aggregate counts remain explicit about withheld records.
 */
export function buildWorkReassignments(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const cfg = settings || state.settings || {};
  const view = { ...state, settings: cfg };
  const matrix = buildMatrix(view, { now: at, settings: cfg });
  const seat = seatFor(view, at, matrix);
  const fullReport = fullWorkTurnReport(view, at);
  const compiled = compileWorkReassignmentActs(state.workReassignmentActs);
  const allRows = [];
  for (const record of compiled.values()) {
    if (!record.proposal || !WORK_REASSIGNMENT_RECORD_STATES.includes(record.state)) continue;
    const operation = operationFor(view, record, { now: at, matrix, fullReport });
    allRows.push(publicRow(record, operation, matrix));
  }
  allRows.sort((a, b) => String(b.proposedOn).localeCompare(String(a.proposedOn)) || a.transferId.localeCompare(b.transferId));

  const detailRows = seat.readOnly ? [] : allRows.filter((row) => detailVisible(seat, row));
  const boardRows = seat.fullAccess ? allRows : detailRows;
  const board = {
    transfersN: boardRows.length,
    withheldN: allRows.length - boardRows.length,
    recordStates: counts(WORK_REASSIGNMENT_RECORD_STATES),
    operations: counts(WORK_REASSIGNMENT_OPERATION_STATES),
    reservedEffortH: 0,
    statesReconcile: false,
    operationsReconcile: false,
  };
  for (const row of boardRows) {
    if (Object.hasOwn(board.recordStates, row.recordState)) board.recordStates[row.recordState] += 1;
    if (Object.hasOwn(board.operations, row.operationState)) board.operations[row.operationState] += 1;
    if (row.recordState === 'accepted') board.reservedEffortH += row.effortShareDaysH;
  }
  board.statesReconcile = sum(board.recordStates) === board.transfersN;
  board.operationsReconcile = sum(board.operations) === board.transfersN;

  const floor = Math.max(0, Number(seat.disclosure?.floorN) || 0);
  const spans = new Map();
  for (const row of boardRows) {
    const key = row.receivingManagerId;
    if (!spans.has(key)) spans.set(key, { managerId: key, managerName: row.receivingManagerName, transfersN: 0, readyN: 0, servedN: 0, refusedN: 0 });
    const span = spans.get(key);
    span.transfersN += 1;
    if (row.operationState === 'ready') span.readyN += 1;
    if (row.operationState === 'served') span.servedN += 1;
    if (['capacity-unprovable', 'capacity-exceeded'].includes(row.operationState)) span.refusedN += 1;
  }
  const shownSpans = [];
  let suppressedSpanRowsN = 0;
  for (const span of [...spans.values()].sort((a, b) => a.managerName.localeCompare(b.managerName))) {
    if (seat.fullAccess || span.transfersN >= floor) shownSpans.push(span);
    else suppressedSpanRowsN += 1;
  }

  return {
    engine: WORK_REASSIGNMENT_ENGINE_VERSION,
    generatedAt: at.toISOString(),
    generatedOn: dayKey(at) || at.toISOString().slice(0, 10),
    periodKey: `${at.getUTCFullYear()}-Q${Math.floor(at.getUTCMonth() / 3) + 1}`,
    seat,
    board,
    rows: detailRows.slice(0, 200),
    rowsUnlistedN: Math.max(0, detailRows.length - 200),
    spans: shownSpans,
    disclosure: {
      floor,
      spanRowsReleasedN: shownSpans.length,
      spanRowsSuppressedN: suppressedSpanRowsN,
      detailWithheldN: allRows.length - detailRows.length,
    },
    method: WORK_REASSIGNMENT_OPERATION_STATES.map((key) => ({ key, label: WORK_REASSIGNMENT_OPERATION_LABELS[key], reason: WORK_REASSIGNMENT_OPERATION_REASONS[key] })),
    contract: null,
  };
}

/**
 * The enforcement predicate for `completeDelegation`. A completed rotation ask
 * must name the precise accepted transfer in its completion note, so imported or
 * manually closed tasks never acquire a fictional served state on read.
 */
export function workReassignmentCompletionCheck(state = {}, rotationAskId, { now = new Date(), settings = null } = {}) {
  const report = buildWorkReassignments(state, { now, settings: settings || state.settings || {} });
  const ready = report.rows.find((row) => row.rotationAskId === rotationAskId && row.operationState === 'ready')
    || (() => {
      // A scoped seat may not see the row that makes a task complete. The write
      // boundary must still see the WHOLE record, not treat privacy as absence.
      const at = now instanceof Date ? now : new Date(now || Date.now());
      const cfg = { ...(settings || state.settings || {}), activeSeatId: null };
      const full = buildWorkReassignments({ ...state, settings: cfg }, { now: at, settings: cfg });
      return full.rows.find((row) => row.rotationAskId === rotationAskId && row.operationState === 'ready') || null;
    })();
  if (ready) return { ok: true, transferId: ready.transferId, row: ready };
  const relevant = report.rows.filter((row) => row.rotationAskId === rotationAskId);
  const stateText = relevant.length ? relevant.map((row) => row.operationLabel).join('; ') : 'no receiving-line proposal is recorded';
  return {
    ok: false,
    error: `This RULE-NPW-01 rotation ask cannot be completed as served yet: ${stateText}. Record a dated receiving-line acceptance that still passes the declared share-day capacity gate; no work is reassigned automatically.`,
  };
}

export function workReassignmentBriefText(report) {
  const b = report?.board;
  if (!b) return 'The cross-line work-reassignment gate could not be read.';
  return [
    `Cross-line work-reassignment gate — ${report.generatedOn} (${report.periodKey})`,
    `Transfers read: ${b.transfersN}; awaiting receiving line: ${b.recordStates['awaiting-receiving-line']}; accepted: ${b.recordStates.accepted}; declined: ${b.recordStates.declined}; withdrawn: ${b.recordStates.withdrawn}; lifecycle counts reconcile: ${b.statesReconcile ? 'yes' : 'NO'}.`,
    `Ready: ${b.operations.ready}; served: ${b.operations.served}; capacity unprovable: ${b.operations['capacity-unprovable']}; capacity exceeded: ${b.operations['capacity-exceeded']}; operations reconcile: ${b.operationsReconcile ? 'yes' : 'NO'}.`,
    `Accepted transfer reservations: ${(b.reservedEffortH / 100).toFixed(2)} person-days. ${b.withheldN ? `${b.withheldN} record(s) are outside this seat and counted, not named. ` : ''}No delegation owner was changed automatically.`,
  ].join('\n');
}

/** Aggregate-only CSV: no identities, title, notes, reasons or row-level capacity. */
export function workReassignmentCsvRows(report) {
  const b = report?.board;
  const base = Object.fromEntries(WORK_REASSIGNMENT_CSV_COLUMNS.map((key) => [key, '']));
  if (!b) return [{ ...base, row_type: 'workspace', operations_reconcile: 'false', states_reconcile: 'false' }];
  const workspace = {
    ...base,
    row_type: 'workspace',
    generated_on: report.generatedOn,
    period_key: report.periodKey,
    transfers_n: String(b.transfersN),
    awaiting_n: String(b.recordStates['awaiting-receiving-line']),
    accepted_n: String(b.recordStates.accepted),
    declined_n: String(b.recordStates.declined),
    withdrawn_n: String(b.recordStates.withdrawn),
    ready_n: String(b.operations.ready),
    served_n: String(b.operations.served),
    rotation_closed_n: String(b.operations['rotation-closed']),
    source_stale_n: String(b.operations['source-stale']),
    receiving_stale_n: String(b.operations['receiving-stale']),
    recipient_off_roster_n: String(b.operations['recipient-off-roster']),
    capacity_unprovable_n: String(b.operations['capacity-unprovable']),
    capacity_exceeded_n: String(b.operations['capacity-exceeded']),
    reserved_effort_h: String(b.reservedEffortH),
    span_rows_released_n: String(report.disclosure.spanRowsReleasedN),
    span_rows_suppressed_n: String(report.disclosure.spanRowsSuppressedN),
    states_reconcile: b.statesReconcile ? 'true' : 'false',
    operations_reconcile: b.operationsReconcile ? 'true' : 'false',
  };
  const operationRows = WORK_REASSIGNMENT_OPERATION_STATES.map((key) => ({
    ...base,
    row_type: `operation:${key}`,
    generated_on: report.generatedOn,
    period_key: report.periodKey,
    transfers_n: String(b.operations[key]),
    states_reconcile: 'true',
    operations_reconcile: 'true',
  }));
  return [workspace, ...operationRows];
}
