/**
 * app/core/domain/benchEvidenceRules.js — RULE-BNE-01, the Cross-Line
 * Bench-Evidence Sufficiency reading's one consequence (ADR-0168, Schema v134).
 *
 * THE DUTY. A panel that prints "the project line was never asked what it saw of
 * the person you are about to promote" is an observation. The duty a director or
 * a VP performs is to put a dated, owned, answerable question in front of the ONE
 * person who can close the hole — BEFORE the bench claim is acted on. After the
 * claim has been used (the appointment made, the slate frozen) the same question
 * is a different question: it is no longer "obtain the missing observation", it is
 * "record how the gap is to be handled from here".
 *
 * WHAT THIS RULE DOES, AND NOTHING ELSE
 * -------------------------------------
 *  - It fires on three events and never on a read: a readiness reading being set
 *    (`readiness.set`), a review being completed (`review.completed`, because a
 *    second line left unanswered at completion is the same hole one step earlier),
 *    and an explicit scan (`BENCH_EVIDENCE_SCAN_EVENT`).
 *  - For every claim whose evidence state is OPEN it issues AT MOST ONE owned,
 *    dated delegation, addressed to the manager who holds the person's HOME line
 *    as-of the claim's evidence window (ADR-0149) — the seat that both owns the
 *    claim and can reach the other line. A home line that is not READABLE as-of
 *    that day issues nothing and is counted: an ask addressed to an invented
 *    manager can never close.
 *  - Contested and unowned assessors issue NOTHING and are counted. Those are
 *    DECLARATION problems the matrix panels already name; a task addressed to a
 *    contested set can never close, and picking one of two managers would be the
 *    silent owner this workspace refuses to create.
 *  - It writes typed provenance only — `concerns` from the person to the ask,
 *    `issues-obligation` from the review (where one exists) to the ask, and
 *    `rolls-up-to` per leadership ancestor in the matrix DAG. No second graph.
 *  - It NEVER edits a readiness rating, a review, a line, a pay figure or a
 *    succession reading. A human asks a line; a human answers it.
 *  - It is IDEMPOTENT through a per-claim-per-state marker, BOUNDED by a
 *    per-transaction cap whose remainder is COUNTED and retried by the scan, and
 *    INERT in a single-chain workspace and on every other event.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildBenchEvidenceRead } from './benchEvidence.js';
import {
  BENCH_EVIDENCE_RULE_ID,
  BENCH_EVIDENCE_SCAN_EVENT,
  benchEvidenceState,
} from './benchEvidenceRegistry.js';

export { BENCH_EVIDENCE_RULE_ID, BENCH_EVIDENCE_SCAN_EVENT };

export const BENCH_EVIDENCE_TASK_DAYS = 14;
const MAX_OBLIGATIONS_PER_COMMIT = 8;

/** Relations this rule may write. Declared once; nothing else is ever used. */
export const BENCH_EVIDENCE_RELATIONS = Object.freeze(['concerns', 'issues-obligation', 'rolls-up-to']);

const TRIGGERS = Object.freeze([
  'readiness.set',
  'review.completed',
  BENCH_EVIDENCE_SCAN_EVENT,
]);

function clampStr(value, max = 300) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId: BENCH_EVIDENCE_RULE_ID, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${BENCH_EVIDENCE_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function recordMarker(draft, ctx, entry) {
  if (!Array.isArray(draft.benchEvidenceMarkers)) draft.benchEvidenceMarkers = [];
  if (draft.benchEvidenceMarkers.some((m) => m && m.key === entry.key)) return false;
  draft.benchEvidenceMarkers.push({
    kind: entry.kind,
    personId: entry.personId,
    seat: entry.seat,
    evidenceState: entry.evidenceState,
    taskId: entry.taskId,
    recordedOn: ctx.today,
    ...entry,
  });
  if (draft.benchEvidenceMarkers.length > 1200) {
    draft.benchEvidenceMarkers = draft.benchEvidenceMarkers.slice(-1200);
  }
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

/**
 * Which claims a given event is about.
 *
 * A readiness reading names one person and one seat. A completed review names one
 * person. A scan names everything. Narrowing here is what keeps the rule from
 * re-reading the whole workspace on every write.
 */
function targetsFor(state, read, event) {
  if (!read.rows.length) return [];
  if (event.type === 'readiness.set') {
    const personId = typeof event.entityId === 'string' ? event.entityId : '';
    if (!personId) return [];
    return read.rows.filter((r) => r.personId === personId);
  }
  if (event.type === 'review.completed') {
    const reviewId = typeof event.entityId === 'string' ? event.entityId : '';
    if (!reviewId) return [];
    const review = (Array.isArray(state.reviews) ? state.reviews : []).find((r) => r && r.id === reviewId) || null;
    if (!review) return [];
    return read.rows.filter((r) => r.personId === review.personId);
  }
  return read.rows;
}

export function benchEvidenceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string') return [];
  if (!TRIGGERS.includes(event.type)) return [];

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

  // The reading is recomputed on the WHOLE workspace with the operator view, so
  // the work this rule issues matches what the panel showed the leader, whatever
  // seat pressed the button. Nothing here reads a stored verdict — there is none.
  const fullStateView = { ...draft, settings: { ...(draft.settings || {}), activeSeatId: null } };
  const read = buildBenchEvidenceRead(fullStateView, { now, settings: fullStateView.settings });
  const targets = targetsFor(fullStateView, read, event);
  if (!targets.length) return [];

  const matrix = buildMatrix(fullStateView, { now, settings: fullStateView.settings });

  const out = [];
  let obligations = 0;
  let deferredByCap = 0;
  let rollupEdges = 0;
  let contestedNoSeat = 0;
  let noHomeSeat = 0;

  for (const row of targets) {
    if (!row.evidenceOpen) continue;

    /* A contested or unowned assessor is a DECLARATION problem: issue no work. */
    if (row.evidenceState === 'contested-assessor' || row.evidenceState === 'unowned-assessor') {
      contestedNoSeat += 1;
      continue;
    }

    const markerKey = `bench|${row.claimId}|${row.evidenceState}`;
    if (draft.benchEvidenceMarkers?.some?.((m) => m && m.key === markerKey)) continue;
    if (obligations >= MAX_OBLIGATIONS_PER_COMMIT) { deferredByCap += 1; continue; }

    // The seat that owns the claim and can close the hole: the manager holding the
    // HOME line as-of the claim's evidence window (ADR-0149) — never today's
    // pointer read back over a period it may not have covered.
    const homeManagerId = row.homeLineKnown ? row.homeLineManagerId : null;
    const homeBasis = row.homeLineState === 'observed'
      ? 'as recorded for that day'
      : 'under a printed presumption that today’s roster pointer held on that day, because the workspace records no home-line history for this person';
    if (!homeManagerId) {
      noHomeSeat += 1;
      recordMarker(draft, hookCtx, {
        key: markerKey,
        kind: 'noted',
        personId: row.personId,
        seat: row.seat,
        evidenceState: row.evidenceState,
        taskId: '',
        summary: `No readable home line as of ${row.windowEnd}; the finding is reported on the register only.`,
      });
      continue;
    }

    const dueOn = addDays(today, BENCH_EVIDENCE_TASK_DAYS);
    const stateMeta = benchEvidenceState(row.evidenceState);
    // TWO DIFFERENT ASKS. Before the claim is acted on, the missing observation
    // can still be obtained. Where a line's window is simply still open, the ask
    // is to get the answer in, not to chase a silence.
    const awaiting = row.evidenceState === 'line-awaiting';
    const title = awaiting
      ? `Obtain the outstanding line answer behind ${row.personName || 'a person'}’s bench claim`
      : `Obtain the missing line observation behind ${row.personName || 'a person'}’s bench claim`;
    const expected = awaiting
      ? `By ${dueOn}, the line(s) already asked have answered in their own words, or the manager holding the home line has recorded why the claim proceeds on the evidence it has. ${row.evidenceDetail} The readiness rating is not changed by this task; the assessment stays the assessor’s act.`
      : `By ${dueOn}, the manager holding the home line has either obtained the missing observation from the other line(s), or recorded in their own words why the bench claim stands on the evidence it has — and whether the gap is to be carried to the next evidence window. ${row.evidenceDetail} The readiness rating is not changed by this task.`;
    const support = `Issued by ${BENCH_EVIDENCE_RULE_ID} because the evidence behind a current bench claim was read against every line the person worked on in the review period and this claim reads ${stateMeta?.label.toLowerCase() || row.evidenceState}. The home line this ask is addressed to was resolved ${homeBasis}. A line that was never asked is a gap in the record, not a judgement about the person or the manager who was not asked.`;

    const taskId = pushTask(draft, hookCtx, {
      personId: homeManagerId,
      title,
      expectedOutcome: expected,
      support,
      dueOn,
    });

    // Provenance: the person the claim is about, and the review whose evidence was
    // incomplete where one was resolved.
    ensureEntityLink(draft, {
      sourceType: 'person', sourceId: row.personId,
      targetType: 'delegation', targetId: taskId,
      relation: 'concerns', ruleId: BENCH_EVIDENCE_RULE_ID,
      summary: 'A dated ask about this person’s bench evidence was issued to their home-line manager.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
    if (row.reviewId) ensureEntityLink(draft, {
      sourceType: 'review', sourceId: row.reviewId,
      targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: BENCH_EVIDENCE_RULE_ID,
      summary: 'The review whose evidence was incomplete was issued a dated ask.',
    }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });

    // Roll the ask up every leadership ancestor of the holder, so the director
    // above sees the same obligation the manager was given.
    const node = matrix.nodes.get(homeManagerId) || null;
    for (const ancestorId of [...((node && node.ancestors) || [])]) {
      const rolled = ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId,
        targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: BENCH_EVIDENCE_RULE_ID,
        summary: 'A bench claim resting on incomplete line evidence rolls up to this leadership span.',
      }, { idFactory: hookCtx.idFactory, todayStr: today, nowIso: hookCtx.nowIso });
      if (rolled.created) rollupEdges += 1;
    }

    recordMarker(draft, hookCtx, {
      key: markerKey,
      kind: 'obligation',
      personId: row.personId,
      seat: row.seat,
      evidenceState: row.evidenceState,
      taskId,
      summary: `Issued the missing-observation ask for a ${stateMeta?.label.toLowerCase() || row.evidenceState} bench claim.`,
    });
    obligations += 1;
  }

  if (obligations) {
    noteEffect(hookCtx, out, 'issued-obligations', 'workspace', 'succession',
      `Issued ${obligations} dated bench-evidence obligation(s); ${rollupEdges} roll-up edge(s).`);
  }
  if (deferredByCap) {
    noteEffect(hookCtx, out, 'deferred', 'workspace', 'succession',
      `${deferredByCap} bench-evidence obligation(s) deferred by the per-transaction cap and left for the scan.`);
  }
  if (noHomeSeat) {
    noteEffect(hookCtx, out, 'refused-unresolved', 'workspace', 'succession',
      `${noHomeSeat} bench claim(s) have no readable home line as of their evidence window, so there is no seat to address the ask to. The finding is reported on the register only.`);
  }
  if (contestedNoSeat) {
    noteEffect(hookCtx, out, 'refused-unresolved', 'workspace', 'succession',
      `${contestedNoSeat} bench claim(s) have a contested or unowned assessor. No task was issued: an ask addressed to nobody can never close, and the declaration question belongs to the matrix accountability panels.`);
  }
  return out;
}
