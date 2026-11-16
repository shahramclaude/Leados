/**
 * app/core/domain/workStop.js — the single read model for ADR-0224.
 *
 * Every state is reconstructed from one declared stop and its append-only
 * mitigation / independent-assessment / operator-decision stream. A displayed
 * restart requires every frozen joint apex to have independently cleared the
 * same latest mitigation and a separate affected operator to confirm restart.
 * No saved `safe`, `cleared` or `restarted` flag is trusted.
 */

import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  normalizeWorkStopActs,
  normalizeWorkStopMarkers,
  normalizeWorkStops,
} from './workStopSchema.js';
import {
  SWP_ADR,
  SWP_CSV_COLUMNS,
  SWP_ENGINE_VERSION,
  SWP_HAZARDS,
  SWP_LIMITS as L,
  SWP_METHOD,
  SWP_STATES,
} from './workStopRegistry.js';
import { swpClaims, swpPartition } from './workStopMath.js';

export const SWP_STOP_COLLECTION = 'workStops';
export const SWP_ACT_COLLECTION = 'workStopActs';

export function workStopActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
}

export function workStopMatrix(state, now = new Date(), settings = null) {
  const at = now instanceof Date ? now : new Date(now);
  return buildMatrix(state, { now: at, settings: { ...(settings || state?.settings || {}), activeSeatId: null } });
}

function managerIdsOf(matrix, personId) {
  if (!matrix || !personId || !matrix.nodes?.has(personId)) return [];
  return [...new Set((matrix.linesByPerson?.get?.(personId) || [])
    .filter((line) => line?.active !== false && line?.managerId && line.managerId !== personId && matrix.nodes.has(line.managerId))
    .map((line) => line.managerId))].sort();
}

function sortUnique(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim()))].sort();
}

export function workStopParticipants(stop) {
  return sortUnique([stop?.reporterId, stop?.workLeadId, ...(stop?.affectedPersonIds || [])]);
}

/**
 * Resolve the complete set of minimal joint authorities above every active
 * manager line of every named participant. The synthetic workspace leader is
 * a graph node, not an askable human seat; a participant cannot independently
 * review their own hold either. Any such result is refused wholesale rather
 * than dropping just that branch.
 */
export function resolveWorkStopAuthority(matrix, participants) {
  if (!matrix) return { ok: false, reason: 'matrix-unreadable', managerIds: [], authorityIds: [] };
  const participantIds = sortUnique(participants);
  if (!participantIds.length) return { ok: false, reason: 'no-active-reporting-lines', managerIds: [], authorityIds: [] };
  const managersByParticipant = participantIds.map((personId) => ({
    personId,
    managerIds: managerIdsOf(matrix, personId),
  }));
  const managerIds = sortUnique(managersByParticipant.flatMap((row) => row.managerIds));
  if (managersByParticipant.some((row) => !matrix.nodes?.has(row.personId) || !row.managerIds.length)) {
    return { ok: false, reason: 'no-active-reporting-lines', managerIds, authorityIds: [] };
  }
  if (!managerIds.length) return { ok: false, reason: 'no-active-reporting-lines', managerIds, authorityIds: [] };

  // A dropped, cyclic or otherwise defective line on any participant or one of
  // their manager-chain ancestors means the complete joint route cannot be
  // proved. Do not compute an apex from the surviving fragments.
  const relevant = new Set(participantIds);
  for (const id of [...participantIds, ...managerIds]) {
    const node = matrix.nodes.get(id);
    if (node) for (const ancestor of node.ancestors || []) relevant.add(ancestor);
  }
  if ((matrix.defects || []).some((defect) => relevant.has(defect?.personId))) {
    return { ok: false, reason: 'matrix-unreadable', managerIds, authorityIds: [] };
  }

  const lowest = matrixJointApex(matrix, managerIds);
  if (!lowest?.apexIds?.length) return { ok: false, reason: 'no-common-joint-apex', managerIds, authorityIds: [] };

  // A high-consequence restart is a Director+ decision. Move upward from a
  // lower common line only when that common line lacks the declared right; keep
  // EVERY incomparable minimal Director+ apex instead of choosing one branch.
  let common = null;
  for (const id of managerIds) {
    const node = matrix.nodes.get(id);
    if (!node) return { ok: false, reason: 'no-common-joint-apex', managerIds, authorityIds: [] };
    const ancestors = new Set([id, ...(node.ancestors || [])]);
    if (common === null) common = ancestors;
    else for (const candidate of [...common]) if (!ancestors.has(candidate)) common.delete(candidate);
  }
  const qualified = [...(common || [])].filter((id) => altitudeRank(matrix.nodes.get(id)?.altitude) >= 3);
  const minimal = qualified.filter((id) => !qualified.some((other) => other !== id && matrix.nodes.get(id)?.descendants?.has(other)));
  const authorityIds = sortUnique(minimal);
  if (!authorityIds.length) return { ok: false, reason: 'no-right-capable-apex', managerIds, authorityIds: [] };
  if (authorityIds.includes(LEADER_ID) || authorityIds.some((id) => id === 'leader')
    || authorityIds.some((id) => participantIds.includes(id))) {
    return { ok: false, reason: 'unaskable-joint-apex', managerIds, authorityIds: [] };
  }
  return { ok: true, reason: 'resolved', managerIds, authorityIds };
}

function sameIds(a, b) {
  const left = sortUnique(a);
  const right = sortUnique(b);
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function isAbove(matrix, actorId, subjectIds) {
  if (!matrix?.nodes?.has(actorId)) return false;
  const ids = sortUnique(subjectIds);
  if (!ids.length) return false;
  return ids.every((id) => id !== actorId && matrix.nodes.has(id) && matrix.nodes.get(id)?.ancestors?.has(actorId));
}

function linesCross(matrix, participants) {
  if (!matrix) return null;
  const managers = sortUnique(participants.flatMap((id) => managerIdsOf(matrix, id)));
  for (let i = 0; i < managers.length; i += 1) {
    for (let j = i + 1; j < managers.length; j += 1) {
      const a = matrix.nodes.get(managers[i]);
      const b = matrix.nodes.get(managers[j]);
      if (!a || !b) return null;
      if (!a.ancestors?.has(managers[j]) && !b.ancestors?.has(managers[i])) return true;
    }
  }
  return false;
}

function withinSeat(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  return Boolean(seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId) || seat.nodeId === personId || seat.id === personId);
}

function canReadStop(seat, stop, authorityIds) {
  if (!seat || seat.fullAccess) return true;
  const ids = workStopParticipants(stop);
  if (ids.some((id) => withinSeat(seat, id))) return true;
  const actorId = workStopActorId(seat);
  return Boolean(actorId && authorityIds.includes(actorId));
}

function nameOf(people, id) {
  if (!id) return null;
  return people.get(id)?.name || id;
}

function latestMitigation(acts) {
  return acts.filter((act) => act.kind === 'mitigation').at(-1) || null;
}

function actRowsForStop(acts, stopId) {
  return acts.filter((act) => act.stopId === stopId);
}

function actIntegrity(stop, acts, matrix, authorityIds) {
  let invalidActN = 0;
  let invalidRestartN = 0;
  const participants = workStopParticipants(stop);
  const roleValid = [];
  for (const act of acts) {
    const human = act.actorId !== 'leader';
    let valid = human;
    if (valid && act.kind === 'mitigation') {
      valid = act.actorId === stop.workLeadId || isAbove(matrix, act.actorId, [stop.workLeadId]);
    } else if (valid && act.kind === 'assessment') {
      valid = authorityIds.includes(act.actorId) && !participants.includes(act.actorId);
    } else if (valid && act.kind === 'operator-decision') {
      valid = stop.affectedPersonIds.includes(act.actorId) && act.actorId !== stop.workLeadId && !authorityIds.includes(act.actorId);
    } else valid = false;
    if (!valid) { invalidActN += 1; continue; }
    roleValid.push(act);
  }

  const assessments = roleValid.filter((act) => act.kind === 'assessment');
  const streamOrder = new Map(roleValid.map((act, index) => [act.id, index]));
  const validIds = new Set();
  for (const act of roleValid) {
    if (act.kind === 'operator-decision' && act.decision === 'restart') {
      const roundAssessments = assessments.filter((row) => row.round === act.round && row.mitigationId === act.mitigationId);
      const safeIds = new Set(roundAssessments.filter((row) => row.assessment === 'safe').map((row) => row.actorId));
      const allSafe = authorityIds.length > 0 && authorityIds.every((id) => safeIds.has(id))
        && !roundAssessments.some((row) => row.assessment === 'hold')
        && !roleValid.some((row) => row.kind === 'operator-decision' && row.round === act.round
          && row.mitigationId === act.mitigationId && row.decision === 'hold');
      const approvalsPrecede = authorityIds.every((id) => {
        const approval = roundAssessments.find((row) => row.actorId === id && row.assessment === 'safe');
        return approval && streamOrder.get(approval.id) < streamOrder.get(act.id);
      });
      const latestApprovalAt = Math.max(0, ...roundAssessments.filter((row) => row.assessment === 'safe').map((row) => Date.parse(row.at)));
      if (!allSafe || !approvalsPrecede || !Number.isFinite(Date.parse(act.at)) || Date.parse(act.at) < latestApprovalAt) {
        invalidRestartN += 1;
        continue;
      }
    }
    validIds.add(act.id);
  }
  const validActs = roleValid.filter((act) => validIds.has(act.id));
  return { validActs, validIds, invalidActN, invalidRestartN };
}

function derivedState({ authorityAvailable, currentMitigation, assessments, authorityIds, operatorDecisions, currentRound, stop }) {
  if (!authorityAvailable) return 'no-independent-authority';
  if (!currentMitigation) return 'awaiting-mitigation';
  const roundAssessments = assessments.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation.id);
  if (roundAssessments.some((act) => act.assessment === 'hold')) return 'clearance-refused';
  const allCleared = authorityIds.length > 0 && authorityIds.every((id) => roundAssessments.some((act) => act.actorId === id && act.assessment === 'safe'));
  if (!allCleared) return 'awaiting-independent-clearance';
  const decisions = operatorDecisions.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation.id);
  const held = decisions.some((act) => act.decision === 'hold');
  if (held) return 'restart-contested';
  const restart = decisions.find((act) => act.decision === 'restart');
  if (restart) {
    const approvals = roundAssessments.filter((act) => act.assessment === 'safe');
    const latestApprovalAt = Math.max(0, ...approvals.map((act) => Date.parse(act.at)));
    if (stop.affectedPersonIds.includes(restart.actorId) && !authorityIds.includes(restart.actorId)
      && approvals.length >= authorityIds.length && Date.parse(restart.at) >= latestApprovalAt) return 'restarted';
  }
  return 'awaiting-operator-check';
}

/** Pure reader. `includeAll` is an internal rule/test option; the API never sets it. */
export function buildWorkStop(state, { now = new Date(), settings = null, seat = null, includeAll = false } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowIso = at.toISOString();
  const allStops = normalizeWorkStops(state?.workStops, warnings);
  const allActs = normalizeWorkStopActs(state?.workStopActs, allStops, warnings);
  const markers = normalizeWorkStopMarkers(state?.workStopMarkers, warnings);
  const people = new Map((Array.isArray(state?.people) ? state.people : [])
    .filter((person) => person && typeof person.id === 'string' && person.status !== 'archived')
    .map((person) => [person.id, person]));
  const allStopIds = new Set(allStops.map((stop) => stop.id));
  const actsReferenced = allActs.filter((act) => allStopIds.has(act.stopId)).length;
  let matrix = null;
  let matrixError = null;
  try {
    matrix = workStopMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The active reporting graph could not be read. Clearance and matrix routing are withheld: ${error?.message || 'unknown error'}.`;
  }

  const fullAccess = !seat || Boolean(seat.fullAccess);
  const rank = seat ? (seat.rank ?? 99) : 99;
  const redact = !fullAccess && rank >= 4;
  const visibleRows = [];
  const actorId = workStopActorId(seat);
  let hiddenStopN = 0;

  for (const stop of allStops) {
    const participants = workStopParticipants(stop);
    const namedPeople = sortUnique([...participants, ...stop.authorityIds]);
    const missingPeople = namedPeople.filter((id) => !people.has(id));
    const acts = actRowsForStop(allActs, stop.id);
    const rawStopActs = (Array.isArray(state?.workStopActs) ? state.workStopActs : [])
      .filter((act) => act && typeof act === 'object' && act.stopId === stop.id);
    const invalidStoredActN = Math.max(0, rawStopActs.length - acts.length);
    const integrity = actIntegrity(stop, acts, matrix, stop.authorityIds);
    const validActs = integrity.validActs;
    const currentMitigation = latestMitigation(validActs.filter((act) => act.kind === 'mitigation'));
    const currentRound = currentMitigation?.round || 0;
    const authority = resolveWorkStopAuthority(matrix, participants);
    const authorityMatches = stop.authorityReason === 'resolved' && authority.ok && sameIds(stop.authorityIds, authority.authorityIds);
    const authorityAvailable = authorityMatches && missingPeople.length === 0;
    const assessmentActs = validActs.filter((act) => act.kind === 'assessment');
    const operatorActs = validActs.filter((act) => act.kind === 'operator-decision');
    const eligibleAffectedOperatorIds = stop.affectedPersonIds.filter((id) => people.has(id)
      && id !== stop.workLeadId && !stop.authorityIds.includes(id));
    const derived = derivedState({
      authorityAvailable,
      currentMitigation,
      assessments: assessmentActs,
      authorityIds: stop.authorityIds,
      operatorDecisions: operatorActs,
      currentRound,
      stop,
    });
    const stateKey = invalidStoredActN > 0 || integrity.invalidActN > 0 || integrity.invalidRestartN > 0
      ? 'record-integrity-defect' : derived;
    const overdue = stateKey !== 'restarted' && Date.parse(stop.reviewByAt) < at.getTime();
    const crossLine = linesCross(matrix, participants);
    const row = {
      ...stop,
      state: stateKey,
      overdue,
      crossLine,
      authorityAvailable,
      authorityMatches,
      authorityDrifted: stop.authorityReason === 'resolved' && !authorityMatches,
      authorityCurrentIds: authority.authorityIds,
      authorityReasonCurrent: authority.reason,
      authorityNames: redact ? [] : stop.authorityIds.map((id) => nameOf(people, id)),
      reporterName: redact ? null : nameOf(people, stop.reporterId),
      workLeadName: redact ? null : nameOf(people, stop.workLeadId),
      affectedNames: redact ? [] : stop.affectedPersonIds.map((id) => nameOf(people, id)),
      missingPeopleN: missingPeople.length,
      eligibleAffectedOperatorAvailable: eligibleAffectedOperatorIds.length > 0,
      eligibleMitigationActorIds: fullAccess
        ? [...people.keys()].filter((id) => id === stop.workLeadId || isAbove(matrix, id, [stop.workLeadId])).sort()
        : [],
      canMitigate: Boolean(stateKey !== 'restarted' && invalidStoredActN === 0 && integrity.invalidActN === 0 && integrity.invalidRestartN === 0
        && (fullAccess
          ? [...people.keys()].some((id) => id === stop.workLeadId || isAbove(matrix, id, [stop.workLeadId]))
          : actorId && actorId !== 'leader' && (actorId === stop.workLeadId || isAbove(matrix, actorId, [stop.workLeadId])))),
      canAssess: Boolean(authorityAvailable && currentMitigation && invalidStoredActN === 0 && integrity.invalidActN === 0 && integrity.invalidRestartN === 0
        && (fullAccess || (actorId && actorId !== 'leader' && rank >= 3 && stop.authorityIds.includes(actorId)
          && !participants.includes(actorId)
          && !validActs.some((act) => act.kind === 'assessment' && act.actorId === actorId && act.round === currentRound)))
        && (fullAccess ? stop.authorityIds.some((id) => !validActs.some((act) => act.kind === 'assessment' && act.actorId === id && act.round === currentRound)) : true)),
      canDecide: Boolean(stateKey !== 'restarted' && currentMitigation && invalidStoredActN === 0 && integrity.invalidActN === 0 && integrity.invalidRestartN === 0
        && (fullAccess
          ? eligibleAffectedOperatorIds.some((id) =>
            !validActs.some((act) => act.kind === 'operator-decision' && act.actorId === id && act.round === currentRound))
          : actorId && actorId !== 'leader' && stop.affectedPersonIds.includes(actorId)
            && actorId !== stop.workLeadId && !stop.authorityIds.includes(actorId)
            && !validActs.some((act) => act.kind === 'operator-decision' && act.actorId === actorId && act.round === currentRound))),
      canRestart: stateKey === 'awaiting-operator-check' && authorityAvailable && invalidStoredActN === 0
        && integrity.invalidActN === 0 && integrity.invalidRestartN === 0,
      currentRound,
      currentMitigation,
      currentAssessmentN: assessmentActs.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation?.id).length,
      currentSafeAssessmentN: assessmentActs.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation?.id && act.assessment === 'safe').length,
      requiredAssessmentsN: stop.authorityIds.length,
      currentHoldAssessmentN: assessmentActs.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation?.id && act.assessment === 'hold').length,
      currentOperatorDecisionN: operatorActs.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation?.id).length,
      currentOperatorHoldN: operatorActs.filter((act) => act.round === currentRound && act.mitigationId === currentMitigation?.id && act.decision === 'hold').length,
      latestMitigationAt: currentMitigation?.at || null,
      invalidActN: integrity.invalidActN + invalidStoredActN,
      invalidStoredActN,
      invalidRestartN: integrity.invalidRestartN,
      visibleActions: acts.map((act) => ({ ...act, valid: integrity.validIds.has(act.id), actorName: redact ? null : nameOf(people, act.actorId), areaRef: stop.areaRef })),
    };
    if (!canReadStop(seat, stop, stop.authorityIds)) { hiddenStopN += 1; continue; }
    visibleRows.push(row);
  }

  const urgentWeight = {
    'record-integrity-defect': 0,
    'no-independent-authority': 1,
    'clearance-refused': 2,
    'restart-contested': 3,
    'awaiting-mitigation': 4,
    'awaiting-independent-clearance': 5,
    'awaiting-operator-check': 6,
    restarted: 7,
  };
  const sorted = visibleRows.slice().sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (urgentWeight[a.state] !== urgentWeight[b.state]) return urgentWeight[a.state] - urgentWeight[b.state];
    const due = a.reviewByAt.localeCompare(b.reviewByAt);
    return due || a.id.localeCompare(b.id);
  });
  const partition = swpPartition(sorted);
  const visibleActRows = sorted.flatMap((stop) => stop.visibleActions).sort((a, b) => b.at.localeCompare(a.at));
  const claims = swpClaims({
    stopsN: sorted.length,
    states: partition.states,
    hazards: partition.hazards,
    actsN: visibleActRows.length,
    actsReferenced: visibleActRows.filter((act) => sorted.some((stop) => stop.id === act.stopId)).length,
    invalidActN: sorted.reduce((sum, stop) => sum + stop.invalidActN, 0),
    invalidRestartN: sorted.reduce((sum, stop) => sum + stop.invalidRestartN, 0),
    invalidParticipantsN: sorted.filter((stop) => stop.missingPeopleN > 0).length,
    matrixReadable: !matrixError,
    unroutableN: partition.unroutable,
    hiddenStopN,
  });
  const states = SWP_STATES.map((row) => ({ ...row, count: partition.states[row.key] || 0 }));
  const hazards = SWP_HAZARDS.map((row) => ({ ...row, count: partition.hazards[row.key] || 0 }));
  const visibleStops = sorted.slice(0, L.stopsShown);
  const visibleActs = visibleActRows.slice(0, L.actsShown);
  const attention = actorId ? sorted.filter((stop) => {
    if (stop.state === 'restarted') return false;
    if (stop.workLeadId === actorId && stop.state === 'awaiting-mitigation') return true;
    if (stop.authorityMatches && stop.authorityIds.includes(actorId) && stop.overdue
      && !stop.visibleActions.some((act) => act.valid && act.kind === 'assessment' && act.actorId === actorId && act.round === stop.currentRound)) return true;
    if (stop.affectedPersonIds.includes(actorId) && actorId !== stop.workLeadId
      && !stop.authorityIds.includes(actorId) && stop.state === 'awaiting-operator-check') return true;
    return false;
  }).length : sorted.filter((stop) => stop.state !== 'restarted').length;
  const peopleOptions = seat ? [...people.values()]
    .filter((person) => person.status !== 'archived' && withinSeat(seat, person.id))
    .map((person) => ({ id: person.id, name: person.name || person.id, role: person.role || person.level || '' }))
    .sort((a, b) => a.name.localeCompare(b.name)) : [];

  return {
    engineVersion: SWP_ENGINE_VERSION,
    adr: SWP_ADR,
    nowIso,
    seat: seat ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess, actorId } : null,
    matrixError,
    warnings,
    totals: {
      stopsDeclared: sorted.length,
      activeStopsN: partition.active,
      restartedN: partition.restarted,
      overdueReviewsN: partition.overdue,
      unroutableN: partition.unroutable,
      mitigationsN: visibleActRows.filter((act) => act.kind === 'mitigation').length,
      assessmentsN: visibleActRows.filter((act) => act.kind === 'assessment').length,
      operatorDecisionsN: visibleActRows.filter((act) => act.kind === 'operator-decision').length,
      actsN: visibleActRows.length,
      actsReferenced: visibleActRows.filter((act) => sorted.some((stop) => stop.id === act.stopId)).length,
      scopeComplete: hiddenStopN === 0,
      invalidParticipantsN: sorted.filter((stop) => stop.missingPeopleN > 0).length,
      invalidActN: sorted.reduce((sum, stop) => sum + stop.invalidActN, 0),
      invalidRestartN: sorted.reduce((sum, stop) => sum + stop.invalidRestartN, 0),
      countsReconcile: claims.countsReconcile,
      figuresComplete: claims.figuresComplete && warnings.length === 0 && hiddenStopN === 0,
      safeRestartComplete: partition.active === 0 && partition.unroutable === 0,
      markersN: markers.length,
    },
    states,
    hazards,
    stops: visibleStops,
    stopsShown: visibleStops.length,
    stopsCapped: sorted.length - visibleStops.length,
    acts: visibleActs,
    actsShown: visibleActs.length,
    actsCapped: visibleActRows.length - visibleActs.length,
    markers,
    attention,
    peopleOptions,
    method: SWP_METHOD,
    ...(includeAll ? { stopsAll: sorted, actsAll: visibleActRows } : {}),
  };
}

export function workStopAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildWorkStop(state, { now, settings, seat }).attention;
}

/** CSV scope #166: aggregate-only, with small-cell and complementary suppression. */
export function workStopCsvRows(report) {
  if (!report?.totals) return [];
  const t = report.totals;
  const supported = t.countsReconcile === true;
  const summaryValues = [t.stopsDeclared, t.activeStopsN, t.restartedN, t.overdueReviewsN,
    t.unroutableN, t.mitigationsN, t.assessmentsN, t.operatorDecisionsN];
  const stateValues = (report.states || []).map((row) => row.count);
  const hazardValues = (report.hazards || []).map((row) => row.count);
  const allValues = [...summaryValues, ...stateValues, ...hazardValues];
  const incomplete = !supported || t.figuresComplete !== true;
  const smallCell = allValues.some((value) => Number.isInteger(value) && value > 0 && value < L.privacyFloor);
  // Suppress the whole numeric release if any single small cell exists: a
  // summary total or the complementary state/hazard partition must not recover
  // the hidden value by subtraction.
  const publish = !incomplete && !smallCell;
  const cell = (value) => publish && Number.isInteger(value) ? String(value) : '';
  const blankReason = [
    ...(incomplete ? ['scope_or_record_incomplete'] : []),
    ...(smallCell ? ['small_cell_suppressed'] : []),
  ].join(';');
  const asOf = report.nowIso?.slice(0, 10) || '';
  const rows = [{
    as_of: asOf, row_kind: 'summary', key: 'all',
    declared: cell(t.stopsDeclared), active_holds: cell(t.activeStopsN), restarted: cell(t.restartedN),
    overdue_reviews: cell(t.overdueReviewsN), unroutable_holds: cell(t.unroutableN),
    mitigations: cell(t.mitigationsN), independent_assessments: cell(t.assessmentsN), operator_decisions: cell(t.operatorDecisionsN),
    blank_reason: blankReason,
  }, {
    as_of: asOf, row_kind: 'coverage', key: 'claims',
    declared: cell(t.stopsDeclared), active_holds: '', restarted: '', overdue_reviews: '', unroutable_holds: '',
    mitigations: '', independent_assessments: '', operator_decisions: '',
    blank_reason: blankReason,
  }];
  for (const row of report.states || []) {
    const value = row.count;
    rows.push({
      as_of: asOf, row_kind: 'state', key: row.key,
      declared: cell(value), active_holds: row.key === 'restarted' ? '' : cell(value),
      restarted: row.key === 'restarted' ? cell(value) : '',
      overdue_reviews: '', unroutable_holds: '', mitigations: '', independent_assessments: '', operator_decisions: '',
      blank_reason: blankReason,
    });
  }
  for (const row of report.hazards || []) {
    const value = row.count;
    rows.push({
      as_of: asOf, row_kind: 'hazard', key: row.key,
      declared: cell(value), active_holds: '', restarted: '', overdue_reviews: '', unroutable_holds: '',
      mitigations: '', independent_assessments: '', operator_decisions: '', blank_reason: blankReason,
    });
  }
  return rows.map((row) => Object.fromEntries(SWP_CSV_COLUMNS.map((key) => [key, row[key] ?? ''])));
}
