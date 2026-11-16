/**
 * app/core/domain/rqRules.js — `RULE-RQR-01` on the shared post-commit spine
 * (ADR-0235/0236, Schema v191).
 *
 * FOUR CONDITIONS, all read from the ONE kernel (`buildInformationRequests`) and
 * the live reporting graph, never re-derived here:
 *
 *   1. `production-unreviewed` — a line's producer has CERTIFIED a production and
 *      nobody outside the parties has reviewed it, past the declared chase. The
 *      ask goes to the joint apex above the producers, when that seat is not
 *      itself a party; where every capable seat is a party the rule asks NOBODY
 *      and writes an observation. This is the register's central control: an
 *      unreviewed production — and above all an unreviewed PRIVILEGE claim — is
 *      the thing a bare privilege log hides, and a reminder that routes the ask
 *      back to the producer would be worthless.
 *   2. `release-owed` — every line is independently reviewed and nothing has gone
 *      to the requester. The ask goes to the seat that recorded the demand:
 *      assembling the answer is not sending it.
 *   3. `reply-lapsed` — the requester's own day passed with no release on the
 *      record. The ask goes to the receiving seat, ONCE per request: the register
 *      never converts a passed day into an answered request, and the only thing
 *      that can still happen is a human recording what is true.
 *   4. `answer-owed` — a release sits on the record with no requester verdict
 *      past the chase, or the requester has said the production did not cover
 *      everything asked. Both asks go to the receiving seat: a production sent and
 *      never accepted is not a closed request.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, and this register's subject is an authority with compulsion powers.
 * So the title names no requester, no instrument, no scope, no line and no date:
 * a dated act is owed on the information-request register, and the addressee opens
 * it. The opaque signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never assigns, produces, reviews, releases, responds,
 * restates a clock or extends; never edits a request or an act; never reviews a
 * production itself; never converts a passed day into an answered request; never
 * infers a producer, a privilege basis or a statutory deadline; and never rates a
 * person or a function from backlog or age. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at 4 per commit with the remainder counted, and pause-governed on every
 * path including an explicit scan (`informationRequestAutoPropagate`).
 */

import { addDays, dayKey, daysBetween } from '../time.js';
import { LEADER_ID } from './chain.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildInformationRequests } from './rqProduction.js';
import { rqPartiesOf } from './rqReport.js';
import {
  rqrAskSummary,
  rqrLapseSignature,
  rqrLineSignature,
  rqrReleaseSignature,
  rqrResponseSignature,
  parseRqrAskSummary,
} from './rqMath.js';
import {
  RQR_EVENT_PREFIX,
  RQR_FLAGS,
  RQR_LIMITS as L,
  RQR_RULE_ID,
  RQR_ROUTE,
  normalizeInformationRequestSettings,
} from './rqRegistry.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: RQR_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: RQR_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${RQR_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexInformationRequestAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== RQR_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseRqrAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * The manager ids holding a person on the read day — the home line plus every
 * active declared line, deduplicated, never invented. Used to compute the joint
 * apex above the producers of a line.
 */
function producerManagerIds(state, producerId, day) {
  const person = list(state?.people).find((row) => row && row.id === producerId) || null;
  const ids = new Set();
  if (person?.managerId && person.managerId !== LEADER_ID) ids.add(person.managerId);
  for (const raw of list(state?.reportingLines)) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    if (raw.personId !== producerId) continue;
    if (raw.status && raw.status !== 'active') continue;
    if (raw.fromISO && String(raw.fromISO).slice(0, 10) > day) continue;
    if (raw.toISO && String(raw.toISO).slice(0, 10) < day) continue;
    if (raw.managerId && raw.managerId !== LEADER_ID) ids.add(raw.managerId);
  }
  return [...ids];
}

/**
 * WHO CAN BE ASKED TO REVIEW? The joint apex above every producer's own lines is
 * the natural candidate, and it is asked ONLY if the graph shows it is not a party
 * to the request. Where the apex produced something — which is the ordinary shape
 * of a small matrix, where the same director both produces and would review — the
 * rule asks nobody and writes an observation. An ask routed to a party would ask
 * for the very self-certification this register exists to refuse, so it is
 * withheld rather than weakened.
 */
export function rqReviewTarget(state, row, { today, matrix }) {
  const parties = new Set(rqPartiesOf(row));
  const producers = (row.lines || []).map((line) => line.producerId).filter(Boolean);
  const managerIds = [...new Set(producers.flatMap((id) => producerManagerIds(state, id, today)))]
    .filter((id) => id && matrix?.nodes?.has(id));
  if (!managerIds.length) return { targetId: null, reason: 'no-managers' };
  const apex = matrixJointApex(matrix, managerIds);
  if (!apex.unique || !apex.apexId) return { targetId: null, reason: apex.ambiguous ? 'ambiguous' : 'disconnected' };
  if (parties.has(apex.apexId)) return { targetId: null, reason: 'apex-is-a-party' };
  return { targetId: apex.apexId, reason: null };
}

/**
 * The conditions the current record creates. Pure over (state, report, today);
 * exported so the test suite can pin every branch without a store.
 */
export function informationRequestConditions(state, report, { today, matrix } = {}) {
  const out = [];
  const observations = [];
  const rows = list(report?.rows);
  if (!rows.length) return { conditions: out, observations };

  const askable = (id) => typeof id === 'string' && id && id !== LEADER_ID && Boolean(matrix?.nodes?.has(id));

  for (const row of rows) {
    // 1. A production certified and unreviewed: the review is owed OUTSIDE the
    //    parties, so the target is computed and then conflict-tested.
    const producedLines = row.lines.filter((line) => line.lineState === 'produced');
    for (const line of producedLines) {
      const age = daysBetween(line.producedOn, today);
      if (age === null || age <= L.releaseChaseDays) continue;
      const signature = rqrLineSignature(row.id, line.lineId);
      const { targetId, reason } = rqReviewTarget(state, row, { today, matrix });
      if (!targetId || !askable(targetId)) {
        observations.push({
          key: `rqr1|no-ask|${signature}`,
          detail: line.privilegeClaimed
            ? 'A production that claims privilege is unreviewed, and the reporting graph names no seat outside the parties that could review it. Nobody was asked, nothing was substituted, and the claim stands untested.'
            : `A certified production is unreviewed and the graph names no seat outside the parties that could review it (${reason}). Nobody was asked and nothing was substituted.`,
        });
        continue;
      }
      out.push({
        kind: 'production-unreviewed',
        signature,
        seatIds: [targetId],
        dueOn: addDays(today, L.askDueDays),
        requestId: row.id,
        detail: line.privilegeClaimed
          ? 'A production line certified its material AND a claim of privilege over material it withheld; neither has been reviewed by a seat outside the parties.'
          : 'A production line certified its material and no seat outside the parties has reviewed it.',
      });
    }

    // 2. Every line reviewed and nothing released: assembling is not sending.
    if (row.allReviewed && !row.released) {
      const signature = rqrReleaseSignature(row.id);
      const target = row.receivedById;
      if (!target || !askable(target)) {
        observations.push({
          key: `rqr1|no-ask|${signature}`,
          detail: 'Every production line of an information request is reviewed and nothing has been released, and the receiving seat it names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: 'release-owed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          requestId: row.id,
          detail: 'Every production line is independently reviewed and the requester has been sent nothing.',
        });
      }
    }

    // 3. The requester's day passed with no release: one ask, ever.
    if (row.lapsed) {
      const signature = rqrLapseSignature(row.id);
      const target = row.receivedById;
      if (!target || !askable(target)) {
        observations.push({
          key: `rqr1|no-ask|${signature}`,
          detail: 'An information request passed its reply day with no release on the record, and the receiving seat it names does not resolve to a seat on the reporting graph. Nobody was asked, nothing was substituted, and the register has not invented an answer.',
        });
      } else {
        out.push({
          kind: 'reply-lapsed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          requestId: row.id,
          detail: 'A request passed the reply day its requester set, with nothing released; the day has not discharged it.',
        });
      }
    }

    // 4. A release with no verdict, or a verdict that the ask was not covered.
    const chaseOverdue = Boolean(row.released && !row.respondedOn && row.releaseOverdue);
    if (chaseOverdue || row.response === 'insufficient') {
      const signature = rqrResponseSignature(row.id);
      const target = row.receivedById;
      if (!target || !askable(target)) {
        observations.push({
          key: `rqr1|no-ask|${signature}`,
          detail: 'A production was released with no requester verdict on the record, and the receiving seat the request names does not resolve to a seat on the reporting graph. Nobody was asked and nothing was substituted.',
        });
      } else {
        out.push({
          kind: row.response === 'insufficient' ? 'answer-insufficient' : 'answer-owed',
          signature,
          seatIds: [target],
          dueOn: addDays(today, L.askDueDays),
          requestId: row.id,
          detail: row.response === 'insufficient'
            ? 'The requester says the production did not cover what they asked for; the register holds the request open.'
            : 'A release is on the record with no requester verdict past the chase window.',
        });
      }
    }
  }
  return { conditions: out, observations };
}

export function informationRequestRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(RQR_EVENT_PREFIX)) return [];

  // A pause is a pause: it governs every path, including an explicit scan. The
  // switch is named by its FULL literal key here because the pause-permit
  // census greps the source that reads it.
  const conv = normalizeInformationRequestSettings(draft.settings || {});
  if (conv.informationRequestAutoPropagate === false) return [];
  if (!list(draft.informationRequests).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    report = buildInformationRequests(draft, { now });
    // The rule never asks an identity the reporting graph cannot carry a
    // delegation for; the whole-workspace graph is read here, without a seat.
    matrix = buildMatrix(draft, { now, settings: { ...(draft.settings || {}), activeSeatId: null } });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }

  const { conditions, observations } = informationRequestConditions(draft, report, { today, matrix });
  const existing = indexInformationRequestAsks(draft);
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
      ? `${RQR_RULE_ID}: the addressee this condition belongs to changed on the record; the stale ask was closed rather than left with a seat that no longer holds it.`
      : `${RQR_RULE_ID}: the information-request register no longer reports this condition.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, out, 'completed', 'delegation', ask.task.id, conditionKeys.has(key)
      ? 'Closed an information-request ask: the addressee changed.'
      : 'Closed an information-request ask: the condition cleared.');
  }

  /* 2. Record the observations nobody can be asked about. */
  for (const observation of observations) {
    draft.informationRequestMarkers = Array.isArray(draft.informationRequestMarkers) ? draft.informationRequestMarkers : [];
    if (draft.informationRequestMarkers.some((marker) => marker && marker.key === observation.key)) continue;
    draft.informationRequestMarkers.push({ key: observation.key, at: nowIso, ruleId: RQR_RULE_ID, kind: 'informationrequest', detail: clip(observation.detail, 300) });
    if (draft.informationRequestMarkers.length > L.markers) {
      draft.informationRequestMarkers.splice(0, draft.informationRequestMarkers.length - L.markers);
    }
    noteEffect(ctx, out, 'observed', 'workspace', RQR_ROUTE, observation.detail);
  }

  /* 3. File one bounded ask per (condition, addressee). */
  const TITLES = {
    'production-unreviewed': 'A certified production is awaiting an independent review',
    'release-owed': 'A reviewed production has not been released to the requester',
    'reply-lapsed': 'An information request has passed its reply day with nothing released',
    'answer-owed': 'A released production has no requester verdict on the record',
    'answer-insufficient': 'The requester says the production did not cover what was asked',
  };
  const OUTCOMES = {
    'production-unreviewed': 'Open the information-request register (#/information-requests) and record the completeness review you owe as a seat outside the parties — what you asked to see, whether the line is complete, and your ruling on any privilege claim. You are asked because you produced nothing on this request. This task deliberately carries no requester, instrument, scope, line or date, because a delegation is readable above your seat.',
    'release-owed': 'Open the information-request register (#/information-requests) and record that the production was released to the requester, naming the transmission. Reviewing the answer is not sending it. This task deliberately carries no requester, instrument, scope, line or date, because a delegation is readable above your seat.',
    'reply-lapsed': 'Open the information-request register (#/information-requests): the requester’s reply day has passed with nothing released. The register has not invented an answer; record what is actually true and what has been sent. This task deliberately carries no requester, instrument, scope, line or date, because a delegation is readable above your seat.',
    'answer-owed': 'Open the information-request register (#/information-requests) and record what the requester said about the production — received and complete, no response yet, or insufficient. A production sent and never accepted is not known to have answered anything. This task deliberately carries no requester, instrument, scope, line or date, because a delegation is readable above your seat.',
    'answer-insufficient': 'Open the information-request register (#/information-requests): the requester has said the production did not cover what they asked for. The request is open, the lines that need re-production are visible there, and only a dated human act closes it. This task deliberately carries no requester, instrument, scope, line or date, because a delegation is readable above your seat.',
  };
  const EFFECTS = {
    'production-unreviewed': 'Asked a seat outside the parties to review a certified production.',
    'release-owed': 'Asked the receiving seat to release a fully reviewed production to its requester.',
    'reply-lapsed': 'Asked the receiving seat to record what is true on a request past its reply day.',
    'answer-owed': 'Asked the receiving seat to record the requester’s verdict on a released production.',
    'answer-insufficient': 'Asked the receiving seat about a production the requester found insufficient.',
  };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has ANSWERED it.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(RQR_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the information-request register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the information-request register (#/information-requests).', 2000),
        authority: 'act-inform',
        support: `Issued by ${RQR_RULE_ID} from the information-request register (#/information-requests). It reads recorded demands and dated acts only; it is not a judgement about anyone and not a rating of anyone.`,
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
        relation: 'issues-obligation', ruleId: RQR_RULE_ID, summary: rqrAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${EFFECTS[condition.kind] || 'Filed an information-request ask.'} Due ${condition.dueOn}.`);
    }
  }
  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', RQR_ROUTE,
      `${deferred} information-request ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }
  return out;
}

informationRequestRule.id = 'informationRequestRule';

export default informationRequestRule;

/** Exported for the pause census: the switch this rule reads, by its literal key. */
export const INFORMATION_REQUEST_PAUSE_SWITCH = 'informationRequestAutoPropagate';
