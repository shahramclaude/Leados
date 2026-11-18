/**
 * app/core/domain/prvRules.js — `RULE-PROV-01` on the shared post-commit spine
 * (ADR-0250, Schema v204).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildProvisions`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `unassessed` — an open matter carries a gross exposure on the claim
 *      register and no provision assessment. This is the condition the register
 *      exists for: a zero here would read as a decision that no provision is owed,
 *      when in fact nobody has decided. The ask goes to the JOINT APEX above every
 *      line holding ANY responsible hand.
 *
 *   2. `disclosed-only` — a contingent liability that is disclosed, not provided:
 *      possible, or probable but not reliably estimable. The ask is for the
 *      estimate or the reclassification, never for a provision the record does not
 *      support.
 *
 *   3. `asset-capped` — a reimbursement asset exceeds the provision and is capped.
 *      The excess is a figure a reader must see; the ask is for the provision to be
 *      re-estimated or the excess to be explained.
 *
 *   4. `asset-without-cash` — a reimbursement asset recognized on a declared
 *      judgment with no cash received. The ask is for the cash or a revised
 *      judgment.
 *
 *   5. `unreconciled` — a currency whose computed provision differs from the
 *      declared finance carrying. The ask goes to the joint apex above every line
 *      holding any responsible hand on the schedule, because the reconciliation is
 *      a whole-register duty.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * matter or currency), so clearing one matter cannot clear another. What the rule
 * never does is re-file the same obligation: a seat receives each ask once, and at
 * most four new asks arrive per commit with the remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a matter reference, a party, an amount, a currency
 * total or a person. A provision schedule is as sensitive as the claim export; a
 * delegation naming the matter and the sum provided is a disclosure with a
 * deadline attached. The opaque signature lives only in the typed
 * `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never declares an assessment, a scenario, a
 * reimbursement or a carrying; sets a classification; computes a provision or an
 * asset; rounds an expected value; recognizes an asset above the provision;
 * reconciles by adopting either number; gives accounting advice; or rates, ranks or
 * names a person or line as a cause. Where nobody can be asked — a disconnected
 * graph, a matter whose hands are all off the graph, an unresolvable or ambiguous
 * apex — it writes ONE identity-free observation per condition and asks nobody.
 * Asks are `act-inform` delegations with typed `issues-obligation` provenance,
 * idempotent per (signature, addressee), self-closing when the condition clears or
 * the addressee moves, bounded at four per commit with the remainder counted, and
 * pause-governed on every path including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildProvisions } from './prvProvision.js';
import {
  PROV_EVENT_PREFIX,
  PROV_MARKER_KIND,
  PROV_ROUTE,
  PROV_RULE_ID,
  PROV_SETTING_KEYS,
} from './prvRegistry.js';
import { normalizePrvSettings } from './prvSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const PROV_PAUSE_SWITCH = 'provAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a matter id or a
 * currency appears in this rule's output, and it travels inside the typed link
 * rather than the delegation. Two operators running the same pass derive the same
 * signatures, so neither duplicates the other's asks.
 */
export function prvAskSignature(kind, subjectId) {
  return `prov1:${kind}:${subjectId}`;
}

const SIGNATURE_RE = /^prov1:(unassessed|disclosed-only|asset-capped|asset-without-cash|unreconciled):([^:]+)$/;

export function parsePrvAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexProvisionAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== PROV_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePrvAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'unassessed': 'An open matter carries a gross exposure and no provision assessment',
  'disclosed-only': 'A contingent liability is disclosed but not provided',
  'asset-capped': 'A reimbursement asset exceeds the provision and is capped at it',
  'asset-without-cash': 'A reimbursement asset rests on a declared judgment with no cash received',
  'unreconciled': 'The computed provision disagrees with the declared finance carrying',
});

const OUTCOMES = Object.freeze({
  'unassessed': 'Open the provision register (#/provisions) and declare the assessment: the classification (probable, possible or remote) and the best estimate (most likely, or a probability-weighted expected value over declared scenarios). The register refuses to print a zero as though a zero were a decision.',
  'disclosed-only': 'Open the provision register (#/provisions) and record what changed: a reliable best estimate that turns the matter into a provision, or a reclassification that confirms it is a contingent liability. The register does not provide a probable obligation without a reliable estimate.',
  'asset-capped': 'Open the reimbursement assets (#/provisions?view=reimbursements) and record the provision re-estimate or the explanation for the excess. The asset is recognized only up to the provision; recognizing the excess would invent value the obligation does not support.',
  'asset-without-cash': 'Open the reimbursement assets (#/provisions?view=reimbursements) and record the cash received or a revised judgment. The asset is recognized on a declared virtual certainty with no cash behind it yet, and the register says so plainly.',
  'unreconciled': 'Open the reconciliation (#/provisions?view=reconciliation) and record which figure is correct: re-declare the finance carrying, or correct the assessment behind the computed provision. The register never silently adopts either number.',
});

const URGENCY = Object.freeze({ 'unassessed': 0, 'disclosed-only': 1, 'asset-capped': 1, 'asset-without-cash': 2, 'unreconciled': 0 });
const DUE_DAYS = Object.freeze({ 'unassessed': 1, 'disclosed-only': 2, 'asset-capped': 2, 'asset-without-cash': 3, 'unreconciled': 2 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PROV_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PROV_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${PROV_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function provisionConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const askFor = (kind, subjectId, managerIds) => {
    const ids = list(managerIds).filter(Boolean);
    if (!ids.length) {
      observations.push({
        signature: prvAskSignature(kind, subjectId),
        detail: `A provision condition (${kind}) is on the record, but none of its responsible hands has an active reporting line, so no seat can be asked to answer for it.`,
      });
      return;
    }
    const apex = matrixJointApex(report.matrix, ids);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      observations.push({
        signature: prvAskSignature(kind, subjectId),
        detail: `A provision condition (${kind}) is on the record, but the reporting graph yields no joint seat above the lines that hold its responsible hands.`,
      });
      return;
    }
    for (const seatId of apexIds) {
      if (!seatId) continue;
      conditions.push({
        kind,
        subjectId,
        signature: prvAskSignature(kind, subjectId),
        seatIds: [seatId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
        urgency: URGENCY[kind] ?? 9,
      });
    }
  };

  for (const row of report.rows || []) {
    const matterId = row?.matter?.id;
    if (!matterId) continue;
    if (row.state?.key === 'unassessed') askFor('unassessed', matterId, row.managerIds);
    if (row.state?.key === 'disclosed-only') askFor('disclosed-only', matterId, row.managerIds);
    if (row.assetCapped) askFor('asset-capped', matterId, row.managerIds);
    if (row.assetWithoutCash) askFor('asset-without-cash', matterId, row.managerIds);
  }

  // The reconciliation is a whole-register duty: the ask goes to the joint apex
  // above every line holding any responsible hand on the schedule.
  const allManagerIds = [...new Set((report.rows || []).flatMap((row) => list(row.managerIds)))].sort();
  for (const currencyRow of report.currencyRows || []) {
    if (currencyRow?.reconciled === false) askFor('unreconciled', currencyRow.currency, allManagerIds);
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-PROV-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function provisionRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PROV_EVENT_PREFIX)) return [];

  const conv = normalizePrvSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[PROV_SETTING_KEYS.autoPropagate] === false || conv.provAutoPropagate === false) return [];

  // The rule runs when the register has anything to say: a declared assessment,
  // an open matter on the claim register (the `unassessed` condition is the one
  // this register exists for, and it is exactly the case where NO assessment is
  // on the record), or an ask it filed earlier that has to be closed when the
  // last assessment goes. An emptied workspace with no matters and no asks is
  // the only case where there is nothing to read.
  const existing = indexProvisionAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.prvAssessments).length && !hasActiveAsk && !list(draft.lfgMatters).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildProvisions(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = provisionConditions(report);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PROV_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the provision register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the provision register (#/provisions).', 2000),
        authority: 'act-inform',
        support: `Issued by ${PROV_RULE_ID} from the provision and reimbursement register (#/provisions). It reads declared assessments, scenarios, reimbursement recognitions and finance carryings only; it gives no accounting advice, is not a finding about any person or line, and is not a rating of any of them.`,
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
        ruleId: PROV_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a provision-register ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.prvMarkers = Array.isArray(draft.prvMarkers) ? draft.prvMarkers : [];
    const have = new Set(draft.prvMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.prvMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: PROV_RULE_ID,
        kind: PROV_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', PROV_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', PROV_ROUTE, `${deferred} provision-register ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${PROV_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The provision-register condition cleared; the register closed its own ask.');
  }

  return out;
}

provisionRule.id = 'provisionRule';

export default provisionRule;
