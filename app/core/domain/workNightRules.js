/**
 * app/core/domain/workNightRules.js — `RULE-WNR-01` on the shared post-commit
 * spine (ADR-0226, Schema v181).
 *
 * TWO CONDITIONS, and both are deliberately narrow:
 *
 *  1. `night-breach-ahead` — the record PROVES a night-share or night-streak
 *     breach whose decisive minute has not happened yet. A night streak is
 *     decided when the roster is written, days before anyone is tired — so the
 *     only moment worth interrupting someone is while a start time can still
 *     be moved.
 *
 *  2. `break-record-missing` — a shift has ended and the record shows continuous
 *     work past the point a break was due, with no break recorded. The ask is
 *     for the RECORD, never a judgement of the person: absence of a break
 *     record is absence of evidence, and the reading refuses the clearance
 *     rather than assuming a breach.
 *
 * WHAT IT DOES NOT DO. It does not chase a breach that already happened (the
 * reading prints it; nothing can prevent it now). It does not chase an
 * unproven reading or a missing attestation — those are printed to the seats
 * that can fix them. It never moves, shortens or cancels a shift, never
 * invents a break, never picks which of two shifts should give way, and never
 * rates a person.
 *
 * WHO IS ASKED. A breach made inside one reporting line is owed to that line's
 * holder. A breach made by TWO lines is owed to the lowest seat above BOTH —
 * the joint apex on the matrix graph — never to whichever line rostered last,
 * because each line looking at its own roster sees nothing wrong. A missing
 * break record is owed to the holder of the line the shift was worked for.
 * Where that seat is the workspace leader, where the lines share no single
 * apex, or where the person has left the roster, the rule records ONE
 * identity-free `workNightMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per condition signature (person, kind,
 * decisive minute, the rows that make it), self-closing when the condition is
 * removed, passes or changes owner, bounded per commit with the remainder
 * counted, and pause-governed on EVERY path including an explicit scan.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once —
 * to find the seat above two lines. That is why its pause switch is registered
 * on PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it reaches a second
 * reporting line, and that line's manager is not told.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { workNightConditions } from './workNight.js';
import {
  WORK_NIGHT_ASK_PREFIX,
  WORK_NIGHT_CLOSED_PREFIX,
  WORK_NIGHT_EVENT_PREFIX,
  WORK_NIGHT_HREF,
  WORK_NIGHT_LIMITS,
  WORK_NIGHT_MARKER_KIND,
  WORK_NIGHT_OWNER_STATES,
  WORK_NIGHT_RULE_ID,
} from './workNightRegistry.js';
import {
  normalizeWorkNightSettings,
  parseWorkNightAskSummary,
  workNightAskSummary,
} from './workNightSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const OWNER_SAYS = Object.fromEntries(WORK_NIGHT_OWNER_STATES.map((row) => [row.key, row.says]));

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: WORK_NIGHT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: WORK_NIGHT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${WORK_NIGHT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexWorkNightAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== WORK_NIGHT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseWorkNightAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The conditions the current record creates: one per provable breach still ahead, one per missing break record. */
export function workNightConditionsFrom(conditions) {
  return (conditions || []).map((row) => ({
    kind: row.condition,
    signature: row.signature,
    findingKind: row.kind,
    crossLine: row.crossLine,
    seatState: row.owner.state,
    seatId: row.owner.state === 'seat' ? row.owner.seatId : null,
    basis: row.owner.basis,
    dueOn: row.dueOn,
    title: `${row.kindLabel} for ${clip(row.personName, 80)}${row.crossLine ? ' — made by two lines' : ''}`,
    expectedOutcome: row.condition === 'break-record-missing'
      ? `${row.sentence} ${row.fix} This is a request for the record, not a judgement of the person: record the break(s) actually taken, or state on the record that none was taken, and the refusal clears.`
      : `${row.sentence} ${row.fix} This has not happened yet: it becomes fact at ${row.atLabel}. ${row.crossLine
        ? 'Each line’s own roster looks fine; the breach exists only where the two meet, which is why it comes to the seat above both.'
        : 'The shift is on your own line.'} Decide which shift moves and record it (Standard work → Night work): cancel the shift that gives way and record the new one. The reading does not choose, and it measures the clock — not how anyone feels.`,
    observation: row.condition === 'break-record-missing'
      ? 'A break record a declared limit requires is missing from an ended shift.'
      : `A provable night breach (${row.kindLabel.toLowerCase()}${row.crossLine ? ', made by two reporting lines' : ''}) is still ahead.`,
  }));
}

export function workNightRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can move
  // a shift, a break, a policy, the roster, a reporting line — or simply the clock.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(WORK_NIGHT_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  // The switch is read by its full name rather than through the registry key:
  // the pause-permit reach audit reads THIS file for the literal name, because a
  // claim that silencing `workNightAutoPropagate` reaches a second reporting
  // line has to be checkable against the source that reads it.
  const conv = normalizeWorkNightSettings(draft.settings || {});
  if (conv.workNightAutoPropagate === false) return [];

  const existing = indexWorkNightAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  // No shift and no open ask: nothing can breach, and the graph is not read.
  if ((!Array.isArray(draft.workRestShifts) || !draft.workRestShifts.length) && !openAsks.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let conditions;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides which seat sits above two lines.
    // Silencing this rule therefore reaches a second reporting line.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    conditions = workNightConditions(draft, { now, matrix });
  } catch {
    return [];
  }
  const mapped = workNightConditionsFrom(conditions);
  if (!mapped.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(mapped.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition is gone, has passed, or changed owner. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${WORK_NIGHT_CLOSED_PREFIX} ${condition
      ? 'the seat above the lines involved changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'the condition is no longer in force — a shift was moved or cancelled, a break record was completed, the governing policy changed, or its decisive minute passed. The reading still prints whatever the record now proves.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a night-work ask: the owning seat moved.' : 'Closed a night-work ask: the condition is no longer in force.');
  }

  /* 2. File one bounded dated ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of mapped) {
    if (condition.seatState !== 'seat') {
      const key = `work-night|obs|${condition.signature}|${condition.seatState}`;
      draft.workNightMarkers = Array.isArray(draft.workNightMarkers) ? draft.workNightMarkers : [];
      if (!draft.workNightMarkers.some((marker) => marker && marker.key === key)) {
        const detail = `${condition.observation} ${OWNER_SAYS[condition.seatState] || 'Nobody was asked.'}`;
        draft.workNightMarkers.push({ key, at: nowIso, ruleId: WORK_NIGHT_RULE_ID, kind: WORK_NIGHT_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.workNightMarkers.length > WORK_NIGHT_LIMITS.markers) draft.workNightMarkers.splice(0, draft.workNightMarkers.length - WORK_NIGHT_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', WORK_NIGHT_HREF, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition is still in force has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(WORK_NIGHT_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= WORK_NIGHT_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${WORK_NIGHT_RULE_ID} from the night-work & in-shift break reading (${WORK_NIGHT_HREF}). It reads declared shifts, their recorded breaks, the declared night policy and today's reporting lines only; it compares the clock with declared numbers and is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: WORK_NIGHT_RULE_ID, summary: workNightAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: WORK_NIGHT_RULE_ID, summary: 'A night-work ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked ${condition.basis === 'joint-apex' ? 'the lowest seat above both lines involved' : 'the holder of the line'} to resolve a ${condition.kind} that is still in force, before ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', WORK_NIGHT_HREF,
      `${deferred} night-work ask(s) were deferred (cap ${WORK_NIGHT_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

workNightRule.id = 'workNightRule';

/** The prefix the rule stamps on its own asks, exported for the panel's copy. */
export const WORK_NIGHT_ASK_LABEL = WORK_NIGHT_ASK_PREFIX;

export default workNightRule;
