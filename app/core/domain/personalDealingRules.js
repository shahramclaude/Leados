/**
 * app/core/domain/personalDealingRules.js — `RULE-DWL-01` on the shared
 * post-commit spine (ADR-0245, Schema v199).
 *
 * FOUR CONDITIONS, each read from the ONE reader (`buildPersonalDealing`) and the
 * live reporting graph, and never re-derived here:
 *
 *   1. `dealing-breach` — a dealing that fell inside a declared closed window,
 *      came after a refusal, sat outside its clearance's validity, or was cleared
 *      by the person who asked. This is the condition the register exists for.
 *      The ask goes to the JOINT APEX above every line holding the person — never
 *      to the person, whose own dealing is the subject, and never to one line on
 *      another line's behalf.
 *
 *   2. `clearance-overdue` — a clearance request whose declared turnaround has
 *      passed with no decision. Silence is not an approval, and the request stays
 *      open until a hand strictly above the requester answers it.
 *
 *   3. `window-open` — a declared closed period is open TODAY. The duty is the
 *      reminder itself: a window nobody can see is the failure mode the register
 *      removes, and the ask names no security, no person and no event.
 *
 *   4. `clearance-requested` — a clearance request is awaiting a decision inside
 *      its turnaround. Filed once per request so a long turnaround does not
 *      stream identical asks, and addressed to the same independent apex.
 *
 * ONE ASK PER OBLIGATION, NEVER ONE PER SCREEN. The signature is per (condition,
 * row), so a workspace with four breached dealings receives four separate asks and
 * clearing one cannot clear another. What the rule never does is re-file the same
 * obligation: a seat receives each ask once, at most four new asks arrive per
 * commit with the remainder counted, and an ask a human closed or returned is
 * treated as answered rather than re-issued.
 *
 * THE ASK SAYS NOTHING IT DOES NOT HAVE TO. Personal-account dealing is the most
 * individually sensitive material in the workspace, so no task title names a
 * person, a security, a broker reference, a quantity or a day. The opaque
 * signature lives only in the typed `issues-obligation` link.
 *
 * WHAT IT NEVER DOES. It never records a designation, an event, a clearance, a
 * decision or a dealing on anybody's behalf; never clears a trade; never treats
 * silence as approval; never moves a window or a validity; never repairs an
 * imported breach; and never scores, ranks or names a person as a cause. Where
 * nobody can be asked — no line holding the person on the graph, no joint seat, an
 * apex that resolves to nobody — it writes ONE identity-free observation per
 * condition and asks nobody. Asks are `act-inform` delegations with typed
 * `issues-obligation` provenance, idempotent per (signature, addressee),
 * self-closing when the condition clears or the addressee moves, bounded at four
 * per commit with the remainder counted, and pause-governed on every path
 * including the explicit scan.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { matrixJointApex } from './matrix.js';
import { buildPersonalDealing } from './personalDealing.js';
import {
  DWL_EVENT_PREFIX,
  DWL_MARKER_KIND,
  DWL_ROUTE,
  DWL_RULE_ID,
  DWL_SETTING_KEYS,
} from './personalDealingRegistry.js';
import { normalizeDwlSettings } from './personalDealingSchema.js';

const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);
const ASKS_PER_COMMIT = 4;

/** The literal key this rule reads, named here so the pause-permit census can grep it. */
export const DWL_PAUSE_SWITCH = 'dwlAutoPropagate';

/**
 * Opaque, deterministic signatures. A signature is the ONLY place a dealing,
 * clearance or event id appears in this rule's output, and it travels inside the
 * typed link rather than the delegation.
 */
export function personalDealingAskSignature(kind, targetId) {
  return `dwl1:${kind}:${targetId}`;
}

const SIGNATURE_RE = /^dwl1:(dealing-breach|clearance-overdue|window-open|clearance-requested):([^:]+)$/;

export function parsePersonalDealingAskSummary(summary) {
  if (typeof summary !== 'string') return null;
  const match = SIGNATURE_RE.exec(summary.trim());
  if (!match) return null;
  return { signature: match[0], kind: match[1], targetId: match[2] };
}

/** Every ask this rule ever filed, found through its typed `issues-obligation` link. */
export function indexPersonalDealingAsks(state) {
  const tasks = new Map(list(state?.delegations).filter((task) => task && typeof task.id === 'string').map((task) => [task.id, task]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== DWL_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parsePersonalDealingAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, kind: parsed.kind, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

const TITLES = Object.freeze({
  'dealing-breach': 'A personal-account dealing departed from the closed-period or clearance control — it must be accounted for',
  'clearance-overdue': 'A clearance request is past its declared turnaround with no decision on the record',
  'window-open': 'A declared closed period is open — personal dealing is closed for the designated persons it binds',
  'clearance-requested': 'A clearance request is awaiting a decision by an independent hand',
});

const OUTCOMES = Object.freeze({
  'dealing-breach': 'Open the personal-dealing register (#/personal-dealing?panel=dealings) and record what happened and who answered for it. The register prints the exact days inside the window, after the refusal or outside the validity, and it cannot be deleted, only accounted for. If the record was imported in error, correct the source and re-import — the register will not rewrite history on request. This ask names no person, no security and no day, because a delegation is readable above the seat it is sent to.',
  'clearance-overdue': 'Open the personal-dealing register (#/personal-dealing?panel=clearances) and decide the clearance: cleared with its declared validity day, or refused with a written reason. Silence is not an approval and this register will never print it as one. Only a hand strictly above the requester may decide it.',
  'window-open': 'Open the personal-dealing register (#/personal-dealing?panel=windows) and confirm the designated persons it binds have been told, and that no dealing is awaiting clearance inside it. The window was declared by a human against a written disclosure day; the register is reminding the line that holds it, not raising a finding about anybody.',
  'clearance-requested': 'Open the personal-dealing register (#/personal-dealing?panel=clearances) and answer the decision that is owed. The register names the seats the reporting graph proves independent of the requester, and no other hand can clear it.',
});

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: DWL_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: DWL_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${DWL_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

/**
 * The conditions the current record creates. Pure over (report); exported so the
 * suite can pin every branch without a store.
 */
export function personalDealingConditions(report) {
  const conditions = [];
  const observations = [];
  if (!report?.ok) return { conditions, observations };
  const graphIds = report.matrix?.nodes ? new Set(report.matrix.nodes.keys()) : new Set();

  const askApex = (kind, signature, anchorPersonId, lineIds, urgency) => {
    // The ask must reach the seat that answers for the person — never the person.
    // The anchor's own id is included in the apex input so the minimal common
    // ancestor is a seat ABOVE them, not the person themselves.
    const valid = [...new Set([anchorPersonId, ...list(lineIds)])].filter((lineId) => graphIds.has(lineId));
    if (!valid.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but neither the person nor any line holding them resolves on the active graph, so no seat can be asked to answer it.` });
      return;
    }
    const apex = matrixJointApex(report.matrix, valid);
    const apexIds = list(apex?.apexIds);
    // An apex that resolves to the person themselves is not an addressee: the
    // person whose dealing is the subject is the one the register protects from
    // being asked to answer for themselves.
    const above = apexIds.filter((id) => id !== anchorPersonId);
    if (!above.length) {
      observations.push({ signature, detail: `A ${kind} condition is on the register, but the reporting graph yields no seat above the person concerned, so no joint seat can be asked.` });
      return;
    }
    for (const seatId of above) {
      conditions.push({ kind, signature, seatIds: [seatId], dueOn: report.asOf, ambiguous: Boolean(apex?.ambiguous), urgency });
    }
  };

  /* 1 & 3: dealings that breached, and whether a window is open today. */
  for (const row of report.dealingRows) {
    if (row.state.key.startsWith('breach-')) {
      askApex(
        'dealing-breach',
        personalDealingAskSignature('dealing-breach', row.dealing.id),
        row.dealing.personId,
        row.lines.map((line) => line.managerId),
        0,
      );
    }
  }

  /* 2 & 4: the clearance lifecycle. */
  for (const row of report.clearanceRows) {
    if (row.state.key === 'pending-overdue') {
      askApex(
        'clearance-overdue',
        personalDealingAskSignature('clearance-overdue', row.clearance.id),
        row.clearance.personId,
        row.lines.map((line) => line.managerId),
        0,
      );
    }
    if (row.state.key === 'pending') {
      askApex(
        'clearance-requested',
        personalDealingAskSignature('clearance-requested', row.clearance.id),
        row.clearance.personId,
        row.lines.map((line) => line.managerId),
        2,
      );
    }
  }

  /* 3: an open window is its own duty-shaped condition, filed once per event. */
  for (const row of report.eventRows) {
    if (row.openOnAsOf !== true) continue;
    // A whole-market window (no declared scope) binds every listed person, so the
    // reminder goes to the apex above every live designation's lines. A scoped
    // window goes to the apex above its own scope lines.
    const anchorIds = row.scopeN
      ? list(row.event.scopeLineIds)
      : report.listedPeople.flatMap((person) => list(person.lines).map((line) => line.managerId));
    const signature = personalDealingAskSignature('window-open', row.event.id);
    const valid = [...new Set(anchorIds)].filter((lineId) => graphIds.has(lineId));
    if (!valid.length) {
      observations.push({ signature, detail: 'A closed period is open today, but none of the lines it binds resolves on the active graph, so no seat can be reminded.' });
      continue;
    }
    const apex = matrixJointApex(report.matrix, valid);
    const apexIds = list(apex?.apexIds);
    if (!apexIds.length) {
      observations.push({ signature, detail: 'A closed period is open today, but the reporting graph yields no seat above the lines it binds.' });
      continue;
    }
    for (const seatId of apexIds) {
      conditions.push({ kind: 'window-open', signature, seatIds: [seatId], dueOn: report.asOf, ambiguous: Boolean(apex?.ambiguous), urgency: 1 });
    }
  }

  conditions.sort((a, b) => a.urgency - b.urgency
    || String(a.signature).localeCompare(String(b.signature))
    || String(a.seatIds[0]).localeCompare(String(b.seatIds[0])));
  return { conditions, observations };
}

/**
 * `RULE-DWL-01`. Runs on the shared spine after every commit that is not its own
 * automation output, and on the explicit scan. Pause-governed on every path.
 */
export function personalDealingRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(DWL_EVENT_PREFIX)) return [];

  const conv = normalizeDwlSettings(draft.settings || {});
  // The switch is named by its FULL literal key in the expression below because
  // the pause-permit census greps the source that reads it.
  if (conv.dwlAutoPropagate === false) return [];

  if (!list(draft.dwlDesignations).length && !list(draft.dwlDealings).length && !list(draft.dwlClearances).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];

  let report;
  try {
    report = buildPersonalDealing(draft, { now, settings: draft.settings || {}, seat: null });
  } catch {
    // An unreadable record is not a licence to ask somebody something invented.
    return [];
  }
  if (!report?.ok) return [];

  const { conditions, observations } = personalDealingConditions(report);
  const out = [];
  const idFactory = typeof ctx.idFactory === 'function' ? ctx.idFactory : (prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
  const nowIso = now.toISOString();

  const existing = indexPersonalDealingAsks(draft);
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(DWL_RULE_ID)) || ask.task.status === 'returned'));
      if (answered) continue;
      if (issued >= ASKS_PER_COMMIT) { deferred += 1; continue; }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip(TITLES[condition.kind] || 'A dated act is owed on the personal-dealing register', 200),
        expectedOutcome: clip(OUTCOMES[condition.kind] || 'Open the personal-dealing register (#/personal-dealing).', 2000),
        authority: 'act-inform',
        support: `Issued by ${DWL_RULE_ID} from the personal-dealing register (#/personal-dealing). It reads declared designations, closed periods, clearance requests, independent decisions and executed dealings only; it is not a finding about anyone and it is not a rating of anyone.`,
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
        ruleId: DWL_RULE_ID,
        summary: clip(condition.signature, 240),
      }, ctx.linkCtx || {});
      covered.add(key);
      issued += 1;
      noteEffect(ctx, out, 'delegated', 'delegation', taskId, `${TITLES[condition.kind] || 'Filed a personal-dealing ask.'} Due ${condition.dueOn}.`);
    }
  }

  // Identity-free observations: one marker per signature, never repeated.
  if (observations.length) {
    draft.dwlMarkers = Array.isArray(draft.dwlMarkers) ? draft.dwlMarkers : [];
    const have = new Set(draft.dwlMarkers.map((row) => row && row.key));
    let wrote = 0;
    for (const observation of observations) {
      if (have.has(observation.signature)) continue;
      draft.dwlMarkers.push({
        key: observation.signature,
        at: nowIso,
        ruleId: DWL_RULE_ID,
        kind: DWL_MARKER_KIND,
        detail: clip(observation.detail, 400),
      });
      have.add(observation.signature);
      wrote += 1;
    }
    if (wrote) noteEffect(ctx, out, 'observed', 'workspace', DWL_ROUTE, `${wrote} condition(s) could not be asked of any seat and were recorded as identity-free observations.`);
  }

  if (deferred) {
    noteEffect(ctx, out, 'deferred', 'workspace', DWL_ROUTE, `${deferred} personal-dealing ask(s) were deferred (cap ${ASKS_PER_COMMIT} per commit); they follow on the next write or scan.`);
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
    task.completionNote = clip(`${DWL_RULE_ID}: the condition this ask reported is no longer on the record. Closed by the register, not by a human answer.`, 300);
    task.updatedAt = nowIso;
    noteEffect(ctx, out, 'closed', 'delegation', task.id, 'The personal-dealing condition cleared; the register closed its own ask.');
  }

  return out;
}

personalDealingRule.id = 'personalDealingRule';

export default personalDealingRule;
