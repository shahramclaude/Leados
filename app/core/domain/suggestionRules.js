/**
 * app/core/domain/suggestionRules.js — `RULE-KZT-01` on the shared post-commit
 * spine (ADR-0227, Schema v185).
 *
 * TWO CONDITIONS, both read from the ONE kernel (`buildSuggestionLedger`) and
 * the live reporting graph, never re-derived here:
 *
 *   1. `response-overdue` — a suggestion past its declared response-by instant
 *      that the route has not settled. The ask goes to each UNDECIDED member of
 *      the computed route — the joint-apex seat(s) that owe the decision — and
 *      to nobody else. A route member the reporting graph can no longer name is
 *      NOT substituted for: ONE identity-free `suggestionMarkers` observation
 *      is written and nobody is asked.
 *   2. `target-overdue` — an accepted suggestion past its target day with no
 *      effect claim. The ask goes to the named owner, who is the only person
 *      who can claim it.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no area, no problem, no proposal and no
 * submitter: a dated response is owed on the improvement-suggestion register,
 * and the addressee opens it. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never triages, claims or confirms anything; it never
 * edits a suggestion or an act; it never declines on overdue and never closes
 * by the passage of time; it never asks the owner to confirm their own effect;
 * it never rates a person from backlog or age. Asks are `act-inform`
 * delegations with typed `issues-obligation` provenance, idempotent per
 * (signature, addressee), self-closing when the condition clears or the
 * addressee moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan
 * (`suggestionAutoPropagate`).
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildSuggestionLedger } from './suggestionLedger.js';
import {
  KZT_EVENT_PREFIX,
  KZT_LIMITS as L,
  KZT_MARKER_KIND,
  KZT_ROUTE,
  KZT_RULE_ID,
} from './suggestionRegistry.js';
import { normalizeSuggestionSettings } from './suggestionRegistry.js';
import { parseKztAskSummary, kztAskSummary, kztResponseSignature, kztTargetSignature } from './suggestionMath.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: KZT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: KZT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${KZT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexSuggestionAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== KZT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseKztAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over (state, report, matrix,
 * now); exported so the test suite can pin every branch without a store.
 *
 * `seatIds` is an ARRAY on every condition: an undecided shared route files one
 * ask per member who still owes a decision.
 */
export function suggestionConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const acts = list(state?.suggestionActs);
  const rows = list(report?.rows);
  if (!rows.length) return { conditions: out, observations };

  // The reporting graph is read here — and only here — to decide who can still
  // be ASKED. A person the graph cannot name is not asked and is never
  // substituted for; the observation carries the reason and no identity.
  const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID && Boolean(matrix?.nodes?.has(id));
  const owesTriage = (suggestionId, actorId) => !acts.some((act) => act && act.kind === 'triage' && act.suggestionId === suggestionId && act.actorId === actorId);

  for (const row of rows) {
    const responseOverdue = (row.state === 'awaiting-triage' || row.state === 'awaiting-joint-triage')
      && row.overdue.includes('response-overdue');
    const targetOverdue = row.state === 'accepted-awaiting-claim' && row.overdue.includes('target-overdue');

    if (responseOverdue) {
      const signature = kztResponseSignature(row.id);
      const deciders = row.routeIds.filter((id) => owesTriage(row.id, id));
      const seatIds = deciders.filter(askable);
      const unnameable = deciders.filter((id) => !askable(id));
      if (seatIds.length) {
        for (const seatId of seatIds) {
          out.push({
            kind: 'response-overdue',
            signature,
            seatIds: [seatId],
            dueOn: addDays(today, 2),
            suggestionId: row.id,
            detail: 'A suggestion is past its declared response window and the route has not settled it.',
          });
        }
      } else {
        observations.push({
          key: `kzt1|no-ask|${signature}`,
          detail: 'A suggestion is past its response window and no undecided route member resolves to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      }
      for (const gone of unnameable) {
        observations.push({
          key: `kzt1|gone|${signature}|${gone}`,
          detail: 'A member of a suggestion’s decision route no longer resolves on the reporting graph. That decision cannot be owed to a seat; the route can no longer settle and the split or silence is printed on the register.',
        });
      }
      continue;
    }

    if (targetOverdue) {
      const signature = kztTargetSignature(row.id);
      if (askable(row.ownerId)) {
        out.push({
          kind: 'target-overdue',
          signature,
          seatIds: [row.ownerId],
          dueOn: addDays(today, 2),
          suggestionId: row.id,
          detail: 'An accepted suggestion is past its target day and no effect is claimed on the record.',
        });
      } else {
        observations.push({
          key: `kzt1|no-ask|${signature}`,
          detail: 'An accepted suggestion is past its target day and its named owner does not resolve on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      }
    }
  }
  return { conditions: out, observations };
}

export function suggestionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(KZT_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeSuggestionSettings(draft.settings || {});
  if (conv.suggestionAutoPropagate === false) return [];
  if (!list(draft.suggestions).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildSuggestionLedger(draft, { now });
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = suggestionConditions(draft, report, { today, matrix });
  const existing = indexSuggestionAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close asks whose condition cleared or whose addressee changed. */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const conditionKeys = new Set(conditions.flatMap((row) => row.seatIds.map((seatId) => openKey(row.signature, seatId))));
  const covered = new Set();
  for (const ask of openAsks) {
    const key = openKey(ask.signature, ask.seatId);
    if (conditionKeys.has(key) && ask.task.personId === ask.seatId) {
      covered.add(key);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = conditionKeys.has(key)
      ? `${KZT_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${KZT_RULE_ID}: the improvement-suggestion register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a suggestion ask: the addressee changed.'
      : 'Closed a suggestion ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.suggestionMarkers = Array.isArray(draft.suggestionMarkers) ? draft.suggestionMarkers : [];
    if (draft.suggestionMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.suggestionMarkers.push({ key: observation.key, at: nowIso, ruleId: KZT_RULE_ID, kind: KZT_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.suggestionMarkers.length > L.markers) {
      draft.suggestionMarkers.splice(0, draft.suggestionMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', KZT_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(KZT_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(condition.kind === 'target-overdue'
          ? 'A dated effect claim is owed on the improvement-suggestion register'
          : 'A dated response is owed on the improvement-suggestion register', 200),
        expectedOutcome: clip(condition.kind === 'target-overdue'
          ? 'Open the improvement-suggestion ledger (#/suggestions) and record what the change actually did — claim the effect you own, or let the register show why it cannot be claimed yet. This task deliberately carries no area, no problem text and no name, because a delegation is readable above your seat.'
          : 'Open the improvement-suggestion ledger (#/suggestions) and record the decision the record is owed there — accept with an owner and a target day, or decline with the reason. This task deliberately carries no area, no problem text and no name, because a delegation is readable above your seat.', 2000),
        authority: 'act-inform',
        support: `Issued by ${KZT_RULE_ID} from the improvement-suggestion register (#/suggestions). It reads declared suggestions and dated acts only; it is not a finding about anyone and not a rating of anyone.`,
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
        sourceType: 'person', sourceId: seatId, targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: KZT_RULE_ID, summary: kztAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        condition.kind === 'target-overdue'
          ? `Asked the named owner to claim the effect on an overdue accepted suggestion, due ${condition.dueOn}.`
          : `Asked a member of the computed decision route to record the owed triage decision on an overdue suggestion, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', KZT_ROUTE,
      `${deferred} suggestion ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

suggestionRule.id = 'suggestionRule';

export default suggestionRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const SUGGESTION_PAUSE_SWITCH = 'suggestionAutoPropagate';
