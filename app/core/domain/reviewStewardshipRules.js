/**
 * app/core/domain/reviewStewardshipRules.js — RULE-SRV-01, Matrix Multi-Line
 * Review Stewardship's one consequence (ADR-0147, Schema v122).
 *
 * THE DUTY. A completed review in a matrix is not one manager's act. The step
 * the workspace has never taken is: before the packet is signed, make sure every
 * line the person sat on was ASKED. An audit trail that only prints a gap is a
 * dashboard; the duty a director performs is to see that a line was never
 * consulted and to put a dated, owned ask in front of somebody.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires ONLY on a completed review (`review.completed`) or an explicit
 *    scan. Never on a declaration: declaring a second line is not asking it.
 *  - It issues at most ONE owned, dated DELEGATION per unasked line per review,
 *    addressed to the manager who holds that line — the one person entitled to
 *    answer. It carries the review period and the due date, and points at the
 *    review rather than copying any of its content.
 *  - It writes typed provenance only (`concerns` from the review to the line's
 *    manager, `issues-obligation` from the review to the task, `rolls-up-to` per
 *    leadership ancestor in the matrix DAG), using the relations every other
 *    module already uses. It adds no second graph.
 *  - It DOES NOT issue work for a contested or unowned assessor: that is a
 *    matrix-declaration question the leader must resolve, and a task addressed to
 *    nobody would be a work item that can never close. It records the observation
 *    and stops.
 *  - It NEVER assesses anybody, never edits a rating, never opens a decision that
 *    pre-empts the assessor, and never marks a line answered.
 *  - It is IDEMPOTENT: a per-review-per-line marker guards each obligation, so a
 *    rescan cannot double the work.
 *  - It is INERT on every other event and in a single-chain workspace.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildReviewStewardship } from './reviewStewardship.js';
import { normalizeReviewStewardshipSettings } from './reviewStewardshipSchema.js';
import {
  REVIEW_STEWARDSHIP_EVENTS,
  REVIEW_STEWARDSHIP_LIMITS,
  REVIEW_STEWARDSHIP_RULE_ID,
  REVIEW_STEWARDSHIP_SCAN_EVENT,
  REVIEW_STEWARDSHIP_STATES,
} from './reviewStewardshipRegistry.js';

/**
 * A per-transaction cap, exactly as every other work-producing rule keeps. The
 * remainder is COUNTED and named; an explicit scan retries it. Nothing is
 * silently dropped.
 */
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const REVIEW_STEWARDSHIP_RELATIONS = Object.freeze([
  'concerns',
  'issues-obligation',
  'rolls-up-to',
]);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: REVIEW_STEWARDSHIP_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${REVIEW_STEWARDSHIP_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.reviewStewardshipMarkers)) draft.reviewStewardshipMarkers = [];
  if (draft.reviewStewardshipMarkers.some((m) => m && m.key === key)) return false;
  draft.reviewStewardshipMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  if (draft.reviewStewardshipMarkers.length > (REVIEW_STEWARDSHIP_LIMITS.markers || 400)) {
    draft.reviewStewardshipMarkers.splice(0, draft.reviewStewardshipMarkers.length - (REVIEW_STEWARDSHIP_LIMITS.markers || 400));
  }
  return true;
}

export function reviewStewardshipRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const isScan = event.type === REVIEW_STEWARDSHIP_SCAN_EVENT;
  // COMPLETION is the trigger, deliberately: this rule exists so the signature is
  // not the first moment anybody notices a line was never asked. An explicit scan
  // retries anything a previous cap deferred.
  if (!isScan && event.type !== REVIEW_STEWARDSHIP_EVENTS.COMPLETE) return [];

  const reviews = Array.isArray(draft.reviews) ? draft.reviews : [];
  if (!reviews.length) return [];
  const declaredLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declaredLines.length) return [];

  const conv = normalizeReviewStewardshipSettings(draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };

  const targets = isScan ? reviews : reviews.filter((r) => r && r.id === event.entityId);
  if (!targets.length) return [];

  // The read model is recomputed on the WHOLE workspace with the operator view,
  // so the work this rule issues matches what the panel showed the leader who
  // pressed Complete, whatever seat happened to press it.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;
  let refusedUnresolved = 0;

  for (const review of targets) {
    if (!review || !review.id) continue;

    const report = buildReviewStewardship(fullStateView, review, { now, settings: fullStateView.settings });
    if (!report.isMatrix) continue;

    // A contested or unowned assessor is a DECLARATION problem. Issue no work:
    // a task "ask this line" addressed to nobody would sit open forever, and the
    // panel already names every holder. RULE-MTX/RULE-CNT territory, not ours.
    if (report.assessorState === 'contested' || report.assessorState === 'unowned') {
      refusedUnresolved += 1;
      continue;
    }

    const unasked = report.periodLines.filter((l) => l.lineState === REVIEW_STEWARDSHIP_STATES.unasked);
    if (!unasked.length) continue;

    /* 1. Provenance from the review to every period line — the review CONCERNS
          each line it must reconcile, whether or not that line answered. */
    for (const line of report.periodLines) {
      const linked = ensureEntityLink(draft, {
        sourceType: 'review', sourceId: review.id,
        targetType: 'person', targetId: line.managerId,
        relation: 'concerns', ruleId: REVIEW_STEWARDSHIP_RULE_ID,
        summary: `This review covers a person on ${line.managerName}’s ${line.kind} line for the period.`,
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (linked.created) rollupEdges += 1;
    }

    /* 2. One owned, dated ask per unasked line, addressed to that line's holder. */
    for (const line of unasked) {
      const markerKey = `unasked|${review.id}|${line.key}`;
      if (draft.reviewStewardshipMarkers?.some?.((m) => m && m.key === markerKey)) continue;
      if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

      const dueOn = addDays(today, conv.reviewStewardshipAnswerDays);
      const taskId = hookCtx.idFactory('dlg');
      draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
      draft.delegations.unshift({
        id: taskId,
        personId: line.managerId,
        title: `Record your ${line.kind}-line input for ${report.personName}’s review (to ${review.periodEnd})`.slice(0, 200),
        expectedOutcome: `By ${dueOn}, ${line.managerName} has recorded, in their own words, what this line observed of ${report.personName} between ${review.periodStart} and ${review.periodEnd} — or has declined with a stated reason. The review packet was completed without this line being consulted; this task exists so that fact is owned rather than discovered later. Recording the input does not change the completed assessment, which the assessor alone may revise.`.slice(0, 2000),
        authority: 'act-inform',
        support: `Issued by ${REVIEW_STEWARDSHIP_RULE_ID} in the same transaction that completed the review. A line that was never asked is a gap in the record, not a judgement about the manager who was not asked.`,
        delegatedOn: today,
        dueOn,
        status: 'active',
        checkins: [],
        completedOn: null,
        completionNote: '',
        returnedOn: null,
        returnReason: '',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      ensureEntityLink(draft, {
        sourceType: 'review', sourceId: review.id,
        targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: REVIEW_STEWARDSHIP_RULE_ID,
        summary: 'The unasked line was issued a dated ask by the review-stewardship rule.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });

      // The task rolls up every leadership ancestor of the line's holder, so the
      // director above sees the same obligation the manager was given.
      const node = matrix.nodes.get(line.managerId) || null;
      for (const ancestorId of [...((node && node.ancestors) || [])]) {
        const rolled = ensureEntityLink(draft, {
          sourceType: 'delegation', sourceId: taskId,
          targetType: 'person', targetId: ancestorId,
          relation: 'rolls-up-to', ruleId: REVIEW_STEWARDSHIP_RULE_ID,
          summary: 'An unasked review line rolls up to this leadership span.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
        if (rolled.created) rollupEdges += 1;
      }

      recordMarker(draft, hookCtx, markerKey, 'obligation',
        `Issued the review-stewardship ask for line ${line.key} on review ${review.id}.`);
      obligations += 1;
    }
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'reviews',
      `Issued ${obligations} dated ask(s) to reporting lines that a completed review never consulted.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'reviews',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for review stewardship.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'reviews',
      `${deferredByCap} unasked line(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  if (refusedUnresolved) {
    noteEffect(hookCtx, out, 'refused-unresolved-assessor', 'workspace', 'reviews',
      `${refusedUnresolved} completed review(s) have a contested or undeclared assessor. No ask was issued: the line's entitlement to answer is unresolved, so a task would be addressed to nobody.`);
  }
  return out;
}
