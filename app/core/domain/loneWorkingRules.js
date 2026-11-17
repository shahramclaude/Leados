/**
 * app/core/domain/loneWorkingRules.js — `RULE-LWK-01` on the shared post-commit
 * spine (ADR-0242, Schema v196).
 *
 * THREE CONDITIONS, each read from the ONE reader (`buildLoneWorking`) and the
 * live reporting graph, and never re-derived here:
 *
 *   1. `welfare-unconfirmed` — an OPEN deployment whose declared interval and
 *      grace have passed with no contact and no escalation on the record. This is
 *      the condition the register exists for. The ask goes to the JOINT APEX above
 *      every line holding the person, because the line that sent them out is often
 *      not the line that owns the site, and the seat answerable for both is the
 *      seat above both. It NEVER goes to the deployed person: they are the one the
 *      register protects, and asking somebody to chase their own welfare check is
 *      the exact failure this rule forbids.
 *
 *   2. `concern-unanswered` — a person made contact and raised a concern, and no
 *      escalation has been recorded since. Contact is not an answer, and the clock
 *      resetting is not the concern closing. Same joint apex.
 *
 *   3. `overran` — an open deployment past the end it was declared to, with no
 *      close-out. Time cannot end a deployment a human did not end, so somebody
 *      owes the act of ending it. Same joint apex.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * deployment), so a supervisor holding four people alone receives four separate
 * asks and clearing one cannot clear another. What the rule never does is re-file
 * the same obligation: a manager receives each ask once, and at most four new asks
 * arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no task title names a person, a site, a task or a minute count.
 * The opaque signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares, contacts, escalates or closes a
 * deployment; never records welfare as confirmed on anybody's behalf; never moves
 * a deadline; never asserts that a person is missing; never converts silence into
 * safety; and never rates, ranks or names a person as a cause. Where nobody can be
 * asked — a disconnected graph, a person with no active line, an apex that
 * resolves to the deployed person — it writes ONE identity-free observation per
 * condition and asks nobody. Asks are `act-inform` delegations with typed
 * `issues-obligation` provenance, idempotent per (signature, addressee),
 * self-closing when the condition clears or the addressee moves, bounded at four
 * per commit with the remainder counted, and pause-governed on every path
 * including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildLoneWorking } from './loneWorking.js';
import {
  LWK_EVENT_PREFIX,
  LWK_MARKER_KIND,
  LWK_ROUTE,
  LWK_RULE_ID,
  LWK_SETTING_KEYS,
} from './loneWorkingRegistry.js';
import { normalizeLwkSettings } from './loneWorkingSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const LWK_PAUSE_SWITCH = 'lwkAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a deployment id
 * appears in this rule's output, and it travels inside the typed link rather than
 * the delegation. Two operators running the same pass derive the same signatures,
 * so neither duplicates the other's asks.
 */
export function lwkAskSignature(kind, deploymentId) {
  return `lwk1:${kind}:${deploymentId}`;
}

const SIGNATURE_RE = /^lwk1:(welfare-unconfirmed|concern-unanswered|overran):([^:]+)$/;

export function parseLwkAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], deploymentId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexLoneWorkingAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== LWK_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseLwkAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'welfare-unconfirmed': 'A lone deployment’s welfare check is overdue with no contact — a response is owed',
  'concern-unanswered': 'A concern was raised at a lone-working check-in and nobody has answered it',
  overran: 'A lone deployment is past its declared end — the close-out act is owed',
});

const OUTCOMES = Object.freeze({
  'welfare-unconfirmed': `Open the lone-working register (#/lone-working) and record what you actually did: a contact, an escalation with its basis and outcome, or the close-out. The register does not know where anybody is and does not claim to. This ask names nobody, because a delegation is readable above the seat it is sent to.`,
  'concern-unanswered': 'Open the lone-working register (#/lone-working?view=now) and record the response to the concern that was raised at the last contact. A radio check that ended in “I am not right” is not answered by the check itself.',
  overran: 'Open the lone-working register (#/lone-working?view=lines) and either record the close-out with what actually happened, or record the contact and re-declare the span. Time cannot end a deployment a human did not end.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: LWK_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: LWK_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${LWK_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report, matrix, today);
 * exported so the suite can pin every branch without a store.
 */
export function loneWorkingConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const KIND_URGENCY = { 'welfare-unconfirmed': 0, 'concern-unanswered': 0, overran: 1 };

  for (const row of report.openRows || []) {
    const kind = row?.state?.key;
    if (!row?.deployment?.id || !(kind in KIND_URGENCY)) continue;

    const personId = row.deployment.personId;
    const lines = list(row.lines).map((line) => line.managerId).filter(Boolean);

    if (!lines.length) {
      observations.push({
        signature: lwkAskSignature(kind, row.deployment.id),
        detail: `An open lone deployment is in the ${kind} state, but the person holds no active reporting line, so no seat can be asked to respond.`,
      });
      continue;
    }

    const apex = matrixJointApex(report.matrix, lines);
    const apexIds = list(apex?.apexIds);
    if (!apexIds.length) {
      observations.push({
        signature: lwkAskSignature(kind, row.deployment.id),
        detail: `An open lone deployment is in the ${kind} state, but the reporting graph yields no joint seat above the lines holding the person.`,
      });
      continue;
    }

    for (const seatId of apexIds) {
      if (seatId === personId) {
        // The only seat above the person is the person. Asking somebody to chase
        // their own welfare check is the failure this rule exists to forbid.
        observations.push({
          signature: lwkAskSignature(kind, row.deployment.id),
          detail: `An open lone deployment is in the ${kind} state and the only seat above it is the deployed person themselves. The register observes this and asks nobody rather than ask them.`,
        });
        continue;
      }
      conditions.push({
        kind,
        signature: lwkAskSignature(kind, row.deployment.id),
        seatIds: [seatId],
        dueOn: report.asOf,
        ambiguous: Boolean(apex?.ambiguous),
        urgency: KIND_URGENCY[kind],
      });
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-LWK-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function loneWorkingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(LWK_EVENT_PREFIX)) return [];

  const conv = normalizeLwkSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv.lwkAutoPropagate === false) return [];

  if (!list(draft.lwkDeployments).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildLoneWorking(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = loneWorkingConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexLoneWorkingAsks(draft);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(LWK_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the lone-working register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the lone-working register (#/lone-working).', 2000),
        authority: 'act-inform',
        support: `Issued by ${LWK_RULE_ID} from the lone-working register (#/lone-working). It reads declared deployments, recorded contacts and recorded escalations only; it tracks no location, is not a finding about anyone and is not a rating of anyone.`,
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
        ruleId: LWK_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a lone-working ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.lwkMarkers = Array.isArray(draft.lwkMarkers) ? draft.lwkMarkers : [];
    const have = new Set(draft.lwkMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.lwkMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: LWK_RULE_ID,
        kind: LWK_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', LWK_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', LWK_ROUTE, `${deferred} lone-working ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${LWK_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The lone-working condition cleared; the register closed its own ask.');
  }

  return out;
}

loneWorkingRule.id = 'loneWorkingRule';

export default loneWorkingRule;
