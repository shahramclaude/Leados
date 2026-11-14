/**
 * app/core/domain/workReassignmentActions.js — reviewed write doors for ADR-0196.
 *
 * The source manager proposes one concrete next piece of non-promotable work.
 * The receiving manager alone accepts or declines it. Acceptance is refused
 * unless the current quarter's declared share-day ceiling covers recorded
 * intakes plus every already accepted transfer reservation. Neither door edits
 * `delegation.personId`: the transfer is a consented capacity reservation, not
 * an automatic reassignment.
 */

import { dayKey } from '../time.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { activeSeat, buildSeats, canAct } from './seat.js';
import { buildWorkTurns } from './workTurns.js';
import { lineCapacityUsage, lineCeiling, quarterWindow } from './lineIntake.js';
import { compileWorkReassignmentActs } from './workReassignmentSchema.js';
import { workTurnAskProvenance } from './workTurnSchema.js';
import { WORK_TURN_RULE_ID } from './workTurnRegistry.js';
import { buildWorkReassignments } from './workReassignment.js';
import {
  WORK_REASSIGNMENT_EVENTS,
  WORK_REASSIGNMENT_LIMITS,
  WORK_REASSIGNMENT_RECORD_STATES,
  WORK_REASSIGNMENT_RIGHTS,
} from './workReassignmentRegistry.js';

const fail = (error, field = 'scope') => ({ ok: false, error, field });
const clean = (value, max) => String(value || '').trim().slice(0, max);

function seatAndMatrix(state, at) {
  const settings = state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings });
  const scope = matrixLineScope(matrix);
  return { matrix, seat: activeSeat(buildSeats(state, { now: at, settings, lineScope: scope.byManager })) };
}

function fullWorkTurns(state, at) {
  const settings = { ...(state.settings || {}), activeSeatId: null };
  return buildWorkTurns({ ...state, settings }, { now: at, settings });
}

function activeLine(matrix, personId, lineId, managerId) {
  return (matrix.nodes.get(personId)?.lines || [])
    .find((line) => line.id === lineId && line.managerId === managerId && line.active !== false) || null;
}

function rotationContext(state, rotationAskId, at, matrix = null, { requireExplicit = false } = {}) {
  const graph = matrix || buildMatrix(state, { now: at, settings: state.settings || {} });
  const provenance = workTurnAskProvenance(state, rotationAskId);
  const task = provenance.task || (state.delegations || []).find((row) => row?.id === rotationAskId) || null;
  if (!task || !provenance.ok || !provenance.marker) {
    return {
      ok: false,
      error: 'Choose an active RULE-NPW-01 rotation ask with its rule marker, rule-authored support and typed obligation link. A normal delegation or loose marker is not silently turned into a cross-line transfer.',
      field: 'rotationAskId',
    };
  }
  if (requireExplicit && provenance.provenance !== 'explicit') {
    return {
      ok: false,
      error: 'A new work-reassignment proposal or acceptance requires a live marker that explicitly names RULE-NPW-01, alongside the rule-authored support and typed obligation link. A legacy-attested marker can retain an already completed historical transfer only; it cannot open current consent.',
      field: 'rotationAskId',
    };
  }
  if (task.status !== 'active') return { ok: false, error: 'That rotation ask is no longer active. It cannot receive a new transfer proposal.', field: 'rotationAskId' };
  const report = fullWorkTurns(state, at);
  const finding = report.findings.find((row) => row.subject === provenance.marker.subject) || null;
  if (!finding) return { ok: false, error: 'The work-turn finding that opened this ask no longer reads on the current record. The ask should close as cleared, not gain a new transfer proposal.', field: 'rotationAskId' };
  return { ok: true, task, marker: provenance.marker, provenance: provenance.provenance, finding, report, matrix: graph };
}

function sourceIsRelevant(context, sourcePersonId, sourceLineId, sourceManagerId) {
  const { finding, report, matrix } = context;
  if (!finding.personIds.includes(sourcePersonId)) {
    return fail('Choose a person named by this current work-turn finding. A transfer cannot be pointed at a nearby person by guesswork.', 'sourcePersonId');
  }
  const line = activeLine(matrix, sourcePersonId, sourceLineId, sourceManagerId);
  if (!line) return fail('Choose a live source line held by the manager named. A stale line is not re-pointed.', 'sourceLineId');
  if (finding.kind === 'pool' && finding.managerId !== sourceManagerId) {
    return fail('This pool finding can move work only from the manager whose pool it is. Choose that source line.', 'sourceLineId');
  }
  if (finding.kind === 'stack') {
    const person = report.people.find((row) => row.personId === sourcePersonId) || null;
    if (!person?.lines?.some((row) => row.managerId === sourceManagerId && row.carriedN > 0)) {
      return fail('This stack finding has no recorded non-promotable work on that source line. The source is refused rather than inferred.', 'sourceLineId');
    }
  }
  return { ok: true, line };
}

function visibleTo(seat, personId) {
  return seat.fullAccess || personId === seat.id || Boolean(seat.scope?.has(personId)) || Boolean(seat.lineScope?.has(personId));
}

function party(seat, expectedId, noun) {
  if (seat.fullAccess) return { ok: true, via: 'operator', decidedBySeatId: null };
  if (seat.id !== expectedId) return fail(`Only the manager holding the ${noun} line can make this statement. Recording it from another seat would fabricate consent.`, 'scope');
  return { ok: true, via: 'seat', decidedBySeatId: seat.id };
}

function effortInHundredths(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const scaled = number * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-8) return null;
  return rounded;
}

function saved(store, extra = {}) {
  return {
    ok: true,
    ...extra,
    saved: store.isEncrypted ? null : !store.persistError,
    warning: store.persistError || null,
    propagations: store.lastPropagations || [],
  };
}

export function createWorkReassignmentActions(store, { now = () => new Date(), idFactory = null } = {}) {
  const clock = () => { const value = now(); return value instanceof Date ? value : new Date(value || Date.now()); };
  const newId = (prefix) => (idFactory ? idFactory(prefix) : `${prefix}-${Math.random().toString(36).slice(2, 10)}`);
  const context = () => {
    const at = clock();
    const today = dayKey(at) || at.toISOString().slice(0, 10);
    const { matrix, seat } = seatAndMatrix(store.state, at);
    return { at, today, matrix, seat };
  };
  const standing = (seat, right) => {
    const verdict = canAct(right, seat);
    if (seat.readOnly || (!seat.fullAccess && !verdict.allow)) return fail(verdict.reason || 'The operating seat cannot make this work-reassignment statement.');
    return null;
  };

  return {
    workReassignmentReport() {
      const report = buildWorkReassignments(store.state, { now: clock() });
      return report.seat.readOnly
        ? fail('The operating seat is unresolved; the work-reassignment gate cannot be read.')
        : { ok: true, report };
    },

    /** Candidate list is privacy-scoped before names reach the panel. */
    workReassignmentCandidates() {
      const { at, matrix, seat } = context();
      const blocked = standing(seat, WORK_REASSIGNMENT_RIGHTS.PROPOSE);
      if (blocked) return blocked;
      const report = fullWorkTurns(store.state, at);
      const rotationAsks = [];
      for (const marker of stateMarkers(store.state)) {
        const task = (store.state.delegations || []).find((row) => row?.id === marker.taskId && row.status === 'active') || null;
        const finding = report.findings.find((row) => row.subject === marker.subject) || null;
        if (!task || !finding) continue;
        const sources = [];
        for (const sourcePersonId of finding.personIds) {
          const node = matrix.nodes.get(sourcePersonId);
          for (const line of node?.lines || []) {
            if (line.active === false) continue;
            if (finding.kind === 'pool' && line.managerId !== finding.managerId) continue;
            if (finding.kind === 'stack') {
              const person = report.people.find((row) => row.personId === sourcePersonId) || null;
              if (!person?.lines?.some((row) => row.managerId === line.managerId && row.carriedN > 0)) continue;
            }
            if (!seat.fullAccess && seat.id !== line.managerId) continue;
            sources.push({
              sourcePersonId,
              sourcePersonName: node?.name || sourcePersonId,
              sourceLineId: line.id,
              sourceManagerId: line.managerId,
              sourceManagerName: matrix.nodes.get(line.managerId)?.name || line.managerId,
            });
          }
        }
        if (sources.length) {
          rotationAsks.push({ id: task.id, title: task.title, dueOn: task.dueOn || null, sources });
        }
      }
      const recipients = [];
      for (const [personId, node] of matrix.nodes.entries()) {
        if (!matrix.roster.has(personId) || !visibleTo(seat, personId)) continue;
        const lines = (node.lines || []).filter((line) => line.active !== false)
          .map((line) => ({ lineId: line.id, managerId: line.managerId, managerName: matrix.nodes.get(line.managerId)?.name || line.managerId }));
        if (lines.length) recipients.push({ personId, personName: node.name || personId, lines });
      }
      recipients.sort((a, b) => a.personName.localeCompare(b.personName));
      return { ok: true, rotationAsks, recipients };
    },

    workReassignmentPropose(input = {}) {
      const { at, today, matrix, seat } = context();
      const blocked = standing(seat, WORK_REASSIGNMENT_RIGHTS.PROPOSE);
      if (blocked) return blocked;
      const rotationAskId = clean(input.rotationAskId, WORK_REASSIGNMENT_LIMITS.idMax);
      const sourcePersonId = clean(input.sourcePersonId, WORK_REASSIGNMENT_LIMITS.idMax);
      const sourceLineId = clean(input.sourceLineId, 2 * WORK_REASSIGNMENT_LIMITS.idMax);
      const sourceManagerId = clean(input.sourceManagerId, WORK_REASSIGNMENT_LIMITS.idMax);
      const recipientId = clean(input.recipientId, WORK_REASSIGNMENT_LIMITS.idMax);
      const receivingLineId = clean(input.receivingLineId, 2 * WORK_REASSIGNMENT_LIMITS.idMax);
      const receivingManagerId = clean(input.receivingManagerId, WORK_REASSIGNMENT_LIMITS.idMax);
      const workTitle = clean(input.workTitle, WORK_REASSIGNMENT_LIMITS.titleChars);
      const effortShareDaysH = effortInHundredths(input.effortPersonDays);
      const note = clean(input.note, WORK_REASSIGNMENT_LIMITS.noteChars);
      if (!rotationAskId) return fail('Choose the active work-turn rotation ask this transfer would serve.', 'rotationAskId');
      const rotation = rotationContext(store.state, rotationAskId, at, matrix, { requireExplicit: true });
      if (!rotation.ok) return rotation;
      const source = sourceIsRelevant(rotation, sourcePersonId, sourceLineId, sourceManagerId);
      if (!source.ok) return source;
      const sourceParty = party(seat, sourceManagerId, 'source');
      if (!sourceParty.ok) return sourceParty;
      if (!recipientId || !matrix.roster.has(recipientId) || recipientId === sourcePersonId) {
        return fail('Choose a different receiving person on the active roster.', 'recipientId');
      }
      if (!seat.fullAccess && !visibleTo(seat, recipientId)) {
        return fail('The receiving person is outside this seat’s declared span and lines. The source manager cannot probe a sideways roster through this form.', 'recipientId');
      }
      const receivingLine = activeLine(matrix, recipientId, receivingLineId, receivingManagerId);
      if (!receivingLine || receivingManagerId === sourceManagerId) {
        return fail('Choose a live receiving line held by a different manager. Same-line rotation has no cross-line consent gate.', 'receivingLineId');
      }
      if (!workTitle || workTitle.length < 3) return fail('Name the next piece of non-promotable work in at least three characters. A blank label cannot be accepted as a capacity claim.', 'workTitle');
      if (!Number.isInteger(effortShareDaysH) || effortShareDaysH < 1 || effortShareDaysH > WORK_REASSIGNMENT_LIMITS.maxEffortShareDaysH) {
        return fail(`Declare effort as a positive number with at most two decimals, up to ${(WORK_REASSIGNMENT_LIMITS.maxEffortShareDaysH / 100).toFixed(2)} person-days.`, 'effortPersonDays');
      }
      const window = quarterWindow(today);
      if (!window) return fail('Today is not a readable calendar day, so the receiving-capacity period cannot be named.', 'scope');
      const compiled = compileWorkReassignmentActs(store.state.workReassignmentActs);
      const duplicate = [...compiled.values()].some((record) => record.proposal
        && ['awaiting-receiving-line', 'accepted'].includes(record.state)
        && record.proposal.rotationAskId === rotationAskId
        && record.proposal.sourcePersonId === sourcePersonId
        && record.proposal.recipientId === recipientId
        && record.proposal.receivingLineId === receivingLineId);
      if (duplicate) return fail('This active source-to-receiving-line transfer is already on the record. Accept, decline or withdraw that proposal instead of making a second reservation.', 'rotationAskId');
      if ((store.state.workReassignmentActs || []).length >= WORK_REASSIGNMENT_LIMITS.acts) {
        return fail(`The work-reassignment ledger holds ${WORK_REASSIGNMENT_LIMITS.acts} acts and is full. Export it before recording more.`);
      }
      const transferId = newId('wrt');
      const act = {
        id: newId('wra'), kind: 'propose', transferId, rotationAskId,
        // Persist the rule evidence used at this door so a completed transfer
        // can retain its historical provenance after a bounded old marker is
        // compacted. The loader re-proves the task/link pair before retaining it.
        rotationRuleId: WORK_TURN_RULE_ID, rotationProvenance: rotation.provenance,
        sourcePersonId, sourceLineId, sourceManagerId,
        recipientId, receivingLineId, receivingManagerId,
        periodKey: window.periodKey, workTitle, effortShareDaysH,
        via: sourceParty.via, decidedBySeatId: sourceParty.decidedBySeatId,
        decidedOn: today, at: at.toISOString(), note,
        reason: '', capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
      };
      store.update((draft) => {
        draft.workReassignmentActs = Array.isArray(draft.workReassignmentActs) ? draft.workReassignmentActs : [];
        draft.workReassignmentActs.push(act);
      }, {
        type: WORK_REASSIGNMENT_EVENTS.PROPOSED,
        entity: 'workReassignment', entityId: transferId,
        summary: `Proposed a cross-line work-turn transfer for ${window.periodKey}: ${(effortShareDaysH / 100).toFixed(2)} person-days. The receiving line has not consented and no delegation owner changed.`.slice(0, 300),
      });
      return saved(store, { id: transferId, actId: act.id, periodKey: window.periodKey, effortShareDaysH });
    },

    workReassignmentAccept(transferId, input = {}) {
      const { at, today, matrix, seat } = context();
      const blocked = standing(seat, WORK_REASSIGNMENT_RIGHTS.ANSWER);
      if (blocked) return blocked;
      const record = compileWorkReassignmentActs(store.state.workReassignmentActs).get(clean(transferId, WORK_REASSIGNMENT_LIMITS.idMax)) || null;
      if (!record?.proposal) return fail('That work-transfer proposal is not on the record.', 'transferId');
      if (record.state !== 'awaiting-receiving-line') return fail(`This transfer is already ${record.state}. A second receiving-line answer would record nothing.`, 'transferId');
      const proposal = record.proposal;
      const side = party(seat, proposal.receivingManagerId, 'receiving');
      if (!side.ok) return side;
      const rotation = rotationContext(store.state, proposal.rotationAskId, at, matrix, { requireExplicit: true });
      if (!rotation.ok) return rotation;
      const source = sourceIsRelevant(rotation, proposal.sourcePersonId, proposal.sourceLineId, proposal.sourceManagerId);
      if (!source.ok) return source;
      if (!matrix.roster.has(proposal.recipientId)) return fail('The receiving person is no longer on the active roster. Nobody is substituted.', 'transferId');
      if (!activeLine(matrix, proposal.recipientId, proposal.receivingLineId, proposal.receivingManagerId)) {
        return fail('The receiving line no longer holds this person. An earlier proposal is not re-pointed to a different line or manager.', 'transferId');
      }
      const currentWindow = quarterWindow(today);
      if (!currentWindow || proposal.periodKey !== currentWindow.periodKey) {
        return fail(`This proposal names ${proposal.periodKey}; a receiving-capacity acceptance is made only in its current quarter (${currentWindow?.periodKey || 'unreadable'}). Withdraw it and propose a current transfer rather than accepting a stale capacity check.`, 'transferId');
      }
      const ceiling = lineCeiling(store.state, proposal.recipientId, proposal.receivingManagerId, proposal.periodKey, { now: at, matrix });
      if (ceiling.state !== 'computed') return fail(`The receiving line’s capacity cannot be proved: ${ceiling.reason}`, 'transferId');
      const usage = lineCapacityUsage(store.state, proposal.recipientId, proposal.receivingManagerId, proposal.periodKey);
      const projectedH = usage.consumedH + proposal.effortShareDaysH;
      if (projectedH > ceiling.ceilingH) {
        return fail(`Refused: accepting ${(proposal.effortShareDaysH / 100).toFixed(2)} person-days would take the receiving line to ${(projectedH / 100).toFixed(2)} against its declared ${(ceiling.ceilingH / 100).toFixed(2)} person-day ceiling for ${proposal.periodKey}. Recorded intakes and already accepted transfers consume ${(usage.consumedH / 100).toFixed(2)}.`, 'transferId');
      }
      if ((store.state.workReassignmentActs || []).length >= WORK_REASSIGNMENT_LIMITS.acts) return fail('The work-reassignment ledger is full. Export it before recording more.');
      const note = clean(input.note, WORK_REASSIGNMENT_LIMITS.noteChars);
      const act = {
        id: newId('wra'), kind: 'accept', transferId: proposal.transferId,
        via: side.via, decidedBySeatId: side.decidedBySeatId,
        decidedOn: today, at: at.toISOString(), note, reason: '',
        capacityCeilingH: ceiling.ceilingH,
        capacityConsumedH: usage.consumedH,
        capacityProjectedH: projectedH,
      };
      store.update((draft) => {
        draft.workReassignmentActs = Array.isArray(draft.workReassignmentActs) ? draft.workReassignmentActs : [];
        draft.workReassignmentActs.push(act);
      }, {
        type: WORK_REASSIGNMENT_EVENTS.ACCEPTED,
        entity: 'workReassignment', entityId: proposal.transferId,
        summary: `Receiving line accepted ${(proposal.effortShareDaysH / 100).toFixed(2)} person-days for ${proposal.periodKey}; capacity was ${usage.consumedH}/${ceiling.ceilingH} hundredths before this reservation. No delegation owner changed.`.slice(0, 300),
      });
      return saved(store, { id: proposal.transferId, actId: act.id, capacityCeilingH: ceiling.ceilingH, capacityProjectedH: projectedH });
    },

    workReassignmentDecline(transferId, input = {}) {
      const { at, today, matrix, seat } = context();
      const blocked = standing(seat, WORK_REASSIGNMENT_RIGHTS.ANSWER);
      if (blocked) return blocked;
      const record = compileWorkReassignmentActs(store.state.workReassignmentActs).get(clean(transferId, WORK_REASSIGNMENT_LIMITS.idMax)) || null;
      if (!record?.proposal) return fail('That work-transfer proposal is not on the record.', 'transferId');
      if (record.state !== 'awaiting-receiving-line') return fail(`This transfer is already ${record.state}; it cannot receive a second decline.`, 'transferId');
      const proposal = record.proposal;
      const side = party(seat, proposal.receivingManagerId, 'receiving');
      if (!side.ok) return side;
      if (!activeLine(matrix, proposal.recipientId, proposal.receivingLineId, proposal.receivingManagerId)) {
        return fail('The receiving line no longer holds this person. A different holder cannot decline on the earlier manager’s behalf.', 'transferId');
      }
      const reason = clean(input.reason, WORK_REASSIGNMENT_LIMITS.reasonChars);
      if (reason.length < WORK_REASSIGNMENT_LIMITS.reasonMin) return fail(`Give the receiving line’s reason in at least ${WORK_REASSIGNMENT_LIMITS.reasonMin} characters. A bare decline reserves no capacity but would be indistinguishable from a typo.`, 'reason');
      const act = {
        id: newId('wra'), kind: 'decline', transferId: proposal.transferId,
        via: side.via, decidedBySeatId: side.decidedBySeatId,
        decidedOn: today, at: at.toISOString(), note: '', reason,
        capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
      };
      store.update((draft) => {
        draft.workReassignmentActs = Array.isArray(draft.workReassignmentActs) ? draft.workReassignmentActs : [];
        draft.workReassignmentActs.push(act);
      }, {
        type: WORK_REASSIGNMENT_EVENTS.DECLINED,
        entity: 'workReassignment', entityId: proposal.transferId,
        summary: 'Receiving line declined a cross-line work-turn transfer; no capacity was reserved and no delegation owner changed.'.slice(0, 300),
      });
      return saved(store, { id: proposal.transferId, actId: act.id });
    },

    workReassignmentWithdraw(transferId, input = {}) {
      const { at, today, matrix, seat } = context();
      const blocked = standing(seat, WORK_REASSIGNMENT_RIGHTS.WITHDRAW);
      if (blocked) return blocked;
      const record = compileWorkReassignmentActs(store.state.workReassignmentActs).get(clean(transferId, WORK_REASSIGNMENT_LIMITS.idMax)) || null;
      if (!record?.proposal) return fail('That work-transfer proposal is not on the record.', 'transferId');
      if (!['awaiting-receiving-line', 'accepted'].includes(record.state)) return fail(`This transfer is already ${record.state}; it cannot be withdrawn again.`, 'transferId');
      const proposal = record.proposal;
      const servedToken = `ADR-0196 transfer ${proposal.transferId}`;
      const linkedAsk = (store.state.delegations || []).find((row) => row?.id === proposal.rotationAskId) || null;
      if (linkedAsk?.status === 'done' && String(linkedAsk.completionNote || '').includes(servedToken)) {
        return fail('This transfer already served its RULE-NPW-01 rotation ask. Its dated consent and capacity evidence cannot be withdrawn after completion; record a new work item if the later situation differs.', 'transferId');
      }
      let side = null;
      if (seat.fullAccess) side = { ok: true, via: 'operator', decidedBySeatId: null };
      else if (seat.id === proposal.sourceManagerId && activeLine(matrix, proposal.sourcePersonId, proposal.sourceLineId, proposal.sourceManagerId)) {
        side = { ok: true, via: 'seat', decidedBySeatId: seat.id };
      } else if (seat.id === proposal.receivingManagerId && activeLine(matrix, proposal.recipientId, proposal.receivingLineId, proposal.receivingManagerId)) {
        side = { ok: true, via: 'seat', decidedBySeatId: seat.id };
      } else {
        return fail('Only a current holder of the source or receiving line may withdraw this transfer. A moved line is not re-pointed to a new holder.', 'transferId');
      }
      const reason = clean(input.reason, WORK_REASSIGNMENT_LIMITS.reasonChars);
      if (reason.length < WORK_REASSIGNMENT_LIMITS.reasonMin) return fail(`Give a withdrawal reason in at least ${WORK_REASSIGNMENT_LIMITS.reasonMin} characters. The accepted reservation is released only by an explicit human act.`, 'reason');
      const act = {
        id: newId('wra'), kind: 'withdraw', transferId: proposal.transferId,
        via: side.via, decidedBySeatId: side.decidedBySeatId,
        decidedOn: today, at: at.toISOString(), note: '', reason,
        capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
      };
      store.update((draft) => {
        draft.workReassignmentActs = Array.isArray(draft.workReassignmentActs) ? draft.workReassignmentActs : [];
        draft.workReassignmentActs.push(act);
      }, {
        type: WORK_REASSIGNMENT_EVENTS.WITHDRAWN,
        entity: 'workReassignment', entityId: proposal.transferId,
        summary: 'Withdrew a cross-line work-turn transfer; any receiving-capacity reservation is released and no delegation owner changed.'.slice(0, 300),
      });
      return saved(store, { id: proposal.transferId, actId: act.id, releasedReservation: record.state === 'accepted' });
    },
  };
}

function stateMarkers(state) {
  return (Array.isArray(state.workTurnMarkers) ? state.workTurnMarkers : [])
    .filter((row) => {
      const provenance = workTurnAskProvenance(state, row?.taskId);
      // ADR-0196 creates new consent only from a live marker that explicitly
      // identifies RULE-NPW-01. A pre-field marker may retain independently
      // attested completed history, but it is never offered as a new candidate.
      return row?.kind === 'ask' && row.taskId && row.subject
        && provenance.ok && provenance.provenance === 'explicit';
    });
}
