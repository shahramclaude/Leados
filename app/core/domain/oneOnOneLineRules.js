/**
 * app/core/domain/oneOnOneLineRules.js — `RULE-OOL-01` on the shared
 * post-commit spine (ADR-0164, Schema v140).
 *
 * Behaviour:
 *  - Fires on 1:1 log/claim/release events, coverage convention changes,
 *    matrix reporting-line lifecycle events, or an explicit `oneonone.line.scan`.
 *  - Fast-exits in O(1) when `reportingLines` is empty (inert in single-chain
 *    workspaces) or when `settings.oneOnOneLineAutoPropagate === false`
 *    (explicit `oneonone.line.scan` always runs).
 *  - Closes prior open silent-line asks tracked in `oneOnOneLineMarkers` once
 *    the line is on cadence, due, new, exempt, ended, unproven, or no longer
 *    multi-line.
 *  - Issues at most ONE bounded, marker-idempotent dated `delegation` ask per
 *    proven silent `(person, line)` pair (`overdue` or `never`) addressed to
 *    that line's active manager, with typed `concerns`, `issues-obligation`,
 *    and DAG `rolls-up-to` provenance. Respects `asksPerCommit` cap and counts
 *    deferred items for a follow-up scan.
 *  - Records idempotent `observation` markers (and never blame tasks) for
 *    `unproven` lines (where an unattributed meeting might have been held),
 *    structural graph refusals, or silent lines whose holder is no longer on
 *    the roster.
 *  - Never back-fills `heldById`, never marks a 1:1 held, never alters reporting
 *    lines, and never rates a person.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildOneOnOneLines } from './oneOnOneLines.js';
import { normalizeOneOnOneLineSettings } from './oneOnOneLineSchema.js';
import {
  ONE_ON_ONE_LINE_EVENTS,
  ONE_ON_ONE_LINE_LIMITS,
  ONE_ON_ONE_LINE_RULE_ID,
  ONE_ON_ONE_LINE_RULE_RELATIONS,
} from './oneOnOneLineRegistry.js';

export const ONE_ON_ONE_LINE_TRIGGER_EVENTS = new Set([
  'oneonone.logged',
  ONE_ON_ONE_LINE_EVENTS.CLAIMED,
  ONE_ON_ONE_LINE_EVENTS.RELEASED,
  ONE_ON_ONE_LINE_EVENTS.CONVENTIONS,
  ONE_ON_ONE_LINE_EVENTS.SCAN,
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
]);

export const ONE_ON_ONE_LINE_RELATIONS = ONE_ON_ONE_LINE_RULE_RELATIONS;

const clampStr = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function recordMarker(draft, ctx, marker) {
  draft.oneOnOneLineMarkers = Array.isArray(draft.oneOnOneLineMarkers) ? draft.oneOnOneLineMarkers : [];
  if (draft.oneOnOneLineMarkers.some((m) => m && m.key === marker.key)) return false;
  draft.oneOnOneLineMarkers.push({
    key: String(marker.key).slice(0, 240),
    kind: marker.kind,
    lineKey: clampStr(marker.lineKey, 200),
    taskId: marker.taskId ? clampStr(marker.taskId, 80) : null,
    state: clampStr(marker.state, 24),
    summary: clampStr(marker.summary, 280),
    at: ctx.nowIso,
  });
  const cap = ONE_ON_ONE_LINE_LIMITS.markers;
  if (draft.oneOnOneLineMarkers.length > cap) {
    draft.oneOnOneLineMarkers.splice(0, draft.oneOnOneLineMarkers.length - cap);
  }
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  const clean = clampStr(summary, 280);
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ ruleId: ONE_ON_ONE_LINE_RULE_ID, rule: ONE_ON_ONE_LINE_RULE_ID, action, entity, entityId, summary: clean });
  }
  out.push({ ruleId: ONE_ON_ONE_LINE_RULE_ID, action, targetType: entity, targetId: entityId, summary: clean });
}

function pushAskTask(draft, hookCtx, { recipientId, title, expectedOutcome, support, dueOn }) {
  const taskId = hookCtx.idFactory('dlg');
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId: recipientId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: hookCtx.today,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: hookCtx.nowIso,
    updatedAt: hookCtx.nowIso,
  });
  return taskId;
}

export function oneOnOneLineRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!ONE_ON_ONE_LINE_TRIGGER_EVENTS.has(eventType)) return [];
  if (!draft || !Array.isArray(draft.reportingLines) || draft.reportingLines.length === 0) return [];

  const conv = normalizeOneOnOneLineSettings(draft.settings || {});
  const explicit = eventType === ONE_ON_ONE_LINE_EVENTS.SCAN;
  if (!explicit && conv.oneOnOneLineAutoPropagate === false) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now: at,
    today,
    todayStr: today,
    nowIso: ctx.nowIso || at.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Math.random().toString(36).slice(2, 10)}`),
  };

  // Whole-workspace operator view so obligations reflect the full reporting graph,
  // regardless of which scoped seat initiated the triggering write.
  const fullStateView = {
    ...draft,
    settings: { ...(draft.settings || {}), activeSeatId: null },
  };
  const liveMatrix = buildMatrix(fullStateView, { now: at, settings: fullStateView.settings });
  const report = buildOneOnOneLines(fullStateView, { now: at, settings: fullStateView.settings, matrix: liveMatrix });

  const linesByKey = new Map();
  for (const person of report.persons) {
    for (const line of person.lines) {
      linesByKey.set(line.lineKey, { person, line });
    }
  }

  const out = [];
  const openAskLineKeys = new Set();
  let closedN = 0;

  // 1. Close open asks when the line is no longer proven silent or no longer active.
  if (Array.isArray(draft.oneOnOneLineMarkers) && Array.isArray(draft.delegations)) {
    for (const marker of draft.oneOnOneLineMarkers) {
      if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
      const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
      if (!task) continue;
      const entry = linesByKey.get(marker.lineKey) || null;
      const stillProvenSilent = Boolean(entry && entry.line.silent && entry.line.managerOnRoster && entry.line.managerId === task.personId);
      if (!stillProvenSilent) {
        task.status = 'done';
        task.completedOn = today;
        task.completionNote = !entry
          ? `Closed by ${ONE_ON_ONE_LINE_RULE_ID}: this reporting line is no longer active in a multi-line structure on ${today}.`
          : entry.line.state === 'unproven'
            ? `Closed by ${ONE_ON_ONE_LINE_RULE_ID}: an unattributed 1:1 could account for this line, so silence is no longer proven on ${today}.`
            : `Closed by ${ONE_ON_ONE_LINE_RULE_ID}: line state is now ${entry.line.stateLabel.toLowerCase()} on ${today}.`;
        task.updatedAt = hookCtx.nowIso;
        closedN += 1;
      } else {
        openAskLineKeys.add(marker.lineKey);
      }
    }
  }

  // 2. Issue bounded asks for proven silent lines and observations for unreadable cases.
  let issuedN = 0;
  let observedN = 0;
  let deferredN = 0;
  let rollupN = 0;
  const dueOn = addDays(today, conv.oneOnOneLineAskDueDays);

  for (const person of report.persons) {
    for (const line of person.lines) {
      if (line.silent) {
        if (!line.managerOnRoster) {
          const obsKey = `obs|dangling-holder|${line.lineKey}|${line.state}`;
          if (recordMarker(draft, hookCtx, {
            key: obsKey,
            kind: 'observation',
            lineKey: line.lineKey,
            taskId: null,
            state: line.state,
            summary: `Silent ${line.role} line for ${person.personName} holds a departed manager (${line.managerId}); abstained from issuing an unowned task.`,
          })) {
            observedN += 1;
          }
          continue;
        }
        if (openAskLineKeys.has(line.lineKey)) continue;
        const markerKey = `ask|${line.lineKey}|${line.state}|${line.lastHeldOn || line.startedOn || 'none'}|${line.intervalDays}`;
        if (draft.oneOnOneLineMarkers?.some((m) => m && m.key === markerKey)) continue;
        if (issuedN >= ONE_ON_ONE_LINE_LIMITS.asksPerCommit) {
          deferredN += 1;
          continue;
        }

        const roleLabel = line.role === 'home' ? 'home' : line.kind || 'additional';
        const taskId = pushAskTask(draft, hookCtx, {
          recipientId: line.managerId,
          title: `Hold attributed 1:1 with ${person.personName} on ${roleLabel} line (${line.state === 'never' ? 'never held' : 'overdue'})`,
          expectedOutcome: `By ${dueOn}, hold and log an attributed 1:1 with ${person.personName} on their ${roleLabel} reporting line (cadence ${line.intervalDays} days), or update/end the reporting line if this accountability no longer holds. ${line.reason}${person.masked ? ' Note: another line’s meeting currently masks this silence on the person-wide roster.' : ''}`,
          support: `Issued by ${ONE_ON_ONE_LINE_RULE_ID}. Another manager’s 1:1 never credits this line; this ask closes automatically once an attributed held 1:1 is recorded for ${line.managerName}.`,
          dueOn,
        });

        const concern = ensureEntityLink(draft, {
          sourceType: 'person',
          sourceId: line.personId,
          targetType: 'delegation',
          targetId: taskId,
          relation: 'concerns',
          ruleId: ONE_ON_ONE_LINE_RULE_ID,
          summary: `Declared ${roleLabel} reporting line carries a proven silent 1:1 cadence.`,
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
        if (concern.created) rollupN += 1;

        const obligation = ensureEntityLink(draft, {
          sourceType: 'person',
          sourceId: line.managerId,
          targetType: 'delegation',
          targetId: taskId,
          relation: 'issues-obligation',
          ruleId: ONE_ON_ONE_LINE_RULE_ID,
          summary: `Proven silent ${roleLabel} line issued a dated 1:1 ask to its manager.`,
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
        if (obligation.created) rollupN += 1;

        const node = liveMatrix.nodes.get(line.personId);
        for (const ancestorId of [...((node && node.ancestors) || [])]) {
          const rolled = ensureEntityLink(draft, {
            sourceType: 'delegation',
            sourceId: taskId,
            targetType: 'person',
            targetId: ancestorId,
            relation: 'rolls-up-to',
            ruleId: ONE_ON_ONE_LINE_RULE_ID,
            summary: 'A silent matrix 1:1 line ask rolls up to this leadership span.',
          }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
          if (rolled.created) rollupN += 1;
        }

        recordMarker(draft, hookCtx, {
          key: markerKey,
          kind: 'ask',
          lineKey: line.lineKey,
          taskId,
          state: line.state,
          summary: `Issued silent-line ask ${taskId} to ${line.managerId} for ${line.lineKey}.`,
        });
        openAskLineKeys.add(line.lineKey);
        issuedN += 1;
      } else if (line.state === 'unproven') {
        const obsKey = `obs|unproven|${line.lineKey}|${line.lastUnattributedOn || 'none'}|${line.uncertainDateN || 0}`;
        if (recordMarker(draft, hookCtx, {
          key: obsKey,
          kind: 'observation',
          lineKey: line.lineKey,
          taskId: null,
          state: 'unproven',
          summary: `Observed unreadable line ${line.lineKey}: unattributed or undated meeting prevents proving silence without human claim.`,
        })) {
          observedN += 1;
        }
      }
    }
  }

  for (const refused of report.refusedPersons) {
    const obsKey = `obs|structural|${refused.personId}|${clampStr(refused.reason, 120)}`;
    if (recordMarker(draft, hookCtx, {
      key: obsKey,
      kind: 'observation',
      lineKey: `person|${refused.personId}`,
      taskId: null,
      state: 'structural',
      summary: `Observed reporting-graph refusal for ${refused.personId}: ${clampStr(refused.reason, 180)}`,
    })) {
      observedN += 1;
    }
  }

  if (closedN > 0) {
    noteEffect(hookCtx, out, 'completed', 'delegation', 'one-on-one-lines', `Closed ${closedN} resolved matrix 1:1 silent-line ask(s).`);
  }
  if (issuedN > 0) {
    noteEffect(hookCtx, out, 'delegated', 'delegation', 'one-on-one-lines', `Issued ${issuedN} bounded silent-line 1:1 ask(s) due by ${dueOn}.`);
  }
  if (rollupN > 0) {
    noteEffect(hookCtx, out, 'linked', 'link', 'one-on-one-lines', `Recorded ${rollupN} typed matrix provenance edge(s) for silent-line asks.`);
  }
  if (observedN > 0) {
    noteEffect(hookCtx, out, 'observed', 'oneOnOneLineMarkers', 'one-on-one-lines', `Recorded ${observedN} idempotent observation marker(s) for unreadable or defective lines.`);
  }
  if (deferredN > 0) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'one-on-one-lines', `Deferred ${deferredN} silent-line ask(s) beyond the per-commit cap (${ONE_ON_ONE_LINE_LIMITS.asksPerCommit}); run Scan to issue the remainder.`);
  }

  return out;
}

oneOnOneLineRule.id = 'oneOnOneLineRule';
oneOnOneLineRule.triggers = ONE_ON_ONE_LINE_TRIGGER_EVENTS;
