/**
 * app/core/domain/matrixCoordination.js — Matrix Span Fragmentation &
 * Counterpart-Dyad Coordination Ledger (ADR-0161, Schema v130 unchanged).
 *
 * A reporting-tree span says how many people a manager has. In a matrix, it
 * does not say whether those people couple that manager to one stable partner or
 * to many unrelated partners. This reader derives that topology directly from
 * the SAME active matrix graph, allocation gate and operating-seat scope used by
 * the rest of LeadOS. It writes no total, score or inference back to storage.
 */

import { dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { activeSeat, buildSeats } from './seat.js';
import { buildMatrix, matrixAllocations, matrixLineScope } from './matrix.js';
import { MATRIX_FLOORS } from './matrixRegistry.js';
import {
  MATRIX_COORDINATION_BOUNDS,
  MATRIX_COORDINATION_CONVENTIONS,
  MATRIX_COORDINATION_ENGINE_VERSION,
  MATRIX_COORDINATION_LIMITS,
  MATRIX_COORDINATION_METHOD,
  MATRIX_COORDINATION_STATES,
  matrixCoordinationState,
} from './matrixCoordinationRegistry.js';

const stateRank = new Map(['refused', 'fragmented', 'multiple', 'concentrated', 'none']
  .map((key, index) => [key, index]));

function emptyManager(id, matrix) {
  const node = matrix.nodes.get(id);
  return {
    managerId: id,
    managerName: node?.name || id,
    people: new Set(),
    completePeople: new Set(),
    incompletePeople: new Set(),
    defects: [],
    counterparts: new Map(),
  };
}

function inSeatScope(state, matrix, now, settings) {
  const lineScope = matrixLineScope(matrix);
  const built = buildSeats(state, { now, settings, lineScope: lineScope.byManager });
  const seat = activeSeat(built);
  if (!seat || seat.fullAccess) {
    return {
      seat,
      visiblePerson: () => true,
      visibleManager: () => true,
      scopeLabel: 'the whole workspace',
    };
  }
  const people = new Set([...(seat.scope || []), ...(seat.lineScope || []), seat.id]);
  const namesAllowed = !seat.fullAccess && Number(seat.rank) < MATRIX_FLOORS.detailRank;
  return {
    seat,
    visiblePerson: (personId) => people.has(personId),
    // The acting line holder can always see their own counterparts; otherwise
    // manager identity follows the same bounded operating-seat disclosure wall.
    visibleManager: (managerId, ownManagerId = null) => namesAllowed
      && (managerId === seat.id || ownManagerId === seat.id || people.has(managerId)),
    scopeLabel: `${seat.label || seat.id}’s span and its declared lines`,
  };
}

function managerDisplay(entry, isVisible) {
  return isVisible
    ? { name: entry.managerName, withheld: false, withheldReason: '' }
    : {
      name: null,
      withheld: true,
      withheldReason: 'This management interface is outside the active seat’s name-detail boundary; its structural counts remain.',
    };
}

function rowState(entry) {
  if (entry.incompletePeople.size || entry.defects.length) return 'refused';
  const counterpartN = entry.counterparts.size;
  if (!counterpartN) return 'none';
  if (counterpartN >= MATRIX_COORDINATION_BOUNDS.fragmentedCounterpartFloor) return 'fragmented';
  if (counterpartN >= 2) return 'multiple';
  return 'concentrated';
}

function refusalReason(entry) {
  const parts = [];
  if (entry.incompletePeople.size) {
    parts.push(`${entry.incompletePeople.size} person(s) have an active multi-line allocation that does not fully declare every line`);
  }
  if (entry.defects.length) {
    parts.push(`${entry.defects.length} active line defect(s) cannot be wired into the matrix graph`);
  }
  return parts.length
    ? `${parts.join('; ')}. The counterpart total and dispersion are REFUSED rather than computed over the remaining people.`
    : '';
}

function rational(numerator, denominator) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) return null;
  return {
    numerator,
    denominator,
    display: numerator === denominator ? '1' : `${numerator} / ${denominator}`,
  };
}

/** A persisted declaration is live only in the same dated window as buildMatrix. */
function activeStoredLine(row, today) {
  return Boolean(row && row.fromISO && row.fromISO <= today && (!row.toISO || row.toISO >= today));
}

/**
 * `buildMatrix` quite properly refuses a malformed line before it enters the
 * wired graph. A topology reader must still see that refusal when the person
 * has (or claims) more than one active manager: otherwise a bad line would make
 * a person look less coordinated precisely by disappearing. We derive the
 * affected holders from the live primary relationship, active stored rows and
 * any canonical lines; nothing is repaired or selected here.
 *
 * A defect that names no active roster person cannot honestly be attached to a
 * manager span. It remains an explicit unresolved workspace defect and withholds
 * the aggregate rather than becoming a phantom person or a guessed owner.
 */
function activeCoordinationDefects(state, matrix, today, scope) {
  const rawRows = Array.isArray(state?.reportingLines) ? state.reportingLines : [];
  const rawById = new Map(rawRows.filter((row) => row?.id).map((row) => [row.id, row]));
  const activeRowsByPerson = new Map();
  for (const row of rawRows) {
    if (!activeStoredLine(row, today) || !row.personId) continue;
    const rows = activeRowsByPerson.get(row.personId) || [];
    rows.push(row);
    activeRowsByPerson.set(row.personId, rows);
  }

  const attached = [];
  const unresolved = [];
  for (const defect of matrix.defects || []) {
    if (!defect?.personId || !scope.visiblePerson(defect.personId)) continue;
    // Defects raised for a stored declaration outside its live window are
    // historical data-quality facts, not current matrix topology. A missing raw
    // row is itself unprovable, so it stays live and refuses rather than being
    // silently discarded.
    const stored = defect.lineId ? rawById.get(defect.lineId) : null;
    if (defect.lineId && stored && !activeStoredLine(stored, today)) continue;

    const person = matrix.roster?.get?.(defect.personId) || null;
    if (!person) {
      unresolved.push(defect);
      continue;
    }

    const managerIds = new Set();
    const homeManagerId = person.rawManagerId || LEADER_ID;
    if (homeManagerId) managerIds.add(homeManagerId);
    for (const row of activeRowsByPerson.get(defect.personId) || []) {
      if (row.managerId) managerIds.add(row.managerId);
    }
    for (const line of matrix.linesByPerson?.get?.(defect.personId) || []) {
      if (line?.active !== false && line.managerId) managerIds.add(line.managerId);
    }
    if (defect.managerId) managerIds.add(defect.managerId);

    // A bad declaration on a single relationship is not a coordination span.
    // The moment two manager relationships are live or claimed, every holder is
    // affected: showing a complete total for the home holder while refusing the
    // second holder would be the same partial-topology lie in two columns.
    if (managerIds.size < 2) continue;
    attached.push({ ...defect, managerIds: [...managerIds].sort() });
  }
  return { attached, unresolved };
}

/**
 * Build the seat-scoped coordination topology. The result has two granularities:
 * - a manager span: directed interfaces THIS manager must coordinate;
 * - a unique manager pair: a deduplicated undirected pair for the workspace
 *   topology. They are deliberately never summed as if they were the same unit.
 */
export function buildMatrixCoordination(state = {}, { now = new Date(), settings = null } = {}) {
  const at = now instanceof Date ? now : new Date(now || Date.now());
  const today = dayKey(at) || new Date().toISOString().slice(0, 10);
  const cfg = settings || state.settings || {};
  const matrix = buildMatrix(state, { now: at, settings: cfg });
  const scope = inSeatScope(state, matrix, at, cfg);
  const managers = new Map();
  const manager = (id) => {
    if (!managers.has(id)) managers.set(id, emptyManager(id, matrix));
    return managers.get(id);
  };

  const pairKeys = new Set();
  const directedEdges = new Set();
  const matrixPeople = new Set();
  const incompletePeople = new Set();
  const allocations = matrixAllocations(matrix)
    .filter((allocation) => allocation.multiLine && scope.visiblePerson(allocation.personId));

  for (const allocation of allocations) {
    matrixPeople.add(allocation.personId);
    const lines = allocation.lines || [];
    for (const line of lines) {
      const current = manager(line.managerId);
      current.people.add(allocation.personId);
      if (allocation.totalH === null) {
        current.incompletePeople.add(allocation.personId);
        incompletePeople.add(allocation.personId);
      } else {
        current.completePeople.add(allocation.personId);
      }
    }
    if (allocation.totalH === null) continue;

    for (const line of lines) {
      const current = manager(line.managerId);
      for (const counterpart of lines) {
        if (counterpart.managerId === line.managerId) continue;
        const peer = manager(counterpart.managerId);
        if (!current.counterparts.has(counterpart.managerId)) {
          current.counterparts.set(counterpart.managerId, {
            managerId: counterpart.managerId,
            managerName: peer.managerName,
            people: new Set(),
          });
        }
        current.counterparts.get(counterpart.managerId).people.add(allocation.personId);
        directedEdges.add(`${line.managerId}|${allocation.personId}|${counterpart.managerId}`);
        pairKeys.add([line.managerId, counterpart.managerId].sort().join('|'));
      }
    }
  }

  // A bad/missing active matrix declaration is not allowed to vanish simply
  // because buildMatrix correctly refused to wire it. Every holder of that
  // person’s live or claimed relationship refuses: a valid home holder cannot
  // publish a reassuring subtotal while the additional holder is refused.
  const defectReading = activeCoordinationDefects(state, matrix, today, scope);
  const relevantDefects = defectReading.attached;
  const unresolvedDefects = defectReading.unresolved;
  for (const defect of relevantDefects) {
    matrixPeople.add(defect.personId);
    incompletePeople.add(defect.personId);
    for (const managerId of defect.managerIds) {
      const current = manager(managerId);
      current.people.add(defect.personId);
      // A canonical line may already have looked complete before the refused
      // declaration was encountered. It is no longer a complete allocation.
      current.completePeople.delete(defect.personId);
      current.incompletePeople.add(defect.personId);
      current.defects.push(defect);
    }
  }

  const allRows = [...managers.values()].map((entry) => {
    const stateKey = rowState(entry);
    const meta = matrixCoordinationState(stateKey) || MATRIX_COORDINATION_STATES[0];
    const display = managerDisplay(entry, scope.visibleManager(entry.managerId));
    const counterpartRows = [...entry.counterparts.values()]
      .map((counterpart) => {
        const counterpartDisplay = managerDisplay(
          { managerName: counterpart.managerName },
          scope.visibleManager(counterpart.managerId, entry.managerId),
        );
        return {
          managerId: counterpart.managerId,
          managerName: counterpartDisplay.name,
          withheld: counterpartDisplay.withheld,
          withheldReason: counterpartDisplay.withheldReason,
          peopleN: counterpart.people.size,
        };
      })
      .sort((a, b) => b.peopleN - a.peopleN || String(a.managerName || a.managerId).localeCompare(String(b.managerName || b.managerId)));

    const counterpartAssignmentsN = counterpartRows.reduce((sum, row) => sum + row.peopleN, 0);
    const sumSquares = counterpartRows.reduce((sum, row) => sum + row.peopleN * row.peopleN, 0);
    const dispersion = stateKey === 'refused' || counterpartAssignmentsN === 0
      ? null
      : rational(counterpartAssignmentsN * counterpartAssignmentsN, sumSquares);

    return {
      managerId: entry.managerId,
      managerName: display.name,
      managerWithheld: display.withheld,
      managerWithheldReason: display.withheldReason,
      peopleN: entry.people.size,
      completePeopleN: entry.completePeople.size,
      incompletePeopleN: entry.incompletePeople.size,
      invalidLineN: entry.defects.length,
      counterpartManagerN: stateKey === 'refused' ? null : counterpartRows.length,
      directedPersonInterfaceN: stateKey === 'refused' ? null : counterpartAssignmentsN,
      dispersion,
      state: stateKey,
      stateLabel: meta.label,
      stateTone: meta.tone,
      reason: stateKey === 'refused'
        ? refusalReason(entry)
        : meta.detail,
      counterparts: counterpartRows.slice(0, MATRIX_COORDINATION_LIMITS.counterpartsPerRow),
      counterpartsOmittedN: Math.max(0, counterpartRows.length - MATRIX_COORDINATION_LIMITS.counterpartsPerRow),
    };
  }).sort((a, b) => stateRank.get(a.state) - stateRank.get(b.state)
    || (b.counterpartManagerN || 0) - (a.counterpartManagerN || 0)
    || (b.peopleN - a.peopleN)
    || String(a.managerName || a.managerId).localeCompare(String(b.managerName || b.managerId)));

  const countOf = (stateKey) => allRows.filter((row) => row.state === stateKey).length;
  const refusedN = countOf('refused');
  const activeDefectN = relevantDefects.length + unresolvedDefects.length;
  const topologyComplete = refusedN === 0 && activeDefectN === 0;
  const measuredRows = allRows.filter((row) => row.state !== 'refused');
  const measuredDirectedN = measuredRows.reduce((sum, row) => sum + (row.directedPersonInterfaceN || 0), 0);
  const measuredCounterpartN = measuredRows.reduce((sum, row) => sum + (row.counterpartManagerN || 0), 0);
  const statesReconcile = MATRIX_COORDINATION_STATES
    .reduce((sum, meta) => sum + countOf(meta.key), 0) === allRows.length;
  const directedReconcile = topologyComplete
    ? measuredDirectedN === directedEdges.size
    : null;

  const topologyWithheldReason = topologyComplete
    ? ''
    : `${refusedN} manager span(s) are incomplete (${incompletePeople.size} affected person(s), ${relevantDefects.length} active invalid line(s) attached to a matrix span)${unresolvedDefects.length ? `; ${unresolvedDefects.length} active line defect(s) cannot be joined to an active roster person` : ''}. Workspace topology totals are withheld rather than calculated over the remainder.`;

  const board = {
    managerSpansN: allRows.length,
    matrixPeopleN: matrixPeople.size,
    measuredSpansN: measuredRows.length,
    fragmentedSpansN: countOf('fragmented'),
    multipleSpansN: countOf('multiple'),
    concentratedSpansN: countOf('concentrated'),
    noCounterpartSpansN: countOf('none'),
    refusedSpansN: refusedN,
    incompletePeopleN: incompletePeople.size,
    invalidLineN: activeDefectN,
    unresolvedLineDefectN: unresolvedDefects.length,
    // These are withheld if any manager span is incomplete OR an active line
    // cannot be connected to a real person. The measured-only subtotals remain
    // separately named so partial arithmetic cannot masquerade as workspace
    // topology.
    directedPersonInterfaceN: topologyComplete ? measuredDirectedN : null,
    uniqueManagerPairN: topologyComplete ? pairKeys.size : null,
    counterpartManagerN: topologyComplete ? measuredCounterpartN : null,
    measuredDirectedPersonInterfaceN: measuredDirectedN,
    measuredCounterpartManagerN: measuredCounterpartN,
    fragmentationCounterpartFloor: MATRIX_COORDINATION_BOUNDS.fragmentedCounterpartFloor,
    statesReconcile,
    directedReconcile,
    topologyComplete,
    topologyWithheldReason,
    rowsOmittedN: Math.max(0, allRows.length - MATRIX_COORDINATION_LIMITS.rows),
  };

  const seat = scope.seat
    ? { id: scope.seat.id, label: scope.seat.label || scope.seat.id, rank: scope.seat.rank ?? null, fullAccess: Boolean(scope.seat.fullAccess) }
    : { id: null, label: 'No operating seat', rank: null, fullAccess: false };

  return {
    engineVersion: MATRIX_COORDINATION_ENGINE_VERSION,
    generatedOn: today,
    isMatrix: matrixPeople.size > 0 || relevantDefects.length > 0 || unresolvedDefects.length > 0,
    seat,
    scopeLabel: scope.scopeLabel,
    board,
    rows: allRows.slice(0, MATRIX_COORDINATION_LIMITS.rows),
    allRows,
    states: MATRIX_COORDINATION_STATES,
    conventions: MATRIX_COORDINATION_CONVENTIONS,
    method: MATRIX_COORDINATION_METHOD,
    limits: MATRIX_COORDINATION_LIMITS,
    singleChainNote: matrixPeople.size || relevantDefects.length || unresolvedDefects.length
      ? null
      : 'No person in this seat’s scope holds an active additional reporting line, so there is no cross-line management interface to count. A single-chain workspace gains no row, no topology total and no refusal.',
  };
}

/** Identity-free upward brief: structural counts only, never manager names. */
export function matrixCoordinationBriefText(report) {
  if (!report) return '';
  const board = report.board || {};
  const lines = [`Matrix coordination topology — ${report.scopeLabel} on ${report.generatedOn}.`];
  if (!report.isMatrix) {
    lines.push(report.singleChainNote || 'No active matrix interface is in scope.');
    return lines.join(' ');
  }
  lines.push(`${board.managerSpansN} manager span(s) reach ${board.matrixPeopleN} person(s) on active matrix lines: ${board.fragmentedSpansN} meet the declared fragmentation triage floor of ${board.fragmentationCounterpartFloor} counterparts, ${board.multipleSpansN} reach two counterparts and ${board.concentratedSpansN} reach one.`);
  if (!board.topologyComplete) {
    lines.push(`Workspace topology is REFUSED: ${board.topologyWithheldReason}`);
  } else {
    lines.push(`${board.directedPersonInterfaceN} directed person-interface exposure(s) reconcile to the manager spans, across ${board.uniqueManagerPairN} unique unordered manager pair(s).`);
  }
  lines.push(`State counts reconcile: ${board.statesReconcile ? 'verified' : 'NOT verified'}. Directed interface identity: ${board.directedReconcile === null ? 'withheld with incomplete spans' : board.directedReconcile ? 'verified' : 'NOT verified'}. This is declared relationship topology, not hours, performance, latency or a recommendation to redraw the organisation.`);
  return lines.join(' ');
}

/** Aggregate CSV: workspace total plus one identity-free row per state. */
export function matrixCoordinationCsvRows(report) {
  if (!report) return [];
  const board = report.board || {};
  const workspace = {
    scope: 'workspace',
    state: board.topologyComplete ? 'measured' : 'refused',
    manager_spans_n: board.managerSpansN ?? 0,
    matrix_people_n: board.matrixPeopleN ?? 0,
    measured_spans_n: board.measuredSpansN ?? 0,
    fragmented_spans_n: board.fragmentedSpansN ?? 0,
    multiple_spans_n: board.multipleSpansN ?? 0,
    concentrated_spans_n: board.concentratedSpansN ?? 0,
    no_counterpart_spans_n: board.noCounterpartSpansN ?? 0,
    refused_spans_n: board.refusedSpansN ?? 0,
    incomplete_people_n: board.incompletePeopleN ?? 0,
    invalid_line_n: board.invalidLineN ?? 0,
    directed_person_interface_n: board.topologyComplete ? board.directedPersonInterfaceN : '',
    unique_manager_pair_n: board.topologyComplete ? board.uniqueManagerPairN : '',
    counterpart_manager_n: board.topologyComplete ? board.counterpartManagerN : '',
    fragmentation_counterpart_floor: board.fragmentationCounterpartFloor ?? '',
    states_reconcile: board.statesReconcile ? 'yes' : 'no',
    topology_complete: board.topologyComplete ? 'yes' : 'no',
    withheld_reason: board.topologyComplete ? '' : (board.topologyWithheldReason || 'Workspace topology is incomplete.'),
  };
  const rows = [workspace];
  for (const state of MATRIX_COORDINATION_STATES) {
    const group = (report.allRows || []).filter((row) => row.state === state.key);
    if (!group.length) continue;
    const measurable = state.key !== 'refused';
    const directed = measurable ? group.reduce((sum, row) => sum + (row.directedPersonInterfaceN || 0), 0) : null;
    const counterparts = measurable ? group.reduce((sum, row) => sum + (row.counterpartManagerN || 0), 0) : null;
    rows.push({
      scope: 'state',
      state: state.key,
      manager_spans_n: group.length,
      matrix_people_n: '',
      measured_spans_n: measurable ? group.length : 0,
      fragmented_spans_n: state.key === 'fragmented' ? group.length : 0,
      multiple_spans_n: state.key === 'multiple' ? group.length : 0,
      concentrated_spans_n: state.key === 'concentrated' ? group.length : 0,
      no_counterpart_spans_n: state.key === 'none' ? group.length : 0,
      refused_spans_n: state.key === 'refused' ? group.length : 0,
      incomplete_people_n: state.key === 'refused' ? group.reduce((sum, row) => sum + row.incompletePeopleN, 0) : 0,
      invalid_line_n: state.key === 'refused' ? group.reduce((sum, row) => sum + row.invalidLineN, 0) : 0,
      directed_person_interface_n: directed === null ? '' : directed,
      unique_manager_pair_n: '',
      counterpart_manager_n: counterparts === null ? '' : counterparts,
      fragmentation_counterpart_floor: board.fragmentationCounterpartFloor ?? '',
      states_reconcile: '',
      topology_complete: state.key === 'refused' ? 'no' : '',
      withheld_reason: state.key === 'refused'
        ? 'At least one span contains an undeclared or invalid active allocation; this state’s topology metrics are BLANK rather than partial.'
        : '',
    });
  }
  return rows;
}
