/**
 * app/core/domain/speakUpRules.js — `RULE-SUP-01` on the shared post-commit spine
 * (ADR-0215, Schema v169).
 *
 * TWO CONDITIONS, both read from the ONE reader (`buildSpeakUpReport`) with the
 * whole-workspace view, never re-derived here:
 *
 *   1. `ack-overdue` — the declared acknowledgement window passed and no
 *      acknowledgement is on the record. ONE dated ask goes to the RECEIVER the
 *      concern was routed to. Not to the reporter (who would be asked to chase
 *      their own protection), not to the receiver's manager (who was not given
 *      the concern), and never to the subject.
 *
 *   2. `watch-overdue` — an outcome is recorded and the declared retaliation
 *      window closed with no dated check. ONE dated ask goes to the receiver.
 *      A watch window that ends in silence is the exact condition in which a
 *      workforce learns that speaking up is expensive, and the register refuses
 *      to print that silence as a clearance.
 *
 * THE ASK SAYS NOTHING. A delegation is readable by seats above the receiver, so
 * an ask that described the concern would leak it to precisely the people the
 * route was chosen to avoid. The title, the expected outcome and the roll-up
 * summaries name no party, no category, no date and no summary: they say that a
 * dated act is owed on the speak-up register, and the receiver opens it. The
 * opaque reference lives only in the typed `issues-obligation` link summary,
 * which is what makes the ask idempotent.
 *
 * WHAT IT NEVER DOES. It never acknowledges, records an outcome, checks
 * retaliation, closes or withdraws a concern; never decides whether one is well
 * founded; never re-routes a concern away from its receiver; never asks the
 * subject; and never rates anybody. Where a concern has NO impartial route, or
 * its receiver has drifted out of impartiality, it records ONE identity-free
 * `concernMarkers` observation and asks nobody — because every candidate it
 * could name is disqualified by the very test that found the problem, and
 * manufacturing an addressee is how a register quietly reassures itself.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per condition signature, self-closing when the condition clears,
 * bounded per commit with the remainder counted, and pause-governed on every
 * path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSpeakUpReport } from './speakUp.js';
import {
  SPEAK_UP_EVENT_PREFIX,
  SPEAK_UP_LIMITS,
  SPEAK_UP_MARKER_KIND,
  SPEAK_UP_ROUTE,
  SPEAK_UP_RULE_ID,
  SPEAK_UP_SETTING_KEYS,
} from './speakUpRegistry.js';
import {
  normalizeSpeakUpSettings,
  parseSpeakUpAskSummary,
  speakUpAskSummary,
  speakUpSignature,
} from './speakUpSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: SPEAK_UP_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: SPEAK_UP_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${SPEAK_UP_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexSpeakUpAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== SPEAK_UP_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseSpeakUpAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** The conditions the current record creates. */
export function speakUpConditions(report, { today }) {
  const out = [];
  for (const row of list(report?.rows)) {
    if (row.stateKey === 'ack-overdue') {
      out.push({
        kind: 'ack-overdue',
        signature: speakUpSignature('ack', row.id),
        seatId: row.receiverId || null,
        reportId: row.id,
        dueOn: addDays(today, 3),
        observation: 'The acknowledgement window on a routed concern has closed with no acknowledgement on the record.',
      });
    } else if (row.stateKey === 'watch-overdue') {
      out.push({
        kind: 'watch-overdue',
        signature: speakUpSignature('watch', row.id),
        seatId: row.receiverId || null,
        reportId: row.id,
        dueOn: addDays(today, 3),
        observation: 'The declared retaliation window closed with no dated check on the record.',
      });
    }
  }
  return out.filter((condition) => Boolean(condition.seatId));
}

/** The observations nobody can be asked about, recorded identity-free. */
export function speakUpObservations(report) {
  const out = [];
  for (const row of list(report?.rows)) {
    if (row.stateKey === 'no-impartial-route') {
      out.push({ key: `speak-up|no-route|${row.id}`, kind: 'no-impartial-route', detail: 'A concern is recorded on a record that holds no seat able to hear it without holding one of the parties. No receiver was invented and no ask was filed.' });
    }
    if (row.receiverImpartial === false) {
      out.push({ key: `speak-up|drifted|${row.id}`, kind: 'receiver-drifted', detail: 'A named receiver no longer passes the impartiality test against the current reporting graph. The register prints this on the reading; it does not re-route the concern on its own.' });
    }
  }
  return out;
}

export function speakUpRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(SPEAK_UP_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeSpeakUpSettings(draft.settings || {});
  if (conv.speakUpAutoPropagate === false) return [];
  if (!list(draft.concernReports).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  try {
    report = buildSpeakUpReport(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
  } catch {
    return [];
  }

  const conditions = speakUpConditions(report, { today });
  const observations = speakUpObservations(report);
  const existing = indexSpeakUpAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];
  const bySignature = new Map(conditions.map((condition) => [condition.signature, condition]));

  /* 1. Close asks whose condition cleared or whose receiver moved. */
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
      ? `${SPEAK_UP_RULE_ID}: the receiver this condition is owed to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${SPEAK_UP_RULE_ID}: the speak-up register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, condition
      ? 'Closed a speak-up ask: the receiver changed.'
      : 'Closed a speak-up ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.concernMarkers = Array.isArray(draft.concernMarkers) ? draft.concernMarkers : [];
    if (draft.concernMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.concernMarkers.push({ key: observation.key, at: nowIso, ruleId: SPEAK_UP_RULE_ID, kind: SPEAK_UP_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.concernMarkers.length > SPEAK_UP_LIMITS.markers) {
      draft.concernMarkers.splice(0, draft.concernMarkers.length - SPEAK_UP_LIMITS.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', SPEAK_UP_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per condition a receiver holds. */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    if (covered.has(condition.signature)) continue;
    // A human who closed or returned the ask while the condition stands has ANSWERED it.
    const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === condition.seatId
      && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(SPEAK_UP_RULE_ID)) || ask.task.status === 'returned'));
    if (answered) continue;
    if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

    const taskId = idFactory('dlg');
    if (!Array.isArray(draft.delegations)) draft.delegations = [];
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip('A dated act is owed on the speak-up register', 200),
      expectedOutcome: clip('Open the speak-up register (#/speak-up) and record the act that is owed there. The register tells you which one; this task deliberately carries no names, no category and no detail, because a delegation is readable above your seat and the route was chosen to avoid exactly that.', 2000),
      authority: 'act-inform',
      support: `Issued by ${SPEAK_UP_RULE_ID} from the speak-up register (#/speak-up). It reads dated rows only; it is not a finding about anyone and not a rating of anyone.`,
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
      relation: 'issues-obligation', ruleId: SPEAK_UP_RULE_ID, summary: speakUpAskSummary(condition.signature),
    }, linkCtx);
    // Roll-up provenance: this rule reads no reporting graph, so the ask rolls up
    // through the ordinary seat pass rather than inventing ancestors here.
    covered.add(condition.signature);
    issued += 1;
    noteEffect(ctx, out, 'delegated', 'delegation', taskId,
      condition.kind === 'watch-overdue'
        ? `Asked the receiver to record the overdue retaliation check, due ${condition.dueOn}.`
        : `Asked the receiver to acknowledge an overdue concern, due ${condition.dueOn}.`);
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', SPEAK_UP_ROUTE,
      `${deferred} speak-up ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

speakUpRule.id = 'speakUpRule';

export default speakUpRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const SPEAK_UP_PAUSE_SWITCH = SPEAK_UP_SETTING_KEYS.autoPropagate;
export const SPEAK_UP_LEADER_SENTINEL = LEADER_ID;
