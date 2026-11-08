/**
 * app/core/domain/matrixRules.js — post-commit propagation for the Matrix
 * Accountability Ledger (`#/matrix`, Schema v119, ADR-0140).
 *
 * Registered on `DEFAULT_POST_COMMIT_RULES` BEFORE `seatRule`, so the edges it
 * writes are already in the graph by the time the Operating Seat fans the same
 * transaction's work up the primary chain, and `sealRule` attests all of it in
 * one seal.
 *
 * RULE-MTX-01  MATRIX FAN-OUT.
 *
 *   Work touching a person who is accountable to more than one manager reaches
 *   EVERY manager in that person's reporting set — not whichever one the primary
 *   tree happens to name first.
 *
 *   This is the one thing a tree cannot do and the whole reason the ledger
 *   exists. `responsibleNodeId` resolves ownership by lowest common ancestor
 *   over `person.managerId`; that answer is unique because a tree has exactly
 *   one path to the root. Add a second line and the same question has two
 *   defensible answers. Picking one silently is a decision the engine is not
 *   entitled to make, so this rule writes an edge to both and the ledger prints
 *   the ambiguity as a finding instead of resolving it.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never edits a reporting line, a roster record or an allocation. The
 *    split is an agreement between two managers and the person; an engine that
 *    adjusted it would be inventing that agreement.
 *  - A SENSITIVE source (a confidential people record) contributes a count and
 *    never an edge. Routing a confidential record into a second manager's graph
 *    is a disclosure failure, exactly as RULE-CAD-01 and RULE-SEAT-01 already
 *    hold.
 *  - It never names a person in an edge summary above what the target manager
 *    could already see: the summary states the line kind and nothing else.
 *  - It is INERT when no additional line is declared: a single-chain workspace
 *    gains no edges and no decisions, and every existing roll-up is untouched.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { harvestWork } from './chain.js';
import { buildMatrix } from './matrix.js';
import { normalizeMatrixSettings } from './matrixSchema.js';
import { MATRIX_LIMITS, MATRIX_RULE_IDS, matrixLineKind } from './matrixRegistry.js';

export const MATRIX_SCAN_EVENT = 'matrix.scan';

const MATRIX_TRIGGER_SET = new Set([
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'matrix.conventions.set',
  MATRIX_SCAN_EVENT,
]);

function clampStr(v, max = 280) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, ruleId, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clean}`.slice(0, 300),
    });
  }
}

function linkOnce(draft, ctx, sourceType, sourceId, targetType, targetId, relation, ruleId, summary) {
  const result = ensureEntityLink(
    draft,
    { sourceType, sourceId, targetType, targetId, relation, ruleId, summary: clampStr(summary, 280) },
    { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() },
  );
  return Boolean(result && result.created);
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.matrixMarkers)) draft.matrixMarkers = [];
  if (draft.matrixMarkers.some((m) => m && m.key === key)) return false;
  draft.matrixMarkers.push({
    key,
    at: ctx.now.toISOString(),
    ruleId: MATRIX_RULE_IDS.FANOUT,
    kind,
    detail: clampStr(summary, 300),
  });
  if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) {
    draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
  }
  return true;
}

export function matrixRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!MATRIX_TRIGGER_SET.has(event.type)) return [];

  const conv = normalizeMatrixSettings(draft.settings || {});
  const isExplicitScan = event.type === MATRIX_SCAN_EVENT;
  if (!conv.matrixAutoPropagate && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const out = [];

  // Nothing declared, nothing to say. A single-chain workspace gains no edges:
  // the primary tree already handles it and RULE-SEAT-01 already fans it.
  const declared = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declared.length && !isExplicitScan) return [];

  // Build against the full workspace, not the acting seat's view: a second
  // manager is entitled to the work whether or not they are the one holding the
  // keyboard when the line is declared.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  const items = harvestWork(fullStateView, matrix.chain, { now, settings: fullStateView.settings });

  // personId → the additional managers the primary tree does not already reach.
  const extraManagers = new Map();
  for (const personId of matrix.roster.keys()) {
    const lines = matrix.linesByPerson.get(personId) || [];
    const active = lines.filter((l) => l.active !== false);
    if (active.length < 2) continue;
    const managers = [...new Set(active.map((l) => l.managerId))];
    extraManagers.set(personId, managers);
  }
  if (!extraManagers.size) return out;

  let edgesWritten = 0;
  let skippedByCap = 0;
  let sensitiveSkipped = 0;
  let ambiguousPeople = new Set();

  for (const item of items) {
    if (edgesWritten >= MATRIX_LIMITS.fanoutEdges) { skippedByCap += 1; continue; }
    const touched = (item.people || []).filter((id) => extraManagers.has(id));
    if (!touched.length) continue;
    if (item.sensitive) { sensitiveSkipped += 1; continue; }
    const sourceType = item.type === 'case' ? 'case' : item.type;
    for (const personId of touched) {
      ambiguousPeople.add(personId);
      for (const managerId of extraManagers.get(personId)) {
        if (edgesWritten >= MATRIX_LIMITS.fanoutEdges) { skippedByCap += 1; continue; }
        const line = (matrix.linesByPerson.get(personId) || []).find((l) => l.managerId === managerId);
        const kindLabel = matrixLineKind(line?.kind)?.label || 'reporting';
        if (linkOnce(
          draft, hookCtx,
          sourceType, item.entityId,
          'person', managerId,
          'rolls-up-to',
          MATRIX_RULE_IDS.FANOUT,
          `This ${item.typeLabel || item.type} touches someone on more than one line; it rolls up through the ${kindLabel} line as well as the home line.`,
        )) {
          edgesWritten += 1;
        }
      }
    }
  }

  if (edgesWritten) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'rolled-up', 'workspace', 'matrix',
      `Fanned ${edgesWritten} work item(s) to every manager in the reporting set of ${ambiguousPeople.size} person(s) on more than one line.`);
  }
  if (sensitiveSkipped) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'withheld', 'workspace', 'matrix',
      `${sensitiveSkipped} confidential item(s) contributed a count and no edge: a second manager is not a wider audience for a sensitive record.`);
  }
  if (skippedByCap) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'deferred', 'workspace', 'matrix',
      `${skippedByCap} further item(s) were not fanned this pass — the declared per-transaction cap is ${MATRIX_LIMITS.fanoutEdges}. They are counted, not dropped.`);
  }

  recordMarker(draft, hookCtx, `fanout|${dayKey(now)}|${event.type}|${ctx.revision ?? ''}`, 'fanout',
    `Matrix fan-out: ${edgesWritten} edge(s), ${ambiguousPeople.size} multi-line person(s), ${sensitiveSkipped} sensitive item(s) counted only.`);

  return out;
}
