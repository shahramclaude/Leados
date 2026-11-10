/**
 * app/core/domain/authorityContinuityRules.js — RULE-ACR-01, the Frozen
 * Authority Drift Reconciliation Rule (ADR-0159, Schema v130).
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - Fires on structural/matrix changes (`matrix.line.*`, `structure.*`,
 *    `comp.cycle.finalized`, `decision.made`, `decision.updated`,
 *    `board.committed`, `board.frozen`, `board.superseded`), on a recorded
 *    settlement (`authority.continuity.resolved`), and on an explicit scan
 *    (`authority.continuity.scan`). Never fires on a pure read.
 *  - In a single-chain workspace with no declared matrix lines, automatic
 *    background commits stay completely INERT; only explicit continuity
 *    resolutions or scans run there.
 *  - When a drifted record has just been settled (`settled` or `referred`),
 *    closes any open reconciliation delegation previously issued for that
 *    record and authority key so no zombie task remains in the leader's queue.
 *  - For each drifted record whose settlement is `unsettled` or `stale`:
 *      * If live authority is `unowned`, issues NO subordinate delegation.
 *      * If contesting holders tie in a matrix diamond (`apexAmbiguous`),
 *        issues NO guessed delegation to one branch over the other — records an
 *        observation naming the tie so either joint principal or the workspace
 *        leader settles it directly.
 *      * Otherwise issues ONE owned, dated `delegation` addressed to the unique
 *        current right holder (or unique `matrixJointApex` principal above
 *        contesting/multi-principal holders), guarded by a marker keyed on
 *        `(recordType, recordId, authorityKey)` and bounded at 8 per commit.
 *  - Writes typed provenance only (`issues-obligation` from the frozen record
 *    to the delegation, `rolls-up-to` per leadership ancestor in the live
 *    matrix DAG). Never edits `meritCycles`, `decisions` or `boardMemos`.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildAuthorityContinuity, ownerNameOf } from './authorityContinuity.js';
import { normalizeAuthorityReaffirmationSettings } from './authorityReaffirmationSchema.js';
import {
  AUTHORITY_CONTINUITY_EVENTS,
  AUTHORITY_CONTINUITY_LINK_TYPES,
  AUTHORITY_CONTINUITY_RULE_ID,
  AUTHORITY_REAFFIRMATION_LIMITS,
} from './authorityContinuityRegistry.js';

export const AUTHORITY_CONTINUITY_RELATIONS = Object.freeze([
  'issues-obligation',
  'rolls-up-to',
]);

const AUTO_TRIGGERS = new Set([
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'structure.home-line.moved',
  'structure.history.imported',
  'comp.cycle.finalized',
  'decision.made',
  'decision.updated',
  'board.committed',
  'board.frozen',
  'board.superseded',
]);

const EXPLICIT_TRIGGERS = new Set([
  AUTHORITY_CONTINUITY_EVENTS.RESOLVE,
  AUTHORITY_CONTINUITY_EVENTS.SCAN,
]);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: AUTHORITY_CONTINUITY_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${AUTHORITY_CONTINUITY_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, entry) {
  if (!Array.isArray(draft.authorityReaffirmationMarkers)) {
    draft.authorityReaffirmationMarkers = [];
  }
  if (draft.authorityReaffirmationMarkers.some((m) => m && m.key === entry.key)) return false;
  draft.authorityReaffirmationMarkers.push({
    key: entry.key,
    kind: entry.kind || 'obligation',
    recordType: entry.recordType || null,
    recordId: entry.recordId || null,
    authorityKey: entry.authorityKey || '',
    taskId: entry.taskId || null,
    summary: clampStr(entry.summary, 280),
    at: ctx.nowIso,
  });
  const cap = AUTHORITY_REAFFIRMATION_LIMITS.markers;
  if (draft.authorityReaffirmationMarkers.length > cap) {
    draft.authorityReaffirmationMarkers.splice(
      0,
      draft.authorityReaffirmationMarkers.length - cap,
    );
  }
  return true;
}

export function authorityContinuityRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];

  const isExplicit = EXPLICIT_TRIGGERS.has(event.type);
  const isAuto = AUTO_TRIGGERS.has(event.type);
  if (!isExplicit && !isAuto) return [];

  const conv = normalizeAuthorityReaffirmationSettings(draft.settings || {});
  if (!isExplicit && !conv.authorityReaffirmAutoPropagate) return [];

  const declaredLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!isExplicit && !declaredLines.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`);
  const hookCtx = { ...ctx, now, today, todayStr: today, nowIso, idFactory };

  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const report = buildAuthorityContinuity(fullStateView, { now, settings: fullStateView.settings });
  const liveMatrix = report.liveMatrix;

  const out = [];
  let obligations = 0;
  let closedTasks = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;

  // 1. Close any previously issued reconciliation task whose record is now
  //    settled (`settled` or `referred`) or no longer drifted (`attributable`).
  const markers = Array.isArray(draft.authorityReaffirmationMarkers)
    ? draft.authorityReaffirmationMarkers
    : [];
  if (markers.length && Array.isArray(draft.delegations)) {
    const rowByPair = new Map(report.allRows.map((r) => [`${r.type}|${r.recordId}`, r]));
    for (const marker of markers) {
      if (!marker?.taskId || marker.kind !== 'obligation') continue;
      const row = rowByPair.get(`${marker.recordType}|${marker.recordId}`) || null;
      const stillOpenForSameHolders = row
        && row.verdict === 'drifted'
        && (row.settlement === 'unsettled' || row.settlement === 'stale')
        && row.currentAuthority?.authorityKey === marker.authorityKey;
      if (stillOpenForSameHolders) continue;

      const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
      if (!task) continue;
      task.status = 'done';
      task.completedOn = task.delegatedOn && today < task.delegatedOn ? task.delegatedOn : today;
      task.completionNote = row && (row.settlement === 'settled' || row.settlement === 'referred')
        ? `Closed by ${AUTHORITY_CONTINUITY_RULE_ID}: drifted ${row.type} settled (${row.settlement}) on ${today}.`
        : `Closed by ${AUTHORITY_CONTINUITY_RULE_ID}: prior authority-drift state superseded on ${today}.`;
      task.updatedAt = nowIso;
      closedTasks += 1;
    }
  }

  // 2. Issue one reconciliation ask per unsettled or stale drifted record with
  //    a unique live right holder or unique joint matrix apex.
  for (const row of report.allRows) {
    if (!row.recordId || row.verdict !== 'drifted') continue;
    if (row.settlement !== 'unsettled' && row.settlement !== 'stale') continue;

    const auth = row.currentAuthority;
    if (!auth?.applicable || auth.state === 'unowned') continue;

    if (auth.apexAmbiguous) {
      const tieKey = `ambiguous-apex|${row.type}|${row.recordId}|${auth.authorityKey}`;
      if (recordMarker(draft, hookCtx, {
        key: tieKey,
        kind: 'observation',
        recordType: row.type,
        recordId: row.recordId,
        authorityKey: auth.authorityKey,
        summary: `Refused to guess between tied joint principals (${auth.apexIds.join(', ')}) for drifted ${row.type} ${row.recordId}.`,
      })) {
        noteEffect(
          hookCtx,
          out,
          'observed',
          AUTHORITY_CONTINUITY_LINK_TYPES[row.type] || 'workspace',
          row.recordId,
          `Contesting authorities on ${row.label} tie across joint principals (${auth.apexIds.join(', ')}); no single principal was guessed.`,
        );
      }
      continue;
    }

    const targetId = auth.targetId;
    if (!targetId) continue;

    const markerKey = `reconcile|${row.type}|${row.recordId}|${auth.authorityKey}`;
    if ((draft.authorityReaffirmationMarkers || []).some((m) => m && m.key === markerKey)) continue;

    if (obligations >= AUTHORITY_REAFFIRMATION_LIMITS.obligationsPerCommit) {
      deferredByCap += 1;
      continue;
    }

    const dueOn = addDays(today, conv.authorityReaffirmDueDays);
    const targetName = ownerNameOf(fullStateView, targetId);
    const holderSummary = auth.holderIds.length > 1
      ? `joint principal above ${auth.holderIds.map((id) => ownerNameOf(fullStateView, id)).join(' & ')}`
      : `current ${row.rightLabel.toLowerCase()} holder`;
    const stalePrefix = row.settlement === 'stale'
      ? 'An earlier settlement went stale because live matrix authority moved again. '
      : '';

    const taskId = idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: targetId,
      title: `Settle drifted ${row.type}: ${row.label} (${row.asOf})`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, ${targetName} (${holderSummary}) has opened Matrix → Authority Continuity and either stood behind "${row.label}" (${row.asOf}) in writing under today’s live structure, or referred it to a governed re-decision. ${stalePrefix}Frozen record is never edited automatically.`.slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${AUTHORITY_CONTINUITY_RULE_ID}. ${row.reason || 'Authority moved since this record froze.'}`.slice(0, 2000),
      delegatedOn: today,
      dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    const sourceType = AUTHORITY_CONTINUITY_LINK_TYPES[row.type];
    if (sourceType) {
      ensureEntityLink(draft, {
        sourceType,
        sourceId: row.recordId,
        targetType: 'delegation',
        targetId: taskId,
        relation: 'issues-obligation',
        ruleId: AUTHORITY_CONTINUITY_RULE_ID,
        summary: 'Unsettled authority drift on this frozen decision issued a dated reconciliation ask.',
      }, { idFactory, todayStr: today, nowIso });
    }

    const node = liveMatrix?.nodes?.get(targetId) || null;
    for (const ancestorId of [...((node && node.ancestors) || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: taskId,
        targetType: 'person',
        targetId: ancestorId,
        relation: 'rolls-up-to',
        ruleId: AUTHORITY_CONTINUITY_RULE_ID,
        summary: 'Unsettled frozen-authority drift rolls up to this leadership span.',
      }, { idFactory, todayStr: today, nowIso });
      if (rolled.created) rollupEdges += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey,
      kind: 'obligation',
      recordType: row.type,
      recordId: row.recordId,
      authorityKey: auth.authorityKey,
      taskId,
      summary: `Issued authority-drift reconciliation task ${taskId} to ${targetId}.`,
    });
    obligations += 1;
    noteEffect(
      hookCtx,
      out,
      'delegated',
      'delegation',
      taskId,
      `Issued reconciliation ask to ${targetName} for drifted ${row.type} "${row.label}".`,
    );
  }

  if (closedTasks) {
    noteEffect(hookCtx, out, 'completed', 'delegation', 'authority-continuity',
      `Closed ${closedTasks} superseded or settled authority-reconciliation delegation(s).`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'linked', 'link', 'authority-continuity',
      `Wrote ${rollupEdges} typed matrix roll-up edge(s) for frozen-authority drift.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'authority-continuity',
      `Deferred ${deferredByCap} authority-drift ask(s) past the per-commit cap of ${AUTHORITY_REAFFIRMATION_LIMITS.obligationsPerCommit}; run Scan to issue the remainder.`);
  }

  return out;
}
