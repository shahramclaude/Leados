/**
 * app/core/domain/meritEvidenceRules.js — RULE-MEV-01, the Cross-Line
 * Review-Evidence Join's one consequence (ADR-0166, Schema v133).
 *
 * THE DUTY. A screen that prints "the second line was never asked" is a
 * dashboard. The duty a director performs is to put a dated, owned question in
 * front of the ONE person who can answer it, before the money that rests on that
 * evidence becomes unchangeable history — and, once the cycle is FINALISED, to
 * stop pretending anything can be fixed and instead name the correction path.
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * ------------------------------------
 *  - It fires on a cycle FINALISATION (`comp.cycle.finalized`), on a completed
 *    review (`review.completed`, because a review that closes with an unasked
 *    line is the same defect one step earlier) and on an explicit scan. Never on
 *    a read.
 *  - For a pay decision whose evidence state is OPEN it issues AT MOST ONE owned,
 *    dated delegation, addressed to the manager who HOLDS the person's HOME line
 *    on the effective date — the one seat that both owns the pay decision and can
 *    reach the other line. A task addressed to a contested set of holders would
 *    be a task that can never close, so contested assessors issue nothing and are
 *    counted.
 *  - Two DIFFERENT asks, because two different things can still be done:
 *      · before finalisation — "obtain the missing line input before the money
 *        lands", which can still change the decision;
 *      · after finalisation  — "record the correction path": the decision is
 *        frozen (ADR-0155), so the ask is to document how the gap is to be
 *        remedied and, where the finding survives, to carry it to the next cycle.
 *    A single word for both would be the collapse this workspace refuses.
 *  - It writes typed provenance only (`issues-obligation` from the pay decision's
 *    review to the task, `rolls-up-to` per leadership ancestor in the matrix
 *    DAG), the relations every other module already uses. No second graph.
 *  - It NEVER re-opens a review, never edits a rating, never re-runs a merit
 *    decision, never changes a pay figure, and never marks a line asked. A line
 *    is asked by a human asking it.
 *  - It is IDEMPOTENT through a per-cycle-per-decision marker, BOUNDED by a
 *    per-transaction cap whose remainder is counted and retried by the scan, and
 *    INERT in a single-chain workspace and on every other event.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildMeritEvidenceJoin } from './meritEvidence.js';
import { meritEvidenceState } from './meritEvidenceRegistry.js';

export const MERIT_EVIDENCE_RULE_ID = 'RULE-MEV-01';
export const MERIT_EVIDENCE_SCAN_EVENT = 'merit.evidence.scan';
export const MERIT_EVIDENCE_TASK_DAYS = 14;
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const MERIT_EVIDENCE_RELATIONS = Object.freeze(['issues-obligation', 'rolls-up-to']);

const TRIGGERS = Object.freeze([
  'comp.cycle.finalized',
  'review.completed',
  MERIT_EVIDENCE_SCAN_EVENT,
]);

function clampStr(value, max = 280) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: MERIT_EVIDENCE_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${MERIT_EVIDENCE_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, entry) {
  if (!Array.isArray(draft.meritEvidenceMarkers)) draft.meritEvidenceMarkers = [];
  if (draft.meritEvidenceMarkers.some((m) => m && m.key === entry.key)) return false;
  draft.meritEvidenceMarkers.push({
    kind: entry.kind,
    cycleId: entry.cycleId,
    evidenceState: entry.evidenceState,
    taskId: entry.taskId,
    recordedOn: ctx.today,
    summary: clampStr(entry.summary, 300),
    ...entry,
  });
  return true;
}

function pushTask(draft, ctx, { personId, title, expectedOutcome, support, dueOn }) {
  const taskId = ctx.idFactory('dlg');
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  draft.delegations.unshift({
    id: taskId,
    personId,
    title: title.slice(0, 200),
    expectedOutcome: expectedOutcome.slice(0, 2000),
    authority: 'act-inform',
    support: support.slice(0, 2000),
    delegatedOn: ctx.today,
    dueOn,
    status: 'active',
    checkins: [],
    completedOn: null,
    completionNote: '',
    returnedOn: null,
    returnReason: '',
    createdAt: ctx.nowIso,
    updatedAt: ctx.nowIso,
  });
  return taskId;
}

export function meritEvidenceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.includes(event.type)) return [];

  const cycles = (Array.isArray(draft.meritCycles) ? draft.meritCycles : [])
    .filter((c) => c && c.id);
  if (!cycles.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date();
  const today = dayKey(now) || now.toISOString().slice(0, 10);
  const hookCtx = {
    ...ctx,
    now,
    today,
    todayStr: today,
    nowIso: now.toISOString(),
    idFactory: typeof ctx.idFactory === 'function' ? ctx.idFactory : ((p) => `${p}-${Date.now()}`),
  };

  // Which cycles this event is about. On a finalisation it is the cycle named by
  // the event; on a completed review it is every cycle that reads a rating on or
  // after that review — because finalising is not the only moment the defect
  // exists; on a scan it is every cycle.
  const targets = event.type === 'comp.cycle.finalized'
    ? cycles.filter((c) => c.id === event.entityId)
    : cycles;
  if (!targets.length) return [];

  // The read model is recomputed on the WHOLE workspace with the operator view,
  // so the work this rule issues matches what the panel showed the leader —
  // whatever seat pressed the button.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;
  let contestedNoSeat = 0;
  let noHomeSeat = 0;

  for (const cycle of targets) {
    const join = buildMeritEvidenceJoin(fullStateView, {
      cycle,
      now,
      settings: fullStateView.settings,
    });
    if (!join.hasCycle) continue;
    const openRows = join.rows.filter((row) => row.evidenceOpen);
    if (!openRows.length) continue;

    const finalized = cycle.status === 'finalized';

    for (const row of openRows) {
      /* A contested assessor is a DECLARATION problem: issue no work. A task
         "ask this line" addressed to nobody would sit open forever, and the
         matrix panels already name every holder. */
      if (row.evidenceState === 'contested-assessor' || row.evidenceState === 'unowned-assessor') {
        contestedNoSeat += 1;
        continue;
      }

      const markerKey = `evidence|${cycle.id}|${row.personId}|${row.evidenceState}|${finalized ? 'frozen' : 'live'}`;
      if (draft.meritEvidenceMarkers?.some?.((m) => m && m.key === markerKey)) continue;
      if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

      // The seat that owns the pay decision and can reach the other line: the
      // manager who holds the person's HOME line on the effective date, as the
      // record has it (ADR-0155) — never today's pointer over a past decision.
      const homeManagerId = row.homeManagerId
        || matrix.nodes.get(row.personId)?.managerId
        || null;
      if (!homeManagerId) {
        // NO HOME SEAT is a different fact from a contested assessor: the record
        // does not say who held the home line on that day, so there is nobody to
        // address the ask to. Counted separately and never merged with the
        // declaration question above.
        noHomeSeat += 1;
        recordMarker(draft, hookCtx, {
          key: markerKey,
          kind: 'noted',
          cycleId: cycle.id,
          evidenceState: row.evidenceState,
          taskId: '',
          summary: `No readable home line for ${row.personName || row.personId} on ${join.effectiveOn}; the finding is reported on the register only.`,
        });
        continue;
      }

      const dueOn = addDays(today, MERIT_EVIDENCE_TASK_DAYS);
      const stateMeta = meritEvidenceState(row.evidenceState);
      const title = finalized
        ? `Record the correction path for ${row.personName || 'a pay decision'} — its review evidence was one line wide`
        : `Obtain the missing line input for ${row.personName || 'a pay decision'} before the merit cycle is finalised`;
      const expected = finalized
        ? `By ${dueOn}, the manager holding this person’s home line has recorded, in their own words, how the evidence gap behind this FROZEN pay decision is to be remedied — and whether it is to be carried to the next cycle. The decision itself is frozen (ADR-0155) and this task does not reopen it: ${row.detail}`
        : `By ${dueOn}, the manager holding this person’s home line has either obtained the missing input from the other line, or recorded why the decision stands on the evidence it has. ${row.detail} The rating is not changed by this task; the assessment stays the assessor’s act.`;
      const support = `Issued by ${MERIT_EVIDENCE_RULE_ID} because the review that produced this pay decision was read against every line the person worked on and this one was ${stateMeta?.label.toLowerCase() || row.evidenceState}. A line that was never asked is a gap in the record, not a judgement about the manager who was not asked.`;

      const taskId = pushTask(draft, hookCtx, {
        personId: homeManagerId,
        title,
        expectedOutcome: expected,
        support,
        dueOn,
      });

      // Provenance: the review that fed the decision is what the task is about.
      if (row.reviewId) ensureEntityLink(draft, {
        sourceType: 'review', sourceId: row.reviewId,
        targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: MERIT_EVIDENCE_RULE_ID,
        summary: 'The review whose evidence was incomplete was issued a dated ask.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });

      // Roll the ask up every leadership ancestor of the holder, so the director
      // above sees the same obligation the manager was given.
      const node = matrix.nodes.get(homeManagerId) || null;
      for (const ancestorId of [...((node && node.ancestors) || [])]) {
        const rolled = ensureEntityLink(draft, {
          sourceType: 'delegation', sourceId: taskId,
          targetType: 'person', targetId: ancestorId,
          relation: 'rolls-up-to', ruleId: MERIT_EVIDENCE_RULE_ID,
          summary: 'A pay decision resting on one line’s evidence rolls up to this leadership span.',
        }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
        if (rolled.created) rollupEdges += 1;
      }

      recordMarker(draft, hookCtx, {
        key: markerKey,
        kind: 'obligation',
        cycleId: cycle.id,
        evidenceState: row.evidenceState,
        taskId,
        summary: `Issued the ${finalized ? 'correction-path' : 'missing-input'} ask for ${row.personName || row.personId}.`,
      });
      obligations += 1;
    }
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'merit',
      `Issued ${obligations} dated review-evidence obligation(s); ${rollupEdges} roll-up edge(s).`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'merit',
      `${deferredByCap} review-evidence obligation(s) deferred by the per-transaction cap and left for the scan.`);
  }
  if (noHomeSeat) {
    noteEffect(hookCtx, out, 'refused-unresolved', 'workspace', 'merit',
      `${noHomeSeat} pay decision(s) have no readable home line on the effective date, so there is no seat to address a review-evidence ask to. The finding is reported on the register only.`);
  }
  if (contestedNoSeat) {
    noteEffect(hookCtx, out, 'refused-unresolved', 'workspace', 'merit',
      `${contestedNoSeat} pay decision(s) have a contested, unowned or unreadable assessor. No task was issued: an ask addressed to nobody can never close, and the declaration question belongs to the Matrix accountability panel.`);
  }
  return out;
}
