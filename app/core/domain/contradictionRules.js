/**
 * app/core/domain/contradictionRules.js — RULE-CNT-01, the Cross-Line
 * Contradiction Audit's one consequence (ADR-0144, Schema v121).
 *
 * THE DUTY. An audit that only prints is a dashboard. The duty a chief actually
 * performs when a contradiction is confirmed is one of two acts: run both lines
 * knowingly and accept the consequence, or make ONE named line change its
 * charter. Both acts must leave a governed record, and the second must leave
 * dated, owned work — otherwise "we decided to change it" is a corridor
 * conversation, and the contradiction comes back next quarter.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires ONLY on a recorded review (`contradiction.reviewed`) or an explicit
 *    scan. Never on a declaration: declaring a charter is not deciding what to do
 *    about its contradiction.
 *  - It opens EXACTLY ONE governed decision per review, carrying the finding's
 *    kind, severity, the declared integers that produced it and the chief's own
 *    reasoning. That decision is the record of a trade-off somebody accepted.
 *  - ONLY a `resequenced` verdict issues work: one dated delegation to the named
 *    line manager to revise that line's charter, pointing at the review rather
 *    than copying it. `accepted` and `withheld` issue nothing — accepting a
 *    trade-off is not assigning anybody a task, and pretending otherwise would
 *    put work in the record that nobody agreed to.
 *  - It writes typed provenance only (`concerns`, `decides`, `issues-obligation`,
 *    `rolls-up-to` per leadership ancestor), using the relations every other
 *    module already uses. It adds no second graph.
 *  - It NEVER edits a charter. The line manager does that through the governed
 *    action; the rule cannot revise an objective on anyone's behalf.
 *  - It is IDEMPOTENT: a per-review marker guards the decision and a
 *    per-review-per-line marker guards the obligation, so a rescan cannot double
 *    the record or the work.
 *  - It is INERT on every other event and in a workspace with no reviews.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildContradictionAudit } from './contradictionAudit.js';
import { buildMatrix } from './matrix.js';
import { normalizeContradictionSettings } from './contradictionSchema.js';
import {
  CONTRADICTION_ENGINE_VERSION,
  CONTRADICTION_EVENTS,
  CONTRADICTION_LIMITS,
  CONTRADICTION_RELATIONS,
  CONTRADICTION_RULE_ID,
  CONTRADICTION_SCAN_EVENT,
  contradictionFindingLabel,
  contradictionLeverLabel,
} from './contradictionRegistry.js';

const MAX_OBLIGATIONS_PER_COMMIT = 12;
const MAX_DECISION_NOTE = 1200;

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: CONTRADICTION_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${CONTRADICTION_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.contradictionMarkers)) draft.contradictionMarkers = [];
  if (draft.contradictionMarkers.some((m) => m && m.key === key)) return false;
  draft.contradictionMarkers.push({
    key,
    kind,
    summary: clampStr(summary, 280),
    at: ctx.now instanceof Date ? ctx.now.toISOString() : new Date().toISOString(),
  });
  if (draft.contradictionMarkers.length > CONTRADICTION_LIMITS.markers) {
    draft.contradictionMarkers.splice(0, draft.contradictionMarkers.length - CONTRADICTION_LIMITS.markers);
  }
  return true;
}

/** The printed severity in a sentence a reader can act on, without a score. */
function severityLine(finding) {
  switch (finding.severity) {
    case 'incompatible':
      return 'incompatible — shown from the declared figures';
    case 'tension':
      return 'tension — a declared trade-off, not a proof of impossibility';
    case 'isolated':
      return 'isolated — the charters pull against each other but no person sits on both lines';
    default:
      return 'insufficient evidence — a required figure was not declared';
  }
}

export function contradictionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (event.type !== CONTRADICTION_EVENTS.REVIEW && event.type !== CONTRADICTION_SCAN_EVENT) return [];

  const reviews = Array.isArray(draft.contradictionReviews) ? draft.contradictionReviews : [];
  if (!reviews.length) return [];

  const conv = normalizeContradictionSettings(draft.settings || {});
  const isExplicitScan = event.type === CONTRADICTION_SCAN_EVENT;
  if (conv.ctrAutoPropagate === false && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now);
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };

  // The audit is recomputed on the WHOLE workspace: a chief pressing "change one
  // line's charter" must produce the same finding the panel showed, whatever
  // seat happened to press the button.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const report = buildContradictionAudit(fullStateView, {
    now,
    settings: fullStateView.settings,
    seat: { id: null, name: '', label: '', fullAccess: true, readOnly: false },
  });
  const findingByKey = new Map();
  // The board slice is bounded for rendering; the rule needs every finding, so it
  // reads the engine's full list rather than the rendered one.
  for (const finding of report.allFindings || []) findingByKey.set(finding.key, finding);
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  const targets = isExplicitScan
    ? reviews
    : reviews.filter((r) => r && r.id === event.entityId);
  if (!targets.length) return [];

  const out = [];
  let decisionsOpened = 0;
  let obligationsIssued = 0;
  let deferredByCap = 0;
  let orphaned = 0;
  let rollupEdges = 0;

  for (const review of targets) {
    if (!review || !review.id) continue;
    if (review.verdict !== 'accepted' && review.verdict !== 'resequenced') continue;

    const finding = findingByKey.get(review.findingKey);
    if (!finding) {
      // The declarations changed after the ruling: the pair no longer exists.
      // The ruling stands as history, but no work is issued off a finding the
      // engine can no longer reproduce.
      orphaned += 1;
      continue;
    }

    const lineIds = [finding.lineAId, finding.lineBId].filter(Boolean);
    if (finding.subjectType === 'person') {
      for (const id of finding.lineIds || []) if (!lineIds.includes(id)) lineIds.push(id);
    }

    /* 1. Provenance: the review is a first-class node, reachable from each line
          it concerns and from every leadership ancestor in the matrix DAG. */
    for (const lineId of lineIds) {
      if (!lineId) continue;
      const linked = ensureEntityLink(draft, {
        sourceType: 'contradiction', sourceId: review.id,
        targetType: 'person', targetId: lineId,
        relation: CONTRADICTION_RELATIONS.line, ruleId: CONTRADICTION_RULE_ID,
        summary: `A cross-line contradiction audit ruling concerns this line (${contradictionFindingLabel(finding.kind)}).`,
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (linked.created) rollupEdges += 1;
      const node = matrix.nodes.get(lineId) || null;
      const ancestorIds = [...((node && node.ancestors) || [])];
      for (const ancestorId of ancestorIds) {
        const rolled = ensureEntityLink(draft, {
          sourceType: 'contradiction', sourceId: review.id,
          targetType: 'person', targetId: ancestorId,
          relation: CONTRADICTION_RELATIONS.rollup, ruleId: CONTRADICTION_RULE_ID,
          summary: 'A cross-line contradiction audit ruling rolls up to this leadership span.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
        if (rolled.created) rollupEdges += 1;
      }
    }

    /* 2. Exactly one governed decision per review. */
    const decisionId = `dec-contradiction-${review.id}`;
    const decisionMarker = `decision|${review.id}`;
    draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
    const hasDecision = draft.decisions.some((d) => d && d.id === decisionId);
    if (!hasDecision && recordMarker(draft, hookCtx, decisionMarker, 'decision', `Governed decision opened for contradiction ruling ${review.id}.`)) {
      const invoice = finding.kind === 'envelope-overclaim'
        ? `Declared claims sum to ${finding.claimSumBp} bp against 10000 bp of the envelope “${finding.envelopeName}”.`
        : finding.kind === 'incentive-oversubscription'
          ? `The line scorecards add up to ${finding.weightSumBp} bp of one person (${(finding.weightSumBp / 100).toFixed(2)}%).`
          : `The pair reads ${severityLine(finding)}${Number.isFinite(finding.queueMultiplier) ? `; at ${finding.utilisationTargetPct}% utilisation the queueing multiplier is ${finding.queueMultiplier.toFixed(2)}×` : ''}.`;
      draft.decisions.unshift({
        id: decisionId,
        title: `Do both lines keep this charter, or does one change? (${contradictionFindingLabel(finding.kind)})`.slice(0, 200),
        question: [
          `A cross-line contradiction audit ruling was recorded on ${review.decidedOn}.`,
          `Finding: ${contradictionFindingLabel(finding.kind)} — ${finding.headline || ''}`,
          invoice,
          `Verdict: ${review.verdict}.`,
          review.verdict === 'resequenced'
            ? `The line that must change is ${finding.lineAId === review.resequenceLineId ? finding.lineAName : finding.lineBName || review.resequenceLineId}.`
            : 'No line was told to change its charter; the consequence is accepted knowingly.',
          `The chief’s reasoning, in their own words: ${review.rationale}`,
        ].join(' ').slice(0, MAX_DECISION_NOTE),
        date: review.decidedOn || today,
        reversibility: 'reversible',
        driver: review.decidedBySeatId || '',
        approver: review.decidedBySeatId || '',
        contributors: lineIds.join(', ').slice(0, 120),
        informed: '',
        options: [
          { id: hookCtx.idFactory('opt'), label: 'Run both charters knowingly', pros: 'Nothing is disrupted and the trade-off is now a written fact instead of a private judgement.', cons: 'The line that loses the trade-off will keep losing it, and will bring the same argument back at the next review.' },
          { id: hookCtx.idFactory('opt'), label: 'Change one line’s charter', pros: 'Removes the contradiction at its source instead of re-arbitrating it every quarter.', cons: 'Somebody’s declared objective or incentive changes, in writing, and they may not welcome it.' },
          { id: hookCtx.idFactory('opt'), label: 'Withhold the ruling and gather evidence', pros: 'Honest when the declared figures are not yet trustworthy.', cons: 'The people caught between the lines keep carrying both criteria while the question stays open.' },
        ],
        chosen: review.verdict === 'resequenced' ? 'Change one line’s charter' : 'Run both charters knowingly',
        rationale: `ADR-0144: a contradiction between two declared line charters was ruled on. This decision exists so that the trade-off, and the alternative that was dismissed, are governed facts rather than corridor conversation.`,
        reviewOn: review.reviewOn || addDays(review.decidedOn || today, conv.ctrReviewDays),
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        decidedOn: review.decidedOn || today,
        createdAt: now.toISOString(),
      });
      decisionsOpened += 1;
      const target = (draft.contradictionReviews || []).find((r) => r && r.id === review.id);
      if (target) target.decisionId = decisionId;
      ensureEntityLink(draft, {
        sourceType: 'contradiction', sourceId: review.id,
        targetType: 'decision', targetId: decisionId,
        relation: CONTRADICTION_RELATIONS.decision, ruleId: CONTRADICTION_RULE_ID,
        summary: 'The ruling is a governed decision, not a note.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
    }

    /* 3. ONLY a resequence issues work, and only to the named line. */
    if (review.verdict !== 'resequenced' || !review.resequenceLineId) continue;
    const obligationMarker = `obligation|${review.id}|${review.resequenceLineId}`;
    if (draft.contradictionMarkers?.some?.((m) => m && m.key === obligationMarker)) continue;
    if (obligationsIssued >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

    const dueOn = review.reviewOn || addDays(review.decidedOn || today, conv.ctrReviewDays);
    const lineName = review.resequenceLineId === finding.lineAId ? finding.lineAName : finding.lineBName;
    const taskId = hookCtx.idFactory('dlg');
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    draft.delegations.unshift({
      personId: review.resequenceLineId,
      id: taskId,
      title: `Revise this line’s charter: ${contradictionLeverLabel(finding.lever) || contradictionFindingLabel(finding.kind)}`.slice(0, 200),
      expectedOutcome: `By ${dueOn}, ${lineName || 'this line'} has revised the objective or the declared weight that made its charter contradict the other line's, or has recorded in writing why it will not. The contradiction and the ruled trade-off hang off this task; re-declaring the charter without changing the underlying commitment is not a revision.`.slice(0, 2000),
      authority: 'act-inform',
      support: `Issued by ${CONTRADICTION_RULE_ID} in the same transaction that recorded the ruling. The finding is a property of two declared charters, not a judgement about the manager who declares it.`,
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
      sourceType: 'contradiction', sourceId: review.id,
      targetType: 'delegation', targetId: taskId,
      relation: CONTRADICTION_RELATIONS.issued, ruleId: CONTRADICTION_RULE_ID,
      summary: 'A recorded ruling issued this obligation to the named line.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: now.toISOString() });
    const targetReview = (draft.contradictionReviews || []).find((r) => r && r.id === review.id);
    if (targetReview) {
      targetReview.obligationIssued = Array.isArray(targetReview.obligationIssued) ? targetReview.obligationIssued : [];
      if (!targetReview.obligationIssued.some((i) => i.taskId === taskId)) {
        targetReview.obligationIssued.push({ taskId, lineId: review.resequenceLineId, dueOn });
      }
    }
    recordMarker(draft, hookCtx, obligationMarker, 'obligation', `Issued the charter-revision obligation for ruling ${review.id}.`);
    obligationsIssued += 1;
  }

  if (decisionsOpened) {
    noteEffect(hookCtx, out, 'opened-decision', 'workspace', 'contradiction',
      `Opened ${decisionsOpened} governed decision(s) recording a cross-line contradiction ruling.`);
  }
  if (obligationsIssued) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'contradiction',
      `Issued ${obligationsIssued} dated obligation(s) to the line named in a resequence ruling.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'contradiction',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for the recorded ruling.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'contradiction',
      `${deferredByCap} obligation(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  if (orphaned) {
    noteEffect(hookCtx, out, 'orphaned', 'workspace', 'contradiction',
      `${orphaned} ruling(s) no longer reproduce a finding because the declarations changed. The ruling stands as history; no work was issued from it.`);
  }
  return out;
}

export { CONTRADICTION_ENGINE_VERSION, CONTRADICTION_RULE_ID };
