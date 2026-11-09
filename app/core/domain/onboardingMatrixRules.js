/**
 * app/core/domain/onboardingMatrixRules.js — RULE-ONB-01, Matrix Onboarding
 * Completeness's one consequence (ADR-0150, Schema v125).
 *
 * THE DUTY. Onboarding a person into a matrix is not one manager's act, and the
 * step no workspace takes is the boring one: make sure every line the person
 * landed on has SAID, in writing, what it expects of them. A dashboard that only
 * prints "never briefed" leaves the gap exactly where it was. The duty a director
 * performs is to see that a line was never asked and to put a dated, owned
 * obligation in front of the one person entitled to answer it.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on a created or updated plan, on a declared second line and on an
 *    explicit scan. It NEVER fires on a read and never on an acknowledgement:
 *    acknowledging a brief is not a reason to ask the same line again.
 *  - For every line in force that has written nothing, it issues ONE owned, dated
 *    DELEGATION to the manager who holds that line, naming the person, the window
 *    and the due date. The due date is the plan's own brief deadline when that is
 *    still ahead, and "the declared window from today" when it has already passed
 *    — an ask with a due date in the past is not an ask.
 *  - For every brief that stands unacknowledged, it issues ONE dated ask to the
 *    PERSON — the acknowledgement is theirs, and a manager cannot give it.
 *  - It writes typed provenance only (`concerns` from the person to each line's
 *    manager, `issues-obligation` from the person to the task, `rolls-up-to` per
 *    leadership ancestor in the matrix DAG). No second graph.
 *  - It DOES NOT issue work when the person holds two concurrent plans for the
 *    same kind: that is a declaration the leader must settle, and work addressed
 *    to "which of these two plans" would be a task that can never close. It also
 *    issues NOTHING for a presumed home line: a presumption is printed, not chased.
 *  - It never writes a brief, never acknowledges one, never invents a plan and
 *    never rates the person.
 *  - It is IDEMPOTENT through a per-obligation marker, bounded by a
 *    per-transaction cap whose remainder is counted and retried by a scan, and
 *    INERT in a single-chain workspace.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildOnboardingMatrix } from './onboardingMatrix.js';
import { normalizeOnboardingMatrixSettings } from './onboardingMatrixSchema.js';
import {
  ONBOARDING_MATRIX_EVENTS,
  ONBOARDING_MATRIX_LIMITS,
  ONBOARDING_MATRIX_RULE_ID,
  ONBOARDING_MATRIX_SCAN_EVENT,
  ONBOARDING_MATRIX_STATES,
} from './onboardingMatrixRegistry.js';

/** A per-transaction cap, exactly as every other work-producing rule keeps. */
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const ONBOARDING_MATRIX_RELATIONS = Object.freeze([
  'concerns',
  'issues-obligation',
  'rolls-up-to',
]);

const TRIGGERS = new Set([
  ONBOARDING_MATRIX_EVENTS.PLAN_CREATED,
  ONBOARDING_MATRIX_EVENTS.PLAN_UPDATED,
  ONBOARDING_MATRIX_EVENTS.LINE_DECLARED,
  ONBOARDING_MATRIX_SCAN_EVENT,
]);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: ONBOARDING_MATRIX_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ONBOARDING_MATRIX_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.onboardingLineBriefMarkers)) draft.onboardingLineBriefMarkers = [];
  if (draft.onboardingLineBriefMarkers.some((m) => m && m.key === key)) return false;
  draft.onboardingLineBriefMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  if (draft.onboardingLineBriefMarkers.length > ONBOARDING_MATRIX_LIMITS.markers) {
    draft.onboardingLineBriefMarkers.splice(
      0,
      draft.onboardingLineBriefMarkers.length - ONBOARDING_MATRIX_LIMITS.markers,
    );
  }
  return true;
}

/** One dated delegation, addressed to exactly one person, pointing at the record. */
function pushDelegation(draft, ctx, { personId, title, expectedOutcome, support, dueOn, authority = 'act-inform' }) {
  const taskId = ctx.idFactory('dlg');
  const nowIso = ctx.now.toISOString();
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId,
    title: clampStr(title, 200),
    expectedOutcome: clampStr(expectedOutcome, 2000),
    authority,
    support: clampStr(support, 2000),
    delegatedOn: dayKey(ctx.now),
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
  return taskId;
}

export function onboardingMatrixRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  const isScan = event.type === ONBOARDING_MATRIX_SCAN_EVENT;
  if (!isScan && !TRIGGERS.has(event.type)) return [];

  const plans = Array.isArray(draft.onboarding) ? draft.onboarding : [];
  if (!plans.length) return [];
  const declaredLines = Array.isArray(draft.reportingLines) ? draft.reportingLines : [];
  if (!declaredLines.length) return [];

  const conv = normalizeOnboardingMatrixSettings(draft.settings || {});
  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };

  // The read model is recomputed on the WHOLE workspace with the operator view, so
  // the work this rule issues matches what the panel showed the leader, whatever
  // seat happened to trigger the commit.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const board = buildOnboardingMatrix(fullStateView, { now, settings: fullStateView.settings, limit: 0 });
  if (!board.caseN) return [];
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;
  let refusedDuplicates = 0;
  let refusedNoPlan = 0;
  let acknowledgedAsks = 0;

  for (const kase of board.cases) {
    if (!kase || !kase.personId) continue;

    /* A person with two concurrent plans of the same kind is a DECLARATION
       problem. Work addressed to "which of these two plans" could never close, so
       nothing is issued and the case is counted as refused. */
    if (kase.duplicatePlanIds.length) {
      refusedDuplicates += 1;
      continue;
    }

    /* A matrix person with no plan at all: the finding is the missing plan, and it
       belongs to the leader who must decide whether one is opened. This rule does
       not invent a plan, so it issues no brief obligation against an imaginary
       window. */
    if (!kase.hasPlan) {
      refusedNoPlan += 1;
      continue;
    }

    const lines = kase.windowLines || [];
    const unbriefed = lines.filter((l) => l.state === ONBOARDING_MATRIX_STATES.unbriefed);
    const awaiting = lines.filter((l) => l.state === ONBOARDING_MATRIX_STATES.awaitingBrief);
    const unacknowledged = lines.filter((l) => l.brief
      && l.brief.outcome === 'brief'
      && !l.brief.acknowledgedOn);

    if (!unbriefed.length && !awaiting.length && !unacknowledged.length) continue;

    /* 1. Provenance from the person to every line they sat on — the onboarding
          CONCERNS each line, whether or not that line has spoken. */
    for (const line of lines) {
      const linked = ensureEntityLink(draft, {
        sourceType: 'person', sourceId: kase.personId,
        targetType: 'person', targetId: line.managerId,
        relation: 'concerns', ruleId: ONBOARDING_MATRIX_RULE_ID,
        summary: `This onboarding covers a person on ${line.managerName}’s ${line.kind} line for the 90-day window.`,
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (linked.created) rollupEdges += 1;
    }

    /* 2. One owned, dated brief obligation per line that has written nothing. The
          home line is EXCLUDED deliberately: its obligations are presumed to be
          the plan itself, and a presumption is printed rather than chased. */
    for (const line of [...unbriefed, ...awaiting]) {
      if (line.role === 'primary') continue;
      const markerKey = `brief|${kase.planId}|${line.key}`;
      if (draft.onboardingLineBriefMarkers?.some?.((m) => m && m.key === markerKey)) continue;
      if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }
      const dueOn = line.briefDueOn && line.briefDueOn > today
        ? line.briefDueOn
        : addDays(today, conv.onboardingBriefDays);
      const title = `Write your ${line.kind}-line onboarding brief for ${kase.personName}`;
      const expectedOutcome = `By ${dueOn}, ${line.managerName} has recorded, in writing, what ${kase.personName} owes this line during onboarding — the scope, the first piece of work, and the people they must meet on it — or has declined with a stated reason. Nothing in this workspace has said what this line expects while the person is being onboarded into it, and a 30-60-90 plan written by one line cannot speak for another.`;
      const support = `Issued by ${ONBOARDING_MATRIX_RULE_ID} in the same transaction that created or changed the plan. A line nobody asked is a gap in the record, not a judgement about the manager who was not asked, and not a discount on the person.`;
      const taskId = pushDelegation(draft, hookCtx, { personId: line.managerId, title, expectedOutcome, support, dueOn });
      ensureEntityLink(draft, {
        sourceType: 'person', sourceId: kase.personId,
        targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: ONBOARDING_MATRIX_RULE_ID,
        summary: 'A line with no onboarding brief was issued a dated obligation by the onboarding rule.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      const node = matrix.nodes.get(line.managerId) || null;
      for (const ancestorId of [...((node && node.ancestors) || [])]) {
        const rolled = ensureEntityLink(draft, {
          sourceType: 'delegation', sourceId: taskId,
          targetType: 'person', targetId: ancestorId,
          relation: 'rolls-up-to', ruleId: ONBOARDING_MATRIX_RULE_ID,
          summary: 'An unbriefed onboarding line rolls up to this leadership span.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
        if (rolled.created) rollupEdges += 1;
      }
      recordMarker(draft, hookCtx, markerKey, 'obligation',
        `Issued the onboarding brief obligation for line ${line.key} on plan ${kase.planId}.`);
      obligations += 1;
    }

    /* 3. One dated acknowledgement ask to the PERSON per standing brief. Addressed
          to the person because the acknowledgement is theirs; a manager cannot
          give it, and the person may have no other prompt to read it. */
    for (const line of unacknowledged) {
      // The marker names the BRIEF, not the line: a re-brief is a new text and the
      // person must be asked again about it.
      const markerKey = `ack|${line.brief.id}`;
      if (draft.onboardingLineBriefMarkers?.some?.((m) => m && m.key === markerKey)) continue;
      if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }
      const dueOn = line.ackDueOn && line.ackDueOn > today
        ? line.ackDueOn
        : addDays(today, conv.onboardingAcknowledgeDays);
      const taskId = pushDelegation(draft, hookCtx, {
        personId: kase.personId,
        title: `Read and acknowledge ${line.managerName}’s onboarding brief for your ${line.kind} line`,
        expectedOutcome: `By ${dueOn}, you have read what the ${line.kind} line expects of you (written ${line.brief.declaredOn}) and acknowledged it — or told that line what does not fit. An expectation set by one party is not an agreement between two, and this workspace will not record it as one until you have answered.`,
        support: `Issued by ${ONBOARDING_MATRIX_RULE_ID} when the brief was written. Acknowledging is your own act: nobody else can give it for you.`,
        dueOn,
        authority: 'act-inform',
      });
      ensureEntityLink(draft, {
        sourceType: 'person', sourceId: kase.personId,
        targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: ONBOARDING_MATRIX_RULE_ID,
        summary: 'An unacknowledged onboarding brief was issued a dated acknowledgement ask to the person.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      const node = matrix.nodes.get(kase.personId) || null;
      for (const ancestorId of [...((node && node.ancestors) || [])]) {
        const rolled = ensureEntityLink(draft, {
          sourceType: 'delegation', sourceId: taskId,
          targetType: 'person', targetId: ancestorId,
          relation: 'rolls-up-to', ruleId: ONBOARDING_MATRIX_RULE_ID,
          summary: 'An unacknowledged onboarding brief rolls up to this leadership span.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
        if (rolled.created) rollupEdges += 1;
      }
      recordMarker(draft, hookCtx, markerKey, 'acknowledgement',
        `Issued the acknowledgement ask for brief ${line.brief.id} on plan ${kase.planId}.`);
      obligations += 1;
      acknowledgedAsks += 1;
    }
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'onboarding',
      `Issued ${obligations} dated onboarding obligation(s): ${obligations - acknowledgedAsks} to lines that wrote nothing and ${acknowledgedAsks} to the people who must acknowledge a brief.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'onboarding',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for matrix onboarding.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'onboarding',
      `${deferredByCap} onboarding obligation(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  if (refusedDuplicates) {
    noteEffect(hookCtx, out, 'refused-duplicate-plans', 'workspace', 'onboarding',
      `${refusedDuplicates} onboarding case(s) hold two concurrent plans for one person. No ask was issued: which plan owns the onboarding is a declaration only the leader can settle.`);
  }
  if (refusedNoPlan) {
    noteEffect(hookCtx, out, 'refused-no-plan', 'workspace', 'onboarding',
      `${refusedNoPlan} person(s) sit on more than one line with no active 30-60-90 plan. No brief was asked for: this rule does not invent a plan, and an obligation against an imaginary window could never close.`);
  }
  return out;
}
