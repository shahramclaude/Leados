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
import { harvestWork, LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex, matrixLineScope, matrixWorkReach } from './matrix.js';
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

const DERIVED_EVENT_PREFIXES = Object.freeze([
  'automation.', 'seat.', 'matrix.', 'propagation.', 'vault.', 'workspace.',
  'settings.', 'demo.', 'import.', 'export.', 'lock.', 'crypto.', 'epistemic.',
]);

function isOperationalMatrixTrigger(event) {
  if (!event || typeof event !== 'object') return false;
  const type = String(event.type || '');
  if (!type) return false;
  return !DERIVED_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix));
}

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
  return result;
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

  const declared = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  const isMatrixTrigger = MATRIX_TRIGGER_SET.has(event.type);
  const isOperational = declared.length > 0 && isOperationalMatrixTrigger(event);
  if (!isMatrixTrigger && !isOperational) return [];

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

  // Nothing declared, nothing to say unless an explicit scan or line end runs
  // reconciliation to remove any obsolete RULE-MTX-01 links.
  const hasExistingRuleLinks = Array.isArray(draft.links)
    && draft.links.some((e) => e?.ruleId === MATRIX_RULE_IDS.FANOUT);
  if (!declared.length && !isExplicitScan && !hasExistingRuleLinks) return [];

  // Build against the full workspace, not the acting seat's view: a second
  // manager is entitled to the work whether or not they are the one holding the
  // keyboard when the line is declared.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  const items = harvestWork(fullStateView, matrix.chain, { now, settings: fullStateView.settings });
  const lineScope = matrixLineScope(matrix);
  const reach = matrixWorkReach(matrix, lineScope, items);

  // personId → the active managers in that person's reporting set when >1 line holds.
  const extraManagers = new Map();
  for (const personId of matrix.roster.keys()) {
    const lines = matrix.linesByPerson.get(personId) || [];
    const active = lines.filter((l) => l.active !== false);
    if (active.length < 2) continue;
    const managers = [...new Set(active.map((l) => l.managerId))];
    extraManagers.set(personId, managers);
  }

  // Reconcile existing RULE-MTX-01 links against the current live matrix graph
  // before writing missing ones, so ended lines or closed items never retain
  // stale edges. Compute the full valid set prior to capping creation.
  const edgeKey = (sourceType, sourceId, targetId, relation) => JSON.stringify([sourceType, sourceId, targetId, relation]);
  const validKeys = new Set();
  let sensitiveSkipped = 0;

  for (const item of items) {
    if (!item.entityId || String(item.entityId).startsWith('cadence-')) continue;
    const touched = (item.people || []).filter((id) => extraManagers.has(id));
    if (!touched.length) continue;
    if (item.sensitive) { sensitiveSkipped += 1; continue; }
    const sourceType = item.type === 'case' ? 'case' : item.type;
    for (const personId of touched) {
      for (const managerId of extraManagers.get(personId)) {
        validKeys.add(edgeKey(sourceType, item.entityId, managerId, 'rolls-up-to'));
      }
    }
  }

  const apexTargets = [];
  let ambiguousApexN = 0;
  for (const r of reach) {
    if (!r.shared || !r.entityId || String(r.entityId).startsWith('cadence-')) continue;
    if (r.sensitive) continue;
    const apex = matrixJointApex(matrix, r.sites);
    if (apex.unique && apex.apexId && !r.sites.includes(apex.apexId)) {
      const sourceType = r.type === 'case' ? 'case' : r.type;
      validKeys.add(edgeKey(sourceType, r.entityId, apex.apexId, 'escalates-to'));
      apexTargets.push({ sourceType, item: r, apexId: apex.apexId });
    } else if (apex.ambiguous) {
      ambiguousApexN += 1;
    }
  }

  let removed = 0;
  if (Array.isArray(draft.links)) {
    draft.links = draft.links.filter((edge) => {
      if (edge?.ruleId !== MATRIX_RULE_IDS.FANOUT) return true;
      if (edge.relation !== 'rolls-up-to' && edge.relation !== 'escalates-to') return true;
      if (edge.targetType === 'person' && validKeys.has(edgeKey(edge.sourceType, edge.sourceId, edge.targetId, edge.relation))) {
        return true;
      }
      removed += 1;
      return false;
    });
  }
  if (removed) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'reconciled', 'workspace', 'matrix',
      `Removed ${removed} obsolete matrix link(s) after a reporting-line or work-item change.`);
  }

  if (!extraManagers.size && !apexTargets.length && !ambiguousApexN && !removed) return out;

  let edgesWritten = 0;
  let apexEdgesWritten = 0;
  let skippedByCap = 0;
  let rejected = 0;
  const ambiguousPeople = new Set();
  // A work item may name multiple people held by the same manager. Count and
  // write distinct edges, not iterations or items, including after the cap.
  const candidates = new Map();
  for (const item of items) {
    if (!item.entityId || String(item.entityId).startsWith('cadence-') || item.sensitive) continue;
    const touched = (item.people || []).filter((id) => extraManagers.has(id));
    if (!touched.length) continue;
    const sourceType = item.type === 'case' ? 'case' : item.type;
    for (const personId of touched) {
      ambiguousPeople.add(personId);
      for (const managerId of extraManagers.get(personId)) {
        const line = (matrix.linesByPerson.get(personId) || []).find((l) => l.managerId === managerId);
        const kindLabel = matrixLineKind(line?.kind)?.label || 'reporting';
        const key = edgeKey(sourceType, item.entityId, managerId, 'rolls-up-to');
        if (!candidates.has(key)) candidates.set(key, {
          sourceType, sourceId: item.entityId, targetId: managerId, relation: 'rolls-up-to',
          summary: `This ${item.typeLabel || item.type} touches someone on more than one line; it rolls up through the ${kindLabel} line as well as the home line.`,
        });
      }
    }
  }
  for (const { sourceType, item, apexId } of apexTargets) {
    const key = edgeKey(sourceType, item.entityId, apexId, 'escalates-to');
    if (!candidates.has(key)) candidates.set(key, {
      sourceType, sourceId: item.entityId, targetId: apexId, relation: 'escalates-to',
      summary: `Shared across ${item.siteN} accountable managers; unresolved trade-offs escalate to ${apexId === LEADER_ID ? 'the workspace leader' : 'the joint apex in the reporting DAG'}.`,
    });
  }
  const existingKeys = new Set((draft.links || [])
    .filter((edge) => edge?.targetType === 'person')
    .map((edge) => edgeKey(edge.sourceType, edge.sourceId, edge.targetId, edge.relation)));
  for (const [key, candidate] of candidates) {
    if (existingKeys.has(key)) continue;
    if (edgesWritten + apexEdgesWritten >= MATRIX_LIMITS.fanoutEdges) {
      skippedByCap += 1;
      continue;
    }
    const result = linkOnce(draft, hookCtx, candidate.sourceType, candidate.sourceId,
      'person', candidate.targetId, candidate.relation, MATRIX_RULE_IDS.FANOUT, candidate.summary);
    if (result?.created) {
      if (candidate.relation === 'rolls-up-to') edgesWritten += 1;
      else apexEdgesWritten += 1;
    } else if (!result?.link) {
      rejected += 1;
    }
  }

  if (edgesWritten) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'rolled-up', 'workspace', 'matrix',
      `Wrote ${edgesWritten} roll-up link(s) for work touching ${ambiguousPeople.size} person(s) on multiple lines; see any deferred or rejected links below.`);
  }
  if (apexEdgesWritten) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'escalated-to-apex', 'workspace', 'matrix',
      `Wrote ${apexEdgesWritten} joint-apex link(s) for shared multi-line work.`);
  }
  if (ambiguousApexN) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'ambiguous-apex', 'workspace', 'matrix',
      `${ambiguousApexN} shared item(s) hit incomparable minimal ancestors in a matrix diamond; no single owner was guessed.`);
  }
  if (sensitiveSkipped) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'withheld', 'workspace', 'matrix',
      `${sensitiveSkipped} confidential item(s) contributed a count and no edge: a second manager is not a wider audience for a sensitive record.`);
  }
  if (skippedByCap) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'deferred', 'workspace', 'matrix',
      `${skippedByCap} distinct link(s) remain unwritten after the per-transaction cap of ${MATRIX_LIMITS.fanoutEdges}. A later scan or operational change can retry them.`);
  }

  if (rejected) {
    noteEffect(hookCtx, out, MATRIX_RULE_IDS.FANOUT, 'rejected', 'workspace', 'matrix',
      `${rejected} distinct link(s) were rejected by the shared link validator; they were not written.`);
  }

  recordMarker(draft, hookCtx, `fanout|${dayKey(now)}|${event.type}|${ctx.revision ?? ''}`, 'fanout',
    `Matrix fan-out: ${edgesWritten} roll-up edge(s), ${apexEdgesWritten} apex edge(s), ${removed} pruned, ${ambiguousApexN} ambiguous tie(s), ${ambiguousPeople.size} multi-line person(s), ${sensitiveSkipped} sensitive counted only, ${skippedByCap} links deferred, ${rejected} rejected.`);

  return out;
}
