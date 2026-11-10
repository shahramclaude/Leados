/**
 * app/core/domain/matrixInterfaceRules.js — `RULE-MIA-01` on the shared
 * post-commit spine (ADR-0162, Schema v131).
 *
 * Behaviour:
 *  - Fires only on matrix line lifecycle events, cadence forum lifecycle
 *    events (`cadence.forum.declared` / `cadence.forum.retired`), interface
 *    agreement lifecycle events, or an explicit `matrix.interface.scan`.
 *  - Respects `settings.matrixInterfaceAutoPropagate` (explicit scan bypasses).
 *  - Inert on automatic triggers in single-chain workspaces.
 *  - Closes open review `delegations` tracked in `matrixInterfaceMarkers` once
 *    the pair becomes `current`, no longer exists, or lost its unique joint apex.
 *  - Issues at most ONE bounded, marker-idempotent review `delegation` per
 *    uncovered pair to its unique `matrixJointApex` principal (plus typed
 *    `issues-obligation` and DAG `rolls-up-to` provenance).
 *  - Never guesses an owner when `!pair.apex.unique` (diamond tie or
 *    disconnected managers): records an observation marker and refuses to
 *    delegate.
 *  - Never invents or writes an interface agreement or edits a reporting line.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixAllocations, matrixLineScope } from './matrix.js';
import { buildSeats, UNDECLARED_SEAT } from './seat.js';
import { CADENCE_EVENTS } from './cadenceRegistry.js';
import { buildMatrixInterfaceReport } from './matrixInterface.js';
import {
  MATRIX_INTERFACE_EVENTS,
  MATRIX_INTERFACE_LIMITS,
  MATRIX_INTERFACE_RULE_ID,
} from './matrixInterfaceRegistry.js';
import { normalizeMatrixInterfaceSettings } from './matrixInterfaceSchema.js';

export const MATRIX_INTERFACE_TRIGGER_EVENTS = new Set([
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  CADENCE_EVENTS.FORUM_DECLARED,
  CADENCE_EVENTS.FORUM_RETIRED,
  MATRIX_INTERFACE_EVENTS.AFFIRM,
  MATRIX_INTERFACE_EVENTS.RETIRE,
  MATRIX_INTERFACE_EVENTS.CONVENTIONS,
  MATRIX_INTERFACE_EVENTS.SCAN,
]);

function recordMarker(draft, ctx, marker) {
  draft.matrixInterfaceMarkers = Array.isArray(draft.matrixInterfaceMarkers)
    ? draft.matrixInterfaceMarkers
    : [];
  if (draft.matrixInterfaceMarkers.some((m) => m && m.key === marker.key)) return false;
  if (draft.matrixInterfaceMarkers.length >= MATRIX_INTERFACE_LIMITS.markers) {
    draft.matrixInterfaceMarkers.splice(
      0,
      draft.matrixInterfaceMarkers.length - MATRIX_INTERFACE_LIMITS.markers + 1,
    );
  }
  draft.matrixInterfaceMarkers.push({
    ...marker,
    recordedOn: marker.recordedOn || dayKey(ctx.now),
  });
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ rule: MATRIX_INTERFACE_RULE_ID, action, entity, entityId, summary });
  }
  out.push(summary);
}

export function matrixInterfaceRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!MATRIX_INTERFACE_TRIGGER_EVENTS.has(eventType)) return [];

  const conv = normalizeMatrixInterfaceSettings(draft.settings || {});
  const explicit = eventType === MATRIX_INTERFACE_EVENTS.SCAN;
  if (!explicit && conv.matrixInterfaceAutoPropagate === false) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((p) => `${p}-${Math.random().toString(36).slice(2, 10)}`);

  // Always compute full-access topology across the workspace, never from a scoped seat.
  const fullStateView = {
    ...draft,
    settings: { ...(draft.settings || {}), activeSeatId: null },
  };
  const liveMatrix = buildMatrix(fullStateView, { now: at, settings: fullStateView.settings });
  const allocations = matrixAllocations(liveMatrix);
  const scope = matrixLineScope(liveMatrix);
  const seats = buildSeats(fullStateView, { now: at, settings: fullStateView.settings, lineScope: scope.byManager });
  const fullSeat = { id: UNDECLARED_SEAT, name: 'Workspace operator', label: 'Operator', rank: 5, fullAccess: true, readOnly: false };

  const report = buildMatrixInterfaceReport(fullStateView, {
    now: at,
    settings: fullStateView.settings,
    matrix: liveMatrix,
    allocations,
    lineScope: scope,
    seats,
    seat: fullSeat,
  });

  const out = [];
  if (!explicit && !report.isMatrix) return out;

  const pairByKey = new Map(report.allPairs.map((p) => [p.pairKey, p]));
  const markers = Array.isArray(draft.matrixInterfaceMarkers) ? draft.matrixInterfaceMarkers : [];

  // 1. Close prior open review asks once a pair is current, vanished, or lost its unique apex;
  // keep open asks stable across uncovered negotiation steps (unagreed -> one-sided -> contested-terms).
  let closedN = 0;
  const openAskKeys = new Set();
  if (markers.length && Array.isArray(draft.delegations)) {
    for (const marker of markers) {
      if (!marker?.taskId || marker.kind !== 'ask') continue;
      const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
      if (!task) continue;

      const pair = pairByKey.get(marker.pairKey) || null;
      const stillOpenWithSameApex = Boolean(
        pair
        && pair.state !== 'current'
        && pair.apex.unique
        && pair.apex.apexId === marker.apexId,
      );
      if (stillOpenWithSameApex) {
        openAskKeys.add(`${pair.pairKey}|${marker.apexId}`);
        continue;
      }

      task.status = 'done';
      task.completedOn = task.delegatedOn && today < task.delegatedOn ? task.delegatedOn : today;
      task.completionNote = pair && pair.state === 'current'
        ? `Closed by ${MATRIX_INTERFACE_RULE_ID}: bilateral management interface agreed and current on ${today}.`
        : `Closed by ${MATRIX_INTERFACE_RULE_ID}: prior interface review condition (${marker.state}) superseded on ${today}.`;
      task.updatedAt = nowIso;
      closedN += 1;
    }
  }

  // 2. Issue one bounded dated review ask per uncovered pair with a unique joint apex.
  let issuedN = 0;
  let rollupN = 0;
  let deferredN = 0;

  for (const pair of report.allPairs) {
    if (pair.state === 'current') continue;

    if (!pair.apex.unique) {
      const tieKey = `unresolvable|${pair.pairKey}|${pair.apex.apexIds.join(',') || 'disconnected'}`;
      if (recordMarker(draft, ctx, {
        key: tieKey,
        kind: 'observation',
        pairKey: pair.pairKey,
        apexId: '',
        state: pair.state,
        summary: `Refused to guess joint escalation owner for pair ${pair.pairKey}: ${pair.stateDetail}`,
      })) {
        noteEffect(
          ctx,
          out,
          'observed',
          'workspace',
          pair.pairKey,
          `Management interface between ${pair.managerAName} & ${pair.managerBName} has no unique joint apex (${pair.apex.apexLabel}); refused to assign a review owner.`,
        );
      }
      continue;
    }

    const apexId = pair.apex.apexId;
    if (openAskKeys.has(`${pair.pairKey}|${apexId}`)) continue;
    const episodeTag = pair.agreed
      ? `${pair.agreed.id}|${pair.state}`
      : pair.latestRetire
        ? `${pair.latestRetire.id}|unagreed`
        : 'initial';
    const markerKey = `ask|${pair.pairKey}|${episodeTag}|${apexId}`;
    if ((draft.matrixInterfaceMarkers || []).some((m) => m && m.key === markerKey)) continue;

    if (issuedN >= MATRIX_INTERFACE_LIMITS.asksPerCommit) {
      deferredN += 1;
      continue;
    }

    const dueOn = addDays(today, conv.matrixInterfaceReviewAskDays);
    const taskId = idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: apexId,
      title: `Establish management interface: ${pair.managerAName} & ${pair.managerBName} (${pair.stateLabel})`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, ensure ${pair.managerAName} and ${pair.managerBName} (sharing ${pair.sharedPeopleN} multi-line person/people) open Matrix → Interfaces and record a bilateral operating agreement stating consultation rules, review deadline, and escalation route. ${pair.stateDetail} Never invented by automation.`.slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${MATRIX_INTERFACE_RULE_ID} to unique joint apex (${pair.apex.apexLabel}).`.slice(0, 2000),
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

    ensureEntityLink(draft, {
      sourceType: 'person',
      sourceId: apexId,
      targetType: 'delegation',
      targetId: taskId,
      relation: 'issues-obligation',
      ruleId: MATRIX_INTERFACE_RULE_ID,
      summary: 'Uncovered bilateral management interface issued a dated review ask to the unique joint apex.',
    }, { idFactory, todayStr: today, nowIso });

    const apexNode = liveMatrix?.nodes?.get(apexId) || null;
    for (const ancestorId of [...(apexNode?.ancestors || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation',
        sourceId: taskId,
        targetType: 'person',
        targetId: ancestorId,
        relation: 'rolls-up-to',
        ruleId: MATRIX_INTERFACE_RULE_ID,
        summary: 'Uncovered management-interface agreement ask rolls up to this leadership span.',
      }, { idFactory, todayStr: today, nowIso });
      if (rolled.created) rollupN += 1;
    }

    recordMarker(draft, ctx, {
      key: markerKey,
      kind: 'ask',
      pairKey: pair.pairKey,
      apexId,
      state: pair.state,
      taskId,
      summary: `Issued interface review task ${taskId} to unique joint apex ${apexId} (${pair.state}).`,
    });
    issuedN += 1;
    noteEffect(
      ctx,
      out,
      'delegated',
      'delegation',
      taskId,
      `Issued management-interface review ask to ${pair.apex.apexLabel} for ${pair.managerAName} & ${pair.managerBName} (${pair.stateLabel}).`,
    );
  }

  if (closedN) {
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      'matrix-interfaces',
      `Closed ${closedN} superseded or agreed management-interface review delegation(s).`,
    );
  }
  if (rollupN) {
    noteEffect(
      ctx,
      out,
      'linked',
      'link',
      'matrix-interfaces',
      `Wrote ${rollupN} typed matrix roll-up edge(s) for management-interface review asks.`,
    );
  }
  if (deferredN) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      'matrix-interfaces',
      `Deferred ${deferredN} interface review ask(s) past the per-commit cap of ${MATRIX_INTERFACE_LIMITS.asksPerCommit}; run Scan to issue the remainder.`,
    );
  }

  return out;
}

matrixInterfaceRule.declineMemoizable = true;
