/**
 * app/core/domain/hiringLineRules.js — `RULE-HLC-01` on the shared post-commit
 * spine (ADR-0176, Schema v141).
 *
 * Behaviour:
 *  - Fires on line-plan acts, candidate evidence / stage / decision events,
 *    requisition updates and deletions, or an explicit `hiring.line.scan`.
 *  - Fast-exits in O(1) when no line-plan act exists (inert in every workspace
 *    that never declared one) or when `settings.hiringLineAutoPropagate` is
 *    `false` (an explicit scan always runs).
 *  - Reads the register with the WHOLE-WORKSPACE operator view, so an ask does
 *    not depend on which seat pressed the button.
 *  - Closes its own open asks once the line is heard or represented, the
 *    candidate has left the final/offer stage, the plan was re-declared or
 *    withdrawn, or the requisition is no longer in flight.
 *  - Issues at most ONE dated `delegation` per (candidate, manager, plan act)
 *    to the NAMED manager of a `silent` or `unasked` line, only while the
 *    candidate is at final or offer stage on an in-flight requisition, with
 *    typed `concerns`, `issues-obligation` and matrix-DAG `rolls-up-to`
 *    provenance. Bounded by `asksPerCommit`; the remainder is counted.
 *  - Records an idempotent `observation` (never a task) for a declared line
 *    whose manager is no longer on the roster: nobody is silently substituted.
 *  - Never blocks an offer, never moves a candidate, never records evidence,
 *    never edits a plan and never picks one manager to speak for another.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildHiringLines } from './hiringLines.js';
import { normalizeHiringLineSettings } from './hiringLineSchema.js';
import {
  HIRING_LINE_EVENTS,
  HIRING_LINE_LIMITS,
  HIRING_LINE_RULE_ID,
} from './hiringLineRegistry.js';

export const HIRING_LINE_TRIGGER_EVENTS = new Set([
  HIRING_LINE_EVENTS.DECLARED,
  HIRING_LINE_EVENTS.WITHDRAWN,
  HIRING_LINE_EVENTS.SCAN,
  'candidate.added',
  'candidate.updated',
  'candidate.deleted',
  'candidate.evidence.recorded',
  'candidate.evidence.deleted',
  'candidate.decided',
  'candidate.offer-accepted',
  'requisition.updated',
  'requisition.deleted',
]);

const clampStr = (value, max = 280) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function recordMarker(draft, ctx, marker) {
  draft.hiringLineMarkers = Array.isArray(draft.hiringLineMarkers) ? draft.hiringLineMarkers : [];
  if (draft.hiringLineMarkers.some((m) => m && m.key === marker.key)) return false;
  draft.hiringLineMarkers.push({
    key: String(marker.key).slice(0, 320),
    kind: marker.kind,
    pairKey: clampStr(marker.pairKey, 280),
    taskId: marker.taskId ? clampStr(marker.taskId, 80) : null,
    state: clampStr(marker.state, 24),
    summary: clampStr(marker.summary, 280),
    at: ctx.nowIso,
  });
  const cap = HIRING_LINE_LIMITS.markers;
  if (draft.hiringLineMarkers.length > cap) {
    draft.hiringLineMarkers.splice(0, draft.hiringLineMarkers.length - cap);
  }
  return true;
}

function noteEffect(ctx, out, action, entity, entityId, summary) {
  const clean = clampStr(summary, 280);
  if (typeof ctx.recordEffect === 'function') {
    ctx.recordEffect({ ruleId: HIRING_LINE_RULE_ID, rule: HIRING_LINE_RULE_ID, action, entity, entityId, summary: clean });
  }
  out.push({ ruleId: HIRING_LINE_RULE_ID, action, targetType: entity, targetId: entityId, summary: clean });
}

export function hiringLineRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!HIRING_LINE_TRIGGER_EVENTS.has(eventType)) return [];
  if (!draft || !Array.isArray(draft.hiringLinePlans) || draft.hiringLinePlans.length === 0) return [];

  const conv = normalizeHiringLineSettings(draft.settings || {});
  const explicit = eventType === HIRING_LINE_EVENTS.SCAN;
  if (!explicit && conv.hiringLineAutoPropagate === false) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now: at,
    today,
    nowIso: ctx.nowIso || at.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Math.random().toString(36).slice(2, 10)}`),
  };
  const linkCtx = { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso };

  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const report = buildHiringLines(view, { now: at, settings: operator, matrix });

  // Every (candidate, line) pair that is owed an ask RIGHT NOW.
  const owed = new Map();
  const observations = [];
  for (const row of report.rows) {
    if (!row.declared) continue;
    for (const cand of row.candidates) {
      for (const line of cand.lines) {
        if (line.state === 'unreadable' && row.inFlight) {
          observations.push({ row, cand, line });
          continue;
        }
        if (!row.inFlight || !cand.askableStage || !line.askable) continue;
        owed.set(line.pairKey, { row, cand, line });
      }
    }
  }

  const out = [];
  let closedN = 0;
  const openPairKeys = new Set();

  // 1. Close asks this rule issued that are no longer owed.
  if (Array.isArray(draft.hiringLineMarkers) && Array.isArray(draft.delegations)) {
    for (const marker of draft.hiringLineMarkers) {
      if (!marker || marker.kind !== 'ask' || !marker.taskId) continue;
      const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
      if (!task) continue;
      const still = owed.get(marker.pairKey);
      if (still && still.line.managerId === task.personId) {
        openPairKeys.add(marker.pairKey);
        continue;
      }
      task.status = 'done';
      task.completedOn = today;
      task.completionNote = `Closed by ${HIRING_LINE_RULE_ID} on ${today}: this line is no longer owed an assessment (the line spoke, the candidate left the final/offer stage, the plan changed, or the requisition is no longer in flight). No evidence was recorded on anyone’s behalf.`;
      task.updatedAt = hookCtx.nowIso;
      closedN += 1;
    }
  }

  // 2. Issue bounded asks.
  let issuedN = 0;
  let deferredN = 0;
  let linkN = 0;
  let observedN = 0;
  const dueOn = addDays(today, conv.hiringLineAskDueDays);
  for (const [pairKey, { row, cand, line }] of owed) {
    if (openPairKeys.has(pairKey)) continue;
    const markerKey = `ask|${pairKey}`;
    // One ask per (candidate, manager, plan act), ever: a manager who closed or
    // returned it is not asked again until the plan is re-declared.
    if (draft.hiringLineMarkers?.some((m) => m && m.key === markerKey)) continue;
    if (issuedN >= HIRING_LINE_LIMITS.asksPerCommit) { deferredN += 1; continue; }

    const taskId = hookCtx.idFactory('dlg');
    const lineLabel = line.role === 'home' ? 'home line' : 'additional line';
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      id: taskId,
      personId: line.managerId,
      title: `Record your assessment of ${cand.candidateLabel} for ${row.title} (${line.state === 'unasked' ? 'never asked' : 'on the panel, silent'})`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, record your own structured evidence on ${cand.candidateLabel} for “${row.title}”, or have the line plan re-declared if this hire will not report to you. The plan declared on ${row.planDeclaredOn} names you as the ${lineLabel} manager; the candidate is at ${cand.stage} stage. ${line.reason}`.slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${HIRING_LINE_RULE_ID}. This ask does not block the offer and nobody else’s evidence credits your line. It closes automatically once your evidence is on the record.`.slice(0, 2000),
      delegatedOn: today,
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

    const edges = [
      { sourceType: 'requisition', sourceId: row.reqId, targetType: 'delegation', targetId: taskId, relation: 'concerns', summary: 'A declared reporting line has not assessed a decision-stage candidate on this requisition.' },
      { sourceType: 'candidate', sourceId: cand.candidateId, targetType: 'delegation', targetId: taskId, relation: 'issues-obligation', summary: `The ${lineLabel} manager owes this candidate an assessment before the offer closes.` },
    ];
    const node = matrix.nodes.get(line.managerId);
    for (const ancestorId of [...((node && node.ancestors) || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      edges.push({ sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId, relation: 'rolls-up-to', summary: 'A co-hiring line assessment ask rolls up to this leadership span.' });
    }
    for (const edge of edges) {
      const made = ensureEntityLink(draft, { ...edge, ruleId: HIRING_LINE_RULE_ID }, linkCtx);
      if (made.created) linkN += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey, kind: 'ask', pairKey, taskId, state: line.state,
      summary: `Issued co-hiring assessment ask ${taskId} to ${line.managerId} (${line.state}).`,
    });
    openPairKeys.add(pairKey);
    issuedN += 1;
  }

  // 3. A declared manager who left: observed, never substituted.
  for (const { row, cand, line } of observations) {
    if (recordMarker(draft, hookCtx, {
      key: `obs|${line.pairKey}`, kind: 'observation', pairKey: line.pairKey, taskId: null, state: 'unreadable',
      summary: `Declared ${line.role} line manager ${line.managerId} on requisition ${row.reqId} is no longer on the roster (candidate ${cand.candidateId}); abstained from asking anybody else.`,
    })) observedN += 1;
  }

  if (closedN > 0) noteEffect(hookCtx, out, 'completed', 'delegation', 'hiring-lines', `Closed ${closedN} co-hiring assessment ask(s) that are no longer owed.`);
  if (issuedN > 0) noteEffect(hookCtx, out, 'delegated', 'delegation', 'hiring-lines', `Issued ${issuedN} co-hiring assessment ask(s) to declared line managers, due by ${dueOn}.`);
  if (linkN > 0) noteEffect(hookCtx, out, 'linked', 'link', 'hiring-lines', `Recorded ${linkN} typed provenance edge(s) for co-hiring asks.`);
  if (observedN > 0) noteEffect(hookCtx, out, 'observed', 'hiringLineMarkers', 'hiring-lines', `Recorded ${observedN} observation(s) for declared lines whose manager left the roster.`);
  if (deferredN > 0) noteEffect(hookCtx, out, 'deferred', 'workspace', 'hiring-lines', `Deferred ${deferredN} co-hiring ask(s) beyond the per-commit cap (${HIRING_LINE_LIMITS.asksPerCommit}); run Scan to issue the remainder.`);
  return out;
}

hiringLineRule.id = 'hiringLineRule';
hiringLineRule.triggers = HIRING_LINE_TRIGGER_EVENTS;
