/**
 * app/core/domain/msaRules.js — `RULE-MSA-01` on the shared post-commit spine
 * (ADR-0260, Schema v212).
 *
 * FIVE CONDITIONS, each read from the ONE reader (`buildModernSlavery`) and the
 * live reporting graph, and never re-derived here:
 *
 *   1. `deadline-undeclared` — a statement is on the record and no publication
 *      deadline is declared. This is the condition the register exists for: a
 *      missing deadline is not "no deadline", it is a statutory clock nobody
 *      has put on the record. The ask goes to the JOINT APEX above every line
 *      holding ANY responsible hand.
 *
 *   2. `overdue-unpublished` — the declared deadline has passed and no
 *      publication is on the record. The statutory failure has happened; the
 *      ask is to publish or to record why the organisation did not.
 *
 *   3. `publication-due` — the deadline is inside the declared warning horizon
 *      and the statement is unpublished. The ask is filed once per statement
 *      per horizon, so a long horizon does not stream identical asks.
 *
 *   4. `content-gap` — a statement carries an approval or a publication and the
 *      record does not support it: an element is unevidenced, the claim about
 *      instances was refused, or a finding has no complete remediation act. The
 *      ask is for the evidence the statement stands on.
 *
 *   5. `remediation-open` — a finding carries no complete remediation act. The
 *      ask is for the evidenced act; a plan is not a remedy.
 *
 * ONE ASK PER CONDITION SUBJECT, NEVER ONE PER SCREEN. The signature is per
 * (condition, statement or finding), so clearing one statement cannot clear
 * another. What the rule never does is re-file the same obligation: a seat
 * receives each ask once, and at most four new asks arrive per commit with the
 * remainder counted.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, so no title names a statement reference, an entity, a supplier, a
 * country, a finding, a remediation or a person. A due-diligence schedule names
 * suppliers and findings about workers; a delegation naming them is a
 * disclosure with a deadline attached. The opaque signature lives only in the
 * typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never records a statement, declares a deadline,
 * records an approval or a publication, adds a supplier, records an assessment,
 * a finding or a remediation act, computes a deadline from a financial-year
 * end, authors statement text, asserts a claim about instances, closes a
 * remediation, gives legal advice, or rates, ranks or names a supplier, a
 * person or a line as a cause. Where nobody can be asked — a disconnected
 * graph, a statement whose hands are all off the graph, an unresolvable or
 * ambiguous apex — it writes ONE identity-free observation per condition and
 * asks nobody. Asks are `act-inform` delegations with typed `issues-obligation`
 * provenance, idempotent per (signature, addressee), self-closing when the
 * condition clears or the addressee moves, bounded at four per commit with the
 * remainder counted, and pause-governed on every path including the explicit
 * scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildModernSlavery } from './modernSlavery.js';
import {
  MSA_EVENT_PREFIX,
  MSA_MARKER_KIND,
  MSA_ROUTE,
  MSA_RULE_ID,
  MSA_SETTING_KEYS,
} from './msaRegistry.js';
import { normalizeMsaSettings } from './msaSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const MSA_PAUSE_SWITCH = 'msaAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a statement
 * or finding id appears in this rule's output, and it travels inside the typed
 * link rather than the delegation. Two operators running the same pass derive
 * the same signatures, so neither duplicates the other's asks.
 */
export function msaAskSignature(kind, subjectId) {
  return `msa1:${kind}:${subjectId}`;
}

const SIGNATURE_RE = /^msa1:(deadline-undeclared|overdue-unpublished|publication-due|content-gap|remediation-open):([^:]+)$/;

export function parseMsaAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexMsaAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== MSA_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseMsaAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'deadline-undeclared': 'A modern slavery statement carries no declared publication deadline',
  'overdue-unpublished': 'A declared publication deadline has passed with the statement unpublished',
  'publication-due': 'A modern slavery statement is approaching its declared publication deadline',
  'content-gap': 'A modern slavery statement is not fully supported by its own record',
  'remediation-open': 'A finding on the due-diligence record has no complete remediation act',
});

const OUTCOMES = Object.freeze({
  'deadline-undeclared': 'Open the modern slavery register (#/modern-slavery) and declare the publication deadline with its written basis. The register holds no corporate calendar and will not invent one; a date nobody cited is the deadline this register exists to refuse.',
  'overdue-unpublished': 'Open the modern slavery register (#/modern-slavery) and record the publication with its reference, or record why the organisation did not publish. The statutory window has already closed.',
  'publication-due': 'Open the modern slavery register (#/modern-slavery) and complete the statement evidence and publication before the declared deadline. The days remaining are printed on the register.',
  'content-gap': 'Open the statement evidence (#/modern-slavery) and close the gap the element matrix prints: the unevidenced element, the refused claim or the open remediation. A statement may only say what its record supports.',
  'remediation-open': 'Open findings & remediation (#/modern-slavery?view=findings) and record the remediation act complete with the document reference that proves it. A plan is not a remedy.',
});

const URGENCY = Object.freeze({ 'deadline-undeclared': 0, 'overdue-unpublished': 0, 'remediation-open': 1, 'content-gap': 2, 'publication-due': 2 });
const DUE_DAYS = Object.freeze({ 'deadline-undeclared': 1, 'overdue-unpublished': 1, 'remediation-open': 2, 'content-gap': 3, 'publication-due': 3 });

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: MSA_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: MSA_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${MSA_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so
 * the suite can pin every branch without a store.
 */
export function msaConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  const askFor = (kind, subjectId, managerIds) => {
    const ids = list(managerIds).filter(Boolean);
    if (!ids.length) {
      observations.push({
        signature: msaAskSignature(kind, subjectId),
        detail: `A modern-slavery condition (${kind}) is on the record, but none of its responsible hands has an active reporting line, so no seat can be asked to answer for it.`,
      });
      return;
    }
    const apex = matrixJointApex(report.matrix, ids);
    const apexIds = list(apex?.apexIds).filter(Boolean);
    if (!apexIds.length) {
      observations.push({
        signature: msaAskSignature(kind, subjectId),
        detail: `A modern-slavery condition (${kind}) is on the record, but the reporting graph yields no joint seat above the lines that hold its responsible hands.`,
      });
      return;
    }
    for (const seatId of apexIds) {
      if (!seatId) continue;
      conditions.push({
        kind,
        subjectId,
        signature: msaAskSignature(kind, subjectId),
        seatIds: [seatId],
        dueInDays: DUE_DAYS[kind] ?? 1,
        ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
        urgency: URGENCY[kind] ?? 9,
      });
    }
  };

  for (const row of report.rows || []) {
    const statementId = row?.statement?.id;
    if (!statementId) continue;
    if (row.state?.key === 'deadline-undeclared') askFor('deadline-undeclared', statementId, row.managerIds);
    if (row.state?.key === 'overdue-unpublished') askFor('overdue-unpublished', statementId, row.managerIds);
    if (row.dueSoon && !row.publication) askFor('publication-due', statementId, row.managerIds);
    if (row.contentGaps && (row.approval || row.publication)) askFor('content-gap', statementId, row.managerIds);
    for (const findingState of row.findingStates || []) {
      if (findingState.open) askFor('remediation-open', findingState.finding.id, row.managerIds);
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency || String(a.signature).localeCompare(String(b.signature)) || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-MSA-01`. Runs on the shared spine after every commit that is not its
 * own automation output, and on the explicit scan. Pause-governed on every
 * path.
 */
export function msaRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(MSA_EVENT_PREFIX)) return [];

  const conv = normalizeMsaSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[MSA_SETTING_KEYS.autoPropagate] === false || conv.msaAutoPropagate === false) return [];

  // The rule runs when the register has anything to say: a declared statement,
  // or an ask it filed earlier that has to be closed when the last statement
  // goes. An emptied workspace with no statements and no asks is the only case
  // where there is nothing to read.
  const existing = indexMsaAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.msaStatements).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildModernSlavery(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = msaConditions(report);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(MSA_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the modern slavery register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the modern slavery register (#/modern-slavery).', 2000),
        authority: 'act-inform',
        support: `Issued by ${MSA_RULE_ID} from the modern slavery & supply-chain due-diligence statement register (#/modern-slavery). It reads declared statements, deadlines, approvals, publications, suppliers, assessments, findings, remediation acts and training records only; it gives no legal advice, is not a finding about any person, supplier or line, and is not a rating of any of them.`,
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
        ruleId: MSA_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a modern-slavery ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.msaMarkers = Array.isArray(draft.msaMarkers) ? draft.msaMarkers : [];
    const have = new Set(draft.msaMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.msaMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: MSA_RULE_ID,
        kind: MSA_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', MSA_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', MSA_ROUTE, `${deferred} modern-slavery ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${MSA_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The modern-slavery condition cleared; the register closed its own ask.');
  }

  return out;
}

msaRule.id = 'msaRule';

export default msaRule;
