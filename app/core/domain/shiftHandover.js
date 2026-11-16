/**
 * app/core/domain/shiftHandover.js — the pure reader of the Shift Handover &
 * Two-Key Readback Ledger (ADR-0223, Schema v178, `#/shift-handover`).
 *
 * ONE READER. Every state, figure, count, escalation and attention number the
 * screen prints is computed here from the stored briefs, the stored readback
 * acts, the people and the live matrix. Nothing derived is stored; a
 * hand-edited file cannot carry a "contained" a hand never produced.
 *
 * WHAT IS KEPT APART, ALWAYS:
 *
 *   1. THE TWO KEYS. A brief is the outgoing operator's key. A readback act is
 *      the incoming operator's. Only the declared incoming operator's act
 *      turns it; silence, a clock event and the outgoing operator's own
 *      confirmation never do.
 *   2. STATE AND OVERDUE. `state` says WHERE the handover stands;
 *      `overdue` says WHETHER the owed readback is late. An uncontained
 *      handover is overdue from the instant its due time passes — no grace,
 *      no rounding.
 *   3. "THE ROWS ADD UP" AND "THE FIGURES ARE COMPLETE" (`countsReconcile` vs
 *      `figuresComplete`) are different claims and are reported separately.
 *   4. ONE HANDOVER, ONCE. The handover is counted once, for the pair of
 *      operators who stood at the boundary — never per line, never per
 *      manager. An escalation goes to the seat above EVERY line of both
 *      operators, never to one peer line over another.
 *   5. CONTEXT, NOT SCORING. Handover counts per person are never printed,
 *      exported or ranked. The register is an operations control, not a
 *      performance instrument.
 */

import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { canSee } from './seat.js';
import { dayKey } from '../time.js';
import {
  normalizeShiftHandovers,
  normalizeShiftHandoverReadbacks,
  normalizeShoMarkers,
} from './shiftHandoverSchema.js';
import {
  SHO_ADR,
  SHO_CSV_COLUMNS,
  SHO_ENGINE_VERSION,
  SHO_LIMITS as L,
  SHO_METHOD,
  SHO_SEVERITIES,
  SHO_SEVERITY_KEYS,
  SHO_STATE_KEYS,
  SHO_STATES,
} from './shiftHandoverRegistry.js';
import { partitionByState, shoClaims } from './shiftHandoverMath.js';

export const SHO_BRIEF_COLLECTION = 'shiftHandovers';
export const SHO_READBACK_COLLECTION = 'shiftHandoverReadbacks';

/** The actor a seat acts as. */
export function shiftHandoverActorId(seat) {
  if (!seat) return null;
  return seat.fullAccess ? 'leader' : (seat.nodeId || seat.id || null);
}

/** The matrix, built with no active seat so the reader never depends on who is looking. */
export function shiftHandoverMatrix(state, now, settings) {
  return buildMatrix(state, { now, settings: { ...(settings || {}), activeSeatId: null } });
}

const nameOf = (matrix, id) => {
  if (!id) return null;
  const node = matrix?.nodes?.get(id);
  return (node && node.name) || id;
};

/** Active manager ids of one person, per the live matrix. Null when the graph is unreadable. */
function managerIdsOf(matrix, personId) {
  const lines = matrix?.linesByPerson?.get?.(personId) || [];
  return [...new Set(lines.filter((line) => line?.active !== false).map((line) => line?.managerId).filter(Boolean))].sort();
}

/** The derived reading of one brief. */
export function readShoBrief(brief, actsForBrief) {
  const acts = (Array.isArray(actsForBrief) ? actsForBrief : []).slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const latest = acts.at(-1) || null;
  let state;
  if (brief.cancelledOn) state = 'cancelled';
  else if (latest?.kind === 'synthesized') state = 'contained';
  else if (latest?.kind === 'disputed') state = 'disputed';
  else state = 'awaiting-readback';
  return { acts, latest, state };
}

/**
 * The whole ledger. Pure: every figure is re-derived on each call.
 */
export function buildShiftHandover(state, { now = new Date(), settings = null, seat = null } = {}) {
  const warnings = [];
  const at = now instanceof Date ? now : new Date(now);
  const nowIso = at.toISOString();
  const asOf = dayKey(at) || L.dayMin;
  const briefs = normalizeShiftHandovers(state?.shiftHandovers, warnings);
  const readbacks = normalizeShiftHandoverReadbacks(state?.shiftHandoverReadbacks, warnings);
  const markers = normalizeShoMarkers(state?.shiftHandoverMarkers, warnings);
  const people = new Map((Array.isArray(state?.people) ? state.people : [])
    .filter((row) => row && typeof row.id === 'string')
    .map((row) => [row.id, row]));

  let matrix = null;
  let matrixError = null;
  try {
    matrix = shiftHandoverMatrix(state, at, settings || state?.settings || null);
  } catch (error) {
    matrixError = `The reporting graph could not be read, so cross-line status and escalation cannot be computed: ${error?.message || 'unknown error'}.`;
  }

  const knownBriefIds = new Set(briefs.map((row) => row.id));
  const readbacksReferenced = readbacks.filter((act) => knownBriefIds.has(act.handoverId)).length;
  const actsByBrief = new Map();
  for (const act of readbacks) {
    if (!knownBriefIds.has(act.handoverId)) continue; // counted, never dropped silently: readbacksReferenced < readbacksTotal
    if (!actsByBrief.has(act.handoverId)) actsByBrief.set(act.handoverId, []);
    actsByBrief.get(act.handoverId).push(act);
  }

  const rank = seat ? (seat.rank ?? 99) : 99;
  const fullAccess = Boolean(seat?.fullAccess);
  const redact = !fullAccess && rank >= 4;
  const nameFor = (id) => (redact ? null : nameOf(matrix, id));

  /* ---------------------------------------------------------- brief rows */
  const briefRows = briefs.map((brief) => {
    const { acts, latest, state: stateKey } = readShoBrief(brief, actsByBrief.get(brief.id));
    const overdue = stateKey !== 'contained' && stateKey !== 'cancelled' && Date.parse(brief.dueAt) < at.getTime();
    const outgoingManagers = matrix ? managerIdsOf(matrix, brief.outgoingId) : [];
    const incomingManagers = matrix ? managerIdsOf(matrix, brief.incomingId) : [];
    const unionManagers = [...new Set([...outgoingManagers, ...incomingManagers])].sort();
    const rawApex = matrix && unionManagers.length ? matrixJointApex(matrix, unionManagers) : { apexIds: [], apexId: null, unique: false, ambiguous: unionManagers.length > 1, disconnected: true };
    // The synthetic workspace leader ('leader') is a graph node, not a roster
    // seat: a joint apex that resolves ONLY to the leader is reported as
    // disconnected — nobody can be asked. The rule agrees, and so does the panel.
    const apexIdsReal = (rawApex.apexIds || []).filter((id) => id !== LEADER_ID);
    const leaderOnly = Boolean(rawApex.apexId === LEADER_ID) || ((rawApex.apexIds || []).length > 0 && apexIdsReal.length === 0);
    const apex = leaderOnly
      ? { apexId: null, apexIds: [], unique: false, ambiguous: false, disconnected: true }
      : { ...rawApex, apexIds: apexIdsReal };
    const crossLine = matrix ? [...new Set(outgoingManagers)].join(',') !== [...new Set(incomingManagers)].join(',') : null;
    const unownedActionsN = brief.openActions.filter((action) => !action.ownerId).length;
    return {
      ...brief,
      state: stateKey,
      overdue,
      actsN: acts.length,
      latestActKind: latest?.kind || null,
      latestActAt: latest?.at || null,
      unownedActionsN,
      crossLine,
      outgoingManagers,
      incomingManagers,
      escalation: {
        apexId: apex.apexId || null,
        apexIds: [...(apex.apexIds || [])],
        unique: Boolean(apex.unique),
        ambiguous: Boolean(apex.ambiguous) && !apex.unique,
        disconnected: Boolean(apex.disconnected) || (matrix ? unionManagers.length === 0 : false),
        apexName: redact ? null : nameOf(matrix, apex.apexId || null),
        apexNames: redact ? [] : [...(apex.apexIds || [])].map((id) => nameOf(matrix, id)),
      },
      outgoingName: nameFor(brief.outgoingId),
      incomingName: nameFor(brief.incomingId),
      outgoingOnRoster: people.has(brief.outgoingId) && people.get(brief.outgoingId).status !== 'archived',
      incomingOnRoster: people.has(brief.incomingId) && people.get(brief.incomingId).status !== 'archived',
      openActions: brief.openActions.map((action) => ({
        ...action,
        ownerName: action.ownerId ? (redact ? null : nameOf(matrix, action.ownerId)) : null,
      })),
    };
  });

  const stateWeight = { 'awaiting-readback': 0, disputed: 0, contained: 1, cancelled: 2 };
  const briefsUrgent = briefRows.slice().sort((a, b) => {
    const w = stateWeight[a.state] - stateWeight[b.state];
    if (w !== 0) return w;
    return a.dueAt < b.dueAt ? -1 : a.dueAt > b.dueAt ? 1 : a.id < b.id ? -1 : 1;
  });

  /* --------------------------------------------------------------- claims */
  const perState = partitionByState(briefRows);
  const perSeverity = Object.fromEntries(SHO_SEVERITY_KEYS.map((key) => [key, briefRows.filter((row) => row.severity === key).length]));
  const perSeverityTotal = Object.values(perSeverity).reduce((sum, n) => sum + n, 0);
  const claims = shoClaims({
    briefsTotal: briefRows.length,
    perState,
    perSeverity,
    perSeverityTotal,
    readbacksReferenced,
    readbacksTotal: readbacks.length,
  });

  /* ------------------------------------------------------------ attention */
  const actorId = shiftHandoverActorId(seat);
  const ladderKnown = Boolean(seat && (fullAccess || rank >= 3));
  const isApexFor = (row) => Boolean(actorId) && (
    (row.escalation.unique && row.escalation.apexId === actorId)
    || (row.escalation.ambiguous && row.escalation.apexIds.includes(actorId))
  );
  const owedToMe = actorId ? briefRows.filter((row) => row.incomingId === actorId
    && (row.state === 'awaiting-readback' || row.state === 'disputed')).length : 0;
  const apexOwed = ladderKnown && actorId
    ? briefRows.filter((row) => row.overdue && isApexFor(row)).length
    : 0;
  const attention = owedToMe + apexOwed;
  const attentionReason = attention
    ? 'Readbacks owed by this seat as the declared incoming operator, plus overdue uncontained handovers it holds the joint seat above.'
    : '';

  const unownedActionsN = briefRows
    .filter((row) => row.state !== 'contained' && row.state !== 'cancelled')
    .reduce((sum, row) => sum + row.unownedActionsN, 0);
  const crossLineN = matrix ? briefRows.filter((row) => row.crossLine === true && row.state !== 'cancelled').length : null;
  const emergencyUncontainedN = perState.emergencyUncontained;

  const byState = Object.fromEntries(SHO_STATE_KEYS.map((key) => [key, briefRows.filter((row) => row.state === key).length]));
  const states = SHO_STATES.map((row) => ({ ...row, count: byState[row.key] || 0 }));
  const severities = SHO_SEVERITIES.map((row) => ({ ...row, count: perSeverity[row.key] || 0 }));

  const visibleBriefs = briefsUrgent.slice(0, L.briefsShown);
  const visibleReadbacks = readbacks
    .slice()
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, L.readbacksShown)
    .map((act) => ({
      ...act,
      synthesis: act.synthesis,
      disputeReason: act.disputeReason,
      actorName: redact ? null : nameOf(matrix, act.actorId),
      stationRef: briefs.find((row) => row.id === act.handoverId)?.stationRef || null,
    }));

  return {
    engineVersion: SHO_ENGINE_VERSION,
    adr: SHO_ADR,
    asOf,
    nowIso,
    seat: seat ? { label: seat.label || seat.id || 'operator', rank: seat.rank ?? null, fullAccess, actorId } : null,
    matrixError,
    warnings,
    totals: {
      briefsDeclared: briefRows.length,
      briefsLive: briefRows.filter((row) => row.state !== 'cancelled').length,
      containedN: perState.contained,
      disputedN: perState.disputed,
      awaitingN: perState.awaiting,
      cancelledN: perState.cancelled,
      overdueN: perState.overdue,
      emergencyUncontainedN,
      unownedActionsN,
      crossLineN,
      readbacksN: readbacks.length,
      readbacksReferenced,
      countsReconcile: claims.countsReconcile,
      figuresComplete: claims.figuresComplete,
      markersN: markers.length,
      ladderKnown,
      owedToMe,
      apexOwed,
    },
    states,
    severities,
    briefs: visibleBriefs,
    // Uncapped urgent-order list for the rule and the tests. Never rendered:
    // a screen that printed every brief ever written would punish honest logging.
    briefsAll: briefsUrgent,
    briefsShown: visibleBriefs.length,
    briefsCapped: briefRows.length - visibleBriefs.length,
    readbacks: visibleReadbacks,
    readbacksShown: visibleReadbacks.length,
    markers,
    attention,
    attentionReason,
    method: SHO_METHOD,
  };
}

/** The attention figure on the navigation badge — the same number the panel prints. */
export function shiftHandoverAttentionCount(state, { now = new Date(), settings = null, seat = null } = {}) {
  return buildShiftHandover(state, { now, settings, seat }).attention;
}

/**
 * CSV scope #165. Built from the SAME reader the panel renders, with no seat.
 * Every figure is an exact integer over the whole record. A figure the reader
 * could not compute exports BLANK with its reason, never a zero.
 */
export function shiftHandoverCsvRows(report) {
  if (!report || !report.totals) return [];
  const asOf = report.asOf;
  const t = report.totals;
  const rows = [];
  rows.push({
    as_of: asOf, row_kind: 'summary', key: 'all',
    severity: '', state: '',
    declared: String(t.briefsDeclared),
    contained: String(t.containedN),
    disputed: String(t.disputedN),
    awaiting: String(t.awaitingN),
    overdue: String(t.overdueN),
    unowned_actions: String(t.unownedActionsN),
    blank_reason: '',
  });
  rows.push({
    as_of: asOf, row_kind: 'coverage', key: 'figures',
    severity: '', state: '',
    declared: String(t.briefsDeclared),
    contained: '', disputed: '', awaiting: '',
    overdue: String(t.overdueN),
    unowned_actions: String(t.unownedActionsN),
    blank_reason: t.figuresComplete ? '' : 'uncontained_handovers_overdue',
  });
  for (const row of report.severities) {
    rows.push({
      as_of: asOf, row_kind: 'severity', key: row.key,
      severity: row.key, state: '',
      declared: String(row.count),
      contained: '', disputed: '', awaiting: '',
      overdue: '', unowned_actions: '',
      blank_reason: '',
    });
  }
  for (const row of report.states) {
    rows.push({
      as_of: asOf, row_kind: 'state', key: row.key,
      severity: '', state: row.key,
      declared: '', contained: row.key === 'contained' ? String(row.count) : '',
      disputed: row.key === 'disputed' ? String(row.count) : '',
      awaiting: row.key === 'awaiting-readback' ? String(row.count) : '',
      overdue: '', unowned_actions: '',
      blank_reason: '',
    });
  }
  return rows.map((row) => Object.fromEntries(SHO_CSV_COLUMNS.map((key) => [key, row[key] ?? ''])));
}

/** The canSee grant for one brief row — used by the view to decide detail, not to hide counts. */
export function shiftHandoverBriefGrant(seat, brief) {
  if (!seat) return 'denied';
  if (seat.fullAccess) return 'full';
  return canSee({ id: brief.id, personId: brief.outgoingId || null }, SHO_BRIEF_COLLECTION, seat, null).allow;
}
