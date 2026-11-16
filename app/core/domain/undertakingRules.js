/**
 * app/core/domain/undertakingRules.js — `RULE-UDT-01` on the shared
 * post-commit spine (ADR-0234, Schema v189).
 *
 * FOUR CONDITIONS, all read from the ONE kernel (`buildUndertakings`) and the
 * live reporting graph, never re-derived here:
 *
 *   1. `delivery-untested` — a line's holder has ASSERTED the deliverable and
 *      nobody above them has tested it, past the declared chase. The ask goes to
 *      the JOINT APEX ABOVE THE HOLDER's own lines — the lowest seat
 *      independence actually permits — so the holder is never asked to grade
 *      their own work and no unrelated seat is asked.
 *   2. `report-owed` — every line is independently confirmed and no counterparty
 *      report is on the record. The ask goes to the ACCOUNTABLE EXECUTIVE who
 *      declared the promise: doing the work is not telling them, and the report
 *      is the act that discharges the promise.
 *   3. `due-lapsed` — the due day passed with no report on the record. The ask
 *      goes to the accountable executive, ONCE per undertaking: the register
 *      never converts a passed day into a met promise, and the only thing that
 *      can still happen is a human recording what is true.
 *   4. `acknowledgement-owed` — a report is on the record with no recorded
 *      counterparty reply, past the chase. The ask goes to the accountable
 *      executive: a promise told and never answered is not known to be
 *      discharged.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, and this register's subject is an outside party with enforcement
 * powers. So the title names no counterparty, no instrument, no scope, no
 * deliverable and no date: a dated act is owed on the undertaking register, and
 * the addressee opens it. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never assigns, delivers, verifies, reports, notifies or
 * extends; never edits an undertaking or an act; never converts a passed day
 * into a met promise; never infers a holder, a statutory deadline or a
 * counterparty; and never rates a person or a function from backlog or age.
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears
 * or the addressee moves, bounded at 4 per commit with the remainder counted,
 * and pause-governed on every path including an explicit scan
 * (`undertakingAutoPropagate`).
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildUndertakings } from './undertakingClosure.js';
import {
  udtAskSummary,
  udtLapseSignature,
  udtLineSignature,
  udtNotifySignature,
  udtReportSignature,
  parseUdtAskSummary,
} from './undertakingMath.js';
import {
  UDT_EVENT_PREFIX,
  UDT_FLAGS,
  UDT_LIMITS as L,
  UDT_RULE_ID,
  UDT_ROUTE,
  normalizeUndertakingSettings,
} from './undertakingRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: UDT_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: UDT_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${UDT_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexUndertakingAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== UDT_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseUdtAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The manager ids holding a person on the read day — the home line plus every
 * active declared line, deduplicated, never invented. Used to compute the
 * joint apex above a line holder's own lines.
 */
function holderManagerIds(state, holderId, day) {
  const person = list(state?.people).find((row) => row && row.id === holderId) || null;
  const ids = new Set();
  if (person?.managerId && person.managerId !== LEADER_ID) ids.add(person.managerId);
  for (const raw of list(state?.reportingLines)) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    if (raw.personId !== holderId) continue;
    if (raw.status && raw.status !== 'active') continue;
    if (raw.fromISO && String(raw.fromISO).slice(0, 10) > day) continue;
    if (raw.toISO && String(raw.toISO).slice(0, 10) < day) continue;
    if (raw.managerId && raw.managerId !== LEADER_ID) ids.add(raw.managerId);
  }
  return [...ids];
}

/**
 * The conditions the current record creates. Pure over (state, report, today);
 * exported so the test suite can pin every branch without a store.
 */
export function undertakingConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const rows = list(report?.rows);
  if (!rows.length) return { conditions: out, observations };

  const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID && Boolean(matrix?.nodes?.has(id));

  for (const row of rows) {
    // 1. A line asserted and untested: the test is owed above the holder.
    for (const line of row.lines) {
      if (line.lineState !== 'delivered' || !line.holderId || !line.deliveredOn) continue;
      const age = daysBetween(line.deliveredOn, today);
      if (age === null || age <= L.reportChaseDays) continue;
      const signature = udtLineSignature(row.id, line.lineId);
      const managerIds = holderManagerIds(state, line.holderId, today).filter((id) => matrix?.nodes?.has?.(id));
      const apex = managerIds.length ? matrixJointApex(matrix, managerIds) : { apexId: null, unique: false };
      const target = apex.unique ? apex.apexId : null;
      if (!target || target === line.holderId || !askable(target)) {
        observations.push({
          key: `udt1|no-ask|${signature}`,
          detail: 'A line’s deliverable is asserted and untested, and the reporting graph names no independent seat above its holder. Nobody was asked and nothing was substituted.',
        });
        continue;
      }
      out.push({
        kind: 'delivery-untested',
        signature,
        seatIds: [target],
        dueOn: addDays(today, L.askDueDays),
        undertakingId: row.id,
        detail: 'A deliverable was asserted on an obligation line and no independent test is on the record.',
      });
    }

    // 2. Every line confirmed and no report: doing the work is not telling them.
    if (row.allConfirmed && !row.reported) {
      const signature = udtReportSignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `udt1|no-ask|${signature}`,
          detail: 'Every line of an undertaking is independently confirmed with no counterparty report on the record, and the accountable executive it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: 'report-owed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          undertakingId: row.id,
          detail: 'Every line is confirmed and the counterparty has not been told in writing.',
        });
      }
    }

    // 3. The due day passed with no report: one ask, ever, to the accountable executive.
    if (row.lapsed) {
      const signature = udtLapseSignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `udt1|no-ask|${signature}`,
          detail: 'An undertaking has passed its due day with no report on the record, and the accountable executive it names does not resolve to a seat on the reporting graph. Nobody was asked, nothing was substituted, and the register has not invented a closure.',
        });
      } else {
        out.push({
          kind: 'due-lapsed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          undertakingId: row.id,
          detail: 'An undertaking passed its due day with no report on the record; the day has not discharged it.',
        });
      }
    }

    // 4. A report with no counterparty reply past the chase.
    if (row.reported && !row.acknowledgedOn && row.reportOverdue) {
      const signature = udtNotifySignature(row.id);
      const target = row.declaredById;
      if (!target || !askable(target)) {
        observations.push({
          key: `udt1|no-ask|${signature}`,
          detail: 'An undertaking was reported to its counterparty with no reply on the record, and the accountable executive it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: 'acknowledgement-owed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          undertakingId: row.id,
          detail: 'A closure report is on the record with no counterparty reply past the chase window.',
        });
      }
    }
  }
  return { conditions: out, observations };
}

export function undertakingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(UDT_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit
  // census greps the source that reads it.
  const conv = normalizeUndertakingSettings(draft.settings || {});
  if (conv.undertakingAutoPropagate === false) return [];
  if (!list(draft.undertakings).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildUndertakings(draft, { now });
    // The rule never asks an identity the reporting graph cannot carry a
    // delegation for; the whole-workspace graph is read here, without a seat.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = undertakingConditions(draft, report, { today, matrix });
  const existing = indexUndertakingAsks(draft);
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
      ? `${UDT_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${UDT_RULE_ID}: the undertaking register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed an undertaking ask: the addressee changed.'
      : 'Closed an undertaking ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.undertakingMarkers = Array.isArray(draft.undertakingMarkers) ? draft.undertakingMarkers : [];
    if (draft.undertakingMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.undertakingMarkers.push({ key: observation.key, at: nowIso, ruleId: UDT_RULE_ID, kind: 'undertaking', detail: clip(observation.detail, 300) });
    if (draft.undertakingMarkers.length > L.markers) {
      draft.undertakingMarkers.splice(0, draft.undertakingMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', UDT_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  const TITLES = {
    'delivery-untested': 'An independent test is owed on the undertaking register',
    'report-owed': 'A promise is confirmed and the counterparty has not been told',
    'due-lapsed': 'A promise has passed its due day with no report on the record',
    'acknowledgement-owed': 'A closure report has no counterparty reply on the record',
  };
  const OUTCOMES = {
    'delivery-untested': 'Open the undertaking register (#/undertakings) and record the independent test you owe on a line that asserted its deliverable — what you looked at, and whether the deliverable is there. This task deliberately carries no counterparty, instrument, scope, deliverable or date, because a delegation is readable above your seat.',
    'report-owed': 'Open the undertaking register (#/undertakings) and record that the counterparty was told in writing, naming the instrument by which they were told. Doing the work is not telling them. This task deliberately carries no counterparty, instrument, scope, deliverable or date, because a delegation is readable above your seat.',
    'due-lapsed': 'Open the undertaking register (#/undertakings): the due day has passed with no report on the record. The register has not invented a closure; record what is actually true and what the counterparty has been told. This task deliberately carries no counterparty, instrument, scope, deliverable or date, because a delegation is readable above your seat.',
    'acknowledgement-owed': 'Open the undertaking register (#/undertakings) and record what came back from the counterparty — acknowledged, no response yet, or disputed. A promise told and never answered is not known to be discharged. This task deliberately carries no counterparty, instrument, scope, deliverable or date, because a delegation is readable above your seat.',
  };
  const EFFECTS = {
    'delivery-untested': 'Asked an independent seat above a line holder to test an asserted deliverable.',
    'report-owed': 'Asked the accountable executive to report a fully confirmed promise to its counterparty.',
    'due-lapsed': 'Asked the accountable executive to record what is true on a promise past its due day.',
    'acknowledgement-owed': 'Asked the accountable executive to record the counterparty’s reply to a closure report.',
  };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(UDT_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the undertaking register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the undertaking register (#/undertakings).', 2000),
        authority: 'act-inform',
        support: `Issued by ${UDT_RULE_ID} from the undertaking register (#/undertakings). It reads declared undertakings and dated acts only; it is not a judgement about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: UDT_RULE_ID, summary: udtAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${EFFECTS[condition.kind] || 'Filed an undertaking ask.'} Due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', UDT_ROUTE,
      `${deferred} undertaking ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

undertakingRule.id = 'undertakingRule';

export default undertakingRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const UNDERTAKING_PAUSE_SWITCH = 'undertakingAutoPropagate';
