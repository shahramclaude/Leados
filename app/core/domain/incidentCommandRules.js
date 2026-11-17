/**
 * app/core/domain/incidentCommandRules.js — `RULE-MIC-01` on the shared
 * post-commit spine (ADR-0240, Schema v194).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`incidentReport`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `notification-lapsed` — a declared notification obligation whose own
 *      declared deadline has passed with nothing recorded against it. The ask
 *      goes to the JOINT APEX above the response lines that hold the obligation
 *      and its clock, because a blown regulator deadline is never one line's
 *      problem: the compliance line owns the clock, the operations line owns the
 *      event, and the seat answerable for both is the seat above both.
 *
 *   2. `notification-closing` — the same obligation, still unmet, but inside the
 *      declared closing window. Filed once per (obligation, window) so a long
 *      window does not generate a daily stream of identical asks; the ask is
 *      refreshed only when the window rolls forward.
 *
 *   3. `no-commander` — a live MAJOR incident with nobody in command. This is
 *      the one condition whose remedy is a single actor's act, so the ask goes
 *      to the seat that can actually take command: the joint apex above the
 *      response lines. A minor incident is never asked about, because a minor
 *      incident nobody commanded was never a command failure.
 *
 *   4. `command-standing` — the incident is closed and command was never
 *      released. The ask goes to the CURRENT COMMANDER by name, because that is
 *      the only hand permitted to release it (the action refuses everyone else),
 *      and a rule that asked anybody else would be filing work nobody can do.
 *      Where the commander is off the graph or archived, the ask goes to the
 *      joint apex above the lines instead, with the substitution printed.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a person, a party, an instrument or a minute
 * count. The opaque signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never notifies anybody, never declares, resolves or
 * stands down an incident, never changes a severity, never records a
 * notification on somebody's behalf, never computes a deadline of its own, and
 * never rates or names a responder as a cause. Where nobody can be asked — a
 * disconnected graph, or a commander the graph cannot name — it writes ONE
 * identity-free observation and asks nobody. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at 4 per commit with the remainder counted, and pause-governed on
 * every path including the explicit scan.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { incidentMatrix, incidentReport } from './incidentCommand.js';
import {
  MIC_EVENT_PREFIX,
  MIC_LIMITS as L,
  MIC_MARKER_KIND,
  MIC_ROUTE,
  MIC_RULE_ID,
  MIC_SETTING_KEYS,
} from './incidentCommandRegistry.js';
import { normalizeMicSettings } from './incidentCommandSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: MIC_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: MIC_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${MIC_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexIncidentCommandAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== MIC_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseIncidentAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * Opaque signatures. Each is deterministic from facts about the CONDITION, not
 * about a person's behaviour, so the same condition can never be filed twice and
 * a changed condition is always a new signature.
 */
export const micNotificationLapsedSignature = (incidentId, notifId) => `mic1:lapsed:${incidentId}:${notifId}`;
export const micNotificationClosingSignature = (incidentId, notifId, windowEndsOn) => `mic1:closing:${incidentId}:${notifId}:${windowEndsOn}`;
export const micNoCommanderSignature = (incidentId) => `mic1:no-commander:${incidentId}`;
export const micCommandStandingSignature = (incidentId) => `mic1:command-standing:${incidentId}`;

const SIGNATURE_PATTERNS = [
  { kind: 'lapsed', re: /^mic1:lapsed:([^:]+):([^:]+)$/ },
  { kind: 'closing', re: /^mic1:closing:([^:]+):([^:]+):(\d{4}-\d{2}-\d{2})$/ },
  { kind: 'no-commander', re: /^mic1:no-commander:([^:]+)$/ },
  { kind: 'command-standing', re: /^mic1:command-standing:([^:]+)$/ },
];

export function parseIncidentAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const text = summary.trim();
  for (const { kind, re } of SIGNATURE_PATTERNS) {
    const match = re.exec(text);
    if (match) return { signature: match[0], kind, incidentId: match[1] };
  }
  return null;
}

/**
 * The conditions the current record creates. Pure over (report, matrix, today);
 * exported so the test suite can pin every branch without a store.
 */
export function incidentCommandConditions(report, { today, matrix, conventions } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.incidents) return { conditions, observations };
  const closingWindow = conventions?.[MIC_SETTING_KEYS.closingWindowMinutes] || 0;

  const apexSeats = (incident) => {
    if (!matrix) return [];
    const ids = [...new Set(incident.lines.map((line) => line.leadId).filter(Boolean))];
    if (incident.commanderId) ids.push(incident.commanderId);
    const valid = [...new Set(ids)].filter((id) => matrix.nodes.has(id));
    if (!valid.length || valid.length < ids.length) return [];
    const apex = matrixJointApex(matrix, valid);
    if (apex.unique && apex.apexId) return [apex.apexId];
    if (apex.ambiguous && !apex.disconnected && Array.isArray(apex.apexIds)) return apex.apexIds;
    return [];
  };

  for (const incident of report.incidents) {
    if (incident.state === 'stood-down') continue;

    /* 1 + 2. Notification obligations that are unmet. */
    for (const row of incident.notifications) {
      if (row.recordedAt) continue;
      if (row.state === 'lapsed') {
        const seats = apexSeats(incident);
        if (seats.length) {
          conditions.push({
            kind: 'notification-lapsed',
            signature: micNotificationLapsedSignature(incident.id, row.notifId),
            seatIds: seats,
            dueOn: addDays(today, 1),
            incidentId: incident.id,
            detail: 'A declared notification deadline has passed with nothing recorded against it.',
          });
        } else {
          observations.push({
            key: `mic1|no-apex|lapsed|${incident.id}|${row.notifId}`,
            detail: 'A declared notification deadline has passed, and the response lines holding it have no joint seat above them on the reporting graph. Nobody was asked, because there is no single accountability to ask; the lapse is printed on the register.',
          });
        }
        continue;
      }
      if (row.closing && closingWindow > 0) {
        // One ask per closing window, not one per day inside it.
        const windowEndsOn = today;
        const seats = apexSeats(incident);
        if (seats.length) {
          conditions.push({
            kind: 'notification-closing',
            signature: micNotificationClosingSignature(incident.id, row.notifId, windowEndsOn),
            seatIds: seats,
            dueOn: addDays(today, 1),
            incidentId: incident.id,
            detail: 'A declared notification deadline is inside its closing window and nothing is recorded against it.',
          });
        } else {
          observations.push({
            key: `mic1|no-apex|closing|${incident.id}|${row.notifId}|${windowEndsOn}`,
            detail: 'A declared notification deadline is inside its closing window, and the response lines holding it have no joint seat above them on the reporting graph. Nobody was asked; the row is printed on the register.',
          });
        }
      }
    }

    /* 3. A live major incident with nobody in command. */
    if (incident.state === 'no-commander' && incident.major) {
      const seats = apexSeats(incident);
      if (seats.length) {
        conditions.push({
          kind: 'no-commander',
          signature: micNoCommanderSignature(incident.id),
          seatIds: seats,
          dueOn: addDays(today, 0),
          incidentId: incident.id,
          detail: 'A live major incident has nobody in command.',
        });
      } else {
        observations.push({
          key: `mic1|no-apex|no-commander|${incident.id}`,
          detail: 'A live major incident has nobody in command, and its response lines have no joint seat above them on the reporting graph. Nobody was asked; the finding is printed on the register.',
        });
      }
    }

    /* 4. Closed, and command never released. */
    if (incident.state === 'command-standing') {
      // The ask goes to the CURRENT COMMANDER by name — the only hand the
      // stand-down action will accept. Where that hand cannot be reached on the
      // graph, the joint apex above the lines is asked instead, and the
      // substitution is printed in the observation rather than hidden.
      const commanderOnGraph = incident.commanderId && matrix?.nodes?.has(incident.commanderId);
      if (commanderOnGraph) {
        conditions.push({
          kind: 'command-standing',
          signature: micCommandStandingSignature(incident.id),
          seatIds: [incident.commanderId],
          dueOn: addDays(today, 1),
          incidentId: incident.id,
          detail: 'The incident is closed and command was never released.',
        });
      } else {
        const seats = apexSeats(incident);
        if (seats.length) {
          conditions.push({
            kind: 'command-standing',
            signature: micCommandStandingSignature(incident.id),
            seatIds: seats,
            dueOn: addDays(today, 1),
            incidentId: incident.id,
            detail: 'The incident is closed and command was never released; the commander cannot be named on the reporting graph, so the joint apex above the lines is asked.',
          });
        } else {
          observations.push({
            key: `mic1|no-apex|command-standing|${incident.id}`,
            detail: 'An incident is closed and command was never released, and neither the commander nor the joint apex above the lines can be named on the reporting graph. Nobody was asked; the finding is printed on the register.',
          });
        }
      }
    }
  }

  return { conditions, observations };
}

const TASK_TEXT = Object.freeze({
  'notification-lapsed': 'A notification the entity owed has passed its declared deadline with nothing on the record. Open the incident command register (#/incidents) and record what actually happened — the notification and its reference if it went out, or the fact that it did not and why. The register prints the overrun to the minute and never converts a passed deadline into a met one.',
  'notification-closing': 'A notification the entity owes is inside its closing window and nothing is recorded against it. Open the incident command register (#/incidents), record the notification and its reference if it has gone out, or record in writing why it will not.',
  'no-commander': 'A live major incident has nobody in command. Open the incident command register (#/incidents) and take command, or name the hand that will. Command is taken by an explicit act; the register will not infer one from who is talking.',
  'command-standing': 'An incident is closed and the command structure was never released. Open the incident command register (#/incidents) and stand command down with the instant and the reason, so the bridge is not left open on the record.',
});

const TASK_WHY = Object.freeze({
  'notification-lapsed': 'A declared notification deadline has passed with nothing recorded against it.',
  'notification-closing': 'A declared notification deadline is inside its closing window with nothing recorded against it.',
  'no-commander': 'A live major incident has nobody in command.',
  'command-standing': 'The incident is closed and command was never released.',
});

export function incidentCommandRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(MIC_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit census
  // greps the source that reads it.
  const conv = normalizeMicSettings(draft.settings || {});
  if (conv.micAutoPropagate === false) return [];
  if (!list(draft.micIncidents).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = incidentReport(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null }, seat: null });
    matrix = incidentMatrix(draft, now, { ...(draft.settings || {}), activeSeatId: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = incidentCommandConditions(report, { today, matrix, conventions: conv });
  const existing = indexIncidentCommandAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  if (!conditions.length && !openAsks.length && !observations.length) return [];

  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Release or retire asks.
   *
   * A condition has ONE signature. When the hand it belongs to changes — the
   * commander transfers, the apex moves — the ask is MOVED, not closed and
   * refiled: closing and refiling the same condition in one pass produces a
   * phantom "done" plus a duplicate "active" for a condition that never
   * cleared, which is churn dressed as accountability.
   *
   * An ask is closed only when the condition has genuinely gone.
   */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const conditionSeats = new Map();
  for (const row of conditions) {
    if (!conditionSeats.has(row.signature)) conditionSeats.set(row.signature, new Set());
    for (const seatId of row.seatIds) conditionSeats.get(row.signature).add(seatId);
  }
  const covered = new Set();
  const moved = new Set();
  for (const ask of openAsks) {
    const seats = conditionSeats.get(ask.signature);
    if (seats && seats.has(ask.seatId) && ask.task.personId === ask.seatId) {
      covered.add(openKey(ask.signature, ask.seatId));
      continue;
    }
    if (seats && seats.size) {
      // The condition still stands; only the hand changed. Hand it over.
      const nextSeat = [...seats][0];
      if (!moved.has(ask.signature) && ask.task.personId !== nextSeat) {
        const previous = ask.task.personId;
        ask.task.personId = nextSeat;
        ask.task.updatedAt = nowIso;
        moved.add(ask.signature);
        covered.add(openKey(ask.signature, nextSeat));
        const link = list(draft.links).find((row) => row && row.ruleId === MIC_RULE_ID
          && row.targetType === 'delegation' && String(row.targetId) === String(ask.task.id));
        if (link) link.sourceId = nextSeat;
        noteEffect(ctx, out, 'reassigned', 'delegation', ask.task.id,
          `Handed an incident command ask to the seat that now answers for it; the condition itself never cleared, so the ask was moved rather than closed and refiled.`);
        void previous;
        continue;
      }
      covered.add(openKey(ask.signature, nextSeat));
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = `${MIC_RULE_ID}: the incident command register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, 'Closed an incident command ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    if (!Array.isArray(draft.micMarkers)) draft.micMarkers = [];
    if (draft.micMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.micMarkers.push({ key: observation.key, at: nowIso, ruleId: MIC_RULE_ID, kind: MIC_MARKER_KIND, detail: clip(observation.detail, 400) });
    if (draft.micMarkers.length > L.markers) {
      draft.micMarkers.splice(0, draft.micMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', MIC_ROUTE, observation.detail);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(MIC_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(`A dated act is owed on the incident command register — ${condition.kind.replace(/-/g, ' ')}`, 200),
        expectedOutcome: clip(`${TASK_TEXT[condition.kind]} The register tells you which incident and which obligation is yours; this task deliberately carries no incident title, no party and no minute count, because a delegation is readable above your seat.`, 2000),
        authority: 'act-inform',
        support: `Issued by ${MIC_RULE_ID} from the incident command register (#/incidents). It reads declared incidents, clocks and dated acts only; it is not a finding about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: MIC_RULE_ID, summary: condition.signature,
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId,
        `Asked the seat answerable for a response line for the act it is owed: ${TASK_WHY[condition.kind] || condition.detail} Due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', MIC_ROUTE,
      `${deferred} incident command ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

incidentCommandRule.id = 'incidentCommandRule';

export default incidentCommandRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const MIC_PAUSE_SWITCH = MIC_SETTING_KEYS.autoPropagate;
