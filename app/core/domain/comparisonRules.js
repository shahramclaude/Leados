/**
 * app/core/domain/comparisonRules.js — RULE-CMP-01, the Portfolio Rehearsal
 * Comparison's place on the shared post-commit spine (ADR-0118, Schema v113).
 *
 * The action writes the receipt and the arbitration decision in one atomic
 * transaction. This rule turns that record into a graph node in the SAME
 * transaction, so an executive arbitration is navigable upward and back:
 *
 *   comparison → bundle            `rehearses`   (both candidates stay attached)
 *   comparison → decision          `informs`     (the call the human recorded)
 *   comparison → seat + ancestors  `rolls-up-to` (one edge per rung, never a
 *                                                 second hierarchy engine)
 *
 * `ensureEntityLink` is idempotent by (source, target, relation), so a rescan or
 * a re-run cannot duplicate an edge and no marker ledger is needed. The rule
 * writes only LINKS: it never edits the receipt, never chooses for the human and
 * never rates a person or a response.
 */

import { dayKey } from '../time.js';
import { ensureEntityLink } from './automation.js';
import { LEADER_ID } from './chain.js';
import { buildSeats } from './seat.js';
import { ancestorSeatIds } from './escalation.js';
import { COMPARISON_EVENTS, COMPARISON_RULE_IDS } from './portfolioComparison.js';

const TRIGGERS = new Set([COMPARISON_EVENTS.RECORDED]);
const clampStr = (v, max = 280) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function noteEffect(ctx, out, ruleId, action, targetType, targetId, summary) {
  const clean = clampStr(summary, 280);
  out.push({ ruleId, action, targetType, targetId, summary: clean });
  if (ctx && typeof ctx.logEvent === 'function') {
    ctx.logEvent({
      type: 'automation.propagated',
      entity: targetType,
      entityId: targetId,
      summary: `[${ruleId}] ${clean}`.slice(0, 300),
    });
  }
}

function linkOnce(draft, ctx, sourceType, sourceId, targetType, targetId, relation, summary) {
  return ensureEntityLink(draft, {
    sourceType, sourceId, targetType, targetId, relation,
    ruleId: COMPARISON_RULE_IDS.ROLLUP, summary: clampStr(summary, 280),
  }, { idFactory: ctx.idFactory, todayStr: dayKey(ctx.now), nowIso: ctx.now.toISOString() }).created;
}

/** Post-commit hook (RULE-CMP-01). */
export function comparisonRule(draft, ctx = {}) {
  const event = ctx.event || null;
  if (!draft || !event || typeof event.type !== 'string' || !TRIGGERS.has(event.type)) return [];
  const records = Array.isArray(draft.portfolioComparisons) ? draft.portfolioComparisons : [];
  const record = records.find((r) => r && r.id === event.entityId);
  if (!record) return [];

  const now = ctx.now instanceof Date ? ctx.now : new Date(ctx.now || Date.now());
  const hookCtx = { ...ctx, now };
  const out = [];

  for (const side of record.receipt.sides) {
    if (linkOnce(draft, hookCtx, 'comparison', record.id, 'bundle', side.bundleId, 'rehearses',
      `Rehearsed candidate response in a disposable workspace from one frozen revision.`)) {
      noteEffect(hookCtx, out, COMPARISON_RULE_IDS.ROLLUP, 'linked', 'bundle', side.bundleId,
        `Comparison ${record.id} rehearses bundle ${side.bundleId}.`);
    }
  }
  if (record.decisionId && (draft.decisions || []).some((d) => d && d.id === record.decisionId)) {
    if (linkOnce(draft, hookCtx, 'comparison', record.id, 'decision', record.decisionId, 'informs',
      'Reviewed comparison that informed this arbitration.')) {
      noteEffect(hookCtx, out, COMPARISON_RULE_IDS.ROLLUP, 'linked', 'decision', record.decisionId,
        `Comparison ${record.id} informs decision ${record.decisionId}.`);
    }
  }

  const seatId = record.provenance?.seatId || null;
  let built = null;
  try { built = buildSeats(draft, { now, settings: draft.settings }); } catch { built = null; }
  if (!built || !seatId || !built.byId.has(seatId)) return out;
  const chain = [seatId, ...ancestorSeatIds(built, seatId)];
  for (const targetId of chain) {
    if (!targetId || targetId === LEADER_ID || !built.byId.has(targetId)) continue;
    if (linkOnce(draft, hookCtx, 'comparison', record.id, 'person', targetId, 'rolls-up-to',
      `Portfolio arbitration rolled up to this leadership span (one rung per edge).`)) {
      noteEffect(hookCtx, out, COMPARISON_RULE_IDS.ROLLUP, 'rolled-up', 'person', targetId,
        `Comparison ${record.id} rolled up to span ${targetId}.`);
    }
  }
  return out;
}
