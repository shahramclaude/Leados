/**
 * app/core/domain/portfolioReviewRules.js — `RULE-PRV-01` on the shared
 * post-commit spine (ADR-0222, Schema v176).
 *
 * THREE CONDITIONS, all derived from the ONE reader (`buildPortfolioReview`)
 * and the live reporting graph (`matrixJointApex` / `strictJointApex`), never
 * invented:
 *
 *   1. `review-overdue` — a live unit whose latest review is past the declared
 *      cadence, or a live unit with no review whose declared review due date
 *      has passed. Addressed to the OWNING LINE HOLDER
 *      (`owningLineHolderId`), who owns the evidence.
 *   2. `verdict-pending` — a live unit with a current review but no current
 *      verdict. Addressed to the LOWEST JOINT APEX strictly above the owning
 *      line (`matrixJointApex` over the owner's active managers) — the seat
 *      that must judge the portfolio.
 *   3. `execution-slippage` — a live unit whose latest verdict carries an
 *      overdue milestone. Addressed to the same joint apex, which must resolve
 *      the slippage (re-plan, re-verdict, or retire the unit).
 *
 * OPAQUE ASKS. Delegations roll up above the addressee, so the task title and
 * body name no unit, no person, no currency, and no amount; the signature
 * lives only in the typed `issues-obligation` link. Where no reachable
 * addressee exists on the live graph, the rule writes ONE identity-free
 * `portfolioMarkers` observation and asks nobody.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { matrixJointApex } from './matrix.js';
import {
  activeManagersOf,
  buildPortfolioReview,
  indexPortfolioReviewAsks,
  portfolioReviewMatrix,
  strictJointApex,
} from './portfolioReview.js';
import {
  PRV_CONDITION_KINDS,
  PRV_LIMITS as L,
  PRV_MARKER_REASONS,
  PRV_ROUTE,
  PRV_RULE_ID,
  PRV_SETTING_KEYS,
} from './portfolioReviewRegistry.js';
import {
  normalizePortfolioSettings,
  prvAskSummary,
} from './portfolioReviewSchema.js';

export const PRV_EVENT_PREFIX = 'portfolioReview.';
const clip = (value, max = 280) => String(value || '').trim().slice(0, max);
const list = (value) => (Array.isArray(value) ? value : []);

function noteEffect(ctx, out, action, targetType, targetId, summary) {
  const clean = clip(summary);
  const entry = { ruleId: PRV_RULE_ID, action, targetType, targetId, summary: clean };
  out.push(entry);
  ctx.recordEffect?.({ ...entry, rule: PRV_RULE_ID, entity: targetType, entityId: targetId });
  if (typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${PRV_RULE_ID}] ${clean}`.slice(0, 300),
    });
  }
}

function liveJointApexForHolders(matrix, holderIds) {
  if (!matrix) return { ok: false, reason: PRV_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
  const unique = [...new Set(list(holderIds).filter(Boolean))].sort();
  if (!unique.length) return { ok: false, reason: PRV_MARKER_REASONS.OWNER_OFF_ROSTER, seatIds: [] };
  const managers = new Set();
  for (const holderId of unique) {
    if (!matrix.nodes?.has(holderId)) {
      return { ok: false, reason: PRV_MARKER_REASONS.OWNER_OFF_ROSTER, seatIds: [] };
    }
    const mgrs = activeManagersOf(matrix, holderId);
    if (!mgrs.length) {
      return { ok: false, reason: PRV_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
    }
    for (const m of mgrs) managers.add(m);
  }
  const apex = matrixJointApex(matrix, [...managers].sort());
  const seatIds = (apex.apexIds || []).filter((id) => id && id !== LEADER_ID && matrix.nodes.has(id));
  if (!seatIds.length) {
    return { ok: false, reason: PRV_MARKER_REASONS.NO_JOINT_APEX, seatIds: [] };
  }
  return { ok: true, reason: null, seatIds };
}

/**
 * Pure derivation of rule conditions and identity-free observations from the
 * single reader and live matrix. Exported for direct unit testing.
 */
export function portfolioReviewConditions(state, report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.units || !today) return { conditions, observations };

  const validSeat = (id) => (id && id !== LEADER_ID && matrix?.nodes?.has?.(id) ? id : null);

  for (const unit of report.units) {
    if (unit.status !== 'live') continue;

    /* 1. Review overdue (or never reviewed past the declared due date). */
    const needsReview = unit.state === 'review-overdue'
      || (unit.state === 'unreviewed' && unit.reviewDueOn <= today);
    if (needsReview) {
      const signature = `prv1:review:${unit.id}`;
      const owner = validSeat(unit.owningLineHolderId);
      if (owner) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.REVIEW_OVERDUE,
          signature,
          seatIds: [owner],
          dueOn: addDays(today, L.askDueReviewDays),
        });
      } else {
        observations.push({ signature, reason: PRV_MARKER_REASONS.OWNER_OFF_ROSTER });
      }
    }

    /* 2. Verdict pending -> joint apex above the owning line. */
    if (unit.state === 'verdict-pending') {
      const signature = `prv1:verdict:${unit.id}`;
      const apex = liveJointApexForHolders(matrix, [unit.owningLineHolderId]);
      if (apex.ok && apex.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.VERDICT_PENDING,
          signature,
          seatIds: apex.seatIds,
          dueOn: addDays(today, L.askDueVerdictDays),
        });
      } else {
        observations.push({ signature, reason: apex.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }

    /* 3. Execution slippage (overdue milestone on the latest verdict). */
    if (unit.milestonesOverdueN > 0 && unit.latestVerdict) {
      const overdueIds = unit.milestones
        .filter((m) => m.state === 'overdue')
        .map((m) => m.id)
        .sort()
        .join(',');
      const signature = `prv1:slippage:${unit.id}:${overdueIds}`;
      const apex = liveJointApexForHolders(matrix, [unit.owningLineHolderId]);
      if (apex.ok && apex.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.EXECUTION_SLIPPAGE,
          signature,
          seatIds: apex.seatIds,
          dueOn: addDays(today, L.askDueSlippageDays),
        });
      } else {
        observations.push({ signature, reason: apex.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }
  }

  return { conditions, observations };
}

export function portfolioReviewRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PRV_EVENT_PREFIX)) return [];

  // Full literal switch read required by the pause-permit reach census.
  const conv = normalizePortfolioSettings(draft.settings || {});
  if (conv.portfolioAutoPropagate === false) return [];
  if (!list(draft.portfolioUnits).length && !list(draft.portfolioMarkers).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    const cleanSettings = { ...(draft.settings || {}), activeSeatId: null };
    report = buildPortfolioReview(draft, { now, settings: cleanSettings, seat: null });
    const built = portfolioReviewMatrix(draft, now, cleanSettings);
    if (built.error || !built.matrix) return [];
    matrix = built.matrix;
  } catch {
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = portfolioReviewConditions(draft, report, { today, matrix });
  const existing = indexPortfolioReviewAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  const openMarkers = list(draft.portfolioMarkers).filter((m) => m && !m.resolvedOn);
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
      ? `${PRV_RULE_ID}: the addressee on the live reporting graph changed; stale ask closed.`
      : `${PRV_RULE_ID}: the portfolio review condition cleared on the register.`;
    ask.task.updatedAt = nowIso;
    noteEffect(
      ctx,
      out,
      'completed',
      'delegation',
      ask.task.id,
      activeConditionKeys.has(key)
        ? 'Closed a portfolio review ask after reporting-line change.'
        : 'Closed a portfolio review ask after portfolio condition cleared.',
    );
  }

  /* 2. Maintain identity-free markers for unaddressable conditions. */
  const liveObservationSigs = new Set(observations.map((o) => o.signature));
  if (Array.isArray(draft.portfolioMarkers)) {
    for (const marker of draft.portfolioMarkers) {
      if (marker && !marker.resolvedOn && !liveObservationSigs.has(marker.signature)) {
        marker.resolvedOn = today;
      }
    }
  }
  for (const obs of observations) {
    if (!Array.isArray(draft.portfolioMarkers)) draft.portfolioMarkers = [];
    const alreadyOpen = draft.portfolioMarkers.some(
      (m) => m && !m.resolvedOn && m.signature === obs.signature,
    );
    if (alreadyOpen) continue;
    const markerId = idFactory('prvmk');
    draft.portfolioMarkers.push({
      id: markerId,
      ruleId: PRV_RULE_ID,
      signature: obs.signature,
      reason: obs.reason,
      observedOn: today,
      resolvedOn: null,
    });
    if (draft.portfolioMarkers.length > L.markersMax) {
      draft.portfolioMarkers.splice(0, draft.portfolioMarkers.length - L.markersMax);
    }
    noteEffect(
      ctx,
      out,
      'observed',
      'workspace',
      PRV_ROUTE,
      `Recorded identity-free portfolio review marker (${obs.reason}).`,
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
        && ((ask.task.status === 'done' && !String(ask.task.completionNote || '').startsWith(PRV_RULE_ID))
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
        title: clip('A dated portfolio judgement is owed on the portfolio review register', 200),
        expectedOutcome: clip(
          'Open the Portfolio Review Register (#/portfolio) and record the dated judgement owed by your seat — review an overdue business unit you own, verdict a reviewed unit awaiting a keep/fix/sell/exit decision, or resolve slippage on a verdict’s overdue milestones (by re-planning, re-verdicting, or retiring the unit). This task deliberately carries no unit name, no person, no amount, and no currency because delegations roll up above your seat.',
          2000,
        ),
        authority: 'act-inform',
        support: `Issued by ${PRV_RULE_ID} from the Portfolio Review Register (#/portfolio). Portfolio governance only; never a performance rating of any person.`,
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
        ruleId: PRV_RULE_ID,
        summary: prvAskSummary(condition.signature),
      }, linkCtx);
      covered.add(key);
      issued += 1;
      noteEffect(
        ctx,
        out,
        'delegated',
        'delegation',
        taskId,
        condition.kind === PRV_CONDITION_KINDS.REVIEW_OVERDUE
          ? `Asked the owning line holder to review an overdue business unit, due ${condition.dueOn}.`
          : condition.kind === PRV_CONDITION_KINDS.VERDICT_PENDING
            ? `Asked the joint apex above the owning line to verdict a reviewed unit, due ${condition.dueOn}.`
            : `Asked the joint apex above the owning line to resolve verdict milestone slippage, due ${condition.dueOn}.`,
      );
    }
  }
  if (deferred > 0) {
    noteEffect(
      ctx,
      out,
      'deferred',
      'workspace',
      PRV_ROUTE,
      `${deferred} portfolio review ask(s) deferred (cap ${L.asksPerCommit} per commit).`,
    );
  }
  return out;
}

portfolioReviewRule.id = 'portfolioReviewRule';

export default portfolioReviewRule;

/** Exported for the pause-permit reach census. */
export const PORTFOLIO_REVIEW_PAUSE_SWITCH = PRV_SETTING_KEYS.autoPropagate;
