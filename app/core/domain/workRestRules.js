/**
 * app/core/domain/workRestRules.js — `RULE-WRR-01` on the shared post-commit
 * spine (ADR-0209, Schema v163).
 *
 * ONE CONDITION, and it is deliberately narrow: the record PROVES a work/rest
 * conflict whose decisive minute has not happened yet. A short rest is decided
 * when the roster is written, days before anyone is tired — so the only moment
 * worth interrupting someone is while a start time can still be moved.
 *
 * WHAT IT DOES NOT DO. It does not chase a conflict that already happened (the
 * ledger prints it; nothing can prevent it now). It does not chase an unproven
 * reading, a missing attestation or a missing policy — those are printed to the
 * seats that can fix them. It never moves, shortens or cancels a shift, never
 * picks which of two shifts should give way, and never rates a person.
 *
 * WHO IS ASKED. A conflict made inside one reporting line is owed to that
 * line's holder. A conflict made by TWO lines is owed to the lowest seat above
 * BOTH — the joint apex on the matrix graph — never to whichever line rostered
 * last, because each line looking at its own roster sees nothing wrong. Where
 * that seat is the workspace leader, where the lines share no single apex, or
 * where the person has left the roster, the rule records ONE identity-free
 * `workRestMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per conflict signature (person, kind,
 * decisive minute, the shifts that make it), self-closing when the conflict is
 * removed, passes or changes owner, bounded per commit with the remainder
 * counted, and pause-governed on EVERY path including an explicit scan.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once — to
 * find the seat above two lines. That is why its pause switch is registered on
 * PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it reaches a second reporting
 * line, and that line's manager is not told.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { workRestConflictsAhead } from './workRest.js';
import {
  WORK_REST_ASK_PREFIX,
  WORK_REST_CLOSED_PREFIX,
  WORK_REST_EVENT_PREFIX,
  WORK_REST_HREF,
  WORK_REST_LIMITS,
  WORK_REST_MARKER_KIND,
  WORK_REST_OWNER_STATES,
  WORK_REST_RULE_ID,
} from './workRestRegistry.js';
import {
  normalizeWorkRestSettings,
  parseWorkRestAskSummary,
  workRestAskSummary,
} from './workRestSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const OWNER_SAYS = Object.fromEntries(WORK_REST_OWNER_STATES.map((row) => [row.key, row.says]));

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: WORK_REST_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: WORK_REST_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${WORK_REST_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexWorkRestAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== WORK_REST_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseWorkRestAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The conditions the current record creates: one per provable conflict still ahead. */
export function workRestConditions(conflicts) {
  return (conflicts || []).map((row) => ({
    kind: 'conflict-ahead',
    signature: row.signature,
    findingKind: row.kind,
    crossLine: row.crossLine,
    seatState: row.owner.state,
    seatId: row.owner.state === 'seat' ? row.owner.seatId : null,
    basis: row.owner.basis,
    dueOn: row.dueOn,
    title: `${row.kindLabel} ahead for ${clip(row.personName, 80)}${row.crossLine ? ' — made by two lines' : ''}`,
    expectedOutcome: `${row.sentence} ${row.fix} This has not happened yet: it becomes fact at ${row.atLabel}. ${row.crossLine
      ? 'Each line’s own roster looks fine; the conflict exists only where the two meet, which is why it comes to the seat above both.'
      : 'Both shifts are on your own line.'} Decide which shift moves and record it (Standard work → Work & rest): cancel the shift that gives way and record the new one. The ledger does not choose, and it measures the clock — not how anyone feels.`,
    observation: `A provable work/rest conflict (${row.kindLabel.toLowerCase()}${row.crossLine ? ', made by two reporting lines' : ''}) is still ahead.`,
  }));
}

export function workRestRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can move
  // a shift, a policy, the roster, a reporting line — or simply the clock.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(WORK_REST_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  // The switch is read by its full name rather than through the registry key:
  // the pause-permit reach audit reads THIS file for the literal name, because a
  // claim that silencing `workRestAutoPropagate` reaches a second reporting
  // line has to be checkable against the source that reads it.
  const conv = normalizeWorkRestSettings(draft.settings || {});
  if (conv.workRestAutoPropagate === false) return [];

  const existing = indexWorkRestAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  // No shift and no open ask: nothing can conflict, and the graph is not read.
  if ((!Array.isArray(draft.workRestShifts) || !draft.workRestShifts.length) && !openAsks.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let conflicts;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides which seat sits above two lines.
    // Silencing this rule therefore reaches a second reporting line.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    conflicts = workRestConflictsAhead(draft, { now, matrix });
  } catch {
    return [];
  }
  const conditions = workRestConditions(conflicts);
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose conflict is gone, has passed, or changed owner. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${WORK_REST_CLOSED_PREFIX} ${condition
      ? 'the seat above the lines involved changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'the conflict is no longer ahead — a shift was moved or cancelled, the governing policy changed, or its decisive minute passed. The ledger still prints whatever the record now proves.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a work/rest ask: the owning seat moved.' : 'Closed a work/rest ask: the conflict is no longer ahead.');
  }

  /* 2. File one bounded dated ask per conflict a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `work-rest|obs|${condition.signature}|${condition.seatState}`;
      draft.workRestMarkers = Array.isArray(draft.workRestMarkers) ? draft.workRestMarkers : [];
      if (!draft.workRestMarkers.some((marker) => marker && marker.key === key)) {
        const detail = `${condition.observation} ${OWNER_SAYS[condition.seatState] || 'Nobody was asked.'}`;
        draft.workRestMarkers.push({ key, at: nowIso, ruleId: WORK_REST_RULE_ID, kind: WORK_REST_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.workRestMarkers.length > WORK_REST_LIMITS.markers) draft.workRestMarkers.splice(0, draft.workRestMarkers.length - WORK_REST_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', WORK_REST_HREF, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the conflict is still ahead has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(WORK_REST_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= WORK_REST_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${WORK_REST_RULE_ID} from the work/rest recovery ledger (${WORK_REST_HREF}). It reads declared shifts, their amendments, the declared policy and today's reporting lines only; it compares clock time with a declared number and is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: WORK_REST_RULE_ID, summary: workRestAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: WORK_REST_RULE_ID, summary: 'A work/rest conflict ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked ${condition.basis === 'joint-apex' ? 'the lowest seat above both lines involved' : 'the holder of the line'} to resolve a work/rest conflict that is still ahead, before ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', WORK_REST_HREF,
      `${deferred} work/rest ask(s) were deferred (cap ${WORK_REST_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

workRestRule.id = 'workRestRule';

/** The prefix the rule stamps on its own asks, exported for the panel's copy. */
export const WORK_REST_ASK_LABEL = WORK_REST_ASK_PREFIX;

export default workRestRule;
