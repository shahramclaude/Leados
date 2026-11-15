/**
 * app/core/domain/portfolioReviewRules.js — `RULE-PRV-01` on the shared
 * post-commit spine (ADR-0222, Schema v177, `#/portfolio-review`).
 *
 * FOUR CONDITIONS, all derived from the ONE reader (`buildPortfolioReview`)
 * and right-capable authority resolution (`resolvePortfolioAuthority`) over
 * the live reporting graph:
 *
 *   1. `review-overdue` (`review-portfolio`, minRank 4) — a live unit whose
 *      latest review is past cadence, or never reviewed past due date.
 *      Addressed to the owning line if rank >= 4, otherwise the lowest
 *      executive joint apex above its active lines.
 *   2. `verdict-pending` (`verdict-portfolio`, minRank 5) — a live unit with a
 *      current review awaiting a CEO/chief keep/fix/sell/exit judgement.
 *      Lower apexes (ranks 3–4) are never asked; synthetic `LEADER_ID` routes
 *      explicitly to the chief decision queue + `chief-decision-owed` marker.
 *   3. `execution-slippage` (`track-portfolio`, minRank 3) — a live unit with
 *      overdue milestone(s) on its latest verdict. Addressed to the lowest
 *      joint apex strictly above the owning line holding `rank >= 3`, asking
 *      only to track/update milestones (never to re-verdict or retire).
 *   4. `execution-overdue` (`verdict-portfolio`, minRank 5) — a live `sell` or
 *      `exit` verdict whose expected completion date passed without disposal
 *      completion. Routed strictly to rank-5 chief authority.
 *
 * OPAQUE ASKS. Delegations roll up above the addressee, so the task title and
 * body name no unit, no person, no currency, and no amount; the signature
 * lives only in the typed `issues-obligation` link. Where authority resolves
 * to synthetic `LEADER_ID` (`chief-decision-owed`) or no reachable rank-capable
 * addressee exists, the rule writes ONE identity-free `portfolioReviewMarkers`
 * observation and issues zero invalid delegations.
 */

import { addDays, dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { buildMatrix } from './matrix.js';
import {
  buildPortfolioReview,
  indexPortfolioReviewAsks,
  resolvePortfolioAuthority,
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

/**
 * Pure derivation of rule conditions and identity-free observations from the
 * single reader and live matrix. Exported for direct unit testing.
 */
export function portfolioReviewConditions(state, report, { today, matrix } = {}) {
  const conditions = [];
  const observations = [];
  if (!report?.units || !today) return { conditions, observations };

  for (const unit of report.units) {
    if (unit.status !== 'live') continue;

    /* 1. Review overdue (`review-portfolio`, minRank 4, holder allowed if rank >= 4). */
    const needsReview = unit.state === 'review-overdue'
      || (unit.state === 'unreviewed' && unit.reviewDueOn <= today);
    if (needsReview) {
      const signature = `prv1:review:${unit.id}`;
      const auth = resolvePortfolioAuthority(matrix, unit.owningLineHolderId, 4, { allowHolder: true });
      if (auth.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.REVIEW_OVERDUE,
          signature,
          seatIds: auth.seatIds,
          dueOn: addDays(today, L.askDueReviewDays),
        });
      }
      if (auth.chiefQueue || !auth.ok) {
        observations.push({ signature, reason: auth.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }

    /* 2. Verdict pending (`verdict-portfolio`, minRank 5, never lower apex). */
    if (unit.state === 'verdict-pending') {
      const signature = `prv1:verdict:${unit.id}`;
      const auth = resolvePortfolioAuthority(matrix, unit.owningLineHolderId, 5, { allowHolder: false });
      if (auth.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.VERDICT_PENDING,
          signature,
          seatIds: auth.seatIds,
          dueOn: addDays(today, L.askDueVerdictDays),
        });
      }
      if (auth.chiefQueue || !auth.ok) {
        observations.push({ signature, reason: auth.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }

    /* 3. Execution slippage (`track-portfolio`, minRank 3, milestone tracking only). */
    if (unit.milestonesOverdueN > 0 && unit.latestVerdict) {
      const overdueIds = unit.milestones
        .filter((m) => m.state === 'overdue')
        .map((m) => m.id)
        .sort()
        .join(',');
      const signature = `prv1:slippage:${unit.id}:${overdueIds}`;
      const auth = resolvePortfolioAuthority(matrix, unit.owningLineHolderId, 3, { allowHolder: false });
      if (auth.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.EXECUTION_SLIPPAGE,
          signature,
          seatIds: auth.seatIds,
          dueOn: addDays(today, L.askDueSlippageDays),
        });
      }
      if (auth.chiefQueue || !auth.ok) {
        observations.push({ signature, reason: auth.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }

    /* 4. Sell/exit expected date passed without settlement (`verdict-portfolio`, minRank 5). */
    if (unit.executionOverdue && unit.latestVerdict) {
      const signature = `prv1:exit-overdue:${unit.id}:${unit.latestVerdict.id}`;
      const auth = resolvePortfolioAuthority(matrix, unit.owningLineHolderId, 5, { allowHolder: false });
      if (auth.seatIds.length > 0) {
        conditions.push({
          kind: PRV_CONDITION_KINDS.EXECUTION_OVERDUE,
          signature,
          seatIds: auth.seatIds,
          dueOn: addDays(today, L.askDueExecutionOverdueDays),
        });
      }
      if (auth.chiefQueue || !auth.ok) {
        observations.push({ signature, reason: auth.reason || PRV_MARKER_REASONS.NO_JOINT_APEX });
      }
    }
  }

  return { conditions, observations };
}

function opaqueTaskText(kind) {
  if (kind === PRV_CONDITION_KINDS.REVIEW_OVERDUE) {
    return {
      title: 'A dated portfolio unit review is owed on the portfolio review register',
      outcome: `Open the Portfolio Review Register (${PRV_ROUTE}) and record dated measurement evidence for an overdue business unit within your authorized line. This task deliberately carries no unit name, no person, no amount, and no currency because delegations roll up above your seat.`,
      summary: 'Asked an authorized executive line holder to review an overdue business unit',
    };
  }
  if (kind === PRV_CONDITION_KINDS.EXECUTION_SLIPPAGE) {
    return {
      title: 'Overdue portfolio verdict milestones need tracking update on the portfolio review register',
      outcome: `Open the Portfolio Review Register (${PRV_ROUTE}) and update or record completion on overdue execution milestones for a verdict within your line. This task asks only for milestone tracking and deliberately carries no unit name, no person, no amount, and no currency because delegations roll up above your seat.`,
      summary: 'Asked the right-capable apex above the owning line to update overdue verdict milestones',
    };
  }
  if (kind === PRV_CONDITION_KINDS.EXECUTION_OVERDUE) {
    return {
      title: 'A past-due portfolio sell/exit settlement needs judgement on the portfolio review register',
      outcome: `Open the Portfolio Review Register (${PRV_ROUTE}) and record final sell/exit completion, extend via a new verdict, or retire a past-due disposal unit. This task deliberately carries no unit name, no person, no amount, and no currency because delegations roll up above your seat.`,
      summary: 'Asked rank-5 verdict authority to settle or re-judge a past-due sell/exit unit',
    };
  }
  return {
    title: 'A portfolio unit verdict is owed on the portfolio review register',
    outcome: `Open the Portfolio Review Register (${PRV_ROUTE}) and record a dated keep/fix/sell/exit judgement for a reviewed business unit. This task deliberately carries no unit name, no person, no amount, and no currency because delegations roll up above your seat.`,
    summary: 'Asked rank-5 verdict authority to verdict a reviewed unit',
  };
}

export function portfolioReviewRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !event.type) return [];
  if (event.type.startsWith('automation.')) return [];
  if (ctx.derived && !event.type.startsWith(PRV_EVENT_PREFIX)) return [];

  // Full literal switch read required by the pause-permit reach census.
  const conv = normalizePortfolioSettings(draft.settings || {});
  if (conv.portfolioAutoPropagate === false) return [];
  if (!list(draft.portfolioUnits).length && !list(draft.portfolioReviewMarkers).length) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const today = dayKey(now);
  if (!today) return [];
  const nowIso = now.toISOString();

  let report;
  let matrix;
  try {
    const cleanSettings = { ...(draft.settings || {}), activeSeatId: null };
    report = buildPortfolioReview(draft, { now, settings: cleanSettings, seat: null });
    matrix = buildMatrix(draft, { now, settings: cleanSettings });
    if (!matrix) return [];
  } catch {
    return [];
  }
  if (report?.matrixError) return [];

  const { conditions, observations } = portfolioReviewConditions(draft, report, { today, matrix });
  const existing = indexPortfolioReviewAsks(draft);
  const openAsks = existing.filter((ask) => ask.task && ask.task.status === 'active');
  const openMarkers = list(draft.portfolioReviewMarkers).filter((m) => m && !m.resolvedOn);
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

  /* 2. Maintain identity-free markers for chief-queue obligations & unaddressable conditions. */
  const liveObservationSigs = new Set(observations.map((o) => o.signature));
  if (Array.isArray(draft.portfolioReviewMarkers)) {
    for (const marker of draft.portfolioReviewMarkers) {
      if (marker && !marker.resolvedOn && !liveObservationSigs.has(marker.signature)) {
        marker.resolvedOn = today;
      }
    }
  }
  for (const obs of observations) {
    if (!Array.isArray(draft.portfolioReviewMarkers)) draft.portfolioReviewMarkers = [];
    const alreadyOpen = draft.portfolioReviewMarkers.some(
      (m) => m && !m.resolvedOn && m.signature === obs.signature,
    );
    if (alreadyOpen) continue;
    const markerId = idFactory('prvmk');
    draft.portfolioReviewMarkers.push({
      id: markerId,
      ruleId: PRV_RULE_ID,
      signature: obs.signature,
      reason: obs.reason,
      observedOn: today,
      resolvedOn: null,
    });
    if (draft.portfolioReviewMarkers.length > L.markersMax) {
      draft.portfolioReviewMarkers.splice(0, draft.portfolioReviewMarkers.length - L.markersMax);
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
    const copy = opaqueTaskText(condition.kind);
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
        title: clip(copy.title, 200),
        expectedOutcome: clip(copy.outcome, 2000),
        authority: 'act-inform',
        support: `Issued by ${PRV_RULE_ID} from the Portfolio Review Register (${PRV_ROUTE}). Portfolio governance only; never a performance rating of any person.`,
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
        `${copy.summary}, due ${condition.dueOn}.`,
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
