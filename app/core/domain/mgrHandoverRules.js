/**
 * app/core/domain/mgrHandoverRules.js — `RULE-MHH-01` on the shared post-commit
 * spine. It asks for the human keys a managerial handover owes — the outgoing
 * portfolio brief, the successor acceptance, the governor release, and the
 * frozen joint-apex review of a dispute. It never records a key itself, never
 * transfers an obligation, and never resolves a dispute.
 */

import { dayKey, addDays } from '../time.js';
import { buildMatrix } from './matrix.js';
import { ensureEntityLink } from './automation.js';
import { buildMgrHandover, resolveMgrHandoverApex } from './mgrHandover.js';
import { normalizeMgrHandoverSettings, normalizeMgrHandovers } from './mgrHandoverSchema.js';
import {
  MHH_LIMITS as L,
  MHH_MARKER_KIND,
  MHH_RULE_ID,
  MHH_ROUTE,
  MHH_SETTING_KEYS,
  MHH_EVENT_PREFIX,
} from './mgrHandoverRegistry.js';
import {
  mhhAcceptSignature,
  mhhAskSummary,
  mhhBriefSignature,
  mhhDisputeSignature,
  mhhReleaseSignature,
  parseMhhAskSummary,
} from './mgrHandoverMath.js';

const TASKS_PER_COMMIT = L.asksPerCommit;
const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: MHH_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: MHH_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({ type: 'automation.propagated', entity: targetType, entityId: targetId, summary: `[${MHH_RULE_ID}] ${clean}`.slice(0, 300) });
  }
}

export function indexMgrHandoverAsks(state) {
  const tasks = new Map(list(state?.delegations).map((row) => [String(row?.id || ''), row]));
  const asks = [];
  for (const link of list(state?.links)) {
    if (!link || link.ruleId !== MHH_RULE_ID || link.relation !== 'issues-obligation') continue;
    if (link.sourceType !== 'person' || link.targetType !== 'delegation') continue;
    const parsed = parseMhhAskSummary(link.summary);
    if (!parsed) continue;
    asks.push({ signature: parsed.signature, seatId: String(link.sourceId || ''), task: tasks.get(String(link.targetId || '')) || null });
  }
  return asks;
}

export function mgrHandoverConditions(report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  for (const handover of list(report?.handoversAll)) {
    if (handover.state === 'released' || handover.state === 'record-integrity-defect') continue;
    const roster = report?.roster || null;
    const personActive = (id) => !roster || roster.has(id);

    // 1. The outgoing portfolio brief. First-person by the departing manager;
    //    if that manager is no longer on a live line, nobody is substituted.
    if (!handover.hasBrief) {
      if (matrix?.nodes?.has(handover.departingManagerId)
        && managerIdsOfLive(matrix, handover.departingManagerId).length) {
        conditions.push({
          kind: 'handover-brief-overdue',
          signature: mhhBriefSignature(handover.id),
          seatId: handover.departingManagerId,
          dueOn: addDays(today, 1),
          handoverId: handover.id,
        });
      } else {
        observations.push({
          key: `mhh1|no-brief-author|${handover.id}`,
          detail: 'A declared managerial handover passed its planned effective date without the outgoing manager’s portfolio brief, and the outgoing manager holds no live reporting line. Nobody was substituted and no portfolio was auto-transferred; re-declare the transition against a live roster.',
        });
      }
      continue;
    }

    // 2. The successor's acceptance key.
    if (!handover.hasAcceptance && !handover.hasRelease) {
      if (personActive(handover.successorId)) {
        conditions.push({
          kind: 'handover-acceptance-overdue',
          signature: mhhAcceptSignature(handover.id),
          seatId: handover.successorId,
          dueOn: addDays(today, 1),
          handoverId: handover.id,
        });
      } else {
        observations.push({
          key: `mhh1|no-accept-author|${handover.id}`,
          detail: 'A briefed managerial handover is past its planned effective date and the named successor is no longer on the roster. No acceptance was inferred and no obligation was auto-transferred; the transition remains open.',
        });
      }
    }

    // 3. The governor's release key.
    if (handover.hasAcceptance && !handover.hasRelease) {
      if (personActive(handover.declaredById)) {
        conditions.push({
          kind: 'handover-release-overdue',
          signature: mhhReleaseSignature(handover.id),
          seatId: handover.declaredById,
          dueOn: addDays(today, 1),
          handoverId: handover.id,
        });
      } else {
        observations.push({
          key: `mhh1|no-release-author|${handover.id}`,
          detail: 'An accepted managerial handover is past its planned effective date and the declaring governor holds no live seat. The outgoing authority was not released by anyone else and the handover remains open.',
        });
      }
    }

    // 4. A dispute is a set of duties at the frozen joint seat above EVERY
    //    line of both managers — one ask per minimal apex, never a winner.
    if (handover.hasDispute && !handover.hasRelease) {
      if (!matrix) {
        observations.push({
          key: `mhh1|dispute-matrix-unreadable|${handover.id}`,
          detail: 'A disputed managerial handover could not re-read the reporting graph. The joint seat above both managers was not computed and nobody was asked; the dispute remains uncontained.',
        });
        continue;
      }
      const apex = resolveMgrHandoverApex(matrix, [handover.departingManagerId, handover.successorId]);
      if (!apex.ok) {
        observations.push({
          key: `mhh1|dispute-no-apex|${handover.id}|${apex.reason}`,
          detail: 'A disputed managerial handover has no askable joint seat above every reporting line of both managers. Nobody was substituted and the dispute remains uncontained.',
        });
        continue;
      }
      for (const seatId of apex.apexIds) {
        conditions.push({
          kind: 'handover-dispute-overdue',
          signature: mhhDisputeSignature(handover.id),
          seatId,
          dueOn: addDays(today, 1),
          handoverId: handover.id,
        });
      }
    }
  }
  return { conditions, observations };
}

function managerIdsOfLive(matrix, personId) {
  if (!matrix || !personId || !matrix.nodes?.has(personId)) return [];
  return [...new Set((matrix.linesByPerson?.get?.(personId) || [])
    .filter((line) => line?.active !== false && line?.managerId && line.managerId !== personId && matrix.nodes.has(line.managerId))
    .map((line) => line.managerId))];
}

export function mgrHandoverRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(MHH_EVENT_PREFIX)) return [];
  const conventions = normalizeMgrHandoverSettings(draft.settings || {});
  if (conventions[MHH_SETTING_KEYS.autoPropagate] === false) return [];
  if (!normalizeMgrHandovers(draft.mgrHandovers, []).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();
  const settings = { ...(draft.settings || {}), activeSeatId: null };
  let report;
  try {
    report = buildMgrHandover(draft, { now, settings, seat: null, includeAll: true });
  } catch {
    return [];
  }
  // The roster census for "is this person still askable": active, non-archived.
  report.roster = new Set((list(draft.people) || [])
    .filter((person) => person && typeof person.id === 'string' && person.status !== 'archived')
    .map((person) => person.id));
  let matrix = null;
  try {
    matrix = buildMatrix(draft, { now, settings });
  } catch { /* no authority will be resolved below; the handover stays open */ }
  const { conditions, observations } = mgrHandoverConditions(report, { today, matrix });
  const existing = indexMgrHandoverAsks(draft);
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
      ? `${MHH_RULE_ID}: the addressed seat changed; the old request was closed rather than left on a seat that no longer holds it.`
      : `${MHH_RULE_ID}: the managerial-handover condition was re-read and no longer stands.`;
    ask.task.updatedAt = nowIso;
    noteEffect(ctx, effects, 'completed', 'delegation', ask.task.id, 'Closed a stale managerial-handover ask; the register remains the source of the decision.');
  }

  draft.mgrHandoverMarkers = list(draft.mgrHandoverMarkers).slice();
  for (const observation of observations) {
    if (draft.mgrHandoverMarkers.some((marker) => marker?.key === observation.key)) continue;
    draft.mgrHandoverMarkers.push({ key: observation.key, at: nowIso, ruleId: MHH_RULE_ID, kind: MHH_MARKER_KIND, detail: clip(observation.detail, 360) });
    if (draft.mgrHandoverMarkers.length > L.markers) draft.mgrHandoverMarkers.splice(0, draft.mgrHandoverMarkers.length - L.markers);
    noteEffect(ctx, effects, 'observed', 'workspace', MHH_ROUTE, observation.detail);
  }

  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    const key = openKey(condition.signature, condition.seatId);
    if (covered.has(key)) continue;
    const humanAnswered = existing.some((ask) => ask.signature === condition.signature && ask.seatId === condition.seatId
      && ask.task && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(MHH_RULE_ID)) || ask.task.status === 'returned'));
    if (humanAnswered) continue;
    if (issued >= TASKS_PER_COMMIT) { deferred += 1; continue; }
    const taskId = typeof ctx.idFactory === 'function' ? ctx.idFactory('dlg') : `mhh-dlg-${issued + 1}`;
    const kind = condition.kind;
    const titles = {
      'handover-brief-overdue': 'A managerial handover needs the outgoing portfolio brief',
      'handover-acceptance-overdue': 'A managerial handover needs your acceptance of the portfolio',
      'handover-release-overdue': 'An accepted managerial handover needs the governor release',
      'handover-dispute-overdue': 'A disputed managerial handover needs the joint review above both lines',
    };
    const expected = {
      'handover-brief-overdue': 'Open the Managerial Portfolio Handover register (#/manager-handover) and record the outgoing portfolio brief for the transition you hold: the portfolio items you hold, the open items, and the evidence you checked. The brief is your own act; nobody can record it for you.',
      'handover-acceptance-overdue': 'Open the Managerial Portfolio Handover register (#/manager-handover) and record your acceptance of the transferred portfolio, or dispute it with a stated ground. This task contains no portfolio contents, and acceptance is your own first-person key.',
      'handover-release-overdue': 'Open the Managerial Portfolio Handover register (#/manager-handover) and record the release of the outgoing manager’s authority. The release requires the successor acceptance already on the record; it releases authority, never transfers obligations by itself.',
      'handover-dispute-overdue': 'Open the Managerial Portfolio Handover register (#/manager-handover) and review the disputed transition you hold at the joint seat above every reporting line of both managers. Record the release that settles it, or ask for a re-declared transition. This task contains no manager, portfolio or dispute text.',
    };
    draft.delegations = list(draft.delegations).slice();
    draft.delegations.unshift({
      id: taskId,
      personId: condition.seatId,
      title: clip(titles[kind], 200),
      expectedOutcome: clip(expected[kind], 2000),
      authority: 'act-inform',
      support: `Issued by ${MHH_RULE_ID}; the handover remains open until the required human keys are recorded in the register.`,
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
      relation: 'issues-obligation', ruleId: MHH_RULE_ID,
      summary: mhhAskSummary(condition.signature),
    }, { idFactory: ctx.idFactory, todayStr: today, nowIso });
    covered.add(key);
    issued += 1;
    noteEffect(ctx, effects, 'delegated', 'delegation', taskId, `Asked the owed seat to record the ${kind.replace('handover-', '').replace('-overdue', '')} key for an open managerial handover.`);
  }
  if (deferred) noteEffect(ctx, effects, 'deferred', 'workspace', MHH_ROUTE, `${deferred} managerial-handover follow-up request(s) were deferred by the per-commit cap; the open transitions remain visible on #/manager-handover.`);
  return effects;
}

/**
 * The literal key this rule reads, named here so the pause-permit census can grep
 * it. It must stay equal to `MHH_SETTING_KEYS.autoPropagate`.
 */
export const MGR_HANDOVER_PAUSE_SWITCH = 'mgrHandoverAutoPropagate';
if (MGR_HANDOVER_PAUSE_SWITCH !== MHH_SETTING_KEYS.autoPropagate) {
  throw new Error('MGR_HANDOVER_PAUSE_SWITCH drifted from the registry key');
}
