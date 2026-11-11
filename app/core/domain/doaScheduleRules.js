/**
 * app/core/domain/doaScheduleRules.js — `RULE-DOA-01` on the shared
 * post-commit spine (ADR-0174, Schema v138).
 *
 * Behaviour:
 *  - Fires on standing DoA schedule events, spending mandate lifecycle events,
 *    budget commitment lifecycle events, matrix reporting-line changes, or an
 *    explicit `doa.scan`.
 *  - Fast-exits in O(1) on automatic triggers when `doaSchedule` is empty or
 *    `settings.doaAutoPropagate === false` (explicit `doa.scan` always runs).
 *  - Closes prior open ratification `delegations` tracked in `doaMarkers` once
 *    a commitment is no longer an open breach or its covering principal changed.
 *  - Issues at most ONE bounded, marker-idempotent dated ratification
 *    `delegation` per open breach (`nemo-dat`, `second-line-limit`, `over-limit`)
 *    to its unique covering senior seat (or unique `matrixJointApex` when
 *    covering seats tie across matrix lines), with typed `issues-obligation`
 *    and DAG `rolls-up-to` provenance.
 *  - Refuses to guess an owner when `above-apex`, `unreadable`, or on an
 *    unresolved matrix diamond tie: records an idempotent observation marker.
 *  - Never blocks, revokes or edits a mandate, budget line, decision or limit.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { MANDATE_EVENTS } from './mandateRegistry.js';
import { buildMatrix, matrixLineScope } from './matrix.js';
import { buildSeats, UNDECLARED_SEAT } from './seat.js';
import { buildDoaReport } from './doaSchedule.js';
import {
  DOA_BOUNDS,
  DOA_EVENTS,
  DOA_RULE_ID,
} from './doaScheduleRegistry.js';
import { normalizeDoaSettings } from './doaScheduleSchema.js';

export const DOA_TRIGGER_EVENTS = new Set([
  DOA_EVENTS.DECLARE,
  DOA_EVENTS.RETIRE,
  DOA_EVENTS.PRICE_DECISION,
  DOA_EVENTS.CONVENTIONS,
  DOA_EVENTS.SCAN,
  MANDATE_EVENTS.PROPOSE,
  MANDATE_EVENTS.ACCEPT,
  MANDATE_EVENTS.RETURN,
  MANDATE_EVENTS.REVOKE,
  MANDATE_EVENTS.EXPIRE,
  MANDATE_EVENTS.COMPLETE,
  'budget.lineAdded',
  'budget.lineUpdated',
  'budget.actualRecorded',
  'budget.lineReleased',
  'budget.lineDeleted',
  'budget.deleted',
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
]);

function recordMarker(draft, ctx, marker) {
  draft.doaMarkers = Array.isArray(draft.doaMarkers) ? draft.doaMarkers : [];
  if (draft.doaMarkers.some((m) => m && m.key === marker.key)) return false;
  if (draft.doaMarkers.length >= DOA_BOUNDS.markers) {
    draft.doaMarkers.splice(0, draft.doaMarkers.length - DOA_BOUNDS.markers + 1);
  }
  draft.doaMarkers.push({
    ...marker,
    recordedOn: marker.recordedOn || dayKey(ctx.now),
  });
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ rule: DOA_RULE_ID, action, entity, entityId, summary });
  }
  out.push(summary);
}

function lawfulRecipientForBreach(row) {
  if (!row?.cover) return null;
  if (row.cover.state === 'unique' && row.cover.rawSeatIds?.length === 1) {
    return row.cover.rawSeatIds[0];
  }
  if (row.cover.state === 'matrix-tie' && row.cover.rawJointApexId) {
    return row.cover.rawJointApexId;
  }
  return null;
}

export function doaScheduleRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!DOA_TRIGGER_EVENTS.has(eventType)) return [];

  const conv = normalizeDoaSettings(draft.settings || {});
  const explicit = eventType === DOA_EVENTS.SCAN;
  if (!explicit && conv.doaAutoPropagate === false) return [];
  if (!explicit && (!Array.isArray(draft.doaSchedule) || draft.doaSchedule.length === 0)) {
    return [];
  }

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((p) => `${p}-${Math.random().toString(36).slice(2, 10)}`);

  const fullStateView = {
    ...draft,
    settings: { ...(draft.settings || {}), activeSeatId: null },
  };
  const liveMatrix = buildMatrix(fullStateView, { now: at, settings: fullStateView.settings });
  const scope = matrixLineScope(liveMatrix);
  const seats = buildSeats(fullStateView, { now: at, settings: fullStateView.settings, lineScope: scope.byManager });
  const fullSeat = { id: UNDECLARED_SEAT, name: 'Workspace operator', label: 'Operator', rank: 5, fullAccess: true, readOnly: false };

  const report = buildDoaReport(fullStateView, {
    now: at,
    settings: fullStateView.settings,
    matrix: liveMatrix,
    lineScope: scope,
    seats,
    seat: fullSeat,
  });

  const out = [];
  const rowByKey = new Map(report.allRows.map((r) => [r.objectKey, r]));
  const markers = Array.isArray(draft.doaMarkers) ? draft.doaMarkers : [];

  // 1. Close prior open ratification asks once resolved, revoked/released, or moved
  let closedN = 0;
  const openAskKeys = new Set();
  if (markers.length && Array.isArray(draft.delegations)) {
    for (const marker of markers) {
      if (!marker?.taskId || marker.kind !== 'ask') continue;
      const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
      if (!task) continue;
      const row = rowByKey.get(marker.objectKey) || null;
      const liveRecipient = row && row.verdict === 'breach' && row.isOpenCommitment
        ? lawfulRecipientForBreach(row)
        : null;
      const stillValid = Boolean(liveRecipient && liveRecipient === marker.recipientId);
      if (!stillValid) {
        task.status = 'done';
        task.completedOn = today;
        task.completionNote = row && row.verdict === 'conformant'
          ? `Closed by ${DOA_RULE_ID}: commitment now conforms to standing authority on ${today}.`
          : `Closed by ${DOA_RULE_ID}: prior over-limit commitment closed or covering principal superseded on ${today}.`;
        task.updatedAt = nowIso;
        closedN += 1;
      } else {
        openAskKeys.add(`${marker.objectKey}|${marker.recipientId}`);
      }
    }
  }

  // 2. Issue bounded ratification asks for open breaches, abstaining on ambiguous/above-apex
  let issuedN = 0;
  let deferredN = 0;
  let rollupN = 0;

  const seatLabelOf = (seatId) => {
    if (seatId === LEADER_ID) return liveMatrix.nodes.get(LEADER_ID)?.name || fullStateView.settings?.leaderName || 'Workspace Leader';
    return liveMatrix.nodes.get(seatId)?.name || seatId;
  };

  for (const row of report.allRows) {
    if (row.verdict !== 'breach' || !row.isOpenCommitment) continue;

    const recipientId = lawfulRecipientForBreach(row);
    if (!recipientId) {
      const abstainKey = `abstain|${row.objectKey}|${row.cover?.state || 'unreadable'}|${row.amountCents}`;
      if (recordMarker(draft, ctx, {
        key: abstainKey,
        kind: 'abstained',
        objectKey: row.objectKey,
        recipientId: null,
        taskId: null,
        summary: `Abstained from assigning ratification owner for ${row.objectKey} (${row.cover?.state || 'unreadable'}).`,
      })) {
        noteEffect(
          ctx,
          out,
          'observed',
          row.linkType || 'workspace',
          row.linkEntityId || 'matrix-doa',
          `DoA breach on "${row.title}" (${row.currency} ${row.amountFixed}) has ${row.cover?.label || 'no unique covering seat'}; no single owner was guessed.`,
        );
      }
      continue;
    }

    if (openAskKeys.has(`${row.objectKey}|${recipientId}`)) continue;
    const markerKey = `ask|${row.objectKey}|${row.breachClass}|${recipientId}|${row.amountCents}`;
    if ((draft.doaMarkers || []).some((m) => m && m.key === markerKey)) continue;

    if (issuedN >= DOA_BOUNDS.asksPerCommit) {
      deferredN += 1;
      continue;
    }

    const dueOn = addDays(today, conv.doaAskDueDays);
    const recipientName = seatLabelOf(recipientId);
    const taskId = idFactory('dlg');

    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: recipientId,
      title: `Ratify or unwind over-limit ${row.kind}: ${row.title} (${row.currency} ${row.amountFixed})`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, ${recipientName} (covering authority above ${row.authorizerName}) reviews Matrix → Authority Limits for "${row.title}" (${row.asOf}): ${row.verdictReason} Either ratify under your covering authority, adjust/revoke the commitment, or escalate. Underlying commitment was not blocked or mutated automatically.`.slice(0, 2000),
      authority: 'agree',
      support: `Issued by ${DOA_RULE_ID} (${row.breachClassShort || row.breachClass}; covering resolution: ${row.cover.label}).`.slice(0, 2000),
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

    if (row.linkType && row.linkEntityId) {
      ensureEntityLink(draft, {
        sourceType: row.linkType,
        sourceId: row.linkEntityId,
        targetType: 'delegation',
        targetId: taskId,
        relation: 'issues-obligation',
        ruleId: DOA_RULE_ID,
        summary: 'Commitment exceeding standing Delegation-of-Authority limit issued a dated ratification ask to covering principal.',
      }, { idFactory, todayStr: today, nowIso });
    }

    const recNode = liveMatrix.nodes.get(recipientId) || null;
    for (const ancId of [...(recNode?.ancestors || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: taskId,
        targetType: 'person',
        targetId: ancId,
        relation: 'rolls-up-to',
        ruleId: DOA_RULE_ID,
        summary: 'Over-limit Delegation-of-Authority ratification ask rolls up to this leadership span.',
      }, { idFactory, todayStr: today, nowIso });
      if (rolled.created) rollupN += 1;
    }

    recordMarker(draft, ctx, {
      key: markerKey,
      kind: 'ask',
      objectKey: row.objectKey,
      recipientId,
      taskId,
      summary: `Issued DoA ratification task ${taskId} to covering seat ${recipientId} for ${row.objectKey}.`,
    });
    openAskKeys.add(`${row.objectKey}|${recipientId}`);
    issuedN += 1;

    noteEffect(
      ctx,
      out,
      'delegated',
      'delegation',
      taskId,
      `Issued DoA ratification ask to ${recipientName} for "${row.title}" (${row.breachClassShort}).`,
    );
  }

  if (closedN > 0) {
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      'matrix-doa',
      `Closed ${closedN} resolved or superseded DoA ratification delegation(s).`,
    );
  }
  if (rollupN > 0) {
    noteEffect(
      ctx,
      out,
      'linked',
      'link',
      'matrix-doa',
      `Wrote ${rollupN} typed matrix roll-up edge(s) for DoA ratification asks.`,
    );
  }
  if (deferredN > 0) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      'matrix-doa',
      `Deferred ${deferredN} DoA ratification ask(s) past the per-commit cap of ${DOA_BOUNDS.asksPerCommit}; run Scan to issue the remainder.`,
    );
  }

  return out;
}

doaScheduleRule.declineMemoizable = true;
