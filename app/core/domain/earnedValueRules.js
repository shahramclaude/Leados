/**
 * app/core/domain/earnedValueRules.js — `RULE-EVL-01` on the shared post-commit
 * spine (ADR-0217, Schema v171).
 *
 * TWO CONDITIONS, both read from the ONE reader (`buildEarnedValue`) with the
 * whole-workspace view, never re-derived here:
 *
 *   1. `reading-owed` — an open case with a live baseline whose newest live
 *      reading (or the case's declaration, when no reading exists) is older than
 *      the declared staleness window. The board reads a position; the position
 *      is a past fact wearing today's date. ONE dated ask goes to the case's
 *      OWNER — the person accountable for the delivery, not their manager.
 *   2. `cost-overrun` — the newest reading is complete against the CURRENT
 *      baseline (signature matches, every live package named) and CPI is below
 *      the declared floor. A dated human decision is owed, not a recalculated
 *      plan. ONE dated ask to the same owner.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * owner, so the title names no case, no amount and no date: a dated act is owed
 * on the earned-value register, and the owner opens it. The opaque signature
 * lives only in the typed `issues-obligation` link summary.
 *
 * WHAT IT NEVER DOES. It never records a reading, never marks progress, never
 * changes a baseline or withdraws a row, never decides whether a programme is
 * worth funding, never values benefits and never rates a person. Where the case
 * owner has left the roster it writes ONE identity-free observation and asks
 * nobody, because the only addressee the record has is gone.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per condition signature, self-closing when the condition clears,
 * bounded per commit with the remainder counted, and pause-governed on every
 * path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildEarnedValue } from './earnedValue.js';
import {
  EV_EVENT_PREFIX,
  EV_LIMITS,
  EV_MARKER_KIND,
  EV_ROUTE,
  EV_RULE_ID,
  EV_SETTING_KEYS,
} from './earnedValueRegistry.js';
import {
  normalizeEvSettings,
  parseEvAskSummary,
  evAskSummary,
} from './earnedValueSchema.js';
import { earnedValueAskSignature } from './earnedValueMath.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function evDays(from, to) {
  if (!from || !to) return null;
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: EV_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: EV_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${EV_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexEarnedValueAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== EV_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseEvAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The conditions the current record creates. */
export function earnedValueConditions(report, { today }) {
  const out = [];
  const staleDays = report?.conventions?.staleDays ?? 35;
  for (const row of list(report?.rows)) {
    if (row.status === 'withdrawn') continue;
    if (!row.ownerOnRoster) continue;
    if (row.livePackageCount > 0) {
      const basis = row.latestReading?.decidedOn || row.declaredOn;
      const age = evDays(basis, today);
      if (age !== null && age > staleDays) {
        out.push({
          kind: 'reading-owed',
          signature: earnedValueAskSignature('reading-owed', row.id, basis),
          seatId: row.ownerId,
          caseId: row.id,
          dueOn: addDays(today, 3),
          observation: 'An open delivery case is owed a current reading and none exists inside the staleness window.',
        });
      }
    }
    if (row.cpiFloorBreached && row.latestReading?.evComplete && row.latestReading?.signatureMatches) {
      out.push({
        kind: 'cost-overrun',
        signature: earnedValueAskSignature('cost-overrun', row.id, row.latestReading.decidedOn || row.id),
        seatId: row.ownerId,
        caseId: row.id,
        dueOn: addDays(today, 3),
        observation: 'The newest complete reading of an open delivery case is below the declared cost floor.',
      });
    }
  }
  return out.filter((condition) => Boolean(condition.seatId));
}

/** The observations nobody can be asked about, recorded identity-free. */
export function earnedValueObservations(report) {
  const out = [];
  for (const row of list(report?.rows)) {
    if (row.status === 'withdrawn') continue;
    if (!row.ownerOnRoster) {
      out.push({ key: `ev|owner-departed|${row.id}`, kind: 'owner-departed', detail: 'An open delivery case names an owner who is not on the active roster. No ask was filed, because there is nobody to ask.' });
    }
  }
  return out;
}

export function earnedValueRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(EV_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeEvSettings(draft.settings || {});
  if (conv.earnedValueAutoPropagate === false) return [];
  if (!list(draft.earnedValueCases).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    report = buildEarnedValue(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }

  const conditions = earnedValueConditions(report, { today });
  const observations = earnedValueObservations(report);
  const existing = indexEarnedValueAsks(draft);
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
      ? `${EV_RULE_ID}: the owner this condition is owed to changed on the record; the stale ask was closed rather than left with a person who no longer holds it.`
      : `${EV_RULE_ID}: the earned-value register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition
      ? 'Closed an earned-value ask: the owner changed.'
      : 'Closed an earned-value ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.earnedValueMarkers = Array.isArray(draft.earnedValueMarkers) ? draft.earnedValueMarkers : [];
    if (draft.earnedValueMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.earnedValueMarkers.push({ key: observation.key, at: nowIso, ruleId: EV_RULE_ID, kind: EV_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.earnedValueMarkers.length > EV_LIMITS.markers) {
      draft.earnedValueMarkers.splice(0, draft.earnedValueMarkers.length - EV_LIMITS.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', EV_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per condition an owner holds. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(EV_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip('A dated decision is owed on the earned-value register', 200),
      expectedOutcome: clip('Open the earned-value register (#/finance?panel=earned-value) and record the reading or decision the record is owed there — or record, in writing, why it cannot be given yet. The register tells you which case; this task deliberately carries no case name, no amount and no date, because a delegation is readable above your seat.', 2000),
      authority: 'act-inform',
      support: `Issued by ${EV_RULE_ID} from the earned-value register (#/finance?panel=earned-value). It reads dated rows only; it is not a finding about anyone and not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: EV_RULE_ID, summary: evAskSummary(condition.signature),
    }, linkCtx);
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'cost-overrun'
        ? `Asked the case owner for the decision the cost position is owed, due ${condition.dueOn}.`
        : `Asked the case owner for the reading the delivery plan is owed, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', EV_ROUTE,
      `${deferred} earned-value ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

earnedValueRule.id = 'earnedValueRule';

export default earnedValueRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const EARNED_VALUE_PAUSE_SWITCH = EV_SETTING_KEYS.autoPropagate;
