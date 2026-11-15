/**
 * app/core/domain/dutyMeansRules.js — `RULE-DWM-01` on the shared post-commit
 * spine (ADR-0221, Schema v175).
 *
 * THREE CONDITIONS, all derived from the ONE reader (`buildDutyMeans`) and the
 * live reporting graph (`matrixJointApex` / `strictJointApex`), never invented:
 *
 *   1. `duty-unscoped` — a live duty whose window has opened with zero declared
 *      authority, budget, or time requirements. Addressed to the DEMANDING LINE
 *      HOLDER (`demandingLineHolderId`), who holds the carrier accountable and
 *      owes stating what means back the mandate (or retiring it).
 *   2. `means-unanswered` — a live requirement that is `overdue-unanswered`.
 *      Addressed to the CONTROLLING LINE HOLDER (`controllingHolderId`), who
 *      controls that pillar and has not yet supplied or declined it.
 *   3. `means-gap-escalation` — a live duty with at least one requirement in
 *      `declined`, `withdrawn`, `partial`, or `drifted`. Addressed to the
 *      LOWEST JOINT APEX strictly above EVERY reporting line of BOTH the
 *      demanding line and every unbacked controlling line (`matrixJointApex`
 *      over their active managers) — never to the carrier, and never to one
 *      competing line on another line's behalf. A genuine diamond tie files one
 *      ask per minimal joint apex.
 *
 * OPAQUE ASKS. Delegations roll up above the addressee, so the task title and
 * body name no duty, no person, no currency, no amount, and no hours; the
 * signature lives only in the typed `issues-obligation` link. Where no reachable
 * addressee exists on the live graph, the rule writes ONE identity-free
 * `dutyMeansMarkers` observation and asks nobody.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { matrixJointApex } from './matrix.js';
import {
  activeManagersOf,
  buildDutyMeans,
  dutyMeansMatrix,
  indexDutyMeansAsks,
} from './dutyMeans.js';
import {
  DWM_CONDITION_KINDS,
  DWM_LIMITS as L,
  DWM_MARKER_REASONS,
  DWM_ROUTE,
  DWM_RULE_ID,
  DWM_SETTING_KEYS,
} from './dutyMeansRegistry.js';
import {
  dwmAskSummary,
  normalizeDutyMeansSettings,
} from './dutyMeansSchema.js';

export const DWM_EVENT_PREFIX = 'dutyMeans.';
const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: DWM_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: DWM_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${DWM_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function liveJointApexForHolders(matrix, holderIds) {
  if (!matrix) return { ok: false, reason: DWM_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
  const unique = [...new Set(list(holderIds).filter(Boolean))].sort();
  if (!unique.length) return { ok: false, reason: DWM_MARKER_REASONS.HOLDER_OFF_ROSTER, seatIds: [] };
  const managers = new Set();
  for (const holderId of unique) {
    if (!matrix.nodes?.has(holderId)) {
      return { ok: false, reason: DWM_MARKER_REASONS.HOLDER_OFF_ROSTER, seatIds: [] };
    }
    const mgrs = activeManagersOf(matrix, holderId);
    if (!mgrs.length) {
      return { ok: false, reason: DWM_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
    }
    for (const m of mgrs) managers.add(m);
  }
  const apex = matrixJointApex(matrix, [...managers].sort());
  const seatIds = (apex.apexIds || []).filter((id) => id && id !== LEADER_ID && matrix.nodes.has(id));
  if (!seatIds.length) {
    return { ok: false, reason: DWM_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
  }
  return { ok: true, reason: null, seatIds };
}

/**
 * Pure derivation of rule conditions and identity-free observations from the
 * single reader and live matrix. Exported for direct unit testing.
 */
export function dutyMeansConditions(state, report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.duties || !today) return { conditions, observations };

  const validSeat = (id) => (id && id !== LEADER_ID && matrix?.nodes?.has?.(id) ? id : null);

  for (const duty of report.duties) {
    if (duty.status !== 'live') continue;

    /* 1. Live duty whose window has opened with zero declared requirements. */
    if (duty.windowFrom <= today && duty.verdict === 'unscoped-means') {
      const signature = `dwm1:unscoped:${duty.id}`;
      const holder = validSeat(duty.demandingLineHolderId);
      if (holder) {
        conditions.push({
          kind: DWM_CONDITION_KINDS.DUTY_UNSCOPED,
          signature,
          seatIds: [holder],
          dueOn: addDays(today, L.askDueUnscopedDays),
        });
      } else {
        observations.push({
          signature,
          reason: DWM_MARKER_REASONS.DEMANDING_OFF_ROSTER,
        });
      }
    }

    /* 2. Overdue unanswered requirements -> ask controlling line holder. */
    for (const req of list(duty.requirements)) {
      if (req.state !== 'overdue-unanswered') continue;
      const signature = `dwm1:unanswered:${req.id}`;
      const controller = validSeat(req.controllingHolderId);
      if (controller) {
        conditions.push({
          kind: DWM_CONDITION_KINDS.MEANS_UNANSWERED,
          signature,
          seatIds: [controller],
          dueOn: addDays(today, L.askDueUnansweredDays),
        });
      } else {
        observations.push({
          signature,
          reason: DWM_MARKER_REASONS.HOLDER_OFF_ROSTER,
        });
      }
    }

    /* 3. Declined, withdrawn, partial, or drifted means -> escalate to strict joint apex. */
    const unbacked = list(duty.requirements).filter((r) => (
      r.state === 'declined' || r.state === 'withdrawn' || r.state === 'partial' || r.state === 'drifted'
    ));
    if (unbacked.length > 0) {
      const reqPart = unbacked.map((r) => `${r.id}:${r.state}`).sort().join(',');
      const signature = `dwm1:gap:${duty.id}:${reqPart}`;
      const holderIds = [duty.demandingLineHolderId, ...unbacked.map((r) => r.controllingHolderId)];
      const apex = liveJointApexForHolders(matrix, holderIds);
      if (apex.ok && apex.seatIds.length > 0) {
        conditions.push({
          kind: DWM_CONDITION_KINDS.MEANS_GAP_ESCALATION,
          signature,
          seatIds: apex.seatIds,
          dueOn: addDays(today, L.askDueEscalationDays),
        });
      } else {
        observations.push({
          signature,
          reason: apex.reason || DWM_MARKER_REASONS.NO_JOINT_APEX,
        });
      }
    }
  }

  return { conditions, observations };
}

export function dutyMeansRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(DWM_EVENT_PREFIX)) return [];

  // Full literal switch read required by the pause-permit reach census.
  const conv = normalizeDutyMeansSettings(draft.settings || {});
  if (conv.dutyMeansAutoPropagate === false) return [];
  if (!list(draft.dutyMeansDuties).length && !list(draft.dutyMeansMarkers).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    const cleanSettings = { ...(draft.settings || {}), activeSeatId: null };
    report = buildDutyMeans(draft, { now, settings: cleanSettings, seat: null });
    const built = dutyMeansMatrix(draft, now, cleanSettings);
    if (built.error || !built.matrix) return [];
    matrix = built.matrix;
  } catch {
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = dutyMeansConditions(draft, report, { today, matrix });
  const existing = indexDutyMeansAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  const openMarkers = list(draft.dutyMeansMarkers).filter((m) => m && !m.resolvedOn);
  if (!conditions.length && !openAsks.length && !observations.length && !openMarkers.length) return [];

  const idFactory = typeof ctx.idFactory === 'function'
    ? ctx.idFactory
    : ((prefix) => `${prefix}-${Date.now()}`);
  const linkCtx = { idFactory, todayStr: today, nowIso };
  const out = [];

  /* 1. Close rule-authored asks whose condition cleared or whose addressee moved. */
  const openKey = (signature, seatId) => `${signature}|${seatId}`;
  const activeConditionKeys = new Set(
    conditions.flatMap((row) => row.seatIds.map((seatId) => openKey(row.signature, seatId))),
  );
  const covered = new Set();
  for (const ask of openAsks) {
    const key = openKey(ask.signature, ask.seatId);
    if (activeConditionKeys.has(key) && ask.task.personId === ask.seatId) {
      covered.add(key);
      continue;
    }
    ask.task.status = 'done';
    ask.task.completedOn = today;
    ask.task.completionNote = activeConditionKeys.has(key)
      ? `${DWM_RULE_ID}: the addressee on the live reporting graph changed; stale ask closed.`
      : `${DWM_RULE_ID}: the duty-without-means condition cleared on the register.`;
    ask.task.updatedAt = nowIso;
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      ask.task.id,
      activeConditionKeys.has(key)
        ? 'Closed a duty-without-means ask after reporting-line change.'
        : 'Closed a duty-without-means ask after parity condition cleared.',
    );
  }

  /* 2. Maintain identity-free markers for unaddressable conditions. */
  const liveObservationSigs = new Set(observations.map((o) => o.signature));
  if (Array.isArray(draft.dutyMeansMarkers)) {
    for (const marker of draft.dutyMeansMarkers) {
      if (marker && !marker.resolvedOn && !liveObservationSigs.has(marker.signature)) {
        marker.resolvedOn = today;
      }
    }
  }
  for (const obs of observations) {
    if (!Array.isArray(draft.dutyMeansMarkers)) draft.dutyMeansMarkers = [];
    const alreadyOpen = draft.dutyMeansMarkers.some(
      (m) => m && !m.resolvedOn && m.signature === obs.signature,
    );
    if (alreadyOpen) continue;
    const markerId = idFactory('dwmm');
    draft.dutyMeansMarkers.push({
      id: markerId,
      ruleId: DWM_RULE_ID,
      signature: obs.signature,
      reason: obs.reason,
      observedOn: today,
      resolvedOn: null,
    });
    if (draft.dutyMeansMarkers.length > L.markersMax) {
      draft.dutyMeansMarkers.splice(0, draft.dutyMeansMarkers.length - L.markersMax);
    }
    noteEffect(
      ctx,
      out,
      'observed',
      'workspace',
      DWM_ROUTE,
      `Recorded identity-free duty-without-means marker (${obs.reason}).`,
    );
  }

  /* 3. Issue bounded, opaque asks per (signature, addressee). */
  let issued = 0;
  let deferred = 0;
  for (const condition of conditions) {
    for (const seatId of condition.seatIds) {
      const key = openKey(condition.signature, seatId);
      if (covered.has(key)) continue;
      const humanAnswered = existing.some((ask) => ask.task
        && ask.signature === condition.signature
        && ask.seatId === seatId
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(DWM_RULE_ID))
          || ask.task.status === 'returned'
          || ask.task.status === 'cancelled'));
      if (humanAnswered) continue;
      if (issued >= L.asksPerCommit) {
        deferred += 1;
        continue;
      }

      const taskId = idFactory('dlg');
      if (!Array.isArray(draft.delegations)) draft.delegations = [];
      draft.delegations.unshift({
        id: taskId,
        personId: seatId,
        title: clip('A dated accountability–means decision is owed on the duty-without-means register', 200),
        expectedOutcome: clip(
          'Open the Duty-Without-Means Register (#/means) and record the dated decision owed by your seat — declare the required means for an unscoped duty, answer an overdue means request controlled by your line, or resolve an unbacked accountability gap above the demanding and controlling lines (by supplying means, retiring/rescoping the duty, or signing a bounded entrepreneurial gap). This task deliberately carries no duty label, no person, no amount, and no hours because delegations roll up above your seat.',
          2000,
        ),
        authority: 'act-inform',
        support: `Issued by ${DWM_RULE_ID} from the Duty-Without-Means Register (#/means). Structural parity governance only; never a performance rating of any person.`,
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
        ruleId: DWM_RULE_ID,
        summary: dwmAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(
        ctx,
        out,
        'delegated',
        'delegation',
        taskId,
        condition.kind === DWM_CONDITION_KINDS.DUTY_UNSCOPED
          ? `Asked the demanding line holder to declare required means for an unscoped duty, due ${condition.dueOn}.`
          : condition.kind === DWM_CONDITION_KINDS.MEANS_UNANSWERED
            ? `Asked the controlling line holder to answer an overdue means request, due ${condition.dueOn}.`
            : `Asked the joint apex above demanding and controlling lines to resolve an unbacked means gap, due ${condition.dueOn}.`,
      );
    }
  }
  if (deferred > 0) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      DWM_ROUTE,
      `${deferred} duty-without-means ask(s) deferred (cap ${L.asksPerCommit} per commit).`,
    );
  }
  return out;
}

dutyMeansRule.id = 'dutyMeansRule';

export default dutyMeansRule;

/** Exported for the pause-permit reach census. */
export const DUTY_MEANS_PAUSE_SWITCH = DWM_SETTING_KEYS.autoPropagate;
