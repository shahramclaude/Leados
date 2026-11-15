/**
 * app/core/domain/standardWaiverRules.js — `RULE-TSW-01` on the shared
 * post-commit spine (ADR-0212, Schema v166).
 *
 * TWO CONDITIONS, both read from the ONE reader (`buildStandardWaivers`) with
 * the whole-workspace view, never re-derived here:
 *
 *   1. `waiver-lapsed` — a granted waiver's last day has passed and no decision
 *      records the standard back in force. The departure now outlives the
 *      authority for it. ONE dated ask goes to the line holder who granted it:
 *      the authority is theirs to close, and asking the person who owes the
 *      standard would ask them to certify their own exception.
 *
 *   2. `chain-review` — a routine carries a CONTIGUOUS renewal chain at or
 *      beyond the declared threshold. This is the normalization-of-deviance
 *      condition, and its addressee is the point: the review goes to the seat
 *      ABOVE the person who kept renewing, on the HOME line. The manager who has
 *      renewed a departure five times is the last person who can decide that the
 *      departure is now the standard, and a peer line holds no authority over
 *      the authority they granted.
 *
 * WHAT IT NEVER DOES. It never grants, refuses, revokes or closes a waiver. It
 * never rewrites a routine's standard. It never asks the owner to certify their
 * own departure, never picks one of several managers, and never rates anybody.
 * Where no roster seat can be asked — the accountable seat is the workspace
 * leader, has left the roster, or sits at the top of its chain — it records ONE
 * identity-free `standardWaiverMarkers` observation and files nothing.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per condition signature, self-closing
 * when the condition clears or its seat moves, bounded per commit with the
 * remainder counted, pause-governed on EVERY path including an explicit scan,
 * and inert with no request on the register.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix } from './matrix.js';
import { buildStandardWaivers } from './standardWaiver.js';
import {
  STANDARD_WAIVER_EVENT_PREFIX,
  STANDARD_WAIVER_LIMITS,
  STANDARD_WAIVER_MARKER_KIND,
  STANDARD_WAIVER_ROUTE,
  STANDARD_WAIVER_RULE_ID,
  STANDARD_WAIVER_SETTING_KEYS,
} from './standardWaiverRegistry.js';
import {
  normalizeStandardWaiverSettings,
  parseStandardWaiverAskSummary,
  standardWaiverAskSummary,
  standardWaiverSignature,
} from './standardWaiverSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: STANDARD_WAIVER_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: STANDARD_WAIVER_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${STANDARD_WAIVER_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexStandardWaiverAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== STANDARD_WAIVER_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseStandardWaiverAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The seat above a person on their HOME line, or a printed state: `seat`,
 * `leader-held` (the home line runs to the workspace leader), `top-tier`
 * (nobody above them), `off-roster` (they are not on the roster).
 *
 * Why the home line and not the full matrix closure: a peer project line holds
 * no authority over a functional manager's management practice, and choosing one
 * of several managers by algorithm would be the register inventing an owner. The
 * panel prints this route rather than implying a joint review.
 */
export function standardWaiverHomeManager(matrix, personId) {
  if (!matrix || !matrix.roster) return { state: 'off-roster', managerId: null };
  if (personId === LEADER_ID) return { state: 'top-tier', managerId: null };
  if (!matrix.roster.has(personId)) return { state: 'off-roster', managerId: null };
  const lines = matrix.linesByPerson.get(personId) || [];
  const home = lines.find((line) => line.role === 'primary') || null;
  if (!home) return { state: 'top-tier', managerId: null };
  if (!home.managerId) return { state: 'top-tier', managerId: null };
  return { state: home.managerId === LEADER_ID ? 'leader-held' : 'seat', managerId: home.managerId };
}

/** The conditions the current record creates. */
export function standardWaiverConditions(report, { today, askDueDays, matrix }) {
  const out = [];
  const seatStateOf = (personId) => {
    if (!personId) return 'off-roster';
    if (personId === LEADER_ID) return 'leader-held';
    return matrix?.roster?.has(personId) ? 'seat' : 'off-roster';
  };

  /* 1. An authority that ended with nobody closing it. */
  for (const row of report.requests) {
    if (row.stateKey !== 'expired-unrestored') continue;
    const seatState = seatStateOf(row.authoriserId);
    out.push({
      kind: 'waiver-lapsed',
      signature: standardWaiverSignature('waiver-lapsed', `${row.id}|${row.grantTo || ''}`),
      seatState,
      seatId: seatState === 'seat' ? row.authoriserId : null,
      dueOn: addDays(today, askDueDays),
      title: `The departure you authorised ended ${row.grantTo}, unclosed`,
      expectedOutcome: `You authorised ${row.ownerName} to set aside the written standard of “${clip(row.routineTitle, 90)}” for ${row.grantFrom}–${row.grantTo}. The last day has passed and no decision records the standard back in force, so the routine now reads “suspended by silence” — the register cannot tell a standard from a habit. On #/${STANDARD_WAIVER_ROUTE}?panel=waivers, record which is true: the standard is back in force from a day you name, or the routine was retired. Recording that the routine was retired is refused unless the retirement itself is on the record. This ask closes itself when you decide; it is not a finding about ${row.ownerName}.`,
      observation: 'A granted standard-work waiver ended without a closing decision.',
    });
  }

  /* 2. A renewal chain that has stopped being temporary. */
  for (const routine of report.routines) {
    if (!routine.chainReviewDue) continue;
    const latest = routine.requests
      .filter((row) => ['in-force', 'renewed', 'pending-start', 'expired-unrestored'].includes(row.stateKey) && row.authoriserId)
      .sort((a, b) => String(b.chainLength).localeCompare(String(a.chainLength)) || String(b.grantTo || '').localeCompare(String(a.grantTo || '')))[0];
    if (!latest) continue;
    const above = standardWaiverHomeManager(matrix, latest.authoriserId);
    const seatState = above.state === 'top-tier' && latest.authoriserId !== LEADER_ID ? 'unresolved' : above.state;
    out.push({
      kind: 'chain-review',
      signature: standardWaiverSignature('chain-review', `${routine.routineId}|${routine.chainEnd || ''}|${routine.longestChainN}`),
      seatState,
      seatId: seatState === 'seat' ? above.managerId : null,
      dueOn: addDays(today, askDueDays),
      title: `A departure on “${clip(routine.title, 80)}” has been renewed ${routine.longestChainN} times without a break`,
      expectedOutcome: `${routine.ownerName}’s declared ${routine.cadence} routine “${clip(routine.title, 90)}” has departed from its written standard through ${routine.longestChainN} contiguous waivers, from ${routine.chainStart} to ${routine.chainEnd}, each authorised by ${latest.authoriserName}. A temporary departure renewed this many times is no longer temporary, and the decision is not the renewing manager’s to make: either the written standard changes to match the work, or the work changes to meet the standard. This ask closed itself only when the chain ends with a decision, the routine is retired, or a chain of different length makes it a different condition. It is not a finding against anybody’s conduct.`,
      observation: 'A standard-work waiver renewal chain has reached the declared review threshold.',
    });
  }
  return out;
}

export function standardWaiverRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can
  // move a request, an answer, a decision, a routine, a line — or simply the
  // date, which is what turns a live waiver into a lapsed one.
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(STANDARD_WAIVER_EVENT_PREFIX)
    && !event.type.startsWith('standardwork.')) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit reach
  // audit greps THIS file for it — a claim that silencing
  // `standardWaiverAutoPropagate` reaches a second reporting line has to be
  // checkable against the source that reads it.
  const conv = normalizeStandardWaiverSettings(draft.settings || {});
  if (conv.standardWaiverAutoPropagate === false) return [];
  if (!list(draft.standardWaiverRequests).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let matrix = null;
  try {
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    matrix = null;
  }

  let report;
  try {
    report = buildStandardWaivers(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }
  const conditions = standardWaiverConditions(report, { today, askDueDays: conv[STANDARD_WAIVER_SETTING_KEYS.askDueDays], matrix });
  const existing = indexStandardWaiverAsks(draft);
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
      ? `${STANDARD_WAIVER_RULE_ID}: the seat this condition is owed to changed on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${STANDARD_WAIVER_RULE_ID}: the standard-waiver register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition
      ? 'Closed a standard-waiver ask: the accountable seat changed.'
      : 'Closed a standard-waiver ask: the condition cleared.');
  }

  /* 2. File one bounded ask per condition a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `standard-waiver|obs|${condition.signature}|${condition.seatState}`;
      draft.standardWaiverMarkers = Array.isArray(draft.standardWaiverMarkers) ? draft.standardWaiverMarkers : [];
      if (!draft.standardWaiverMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'It is owed to the workspace leader and is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'The accountable seat is no longer on the active roster; nobody was substituted.'
            : 'Nobody is above that seat on its home line; the review has no addressee and was not invented.';
        const detail = `${condition.observation} ${why}`;
        draft.standardWaiverMarkers.push({ key, at: nowIso, ruleId: STANDARD_WAIVER_RULE_ID, kind: STANDARD_WAIVER_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.standardWaiverMarkers.length > STANDARD_WAIVER_LIMITS.markers) {
          draft.standardWaiverMarkers.splice(0, draft.standardWaiverMarkers.length - STANDARD_WAIVER_LIMITS.markers);
        }
        noteEffect(ctx, out, 'observed', 'workspace', STANDARD_WAIVER_ROUTE, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(STANDARD_WAIVER_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= STANDARD_WAIVER_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${STANDARD_WAIVER_RULE_ID} from the temporary standard waiver register (#/${STANDARD_WAIVER_ROUTE}?panel=waivers). It reads dated requests, answers and decisions only; it is not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: STANDARD_WAIVER_RULE_ID, summary: standardWaiverAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix?.nodes?.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix?.roster?.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: STANDARD_WAIVER_RULE_ID, summary: 'A standard-waiver ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'chain-review'
        ? `Asked the seat above the renewing line holder whether the standard or the practice has to change, due ${condition.dueOn}.`
        : `Asked the line holder who granted a departure to close it, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', STANDARD_WAIVER_ROUTE,
      `${deferred} standard-waiver ask(s) were deferred (cap ${STANDARD_WAIVER_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

standardWaiverRule.id = 'standardWaiverRule';

export default standardWaiverRule;
