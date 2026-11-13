/**
 * app/core/domain/priorityRankingRules.js — `RULE-SOC-01` on the shared
 * post-commit spine (ADR-0191, Schema v151).
 *
 * TWO CONDITIONS, both read from the one reader (`buildPriorityRanking`) with
 * the whole-workspace view, never re-derived here:
 *
 *   1. `overdue-ballot` — a frozen line holder has not cast a ballot by the
 *      round's declared deadline. ONE dated ask goes to that frozen holder and
 *      nobody else: a new manager of the same line is not asked on the old
 *      holder's behalf, and the person being ranked is never asked to rank
 *      themselves.
 *   2. `cycle` — the cast ballots form a majority cycle, so there is no
 *      Condorcet winner. ONE dated ask goes to the LOWEST JOINT APEX of the
 *      lines that were asked, naming the cycle in item titles. The disagreement
 *      is between lines; it is never resolved by scoring the person, by picking
 *      one manager as owner, or by breaking the cycle silently.
 *
 * WHAT IT NEVER DOES. It never substitutes a holder, never asks a line that
 * ended, never casts a ballot, never withdraws a round and never rates anyone.
 * Where no roster seat can be asked — the joint apex is ambiguous or is the
 * workspace leader, or the holder left the roster — it records ONE identity-free
 * `matrixMarkers` observation and files nothing.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance. The rule is idempotent per condition signature,
 * closes its own asks when the condition clears or its seat moves, never
 * re-asks a condition a human closed while it stands, is bounded per commit
 * with the remainder counted, honours the automation pause on EVERY path
 * including an explicit scan, and is inert with no declared round.
 *
 * REACH. It reads `buildMatrix` — through the reader, exactly once — because
 * every joint apex and every roll-up below is derived from the reporting graph.
 * That is why the switch is registered on PAUSE_PERMIT_MATRIX_REACH_SWITCHES:
 * silencing this rule reaches a second reporting line.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { MATRIX_LIMITS } from './matrixRegistry.js';
import { matrixJointApex } from './matrix.js';
import { buildPriorityRanking } from './priorityRanking.js';
import {
  PRIORITY_BALLOT_CLOSED_PREFIX,
  PRIORITY_BALLOT_EVENT_PREFIX,
  PRIORITY_BALLOT_LIMITS,
  PRIORITY_BALLOT_MARKER_KIND,
  PRIORITY_BALLOT_ROUTE,
  PRIORITY_BALLOT_RULE_ID,
} from './priorityRankingRegistry.js';
import {
  normalizePriorityBallotSettings,
  parsePriorityBallotAskSummary,
  priorityBallotAskSummary,
  priorityBallotSignature,
} from './priorityRankingSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PRIORITY_BALLOT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PRIORITY_BALLOT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${PRIORITY_BALLOT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexPriorityAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== PRIORITY_BALLOT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePriorityBallotAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. `seatState` says whether a roster
 * seat can be asked: `seat` (ask `seatId`), `leader-held`, `ambiguous` or
 * `off-roster`.
 */
export function priorityConditions(report) {
  const { matrix } = report.internal;
  const rounds = report.internal.allRounds || [];
  const seatOf = (id) => (id === LEADER_ID ? 'leader-held' : matrix.roster.has(id) ? 'seat' : 'off-roster');
  const out = [];
  for (const row of rounds) {
    if (row.verdict === 'withdrawn') continue;

    /* 1. A majority cycle: the lines disagree and the tie belongs to their apex. */
    if (row.verdict === 'cycle') {
      const apex = matrixJointApex(matrix, row.lines.map((line) => line.holderId));
      const seatState = apex.unique ? seatOf(apex.apexId) : 'ambiguous';
      const cycleTitles = row.schwartz
        .map((key) => `“${clip(row.items.find((item) => item.key === key)?.title || key, 90)}”`)
        .join(' · ');
      out.push({
        kind: 'cycle',
        signature: priorityBallotSignature('cycle', row.roundId),
        seatState,
        seatId: seatState === 'seat' ? apex.apexId : null,
        dueOn: addDays(report.today, report.settings.priorityAskDueDays),
        title: `The lines disagree about “${clip(row.title, 100)}”`,
        expectedOutcome: `${row.votesN} line holder(s) ranked ${row.itemsN} item(s) for ${row.personName}. The ballots contain a majority cycle, so no item beats every other head-to-head. The top cycle is ${cycleTitles}. The beatpath order is ${row.schulze.order.map((key) => `“${clip(row.items.find((item) => item.key === key)?.title || key, 60)}”`).join(' → ')}. Settle the order between the lines, or record why the disagreement stands — on #/${PRIORITY_BALLOT_ROUTE}?panel=priority. This ask closes itself when the round is withdrawn. It is not a judgement about ${row.personName}.`,
        observation: `A cross-line priority ballot holds a majority cycle over ${row.schwartz.length} item(s).`,
      });
    }

    /* 2. A frozen holder who has not cast a ballot by the round's deadline. */
    for (const line of row.lines) {
      if (line.state !== 'overdue') continue;
      const seatState = seatOf(line.holderId);
      out.push({
        kind: 'overdue-ballot',
        signature: priorityBallotSignature('overdue', `${row.roundId}|${line.lineKey}`),
        seatState,
        seatId: seatState === 'seat' ? line.holderId : null,
        dueOn: addDays(report.today, report.settings.priorityAskDueDays),
        title: `Cast the ${line.kind} line’s ballot: “${clip(row.title, 90)}”`,
        expectedOutcome: `${row.personName} works across ${row.lines.length} line(s) and “${clip(row.title, 120)}” was opened on ${row.openedOn}. Your line’s ballot was due ${row.dueOn} and is not on the record. Rank all ${row.itemsN} frozen item(s), first to last, on #/${PRIORITY_BALLOT_ROUTE}?panel=priority. Only the holder of a frozen line may cast for it; a later holder of the same line is not asked on your behalf. This ask closes itself when the ballot is cast or the round is withdrawn.`,
        observation: `A frozen line’s ballot is overdue.`,
      });
    }
  }
  return out;
}

export function priorityRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // move a deadline, a line, a holder or a roster seat.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(PRIORITY_BALLOT_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  const conv = normalizePriorityBallotSettings(draft.settings || {});
  if (conv.priorityBallotAutoPropagate === false) return [];
  if (!Array.isArray(draft.priorityRounds) || !draft.priorityRounds.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    // `buildMatrix` — built ONCE inside the reader — decides every joint apex and
    // every roll-up below. Silencing this rule therefore reaches a second
    // reporting line (see pausePermitRegistry.js).
    report = buildPriorityRanking(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  const conditions = priorityConditions(report);
  const existing = indexPriorityAsks(draft);
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
      ? `${PRIORITY_BALLOT_CLOSED_PREFIX} the seat this condition is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${PRIORITY_BALLOT_CLOSED_PREFIX} the priority-ballot register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a priority-ballot ask: the accountable seat changed.' : 'Closed a priority-ballot ask: the condition cleared.');
  }

  /* 2. File one bounded dated ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `priority-ballot|obs|${condition.signature}|${condition.seatState}`;
      draft.matrixMarkers = Array.isArray(draft.matrixMarkers) ? draft.matrixMarkers : [];
      if (!draft.matrixMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owed to the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The leader it is owed to is no longer on the active roster; nobody was substituted.'
            : 'The lines share no single joint apex, so the disagreement is printed and no owner is invented.';
        const detail = `${condition.observation} ${why}`;
        draft.matrixMarkers.push({ key, at: nowIso, ruleId: PRIORITY_BALLOT_RULE_ID, kind: PRIORITY_BALLOT_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.matrixMarkers.length > MATRIX_LIMITS.markers) draft.matrixMarkers.splice(0, draft.matrixMarkers.length - MATRIX_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', PRIORITY_BALLOT_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PRIORITY_BALLOT_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= PRIORITY_BALLOT_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${PRIORITY_BALLOT_RULE_ID} from the cross-line priority ballot register (#/${PRIORITY_BALLOT_ROUTE}?panel=priority). It reads frozen rounds, first-person ballots and the reporting graph only; it is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: PRIORITY_BALLOT_RULE_ID, summary: priorityBallotAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(report.internal.matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!report.internal.matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: PRIORITY_BALLOT_RULE_ID, summary: 'A priority-ballot ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'cycle' ? `Routed a majority cycle to the lines’ joint apex, due ${condition.dueOn}.` : `Asked a frozen line holder for an overdue ballot, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', PRIORITY_BALLOT_ROUTE,
      `${deferred} priority-ballot ask(s) were deferred (cap ${PRIORITY_BALLOT_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

priorityRule.id = 'priorityRule';

export default priorityRule;
