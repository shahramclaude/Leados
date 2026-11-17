/**
 * app/core/domain/authorisationRules.js — `RULE-LTO-01` on the shared post-commit
 * spine (ADR-0247, Schema v201).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildAuthorisations`) and the
 * live reporting graph, and never re-derived here:
 *
 *   1. `lapsed` — an authority past its effective expiry with no suspension or
 *      revocation recorded. This is the condition the register exists for. The ask
 *      goes to the JOINT APEX above every line holding ANY accountable hand,
 *      because one consent is usually held across lines and the duty belongs above
 *      all of them, never to one line on another's behalf.
 *
 *   2. `expiring` — in force and inside the renewal lead time its own declaration
 *      set, with no renewal submitted. The responsible start date has arrived.
 *
 *   3. `conditions` — one or more declared conditions are unevidenced or past their
 *      own re-evidence window. A live licence is not evidence that its conditions
 *      are met.
 *
 *   4. `prohibition` — a prohibition notice stands against the activity. The
 *      licence may still be in force; the ACTIVITY is stopped, which is a different
 *      fact and its own duty.
 *
 *   5. `improvement-overdue` — an improvement notice past the compliance day its
 *      own instrument set.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * authority), so clearing one authority cannot clear another. What the rule never
 * does is re-file the same obligation: a seat receives each ask once, and at most
 * four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a site, an activity, an issuing body, an instrument,
 * a notice or a person. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares an authority or a condition; never records
 * evidence, a regulator action, a close or a renewal decision; never extends an
 * expiry; never marks a condition met; never lifts a notice or a revocation; never
 * converts a lapse into an allegation that the site kept operating; and never
 * rates, ranks or names a person, site or line as a cause. Where nobody can be
 * asked — a disconnected graph, an authority whose holders are all off the graph,
 * an unresolvable apex — it writes ONE identity-free observation per condition and
 * asks nobody. Asks are `act-inform` delegations with typed `issues-obligation`
 * provenance, idempotent per (signature, addressee), self-closing when the
 * condition clears or the addressee moves, bounded at four per commit with the
 * remainder counted, and pause-governed on every path including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildAuthorisations } from './authorisation.js';
import {
  LTO_EVENT_PREFIX,
  LTO_MARKER_KIND,
  LTO_ROUTE,
  LTO_RULE_ID,
  LTO_SETTING_KEYS,
} from './authorisationRegistry.js';
import { normalizeLtoSettings } from './authorisationSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const LTO_PAUSE_SWITCH = 'ltoAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place an authority id
 * appears in this rule's output, and it travels inside the typed link rather than
 * the delegation. Two operators running the same pass derive the same signatures,
 * so neither duplicates the other's asks.
 */
export function ltoAskSignature(kind, authorisationId) {
  return `lto1:${kind}:${authorisationId}`;
}

const SIGNATURE_RE = /^lto1:(lapsed|expiring|conditions|prohibition|improvement-overdue):([^:]+)$/;

export function parseLtoAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], authorisationId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexAuthorisationAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== LTO_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseLtoAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  lapsed: 'A statutory authority has lapsed — a declared power to operate is not in force',
  expiring: 'A statutory authority is inside its renewal window and no renewal is submitted',
  conditions: 'Declared licence conditions are unevidenced or past their re-evidence window',
  prohibition: 'A prohibition notice stands against a declared activity',
  'improvement-overdue': 'An improvement notice is past the compliance day it set',
});

const OUTCOMES = Object.freeze({
  lapsed: `Open the statutory authorisation register (#/authorisations) and record what actually happened: the renewal that was submitted or decided, the regulator action that was served, or the new instrument that was granted. A renewal submitted is not a grant, and this ask names no site, activity or instrument because a delegation is readable above the seat it is sent to.`,
  expiring: 'Open the statutory authorisation register (#/authorisations) and either submit the renewal with its written basis or record why it is not being renewed. The lead time that has arrived was set by the authority’s own declaration, not by this rule.',
  conditions: 'Open the conditions panel (#/authorisations?view=conditions) and record the dated evidence that actually exists for each unevidenced or stale condition. A live licence is not evidence that its conditions are met, and the register will not mark one compliant on your behalf.',
  prohibition: 'Open the regulator actions (#/authorisations?view=actions) and record what the prohibition notice stopped, what was done about it, and the close with its basis. The licence may still be in force; the activity is what the notice stops.',
  'improvement-overdue': 'Open the regulator actions (#/authorisations?view=actions) and either record compliance with the steps the notice set, or record why they were not completed. The day it set has passed; the register keeps an open notice open until somebody answers it.',
});

const URGENCY = Object.freeze({ lapsed: 0, prohibition: 0, 'improvement-overdue': 1, conditions: 2, expiring: 3 });

const DUE_DAYS = Object.freeze({ lapsed: 0, prohibition: 0, 'improvement-overdue': 0, conditions: 2, expiring: 2 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: LTO_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: LTO_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${LTO_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function authorisationConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  for (const row of report.rows || []) {
    const state = row?.state?.key;
    const authorityId = row?.authorisation?.id;
    if (!authorityId) continue;

    const kinds = [];
    if (state === 'lapsed' || state === 'lapsed-awaiting-decision') kinds.push('lapsed');
    if (state === 'prohibited') kinds.push('prohibition');
    if (row.improvementOverdueN > 0) kinds.push('improvement-overdue');
    if ((row.unevidencedN || 0) + (row.staleN || 0) > 0) kinds.push('conditions');
    if (state === 'expiring') kinds.push('expiring');
    if (!kinds.length) continue;

    const managerIds = list(row.managerIds).filter(Boolean);
    if (!managerIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: ltoAskSignature(kind, authorityId),
          detail: `An authority is in the ${kind === 'conditions' ? 'unevidenced-condition' : kind} condition, but none of its accountable hands has an active reporting line, so no seat can be asked to answer for it.`,
        });
      }
      continue;
    }

    const apex = matrixJointApex(report.matrix, managerIds);
    const apexIds = list(apex?.apexIds);
    if (!apexIds.length) {
      for (const kind of kinds) {
        observations.push({
          signature: ltoAskSignature(kind, authorityId),
          detail: `An authority is in the ${kind === 'conditions' ? 'unevidenced-condition' : kind} condition, but the reporting graph yields no joint seat above the lines that hold its accountable hands.`,
        });
      }
      continue;
    }

    for (const kind of kinds) {
      for (const seatId of apexIds) {
        if (!seatId) continue;
        conditions.push({
          kind,
          signature: ltoAskSignature(kind, authorityId),
          seatIds: [seatId],
          dueInDays: DUE_DAYS[kind] ?? 1,
          ambiguous: Boolean(apex?.ambiguous),
          urgency: URGENCY[kind] ?? 9,
        });
      }
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-LTO-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function authorisationRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(LTO_EVENT_PREFIX)) return [];

  const conv = normalizeLtoSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[LTO_SETTING_KEYS.autoPropagate] === false || conv.ltoAutoPropagate === false) return [];

  // An emptied register still runs, because the asks this rule filed have to be
  // closed when the last authority goes. Only a workspace with no authorities AND
  // no live ask of this rule's is nothing to do.
  const existing = indexAuthorisationAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.ltoAuthorisations).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildAuthorisations(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = authorisationConditions(report);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(LTO_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the statutory-authorisation register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the statutory authorisation register (#/authorisations).', 2000),
        authority: 'act-inform',
        support: `Issued by ${LTO_RULE_ID} from the statutory authorisation register (#/authorisations). It reads declared authorities, conditions, evidence, regulator actions and renewals only; it is not a finding about any person, site or line and is not a rating of any of them.`,
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
        ruleId: LTO_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a statutory-authorisation ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.ltoMarkers = Array.isArray(draft.ltoMarkers) ? draft.ltoMarkers : [];
    const have = new Set(draft.ltoMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.ltoMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: LTO_RULE_ID,
        kind: LTO_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', LTO_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', LTO_ROUTE, `${deferred} statutory-authorisation ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${LTO_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The statutory-authorisation condition cleared; the register closed its own ask.');
  }

  return out;
}

authorisationRule.id = 'authorisationRule';

export default authorisationRule;
