/**
 * app/core/domain/mutualAidRules.js — `RULE-MAA-01` on the shared post-commit
 * spine (ADR-0244, Schema v198).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`buildMutualAid`) and the
 * live reporting graph, and never re-derived here:
 *
 *   1. `request-lapsed` — a request whose declared validity closed with no
 *      acceptance on the record. This is the condition the register exists for:
 *      a request was sent, the window ran out, and the organisation is about to
 *      treat the silence as a promise. The ask goes to the JOINT APEX above the
 *      requesting lines — never to the partner, which is not a person on this
 *      graph and cannot be asked to answer for itself, and never to one
 *      requesting line on another's behalf.
 *
 *   2. `not-arrived-overdue` — the partner accepted, named a promised arrival
 *      day, that day has passed, and no arrival is on the record. The exact
 *      days past the promise are printed on the row; the ask goes to the same
 *      joint apex.
 *
 *   3. `withdrawn-not-released` — a commitment whose help has withdrawn and
 *      whose release is past the declared grace. A commitment that dangles after
 *      the help leaves is exactly the state the register exists to notice.
 *
 *   4. `breach` — a request opened under an agreement that had expired, a
 *      release dated before the withdrawal that ends it, or a cancellation
 *      dated after the acceptance. The commands cannot create these; when one
 *      arrives in the record it must be ANSWERED, and the register keeps it
 *      until somebody does.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per
 * (condition, request or acceptance), so a workspace with four lapsed requests
 * receives four separate asks and clearing one cannot clear another. What the
 * rule never does is re-file the same obligation: a seat receives each ask once,
 * at most four new asks arrive per commit with the remainder counted, and an
 * ask a human closed or returned is treated as answered rather than re-issued.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no task title names a partner, an agreement, a subject, an
 * external hand or a resource line. The opaque signature lives only in the
 * typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never records an acceptance, an arrival, a withdrawal,
 * a release or a cancellation on anybody's behalf, never moves a validity or a
 * promised day, never reads a lapsed request as a promise, and never scores a
 * partner, an external hand or a requesting line. Where nobody can be asked —
 * no requesting line on the graph, no joint seat, or an apex that resolves to
 * nobody — it writes ONE identity-free observation per condition and asks
 * nobody. Asks are `act-inform` delegations with typed `issues-obligation`
 * provenance, idempotent per (signature, addressee), self-closing when the
 * condition clears or the addressee moves, bounded at four per commit with the
 * remainder counted, and pause-governed on every path including the explicit
 * scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildMutualAid } from './mutualAid.js';
import {
  MAA_EVENT_PREFIX,
  MAA_MARKER_KIND,
  MAA_ROUTE,
  MAA_RULE_ID,
  MAA_SETTING_KEYS,
} from './mutualAidRegistry.js';
import { normalizeMutualAidSettings } from './mutualAidSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const MAA_PAUSE_SWITCH = 'maaAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a request or
 * acceptance id appears in this rule's output, and it travels inside the typed
 * link rather than the delegation.
 */
export function mutualAidAskSignature(kind, targetId) {
  return `maa1:${kind}:${targetId}`;
}

const SIGNATURE_RE = /^maa1:(request-lapsed|not-arrived-overdue|withdrawn-not-released|breach):([^:]+)$/;

export function parseMutualAidAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], targetId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexMutualAidAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== MAA_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseMutualAidAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'request-lapsed': 'A request for mutual aid closed with no acceptance on the record — the partner has not answered',
  'not-arrived-overdue': 'Help a partner promised has not arrived past its promised day',
  'withdrawn-not-released': 'A withdrawn mutual-aid commitment has not been released past its declared grace',
  breach: 'A mutual-aid act is recorded out of order — it must be accounted for',
});

const OUTCOMES = Object.freeze({
  'request-lapsed': `Open the mutual-aid register (#/mutual-aid?panel=requests) and record what actually happened: the partner’s acceptance if it exists, or the position the organisation is left in. The register does not read a lapsed request as a promise, and this ask names no partner, no agreement and no subject, because a delegation is readable above the seat it is sent to.`,
  'not-arrived-overdue': 'Open the mutual-aid register (#/mutual-aid?panel=requests) and record the arrival of the promised help, or the position the organisation is left in. The register prints the exact days past the promised day, and it never treats a promise whose day has passed as help that is on its way.',
  'withdrawn-not-released': 'Open the mutual-aid register (#/mutual-aid?panel=requests) and record the release that ends the commitment. The help has left; a commitment that dangles after it is exactly the state this register exists to notice.',
  breach: 'Open the mutual-aid register (#/mutual-aid?panel=requests) and record what happened. The register keeps the ordering breach and prints the exact days by which the act preceded the duty; it cannot be deleted, only accounted for. If the record was imported in error, correct the source and re-import — the register will not rewrite history on request.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: MAA_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: MAA_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${MAA_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report, matrix);
 * exported so the suite can pin every branch without a store.
 */
export function mutualAidConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };
  const graphIds = report.matrix?.nodes ? new Set(report.matrix.nodes.keys()) : new Set();

  const askApex = (kind, signature, lineIds, urgency) => {
    const valid = list(lineIds).filter((lineId) => graphIds.has(lineId));
    if (!valid.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but none of the requesting lines resolves on the active graph, so no seat can be asked to answer it.` });
      return;
    }
    const apex = matrixJointApex(report.matrix, valid);
    const apexIds = list(apex?.apexIds);
    // The enterprise root sits above everything, so a multi-line request whose
    // only common ancestor is that synthetic node has NO manager who actually
    // holds both lines. Filing the ask there would issue an obligation to
    // nobody; the register records the observation instead, identity-free.
    if (apexIds.length && valid.length > 1 && apex?.isLeaderOnly) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but the requesting lines share no manager who holds both — the only common seat is the enterprise root, which holds no line here, so no joint seat can be asked.` });
      return;
    }
    if (!apexIds.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but the reporting graph yields no joint seat above the requesting lines.` });
      return;
    }
    for (const seatId of apexIds) {
      conditions.push({ kind, signature, seatIds: [seatId], dueOn: report.asOf, ambiguous: Boolean(apex?.ambiguous), urgency });
    }
  };

  for (const row of report.rows) {
    const request = row.request;
    if (row.state.key === 'request-lapsed') askApex('request-lapsed', mutualAidAskSignature('request-lapsed', request.id), request.requestingLineIds, 0);
    if (row.state.key === 'not-arrived-overdue') askApex('not-arrived-overdue', mutualAidAskSignature('not-arrived-overdue', request.id), request.requestingLineIds, 0);
    if (row.state.key.startsWith('breach')) askApex('breach', mutualAidAskSignature('breach', request.id), request.requestingLineIds, 0);
    // The release duty fires from the withdrawal and release FIELDS, not from the
    // state: a commitment whose help arrived, was withdrawn and was never
    // released prints `arrived-complete` (the arrival is the substantive fact)
    // while the release is still owed, and the rule must ask about it. The
    // signature is per acceptance because the commitment — not the request — is
    // what is dangling.
    if (row.withdrawal && !row.release) {
      askApex('withdrawn-not-released', mutualAidAskSignature('withdrawn-not-released', row.acceptance.id), request.requestingLineIds, 1);
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-MAA-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function mutualAidRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(MAA_EVENT_PREFIX)) return [];

  const conv = normalizeMutualAidSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv.maaAutoPropagate === false) return [];

  if (!list(draft.mutualAidRequests).length && !list(draft.mutualAidAcceptances).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildMutualAid(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = mutualAidConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexMutualAidAsks(draft);
  const covered = new Set(existing.filter((ask) => ask.task && ask.task.status === 'active').map((ask) => `${ask.signature}::${ask.seatId}`));

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = `${condition.signature}::${seatId}`;
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has
      // ANSWERED it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(MAA_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the mutual-aid register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the mutual-aid register (#/mutual-aid).', 2000),
        authority: 'act-inform',
        support: `Issued by ${MAA_RULE_ID} from the mutual-aid register (#/mutual-aid). It reads declared agreements, requests, acceptances, arrivals, withdrawals and releases only; it is not a finding about anyone and is not a rating of anyone.`,
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
        sourceType: 'person',
        sourceId: seatId,
        targetType: 'delegation',
        targetId: taskId,
        relation: 'issues-obligation',
        ruleId: MAA_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a mutual-aid ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.mutualAidMarkers = Array.isArray(draft.mutualAidMarkers) ? draft.mutualAidMarkers : [];
    const have = new Set(draft.mutualAidMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.mutualAidMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: MAA_RULE_ID,
        kind: MAA_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', MAA_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', MAA_ROUTE, `${deferred} mutual-aid ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
  }

  // Close this rule's own asks whose condition has cleared.
  const live = new Set();
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) live.add(`${condition.signature}::${seatId}`);
  }
  for (const ask of existing) {
    if (!ask.task || ask.task.status !== 'active') continue;
    if (live.has(`${ask.signature}::${ask.seatId}`)) continue;
    const task = list(draft.delegations).find((row) => row && row.id === ask.task.id);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = clip(`${MAA_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The mutual-aid condition cleared; the register closed its own ask.');
  }

  return out;
}

mutualAidRule.id = 'mutualAidRule';

export default mutualAidRule;
