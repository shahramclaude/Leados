/**
 * app/core/domain/goalAttainmentRules.js — `RULE-GAR-01` on the shared
 * post-commit spine (ADR-0206, Schema v160).
 *
 * ONE CONDITION, and it is deliberately narrow: a CLOSED period whose figures
 * a human reported upward no longer reproduce from the record, and no dated
 * acknowledgement of that exact restatement is on file. That is a period fact
 * that has silently changed under someone's name, and it is the only thing this
 * rule is entitled to interrupt anybody about.
 *
 * WHAT IT DOES NOT DO. It does not ask about a period that still reproduces
 * (`faithful`), a period that cannot be re-derived (`unprovable` — the record is
 * missing, not restated, and the panel already prints exactly what is missing),
 * or a restatement a human has already put their name to (`acknowledged`). It
 * never edits a goal, a check-in, a due date, an owner or a closed figure, never
 * re-closes a period, never rates a person and never calls a restatement an
 * error by anyone.
 *
 * WHO IS ASKED. The LOWEST JOINT APEX of the spans whose printed figures moved —
 * because the restatement is a fact about those spans, and no single one of them
 * owns it. A moved `ownerless` slice is counted in the reading but carries no
 * holder, so it never becomes part of an apex; where the only movement is
 * ownerless, or the spans share no single apex, or that apex is the workspace
 * leader or has left the roster, the rule records ONE identity-free
 * `goalAttainmentMarkers` observation and asks nobody rather than inventing an
 * owner or escalating to a partial set.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per (closure, restatement fingerprint),
 * self-closing when the restatement is acknowledged or the period reproduces
 * again, bounded per commit with the remainder counted, and pause-governed on
 * EVERY path including an explicit scan.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once — to
 * resolve the joint apex of the spans that moved. That is why its pause switch is
 * registered on PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it reaches a second
 * reporting line, and that line's manager is not told.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildGoalAttainment } from './goalAttainment.js';
import {
  GOAL_ATTAINMENT_ASK_PREFIX,
  GOAL_ATTAINMENT_CLOSED_PREFIX,
  GOAL_ATTAINMENT_EVENT_PREFIX,
  GOAL_ATTAINMENT_LIMITS,
  GOAL_ATTAINMENT_MARKER_KIND,
  GOAL_ATTAINMENT_ROUTE,
  GOAL_ATTAINMENT_RULE_ID,
  GOAL_ATTAINMENT_SETTING_KEYS,
} from './goalAttainmentRegistry.js';
import {
  goalAttainmentAskSummary,
  goalAttainmentSignature,
  normalizeGoalAttainmentSettings,
  parseGoalAttainmentAskSummary,
} from './goalAttainmentSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: GOAL_ATTAINMENT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: GOAL_ATTAINMENT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${GOAL_ATTAINMENT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexGoalAttainmentAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== GOAL_ATTAINMENT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseGoalAttainmentAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The deterministic idempotency key for one (closure, restatement fingerprint)
 * pair. Fixed length and identity-free, exactly like every other rule signature
 * in this workspace, so a goal id, a span id or a person id never reaches a
 * marker key, a link summary or a delegation title.
 */
export function goalAttainmentAskSignature(closureId, fingerprint) {
  return goalAttainmentSignature({ periodFrom: `closure:${closureId}`, periodTo: `restatement:${fingerprint}` });
}

/**
 * The conditions the current record creates. `seatState` says whether a roster
 * seat can be asked: `seat` (ask `seatId`), `leader-held`, `ambiguous`,
 * `off-roster`, or `unattributed` (no span with a holder moved at all).
 */
export function goalAttainmentConditions(report, matrix) {
  const out = [];
  if (!report || !matrix) return out;
  const seatOf = (id) => (id === LEADER_ID ? 'leader-held' : matrix.roster.has(id) ? 'seat' : 'off-roster');
  for (const row of report.allClosures || []) {
    if (row.verdict !== 'restated' || !row.signature) continue;
    const movedSpanIds = [...new Set((row.spans || [])
      .filter((span) => span.changed && !span.ownerless && span.key && span.key !== 'ownerless')
      .map((span) => span.key))].sort();
    const apex = movedSpanIds.length ? matrixJointApex(matrix, movedSpanIds) : { unique: false, apexId: null };
    const seatState = !movedSpanIds.length
      ? 'unattributed'
      : apex.unique
        ? seatOf(apex.apexId)
        : 'ambiguous';
    const causes = row.causeRows.map((cause) => `${cause.count} ${cause.key}`).join(', ');
    const spanPhrase = `${row.spans.filter((span) => span.changed).length} span slice(s)`;
    out.push({
      kind: 'restated-period',
      signature: goalAttainmentAskSignature(row.closureId, row.signature),
      restatementSignature: row.signature,
      closureId: row.closureId,
      seatState,
      seatId: seatState === 'seat' ? apex.apexId : null,
      dueOn: addDays(report.today, report.conventions[GOAL_ATTAINMENT_SETTING_KEYS.askDueDays]),
      title: `The figures reported for “${clip(row.label, 70)}” no longer reproduce`,
      expectedOutcome: `The period ${row.periodFrom} to ${row.periodTo} was closed on ${row.closedOn} reporting ${row.frozen.goalsN} goal(s) over ${row.frozen.spansN} span slice(s). Re-derived from the record today, ${spanPhrase} moved and ${row.causedGoalsN} goal(s) changed: ${causes}. The restatement fingerprint is ${row.signature}. Acknowledge the restated basis in writing — accepting that these are now the period's figures, with the difference printed beside the original — or repair the underlying record so the period reproduces again, on #/${GOAL_ATTAINMENT_ROUTE}?panel=attainment. A restatement is a fact about the record, not about anyone's performance, and this ask closes itself as soon as the restatement is acknowledged or the period reproduces.`,
      observation: `A closed goal-attainment period no longer reproduces the figures that were reported for it (${causes}).`,
    });
  }
  return out;
}

export function goalAttainmentRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can move
  // a goal, a check-in, an owner, a due date or the recorded structure.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(GOAL_ATTAINMENT_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is read by its FULL literal key, not only through the registry
  // mapping, because `PAUSE_PERMIT_MATRIX_REACH_SWITCHES` claims that silencing
  // `goalAttainmentAutoPropagate` reaches a second reporting line — and a reach
  // claim has to be checkable against the source that reads it. This file was the
  // one rule on the reach list whose switch name the audit could not find, which
  // kept `pause-permits.test.mjs` red from Session 274 until now.
  const conv = normalizeGoalAttainmentSettings(draft.settings || {});
  if (conv.goalAttainmentAutoPropagate === false || conv[GOAL_ATTAINMENT_SETTING_KEYS.autoPropagate] === false) return [];
  if (!Array.isArray(draft.goalAttainmentClosures) || !draft.goalAttainmentClosures.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides the joint apex of the spans that
    // moved. Silencing this rule therefore reaches a second reporting line.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    report = buildGoalAttainment(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  const conditions = goalAttainmentConditions(report, matrix);
  const existing = indexGoalAttainmentAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition cleared (acknowledged, repaired) or whose seat moved. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${GOAL_ATTAINMENT_CLOSED_PREFIX} ${condition
      ? 'the apex seat this restatement is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'the restatement was acknowledged, or the period reproduces its reported figures again.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a goal-attainment ask: the accountable seat changed.' : 'Closed a goal-attainment ask: the restatement was acknowledged or the period reproduces again.');
  }

  /* 2. File one bounded dated ask per restatement a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `goal-attainment|obs|${condition.signature}|${condition.seatState}`;
      draft.goalAttainmentMarkers = Array.isArray(draft.goalAttainmentMarkers) ? draft.goalAttainmentMarkers : [];
      if (!draft.goalAttainmentMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owed to the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The leader it is owed to is no longer on the active roster; nobody was substituted.'
            : condition.seatState === 'unattributed'
              ? 'Only an ownerless slice moved, so no span holder exists to be accountable for it; nobody was invented.'
              : 'The spans that moved share no single joint apex, so the restatement is printed and no owner is invented.';
        const detail = `${condition.observation} ${why}`;
        draft.goalAttainmentMarkers.push({ key, at: nowIso, ruleId: GOAL_ATTAINMENT_RULE_ID, kind: GOAL_ATTAINMENT_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.goalAttainmentMarkers.length > MATRIX_LIMITS.markers) draft.goalAttainmentMarkers.splice(0, draft.goalAttainmentMarkers.length - MATRIX_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', GOAL_ATTAINMENT_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the restatement stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(GOAL_ATTAINMENT_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= GOAL_ATTAINMENT_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${GOAL_ATTAINMENT_RULE_ID} from the goal attainment close register (#/${GOAL_ATTAINMENT_ROUTE}?panel=attainment). It reads closed periods, dated goals and check-ins, and the recorded structure of the period's last day only; it is not a rating of anyone.`,
      delegatedOn: today,
      dueOn: condition.dueOn,
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
      sourceType: 'person', sourceId: condition.seatId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: GOAL_ATTAINMENT_RULE_ID, summary: goalAttainmentAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: GOAL_ATTAINMENT_RULE_ID, summary: 'A goal-attainment restatement ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked the joint apex of the spans whose reported figures moved to acknowledge the restatement of a closed period, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', GOAL_ATTAINMENT_ROUTE,
      `${deferred} goal-attainment ask(s) were deferred (cap ${GOAL_ATTAINMENT_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

goalAttainmentRule.id = 'goalAttainmentRule';

/** The prefix the rule stamps on its own asks, exported for the panel's copy. */
export const GOAL_ATTAINMENT_ASK_LABEL = GOAL_ATTAINMENT_ASK_PREFIX;

export default goalAttainmentRule;
