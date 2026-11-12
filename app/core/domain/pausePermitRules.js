/**
 * app/core/domain/pausePermitRules.js — RULE-PMP-01, the Automation Pause Permit
 * Register's rule on the shared post-commit spine (ADR-0182).
 *
 * THE DUTY IT PERFORMS. A switch can be paused without a permit — that is
 * precisely the hole. Nobody is told, the control is silent, and the only trace
 * is evicted from a capped event log. This rule is the thing that notices.
 *
 * For every switch that is OFF with no permit in force, whose off-period has
 * stood past the declared grace (or whose start cannot be proven at all, once
 * the grace window has clearly elapsed since the earliest dated evidence), it
 * keeps at most ONE open dated ask, in front of the single seat that can
 * authorise a workspace-wide pause:
 *
 *   - authorise it properly (a reason, a compensating measure and an end date),
 *   - or bring the switch back up.
 *
 * It never flips a switch, never writes a permit on a human's behalf, and never
 * revokes one. It closes its own ask when the pause is permitted or the switch
 * comes back on. Where no single seat can authorise — a workspace whose
 * reporting graph has no unique apex — the finding is recorded as an
 * observation and nobody is substituted.
 *
 * It is bounded (6 asks per commit, the rest counted), idempotent per pause
 * signature, pausable through `pausePermitAutoPropagate`, and inert in a
 * workspace whose every switch is on and which holds no permit.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildPausePermits } from './pausePermits.js';
import { normalizePausePermitSettings } from './pausePermitSchema.js';
import {
  PAUSE_PERMIT_EVENTS,
  PAUSE_PERMIT_LIMITS,
  PAUSE_PERMIT_RULE_ID,
  PAUSE_PERMIT_SETTING_KEYS,
} from './pausePermitRegistry.js';

/**
 * Events that can change the answer. `settings.updated` is the one that matters
 * most: it is what a bare pause writes, and catching it here is how a pause with
 * no permit becomes visible in the SAME commit that silenced the control rather
 * than at some later audit.
 */
export const PAUSE_PERMIT_TRIGGER_EVENTS = new Set([
  'settings.updated',
  PAUSE_PERMIT_EVENTS.REQUESTED,
  PAUSE_PERMIT_EVENTS.REVOKED,
  PAUSE_PERMIT_EVENTS.SCAN,
  PAUSE_PERMIT_EVENTS.CONVENTIONS,
  // The authorising seat can move: a reorganisation, a person leaving or
  // returning changes who the one seat above every line is.
  'matrix.line.declared',
  'matrix.line.ended',
  'person.updated',
  'person.archived',
  'person.restored',
]);

export const PAUSE_PERMIT_CLOSED_PREFIX = `Closed by ${PAUSE_PERMIT_RULE_ID}:`;

const clip = (value, n = 280) => String(value || '').trim().slice(0, n);

function effect(ctx, out, action, summary) {
  const entry = { ruleId: PAUSE_PERMIT_RULE_ID, action, targetType: 'workspace', targetId: 'pause-permits', summary: clip(summary) };
  ctx.recordEffect?.({ ...entry, rule: PAUSE_PERMIT_RULE_ID, entity: entry.targetType, entityId: entry.targetId });
  out.push(entry);
}

function askText(row, { dueOn, escalateAfterDays, authoriserName }) {
  const reach = row.reachesMatrix
    ? ` ${row.reachRule} reads the reporting graph, so work that would have reached a second line was not issued on an ordinary write while it was silent.`
    : '';
  const since = row.offDays === null
    ? 'The record cannot date the start of the pause: no surviving permit names this switch, and the event log that would have held the flip is capped and evicted.'
    : `It has stood off for ${row.offDays} day(s), past the declared grace of ${escalateAfterDays}.`;
  return {
    title: `Authorise or end the pause of ${row.key}`,
    expectedOutcome: `By ${dueOn}, either grant a dated permit for ${row.key} (a written reason, a compensating measure and an end date) or bring the switch back on. ${since}${reach} This is ${authoriserName || 'the one seat above every reporting line'}; nobody else in this workspace can authorise a workspace-wide pause. Nothing was switched automatically and no permit was written on your behalf.`,
    summary: 'An automatic control is silenced with no permit anybody can point at.',
  };
}

export function pausePermitRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!PAUSE_PERMIT_TRIGGER_EVENTS.has(eventType)) return [];
  const K = PAUSE_PERMIT_SETTING_KEYS;
  const conv = normalizePausePermitSettings(draft.settings || {});
  if (eventType !== PAUSE_PERMIT_EVENTS.SCAN && !conv[K.autoPropagate]) return [];

  // Inert until there is something to govern: a workspace with every switch on
  // and no permit has no silence and no authority to read.
  const hasPermits = Array.isArray(draft.pausePermits) && draft.pausePermits.length > 0;
  const hasOwnAsk = Array.isArray(draft.pausePermitMarkers) && draft.pausePermitMarkers.some((m) => m?.kind === 'ask' && m.taskId);
  const hasOff = Object.keys(draft.settings || {}).some((key) => /^[a-z][A-Za-z0-9]*Auto[A-Z][a-z]+$/.test(key) && draft.settings[key] === false);
  if (!hasPermits && !hasOwnAsk && !hasOff) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  // The rule reads the WHOLE workspace: a silenced control is owed to whoever is
  // signed in, and a seat that cannot see it is exactly the matrix failure.
  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const report = buildPausePermits(view, { now: at, settings: operator, matrix });

  const apex = matrixJointApex(matrix, [...matrix.roster.keys()]);
  const ownerState = apex.isLeaderOnly ? 'leader-held'
    : apex.unique ? (matrix.roster.has(apex.apexId) ? 'unique' : 'off-roster')
      : 'ambiguous';
  const ownerId = ownerState === 'unique' ? apex.apexId : null;
  const ownerName = ownerId ? (matrix.nodes.get(ownerId)?.name || ownerId) : null;

  // The findings: an unpermitted or expired pause that has outlived the grace.
  // An unprovable start is escalated only once the grace has elapsed since the
  // earliest dated evidence the record still holds, so a freshly imported file
  // is not accused in its first commit.
  const owed = [];
  const unowned = [];
  for (const row of report.switches) {
    if (row.stateKey !== 'unpermitted' && row.stateKey !== 'expired') continue;
    const due = row.pastGrace === true;
    if (!due) continue;
    if (ownerState === 'unique' && ownerId) owed.push(row);
    else unowned.push(row);
  }

  draft.pausePermitMarkers = Array.isArray(draft.pausePermitMarkers) ? draft.pausePermitMarkers : [];
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const out = [];
  let closed = 0;
  let issued = 0;
  let deferred = 0;
  let observed = 0;

  // The signature of a pause is the switch plus the state it is in. A switch
  // that goes from `unpermitted` to `expired` is a DIFFERENT finding — the
  // authority ran out while it stayed off — and is asked about once more.
  const signatureOf = (row) => `${row.key}|${row.stateKey}|${row.permitN}`;

  // 1. Close the rule's own asks whose pause is gone, permitted, or the owner moved.
  const open = new Set();
  for (const marker of draft.pausePermitMarkers) {
    if (marker?.kind !== 'ask' || !marker.taskId) continue;
    const task = draft.delegations.find((d) => d && d.id === marker.taskId && d.status === 'active');
    if (!task) continue;
    const row = report.switches.find((r) => r.key === marker.subject);
    const stillOwed = row && (row.stateKey === 'unpermitted' || row.stateKey === 'expired') && row.pastGrace === true;
    if (stillOwed && ownerId && task.personId === ownerId) { open.add(marker.subject); continue; }
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `${PAUSE_PERMIT_CLOSED_PREFIX} the pause is permitted, the switch came back up, or the seat that can authorise it changed.`;
    task.updatedAt = nowIso;
    closed += 1;
  }

  // 2. Issue at most one ask per owed switch, bounded per commit.
  const dueOn = addDays(today, conv[K.askDueDays]);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  for (const row of owed.sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
    if (open.has(row.key)) continue;
    const key = clip(`ask|${row.key}|${signatureOf(row)}`, 320);
    if (draft.pausePermitMarkers.some((m) => m?.key === key)) continue;
    if (issued >= PAUSE_PERMIT_LIMITS.asksPerCommit) { deferred += 1; continue; }
    const text = askText(row, { dueOn, escalateAfterDays: conv[K.escalateAfterDays], authoriserName: ownerName });
    const taskId = idFactory('dlg');
    draft.delegations.unshift({
      id: taskId,
      personId: ownerId,
      title: clip(text.title, 200),
      expectedOutcome: clip(text.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${PAUSE_PERMIT_RULE_ID}; this governs the authority over a silenced control, never a judgement about why somebody paused it.`,
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
    // The ask is ABOUT a settings key, not a person; the only typed edge is the
    // one that carries it up every span the authorising seat sits in.
    for (const ancestorId of [...(matrix.nodes.get(ownerId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: PAUSE_PERMIT_RULE_ID, summary: 'A pause-authority ask rolls up to this span.',
      }, linkCtx);
    }
    draft.pausePermitMarkers.push({ key, kind: 'ask', subject: row.key, taskId, state: row.stateKey, summary: `Issued pause-authority ask ${taskId}.`, at: nowIso });
    issued += 1;
  }
  // `ensureEntityLink` stays imported and used above; nothing else writes links.

  // 3. A pause with no single authorising seat is observed once, never re-routed.
  for (const row of unowned) {
    const key = clip(`obs|${row.key}|${signatureOf(row)}|${ownerState}`, 320);
    if (draft.pausePermitMarkers.some((m) => m?.key === key)) continue;
    draft.pausePermitMarkers.push({
      key, kind: 'observation', subject: row.key, taskId: null, state: ownerState,
      summary: `No ask issued: the seat that can authorise a workspace-wide pause is ${ownerState}. Nobody was substituted.`, at: nowIso,
    });
    observed += 1;
  }

  // 4. Bound the marker ledger without losing track of an ask that is still open.
  const cap = PAUSE_PERMIT_LIMITS.markers;
  if (draft.pausePermitMarkers.length > cap) {
    const activeIds = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
    let excess = draft.pausePermitMarkers.length - cap;
    draft.pausePermitMarkers = draft.pausePermitMarkers.filter((m) => {
      if (excess > 0 && !(m?.kind === 'ask' && activeIds.has(m.taskId))) { excess -= 1; return false; }
      return true;
    });
  }

  if (closed) effect(ctx, out, 'completed', `Closed ${closed} pause-authority ask(s) whose pause was permitted or ended.`);
  if (issued) effect(ctx, out, 'delegated', `Issued ${issued} pause-authority ask(s), due ${dueOn}.`);
  if (observed) effect(ctx, out, 'observed', `Recorded ${observed} silenced control(s) with no single authorising seat; nobody was substituted.`);
  if (deferred) effect(ctx, out, 'deferred', `${deferred} pause-authority ask(s) were not issued in this commit (cap ${PAUSE_PERMIT_LIMITS.asksPerCommit}); they follow on the next write.`);
  return out;
}
pausePermitRule.id = 'pausePermitRule';
pausePermitRule.triggers = PAUSE_PERMIT_TRIGGER_EVENTS;

export default pausePermitRule;
