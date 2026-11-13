/**
 * app/core/domain/aarCorroborationRules.js — `RULE-AAC-01` on the shared
 * post-commit spine (ADR-0188, Schema v149).
 *
 * TWO CONDITIONS, both derived from the one reader, never from a second
 * computation:
 *
 *   1. `corroboration-overdue` — a dated request to a line holder passed its due
 *      date with no first-person answer. Silence is the condition; it is never
 *      read as agreement, so the rule files one sequenced ask rather than
 *      closing anything.
 *   2. `lesson-parity` — a lesson's adoption parity is `parity-broken` (a touched
 *      holder refused) or `parity-open` past the declared `adoptWarnDays` window.
 *
 * Both asks are addressed to the JOINT APEX of the line holders involved —
 * `matrixJointApex` over the holders who owe an answer or an adoption. Never to
 * the affected person, who cannot rule on their own review, and never to one
 * holder alone, who cannot rule on a peer. An ambiguous or disconnected apex is
 * COUNTED AND PRINTED as an identity-free `matrixMarkers` observation; the home
 * line is never substituted for it.
 *
 * The rule writes only `delegations` (with `matrixAarAsks` bookkeeping in the
 * summary), typed links, and `matrixMarkers`. It never edits a review, an answer,
 * an adoption or a lesson state. It is marker-idempotent, closes its own asks
 * when the condition clears, never re-asks a condition a human closed, honours
 * the automation pause switch, and is inert on an empty roster.
 */

import { dayKey } from '../time.js';
import { matrixJointApex } from './matrix.js';
import { buildAarCorroborationReport } from './aarCorroboration.js';
import {
  AAR_CORROBORATION_CLOSED_PREFIX,
  AAR_CORROBORATION_RULE_ID,
} from './aarCorroborationRegistry.js';
import {
  AAR_CORROBORATION_ASK_SUMMARY_PREFIX,
  aarCorroborationSignature,
  normalizeAarCorroborationSettings,
  parseAarCorroborationAskSummary,
} from './aarCorroborationSchema.js';
import { AAR_CORROBORATION_LIMITS } from './aarCorroborationRegistry.js';

/** Event types that can change the derived conditions. */
const SCANS = new Set(['learning.aar.corroboration.scan']);

function noteEffect(ctx, out, action, entity, entityId, summary) {
  if (typeof ctx?.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: 'learning',
      entityId,
      summary,
      meta: { ruleId: AAR_CORROBORATION_RULE_ID, action, target: entity },
    });
  }
  out.push({ ruleId: AAR_CORROBORATION_RULE_ID, action, entity, entityId, summary });
}

/** Index a rule's existing asks by the condition signature they answer. */
function indexAsks(draft) {
  const tasks = Array.isArray(draft?.delegations) ? draft.delegations : [];
  const out = [];
  for (const task of tasks) {
    const parsed = parseAarCorroborationAskSummary(task?.summary);
    if (!parsed) continue;
    out.push({ signature: parsed.signature, task });
  }
  return out;
}

function pushMarker(draft, key, at, kind, detail) {
  draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
  if (draft.matrixMarkers.some((marker) => marker && marker.key === key)) return false;
  draft.matrixMarkers.push({ key, at, ruleId: AAR_CORROBORATION_RULE_ID, kind, detail: String(detail || '').slice(0, 300) });
  // The marker ledger is shared with every other matrix rule; keep the same
  // bounded shape the rest of the spine uses rather than growing without limit.
  const cap = 400;
  if (draft.matrixMarkers.length > cap) {
    draft.matrixMarkers.splice(0, draft.matrixMarkers.length - cap);
  }
  return true;
}

function pushLink(draft, { sourceType, sourceId, targetType, targetId, relation, summary }, ctx) {
  draft.links = Array.isArray(draft.links) ? draft.links : [];
  draft.links.push({
    id: typeof ctx?.idFactory === 'function' ? ctx.idFactory('link') : `link-${Date.now()}`,
    sourceType,
    sourceId,
    targetType,
    targetId,
    relation,
    ruleId: AAR_CORROBORATION_RULE_ID,
    summary,
    createdAt: ctx?.nowIso || new Date().toISOString(),
  });
}

/**
 * The conditions this commit creates. Exported separately so the test suite can
 * enumerate them without going through the store.
 */
export function aarCorroborationConditions(report) {
  const out = [];
  for (const row of report?.rows || []) {
    if (row.state === 'overdue' && row.requestId && row.holderId) {
      out.push({
        kind: 'corroboration-overdue',
        reviewId: row.reviewId,
        holderId: row.holderId,
        personId: row.personId || null,
        detail: `${row.holderName || 'A line holder'} was asked by ${row.dueOn} and has not answered about “${row.subjectLabel}”.`,
      });
    }
  }
  for (const lesson of report?.lessons || []) {
    if (lesson.parityVerdict !== 'parity-broken' && !(lesson.parityVerdict === 'parity-open' && lesson.parityStale)) {
      continue;
    }
    const owing = (lesson.lines || [])
      .filter((line) => line.state === 'refused' || line.state === 'not-asked')
      .map((line) => line.managerId)
      .filter(Boolean);
    out.push({
      kind: 'lesson-parity',
      reviewId: lesson.reviewId,
      lessonId: lesson.lessonId,
      holderId: null,
      owingHolderIds: [...new Set(owing)].sort(),
      detail: lesson.parityVerdict === 'parity-broken'
        ? `A touched line refused to adopt the lesson from “${lesson.subjectLabel}”.`
        : `A touched line has not adopted the lesson from “${lesson.subjectLabel}” within the declared window.`,
    });
  }
  return out;
}

export function aarCorroborationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  const isScan = SCANS.has(event.type);
  // Only events that can move a line set, a review or an answer are worth a read.
  const relevant = isScan
    || event.type.startsWith('learning.aar.corroboration.')
    || event.type.startsWith('person.')
    || event.type.startsWith('link.')
    || event.type.startsWith('learning.')
    || event.type.startsWith('matrix.');
  if (!relevant) return [];

  // A PAUSE IS A PAUSE. Every other rule on this spine honours its own switch on
  // every path, and this one does too: a workspace that turned corroboration
  // automation off must not see asks appear because somebody pressed "scan".
  // The explicit scan is a retry of the ASK CAP, not an override of the pause.
  const conv = normalizeAarCorroborationSettings(draft.settings || {});
  if (conv.aarCorroborationAutoPropagate === false) return [];

  const people = Array.isArray(draft.people) ? draft.people : [];
  if (!people.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  // Whole-workspace view so the accountable seat receives its ask regardless of
  // which seat happened to trigger the commit. The READER is the single source of
  // truth for every state below: the rule never re-derives a corroboration state,
  // a staleness verdict or a parity verdict of its own.
  const wholeSettings = { ...(draft.settings || {}), activeSeatId: null };
  let report;
  let matrix;
  try {
    report = buildAarCorroborationReport(draft, { now, settings: wholeSettings, detailLevel: 'full' });
    matrix = report?.matrix || null;
  } catch {
    return [];
  }
  if (!report) return [];
  if (!matrix) {
    // The reader could not build the graph. Nothing is substituted.
    pushMarker(draft, `aac1:nograph:${today}`, nowIso, 'aar-corroboration',
      'The reporting graph could not be read; no corroboration ask was filed.');
    return [];
  }

  const conditions = aarCorroborationConditions(report);
  const existingAsks = indexAsks(draft);
  const openAsks = existingAsks.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const out = [];

  // File everything under one condition signature so closure and re-asking are
  // symmetric: a condition not present this commit closes its open ask.
  const live = new Map();
  for (const condition of conditions) {
    const signature = aarCorroborationSignature([
      condition.kind, condition.reviewId, condition.lessonId || '', condition.holderId || '',
      ...(condition.owingHolderIds || []),
    ].join('|'));
    live.set(signature, condition);
  }

  /* 1. Close asks whose condition has cleared. */
  for (const ask of openAsks) {
    if (live.has(ask.signature)) continue;
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${AAR_CORROBORATION_CLOSED_PREFIX} the corroboration gap or lesson-parity condition this ask answered no longer holds.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, 'Closed an AAR corroboration ask: the condition cleared.');
  }

  const liveSignatures = new Set(live.keys());
  const alreadyOpen = new Set(openAsks.filter((ask) => liveSignatures.has(ask.signature)).map((ask) => ask.signature));

  let filed = 0;
  let ambiguous = 0;
  let unattributed = 0;

  for (const [signature, condition] of live) {
    if (alreadyOpen.has(signature)) continue;
    if (filed >= AAR_CORROBORATION_LIMITS.asksPerCommit) {
      // Bounded per commit; the remainder is picked up by the next commit or an
      // explicit scan, and the count is printed rather than silently dropped.
      break;
    }

    // Whose accountability this condition sits under. A single overdue holder is
    // one line; a parity condition is every holder who owes an adoption.
    const nodeIds = condition.kind === 'corroboration-overdue'
      ? [condition.holderId].filter(Boolean)
      : (condition.owingHolderIds || []).filter((id) => matrix.nodes?.has?.(id));
    const apex = matrixJointApex(matrix, nodeIds);
    if (!apex.unique || !apex.apexId) {
      // An unresolved apex is recorded as an identity-free observation. The rule
      // will not hand a peer's account to the home line to rule on.
      if (apex.disconnected) ambiguous += 1; else unattributed += 1;
      pushMarker(
        draft,
        `aac1:apex:${signature}`,
        nowIso,
        'aar-corroboration',
        apex.disconnected
          ? 'A corroboration or parity condition crosses spans with no joint apex; nobody was asked to rule on a peer’s account.'
          : 'A corroboration or parity condition has no attributable holder on the reporting graph; nothing was substituted.',
      );
      continue;
    }
    // A single-holder condition has that holder as its own joint apex, and that
    // is exactly right: the ask is addressed to the person who owes the answer,
    // not to somebody above them. Asking an ancestor to answer for a line they do
    // not hold would be the substitution this register refuses.

    const taskId = idFactory('del');
    const dueOn = today;
    const task = {
      id: taskId,
      title: condition.kind === 'corroboration-overdue'
        ? 'Answer the cross-line after-action corroboration owed on your line'
        : 'Settle lesson-adoption parity across the lines the lesson touches',
      personId: apex.apexId,
      status: 'active',
      authority: 'act-inform',
      priority: 'medium',
      openedOn: today,
      dueOn,
      ruleId: AAR_CORROBORATION_RULE_ID,
      summary: `${AAR_CORROBORATION_ASK_SUMMARY_PREFIX} ${signature}`,
      detail: `${condition.detail} This is a sequenced ask, not a finding about any person: answering records a first-person line answer or an adoption, and refusing records a reason. Nothing here edits the review.`,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    if (draft.delegations.length > 2000) {
      pushMarker(draft, `aac1:cap:${signature}`, nowIso, 'aar-corroboration', 'The delegation ledger holds its declared cap; no AAR corroboration ask was filed.');
      continue;
    }
    draft.delegations.push(task);
    pushLink(draft, {
      sourceType: 'delegation',
      sourceId: taskId,
      targetType: 'lesson',
      targetId: condition.lessonId || `account:${condition.reviewId}`,
      relation: 'tracks-followup',
      summary: 'Sequenced ask to answer a cross-line corroboration or satisfy lesson-adoption parity.',
    }, ctx);
    pushLink(draft, {
      sourceType: 'delegation',
      sourceId: taskId,
      targetType: 'person',
      targetId: apex.apexId,
      relation: 'escalates-from',
      summary: 'The accountable joint apex of the line holders involved.',
    }, ctx);
    filed += 1;
    noteEffect(ctx, out, 'created', 'delegation', taskId,
      condition.kind === 'corroboration-overdue'
        ? 'Filed a bounded ask to answer an overdue cross-line corroboration.'
        : 'Filed a bounded ask to settle lesson-adoption parity.');
    if (filed >= AAR_CORROBORATION_LIMITS.asksPerCommit) break;
  }

  // The rule reports what it chose not to do, so a bounded commit cannot look
  // like a complete one.
  if (filed >= AAR_CORROBORATION_LIMITS.asksPerCommit && live.size > filed) {
    pushMarker(draft, `aac1:bound:${today}`, nowIso, 'aar-corroboration',
      `Ask cap reached for ${today}: ${live.size - filed} further condition(s) wait for the next commit or an explicit scan.`);
  }

  return out;
}

aarCorroborationRule.id = 'aarCorroborationRule';

export const AAR_CORROBORATION_RULE_META = Object.freeze({
  id: AAR_CORROBORATION_RULE_ID,
  label: 'Cross-line after-action corroboration & lesson-adoption parity',
  adr: 'ADR-0188',
});
