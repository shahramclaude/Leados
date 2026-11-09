/**
 * app/core/domain/priorityArbitrationRules.js — post-commit propagation for the
 * Cross-Line Priority Arbitration (`#/arbitration`, Schema v120, ADR-0143).
 *
 * RULE-ARB-01  THE AGREEMENT BECOMES WORK.
 *
 *   An arbitration only changes the world when the arbiter's precedence turns
 *   into owned, dated obligations that both lines can see and neither can
 *   pretend they did not receive. This rule is that transaction: on
 *   `arbitration.agreed` it writes, in the SAME atomic commit,
 *
 *     1. ONE owned delegation per demand the agreement sequenced, addressed to
 *        the person whose capacity the case is about, due on the agreement's
 *        effective end, carrying that demand's title and the line that placed
 *        it. The task is real work in the workspace, not a new parallel ledger;
 *     2. ONE governed decision recording the precedence itself, with the options
 *        the arbiter weighed, so "why is this first?" survives the fortnight;
 *     3. typed provenance only — `concerns` from the case to the person,
 *        `decides` from the case to the decision, `issues-obligation` from the
 *        case to each task, and `rolls-up-to` from the case to EVERY leadership
 *        ancestor in the matrix DAG. No record is copied into the edge.
 *
 * WHAT IT NEVER DOES
 * ------------------
 *  - It never fires on `arbitration.proposed`. A proposal is not an agreement;
 *    issuing work off a recommendation would make the product the decider, which
 *    is the one thing this module refuses (ADR-0140's rule, held here).
 *  - It never picks a demand the agreement did not sequence. Deferred, reshaped
 *    and released demands produce no obligation: their disposition is the
 *    record, and inventing work for them would contradict the agreement it just
 *    recorded.
 *  - It never edits the case. The rule reads the agreement and writes outward;
 *    a re-run is idempotent through `ensureEntityLink` and a per-agreement
 *    marker, so a rescanned workspace cannot issue the same obligation twice.
 *  - It never names a person in an edge summary beyond what a manager could
 *    already see: the summary states the demand title the line itself wrote.
 *  - It is INERT in a workspace with no arbitration case and on any other event,
 *    so a single-chain workspace that never opens a case gains no edges, no
 *    decisions and no tasks.
 */

import { dayKey, addDays } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { normalizePrioritySettings } from './priorityArbitrationSchema.js';
import {
  PRIORITY_EVENTS,
  PRIORITY_LIMITS,
  PRIORITY_RELATIONS,
} from './priorityArbitrationRegistry.js';

export const PRIORITY_SCAN_EVENT = 'arbitration.scan';
export const PRIORITY_RULE_ID = 'RULE-ARB-01';

const MAX_OBLIGATIONS_PER_COMMIT = 24;
const MAX_DECISION_NOTE = 1200;

function clampStr(v, max = 280) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: PRIORITY_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${PRIORITY_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, key, kind, summary) {
  if (!Array.isArray(draft.priorityArbitrationMarkers)) draft.priorityArbitrationMarkers = [];
  if (draft.priorityArbitrationMarkers.some((m) => m && m.key === key)) return false;
  draft.priorityArbitrationMarkers.push({
    key,
    at: ctx.now.toISOString(),
    ruleId: PRIORITY_RULE_ID,
    kind,
    detail: clampStr(summary, 300),
  });
  if (draft.priorityArbitrationMarkers.length > PRIORITY_LIMITS.markers) {
    draft.priorityArbitrationMarkers.splice(0, draft.priorityArbitrationMarkers.length - PRIORITY_LIMITS.markers);
  }
  return true;
}

/**
 * The obligations the rule will issue, computed from the STORED agreement only.
 * `sequenced` is the disposition that means "this demand takes the person's next
 * available capacity". Every other disposition is recorded and produces nothing.
 */
export function priorityObligations(caseRow) {
  const agreement = caseRow?.agreement;
  if (!agreement || !Array.isArray(caseRow.demands)) return [];
  const byId = new Map(caseRow.demands.map((d) => [d.id, d]));
  const already = new Set((agreement.issued || []).map((i) => i.demandId));
  const out = [];
  for (const demandId of agreement.rankedIds) {
    const demand = byId.get(demandId);
    if (!demand) continue;
    if (demand.treatment?.disposition !== 'sequenced') continue;
    if (already.has(demandId)) continue;
    out.push({
      demandId,
      managerId: demand.managerId,
      managerName: demand.managerName || demand.managerId,
      title: demand.title,
      dueOn: demand.dueOn && demand.dueOn > agreement.effectiveTo ? demand.dueOn : agreement.effectiveTo,
      kindLabel: demand.kindLabel || demand.kind || 'reporting',
    });
  }
  return out;
}

export function priorityArbitrationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (event.type !== PRIORITY_EVENTS.AGREE && event.type !== PRIORITY_SCAN_EVENT) return [];

  const cases = Array.isArray(draft.priorityArbitrations) ? draft.priorityArbitrations : [];
  if (!cases.length) return [];

  const conv = normalizePrioritySettings(draft.settings || {});
  const isExplicitScan = event.type === PRIORITY_SCAN_EVENT;
  if (conv.priorityAutoPropagate === false && !isExplicitScan) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const hookCtx = {
    ...ctx,
    now,
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };
  const today = dayKey(now);
  const out = [];

  // Only cases this event is about. An explicit scan walks every agreed case so
  // a deferred obligation (a cap hit on an earlier commit) can be retried.
  const targets = isExplicitScan
    ? cases.filter((c) => c && c.agreement)
    : cases.filter((c) => c && c.id === event.entityId && c.agreement);
  if (!targets.length) return [];

  // The matrix is built on the full workspace: the roll-up must reach the
  // ancestors of the person regardless of which seat happened to press agree.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  let obligationsIssued = 0;
  let deferredByCap = 0;
  let decisionsOpened = 0;
  let rollupEdges = 0;

  for (const caseRow of targets) {
    const agreement = caseRow.agreement;
    const personId = caseRow.personId;
    if (!personId || !matrix.nodes.has(personId)) continue;

    const node = matrix.nodes.get(personId);
    const personName = node?.name || caseRow.personName || personId;
    const managerNames = [...new Set((caseRow.demands || []).map((d) => d.managerName || d.managerId))];

    /* 1. Provenance edges: the case is a first-class node reachable from the
          person, from the decision, from every issued task and from every
          leadership ancestor in the matrix DAG. */
    const about = ensureEntityLink(draft, {
      sourceType: 'arbitration', sourceId: caseRow.id,
      targetType: 'person', targetId: personId,
      relation: PRIORITY_RELATIONS.about, ruleId: PRIORITY_RULE_ID,
      summary: `Cross-line precedence recorded for the work ${personName} is carrying for ${managerNames.length} line(s).`,
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso: now.toISOString() });
    if (about.created) rollupEdges += 1;

    const ancestors = [...(node.ancestors || new Set())];
    for (const ancestorId of ancestors) {
      const linked = ensureEntityLink(draft, {
        sourceType: 'arbitration', sourceId: caseRow.id,
        targetType: 'person', targetId: ancestorId,
        relation: PRIORITY_RELATIONS.rollup, ruleId: PRIORITY_RULE_ID,
        summary: 'Cross-line precedence rolls up to this leadership span through the matrix DAG.',
      }, { idFactory: ctx.idFactory, todayStr: today, nowIso: now.toISOString() });
      if (linked.created) rollupEdges += 1;
    }

    /* 2. The governed decision. Exactly one per agreement, keyed by a marker so
          a retry cannot open a second one. It records the precedence and the
          dissent that came with it — it does not decide anything itself. */
    const decisionId = `dec-priority-${caseRow.id}`;
    const decisionMarker = `decision|${caseRow.id}`;
    const hasDecision = Array.isArray(draft.decisions) && draft.decisions.some((d) => d && d.id === decisionId);
    if (!hasDecision && !recordMarker(draft, hookCtx, decisionMarker, 'decision', `Governed decision opened for case ${caseRow.id}.`)) {
      // Marker already present but decision missing (a hand-edited file):
      // re-open it rather than leaving an agreement with no record behind it.
    }
    if (!hasDecision) {
      draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
      const rankedTitles = agreement.rankedIds
        .map((id) => (caseRow.demands || []).find((d) => d.id === id))
        .filter(Boolean)
        .map((d, i) => `${i + 1}. ${d.title} (${d.managerName || d.managerId})`);
      draft.decisions.unshift({
        id: decisionId,
        title: `Which demand comes first for ${personName}, and until when?`.slice(0, 200),
        question: [
          `The arbiter recorded a cross-line precedence on ${agreement.at.slice(0, 10)} for ${personName}, who carries work for ${managerNames.join(' and ')}.`,
          `The agreed order: ${rankedTitles.join('; ')}.`,
          `Effective ${agreement.effectiveFrom} to ${agreement.effectiveTo}; review on ${agreement.reviewOn}.`,
          `The arbiter's rationale, in their own words: ${agreement.rationale}`,
          (caseRow.dissents || []).length
            ? `Recorded party answers: ${(caseRow.dissents || []).map((d) => `${d.seatId} answered ${d.stance}${d.reason ? ` (“${d.reason}”)` : ''}`).join('; ')}.`
            : 'No party answer was recorded on this agreement. That is printed rather than assumed.',
        ].join(' ').slice(0, MAX_DECISION_NOTE),
        date: today,
        reversibility: 'reversible',
        driver: agreement.bySeatId || '',
        approver: agreement.bySeatId || '',
        contributors: managerNames.join(', ').slice(0, 120),
        informed: '',
        options: [
          { id: ctx.idFactory('opt'), label: 'Hold the agreed precedence for its window', pros: 'Both lines are working from one written order, which is the whole point of the case.', cons: 'The deferred demand is now visibly late rather than quietly late.' },
          { id: ctx.idFactory('opt'), label: 'Re-open the case with fresh figures', pros: 'Cost of delay and job size change; the order should change with them.', cons: 'Costs another round between the two lines, and the person keeps carrying both demands meanwhile.' },
          { id: ctx.idFactory('opt'), label: 'Reduce the deferred demand’s scope to fit', pros: 'Both lines get delivery inside the same window.', cons: 'Somebody has to accept a smaller outcome than they asked for, in writing.' },
          { id: ctx.idFactory('opt'), label: 'Raise the capacity question to the joint apex', pros: 'If the total claim exceeds the person, only the span above both lines can settle it.', cons: 'Moves a decision that the two lines could have taken themselves.' },
        ],
        chosen: 'Hold the agreed precedence for its window',
        rationale: `ADR-0143: the arbiter recorded a cross-line precedence. This decision exists so the trade-off is a governed fact rather than a corridor conversation, and so the dismissed alternative — doing both — is written down.`,
        reviewOn: agreement.reviewOn,
        reviewedOn: null,
        outcome: 'pending',
        outcomeNotes: '',
        forecastProbability: null,
        decidedOn: agreement.at.slice(0, 10),
        createdAt: now.toISOString(),
      });
      decisionsOpened += 1;
      ensureEntityLink(draft, {
        sourceType: 'arbitration', sourceId: caseRow.id,
        targetType: 'decision', targetId: decisionId,
        relation: PRIORITY_RELATIONS.decision, ruleId: PRIORITY_RULE_ID,
        summary: 'The precedence is a governed decision, not a note.',
      }, { idFactory: ctx.idFactory, todayStr: today, nowIso: now.toISOString() });
    }

    /* 3. One owned task per SEQUENCED demand. Nothing else. */
    const obligations = priorityObligations(caseRow);
    draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
    for (const obligation of obligations) {
      if (obligationsIssued >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }
      const taskId = ctx.idFactory('dlg');
      const dueOn = obligation.dueOn || addDays(today, conv.priorityPrecedenceDays);
      draft.delegations.unshift({
        personId,
        id: taskId,
        title: `${obligation.title} — sequenced first by an agreed cross-line precedence`.slice(0, 200),
        expectedOutcome: `Delivered by ${dueOn}, because an arbiter recorded that this demand precedes the other line's demand for the window ending that day. The ordering is a recorded agreement, not a preference: see the arbitration case this task hangs off before re-prioritising it.`.slice(0, 2000),
        authority: 'act-inform',
        support: `Issued by ${PRIORITY_RULE_ID} in the same transaction that recorded the agreement. The ${obligation.kindLabel} line that placed the demand is ${obligation.managerName}.`,
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
        sourceType: 'arbitration', sourceId: caseRow.id,
        targetType: 'delegation', targetId: taskId,
        relation: PRIORITY_RELATIONS.issued, ruleId: PRIORITY_RULE_ID,
        summary: 'An agreed precedence issued this obligation.',
      }, { idFactory: ctx.idFactory, todayStr: today, nowIso: now.toISOString() });
      // The case stores a POINTER, never a copy: whether the task is still open is
      // re-read from the real delegation on every render.
      const target = (draft.priorityArbitrations || []).find((c) => c && c.id === caseRow.id);
      if (target && target.agreement) {
        target.agreement.issued = Array.isArray(target.agreement.issued) ? target.agreement.issued : [];
        if (!target.agreement.issued.some((i) => i.taskId === taskId)) {
          target.agreement.issued.push({ demandId: obligation.demandId, taskId, dueOn });
        }
      }
      obligationsIssued += 1;
    }
  }

  if (obligationsIssued) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'arbitration',
      `Issued ${obligationsIssued} owned obligation(s) from an agreed cross-line precedence; each points at its real task record.`);
  }
  if (decisionsOpened) {
    noteEffect(hookCtx, out, 'opened-decision', 'workspace', 'arbitration',
      `Opened ${decisionsOpened} governed decision(s) recording the agreed precedence.`);
  }
  if (rollupEdges) {
    noteEffect(hookCtx, out, 'rolled-up', 'workspace', 'arbitration',
      `Wrote ${rollupEdges} typed provenance or roll-up edge(s) for the agreed precedence.`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'arbitration',
      `${deferredByCap} obligation(s) remain unissued after the per-transaction cap of ${MAX_OBLIGATIONS_PER_COMMIT}. An explicit scan retries them; nothing was silently dropped.`);
  }
  return out;
}
