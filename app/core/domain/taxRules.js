/**
 * app/core/domain/taxRules.js — `RULE-TAX-01` on the shared post-commit spine
 * (ADR-0257, Schema v209).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildTaxControversy`) and
 * the live reporting graph, and never re-derived here:
 *
 *   1. `deadline-undeclared` — an authority notice is on the record and no
 *      objection deadline is declared. This is the condition the register
 *      exists for: a missing deadline is not "no deadline", it is a clock
 *      nobody has put on the record. The ask goes to the JOINT APEX above every
 *      line holding ANY responsible hand.
 *
 *   2. `overdue-unfiled` — the declared deadline has passed and no filing is on
 *      the record. The ask is for the filing, or for a recorded resolution
 *      conceding the assessment.
 *
 *   3. `filed-late` — the first filing was made after the declared deadline.
 *      The ask is for the consequence to be recorded: the authority's response,
 *      or the seat's own assessment of the late filing.
 *
 *   4. `evidence-empty` — a filed notice carries no evidence packet. The ask is
 *      for the packet behind the disputed position.
 *
 *   5. `aging-unresolved` — a filed notice remains unresolved past the declared
 *      resolution horizon. The ask is for a status review.
 *
 * ONE ASK PER CONTROVERSY, NEVER ONE PER SCREEN. The signature is per
 * (condition, notice), so clearing one notice cannot clear another. What the
 * rule never does is re-file the same obligation: a seat receives each ask
 * once, and at most four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a notice reference, a jurisdiction, a position,
 * an amount, a currency total or a person. A controversy schedule is as
 * sensitive as the provision export; a delegation naming the authority and the
 * sum disputed is a disclosure with a deadline attached. The opaque signature
 * lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares a notice, a deadline, a filing, an
 * evidence item or a resolution; computes a deadline from a notice day; asserts
 * timeliness; re-dates a late filing; infers evidence from a filing; gives tax
 * advice; or rates, ranks or names a person or line as a cause. Where nobody
 * can be asked — a disconnected graph, a notice whose hands are all off the
 * graph, an unresolvable or ambiguous apex — it writes ONE identity-free
 * observation per condition and asks nobody. Asks are `act-inform` delegations
 * with typed `issues-obligation` provenance, idempotent per (signature,
 * addressee), self-closing when the condition clears or the addressee moves,
 * bounded at four per commit with the remainder counted, and pause-governed on
 * every path including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildTaxControversy } from './taxControversy.js';
import {
  TAX_EVENT_PREFIX,
  TAX_MARKER_KIND,
  TAX_ROUTE,
  TAX_RULE_ID,
  TAX_SETTING_KEYS,
} from './taxRegistry.js';
import { normalizeTaxSettings } from './taxSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const TAX_PAUSE_SWITCH = 'taxAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a notice id
 * appears in this rule's output, and it travels inside the typed link rather
 * than the delegation. Two operators running the same pass derive the same
 * signatures, so neither duplicates the other's asks.
 */
export function taxAskSignature(kind, subjectId) {
  return `tax1:${kind}:${subjectId}`;
}

const SIGNATURE_RE = /^tax1:(deadline-undeclared|overdue-unfiled|filed-late|evidence-empty|aging-unresolved):([^:]+)$/;

export function parseTaxAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexTaxAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== TAX_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseTaxAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'deadline-undeclared': 'An authority notice carries no declared objection deadline',
  'overdue-unfiled': 'A declared objection deadline has passed with no filing on the record',
  'filed-late': 'A filing was made after its declared objection deadline',
  'evidence-empty': 'A filed tax objection carries no evidence packet',
  'aging-unresolved': 'A filed tax controversy remains unresolved past the declared horizon',
});

const OUTCOMES = Object.freeze({
  'deadline-undeclared': 'Open the tax controversy register (#/tax) and declare the objection deadline with its written jurisdictional basis. The register holds no jurisdiction calendar and will not invent one; a date nobody cited is the deadline this register exists to refuse.',
  'overdue-unfiled': 'Open the tax controversy register (#/tax) and record the filing with the authority’s receipt reference, or record a resolution conceding the assessment. The assessment is becoming final by default.',
  'filed-late': 'Open the tax controversy register (#/tax) and record the consequence of the late filing: the authority’s response, or the seat’s own assessment of the late filing. The register records the lateness plainly rather than refusing the filing or re-dating it.',
  'evidence-empty': 'Open the evidence packets (#/tax?view=evidence) and record the evidence behind the disputed position, each with its document reference. A filing without a packet is a claim the record cannot yet support.',
  'aging-unresolved': 'Open the resolutions (#/tax?view=resolutions) and record a status review: the authority’s position, the next procedural step, or the resolution. The horizon is a declared convention, never a jurisdiction calendar.',
});

const URGENCY = Object.freeze({ 'deadline-undeclared': 0, 'overdue-unfiled': 0, 'filed-late': 1, 'evidence-empty': 2, 'aging-unresolved': 2 });
const DUE_DAYS = Object.freeze({ 'deadline-undeclared': 1, 'overdue-unfiled': 1, 'filed-late': 2, 'evidence-empty': 3, 'aging-unresolved': 3 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: TAX_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: TAX_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${TAX_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so
 * the suite can pin every branch without a store.
 */
export function taxConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const askFor = (kind, subjectId, managerIds) => {
    const ids = list(managerIds).filter(Boolean);
    if (!ids.length) {
      observations.push({
        signature: taxAskSignature(kind, subjectId),
        detail: `A tax-controversy condition (${kind}) is on the record, but none of its responsible hands has an active reporting line, so no seat can be asked to answer for it.`,
      });
      return;
    }
    const apex = matrixJointApex(report.matrix, ids);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      observations.push({
        signature: taxAskSignature(kind, subjectId),
        detail: `A tax-controversy condition (${kind}) is on the record, but the reporting graph yields no joint seat above the lines that hold its responsible hands.`,
      });
      return;
    }
    for (const seatId of apexIds) {
      if (!seatId) continue;
      conditions.push({
        kind,
        subjectId,
        signature: taxAskSignature(kind, subjectId),
        seatIds: [seatId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
        urgency: URGENCY[kind] ?? 9,
      });
    }
  };

  for (const row of report.rows || []) {
    const noticeId = row?.notice?.id;
    if (!noticeId) continue;
    if (row.state?.key === 'deadline-undeclared') askFor('deadline-undeclared', noticeId, row.managerIds);
    if (row.state?.key === 'overdue-unfiled') askFor('overdue-unfiled', noticeId, row.managerIds);
    if (row.state?.key === 'filed-late') askFor('filed-late', noticeId, row.managerIds);
    if (row.evidenceEmpty) askFor('evidence-empty', noticeId, row.managerIds);
    if (row.agingUnresolved) askFor('aging-unresolved', noticeId, row.managerIds);
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-TAX-01`. Runs on the shared spine after every commit that is not its
 * own automation output, and on the explicit scan. Pause-governed on every
 * path.
 */
export function taxRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(TAX_EVENT_PREFIX)) return [];

  const conv = normalizeTaxSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[TAX_SETTING_KEYS.autoPropagate] === false || conv.taxAutoPropagate === false) return [];

  // The rule runs when the register has anything to say: a declared notice, or
  // an ask it filed earlier that has to be closed when the last notice goes.
  // An emptied workspace with no notices and no asks is the only case where
  // there is nothing to read.
  const existing = indexTaxAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.taxNotices).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildTaxControversy(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = taxConditions(report);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(TAX_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the tax controversy register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the tax controversy register (#/tax).', 2000),
        authority: 'act-inform',
        support: `Issued by ${TAX_RULE_ID} from the tax controversy and appeal-control register (#/tax). It reads declared notices, deadlines, filings, evidence items and resolutions only; it gives no tax advice, is not a finding about any person or line, and is not a rating of any of them.`,
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
        ruleId: TAX_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a tax-controversy ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.taxMarkers = Array.isArray(draft.taxMarkers) ? draft.taxMarkers : [];
    const have = new Set(draft.taxMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.taxMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: TAX_RULE_ID,
        kind: TAX_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', TAX_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', TAX_ROUTE, `${deferred} tax-controversy ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${TAX_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The tax-controversy condition cleared; the register closed its own ask.');
  }

  return out;
}

taxRule.id = 'taxRule';

export default taxRule;
