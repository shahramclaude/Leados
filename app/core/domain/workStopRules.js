/**
 * app/core/domain/workStopRules.js — `RULE-SWP-01` on the shared post-commit
 * spine. It asks the complete, frozen, right-capable joint-apex set to review
 * an overdue hold; it never clears or restarts work.
 */

import { dayKey, addDays } from '../time.js';
import { buildMatrix } from './matrix.js';
import { ensureEntityLink } from './automation.js';
import { buildWorkStop, resolveWorkStopAuthority, workStopParticipants } from './workStop.js';
import { normalizeWorkStopSettings, normalizeWorkStops } from './workStopSchema.js';
import { SWP_LIMITS as L, SWP_MARKER_KIND, SWP_RULE_ID, SWP_ROUTE, SWP_SETTING_KEYS, SWP_EVENT_PREFIX } from './workStopRegistry.js';
import { parseSwpAskSummary, swpAskSummary, swpMitigationSignature, swpReviewSignature } from './workStopMath.js';

const TASKS_PER_COMMIT = L.asksPerCommit;
const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: SWP_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: SWP_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${SWP_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

export function indexWorkStopAsks(state) {
  const tasks = new Map(list(state?.delegations).map((row) => [String(row?.id || ''), row]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== SWP_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseSwpAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

export function workStopConditions(report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  for (const stop of list(report?.stopsAll)) {
    if (stop.state === 'restarted' || !stop.overdue) continue;
    if (stop.state === 'record-integrity-defect') {
      observations.push({
        key: `swp1|integrity|${stop.id}`,
        detail: 'An overdue stop-work record contains malformed or role-invalid acts. No follow-up was addressed to a person; preserve the hold and use the supported data-recovery process.',
      });
      continue;
    }
    const current = matrix ? resolveWorkStopAuthority(matrix, workStopParticipants(stop)) : { ok: false, reason: 'matrix-unreadable', authorityIds: [] };
    const same = current.ok && current.authorityIds.length === stop.authorityIds.length
      && current.authorityIds.every((id, index) => id === stop.authorityIds[index]);
    const authorityResolved = same && stop.authorityMatches && stop.authorityIds.length > 0;
    const reviewSignature = swpReviewSignature(stop.id, stop.currentMitigation?.id || null);

    if (!authorityResolved) {
      observations.push({
        key: `swp1|no-authority|${reviewSignature}`,
        detail: 'An overdue stop-work hold has no current, right-capable joint authority identical to the one frozen when it was declared. Nobody was asked or substituted; the hold remains in force.',
      });
    }

    // A missing work-lead control is a different owed act from independent
    // clearance. Ask only the named, active work lead; never infer a substitute.
    if (!stop.currentMitigation) {
      if (matrix?.nodes?.has(stop.workLeadId)) {
        conditions.push({
          kind: 'stop-work-mitigation-overdue',
          signature: swpMitigationSignature(stop.id),
          seatId: stop.workLeadId,
          dueOn: addDays(today, 1),
          stopId: stop.id,
        });
      } else {
        observations.push({
          key: `swp1|missing-work-lead|${stop.id}`,
          detail: 'An overdue stop-work hold has no active named work lead who can record the immediate control. Nobody was substituted; the hold remains in force.',
        });
      }
      continue;
    }
    if (!authorityResolved) continue;

    // A matrix tie is a set of duties, not a winner. Keep asking only apexes
    // without an immutable decision on this exact mitigation round. Once a
    // human decision is recorded, its obligation closes; only new mitigation
    // creates a new review signature. An operator key is never automated.
    for (const seatId of stop.authorityIds) {
      const decided = stop.visibleActions.some((act) => act.valid && act.kind === 'assessment'
        && act.actorId === seatId && act.round === stop.currentRound
        && act.mitigationId === stop.currentMitigation.id);
      if (decided) continue;
      conditions.push({
        kind: 'stop-work-review-overdue',
        signature: reviewSignature,
        seatId,
        dueOn: addDays(today, 1),
        stopId: stop.id,
      });
    }
  }
  return { conditions, observations };
}

export function workStopRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(SWP_EVENT_PREFIX)) return [];
  const conventions = normalizeWorkStopSettings(draft.settings || {});
  if (conventions[SWP_SETTING_KEYS.autoPropagate] === false) return [];
  if (!normalizeWorkStops(draft.workStops, []).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();
  const settings = { ...(draft.settings || {}), activeSeatId: null };
  let report;
  try {
    report = buildWorkStop(draft, { now, settings, seat: null, includeAll: true });
  } catch {
    return [];
  }
  let matrix = null;
  try {
    // The rule re-reads the live reporting DAG from the draft being committed.
    // It never trusts an action's cached recipient. A failed graph is a marker,
    // not permission to choose a manager.
    matrix = buildMatrix(draft, { now, settings });
  } catch { /* no authority will be resolved below; the hold stays in force */ }
  const { conditions, observations } = workStopConditions(report, { today, matrix });
  const existing = indexWorkStopAsks(draft);
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const current = new Set(conditions.map((row) => openKey(row.signature, row.seatId)));
  const covered = new Set();
  const effects = [];

  for (const ask of existing) {
    const key = openKey(ask.signature, ask.seatId);
    if (current.has(key) && ask.task?.personId === ask.seatId && ask.task.status === 'active') {
      covered.add(key);
      continue;
    }
    if (!ask.task || ask.task.status !== 'active') continue;
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = current.has(key)
      ? `${SWP_RULE_ID}: the joint addressee changed; the old request was closed rather than left on a seat that no longer holds it.`
      : `${SWP_RULE_ID}: the stop-work review condition was re-read and no longer stands.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, effects, 'completed', 'delegation', ask.task.id, 'Closed a stale stop-work review ask; the ledger remains the source of the decision.');
  }

  draft.workStopMarkers = list(draft.workStopMarkers).slice();
  for (const observation of observations) {
    if (draft.workStopMarkers.some((marker) => marker?.key === observation.key)) continue;
    draft.workStopMarkers.push({ key: observation.key, at: nowIso, ruleId: SWP_RULE_ID, kind: SWP_MARKER_KIND, detail: clip(observation.detail, 360) });
    if (draft.workStopMarkers.length > L.markers) draft.workStopMarkers.splice(0, draft.workStopMarkers.length - L.markers);
    noteEffect(ctx, effects, 'observed', 'workspace', SWP_ROUTE, observation.detail);
  }

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    const key = openKey(condition.signature, condition.seatId);
    if (covered.has(key)) continue;
    const humanAnswered = existing.some((ask) => ask.signature === condition.signature && ask.seatId === condition.seatId
      && ask.task && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(SWP_RULE_ID)) || ask.task.status === 'returned'));
    if (humanAnswered) continue;
    if (issued >= TASKS_PER_COMMIT) { deferred += 1; continue; }
    const taskId = typeof ctx.idFactory === 'function' ? ctx.idFactory('dlg') : `swp-dlg-${issued + 1}`;
    const mitigationOwed = condition.kind === 'stop-work-mitigation-overdue';
    const title = mitigationOwed
      ? 'A work control is owed in the stop-work register'
      : 'An independent review is owed in the stop-work register';
    const expectedOutcome = mitigationOwed
      ? 'Open the Stop-Work Authority & Safe Restart Ledger (#/work-stop) and record the immediate work control plus the physical or documentary evidence checked. The record cannot verify a site control, and it never restarts work.'
      : 'Open the Stop-Work Authority & Safe Restart Ledger (#/work-stop) and independently assess the latest recorded mitigation. Record `safe` or `hold` in that register. This task contains no work area, person, hazard or control text, and it does not restart work.';
    draft.delegations = list(draft.delegations).slice();
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(title, 200),
      expectedOutcome: clip(expectedOutcome, 2000),
      authority: 'act-inform',
      support: `Issued by ${SWP_RULE_ID}; the human-declared hold remains active until its work-control evidence, every joint-apex clearance and an affected-operator key are recorded.`,
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
      sourceType: 'person', sourceId: condition.seatId,
      targetType: 'delegation', targetId: taskId,
      relation: 'issues-obligation', ruleId: SWP_RULE_ID,
      summary: swpAskSummary(condition.signature),
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso });
    covered.add(key);
    issued += 1;
    noteEffect(ctx, effects, 'delegated', 'delegation', taskId, mitigationOwed
      ? 'Asked the named work lead to record work-control evidence for an overdue hold.'
      : 'Asked a right-capable joint apex for an independent review of an overdue stop-work hold.');
  }
  if (deferred) noteEffect(ctx, effects, 'deferred', 'workspace', SWP_ROUTE, `${deferred} stop-work follow-up request(s) were deferred by the per-commit cap; the active holds remain visible on #/work-stop.`);
  return effects;
}

export const WORK_STOP_PAUSE_SWITCH = SWP_SETTING_KEYS.autoPropagate;
