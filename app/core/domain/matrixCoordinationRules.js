/**
 * app/core/domain/matrixCoordinationRules.js — RULE-MCO-01, the shared-spine
 * trace for the Matrix Span Fragmentation & Counterpart-Dyad Coordination
 * Ledger (ADR-0161).
 *
 * The topology itself is a pure read. This rule is deliberately narrow: when a
 * reporting-line fact changes (or a human requests an explicit scan), it records
 * ONE idempotent, identity-free propagation trace if the new topology contains
 * a fragmented or incomplete span. It does not create a case, retune a share,
 * choose a counterpart, or recommend a reorganisation. The trace is the bridge
 * from a structural matrix fact to the same append-only automation ledger and
 * hierarchy event spine every other governed signal uses.
 */

import { dayKey } from '../time.js';
import { normalizeMatrixSettings } from './matrixSchema.js';
import { MATRIX_EVENTS } from './matrixActions.js';
import { MATRIX_SCAN_EVENT } from './matrixRules.js';
import { buildMatrixCoordination } from './matrixCoordination.js';
import {
  MATRIX_COORDINATION_LIMITS,
  MATRIX_COORDINATION_RULE_ID,
  MATRIX_COORDINATION_SCAN_EVENT,
} from './matrixCoordinationRegistry.js';

const TRIGGERS = new Set([
  MATRIX_EVENTS.DECLARE,
  MATRIX_EVENTS.RETUNE,
  MATRIX_EVENTS.END,
  MATRIX_EVENTS.CONVENTIONS,
  MATRIX_SCAN_EVENT,
  MATRIX_COORDINATION_SCAN_EVENT,
]);

function markerKey(now, board) {
  return [
    'coordination',
    dayKey(now),
    board.matrixPeopleN,
    board.fragmentedSpansN,
    board.refusedSpansN,
    board.invalidLineN,
    board.unresolvedLineDefectN || 0,
  ].join('|');
}

function recordMarker(draft, now, key, detail) {
  if (!Array.isArray(draft.matrixMarkers)) draft.matrixMarkers = [];
  if (draft.matrixMarkers.some((row) => row && row.key === key)) return false;
  draft.matrixMarkers.push({
    key,
    at: now.toISOString(),
    ruleId: MATRIX_COORDINATION_RULE_ID,
    kind: 'coordination-topology',
    detail: String(detail || '').slice(0, 300),
  });
  if (draft.matrixMarkers.length > MATRIX_COORDINATION_LIMITS.markers) {
    draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_COORDINATION_LIMITS.markers);
  }
  return true;
}

export function matrixCoordinationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || !TRIGGERS.has(event.type)) return [];
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const explicitScan = event.type === MATRIX_COORDINATION_SCAN_EVENT || event.type === MATRIX_SCAN_EVENT;
  const conventions = normalizeMatrixSettings(draft.settings || {});
  if (!conventions.matrixAutoPropagate && !explicitScan) return [];

  // A rule must not use the acting manager's scoped panel as its data source:
  // the trace is a workspace-level structural fact, while the panel remains
  // seat-scoped. The operator context is explicitly full-access, not guessed.
  const report = buildMatrixCoordination({
    ...draft,
    settings: { ...(draft.settings || {}), activeSeatId: null },
  }, {
    now,
    settings: { ...(draft.settings || {}), activeSeatId: null },
  });
  const board = report.board;
  if (!report.isMatrix || (!board.fragmentedSpansN && board.topologyComplete)) return [];

  const key = markerKey(now, board);
  const detail = !board.topologyComplete
    ? `Matrix coordination topology refused ${board.refusedSpansN} incomplete manager span(s)${board.invalidLineN ? `; ${board.invalidLineN} active line defect(s) also withhold the workspace topology total` : ''}; ${board.fragmentedSpansN} measured span(s) reach the declared fragmentation floor.`
    : `Matrix coordination topology found ${board.fragmentedSpansN} fragmented manager span(s) reaching the declared fragmentation floor of ${board.fragmentationCounterpartFloor} counterparts.`;
  if (!recordMarker(draft, now, key, detail)) return [];

  const effect = {
    ruleId: MATRIX_COORDINATION_RULE_ID,
    action: !board.topologyComplete ? 'refused-topology' : 'observed-fragmentation',
    targetType: 'workspace',
    targetId: 'matrix',
    summary: detail,
  };
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'matrixcoordination',
      entityId: 'matrix',
      summary: `[${MATRIX_COORDINATION_RULE_ID}] ${detail}`.slice(0, 300),
    });
  }
  return [effect];
}
