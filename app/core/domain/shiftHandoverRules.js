/**
 * app/core/domain/shiftHandoverRules.js — `RULE-SHO-01` on the shared
 * post-commit spine (ADR-0223, Schema v178).
 *
 * TWO CONDITIONS, all read from the ONE reader (`buildShiftHandover`) and the
 * live reporting graph, never re-derived here:
 *
 *   1. `readback-overdue` — a brief whose declared readback instant has passed
 *      and whose incoming operator has not turned their key. The ask goes to
 *      the lowest seat above EVERY line of both operators
 *      (`matrixJointApex` over the union of the outgoing and incoming
 *      operators' active manager lines) — never to one peer line over the
 *      other, and never to either operator, who cannot contain their own
 *      boundary transfer. A genuine diamond tie files one ask per joint apex;
 *      a disconnected graph files none.
 *   2. `readback-disputed` — the incoming operator disputed the handover and
 *      the due instant has passed (or passes while the dispute stands). The
 *      station is not safely manned by assumption; the seat above EVERY line
 *      of both operators is asked to adjudicate and confirm containment.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no station, no operator and no abnormality: a
 * dated decision is owed on the shift-handover register, and the addressee
 * opens it. The opaque signature lives only in the typed `issues-obligation`
 * link.
 *
 * WHAT IT NEVER DOES. It never clocks anybody in or out; never records,
 * synthesizes or disputes a handover; never cancels a brief; never assigns an
 * action's owner; never converts a dispute into a containment; never
 * substitutes a seat for one the matrix cannot name — where nobody can be
 * asked it writes ONE identity-free `shiftHandoverMarkers` observation and
 * asks nobody.
 *
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition
 * clears or moves, bounded at 4 per commit with the remainder counted, and
 * pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import {
  buildShiftHandover,
  shiftHandoverMatrix,
} from './shiftHandover.js';
import {
  SHO_EVENT_PREFIX,
  SHO_LIMITS as L,
  SHO_MARKER_KIND,
  SHO_ROUTE,
  SHO_RULE_ID,
  SHO_SETTING_KEYS,
} from './shiftHandoverRegistry.js';
import {
  normalizeShiftHandoverSettings,
  parseShoAskSummary,
  shoAskSummary,
} from './shiftHandoverSchema.js';
import { shoAwaitingSignature, shoDisputedSignature } from './shiftHandoverMath.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: SHO_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: SHO_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${SHO_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexShiftHandoverAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== SHO_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseShoAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The conditions the current record creates. Pure over (state, report, matrix,
 * now); exported so the test suite can pin every branch without a store.
 *
 * `seatIds` is an ARRAY on every condition: a diamond tie files one ask per
 * joint apex rather than picking one.
 */
export function shiftHandoverConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const rows = Array.isArray(report?.briefsAll) ? report.briefsAll : [];
  if (!rows.length) return { conditions: out, observations };

  for (const row of rows) {
    if (row.state !== 'awaiting-readback' && row.state !== 'disputed') continue;
    if (!row.overdue) continue;
    const signature = row.state === 'disputed' ? shoDisputedSignature(row.id) : shoAwaitingSignature(row.id);
    const kind = row.state === 'disputed' ? 'readback-disputed' : 'readback-overdue';
    // The due instant has passed; the ask is owed now, deterministically.
    const unionManagers = [...new Set([...(row.outgoingManagers || []), ...(row.incomingManagers || [])])].sort();
    let seatIds = [];
    if (matrix && unionManagers.length) {
      const apex = matrixJointApex(matrix, unionManagers);
      // The synthetic workspace leader is a node on the graph, NOT a seat on the
      // roster: asking it would file a delegation nobody can open. Where the
      // graph resolves nothing but the leader, the register files nobody and
      // writes ONE identity-free marker instead.
      const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID;
      seatIds = apex?.unique && askable(apex.apexId) ? [apex.apexId] : (apex?.ambiguous ? [...(apex.apexIds || [])].filter(askable) : []);
    }
    if (seatIds.length) {
      for (const seatId of seatIds) {
        out.push({
          kind,
          signature,
          seatIds: [seatId],
          dueOn: addDays(today, 2),
          briefId: row.id,
          detail: kind === 'readback-disputed'
            ? 'A disputed handover is past its readback instant. The station is not safely manned by assumption.'
            : 'A handover is past its readback instant and the incoming key has not turned.',
        });
      }
    } else {
      observations.push({
        key: `sho1|no-apex|${signature}`,
        detail: row.escalation?.ambiguous
          ? 'A handover is uncontained across lines with no single joint seat above them. Nobody was asked, because there is no single accountability to ask; the uncontained handover is printed on the register.'
          : 'A handover is uncontained and no line of either operator resolves to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
      });
    }
  }
  return { conditions: out, observations };
}

export function shiftHandoverRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(SHO_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeShiftHandoverSettings(draft.settings || {});
  if (conv.shiftHandoverAutoPropagate === false) return [];
  if (!list(draft.shiftHandovers).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildShiftHandover(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = shiftHandoverMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = shiftHandoverConditions(draft, report, { today, matrix });
  const existing = indexShiftHandoverAsks(draft);
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
      ? `${SHO_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${SHO_RULE_ID}: the shift-handover register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a shift-handover ask: the addressee changed.'
      : 'Closed a shift-handover ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.shiftHandoverMarkers = Array.isArray(draft.shiftHandoverMarkers) ? draft.shiftHandoverMarkers : [];
    if (draft.shiftHandoverMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.shiftHandoverMarkers.push({ key: observation.key, at: nowIso, ruleId: SHO_RULE_ID, kind: SHO_MARKER_KIND, detail: clip(observation.detail, 300) });
    if (draft.shiftHandoverMarkers.length > L.markers) {
      draft.shiftHandoverMarkers.splice(0, draft.shiftHandoverMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', SHO_ROUTE, observation.detail);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(SHO_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated decision is owed on the shift-handover register', 200),
        expectedOutcome: clip('Open the shift-handover & two-key readback ledger (#/shift-handover) and record the decision the record is owed there — get the incoming operator’s synthesis or dispute onto the record, or contain the handover through the lines you hold. The register tells you which condition is yours; this task deliberately carries no station, no name and no abnormality, because a delegation is readable above your seat.', 2000),
        authority: 'act-inform',
        support: `Issued by ${SHO_RULE_ID} from the shift-handover register (#/shift-handover). It reads declared briefs and dated readback acts only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: SHO_RULE_ID, summary: shoAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        condition.kind === 'readback-disputed'
          ? `Asked the joint seat above both lines to adjudicate a disputed handover, due ${condition.dueOn}.`
          : `Asked the joint seat above both lines to confirm containment of an overdue handover, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', SHO_ROUTE,
      `${deferred} shift-handover ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

shiftHandoverRule.id = 'shiftHandoverRule';

export default shiftHandoverRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const SHIFT_HANDOVER_PAUSE_SWITCH = SHO_SETTING_KEYS.autoPropagate;
