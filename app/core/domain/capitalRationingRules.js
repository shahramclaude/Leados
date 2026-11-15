/**
 * app/core/domain/capitalRationingRules.js — `RULE-CRS-01` on the shared
 * post-commit spine (ADR-0211, Schema v165).
 *
 * ONE CONDITION, deliberately narrow: a currency holds RATIFIED candidates that
 * nobody has decided yet, and NO seat has declared a ceiling for it. That is a
 * decision the organisation is unable to make — the register can price every
 * candidate and cannot ration a fund whose size nobody stated — and it is the
 * one gap a dated ask can close.
 *
 * WHAT IT DOES NOT DO. It does not ask anybody to fund a case, approve a set,
 * ratify anything or pick a ceiling. It does not chase a relation that is
 * ambiguous (the panel prints it to the seats that can see both sides), a
 * currency whose search was refused (that is a capacity finding about the
 * solver, not a human gap), or a search that was already proven.
 *
 * WHO IS ASKED — the seat that can DECLARE a ceiling, and never the candidates'
 * own benefit owners. A ceiling is the enterprise's claim on its own balance
 * sheet, so the ask goes to the single lowest seat above every reporting line
 * that holds the altitude to declare one. In a matrix that is the joint apex of
 * the roster; where the lines share no single apex, where the apex is the
 * workspace leader, or where nobody is left on the roster, the rule records ONE
 * identity-free `capitalRationingMarkers` observation and asks nobody.
 *
 * REACH. It reads the reporting graph — through `buildMatrix`, exactly once — to
 * resolve who holds the enterprise altitude. That is why its pause switch is
 * registered on PAUSE_PERMIT_MATRIX_REACH_SWITCHES: silencing it reaches every
 * second reporting line under the apex, and those managers are not told.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` and
 * `rolls-up-to` provenance, idempotent per (currency, condition) signature,
 * self-closing when a ceiling is declared or the candidates are decided, bounded
 * per commit with the remainder counted, and pause-governed on EVERY path
 * including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { LEADER_ID } from './chain.js';
import { capitalRationingAttentionCount, buildCapitalRationing } from './capitalRationing.js';
import {
  CAPITAL_RATIONING_CLOSED_PREFIX,
  CAPITAL_RATIONING_EVENT_PREFIX,
  CAPITAL_RATIONING_HREF,
  CAPITAL_RATIONING_LIMITS,
  CAPITAL_RATIONING_MARKER_KIND,
  CAPITAL_RATIONING_RULE_ID,
  CAPITAL_RATIONING_SETTING_KEYS,
} from './capitalRationingRegistry.js';
import {
  capitalRationingAskSummary,
  capitalRationingSignature,
  normalizeCapitalRationingSettings,
  parseCapitalRationingAskSummary,
} from './capitalRationingSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: CAPITAL_RATIONING_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: CAPITAL_RATIONING_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${CAPITAL_RATIONING_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexCapitalRationingAsks(state) {
  const tasks = new Map((Array.isArray(state?.delegations) ? state.delegations : []).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of Array.isArray(state?.links) ? state.links : []) {
    if (!link || link.ruleId !== CAPITAL_RATIONING_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseCapitalRationingAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates: one per currency that holds
 * ratified candidates and no declared ceiling covering today.
 */
export function capitalRationingConditions(report, { today, askDueDays }) {
  return (report.allCurrencies || [])
    .filter((row) => row.stateKey === 'no-ceiling' && row.candidatesN > 0)
    .map((row) => {
      const signature = capitalRationingSignature({ key: 'ceiling-missing', currency: row.currency, subject: String(row.candidatesN) });
      return {
        kind: 'ceiling-missing',
        signature,
        currency: row.currency,
        candidatesN: row.candidatesN,
        askCents: row.askCents,
        dueOn: addDays(today, askDueDays),
        title: `No capital ceiling is declared for ${row.currency}`,
        expectedOutcome: `${row.candidatesN} ratified investment case(s) in ${row.currency} are awaiting a selection decision and ask ${(row.askCents / 100).toFixed(2)} in total. No seat at the enterprise altitude has declared how much may be committed in this currency over the current period, so the register cannot ration the fund — it can only price every candidate. Declare a dated ceiling with its written basis (Budget & finance → Capital rationing → Declare a ceiling). Nothing here asks you to fund any particular case: it asks you to state the size of the fund.`,
        observation: 'Ratified investment cases await selection in a currency with no declared capital ceiling.',
      };
    });
}

export function capitalRationingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  // Derived automation events never re-trigger the scan; everything else can move
  // a case, a ceiling, a relation, the roster, a line — or simply the date.
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(CAPITAL_RATIONING_EVENT_PREFIX)
    && !event.type.startsWith('investmentCase.') && !event.type.startsWith('investmentCase')) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is read by its FULL NAME rather than through the registry key, because
  // the pause-permit reach audit greps THIS file for the literal name — a claim
  // that silencing `capitalRationingAutoPropagate` reaches a second reporting
  // line has to be checkable against the source that reads it.
  const conv = normalizeCapitalRationingSettings(draft.settings || {});
  if (conv.capitalRationingAutoPropagate === false) return [];
  if (!Array.isArray(draft.investmentCases) || !draft.investmentCases.length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  const existing = indexCapitalRationingAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');

  // No ratified case at all and no open ask: nothing can be missing, and the
  // reporting graph is not read.
  const anyRatified = Array.isArray(draft.investmentCaseActs) && draft.investmentCaseActs.some((act) => act && act.kind === 'approve');
  if (!anyRatified && !openAsks.length) return [];

  let report;
  let matrix;
  try {
    // `buildMatrix` — built ONCE — decides who holds the enterprise altitude.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
    report = buildCapitalRationing(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    return [];
  }
  const conditions = capitalRationingConditions(report, { today, askDueDays: conv[CAPITAL_RATIONING_SETTING_KEYS.askDueDays] });
  if (!conditions.length && !openAsks.length) return [];

  // Who may be asked: the single lowest seat above every reporting line, never
  // the workspace leader (a leader-held ask is a marker), never an off-roster id.
  // `matrix.roster` is a Map keyed by person id. Spreading it yields [id, node]
  // PAIRS, so it is read through its keys: an earlier spread-into-filter left the
  // candidate list empty and the rule asked nobody, in silence, while the
  // condition was plainly on the record.
  const rosterIds = [...matrix.roster.keys()].filter((personId) => personId !== LEADER_ID);
  const apex = matrixJointApex(matrix, rosterIds);
  const askable = apex.unique && apex.apexId && apex.apexId !== LEADER_ID && matrix.roster.has(apex.apexId)
    ? { state: 'seat', seatId: apex.apexId, basis: 'joint-apex' }
    : {
      state: apex.isLeaderOnly || !apex.unique ? (apex.disconnected || (apex.ambiguous && !apex.disconnected) ? 'ambiguous' : 'leader-held') : 'off-roster',
      seatId: null,
      basis: 'none',
    };

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose ceiling was declared, or whose candidates are gone. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && askable.state === 'seat' && askable.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${CAPITAL_RATIONING_CLOSED_PREFIX} ${condition
      ? 'the seat that may declare a ceiling moved on the reporting graph; the stale ask was closed rather than left with a seat that no longer holds it.'
      : 'a capital ceiling covering today was declared, or the currency no longer holds ratified candidates awaiting a decision.'}`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition ? 'Closed a capital-ceiling ask: the enterprise seat moved.' : 'Closed a capital-ceiling ask: the condition is settled.');
  }

  /* 2. File one bounded dated ask per missing ceiling; observe the rest. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (askable.state !== 'seat') {
      const key = `capital-rationing|obs|${condition.signature}|${askable.state}`;
      draft.capitalRationingMarkers = Array.isArray(draft.capitalRationingMarkers) ? draft.capitalRationingMarkers : [];
      if (!draft.capitalRationingMarkers.some((marker) => marker && marker.key === key)) {
        const why = askable.state === 'leader-held'
          ? 'The enterprise altitude sits with the workspace leader and the gap is printed on the leader’s own board; no delegation was filed.'
          : askable.state === 'off-roster'
            ? 'No roster seat holds the reporting lines this ceiling would govern; nobody was substituted.'
            : 'The reporting lines share no single seat above them, so the gap is printed and no owner is invented.';
        const detail = `${condition.observation} ${why}`;
        draft.capitalRationingMarkers.push({ key, at: nowIso, ruleId: CAPITAL_RATIONING_RULE_ID, kind: CAPITAL_RATIONING_MARKER_KIND, detail: clip(detail, 300) });
        if (draft.capitalRationingMarkers.length > CAPITAL_RATIONING_LIMITS.markers) {
          draft.capitalRationingMarkers.splice(0, draft.capitalRationingMarkers.length - CAPITAL_RATIONING_LIMITS.markers);
        }
        noteEffect(ctx, out, 'observed', 'workspace', CAPITAL_RATIONING_HREF, detail);
      }
      continue;
    }
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the gap is still open has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === askable.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(CAPITAL_RATIONING_CLOSED_PREFIX)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= CAPITAL_RATIONING_LIMITS.asksPerCommit) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: askable.seatId,
      title: clip(condition.title, 200),
      expectedOutcome: clip(condition.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${CAPITAL_RATIONING_RULE_ID} from the capital-rationing register (${CAPITAL_RATIONING_HREF}). It reads ratified investment cases, their appraisals and today's reporting lines only; it is not a rating of anyone and not a recommendation to fund any case.`,
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
      sourceType: 'person', sourceId: askable.seatId, targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: CAPITAL_RATIONING_RULE_ID, summary: capitalRationingAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance across EVERY line: each roster ancestor in the matrix
    // DAG sees the ask once, however many paths lead to it.
    for (const ancestorId of [...(matrix.nodes.get(askable.seatId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: CAPITAL_RATIONING_RULE_ID, summary: 'A capital-ceiling ask rolls up to this span.',
      }, linkCtx);
    }
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      `Asked the lowest seat above every reporting line to declare a capital ceiling for ${condition.currency}, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', CAPITAL_RATIONING_HREF,
      `${deferred} capital-ceiling ask(s) were deferred (cap ${CAPITAL_RATIONING_LIMITS.asksPerCommit} per commit); they follow on the next write or scan.`);
  }
  return out;
}

capitalRationingRule.id = 'capitalRationingRule';

/** The count the badge reads, re-exported so the rule and the panel agree. */
export { capitalRationingAttentionCount };

export default capitalRationingRule;
