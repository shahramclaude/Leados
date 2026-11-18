/**
 * app/core/domain/caseToAnswerRules.js — `RULE-DGI-01` on the shared post-commit
 * spine (ADR-0254, Schema v207).
 *
 * SIX CONDITIONS, each read from the ONE reader (`buildCaseToAnswer`) and the live
 * reporting graph, and never re-derived here:
 *
 *   1. `assignment-owed` — a case is on the record with no investigator, or with an
 *      investigator the live graph no longer makes independent or senior. A case
 *      nobody can fairly investigate is a case that will be answered late, badly,
 *      or by the wrong hand.
 *
 *   2. `finding-owed` — the investigator holds the case but at least one allegation
 *      carries no RELIABLE written finding on the case's own standard. The count is
 *      carried in the signature so a second allegation becoming due is a second
 *      obligation, not a silent re-use of the first.
 *
 *   3. `decision-owed` — every allegation carries a reliable finding and the
 *      sanction decision is owed by a hand strictly senior to the investigator.
 *
 *   4. `appeal-decision-owed` — an appeal is lodged and waits for a DIFFERENT hand
 *      strictly senior to the decision-maker.
 *
 *   5. `appeal-window-open` — a decision stands inside its declared appeal window.
 *      This is a CLOCK, not a fault: the ask says how many whole days are left and
 *      is addressed to the parties' joint apex, because the window closes by the
 *      calendar whether or not anybody writes anything.
 *
 *   6. `record-conflict` — the dated acts cannot all be true in the order a fair
 *      procedure requires, or the investigator/decider independence has failed. No
 *      state is repaired by this rule; it asks the joint apex to look at the record
 *      itself.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * case) — and per owed-finding count where the count is the obligation — so
 * clearing one case cannot clear another.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. A delegation is readable above the
 * addressee, and this register is individual material about named people. No title
 * names a case reference, a person, an allegation, a written standard, a finding, a
 * sanction, an investigator or a ground of appeal. The opaque signature lives only
 * in the typed `issues-obligation` link. A delegation titled "an allegation is
 * uninvestigated" is already a disclosure; this rule does not make one.
 *
 * WHAT IT NEVER DOES. It never opens a case, assigns an investigator, records a
 * direction or a finding, decides a sanction or an appeal, withdraws a case, or
 * writes a state. It never scores, ranks or names a person as a cause. Where nobody
 * can be asked — a disconnected graph, parties off the graph, an unresolvable or
 * ambiguous apex — it writes ONE identity-free observation per condition and asks
 * nobody.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildCaseToAnswer } from './caseToAnswer.js';
import {
  DGI_EVENT_PREFIX,
  DGI_MARKER_KIND,
  DGI_ROUTE,
  DGI_RULE_ID,
  DGI_SETTING_KEYS,
} from './caseToAnswerRegistry.js';
import { normalizeDgiSettings } from './caseToAnswerSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census greps it. */
export const DGI_PAUSE_SWITCH = 'dgiAutoPropagate';

/**
 * OPAQUE, DETERMINISTIC SIGNATURES. A signature is the ONLY place a case id
 * appears in this rule's output, and it travels inside the typed link rather than
 * the delegation. Two operators running the same pass derive the same signatures,
 * so neither duplicates the other's asks.
 */
export function dgiAskSignature(kind, subjectId, extra = null) {
  return extra === null ? `dgi1:${kind}:${subjectId}` : `dgi1:${kind}:${subjectId}:${extra}`;
}

const SIGNATURE_RE = /^dgi1:(assignment-owed|finding-owed|decision-owed|appeal-decision-owed|appeal-window-open|record-conflict):([^:]+)(?::([A-Za-z0-9]+))?$/;

export function parseDgiAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], subjectId: match[2], extra: match[3] || null };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexDgiAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== DGI_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseDgiAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

/**
 * THE TITLES AND OUTCOMES ARE DELIBERATELY CONTENT-FREE.
 *
 * Each names the DUTY and the register, never the case. A reader above the
 * addressee sees "a fair-process duty is owed on a case in this workspace" — which
 * is true, actionable, and discloses nothing about a named person. The register and
 * its route anchor are given so the addressee can open the screen their own seat
 * scopes for them.
 */
const TITLES = Object.freeze({
  'assignment-owed': 'A fair-process case is waiting for an investigator able to hold it fairly',
  'finding-owed': 'A fair-process case is waiting for a written finding on every allegation',
  'decision-owed': 'A fair-process case has its written findings and is waiting for a sanction decision',
  'appeal-decision-owed': 'A fair-process appeal is waiting for a senior hand who did not decide the case',
  'appeal-window-open': 'A fair-process decision stands inside its declared appeal window',
  'record-conflict': 'A fair-process case carries acts that cannot all be true in the order a fair procedure requires',
});

const OUTCOMES = Object.freeze({
  'assignment-owed': 'Open the fair-process register (#/fair-process) and assign an investigator who holds neither party on an active reporting line and is strictly senior to the subject, with written terms of reference. Independence and seniority are computed from the live graph; the register refuses a hand that fails either test.',
  'finding-owed': 'Open the fair-process register (#/fair-process) and record a written finding against each allegation still owed, on the standard of proof the case declared when it was opened. A finding needs a written reason and an evidence reference; the register will not accept a verdict on a different standard.',
  'decision-owed': 'Open the fair-process register (#/fair-process) and record the sanction decision from the declared ladder — including “no sanction” where that is the decision. The decision must be made by a hand strictly senior to the investigator, and the ladder rung the person’s own record computes is printed beside the one you choose.',
  'appeal-decision-owed': 'Open the fair-process register (#/fair-process) and decide the appeal — allowed, refused, or varied with a substituted sanction. The appeal must be decided by a different hand strictly senior to the decision-maker; the action refuses the hand that decided the case.',
  'appeal-window-open': 'Open the fair-process register (#/fair-process) and check whether the parties know their appeal window is running. The window is a declared convention and it closes by the calendar; the register prints the exact whole days left.',
  'record-conflict': 'Open the fair-process register (#/fair-process) and read the case itself. The dated acts on it cannot all be true in the order a fair procedure requires, or a hand that was not independent recorded an act. The register does not repair this by preferring one row.',
});

const URGENCY = Object.freeze({
  'record-conflict': 0, 'assignment-owed': 0, 'finding-owed': 1, 'decision-owed': 1,
  'appeal-decision-owed': 1, 'appeal-window-open': 2,
});
const DUE_DAYS = Object.freeze({
  'record-conflict': 0, 'assignment-owed': 1, 'finding-owed': 3, 'decision-owed': 3,
  'appeal-decision-owed': 3, 'appeal-window-open': 1,
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: DGI_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: DGI_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${DGI_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function caseToAnswerConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };

  for (const row of report.rows || []) {
    const caseId = row?.case?.id;
    if (!caseId) continue;
    const kinds = [];
    const extra = {};
    const state = row.state?.key;

    if (state === 'open' || state === 'investigator-invalid') kinds.push('assignment-owed');
    if (state === 'findings-owed' || state === 'investigator-assigned') {
      kinds.push('finding-owed');
      // THE COUNT IS PART OF THE OBLIGATION. A case with one finding owed and the
      // same case with three owed are different facts; folding them into one
      // signature would let the second and third go unasked.
      extra['finding-owed'] = String(Math.max(0, Number(row.findingsOwedN) || 0));
    }
    if (state === 'decision-owed') kinds.push('decision-owed');
    if (state === 'appeal-lodged') kinds.push('appeal-decision-owed');
    if (state === 'decided') kinds.push('appeal-window-open');
    if (state === 'record-conflict') kinds.push('record-conflict');
    if (!kinds.length) continue;

    // WHO CAN ANSWER. The assignment, the decision and the appeal decision belong to
    // the joint apex above the parties' lines; a finding belongs to the INVESTIGATOR,
    // the only hand that can record it. Where the apex cannot be resolved the rule
    // writes an observation rather than asking a hand it invented.
    const managers = list(row.managers).filter(Boolean);
    const apex = managers.length ? matrixJointApex(report.matrix, managers) : null;
    const apexIds = list(apex?.apexIds).filter(Boolean);

    for (const kind of kinds) {
      let seatIds = [];
      if (kind === 'finding-owed') {
        seatIds = row.investigator?.investigatorId ? [row.investigator.investigatorId] : [];
      } else {
        seatIds = apexIds;
      }
      if (!seatIds.length) {
        observations.push({
          signature: dgiAskSignature(kind, caseId, extra[kind] ?? null),
          detail: kind === 'finding-owed'
            ? 'A fair-process case carries allegations with no reliable written finding, but no investigator is recorded to record one.'
            : 'A fair-process case owes a duty, but the reporting graph yields no joint seat above the lines that hold its parties.',
        });
        continue;
      }
      for (const seatId of seatIds) {
        if (!seatId) continue;
        conditions.push({
          kind,
          signature: dgiAskSignature(kind, caseId, extra[kind] ?? null),
          caseId,
          seatIds: [seatId],
          dueInDays: DUE_DAYS[kind] ?? 1,
          ambiguous: Boolean(apex?.ambiguous) || apexIds.length > 1,
          urgency: URGENCY[kind] ?? 9,
          daysLeft: kind === 'appeal-window-open' ? row.appealDaysLeft ?? null : null,
        });
      }
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-DGI-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function caseToAnswerRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(DGI_EVENT_PREFIX)) return [];

  const conv = normalizeDgiSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv[DGI_SETTING_KEYS.autoPropagate] === false || conv.dgiAutoPropagate === false) return [];

  // An emptied register still runs, because the asks this rule filed have to be
  // closed when the last case goes. Only a workspace with no cases AND no live ask
  // of this rule's is nothing to do.
  const existing = indexDgiAsks(draft);
  const hasActiveAsk = existing.some((ask) => ask.task && ask.task.status === 'active');
  if (!list(draft.dgiCases).length && !hasActiveAsk) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildCaseToAnswer(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = caseToAnswerConditions(report);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(DGI_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A fair-process duty is owed', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || `Open the fair-process register (${DGI_ROUTE}).`, 2000),
        authority: 'act-inform',
        support: `Issued by ${DGI_RULE_ID} from the fair-process discipline and grievance register (#/fair-process). It names no case, no person, no allegation and no sanction: this register is individual material about named people and the ask discloses nothing. It is not a finding about any person and not a rating of any hand.`,
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
        ruleId: DGI_RULE_ID,
        summary: clip(condition.signature, 240),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a fair-process ask.'} Due ${dueOn(condition.dueInDays)}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.dgiMarkers = Array.isArray(draft.dgiMarkers) ? draft.dgiMarkers : [];
    const have = new Set(draft.dgiMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.dgiMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: DGI_RULE_ID,
        kind: DGI_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', DGI_ROUTE, `${wrote} fair-process condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', DGI_ROUTE, `${deferred} fair-process ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${DGI_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The fair-process condition cleared; the register closed its own ask.');
  }

  return out;
}

caseToAnswerRule.id = 'caseToAnswerRule';

export default caseToAnswerRule;
