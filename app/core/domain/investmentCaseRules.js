/**
 * app/core/domain/investmentCaseRules.js — `RULE-ICA-01` on the shared
 * post-commit spine (ADR-0208, Schema v162).
 *
 * ONE CONDITION, and it is deliberately narrow: a RATIFIED case has reached a
 * review day it declared, and no review is recorded up to that day. That is a
 * promise somebody signed for which nobody has looked at the result — the
 * failure that lets every later promise be as optimistic as the last one.
 *
 * WHAT IT DOES NOT DO. It does not chase a proposal nobody has ratified (the
 * board prints it to the seats that may ratify it), a refused or withdrawn case,
 * or a closed one. It never records a review, never ratifies, never judges
 * whether a case delivered, never moves money and never rates a person.
 *
 * WHO IS ASKED — decision CONTROL, never decision management. The review is owed
 * to the seat that ratified the case, for as long as that seat is on the roster,
 * holds the altitude to ratify and still sits above the benefit owner. When it
 * does not, the review passes to the LOWEST SEAT ABOVE EVERY ONE of the owner's
 * active reporting lines that holds that altitude — in a matrix, the joint apex
 * of the owner's managers, never one line's manager on behalf of the other. The
 * benefit owner is never asked to grade their own case. Where control sits with
 * the workspace leader, where the lines share no single apex, or where neither
 * ratifier nor owner is on the roster, the rule records ONE identity-free
 * `investmentCaseMarkers` observation and asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per (case, review day), self-closing when
 * the review is recorded or control moves, bounded per commit with the remainder
 * counted, and pause-governed on EVERY path including an explicit scan.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once — to
 * resolve who holds decision control over a multi-line owner. That is why its
 * pause switch is registered on PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it
 * reaches a second reporting line, and that line's manager is not told.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { investmentCaseDueReviews } from './investmentCase.js';
import {
  INVESTMENT_CASE_ASK_PREFIX,
  INVESTMENT_CASE_CLOSED_PREFIX,
  INVESTMENT_CASE_EVENT_PREFIX,
  INVESTMENT_CASE_HREF,
  INVESTMENT_CASE_LIMITS,
  INVESTMENT_CASE_MARKER_KIND,
  INVESTMENT_CASE_RULE_ID,
  INVESTMENT_CASE_SETTING_KEYS,
} from './investmentCaseRegistry.js';
import {
  investmentCaseAskSummary,
  normalizeInvestmentCaseSettings,
  parseInvestmentCaseAskSummary,
} from './investmentCaseSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: INVESTMENT_CASE_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: INVESTMENT_CASE_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${INVESTMENT_CASE_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexInvestmentCaseAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== INVESTMENT_CASE_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseInvestmentCaseAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates: one per ratified case whose
 * governing review day has arrived. `seatState` says whether a roster seat can
 * be asked — `seat` (ask `seatId`), `leader-held`, `ambiguous` or `off-roster`.
 */
export function investmentCaseConditions(due, { today, askDueDays }) {
  return (due || []).map((row) => ({
    kind: 'review-due',
    signature: row.signature,
    caseId: row.caseId,
    seatState: row.monitor.state,
    seatId: row.monitor.state === 'seat' ? row.monitor.seatId : null,
    basis: row.monitor.basis,
    dueOn: addDays(today, askDueDays),
    title: `Post-completion review is due for “${clip(row.title, 80)}”`,
    expectedOutcome: `This case was ratified on ${row.ratifiedOn} and declared a review on ${row.dueOn}. That day has arrived${row.overdueDays ? ` (${row.overdueDays} day(s) ago)` : ''} and no review is recorded up to it${row.reviewsN ? ` — ${row.reviewsN} earlier review(s) are on file` : ''}. Record what actually moved up to a cut-off — every outlay, benefit and residual in ${row.currency} — and say whether the outlay is complete (Budget & finance → Investment cases). Decision control does not grade itself: the benefit owner cannot record this review. Nothing here judges whether the case delivered; it asks that somebody looks.`,
    observation: 'A ratified investment case reached its declared review day with no review recorded up to it.',
  }));
}

export function investmentCaseRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can move
  // a case, an act, the roster, a reporting line — or simply the date.
  if (event.type.startsWith('automation.') || (ctx.derived && !event.type.startsWith(INVESTMENT_CASE_EVENT_PREFIX))) return [];

  // A pause is a pause: it governs every path, including an explicit scan.
  // The switch is read by its full name rather than through the registry key:
  // the pause-permit reach audit reads THIS file for the literal name, because a
  // claim that silencing `investmentCaseAutoPropagate` reaches a second
  // reporting line has to be checkable against the source that reads it.
  const conv = normalizeInvestmentCaseSettings(draft.settings || {});
  if (conv.investmentCaseAutoPropagate === false) return [];
  if (!Array.isArray(draft.investmentCases) || !draft.investmentCases.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  const existing = indexInvestmentCaseAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  // No ratified case and no open ask: nothing can be due, and the graph is not read.
  const anyRatified = Array.isArray(draft.investmentCaseActs) && draft.investmentCaseActs.some((act) => act && act.kind === 'approve');
  if (!anyRatified && !openAsks.length) return [];

  let due;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides who holds decision control over a
    // multi-line owner. Silencing this rule therefore reaches a second line.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    due = investmentCaseDueReviews(draft, { now, matrix });
  } catch {
    return [];
  }
  const conditions = investmentCaseConditions(due, { today, askDueDays: conv[INVESTMENT_CASE_SETTING_KEYS.askDueDays] });
  if (!conditions.length && !openAsks.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose review was recorded, or whose decision control moved. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatState === 'seat' && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${INVESTMENT_CASE_CLOSED_PREFIX} ${condition
      ? 'decision control over this case moved on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'a review reaching the declared day was recorded, or the case is no longer awaiting one.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed an investment-case review ask: decision control moved.' : 'Closed an investment-case review ask: the review was recorded.');
  }

  /* 2. File one bounded dated ask per due review a roster seat holds; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (condition.seatState !== 'seat') {
      const key = `investment-case|obs|${condition.signature}|${condition.seatState}`;
      draft.investmentCaseMarkers = Array.isArray(draft.investmentCaseMarkers) ? draft.investmentCaseMarkers : [];
      if (!draft.investmentCaseMarkers.some((marker) => marker && marker.key === key)) {
        const why = condition.seatState === 'leader-held'
          ? 'Decision control sits with the workspace leader and the case is printed on the leader’s own board; no delegation was filed.'
          : condition.seatState === 'off-roster'
            ? 'Neither the seat that ratified nor the benefit owner is on the active roster; nobody was substituted.'
            : 'The benefit owner’s reporting lines share no single seat above them that holds the altitude to ratify, so the review is printed and no owner is invented.';
        const detail = `${condition.observation} ${why}`;
        draft.investmentCaseMarkers.push({ key, at: nowIso, ruleId: INVESTMENT_CASE_RULE_ID, kind: INVESTMENT_CASE_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.investmentCaseMarkers.length > INVESTMENT_CASE_LIMITS.markers) draft.investmentCaseMarkers.splice(0, draft.investmentCaseMarkers.length - INVESTMENT_CASE_LIMITS.markers);
        noteEffect(ctx, out, 'observed', 'workspace', INVESTMENT_CASE_HREF, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the review is still due has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(INVESTMENT_CASE_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= INVESTMENT_CASE_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${INVESTMENT_CASE_RULE_ID} from the investment case register (${INVESTMENT_CASE_HREF}). It reads declared cases, their dated acts and today's reporting lines only; it is not a rating of anyone and not a verdict on the case.`,
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
      relation: 'issues-obligation', ruleId: INVESTMENT_CASE_RULE_ID, summary: investmentCaseAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(condition.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: INVESTMENT_CASE_RULE_ID, summary: 'An investment-case review ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked the seat holding decision control (${condition.basis === 'ratifier' ? 'the ratifier' : 'the joint apex above every one of the benefit owner’s lines'}) to record a post-completion review, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', INVESTMENT_CASE_HREF,
      `${deferred} investment-case review ask(s) were deferred (cap ${INVESTMENT_CASE_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

investmentCaseRule.id = 'investmentCaseRule';

/** The prefix the rule stamps on its own asks, exported for the panel's copy. */
export const INVESTMENT_CASE_ASK_LABEL = INVESTMENT_CASE_ASK_PREFIX;

export default investmentCaseRule;
