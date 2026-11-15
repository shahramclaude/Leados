/**
 * app/core/domain/conflictRecusalRules.js — `RULE-CIR-01` on the shared
 * post-commit spine (ADR-0210, Schema v164).
 *
 * ONE CONDITION, and it is deliberately narrow: an interest is DECLARED, it is
 * reportable, the person holding it SITS ON the record — as the hand that signs
 * it, as its owner, or as a line over its subject — and no standing response is
 * on file. That is the state in which nothing has been decided about a conflict
 * that the record itself proves.
 *
 * WHAT IT DOES NOT DO. It does not chase a mitigation whose control turned out
 * to be weak (a mitigation is its authoriser's claim; grading it is a separate
 * question nobody has declared a rule for). It does not chase an `unsearched`
 * reading — that is a rule-declaration gap and it belongs to the altitude that
 * can declare one, printed to them on the panel. It does not chase a withdrawn
 * interest, a record that is gone or a person who has left. It never blocks the
 * decision, edits an approver, revokes a right or takes a signature away.
 *
 * WHO IS ASKED. The seat ABOVE the person holding the interest — never the
 * person themselves, because a hand cannot clear its own conflict, and never
 * the record's other party. In a matrix the seat above is the lowest seat above
 * EVERY one of the person's reporting lines, so one line's manager is never
 * asked to answer for a stake their peer's subordinate holds. Where that seat is
 * the workspace leader, where the lines share no single apex, where the person
 * is their own top, or where the person has left the roster, the rule records
 * ONE identity-free `conflictRecusalMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per (interest, standing-state)
 * signature, self-closing when the interest is handled or withdrawn, passes out
 * of the horizon or changes owner, bounded per commit with the remainder
 * counted, and pause-governed on EVERY path including an explicit scan.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once — to
 * find the seat above a person. That is why its pause switch is registered on
 * PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it reaches a second reporting
 * line, and that line's manager is not told.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildConflictRecusal } from './conflictRecusal.js';
import {
  CONFLICT_RECUSAL_CLOSED_PREFIX,
  CONFLICT_RECUSAL_EVENT_PREFIX,
  CONFLICT_RECUSAL_HREF,
  CONFLICT_RECUSAL_LIMITS,
  CONFLICT_RECUSAL_MARKER_KIND,
  CONFLICT_RECUSAL_RULE_ID,
  CONFLICT_OWNER_STATE_BY_KEY,
} from './conflictRecusalRegistry.js';
import {
  conflictRecusalAskSummary,
  conflictRecusalSignature,
  parseConflictRecusalAskSummary,
  readConflictRecusalSettings,
} from './conflictRecusalSchema.js';

const L = CONFLICT_RECUSAL_LIMITS;
const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: CONFLICT_RECUSAL_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: CONFLICT_RECUSAL_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${CONFLICT_RECUSAL_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexConflictRecusalAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : [])
    .filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== CONFLICT_RECUSAL_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const signature = parseConflictRecusalAskSummary(link.summary);
    if (!signature) continue;
    asks.push({ signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the record creates: one per UNDISCLOSED interest whose owner is
 * a roster seat. Everything else on the register is printed to the seats that
 * can act on it and is deliberately not escalated here.
 */
export function conflictRecusalConditions(report) {
  const conditions = [];
  for (const row of report.rows) {
    if (row.verdict !== 'undisclosed') continue;
    const signature = conflictRecusalSignature({ interestId: row.interestId, state: row.verdict });
    conditions.push({
      signature,
      interestId: row.interestId,
      verdict: row.verdict,
      seatState: row.owner.state,
      seatId: row.owner.state === 'seat' ? row.owner.seatId : null,
      basis: row.owner.basis,
      dueOn: row.dueOn,
      personLabel: clip(row.personName, 80),
      relationshipLabel: row.relationshipLabel,
      subjectLabel: row.subjectLabel,
      positions: row.positions,
      title: `Conflict of interest with no recorded response: ${row.relationshipLabel} on ${clip(row.personName, 80)}`,
      expectedOutcome: `A declared ${row.relationshipLabel.toLowerCase()} held by ${clip(row.personName, 80)} reaches the ${row.subjectLabel.toLowerCase()} on the record as ${row.positions.join(' and ')}. Record one dated response against the interest and its reason: STAND BACK (the person withdraws and the record’s approver is no longer them), STAY WITH A NAMED CONTROL (a written control stands in for their independence), or DETERMINE NO CONFLICT (in writing, with the reason). The register does not choose for you, does not block the decision and does not rate anyone. Record it at ${CONFLICT_RECUSAL_HREF}.`,
      observation: `A declared conflict of interest is on the record with no response.`,
    });
  }
  return conditions;
}

export function conflictRecusalRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // declare an interest, answer one, move an approver, a reporting line or the
  // roster — or simply move the horizon.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(CONFLICT_RECUSAL_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is read by its FULL NAME rather than through the registry key,
  // because the pause-permit reach audit reads THIS file for the literal name:
  // a claim that silencing `conflictRecusalAutoPropagate` reaches a second
  // reporting line has to be checkable against the source that reads it.
  const settings = readConflictRecusalSettings(draft);
  if (settings.conflictRecusalAutoPropagate === false) return [];

  const existing = indexConflictRecusalAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  // No declared interest and no open ask: nothing can conflict, and the graph is
  // not read at all.
  if ((!Array.isArray(draft.conflictInterests) || !draft.conflictInterests.length) && !openAsks.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides which seat sits above the person.
    // Silencing this rule therefore reaches a second reporting line.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    report = buildConflictRecusal(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    return [];
  }
  const conditions = conflictRecusalConditions(report);
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose interest is answered, withdrawn, out of the horizon or
        whose owning seat has changed. Nothing is left pointing at a stale seat. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${CONFLICT_RECUSAL_CLOSED_PREFIX} ${condition
      ? 'the seat above the person holding the interest changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'the interest is no longer unhandled — a response was recorded, the interest was withdrawn, its record left the horizon, or the person left the roster. The register still prints whatever the record now proves.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition
      ? 'Closed a conflict-of-interest ask: the owning seat moved.'
      : 'Closed a conflict-of-interest ask: the interest is no longer unhandled.');
  }

  /* 2. File one bounded dated ask per unhandled interest a roster seat owns;
        observe the rest — never substituting an owner the structure lacks. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `conflict-recusal|obs|${condition.signature}|${condition.seatState}`;
      draft.conflictRecusalMarkers = Array.isArray(draft.conflictRecusalMarkers) ? draft.conflictRecusalMarkers : [];
      if (!draft.conflictRecusalMarkers.some((marker) => marker && marker.key === key)) {
        const detail = `${condition.observation} ${CONFLICT_OWNER_STATE_BY_KEY[condition.seatState]?.says || 'Nobody was asked.'}`;
        draft.conflictRecusalMarkers.push({ key, at: nowIso, ruleId: CONFLICT_RECUSAL_RULE_ID, kind: CONFLICT_RECUSAL_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.conflictRecusalMarkers.length > L.markers) draft.conflictRecusalMarkers.splice(0, draft.conflictRecusalMarkers.length - L.markers);
        noteEffect(ctx, out, 'observed', 'workspace', CONFLICT_RECUSAL_HREF, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the interest is still
    // unhandled has ANSWERED it. Re-asking would be churn, not governance.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(CONFLICT_RECUSAL_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= L.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${CONFLICT_RECUSAL_RULE_ID} from the conflict-of-interest & recusal register (${CONFLICT_RECUSAL_HREF}). It reads declared interests, dated standing responses and the record each interest names — never a surname, a shared line, a purchase or a pattern — and it is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: CONFLICT_RECUSAL_RULE_ID, summary: conflictRecusalAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: CONFLICT_RECUSAL_RULE_ID, summary: 'A conflict-of-interest ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked ${condition.basis === 'joint-apex' ? 'the lowest seat above every line this person holds' : 'the seat above the person holding the interest'} to record a response to a declared conflict of interest.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', CONFLICT_RECUSAL_HREF,
      `${deferred} conflict-of-interest ask(s) were deferred (cap ${L.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

conflictRecusalRule.id = 'conflictRecusalRule';

export default conflictRecusalRule;
