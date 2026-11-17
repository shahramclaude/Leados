/**
 * app/core/domain/lfgRules.js — `RULE-LFG-01` on the shared post-commit spine
 * (ADR-0248, Schema v202).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildClaims`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `time-barred` — a matter whose PROVED deadline has passed with no resolution
 *      on the record. This is the condition the register exists for. The ask goes to
 *      the JOINT APEX above every line holding ANY responsible hand, because one
 *      claim is usually carried across lines — a business owner, a functional lead, a
 *      group counsel — and the duty belongs above all of them, never to one line on
 *      another's behalf.
 *
 *   2. `urgent` — inside the narrowest warning bands. The next responsible action is
 *      already late, and the ask says so without naming the party.
 *
 *   3. `clock-unprovable` — no accrual day or no written accrual rule, so NO deadline
 *      is derivable. The register refuses to guess; the ask is for the fact.
 *
 *   4. `settled-beyond-authority` — a matter resolved for more than the reporting
 *      graph computes as authorised above its responsible lines. The money moved; the
 *      governance gap is the duty. This ask is filed ONCE per matter and never
 *      re-opens the settlement.
 *
 *   5. `stay-alleged` — a recorded suspension that is not proved. It moves no
 *      deadline, and the ask names the evidence its own kind requires.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * matter), so clearing one matter cannot clear another. What the rule never does is
 * re-file the same obligation: a seat receives each ask once, and at most four new
 * asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a party, a claim type, a forum, a matter reference, an
 * amount or a person. A claim register is privileged material; a delegation naming the
 * party suing us and the sum at stake is a disclosure with a deadline attached. The
 * opaque signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never opens a matter, declares an accrual, records a stay, a
 * resolution or a concession, declares an authority, sets a deadline, marks a stay
 * proved, extends a limitation period, re-opens a settlement or converts a passed
 * deadline into an allegation that proceedings were not issued; it gives no legal
 * advice; and it never rates, ranks or names a person, line or fee earner as a cause.
 * Where nobody can be asked — a disconnected graph, a matter whose hands are all off
 * the graph, an unresolvable or ambiguous apex — it writes ONE identity-free
 * observation per condition and asks nobody. Asks are `act-inform` delegations with
 * typed `issues-obligation` provenance, idempotent per (signature, addressee),
 * self-closing when the condition clears or the addressee moves, bounded at four per
 * commit with the remainder counted, and pause-governed on every path including the
 * explicit scan — because a limitation period runs out on the calendar with nobody
 * having written anything.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildClaims } from './lfgClaims.js';
import {
  LFG_EVENT_PREFIX,
  LFG_MARKER_KIND,
  LFG_ROUTE,
  LFG_RULE_ID,
  LFG_SETTING_KEYS,
} from './lfgRegistry.js';
import { normalizeLfgSettings } from './lfgSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const LFG_PAUSE_SWITCH = 'lfgAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a matter id appears
 * in this rule's output, and it travels inside the typed link rather than the
 * delegation. Two operators running the same pass derive the same signatures, so
 * neither duplicates the other's asks.
 */
export function lfgAskSignature(kind, matterId) {
  return `lfg1:${kind}:${matterId}`;
}

const SIGNATURE_RE = /^lfg1:(time-barred|urgent|clock-unprovable|settled-beyond-authority|stay-alleged):([^:]+)$/;

export function parseLfgAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], matterId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexClaimAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== LFG_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseLfgAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'time-barred': 'A claim has passed its proved limitation deadline with no resolution on the record',
  urgent: 'A claim’s limitation deadline is inside the urgent warning band',
  'clock-unprovable': 'A claim has no provable limitation clock — the accrual basis is missing',
  'settled-beyond-authority': 'A claim was resolved for more than the authority computed above its responsible lines',
  'stay-alleged': 'A recorded suspension of a limitation clock is not proved',
});

const OUTCOMES = Object.freeze({
  'time-barred': `Open the claims register (#/claims) and record what the matter actually is now: the resolution if there is one, the proceedings if any were issued, or the fact that the deadline passed with nothing done. The register derives the deadline from the declared accrual, the declared period and every PROVED suspension. It holds no court feed, so it cannot say whether proceedings were issued — do not read this ask as a finding that they were not.`,
  urgent: 'Open the limitation clocks (#/claims?view=clocks) and do what the matter needs before its deadline: instruct, file, or record a resolution. The warning band is a workspace convention; the deadline itself is derived from the accrual and the period this matter declared.',
  'clock-unprovable': 'Open the claims register (#/claims) and declare the accrual — the day the clock started and the written rule that makes that day the right one — plus the limitation period this cause of action carries. The register will not guess a deadline, and no day count is printed until the basis is on the record.',
  'settled-beyond-authority': 'Open the settlement authority (#/claims?view=settlements) and record the authority that was relied on, or the decision that authorised the number paid. The settlement itself is real and is kept; this ask is about the gap between the number paid and the number the reporting graph supports.',
  'stay-alleged': 'Open the limitation clocks (#/claims?view=clocks) and record the evidence the suspension needs: both parties named as signatories to a standstill, the certificate reference and issue day for a conciliation stop, or the order reference and the day it was made. Until then the stay moves no deadline.',
});

const URGENCY = Object.freeze({ 'time-barred': 0, urgent: 0, 'clock-unprovable': 1, 'settled-beyond-authority': 1, 'stay-alleged': 3 });
const DUE_DAYS = Object.freeze({ 'time-barred': 0, urgent: 0, 'clock-unprovable': 1, 'settled-beyond-authority': 2, 'stay-alleged': 2 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: LFG_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: LFG_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${LFG_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the suite
 * can pin every branch without a store.
 */
export function claimConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  for (const row of report.rows || []) {
    const state = row?.state?.key;
    const matterId = row?.matter?.id;
    if (!matterId) continue;

    const kinds = [];
    if (state === 'time-barred') kinds.push('time-barred');
    if (state === 'urgent' || state === 'critical') kinds.push('urgent');
    if (state === 'clock-unprovable') kinds.push('clock-unprovable');
    if (state === 'settled-beyond-authority') kinds.push('settled-beyond-authority');
    if (list(row.allegedStays).length) kinds.push('stay-alleged');
    if (!kinds.length) continue;

    const managerIds = list(row.managerIds).filter(Boolean);
    if (!managerIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: lfgAskSignature(kind, matterId),
          detail: `A claim matter is in the ${kind} condition, but none of its responsible hands has an active reporting line, so no seat can be asked to answer for it.`,
        });
      }
      continue;
    }

    const apex = matrixJointApex(report.matrix, managerIds);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: lfgAskSignature(kind, matterId),
          detail: `A claim matter is in the ${kind} condition, but the reporting graph yields no joint seat above the lines that hold its responsible hands.`,
        });
      }
      continue;
    }

    for (const kind of kinds) {
      // THE AMBIGUOUS APEX. Where the engine reports several apex ids the record is
      // genuinely ambiguous: the duty is real but the seat is not unique. The rule asks
      // every apex rather than silently choosing one line to carry another's claim.
      for (const seatId of apexIds) {
        if (!seatId) continue;
        conditions.push({
          kind,
          signature: lfgAskSignature(kind, matterId),
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
 * `RULE-LFG-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function claimRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(LFG_EVENT_PREFIX)) return [];

  const conv = normalizeLfgSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because the
  // pause-permit census greps the source that reads it.
  if (conv[LFG_SETTING_KEYS.autoPropagate] === false || conv.lfgAutoPropagate === false) return [];

  // An emptied register still runs, because the asks this rule filed have to be closed
  // when the last matter goes. Only a workspace with no matters AND no live ask of this
  // rule's is nothing to do.
  const existing = indexClaimAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.lfgMatters).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildClaims(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = claimConditions(report);
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
      // A human who closed or returned the ask while the condition stands has ANSWERED
      // it; re-filing would nag somebody who has already replied.
      const answered = existing.some((ask) => ask.task && ask.signature === condition.signature && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(LFG_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the claims register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the claims register (#/claims).', 2000),
        authority: 'act-inform',
        support: `Issued by ${LFG_RULE_ID} from the claims, limitation and settlement-authority register (#/claims). It reads declared matters, accruals, stays, resolutions, concessions and authority grants only; it gives no legal advice, is not a finding about any person or line, and is not a rating of any of them.`,
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
        ruleId: LFG_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a claims-register ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.lfgMarkers = Array.isArray(draft.lfgMarkers) ? draft.lfgMarkers : [];
    const have = new Set(draft.lfgMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.lfgMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: LFG_RULE_ID,
        kind: LFG_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', LFG_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', LFG_ROUTE, `${deferred} claims-register ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${LFG_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The claims-register condition cleared; the register closed its own ask.');
  }

  return out;
}

claimRule.id = 'claimRule';

export default claimRule;
