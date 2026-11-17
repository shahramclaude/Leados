/**
 * app/core/domain/insRules.js — `RULE-INS-01` on the shared post-commit spine
 * (ADR-0249, Schema v203).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`buildInsurance`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `notification-late` — a coverage whose derived deadline passed with no
 *      timely notification on the record, or whose notification was recorded
 *      after the deadline. This is the condition the register exists for. The ask
 *      goes to the JOINT APEX above every line holding ANY responsible hand,
 *      because one policy is usually carried across lines — a risk manager, a
 *      finance lead, a group counsel — and the duty belongs above all of them,
 *      never to one line on another's behalf.
 *
 *   2. `notification-urgent` — inside the narrowest warning bands, unnotified.
 *      The next responsible action is already late, and the ask says so without
 *      naming the insurer.
 *
 *   3. `notification-unprovable` — no trigger day or no declared window, so NO
 *      deadline is derivable. The register refuses to guess; the ask is for the
 *      fact.
 *
 *   4. `no-cover` — the trigger day falls outside the policy period, so the
 *      linked policy does not respond. The ask is for the coverage opinion, not
 *      for a notification.
 *
 *   5. `recovery-denied` — the insurer refused the recovery. The money did not
 *      move; the net cost moved back to gross. This ask is filed ONCE per
 *      coverage and never re-opens the denial.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * coverage), so clearing one coverage cannot clear another. What the rule never
 * does is re-file the same obligation: a seat receives each ask once, and at most
 * four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names an insurer, a policy reference, a matter reference,
 * an amount or a person. An insurance register is commercially sensitive; a
 * delegation naming the insurer and the sum recovered is a disclosure with a
 * deadline attached. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares a policy, links a coverage, records a
 * notification or a recovery, sets a deadline, marks a notification in time,
 * extends a window, re-opens a denial or converts a passed deadline into an
 * allegation that cover was lost; it gives no coverage advice; and it never
 * rates, ranks or names a person, line, broker or claims handler as a cause.
 * Where nobody can be asked — a disconnected graph, a policy whose hands are all
 * off the graph, an unresolvable or ambiguous apex — it writes ONE identity-free
 * observation per condition and asks nobody. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at four per commit with the remainder counted, and pause-governed on
 * every path including the explicit scan — because a notification window runs
 * out on the calendar with nobody having written anything.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildInsurance } from './insCoverage.js';
import {
  INS_EVENT_PREFIX,
  INS_MARKER_KIND,
  INS_ROUTE,
  INS_RULE_ID,
  INS_SETTING_KEYS,
} from './insRegistry.js';
import { normalizeInsSettings } from './insSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const INS_PAUSE_SWITCH = 'insAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a coverage id
 * appears in this rule's output, and it travels inside the typed link rather than
 * the delegation. Two operators running the same pass derive the same
 * signatures, so neither duplicates the other's asks.
 */
export function insAskSignature(kind, coverageId) {
  return `ins1:${kind}:${coverageId}`;
}

const SIGNATURE_RE = /^ins1:(notification-late|notification-urgent|notification-unprovable|no-cover|recovery-denied):([^:]+)$/;

export function parseInsAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], coverageId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexInsuranceAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== INS_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseInsAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'notification-late': 'A coverage has passed its notification deadline with no timely notice on the record',
  'notification-urgent': 'A coverage’s notification deadline is inside the urgent warning band',
  'notification-unprovable': 'A coverage has no provable notification deadline — the trigger day or the declared window is missing',
  'no-cover': 'A linked policy does not respond to this matter — the trigger day falls outside its period',
  'recovery-denied': 'A recovery was denied by the insurer',
});

const OUTCOMES = Object.freeze({
  'notification-late': `Open the insurance register (#/insurance) and record what the coverage actually is now: the notification if there is one, the insurer's answer if any was given, or the fact that the deadline passed with nothing done. The register derives the deadline from the trigger day and the window the policy itself declares. It holds no insurer feed, so it cannot say whether the insurer accepted the late notice — do not read this ask as a finding that cover was lost.`,
  'notification-urgent': 'Open the notification clocks (#/insurance?view=notifications) and notify the insurer before the deadline: instruct the broker or write to the insurer directly. The warning band is a workspace convention; the deadline itself is derived from the trigger day and the window this policy declared.',
  'notification-unprovable': 'Open the insurance register (#/insurance) and declare what is missing: the trigger day the record carries, or the notification window the policy itself declares. The register will not guess a deadline, and no day count is printed until the basis is on the record.',
  'no-cover': 'Open the coverages (#/insurance?view=coverages) and record the coverage opinion: which policy, if any, responds to this matter. The register tests the trigger day against the period and prints the reason; it does not pretend a linked policy covers a claim it does not.',
  'recovery-denied': 'Open the recoveries (#/insurance?view=recoveries) and record the insurer’s reason and the decision that follows it. The denial itself is real and is kept; this ask is about the net cost moving back to the gross exposure.',
});

const URGENCY = Object.freeze({ 'notification-late': 0, 'notification-urgent': 0, 'notification-unprovable': 1, 'no-cover': 1, 'recovery-denied': 1 });
const DUE_DAYS = Object.freeze({ 'notification-late': 0, 'notification-urgent': 0, 'notification-unprovable': 1, 'no-cover': 2, 'recovery-denied': 2 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: INS_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: INS_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${INS_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function insuranceConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  for (const row of report.rows || []) {
    const state = row?.state?.key;
    const coverageId = row?.coverage?.id;
    if (!coverageId) continue;

    const kinds = [];
    if (state === 'notification-late') kinds.push('notification-late');
    if (state === 'notification-urgent') kinds.push('notification-urgent');
    if (state === 'notification-unprovable') kinds.push('notification-unprovable');
    if (state === 'no-cover') kinds.push('no-cover');
    if (state === 'recovery-denied') kinds.push('recovery-denied');
    if (!kinds.length) continue;

    const managerIds = list(row.managerIds).filter(Boolean);
    if (!managerIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: insAskSignature(kind, coverageId),
          detail: `A coverage is in the ${kind} condition, but none of its responsible hands has an active reporting line, so no seat can be asked to answer for it.`,
        });
      }
      continue;
    }

    const apex = matrixJointApex(report.matrix, managerIds);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: insAskSignature(kind, coverageId),
          detail: `A coverage is in the ${kind} condition, but the reporting graph yields no joint seat above the lines that hold its responsible hands.`,
        });
      }
      continue;
    }

    for (const kind of kinds) {
      // THE AMBIGUOUS APEX. Where the engine reports several apex ids the record
      // is genuinely ambiguous: the duty is real but the seat is not unique. The
      // rule asks every apex rather than silently choosing one line to carry
      // another's policy.
      for (const seatId of apexIds) {
        if (!seatId) continue;
        conditions.push({
          kind,
          signature: insAskSignature(kind, coverageId),
          seatIds: [seatId],
          dueInDays: DUE_DAYS[kind] ?? 1,
          ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
          urgency: URGENCY[kind] ?? 9,
        });
      }
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-INS-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function insuranceRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(INS_EVENT_PREFIX)) return [];

  const conv = normalizeInsSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[INS_SETTING_KEYS.autoPropagate] === false || conv.insAutoPropagate === false) return [];

  // An emptied register still runs, because the asks this rule filed have to be
  // closed when the last coverage goes. Only a workspace with no coverages AND no
  // live ask of this rule's is nothing to do.
  const existing = indexInsuranceAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.insCoverages).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildInsurance(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = insuranceConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();
  const dueOn = (days) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);

  const covered = new Set(existing.filter((ask) => ask.task && ask.task.status === 'active').map((ask) => `${ask.signature}::${ask.seatId}`));
  const linkCtx = { idFactory, todayStr: today, nowIso };

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = `${condition.signature}::${seatId}`;
      if (covered.has(key)) continue;
      // A human who closed or returned the ask while the condition stands has
      // ANSWERED it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(INS_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the insurance register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the insurance register (#/insurance).', 2000),
        authority: 'act-inform',
        support: `Issued by ${INS_RULE_ID} from the insurance notification and recovery register (#/insurance). It reads declared policies, coverages, notifications and recoveries only; it gives no coverage advice, is not a finding about any person or line, and is not a rating of any of them.`,
        delegatedOn: today,
        dueOn: dueOn(condition.dueInDays),
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
        ruleId: INS_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed an insurance-register ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.insMarkers = Array.isArray(draft.insMarkers) ? draft.insMarkers : [];
    const have = new Set(draft.insMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.insMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: INS_RULE_ID,
        kind: INS_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', INS_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', INS_ROUTE, `${deferred} insurance-register ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${INS_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The insurance-register condition cleared; the register closed its own ask.');
  }

  return out;
}

insuranceRule.id = 'insuranceRule';

export default insuranceRule;
