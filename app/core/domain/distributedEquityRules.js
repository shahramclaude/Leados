/**
 * app/core/domain/distributedEquityRules.js — `RULE-DWE-01` on the shared
 * post-commit spine (ADR-0238, Schema v193).
 *
 * ONE CONDITION, read from the ONE reader (`buildDistributedEquity`) and the
 * live reporting graph, never re-derived here:
 *
 *   `unsociable-over-ceiling` — a person whose trailing-window minutes outside
 *   their DECLARED working window exceed the declared unsociable-hour ceiling.
 *   The ask goes to the lowest seat above EVERY line that convenes or holds
 *   that burden (`matrixJointApex` over the person's own line managers and the
 *   chair managers of their over-ceiling sittings) — never to the person
 *   carrying the burden, who cannot re-time the meetings they are asked to, and
 *   never to one chair on another chair's behalf. A genuine diamond tie files
 *   one ask per joint apex; a disconnected graph files none.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so the title names no person, no zone and no minute count: a
 * dated decision is owed on the distributed-work equity register, and the
 * addressee opens it. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * COVERAGE IS OBSERVED, NEVER ASKED. An attendee whose burden cannot be placed
 * — no declared window, an ambiguous window pair, an unreadable zone, a window
 * boundary inside a DST gap — is a gap in the record, not a fault in a person.
 * Each such case writes ONE identity-free `dweMarkers` observation per
 * (person, window period) and asks nobody: the remedy is a declaration, and
 * the register already prints exactly which cells are blank and why.
 *
 * WHAT IT NEVER DOES. It never declares, amends or withdraws a window; never
 * declares or retracts a sitting; never reschedules or cancels a meeting;
 * never picks between an ambiguous pair of windows; never moves a reading
 * across a DST gap; never converts an unreadable cell into a zero; and never
 * rates a person. Where nobody can be asked — a disconnected graph, or lines
 * the graph cannot name — it writes ONE identity-free observation and asks
 * nobody. Asks are `act-inform` delegations with typed `issues-obligation`
 * provenance, idempotent per (signature, addressee), self-closing when the
 * condition clears or moves, bounded at 4 per commit with the remainder
 * counted, and pause-governed on every path including an explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildDistributedEquity, distributedEquityMatrix } from './distributedEquity.js';
import {
  DWE_EVENT_PREFIX,
  DWE_LIMITS as L,
  DWE_MARKER_KIND,
  DWE_ROUTE,
  DWE_RULE_ID,
  DWE_SETTING_KEYS,
} from './distributedEquityRegistry.js';
import { normalizeDweSettings } from './distributedEquitySchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: DWE_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: DWE_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${DWE_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexDistributedEquityAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== DWE_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseDweAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/** `dwe1:over-ceiling:<personId>:<windowFrom>` — opaque on the link, exact here. */
export function dweAskSignature(personId, windowFrom) {
  return `dwe1:over-ceiling:${personId}:${windowFrom}`;
}

export function parseDweAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = /^dwe1:over-ceiling:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], personId: match[1], windowFrom: match[2] };
}

/**
 * The conditions the current record creates. Pure over (report, matrix, today);
 * exported so the test suite can pin every branch without a store.
 */
export function distributedEquityConditions(report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.overCeiling) return { conditions, observations };
  const windowDays = report.conventions?.windowDays || 28;
  const windowFrom = addDays(today, -(windowDays - 1));

  for (const row of report.overCeiling) {
    const signature = dweAskSignature(row.personId, windowFrom);
    const carriers = [...new Set([...(row.ownManagerIds || []), ...(row.chairManagerIds || [])])];
    const apex = matrix ? matrixJointApex(matrix, carriers) : null;
    const seatIds = apex?.unique && apex.apexId
      ? [apex.apexId]
      : (apex?.ambiguous && !apex.disconnected && Array.isArray(apex.apexIds) ? apex.apexIds : []);
    if (seatIds.length) {
      conditions.push({
        kind: 'unsociable-over-ceiling',
        signature,
        seatIds,
        dueOn: addDays(today, 3),
        personId: row.personId,
        detail: 'A declared unsociable-hour ceiling is exceeded.',
      });
    } else {
      observations.push({
        key: `dwe1|no-apex|${signature}`,
        detail: 'A declared unsociable-hour ceiling is exceeded, and the lines that convene and hold that burden have no joint seat above them on the reporting graph. Nobody was asked, because there is no single accountability to ask; the burden is printed on the register.',
      });
    }
  }

  for (const row of report.people || []) {
    if (!row.sittingsN || row.outsideMinutes !== null) continue;
    const key = `dwe1|unreadable|${row.personId}|${windowFrom}`;
    observations.push({
      key,
      detail: row.windowRefusalCode === 'ambiguous'
        ? 'One attendee carries more than one active working window, so their unsociable minutes cannot be measured. The register refuses to choose between the two; re-declare the window or withdraw one.'
        : row.windowRefusalCode === 'none'
          ? 'One attendee of a declared sitting has no working window on the record, so their unsociable minutes are unknown, not zero. Declaring a sourced window is the remedy; nobody was asked to explain a blank.'
          : 'One attendee’s unsociable minutes cannot be placed: their working window is unreadable. The register prints the reason on the cell and asks nobody.',
    });
  }
  return { conditions, observations };
}

export function distributedEquityRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(DWE_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeDweSettings(draft.settings || {});
  if (conv.dweAutoPropagate === false) return [];
  if (!list(draft.dweWindows).length && !list(draft.dweSittings).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildDistributedEquity(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = distributedEquityMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = distributedEquityConditions(report, { today, matrix });
  const existing = indexDistributedEquityAsks(draft);
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
      ? `${DWE_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${DWE_RULE_ID}: the distributed-work equity register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed a distributed-work equity ask: the addressee changed.'
      : 'Closed a distributed-work equity ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.dweMarkers = Array.isArray(draft.dweMarkers) ? draft.dweMarkers : [];
    if (draft.dweMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.dweMarkers.push({ key: observation.key, at: nowIso, ruleId: DWE_RULE_ID, kind: DWE_MARKER_KIND, detail: clip(observation.detail, 400) });
    if (draft.dweMarkers.length > L.markers) {
      draft.dweMarkers.splice(0, draft.dweMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', DWE_ROUTE, observation.detail);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(DWE_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated decision is owed on the distributed-work equity register', 200),
        expectedOutcome: clip('Open the distributed-work equity register (#/distributed-equity) and record the decision the record is owed there — re-time or re-own the sittings that convene the burden, raise or amend the declared ceiling with a written basis, or record in writing why the position stands. The register tells you which condition is yours; this task deliberately carries no person, no zone and no minute count, because a delegation is readable above your seat.', 2000),
        authority: 'act-inform',
        support: `Issued by ${DWE_RULE_ID} from the distributed-work equity register (#/distributed-equity). It reads declared windows and sittings only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: DWE_RULE_ID, summary: condition.signature,
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        `Asked the joint seat above the lines that convene and hold an over-ceiling unsociable-hour burden for the decision it is owed, due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', DWE_ROUTE,
      `${deferred} distributed-work equity ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

distributedEquityRule.id = 'distributedEquityRule';

export default distributedEquityRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const DWE_PAUSE_SWITCH = DWE_SETTING_KEYS.autoPropagate;
