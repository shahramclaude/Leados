/**
 * app/core/domain/suggestionLedger.js — the pure reader for ADR-0227
 * (Frontline Improvement-Suggestion Ledger, `RULE-KZT-01`).
 *
 * `buildSuggestionLedger(state, { now })` is a pure function of the stored
 * suggestions and acts plus an injected clock. It replays each suggestion's acts
 * in chronological order (ties broken by act id, so input order never matters),
 * applies the matrix rule for shared routes, and derives the state on every read.
 * Nothing is written and no status is stored.
 *
 * Authority, in order:
 *   triage  — a member of the declared route; every member of a shared route must
 *             decide the same way (same owner and target day when accepting), else
 *             the route is split and nobody decides.
 *   claim   — the named owner only, and only after acceptance.
 *   confirm — the submitter or a route member, never the owner, and only after a claim.
 * A refused act is never applied; it is counted and printed with its reason.
 */

import { dayKey } from '../time.js';
import { KZT_ADR, KZT_ENGINE_VERSION, KZT_METHOD, KZT_OVERDUE, KZT_REFUSALS, KZT_RULE_ID, KZT_STATES, KZT_STATE_KEYS } from './suggestionRegistry.js';
import { normalizeSuggestionActs, normalizeSuggestions } from './suggestionSchema.js';

const STATE_LABEL = Object.freeze(Object.fromEntries(KZT_STATES.map((row) => [row.key, row.label])));

function instantMs(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function evaluateSuggestion(suggestion, acts, asOfMs, refusals) {
  const route = suggestion.routeIds;
  const submittedMs = Date.parse(suggestion.submittedAt);
  const triageByActor = new Map();
  let split = false;
  let settled = null;
  let claim = null;
  let confirm = null;

  const refuse = (act, reason) => refusals.push({ actId: act.id, suggestionId: suggestion.id, kind: act.kind, reason });

  for (const act of acts) {
    if (act.kind === 'triage') {
      if (Date.parse(act.at) < submittedMs) { refuse(act, KZT_REFUSALS.beforeSubmission); continue; }
      if (!route.includes(act.actorId)) { refuse(act, KZT_REFUSALS.notInRoute); continue; }
      if (split) { refuse(act, KZT_REFUSALS.routeSplit); continue; }
      if (settled) { refuse(act, KZT_REFUSALS.routeSettled); continue; }
      if (triageByActor.has(act.actorId)) { refuse(act, KZT_REFUSALS.alreadyDecided); continue; }
      triageByActor.set(act.actorId, act);
      const positions = new Set([...triageByActor.values()].map((row) => (
        row.decision === 'accept' ? `accept|${row.ownerId}|${row.targetDay}` : 'decline'
      )));
      if (positions.size > 1) { split = true; continue; }
      if (triageByActor.size === route.length) {
        const first = [...triageByActor.values()][0];
        const latest = [...triageByActor.values()].reduce((best, row) => (Date.parse(row.at) > Date.parse(best.at) ? row : best));
        settled = {
          decision: first.decision,
          ownerId: first.decision === 'accept' ? first.ownerId : null,
          targetDay: first.decision === 'accept' ? first.targetDay : null,
          reason: latest.reason,
          at: latest.at,
        };
      }
    } else if (act.kind === 'claim') {
      if (!settled || settled.decision !== 'accept') { refuse(act, KZT_REFUSALS.notAccepted); continue; }
      if (act.actorId !== settled.ownerId) { refuse(act, KZT_REFUSALS.notOwner); continue; }
      if (claim) { refuse(act, KZT_REFUSALS.alreadyClaimed); continue; }
      claim = act;
    } else if (act.kind === 'confirm') {
      if (!claim) { refuse(act, KZT_REFUSALS.notClaimed); continue; }
      if (act.actorId === settled.ownerId) { refuse(act, KZT_REFUSALS.selfConfirmation); continue; }
      if (act.actorId !== suggestion.submitterId && !route.includes(act.actorId)) { refuse(act, KZT_REFUSALS.notConfirmer); continue; }
      if (confirm) { refuse(act, KZT_REFUSALS.alreadyConfirmed); continue; }
      confirm = act;
    }
  }

  let state;
  if (split) state = 'triage-split';
  else if (settled && settled.decision === 'decline') state = 'declined';
  else if (settled && confirm) state = 'closed-confirmed';
  else if (settled && claim) state = 'claimed-awaiting-confirmation';
  else if (settled) state = 'accepted-awaiting-claim';
  else if (triageByActor.size > 0) state = 'awaiting-joint-triage';
  else state = 'awaiting-triage';

  const overdue = [];
  if ((state === 'awaiting-triage' || state === 'awaiting-joint-triage') && asOfMs > Date.parse(suggestion.responseByAt)) {
    overdue.push(KZT_OVERDUE.response);
  }
  if (state === 'accepted-awaiting-claim' && dayKey(new Date(asOfMs)) > settled.targetDay) {
    overdue.push(KZT_OVERDUE.target);
  }

  return {
    id: suggestion.id,
    areaRef: suggestion.areaRef,
    problemText: suggestion.problemText,
    proposalText: suggestion.proposalText,
    submitterId: suggestion.submitterId,
    routeIds: route,
    submittedAt: suggestion.submittedAt,
    responseByAt: suggestion.responseByAt,
    state,
    stateLabel: STATE_LABEL[state],
    decision: settled ? settled.decision : null,
    decisionReason: settled ? settled.reason : null,
    decidedAt: settled ? settled.at : null,
    ownerId: settled && settled.decision === 'accept' ? settled.ownerId : null,
    targetDay: settled && settled.decision === 'accept' ? settled.targetDay : null,
    triageRecorded: triageByActor.size,
    claimedAt: claim ? claim.at : null,
    confirmedAt: confirm ? confirm.at : null,
    overdue,
  };
}

/**
 * @param {object} state  the workspace state (reads `suggestions` and `suggestionActs`)
 * @param {{ now: Date|string }} options  the injected clock; required
 */
export function buildSuggestionLedger(state, { now } = {}) {
  const asOfMs = now instanceof Date ? now.getTime() : instantMs(now);
  if (asOfMs === null) throw new TypeError('buildSuggestionLedger requires an injected `now` instant');

  const warnings = [];
  const rawSuggestions = Array.isArray(state?.suggestions) ? state.suggestions : [];
  const rawActs = Array.isArray(state?.suggestionActs) ? state.suggestionActs : [];
  const suggestions = normalizeSuggestions(rawSuggestions, warnings);
  const acts = normalizeSuggestionActs(rawActs, suggestions, warnings);

  const actsBySuggestion = new Map();
  for (const act of acts) {
    if (!actsBySuggestion.has(act.suggestionId)) actsBySuggestion.set(act.suggestionId, []);
    actsBySuggestion.get(act.suggestionId).push(act);
  }
  for (const list of actsBySuggestion.values()) {
    list.sort((a, b) => (Date.parse(a.at) - Date.parse(b.at)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const refusals = [];
  const ordered = [...suggestions].sort((a, b) => (Date.parse(a.submittedAt) - Date.parse(b.submittedAt)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rows = ordered.map((suggestion) => evaluateSuggestion(suggestion, actsBySuggestion.get(suggestion.id) || [], asOfMs, refusals));

  const byState = Object.fromEntries(KZT_STATE_KEYS.map((key) => [key, 0]));
  const overdue = { response: 0, target: 0 };
  for (const row of rows) {
    byState[row.state] += 1;
    if (row.overdue.includes(KZT_OVERDUE.response)) overdue.response += 1;
    if (row.overdue.includes(KZT_OVERDUE.target)) overdue.target += 1;
  }

  const droppedSuggestions = rawSuggestions.length - suggestions.length;
  const droppedActs = rawActs.length - acts.length;
  const stateTotal = Object.values(byState).reduce((sum, value) => sum + value, 0);

  return {
    engine: KZT_ENGINE_VERSION,
    adr: KZT_ADR,
    rule: KZT_RULE_ID,
    asOf: new Date(asOfMs).toISOString(),
    rows,
    counts: {
      total: rows.length,
      byState,
      overdue,
      refusedActs: refusals.length,
      droppedSuggestions,
      droppedActs,
    },
    refusals,
    // Arithmetic: the printed state counts add to the ledger total.
    partitionReconciles: stateTotal === rows.length,
    // Record integrity: no refused act, no dropped row. Reported apart from the arithmetic.
    figuresComplete: refusals.length === 0 && droppedSuggestions === 0 && droppedActs === 0,
    warnings,
    method: KZT_METHOD,
  };
}
