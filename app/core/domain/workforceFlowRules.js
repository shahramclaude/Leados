/**
 * app/core/domain/workforceFlowRules.js — RULE-WFS-01, the Workforce Stock-Flow
 * Plan's rule on the shared post-commit spine (ADR-0184).
 *
 * THE DUTY IT PERFORMS. A projection is a property of the stock — it can be
 * WITHHELD, and the most common reason it is withheld is that nobody ever
 * recorded a move. An empty move ledger does not mean nobody was promoted; it
 * means no history was ever written down, and the workspace can only say so once.
 * This rule is the thing that says it, to the one seat that can fix it.
 *
 * It raises at most ONE open dated ask per finding, bounded per commit:
 *
 *   (a) `history-missing`  — the workspace has a roster of a declared minimum
 *       size, no move act has ever been recorded, and the current month has
 *       begun. The ask names the consequence (every stock-flow projection is
 *       refused) and the two ways to resolve it (record the moves going
 *       forward, or declare the window empty deliberately). Nobody is accused
 *       of not trusting the tool: the ask is about the RECORD, not the person.
 *
 *   (b) `target-missing`  — the projection is printable but nobody has declared
 *       an intended shape, so the comparison claim is refused. The ask the chief
 *       gets is: declare the headcount you intend to hold at each level by the
 *       horizon, or state plainly that the projection should be read with no
 *       comparison at all.
 *
 *   (c) `exposure-thin`  — a level the projection depends on has moves but not
 *       enough exposure for a rate, so the projection silently carries that
 *       level's headcount unchanged. It is ONE ask naming the count of thin
 *       cells, because N asks about N levels would be a wall of noise about one
 *       arithmetic problem.
 *
 * It closes its own asks when the finding clears, never writes a move or a
 * target on a human's behalf, never estimates a rate to fill a hole, and is
 * inert in a workspace that has declared no people at all.
 *
 * It is bounded (4 asks per commit, the rest counted), idempotent per finding
 * signature, pausable through `workforceFlowAutoPropagate`, and reads the WHOLE
 * workspace on every trigger because a projection is a stock property: a seat
 * that cannot see the finding is exactly the failure the mandate forbids.
 */
import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildMatrix, matrixJointApex } from './matrix.js';
import { buildWorkforceFlow } from './workforceFlow.js';
import { normalizeWorkforceFlowSettings } from './workforceFlowSchema.js';
import {
  WORKFORCE_FLOW_EVENTS,
  WORKFORCE_FLOW_LIMITS,
  WORKFORCE_FLOW_RULE_ID,
  WORKFORCE_FLOW_SETTING_KEYS,
} from './workforceFlowRegistry.js';

/**
 * Events that can change the answer: a recorded move or target, a convention
 * change, an explicit scan, and anything that moves the POPULATION the stock is
 * measured over — a joiner, a leaver, an archive/restore or a level change.
 */
export const WORKFORCE_FLOW_TRIGGER_EVENTS = new Set([
  WORKFORCE_FLOW_EVENTS.MOVE_RECORDED,
  WORKFORCE_FLOW_EVENTS.MOVE_WITHDRAWN,
  WORKFORCE_FLOW_EVENTS.TARGET_DECLARED,
  WORKFORCE_FLOW_EVENTS.TARGET_RETIRED,
  WORKFORCE_FLOW_EVENTS.CONVENTIONS,
  WORKFORCE_FLOW_EVENTS.SCAN,
  'person.added',
  'person.updated',
  'person.archived',
  'person.restored',
  'departure.recorded',
]);

export const WORKFORCE_FLOW_CLOSED_PREFIX = `Closed by ${WORKFORCE_FLOW_RULE_ID}:`;

const clip = (value, n = 280) => String(value || '').trim().slice(0, n);

function effect(ctx, out, action, summary) {
  const entry = { ruleId: WORKFORCE_FLOW_RULE_ID, action, targetType: 'workspace', targetId: 'workforce-flow', summary: clip(summary) };
  ctx.recordEffect?.({ ...entry, rule: WORKFORCE_FLOW_RULE_ID, entity: entry.targetType, entityId: entry.targetId });
  out.push(entry);
}

export function workforceFlowRule(draft, ctx = {}) {
  const eventType = ctx.event?.type || '';
  if (!WORKFORCE_FLOW_TRIGGER_EVENTS.has(eventType)) return [];
  const K = WORKFORCE_FLOW_SETTING_KEYS;
  const conv = normalizeWorkforceFlowSettings(draft.settings || {});
  if (eventType !== WORKFORCE_FLOW_EVENTS.SCAN && !conv[K.autoPropagate]) return [];

  // Inert in a workspace with nobody on the roster: there is no stock to plan.
  const people = (Array.isArray(draft.people) ? draft.people : []).filter((p) => p && p.status !== 'archived');
  if (!people.length) return [];

  const at = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(at) || at.toISOString().slice(0, 10);
  const nowIso = ctx.nowIso || at.toISOString();
  const idFactory = ctx.idFactory || ((prefix) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`);

  // The rule reads the WHOLE workspace, with the operator view on settings: a
  // stock-flow finding is owed to whoever is signed in, not to the seat that
  // happens to be selected when an unrelated write triggers it.
  const operator = { ...(draft.settings || {}), activeSeatId: null };
  const view = { ...draft, settings: operator };
  const matrix = buildMatrix(view, { now: at, settings: operator });
  const board = buildWorkforceFlow(view, { now: at, settings: operator, detailLevel: 'full' });

  // Who owns a workspace-wide planning finding? The single seat above every
  // reporting line — the same apex the other matrix-wide rules use. Where there
  // is no unique apex the finding is OBSERVED and nobody is substituted.
  const apex = matrixJointApex(matrix, [...matrix.roster.keys()]);
  const ownerState = apex.isLeaderOnly ? 'leader-held'
    : apex.unique ? (matrix.roster.has(apex.apexId) ? 'unique' : 'off-roster')
      : 'ambiguous';
  const ownerId = ownerState === 'unique' ? apex.apexId : (ownerState === 'leader-held' ? LEADER_ID : null);
  const ownerName = ownerId === LEADER_ID
    ? (matrix.nodes.get(LEADER_ID)?.name || 'the workspace leader')
    : (ownerId ? (matrix.nodes.get(ownerId)?.name || ownerId) : null);

  /* ------------------------------------------------------------- findings */
  const findings = [];
  const minRoster = 3;
  if (board.acts.totalN === 0 && people.length >= minRoster) {
    findings.push({
      key: 'history-missing',
      signature: `0|${people.length}`,
      summary: 'No workforce move has ever been recorded, so every stock-flow projection is refused.',
      title: 'Record the workforce moves, or declare the window deliberately empty',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, record the transitions this organisation can still date — promotions, hires, exits — with a manager entry on Workforce → Stock-flow, or state plainly that no history before today can be reconstructed. Until then this workspace can say what each person’s level is today and nothing about how anybody reached it, so a hiring freeze, a promotion round or an attrition spike cannot be priced against the shape it produces. ${people.length} active people are on the roster. Nothing was inferred from today’s levels and no rate was estimated from a snapshot that was never taken.`,
    });
  }
  if (board.acts.totalN > 0 && board.claims.projected && !board.claims.compared) {
    findings.push({
      key: 'target-missing',
      signature: `target|${board.projectedTotal}|${board.horizon.quarters}`,
      summary: 'The projection is printable but no intended shape has been declared, so the comparison is refused.',
      title: 'Declare the headcount you intend to hold at each level by the horizon',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, declare the intended headcount per level at ${board.horizon.endsOn} in Workforce → Stock-flow, or state that the projection is to be read with no comparison. The projection currently prints ${board.projectedTotal} people at the horizon; without a declared shape there is nothing to compare it with, and the comparison claim stays refused rather than being made against the projection itself.`,
    });
  }
  if (board.claims.estimated && board.rates.withheldN > 0) {
    findings.push({
      key: 'exposure-thin',
      signature: `thin|${board.rates.withheldN}|${board.rates.minExposure}`,
      summary: `${board.rates.withheldN} level(s) carry too little exposure for a rate, so their headcount is carried forward unchanged.`,
      title: 'Decide whether the rate-less levels should be planned at all',
      expectedOutcome: `By ${addDays(today, conv[K.askDueDays])}, either record the moves that would give ${board.rates.withheldN} level(s) enough exposure at the declared floor of ${board.rates.minExposure} person-month(s), or declare that those levels are to be planned flat at their current headcount. The projection carries their headcount unchanged today, which is a stated assumption on the row — not a rate — and the comparison against the declared shape is measured only where a rate exists.`,
    });
  }

  draft.workforceFlowMarkers = Array.isArray(draft.workforceFlowMarkers) ? draft.workforceFlowMarkers : [];
  draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
  const out = [];
  let closed = 0;
  let issued = 0;
  let deferred = 0;
  let observed = 0;

  /* ------------------------------------------- 1. close asks that have cleared */
  const liveKeys = new Set(findings.map((f) => `ask|${f.key}|${f.signature}`));
  const activeIds = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
  for (const marker of draft.workforceFlowMarkers) {
    if (marker?.kind !== 'ask' || !marker.taskId) continue;
    if (!activeIds.has(marker.taskId)) continue;
    const stillLive = [...liveKeys].some((k) => k === marker.key);
    if (stillLive) continue;
    const task = draft.delegations.find((d) => d && d.id === marker.taskId);
    if (!task) continue;
    task.status = 'done';
    task.completedOn = today;
    task.completionNote = `${WORKFORCE_FLOW_CLOSED_PREFIX} the stock-flow finding this ask named has cleared.`;
    task.updatedAt = nowIso;
    closed += 1;
  }

  /* -------------------------------------------------- 2. issue owed findings */
  const open = new Set(draft.workforceFlowMarkers
    .filter((m) => m?.kind === 'ask' && m.taskId && activeIds.has(m.taskId))
    .map((m) => m.key));
  for (const finding of findings) {
    const key = clip(`ask|${finding.key}|${finding.signature}`, 320);
    if (open.has(key)) continue;
    if (draft.workforceFlowMarkers.some((m) => m?.key === key)) continue;
    if (!ownerId) {
      // No single seat can own a stock-wide plan. Observed once, never routed to
      // an arbitrary manager who happens to be reachable.
      const obsKey = clip(`obs|${finding.key}|${finding.signature}|${ownerState}`, 320);
      if (!draft.workforceFlowMarkers.some((m) => m?.key === obsKey)) {
        draft.workforceFlowMarkers.push({
          key: obsKey, kind: 'observation', subject: finding.key, taskId: null, state: ownerState,
          summary: `No ask issued: the owning seat is ${ownerState}. Nobody was substituted.`, at: nowIso,
        });
        observed += 1;
      }
      continue;
    }
    if (issued >= WORKFORCE_FLOW_LIMITS.asksPerCommit) { deferred += 1; continue; }
    const taskId = idFactory('dlg');
    draft.delegations.unshift({
      id: taskId,
      personId: ownerId,
      title: clip(finding.title, 200),
      expectedOutcome: clip(finding.expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${WORKFORCE_FLOW_RULE_ID}; it asks about the RECORD and the declared shape, never about a person.`,
      delegatedOn: today,
      dueOn: addDays(today, conv[K.askDueDays]),
      status: 'active',
      checkins: [],
      completedOn: null,
      completionNote: '',
      returnedOn: null,
      returnReason: '',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    // Provenance: the ask concerns the reporting graph as a whole, so its typed
    // edge runs to the owning seat and rolls up the owner's own span. No named
    // person appears in the link, because no individual is the subject.
    const linkCtx = { idFactory, todayStr: today, nowIso };
    ensureEntityLink(draft, {
      sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ownerId,
      relation: 'issues-obligation', ruleId: WORKFORCE_FLOW_RULE_ID, summary: finding.summary,
    }, linkCtx);
    for (const ancestorId of [...(matrix.nodes.get(ownerId)?.ancestors || [])].sort()) {
      if (!matrix.roster.has(ancestorId)) continue;
      ensureEntityLink(draft, {
        sourceType: 'delegation', sourceId: taskId, targetType: 'person', targetId: ancestorId,
        relation: 'rolls-up-to', ruleId: WORKFORCE_FLOW_RULE_ID,
        summary: 'A workforce stock-flow ask rolls up to this span.',
      }, linkCtx);
    }
    draft.workforceFlowMarkers.push({ key, kind: 'ask', subject: finding.key, taskId, state: 'open', summary: `Issued stock-flow ask ${taskId} to ${ownerName}.`, at: nowIso });
    issued += 1;
  }

  /* ------------------------- 3. bound the marker ledger, keeping open asks */
  const cap = WORKFORCE_FLOW_LIMITS.markers;
  if (draft.workforceFlowMarkers.length > cap) {
    const stillActive = new Set(draft.delegations.filter((d) => d && d.status === 'active').map((d) => d.id));
    let excess = draft.workforceFlowMarkers.length - cap;
    draft.workforceFlowMarkers = draft.workforceFlowMarkers.filter((m) => {
      if (excess > 0 && !(m?.kind === 'ask' && stillActive.has(m.taskId))) { excess -= 1; return false; }
      return true;
    });
  }

  if (closed) effect(ctx, out, 'completed', `Closed ${closed} stock-flow ask(s) whose finding cleared.`);
  if (issued) effect(ctx, out, 'delegated', `Issued ${issued} workforce stock-flow ask(s).`);
  if (observed) effect(ctx, out, 'observed', `Recorded ${observed} stock-flow finding(s) with no single owning seat; nobody was substituted.`);
  if (deferred) effect(ctx, out, 'deferred', `${deferred} stock-flow ask(s) were not issued in this commit (cap ${WORKFORCE_FLOW_LIMITS.asksPerCommit}); they follow on the next write.`);
  return out;
}
workforceFlowRule.id = 'workforceFlowRule';
workforceFlowRule.triggers = WORKFORCE_FLOW_TRIGGER_EVENTS;

export default workforceFlowRule;
