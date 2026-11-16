/**
 * app/core/domain/mgrHandover.js — the single read model for ADR-0225.
 *
 * Every state is reconstructed from one declared transition and its
 * append-only act stream. The outgoing manager's portfolio brief, the
 * successor's own acceptance and the governor's release are all first-person,
 * dated human acts; no stored flag completes a handover, and a planned
 * effective date that passes without the two keys prints `lapsed` rather than
 * transferring anything. The portfolio itself is read from the record the
 * workspace already stores — delegations, goals, cases, escalations, forums —
 * never re-entered and never invented.
 */

import { LEADER_ID } from './chain.js';
import { altitudeRank } from './chainRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import {
  normalizeMgrHandoverActs,
  normalizeMgrHandoverMarkers,
  normalizeMgrHandovers,
} from './mgrHandoverSchema.js';
import {
  MHH_ADR,
  MHH_CSV_COLUMNS,
  MHH_ENGINE_VERSION,
  MHH_LIMITS as L,
  MHH_METHOD,
  MHH_PORTFOLIO_CATEGORIES,
  MHH_PORTFOLIO_KEYS,
  MHH_STATES,
} from './mgrHandoverRegistry.js';
import { mhhClaims, mhhPartition } from './mgrHandoverMath.js';

export const MHH_HANDOVER_COLLECTION = 'mgrHandovers';
export const MHH_ACT_COLLECTION = 'mgrHandoverActs';

export function mgrHandoverActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
}

export function mgrHandoverMatrix(state, now = new Date(), settings = null) {
  const at = now instanceof Date ? now : new Date(now);
  return buildMatrix(state, { now: at, settings: { ...(settings || state?.settings || {}), activeSeatId: null } });
}

function sortUnique(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && id.trim()))].sort();
}

function managerIdsOf(matrix, personId) {
  if (!matrix || !personId || !matrix.nodes?.has(personId)) return [];
  return [...new Set((matrix.linesByPerson?.get?.(personId) || [])
    .filter((line) => line?.active !== false && line?.managerId && line.managerId !== personId && matrix.nodes.has(line.managerId))
    .map((line) => line.managerId))].sort();
}

/**
 * Resolve the complete set of minimal joint authorities above every active
 * manager line of every named manager. The synthetic workspace leader is a
 * graph node, not an askable human seat; a participant can never hold their
 * own dispute. Any unresolvable branch refuses the whole route rather than
 * dropping it.
 */
export function resolveMgrHandoverApex(matrix, managerIds) {
  if (!matrix) return { ok: false, reason: 'matrix-unreadable', apexIds: [] };
  const ids = sortUnique(managerIds);
  if (ids.length < 1) return { ok: false, reason: 'no-active-reporting-lines', apexIds: [] };
  const managers = ids.flatMap((personId) => managerIdsOf(matrix, personId));
  if (ids.some((personId) => !matrix.nodes?.has(personId) || !managerIdsOf(matrix, personId).length)) {
    return { ok: false, reason: 'no-active-reporting-lines', apexIds: [] };
  }
  if (!managers.length) return { ok: false, reason: 'no-active-reporting-lines', apexIds: [] };

  const relevant = new Set(ids);
  for (const id of [...ids, ...managers]) {
    const node = matrix.nodes.get(id);
    if (node) for (const ancestor of node.ancestors || []) relevant.add(ancestor);
  }
  if ((matrix.defects || []).some((defect) => relevant.has(defect?.personId))) {
    return { ok: false, reason: 'matrix-unreadable', apexIds: [] };
  }

  const lowest = matrixJointApex(matrix, managers);
  if (!lowest?.apexIds?.length) return { ok: false, reason: 'no-common-joint-apex', apexIds: [] };

  let common = null;
  for (const id of managers) {
    const node = matrix.nodes.get(id);
    if (!node) return { ok: false, reason: 'no-common-joint-apex', apexIds: [] };
    const ancestors = new Set([id, ...(node.ancestors || [])]);
    if (common === null) common = ancestors;
    else for (const candidate of [...common]) if (!ancestors.has(candidate)) common.delete(candidate);
  }
  const qualified = [...(common || [])].filter((id) => altitudeRank(matrix.nodes.get(id)?.altitude) >= 3);
  const minimal = qualified.filter((id) => !qualified.some((other) => other !== id && matrix.nodes.get(id)?.descendants?.has(other)));
  const apexIds = sortUnique(minimal);
  if (!apexIds.length) return { ok: false, reason: 'no-right-capable-apex', apexIds: [] };
  if (apexIds.includes(LEADER_ID) || apexIds.some((id) => id === 'leader')
    || apexIds.some((id) => ids.includes(id))) {
    return { ok: false, reason: 'unaskable-joint-apex', apexIds: [] };
  }
  return { ok: true, reason: 'resolved', apexIds };
}

function isAbove(matrix, actorId, subjectId) {
  if (!matrix?.nodes?.has(actorId) || !matrix?.nodes?.has(subjectId)) return false;
  return subjectId !== actorId && Boolean(matrix.nodes.get(subjectId)?.ancestors?.has(actorId));
}

function withinSeat(seat, personId) {
  if (!seat || seat.fullAccess) return true;
  return Boolean(seat.scope?.has?.(personId) || seat.lineScope?.has?.(personId) || seat.nodeId === personId || seat.id === personId);
}

function nameOf(people, id) {
  if (!id) return null;
  return people.get(id)?.name || id;
}

/** Read one declared portfolio category from the record. Returns { count, crossLineN, refused, reason }. */
function readCategory(state, handover, key, matrix, people) {
  const row = MHH_PORTFOLIO_CATEGORIES.find((entry) => entry.key === key);
  if (!row) return { count: 0, crossLineN: 0, refused: true, reason: 'category-unknown' };
  const departing = handover.departingManagerId;
  const successor = handover.successorId;
  try {
    if (row.source === 'delegations') {
      const items = (Array.isArray(state?.delegations) ? state.delegations : [])
        .filter((row2) => row2 && row2.personId === departing && row2.status === 'active');
      return { count: items.length, crossLineN: 0, refused: false, reason: null };
    }
    if (row.source === 'goals') {
      const items = (Array.isArray(state?.goals) ? state.goals : [])
        .filter((row2) => row2 && row2.ownerId === departing && row2.status === 'active');
      return { count: items.length, crossLineN: 0, refused: false, reason: null };
    }
    if (row.source === 'cases') {
      const open = ['open', 'mitigating', 'monitoring'];
      const items = (Array.isArray(state?.cases) ? state.cases : [])
        .filter((row2) => row2 && row2.ownerId === departing && open.includes(row2.status));
      return { count: items.length, crossLineN: 0, refused: false, reason: null };
    }
    if (row.source === 'escalations') {
      const items = (Array.isArray(state?.escalationRecords) ? state.escalationRecords : [])
        .filter((row2) => row2 && row2.toSeatId === departing && row2.disposition === 'escalated'
          && (row2.status === 'open' || row2.status === 'received'));
      // A routed escalation is person-bound: it came from an origin seat the
      // successor must be able to reach. An origin outside the successor's
      // live lines is counted cross-line, printed, and never auto-transferred.
      let crossLineN = 0;
      for (const item of items) {
        const origin = item.fromSeatId;
        if (origin && origin !== successor && !isAbove(matrix, successor, origin)) crossLineN += 1;
      }
      return { count: items.length, crossLineN, refused: false, reason: null };
    }
    if (row.source === 'forums') {
      const items = (Array.isArray(state?.cadenceForums) ? state.cadenceForums : [])
        .filter((row2) => row2 && row2.chairSeatId === departing && row2.status === 'active');
      return { count: items.length, crossLineN: 0, refused: false, reason: null };
    }
  } catch {
    return { count: 0, crossLineN: 0, refused: true, reason: 'category-unreadable' };
  }
  return { count: 0, crossLineN: 0, refused: true, reason: 'category-unknown' };
}

function actIntegrity(handover, acts, matrix) {
  let invalidActN = 0;
  const validIds = new Set();
  for (const act of acts) {
    let valid = true;
    if (act.kind === 'portfolio-brief') {
      valid = act.actorId === handover.departingManagerId || isAbove(matrix, act.actorId, handover.departingManagerId);
    } else if (act.kind === 'acceptance') {
      valid = act.actorId === handover.successorId;
    } else if (act.kind === 'release') {
      valid = act.actorId === handover.declaredById || isAbove(matrix, act.actorId, handover.declaredById);
    } else if (act.kind === 'dispute') {
      valid = act.actorId === handover.successorId;
    } else {
      valid = false;
    }
    if (valid) validIds.add(act.id);
    else invalidActN += 1;
  }
  return { validIds, invalidActN };
}

function actRowsForHandover(acts, handoverId) {
  return acts.filter((act) => act.handoverId === handoverId);
}

function canReadHandover(seat, handover, apexIds, matrix) {
  if (!seat || seat.fullAccess) return true;
  const participants = [handover.departingManagerId, handover.successorId, handover.declaredById];
  if (participants.some((id) => withinSeat(seat, id))) return true;
  const actorId = mgrHandoverActorId(seat);
  if (actorId && apexIds.includes(actorId)) return true;
  // A manager above any participant reads the transition through the chain they
  // govern; a peer line does not.
  if (matrix && actorId) {
    return participants.some((id) => isAbove(matrix, actorId, id));
  }
  return false;
}

/** Pure reader. `includeAll` is an internal rule/test option; the API never sets it. */
export function buildMgrHandover(state, { now = new Date(), settings = null, seat = null, includeAll = false } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowIso = at.toISOString();
  const today = nowIso.slice(0, 10);
  const allHandovers = normalizeMgrHandovers(state?.mgrHandovers, warnings);
  const allActs = normalizeMgrHandoverActs(state?.mgrHandoverActs, allHandovers, warnings);
  const markers = normalizeMgrHandoverMarkers(state?.mgrHandoverMarkers, warnings);
  const people = new Map((Array.isArray(state?.people) ? state.people : [])
    .filter((person) => person && typeof person.id === 'string' && person.status !== 'archived')
    .map((person) => [person.id, person]));
  const allHandoverIds = new Set(allHandovers.map((row) => row.id));
  const actsReferenced = allActs.filter((act) => allHandoverIds.has(act.handoverId)).length;
  let matrix = null;
  let matrixError = null;
  try {
    matrix = mgrHandoverMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The active reporting graph could not be read. Handover routing and dispute authority are withheld: ${error?.message || 'unknown error'}.`;
  }

  const fullAccess = !seat || Boolean(seat.fullAccess);
  const rank = seat ? (seat.rank ?? 99) : 99;
  const redact = !fullAccess && rank >= 4;
  const visibleRows = [];
  const actorId = mgrHandoverActorId(seat);
  let hiddenHandoverN = 0;

  for (const handover of allHandovers) {
    const acts = actRowsForHandover(allActs, handover.id);
    const rawStoredActs = (Array.isArray(state?.mgrHandoverActs) ? state.mgrHandoverActs : [])
      .filter((act) => act && typeof act === 'object' && act.handoverId === handover.id);
    const invalidStoredActN = Math.max(0, rawStoredActs.length - acts.length);
    const integrity = actIntegrity(handover, acts, matrix);
    const validActs = acts.filter((act) => integrity.validIds.has(act.id));
    const brief = validActs.find((act) => act.kind === 'portfolio-brief') || null;
    const acceptance = validActs.find((act) => act.kind === 'acceptance') || null;
    const release = validActs.find((act) => act.kind === 'release') || null;
    const disputes = validActs.filter((act) => act.kind === 'dispute');
    const hasBrief = Boolean(brief);
    const hasAcceptance = Boolean(acceptance);
    const hasRelease = Boolean(release);
    const hasDispute = disputes.length > 0;

    const apex = resolveMgrHandoverApex(matrix, [handover.departingManagerId, handover.successorId]);
    const apexIds = apex.ok ? apex.apexIds : [];

    // The declared portfolio, read from the record, category by category.
    const portfolio = {};
    let portfolioTotal = 0;
    let crossLineN = 0;
    let refusedCategoryN = 0;
    const refusedCategories = [];
    for (const key of handover.scopeKeys) {
      const read = readCategory(state, handover, key, matrix, people);
      portfolio[key] = read.count;
      portfolioTotal += read.count;
      crossLineN += read.crossLineN;
      if (read.refused) {
        refusedCategoryN += 1;
        refusedCategories.push({ key, reason: read.reason });
      }
    }
    for (const key of MHH_PORTFOLIO_KEYS) {
      if (!Object.hasOwn(portfolio, key)) portfolio[key] = 0;
    }

    const invalidActN = integrity.invalidActN + invalidStoredActN;
    let stateKey;
    const lapsed = !hasAcceptance && !hasRelease && handover.plannedEffectiveOn < today;
    if (invalidActN > 0 || invalidStoredActN > 0) stateKey = 'record-integrity-defect';
    else if (hasRelease) stateKey = 'released';
    else if (hasAcceptance) stateKey = 'accepted';
    else if (hasDispute) stateKey = 'disputed';
    else if (lapsed) stateKey = 'lapsed';
    else if (hasBrief) stateKey = 'briefed';
    else stateKey = 'declared';

    const acceptanceDue = hasBrief && !hasAcceptance && !hasRelease && handover.plannedEffectiveOn <= today;
    const releaseDue = hasAcceptance && !hasRelease && handover.plannedEffectiveOn <= today;
    const disputeCutoff = new Date(Date.parse(`${today}T00:00:00.000Z`) - L.disputeWindowDays * 86400000).toISOString().slice(0, 10);
    const disputeDue = hasDispute && !hasRelease && handover.plannedEffectiveOn < disputeCutoff;
    const briefDue = !hasBrief && !hasRelease && handover.plannedEffectiveOn < today;
    const overdue = acceptanceDue || releaseDue || disputeDue || briefDue;

    const briefStatedTotal = brief?.portfolioCount ?? null;
    const briefDelta = briefStatedTotal === null ? null : briefStatedTotal - portfolioTotal;
    const shortfall = hasAcceptance ? Math.max(0, portfolioTotal - (acceptance.acceptedCount ?? 0)) : 0;
    const acceptanceExceeds = hasAcceptance && (acceptance.acceptedCount ?? 0) > portfolioTotal;

    const namedPeople = sortUnique([
      handover.departingManagerId, handover.successorId, handover.declaredById,
      ...apexIds,
    ]);
    const missingPeople = namedPeople.filter((id) => !people.has(id));

    const row = {
      ...handover,
      state: stateKey,
      lapsed,
      overdue,
      acceptanceDue,
      releaseDue,
      disputeDue,
      briefDue,
      apexResolved: apex.ok,
      apexReason: apex.reason,
      apexIds,
      apexNames: redact ? [] : apexIds.map((id) => nameOf(people, id)),
      // Two claims, never collapsed: what the outgoing manager stated in the
      // brief and what the record actually holds. The delta is printed.
      briefStatedTotal,
      portfolioTotal,
      briefDelta,
      shortfall,
      acceptanceExceeds,
      portfolio,
      refusedCategories,
      crossLineN,
      hasBrief,
      hasAcceptance,
      hasRelease,
      disputeN: disputes.length,
      departingManagerName: redact ? null : nameOf(people, handover.departingManagerId),
      successorName: redact ? null : nameOf(people, handover.successorId),
      governorName: redact ? null : nameOf(people, handover.declaredById),
      missingPeopleN: missingPeople.length,
      invalidActN,
      invalidStoredActN,
      visibleActions: validActs.map((act) => ({ ...act, valid: true, actorName: redact ? null : nameOf(people, act.actorId) })),
      allActions: acts.map((act) => ({ ...act, valid: integrity.validIds.has(act.id), actorName: redact ? null : nameOf(people, act.actorId) })),
    };
    if (!canReadHandover(seat, handover, apexIds, matrix)) { hiddenHandoverN += 1; continue; }
    visibleRows.push(row);
  }

  const weight = {
    'record-integrity-defect': 0,
    disputed: 1,
    lapsed: 2,
    declared: 3,
    briefed: 4,
    accepted: 5,
    released: 6,
  };
  const sorted = visibleRows.slice().sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (weight[a.state] !== weight[b.state]) return weight[a.state] - weight[b.state];
    return a.plannedEffectiveOn.localeCompare(b.plannedEffectiveOn) || a.id.localeCompare(b.id);
  });
  const partition = mhhPartition(sorted);
  const visibleActRows = sorted.flatMap((handover) => handover.visibleActions).sort((a, b) => b.at.localeCompare(a.at));
  const integrityDefectN = sorted.filter((row) => row.state === 'record-integrity-defect').length;
  const refusedCategoryTotal = sorted.reduce((sum, row) => sum + row.refusedCategories.length, 0);
  const shortfallTotal = sorted.reduce((sum, row) => sum + row.shortfall, 0);
  const claims = mhhClaims({
    handoversN: sorted.length,
    states: partition.states,
    categories: partition.categories,
    portfolioItems: partition.portfolioItems,
    actsN: visibleActRows.length,
    actsReferenced: visibleActRows.filter((act) => sorted.some((row) => row.id === act.handoverId)).length,
    integrityDefectN,
    refusedCategoryN: refusedCategoryTotal,
    shortfallN: shortfallTotal,
    crossLineN: sorted.reduce((sum, row) => sum + row.crossLineN, 0),
    matrixReadable: !matrixError,
    hiddenHandoverN,
  });
  const states = MHH_STATES.map((row2) => ({ ...row2, count: partition.states[row2.key] || 0 }));
  const categories = MHH_PORTFOLIO_CATEGORIES.map((row2) => ({ ...row2, count: partition.categories[row2.key] || 0 }));
  const visibleHandovers = sorted.slice(0, L.handoversShown);
  const visibleActs = visibleActRows.slice(0, L.actsShown);
  const attention = actorId ? sorted.filter((row) => {
    if (row.state === 'released' || row.state === 'record-integrity-defect') return false;
    if (row.successorId === actorId && row.acceptanceDue) return true;
    if (row.declaredById === actorId && row.releaseDue) return true;
    if (row.apexIds.includes(actorId) && row.disputeDue) return true;
    if (row.departingManagerId === actorId && row.briefDue) return true;
    return false;
  }).length : sorted.filter((row) => row.state !== 'released' && row.state !== 'record-integrity-defect').length;
  const peopleOptions = seat ? [...people.values()]
    .filter((person) => person.status !== 'archived' && withinSeat(seat, person.id))
    .map((person) => ({ id: person.id, name: person.name || person.id, role: person.role || person.level || '' }))
    .sort((a, b) => a.name.localeCompare(b.name)) : [];

  return {
    engineVersion: MHH_ENGINE_VERSION,
    adr: MHH_ADR,
    nowIso,
    today,
    seat: seat ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess, actorId } : null,
    matrixError,
    warnings,
    totals: {
      handoversDeclared: sorted.length,
      declaredN: partition.states.declared || 0,
      briefedN: partition.states.briefed || 0,
      acceptedN: partition.states.accepted || 0,
      releasedN: partition.states.released || 0,
      disputedN: partition.disputed,
      lapsedN: partition.lapsed,
      overdueN: partition.overdue,
      portfolioItems: partition.portfolioItems,
      crossLineN: sorted.reduce((sum, row) => sum + row.crossLineN, 0),
      scopeComplete: hiddenHandoverN === 0,
      invalidParticipantsN: sorted.filter((row) => row.missingPeopleN > 0).length,
      integrityDefectN,
      refusedCategoryN: refusedCategoryTotal,
      shortfallN: shortfallTotal,
      countsReconcile: claims.countsReconcile,
      figuresComplete: claims.figuresComplete && warnings.length === 0 && hiddenHandoverN === 0,
      markersN: markers.length,
    },
    states,
    categories,
    handovers: visibleHandovers,
    handoversShown: visibleHandovers.length,
    handoversCapped: sorted.length - visibleHandovers.length,
    acts: visibleActs,
    actsShown: visibleActs.length,
    actsCapped: visibleActRows.length - visibleActs.length,
    markers,
    attention,
    peopleOptions,
    method: MHH_METHOD,
    ...(includeAll ? { handoversAll: sorted, actsAll: visibleActRows } : {}),
  };
}

export function mgrHandoverAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildMgrHandover(state, { now, settings, seat }).attention;
}

/** CSV scope #167: aggregate-only, with small-cell and complementary suppression. */
export function mgrHandoverCsvRows(report) {
  if (!report?.totals) return [];
  const t = report.totals;
  const supported = t.countsReconcile === true;
  const summaryValues = [t.handoversDeclared, t.declaredN, t.briefedN, t.acceptedN, t.releasedN,
    t.disputedN, t.lapsedN, t.overdueN, t.portfolioItems, t.crossLineN];
  const stateValues = (report.states || []).map((row) => row.count);
  const categoryValues = (report.categories || []).map((row) => row.count);
  const allValues = [...summaryValues, ...stateValues, ...categoryValues];
  const incomplete = !supported || t.figuresComplete !== true;
  const smallCell = allValues.some((value) => Number.isInteger(value) && value > 0 && value < L.privacyFloor);
  const publish = !incomplete && !smallCell;
  const cell = (value) => publish && Number.isInteger(value) ? String(value) : '';
  const blankReason = [
    ...(incomplete ? ['scope_or_record_incomplete'] : []),
    ...(smallCell ? ['small_cell_suppressed'] : []),
  ].join(';');
  const asOf = report.nowIso?.slice(0, 10) || '';
  const rows = [{
    as_of: asOf, row_kind: 'summary', key: 'all',
    declared: cell(t.handoversDeclared), briefed: cell(t.briefedN), accepted: cell(t.acceptedN),
    released: cell(t.releasedN), disputed: cell(t.disputedN), lapsed: cell(t.lapsedN),
    overdue: cell(t.overdueN), portfolio_items: cell(t.portfolioItems),
    blank_reason: blankReason,
  }, {
    as_of: asOf, row_kind: 'coverage', key: 'claims',
    declared: cell(t.handoversDeclared), briefed: '', accepted: '', released: '', disputed: '',
    lapsed: '', overdue: '', portfolio_items: '', blank_reason: blankReason,
  }];
  for (const row of report.states || []) {
    rows.push({
      as_of: asOf, row_kind: 'state', key: row.key,
      declared: cell(row.count), briefed: row.key === 'briefed' ? cell(row.count) : '',
      accepted: row.key === 'accepted' ? cell(row.count) : '',
      released: row.key === 'released' ? cell(row.count) : '',
      disputed: row.key === 'disputed' ? cell(row.count) : '',
      lapsed: row.key === 'lapsed' ? cell(row.count) : '',
      overdue: '', portfolio_items: '', blank_reason: blankReason,
    });
  }
  for (const row of report.categories || []) {
    rows.push({
      as_of: asOf, row_kind: 'category', key: row.key,
      declared: cell(row.count), briefed: '', accepted: '', released: '', disputed: '',
      lapsed: '', overdue: '', portfolio_items: row.key === 'delegations' ? cell(row.count) : '',
      blank_reason: blankReason,
    });
  }
  return rows.map((row) => Object.fromEntries(MHH_CSV_COLUMNS.map((key) => [key, row[key] ?? ''])));
}
