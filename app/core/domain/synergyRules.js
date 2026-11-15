/**
 * app/core/domain/synergyRules.js — `RULE-SYN-01` on the shared post-commit spine
 * (ADR-0216, Schema v170).
 *
 * TWO CONDITIONS, both read from the ONE reader (`buildDealSynergy`) with the
 * whole-workspace view, never re-derived here:
 *
 *   1. `unverified` — a phase of a promise's ladder has come due and NO verified
 *      reading exists. ONE dated ask goes to the promise's OWNER, because the
 *      owner is the person who made the number up and the person who must now
 *      have it checked. Not to their manager (who was not given the promise), not
 *      to the verifier (none exists yet), and never to the whole deal team.
 *
 *   2. `verified-stale` — a promise has a verified reading, but the newest one is
 *      older than the declared staleness window. A board reading a two-year-old
 *      verification as today's position is the quiet failure this condition
 *      exists for. ONE dated ask goes to the owner.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * owner, so the title and the expected outcome name no deal, no lever, no amount
 * and no saving: they say a dated verification is owed on the deal synergy
 * register, and the owner opens it. The opaque signature lives only in the typed
 * `issues-obligation` link summary, which is what makes the ask idempotent.
 *
 * WHAT IT NEVER DOES. It never records a reading, never verifies anything itself,
 * never changes a promise or a ladder, never withdraws a row, never decides
 * whether a deal is good, and never rates a person. Where a promise's owner has
 * left the roster it writes ONE identity-free observation and asks nobody,
 * because the only addressee the record has is a person who is no longer here.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per condition signature, self-closing when the condition clears,
 * bounded per commit with the remainder counted, and pause-governed on every path
 * including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildDealSynergy } from './dealSynergy.js';
import {
  SYNERGY_EVENT_PREFIX,
  SYNERGY_LIMITS,
  SYNERGY_MARKER_KIND,
  SYNERGY_ROUTE,
  SYNERGY_RULE_ID,
  SYNERGY_SETTING_KEYS,
} from './synergyRegistry.js';
import {
  normalizeSynergySettings,
  parseSynergyAskSummary,
  synergyAskSummary,
  synergySignature,
} from './synergySchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: SYNERGY_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: SYNERGY_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${SYNERGY_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexSynergyAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== SYNERGY_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseSynergyAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The conditions the current record creates. */
export function synergyConditions(report, { today }) {
  const out = [];
  for (const row of list(report?.rows)) {
    if (row.withdrawnOn) continue;
    if (!row.ownerOnRoster) continue;
    if (row.stateKey === 'unverified' && row.latestDueOn) {
      out.push({
        kind: 'unverified',
        signature: synergySignature('unverified', row.id, row.latestDueOn),
        seatId: row.ownerId,
        claimId: row.id,
        dueOn: addDays(today, 3),
        observation: 'A phase of a promise is due and no verified reading exists on the register.',
      });
    } else if (row.verifiedStale && !row.verifiedDrifted && row.verifiedAsOf) {
      out.push({
        kind: 'stale',
        signature: synergySignature('stale', row.id, row.verifiedAsOf),
        seatId: row.ownerId,
        claimId: row.id,
        dueOn: addDays(today, 3),
        observation: 'The newest verified reading on a promise is older than the declared staleness window.',
      });
    }
  }
  return out.filter((condition) => Boolean(condition.seatId));
}

/** The observations nobody can be asked about, recorded identity-free. */
export function synergyObservations(report) {
  const out = [];
  for (const row of list(report?.rows)) {
    if (row.withdrawnOn) continue;
    if (row.stateKey === 'unowned') {
      out.push({ key: `synergy|unowned|${row.id}`, kind: 'owner-departed', detail: 'A promise on the register has no owner on the active roster. No ask was filed, because there is nobody to ask.' });
    }
    if (row.verifiedDrifted) {
      out.push({ key: `synergy|drift|${row.id}|${row.verifiedAsOf || ''}`, kind: 'verifier-drifted', detail: 'A verified reading was made by a seat that is no longer above the promise’s owner on any line. It is counted as unverified until re-verified.' });
    }
  }
  return out;
}

export function synergyRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(SYNERGY_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeSynergySettings(draft.settings || {});
  if (conv.synergyAutoPropagate === false) return [];
  if (!list(draft.dealTheses).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    report = buildDealSynergy(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }

  const conditions = synergyConditions(report, { today });
  const observations = synergyObservations(report);
  const existing = indexSynergyAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition cleared or whose owner changed. */
  const covered = new Set();
  for (const ask of openAsks) {
    const condition = bySignature.get(ask.signature) || null;
    if (condition && condition.seatId === ask.seatId && ask.task.personId === ask.seatId) {
      covered.add(ask.signature);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = condition
      ? `${SYNERGY_RULE_ID}: the owner this condition is owed to changed on the record; the stale ask was closed rather than left with a person who no longer holds it.`
      : `${SYNERGY_RULE_ID}: the deal synergy register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition
      ? 'Closed a synergy ask: the owner changed.'
      : 'Closed a synergy ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.synergyMarkers = Array.isArray(draft.synergyMarkers) ? draft.synergyMarkers : [];
    if (draft.synergyMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.synergyMarkers.push({ key: observation.key, at: nowIso, ruleId: SYNERGY_RULE_ID, kind: SYNERGY_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.synergyMarkers.length > SYNERGY_LIMITS.markers) {
      draft.synergyMarkers.splice(0, draft.synergyMarkers.length - SYNERGY_LIMITS.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', SYNERGY_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per condition an owner holds. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(SYNERGY_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip('A dated verification is owed on the deal synergy register', 200),
      expectedOutcome: clip('Open the deal synergy register (#/finance?panel=synergy) and record the reading that is owed there — or record, in writing, why it cannot be verified yet. The register tells you which promise; this task deliberately carries no deal, no lever and no amount, because a delegation is readable above your seat.', 2000),
      authority: 'act-inform',
      support: `Issued by ${SYNERGY_RULE_ID} from the deal synergy register (#/finance?panel=synergy). It reads dated rows only; it is not a finding about anyone and not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: SYNERGY_RULE_ID, summary: synergyAskSummary(condition.signature),
    }, linkCtx);
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'stale'
        ? `Asked the owner for a current verified reading, due ${condition.dueOn}.`
        : `Asked the owner for the verification a due promise is owed, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', SYNERGY_ROUTE,
      `${deferred} synergy ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

synergyRule.id = 'synergyRule';

export default synergyRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const SYNERGY_PAUSE_SWITCH = SYNERGY_SETTING_KEYS.autoPropagate;
