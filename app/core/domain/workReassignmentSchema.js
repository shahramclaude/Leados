/**
 * app/core/domain/workReassignmentSchema.js — fail-closed storage contract for
 * ADR-0196's work-reassignment consent and receiving-capacity gate.
 *
 * The collection holds human ACTS, never a stored readiness, capacity verdict,
 * completed flag or reassigned owner. A malformed or out-of-sequence act is
 * dropped with a warning rather than repaired into receiving-line consent.
 */

import {
  WORK_REASSIGNMENT_ACT_KINDS,
  WORK_REASSIGNMENT_LIMITS,
  WORK_REASSIGNMENT_RECORD_STATES,
  WORK_REASSIGNMENT_VIAS,
} from './workReassignmentRegistry.js';
import { workTurnAskProvenance, workTurnRuleTaskEvidence } from './workTurnSchema.js';
import { WORK_TURN_RULE_ID } from './workTurnRegistry.js';

const isPlainObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value) => (typeof value === 'string' ? value.trim() : '');
const day = (value) => {
  const v = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return new Date(`${v}T00:00:00.000Z`).toISOString().slice(0, 10) === v ? v : null;
};
const iso = (value) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};
const bounded = (value, max) => text(value).slice(0, max);
const period = (value) => (/^\d{4}-Q[1-4]$/.test(text(value)) ? text(value) : null);

function emptyCompiled() {
  return {
    proposal: null,
    answer: null,
    withdrawal: null,
    state: null,
    acts: [],
    invalidN: 0,
  };
}

/**
 * Compile a normalized act list. The normalizer already refuses invalid
 * sequences; this function remains defensive because readers can be called
 * directly on a hand-built in-memory state during tests.
 */
export function compileWorkReassignmentActs(acts) {
  const records = new Map();
  (Array.isArray(acts) ? acts : []).forEach((act, index) => {
    if (!act || !act.transferId || !WORK_REASSIGNMENT_ACT_KINDS.includes(act.kind)) return;
    const record = records.get(act.transferId) || emptyCompiled();
    const last = record.acts.at(-1) || null;
    if (last && String(act.at || '') < String(last.at || '')) {
      record.invalidN += 1;
      records.set(act.transferId, record);
      return;
    }
    if (act.kind === 'propose') {
      if (record.proposal) { record.invalidN += 1; records.set(act.transferId, record); return; }
      record.proposal = act;
      record.state = 'awaiting-receiving-line';
      record.acts.push({ ...act, _index: index });
      records.set(act.transferId, record);
      return;
    }
    if (!record.proposal) { record.invalidN += 1; records.set(act.transferId, record); return; }
    if (record.state === 'awaiting-receiving-line' && (act.kind === 'accept' || act.kind === 'decline')) {
      record.answer = act;
      record.state = act.kind === 'accept' ? 'accepted' : 'declined';
      record.acts.push({ ...act, _index: index });
      records.set(act.transferId, record);
      return;
    }
    if ((record.state === 'awaiting-receiving-line' || record.state === 'accepted') && act.kind === 'withdraw') {
      record.withdrawal = act;
      record.state = 'withdrawn';
      record.acts.push({ ...act, _index: index });
      records.set(act.transferId, record);
      return;
    }
    record.invalidN += 1;
    records.set(act.transferId, record);
  });
  for (const record of records.values()) {
    if (!WORK_REASSIGNMENT_RECORD_STATES.includes(record.state)) record.state = null;
  }
  return records;
}

/**
 * Accepted acts are a capacity reservation until a later withdrawal. This leaf
 * helper is intentionally usable by `lineIntake.js` without importing the
 * reassignment reader (which itself reads the intake gate).
 */
export function activeWorkReassignmentReservations(acts, {
  personId = null,
  managerId = null,
  periodKey = null,
} = {}) {
  const out = [];
  for (const [transferId, record] of compileWorkReassignmentActs(acts)) {
    const proposal = record.proposal;
    if (!proposal || record.state !== 'accepted') continue;
    if (personId && proposal.recipientId !== personId) continue;
    if (managerId && proposal.receivingManagerId !== managerId) continue;
    if (periodKey && proposal.periodKey !== periodKey) continue;
    out.push({
      transferId,
      rotationAskId: proposal.rotationAskId,
      personId: proposal.recipientId,
      managerId: proposal.receivingManagerId,
      lineId: proposal.receivingLineId,
      periodKey: proposal.periodKey,
      effortShareDaysH: proposal.effortShareDaysH,
      acceptedOn: record.answer?.decidedOn || null,
    });
  }
  return out;
}

/**
 * Retain every act of a live transfer (awaiting or accepted), and remove whole
 * oldest terminal histories before removing a single act. An over-cap live
 * ledger stays over cap rather than silently deleting an active consent.
 */
export function compactWorkReassignmentActs(acts, cap = WORK_REASSIGNMENT_LIMITS.acts) {
  const list = Array.isArray(acts) ? acts : [];
  if (list.length <= cap) return list;
  const compiled = compileWorkReassignmentActs(list);
  const groups = new Map();
  list.forEach((act, index) => {
    if (!act?.transferId) return;
    if (!groups.has(act.transferId)) groups.set(act.transferId, []);
    groups.get(act.transferId).push(index);
  });
  const removable = [...groups.entries()]
    .filter(([transferId]) => ['declined', 'withdrawn'].includes(compiled.get(transferId)?.state))
    .sort(([, a], [, b]) => a[0] - b[0]);
  let excess = list.length - cap;
  const drop = new Set();
  for (const [, indexes] of removable) {
    if (excess <= 0) break;
    for (const index of indexes) drop.add(index);
    excess -= indexes.length;
  }
  return drop.size ? list.filter((_, index) => !drop.has(index)) : list;
}

/**
 * Re-prove the rule provenance recorded by a proposal. A live marker provides
 * the strongest proof. Once a bounded completed-marker ledger has legitimately
 * evicted that marker, a completed accepted transfer that already persisted the
 * explicit rule id may survive only with the task's independent rule support +
 * typed obligation link. This is a historical retention path, never permission
 * to create a new transfer from an ordinary or legacy-marker delegation.
 */
export function workReassignmentRotationProvenance(value = {}, state = {}, rotationAskId = value?.rotationAskId) {
  const markerProof = workTurnAskProvenance(state, rotationAskId);
  if (markerProof.ok) return markerProof;
  const storedRuleId = text(value.rotationRuleId);
  const storedProvenance = text(value.rotationProvenance);
  const durableTaskProof = workTurnRuleTaskEvidence(state, rotationAskId);
  if (storedRuleId === WORK_TURN_RULE_ID
    && ['explicit', 'legacy-attested', 'retained-attested'].includes(storedProvenance)
    && durableTaskProof.ok) {
    return {
      ok: true,
      provenance: 'retained-attested',
      marker: null,
      task: durableTaskProof.task,
    };
  }
  return markerProof;
}

/**
 * Normalize every act and validate its lifecycle. `state.delegations` and its
 * typed links have already normalized when this runs, so a proposal cannot turn
 * a normal delegation or a loose marker into receiving-line consent. Live
 * graph/seat authority checks belong to the action boundary; the loader never
 * invents a current holder or re-points a historical line.
 */
export function normalizeWorkReassignmentActs(raw, state = {}, warnings = []) {
  const source = Array.isArray(raw) ? raw : [];
  const delegationIds = new Set((state.delegations || []).filter(Boolean).map((row) => row.id));
  const ids = new Set();
  const records = new Map();
  const out = [];
  let malformed = 0;
  let orphaned = 0;
  let outOfSequence = 0;

  for (const value of source) {
    if (!isPlainObject(value)) { malformed += 1; continue; }
    const id = bounded(value.id, WORK_REASSIGNMENT_LIMITS.idMax);
    const kind = text(value.kind);
    const transferId = bounded(value.transferId, WORK_REASSIGNMENT_LIMITS.idMax);
    const via = text(value.via);
    const decidedBySeatId = bounded(value.decidedBySeatId, WORK_REASSIGNMENT_LIMITS.idMax) || null;
    const decidedOn = day(value.decidedOn);
    const at = iso(value.at);
    if (!id || ids.has(id) || !transferId || !WORK_REASSIGNMENT_ACT_KINDS.includes(kind)
      || !WORK_REASSIGNMENT_VIAS.includes(via) || !decidedOn || !at
      || (via === 'seat' && !decidedBySeatId) || (via === 'operator' && decidedBySeatId !== null)) {
      malformed += 1;
      continue;
    }
    const prior = records.get(transferId) || emptyCompiled();
    const priorAt = prior.acts.at(-1)?.at || null;
    if (priorAt && at < priorAt) { outOfSequence += 1; continue; }

    let act;
    if (kind === 'propose') {
      const rotationAskId = bounded(value.rotationAskId, WORK_REASSIGNMENT_LIMITS.idMax);
      const sourcePersonId = bounded(value.sourcePersonId, WORK_REASSIGNMENT_LIMITS.idMax);
      const sourceLineId = bounded(value.sourceLineId, 2 * WORK_REASSIGNMENT_LIMITS.idMax);
      const sourceManagerId = bounded(value.sourceManagerId, WORK_REASSIGNMENT_LIMITS.idMax);
      const recipientId = bounded(value.recipientId, WORK_REASSIGNMENT_LIMITS.idMax);
      const receivingLineId = bounded(value.receivingLineId, 2 * WORK_REASSIGNMENT_LIMITS.idMax);
      const receivingManagerId = bounded(value.receivingManagerId, WORK_REASSIGNMENT_LIMITS.idMax);
      const periodKey = period(value.periodKey);
      const workTitle = bounded(value.workTitle, WORK_REASSIGNMENT_LIMITS.titleChars);
      const effortShareDaysH = Number.isInteger(value.effortShareDaysH) ? value.effortShareDaysH : null;
      const note = bounded(value.note, WORK_REASSIGNMENT_LIMITS.noteChars);
      const claimedRuleId = text(value.rotationRuleId);
      const claimedProvenance = text(value.rotationProvenance);
      if (!rotationAskId || !sourcePersonId || !sourceLineId || !sourceManagerId || !recipientId
        || !receivingLineId || !receivingManagerId || !periodKey || workTitle.length < 3
        || effortShareDaysH === null || effortShareDaysH < 1 || effortShareDaysH > WORK_REASSIGNMENT_LIMITS.maxEffortShareDaysH
        || recipientId === sourcePersonId || sourceManagerId === receivingManagerId || prior.proposal
        || (via === 'seat' && decidedBySeatId !== sourceManagerId)
        || (claimedRuleId && claimedRuleId !== WORK_TURN_RULE_ID)
        || (claimedProvenance && !['explicit', 'legacy-attested', 'retained-attested'].includes(claimedProvenance))) {
        malformed += 1;
        continue;
      }
      const rotation = workReassignmentRotationProvenance(value, state, rotationAskId);
      if (!delegationIds.has(rotationAskId) || !rotation.ok) { orphaned += 1; continue; }
      act = {
        id, kind, transferId, rotationAskId,
        rotationRuleId: WORK_TURN_RULE_ID,
        rotationProvenance: rotation.provenance,
        sourcePersonId, sourceLineId, sourceManagerId,
        recipientId, receivingLineId, receivingManagerId,
        periodKey, workTitle, effortShareDaysH,
        via, decidedBySeatId, decidedOn, at, note,
        reason: '', capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
      };
      prior.proposal = act;
      prior.state = 'awaiting-receiving-line';
    } else {
      if (!prior.proposal || !['awaiting-receiving-line', 'accepted'].includes(prior.state)) {
        outOfSequence += 1;
        continue;
      }
      const note = bounded(value.note, WORK_REASSIGNMENT_LIMITS.noteChars);
      const reason = bounded(value.reason, WORK_REASSIGNMENT_LIMITS.reasonChars);
      const seatIsAuthorizedParty = via !== 'seat'
        || (kind === 'withdraw'
          ? [prior.proposal.sourceManagerId, prior.proposal.receivingManagerId].includes(decidedBySeatId)
          : decidedBySeatId === prior.proposal.receivingManagerId);
      if (!seatIsAuthorizedParty) {
        malformed += 1;
        continue;
      }
      if ((kind === 'decline' || kind === 'withdraw')
        && (reason.length < WORK_REASSIGNMENT_LIMITS.reasonMin || reason.length > WORK_REASSIGNMENT_LIMITS.reasonChars)) {
        malformed += 1;
        continue;
      }
      if (kind === 'accept') {
        const capacityCeilingH = Number.isInteger(value.capacityCeilingH) ? value.capacityCeilingH : null;
        const capacityConsumedH = Number.isInteger(value.capacityConsumedH) ? value.capacityConsumedH : null;
        const capacityProjectedH = Number.isInteger(value.capacityProjectedH) ? value.capacityProjectedH : null;
        if (prior.state !== 'awaiting-receiving-line' || capacityCeilingH === null || capacityConsumedH === null
          || capacityProjectedH === null || capacityCeilingH < 0 || capacityConsumedH < 0
          || capacityProjectedH !== capacityConsumedH + prior.proposal.effortShareDaysH
          || capacityProjectedH > capacityCeilingH) {
          malformed += 1;
          continue;
        }
        act = {
          id, kind, transferId, via, decidedBySeatId, decidedOn, at, note, reason: '',
          capacityCeilingH, capacityConsumedH, capacityProjectedH,
        };
        prior.answer = act;
        prior.state = 'accepted';
      } else if (kind === 'decline') {
        if (prior.state !== 'awaiting-receiving-line') { outOfSequence += 1; continue; }
        act = {
          id, kind, transferId, via, decidedBySeatId, decidedOn, at, note, reason,
          capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
        };
        prior.answer = act;
        prior.state = 'declined';
      } else if (kind === 'withdraw') {
        act = {
          id, kind, transferId, via, decidedBySeatId, decidedOn, at, note, reason,
          capacityCeilingH: null, capacityConsumedH: null, capacityProjectedH: null,
        };
        prior.withdrawal = act;
        prior.state = 'withdrawn';
      } else {
        malformed += 1;
        continue;
      }
    }
    ids.add(id);
    prior.acts.push(act);
    records.set(transferId, prior);
    out.push(act);
  }
  // ADR-0196 itself has no pre-field proposal ledger: the only legitimate
  // legacy compatibility case is an already completed, accepted transfer whose
  // legacy marker/support/link proof is being retained as history. Do not let a
  // legacy-attested marker open a live reservation or a newly importable path
  // around the explicit-marker action door.
  const historyOnly = new Set();
  for (const [transferId, record] of records) {
    const proposal = record.proposal;
    if (!proposal || proposal.rotationProvenance === 'explicit') continue;
    const task = (state.delegations || []).find((row) => row?.id === proposal.rotationAskId) || null;
    const servedToken = `ADR-0196 transfer ${transferId}`;
    const completedAcceptedHistory = task?.status === 'done'
      && record.state === 'accepted'
      && String(task.completionNote || '').includes(servedToken);
    if (!completedAcceptedHistory) historyOnly.add(transferId);
  }
  const retained = historyOnly.size
    ? out.filter((act) => !historyOnly.has(act.transferId))
    : out;
  const historicalActsDropped = [...historyOnly].reduce((sum, transferId) => sum + (records.get(transferId)?.acts.length || 0), 0);

  if (malformed) warnings.push(`Work reassignment: dropped ${malformed} malformed act(s); no receiving-line consent or capacity evidence was repaired.`);
  if (orphaned) warnings.push(`Work reassignment: dropped ${orphaned} proposal act(s) whose RULE-NPW-01 provenance could not be proved; no rotation link was invented.`);
  if (outOfSequence) warnings.push(`Work reassignment: dropped ${outOfSequence} out-of-sequence or duplicate lifecycle act(s); an answer cannot be reconstructed from an invalid history.`);
  if (historicalActsDropped) warnings.push(`Work reassignment: dropped ${historicalActsDropped} live legacy-attested act(s); only an already completed accepted transfer may retain legacy provenance as history.`);
  return compactWorkReassignmentActs(retained);
}
