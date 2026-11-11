/**
 * app/core/domain/workTurnRules.js — RULE-NPW-01, the Non-Promotable Work Turn
 * Ledger's rule on the shared post-commit spine (ADR-0181).
 *
 * It reads the ledger with the whole-workspace operator view and, for every
 * finding with ONE owning seat:
 *
 *   pool   a manager's pool concentrates its non-promotable asks on one person
 *          → one dated rotation ask to THAT manager;
 *   stack  a person on two or more lines is within a fair turn on each and over
 *          it in sum → one dated ask to the single seat above every line they
 *          hold (the joint apex of the reporting graph).
 *
 * At most one open ask per finding subject; at most one ask ever per finding
 * signature (the exact set of asks that produced it), so a human who closed the
 * ask is not asked again until the pattern CONTINUES. It closes its own ask when
 * the reading clears. An owner that is the workspace leader, off the roster, or
 * tied between two incomparable seats is recorded as an observation; nobody is
 * substituted. It reassigns nothing, classifies nothing and rates nobody.
 *
 * Inert until the first classification act exists, and pausable through
 * `workTurnAutoPropagate` (an explicit scan still runs).
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import { buildWorkTurns } from './workTurns.js';
import { normalizeWorkTurnSettings } from './workTurnSchema.js';
import {
  WORK_TURN_EVENTS,
  WORK_TURN_LIMITS,
  WORK_TURN_RULE_ID,
  WORK_TURN_SETTING_KEYS,
} from './workTurnRegistry.js';

export const WORK_TURN_TRIGGER_EVENTS = new Set([
  WORK_TURN_EVENTS.CLASSIFIED,
  WORK_TURN_EVENTS.SCAN,
  WORK_TURN_EVENTS.CONVENTIONS,
  // Placement moves when an ask is put on a line, edited or handed back …
  'delegation.line.attributed',
  'delegation.updated',
  'delegation.returned',
  // … and pools and shares move when a reporting line does, or when a person
  // changes manager, leaves the roster or comes back.
  'matrix.line.declared',
  'matrix.line.retuned',
  'matrix.line.ended',
  'person.updated',
  'person.archived',
  'person.restored',
]);

export const WORK_TURN_CLOSED_PREFIX = `Closed by ${WORK_TURN_RULE_ID}:`;

const clip = (value, n = 280) => String(value || '').trim().slice(0, n);

function effect(ctx, out, action, summary) {
  const entry = { ruleId: WORK_TURN_RULE_ID, action, targetType: 'workspace', targetId: 'work-turns', summary: clip(summary) };
  ctx.recordEffect?.({ ...entry, rule: WORK_TURN_RULE_ID, entity: entry.targetType, entityId: entry.targetId });
  out.push(entry);
}

function askText(finding, { dueOn, windowDays, factorPct }) {
  const who = finding.personNames.join(' and ');
  if (finding.kind === 'pool') {
    return {
      title: `Rotate the next non-promotable ask in your team: ${finding.carriedN} of ${finding.totalN} went to ${who}`,
      expectedOutcome: `By ${dueOn}, decide who takes the next piece of work that has to be done and advances nobody. In the last ${windowDays} days ${who} carried ${finding.carriedN} of the ${finding.totalN} non-promotable asks that came down your line — at least ${factorPct}% of a share-weighted fair turn. The ledger names who is next in turn (#/matrix?panel=turns). No ask was reassigned automatically.`,
      summary: 'A manager’s pool concentrates its non-promotable asks on one person.',
    };
  }
  return {
    title: `Rebalance ${who}’s ${finding.carriedN} non-promotable asks across reporting lines`,
    expectedOutcome: `By ${dueOn}, agree with the manager of every line ${who} holds which of them hands the next non-promotable ask to somebody else. No single line is over a fair turn. Summed across lines ${who} carries ${finding.carriedN} of the ${finding.totalN} non-promotable asks read in the last ${windowDays} days — at least ${factorPct}% of the per-person average. No ask was reassigned automatically.`,
    summary: 'A shared contributor carries a fair turn from each line and more than one in sum.',
  };
}

export function workTurnRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!WORK_TURN_TRIGGER_EVENTS.has(eventType)) return [];
  const K = WORK_TURN_SETTING_KEYS;
  const conv = normalizeWorkTurnSettings(draft.settings || {});
  if (eventType !== WORK_TURN_EVENTS.SCAN && !conv[K.autoPropagate]) return [];

  // Inert until somebody classifies an ask: no act and no open ask of its own
  // means there is nothing to read and nothing to close.
  const hasActs = Array.isArray(draft.workTurnActs) && draft.workTurnActs.length > 0;
  const hasOwnAsk = Array.isArray(draft.workTurnMarkers) && draft.workTurnMarkers.some((m) => m?.kind === 'ask' && m.taskId);
  if (!hasActs && !hasOwnAsk) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  // The rule reads the WHOLE workspace: an ask is owed whichever seat is signed in.
  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const report = buildWorkTurns(view, { now: at, settings: operator, matrix });

  const owed = new Map();
  const unowned = [];
  for (const finding of report.findings) {
    if (finding.ownerState === 'unique' && finding.ownerId) owed.set(finding.subject, finding);
    else unowned.push(finding);
  }

  draft.workTurnMarkers = Array.isArray(draft.workTurnMarkers) ? draft.workTurnMarkers : [];
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const out = [];
  let closed = 0;
  let issued = 0;
  let deferred = 0;
  let observed = 0;

  // 1. Close the rule's own asks whose finding is gone or whose owner moved.
  const open = new Set();
  for (const marker of draft.workTurnMarkers) {
    if (marker?.kind !== 'ask' || !marker.taskId) continue;
    const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
    if (!task) continue;
    const finding = owed.get(marker.subject);
    if (finding && finding.ownerId === task.personId) { open.add(marker.subject); continue; }
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `${WORK_TURN_CLOSED_PREFIX} the ledger no longer reads this finding, or the seat that owns it changed.`;
    task.updatedAt = nowIso;
    closed += 1;
  }

  // 2. Issue at most one ask per owed finding, bounded per commit.
  const dueOn = addDays(today, conv[K.askDueDays]);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  for (const subject of [...owed.keys()].sort()) {
    if (open.has(subject)) continue;
    const finding = owed.get(subject);
    const key = clip(`ask|${subject}|${finding.signature}`, 320);
    if (draft.workTurnMarkers.some((m) => m?.key === key)) continue;
    if (issued >= WORK_TURN_LIMITS.asksPerCommit) { deferred += 1; continue; }
    const text = askText(finding, { dueOn, windowDays: report.window.days, factorPct: report.factorPct });
    const taskId = idFactory('dlg');
    draft.delegations.unshift({
      id: taskId,
      personId: finding.ownerId,
      title: clip(text.title, 200),
      expectedOutcome: clip(text.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${WORK_TURN_RULE_ID}; this grades how the work was handed out, never the person who carried it.`,
      delegatedOn: today,
      dueOn,
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    for (const personId of finding.personIds) {
      ensureEntityLink(draft, {
        sourceType: 'person', sourceId: personId, targetType: 'delegation', targetId: taskId,
        relation: 'issues-obligation', ruleId: WORK_TURN_RULE_ID, summary: text.summary,
      }, linkCtx);
    }
    for (const ancestorId of [...(matrix.nodes.get(finding.ownerId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: WORK_TURN_RULE_ID, summary: 'A non-promotable work rotation ask rolls up to this span.',
      }, linkCtx);
    }
    draft.workTurnMarkers.push({ key, kind: 'ask', subject, taskId, state: finding.kind, summary: `Issued rotation ask ${taskId}.`, at: nowIso });
    issued += 1;
  }

  // 3. A finding with no single owning seat is observed once, never re-routed.
  for (const finding of unowned) {
    const key = clip(`obs|${finding.subject}|${finding.signature}|${finding.ownerState}`, 320);
    if (draft.workTurnMarkers.some((m) => m?.key === key)) continue;
    draft.workTurnMarkers.push({
      key, kind: 'observation', subject: finding.subject, taskId: null, state: finding.ownerState,
      summary: `No ask issued: the owning seat is ${finding.ownerState}. Nobody was substituted.`, at: nowIso,
    });
    observed += 1;
  }

  // 4. Bound the marker ledger without losing track of an ask that is still open.
  const cap = WORK_TURN_LIMITS.markers;
  if (draft.workTurnMarkers.length > cap) {
    const activeIds = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
    let excess = draft.workTurnMarkers.length - cap;
    draft.workTurnMarkers = draft.workTurnMarkers.filter((m) => {
      if (excess > 0 && !(m?.kind === 'ask' && activeIds.has(m.taskId))) { excess -= 1; return false; }
      return true;
    });
  }

  if (closed) effect(ctx, out, 'completed', `Closed ${closed} non-promotable work rotation ask(s) whose finding cleared.`);
  if (issued) effect(ctx, out, 'delegated', `Issued ${issued} non-promotable work rotation ask(s), due ${dueOn}.`);
  if (observed) effect(ctx, out, 'observed', `Recorded ${observed} finding(s) with no single owning seat; nobody was substituted.`);
  if (deferred) effect(ctx, out, 'deferred', `${deferred} rotation ask(s) were not issued in this commit (cap ${WORK_TURN_LIMITS.asksPerCommit}); they follow on the next write.`);
  return out;
}
workTurnRule.id = 'workTurnRule';
workTurnRule.triggers = WORK_TURN_TRIGGER_EVENTS;

export default workTurnRule;
