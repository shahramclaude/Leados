/**
 * app/core/domain/standardWorkRules.js — `RULE-LSW-01` on the shared post-commit
 * spine (ADR-0190, Schema v150).
 *
 * TWO CONDITIONS, both read from the one reader (`buildStandardWork`) with the
 * whole-workspace view, never re-derived here:
 *
 *   1. `routine-lapsed` — a live routine's most recent closed slots, at least
 *      the declared run, are not done. Mann: a missed routine is itself an
 *      abnormality, and the tier above goes to see. ONE dated ask goes to the
 *      manager of the line the routine is owed under.
 *   2. `tier-ask` — an abnormality was escalated to a leader and that leader
 *      has not yet acted. ONE dated ask lands in that leader's queue, due at
 *      the end of the declared tier window. This is the tiered daily
 *      accountability hand-off: no re-keying between tiers.
 *
 * WHAT IT NEVER DOES. It never picks a next tier for an owner who holds several
 * lines and named none, never substitutes the home line for an ended one, never
 * skips a tier, never records a check or a tier act, and never rates anyone.
 * Where no roster seat can be asked — the next tier is the workspace leader,
 * unresolved, or off the roster — it records ONE identity-free `matrixMarkers`
 * observation and files nothing.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance. The rule is idempotent per condition signature,
 * closes its own asks when the condition clears or its seat moves, never
 * re-asks a condition a human closed while it stands, is bounded per commit
 * with the remainder counted, honours the automation pause on EVERY path
 * including an explicit scan, and is inert with no declared routine.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { buildStandardWork } from './standardWork.js';
import {
  STANDARD_WORK_CLOSED_PREFIX,
  STANDARD_WORK_EVENT_PREFIX,
  STANDARD_WORK_LIMITS,
  STANDARD_WORK_MARKER_KIND,
  STANDARD_WORK_ROUTE,
  STANDARD_WORK_RULE_ID,
} from './standardWorkRegistry.js';
import {
  normalizeStandardWorkSettings,
  parseStandardWorkAskSummary,
  standardWorkAskSummary,
  standardWorkSignature,
} from './standardWorkSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: STANDARD_WORK_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: STANDARD_WORK_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${STANDARD_WORK_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexStandardWorkAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== STANDARD_WORK_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseStandardWorkAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. `seatState` says whether a roster
 * seat can be asked: `seat` (ask `seatId`), `leader-held`, `unresolved`
 * (line not named / ended) or `off-roster`.
 */
export function standardWorkConditions(report) {
  const { matrix, evaluated, escalations, nameOf } = report.internal;
  const seatOf = (id) => (id === LEADER_ID ? 'leader-held' : matrix.roster.has(id) ? 'seat' : 'off-roster');
  const out = [];
  for (const row of evaluated) {
    if (row.verdict !== 'lapsed' || row.retired || row.tierState === 'top-tier') continue;
    const closed = row.slots.filter((slot) => slot.closed);
    const since = closed[closed.length - row.run]?.slotKey || '';
    const seatState = row.nextTierId ? seatOf(row.nextTierId) : 'unresolved';
    out.push({
      kind: 'routine-lapsed',
      signature: standardWorkSignature('routine-lapsed', `${row.routine.id}|${since}`),
      seatState,
      seatId: seatState === 'seat' ? row.nextTierId : null,
      dueOn: addDays(report.today, report.conventions.tierDays),
      title: `Go and see: “${clip(row.routine.title, 90)}” has lapsed`,
      expectedOutcome: `${nameOf(row.routine.ownerId)}’s declared ${row.routine.cadence} routine “${row.routine.title}” has ${row.run} closed slot(s) in a row with no completed check (since ${since}). A lapsed routine is itself an abnormality: go and see what stopped it, then either help restore it or retire it with a reason on #/${STANDARD_WORK_ROUTE}. This ask closes itself when a check is recorded or the routine is retired. It is not a finding about the leader.`,
      observation: `A ${row.routine.cadence} ${row.routine.kind} routine has lapsed (${row.run} closed slot(s) not done).`,
    });
  }
  for (const esc of escalations) {
    if (esc.state !== 'open' && esc.state !== 'overdue' && esc.state !== 'unattributable') continue;
    const seatState = esc.state === 'unattributable' ? 'off-roster' : seatOf(esc.holderId);
    out.push({
      kind: 'tier-ask',
      signature: standardWorkSignature('tier-ask', `${esc.checkId}|${esc.hopN}`),
      seatState,
      seatId: seatState === 'seat' ? esc.holderId : null,
      dueOn: esc.dueOn && esc.dueOn > report.today ? esc.dueOn : report.today,
      title: `Tier escalation: abnormality from “${clip(esc.routineTitle, 80)}”`,
      expectedOutcome: `${esc.hops[esc.hops.length - 1].fromName} escalated an abnormality to your tier on ${esc.hops[esc.hops.length - 1].addressedOn} (hop ${esc.hopN}; raised ${esc.raisedOn} by ${esc.ownerName}): “${clip(esc.finding, 400)}”. On #/${STANDARD_WORK_ROUTE}, record ONE first-person act: contained at your tier, returned with a reason, or escalated one tier further to a line manager you name. This ask closes itself when you act.`,
      observation: `An escalated abnormality at hop ${esc.hopN} is awaiting its tier.`,
    });
  }
  return out;
}

export function standardWorkRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // move a slot (time passes between writes), a line or a roster seat.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(STANDARD_WORK_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  const conv = normalizeStandardWorkSettings(draft.settings || {});
  if (conv.standardWorkAutoPropagate === false) return [];
  if (!Array.isArray(draft.standardWorkRoutines) || !draft.standardWorkRoutines.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    report = buildStandardWork(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  // The reporting graph — `buildMatrix`, built ONCE inside the reader — is what
  // decides every next tier and every roll-up ancestor below. Silencing this
  // rule therefore reaches a second reporting line (see pausePermitRegistry.js).
  const { matrix } = report.internal;
  const conditions = standardWorkConditions(report);
  const existing = indexStandardWorkAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition cleared or whose accountable seat moved. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = condition
      ? `${STANDARD_WORK_CLOSED_PREFIX} the leader this condition is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${STANDARD_WORK_CLOSED_PREFIX} the standard-work register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a standard-work ask: the accountable seat changed.' : 'Closed a standard-work ask: the condition cleared.');
  }

  /* 2. File one bounded dated ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `standard-work|obs|${condition.signature}|${condition.seatState}`;
      draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
      if (!draft.matrixMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owed to the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The leader it is owed to is no longer on the active roster; nobody was substituted.'
            : 'The owner holds several lines and the routine names none, or the named line ended; nobody was asked on a guess.';
        const detail = `${condition.observation} ${why}`;
        draft.matrixMarkers.push({ key, at: nowIso, ruleId: STANDARD_WORK_RULE_ID, kind: STANDARD_WORK_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', STANDARD_WORK_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(STANDARD_WORK_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= STANDARD_WORK_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${STANDARD_WORK_RULE_ID} from the leader standard work register (#/${STANDARD_WORK_ROUTE}). It reads declared routines and first-person checks only; it is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: STANDARD_WORK_RULE_ID, summary: standardWorkAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: STANDARD_WORK_RULE_ID, summary: 'A standard-work ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'tier-ask' ? `Placed an escalated abnormality in the receiving tier’s queue, due ${condition.dueOn}.` : `Asked the next tier to go and see a lapsed routine, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', STANDARD_WORK_ROUTE,
      `${deferred} standard-work ask(s) were deferred (cap ${STANDARD_WORK_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

standardWorkRule.id = 'standardWorkRule';

export default standardWorkRule;
