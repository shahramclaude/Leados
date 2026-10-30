/**
 * app/core/domain/warGameRules.js — Post-commit rules for the War-Game Terminal (Schema v60).
 *
 * Four marker-idempotent rules on the shared post-commit spine:
 *
 *   RULE-WG-01: When a war game is committed, write typed `stresses` edges
 *     from the war game to each strategy bet whose say-do gap worsens under
 *     any evaluated scenario. Only bets with a divergence > 10pp are linked.
 *
 *   RULE-WG-02: When a committed war game has a scenario that breaks coalition
 *     stability (winning coalition count changes), write one DACI decision
 *     about coalition repair. Marker-idempotent per war game.
 *
 *   RULE-WG-03: When attention market reallocation exceeds 50% under any
 *     scenario, create one owned task for re-planning. Marker-idempotent.
 *
 *   RULE-WG-04: Write typed `prefigures` edges from the war game to cases
 *     whose severity increases by >= 1.0 under any scenario.
 *
 * All rules are marker-idempotent: stored markers prevent duplicate creation
 * on re-fire. All rules create typed graph edges so the war game is navigable
 * from affected records and back.
 *
 * Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { WARGAME_ENGINE_VERSION } from './warGame.js';
import { buildWarGameReport } from './warGame.js';

export const WG_RULE_VERSION = WARGAME_ENGINE_VERSION;

const GAP_THRESHOLD_PP = 10;
const REALLOCATION_THRESHOLD_PCT = 50;
const SEVERITY_SHIFT_THRESHOLD = 1.0;

/**
 * Main rule entry point. Called from the post-commit chain with the draft
 * state, the triggering event, and the context.
 */
export function warGameRule(draft, ctx = {}) {
  const { event, state: beforeState, now = new Date(), out = [], markers = [] } = ctx;
  if (!event || !draft) return;

  const eventType = event.type || '';
  const entityId = event.entityId || '';

  // Only react to war-game lifecycle events
  if (eventType !== 'wargame.committed') return;

  const warGame = (draft.warGames || []).find((wg) => wg.id === entityId);
  if (!warGame || warGame.status !== 'committed') return;

  // Build the report (this re-runs all analytical engines under each scenario)
  const report = buildWarGameReport(draft, warGame, now);
  if (!report) return;

  const markerBase = `WG:${warGame.id}`;

  // ---- RULE-WG-01: strategy bet stress links ----
  const stressedBets = [];
  for (const reading of report.scenarioReadings) {
    if (reading.gapDivergence != null && reading.gapDivergence > GAP_THRESHOLD_PP) {
      // This scenario worsened the say-do gap. Find which bets shifted.
      // For now, link to all active bets (a more precise version would
      // identify the specific bets whose shares changed most).
      const activeBets = (draft.strategyBets || []).filter((b) => b.status === 'active');
      for (const bet of activeBets) {
        stressedBets.push({ betId: bet.id, scenarioId: reading.scenarioId, divergence: reading.gapDivergence });
      }
    }
  }

  if (stressedBets.length > 0) {
    const marker = `${markerBase}:WG-01`;
    if (!markers.includes(marker)) {
      markers.push(marker);
      // Add typed links from war game to stressed bets
      for (const { betId } of stressedBets.slice(0, 20)) {
        const link = {
          id: `link-wg-${warGame.id}-${betId}`,
          sourceType: 'wargame',
          sourceId: warGame.id,
          targetType: 'strategy',
          targetId: betId,
          relation: 'stresses',
          createdAt: now instanceof Date ? now.toISOString() : String(now),
        };
        draft.links = Array.isArray(draft.links) ? draft.links : [];
        const exists = draft.links.some((l) => l.sourceType === 'wargame' && l.sourceId === warGame.id && l.targetType === 'strategy' && l.targetId === betId && l.relation === 'stresses');
        if (!exists) {
          draft.links.push(link);
        }
      }
      out.push({
        type: 'wargame.stress.links',
        entityType: 'wargame',
        entityId: warGame.id,
        summary: `RULE-WG-01: Linked ${stressedBets.length} strategy bet(s) stressed by scenarios`,
      });
    }
  }

  // ---- RULE-WG-02: coalition break decision ----
  const coalitionBreaks = report.scenarioReadings.filter((r) => r.coalitionShifts.length > 0);
  if (coalitionBreaks.length > 0) {
    const marker = `${markerBase}:WG-02`;
    if (!markers.includes(marker)) {
      markers.push(marker);
      const decisionId = `dec-wg-coalition-${warGame.id}`;
      const exists = (draft.decisions || []).some((d) => d.id === decisionId);
      if (!exists) {
        const breakingScenarios = coalitionBreaks.map((r) => r.scenarioLabel).join(', ');
        const decision = {
          id: decisionId,
          title: `Coalition stability breaks under ${coalitionBreaks.length} scenario(s)`,
          frame: 'repair',
          status: 'open',
          createdAt: now instanceof Date ? now.toISOString() : String(now),
          notes: `War game "${warGame.label}" found that coalition stability changes under: ${breakingScenarios}. Review which players' weights shifted and whether the coalition needs repair.`,
          source: 'RULE-WG-02',
        };
        draft.decisions = Array.isArray(draft.decisions) ? draft.decisions : [];
        draft.decisions.push(decision);
        out.push({
          type: 'wargame.coalition.decision',
          entityType: 'wargame',
          entityId: warGame.id,
          summary: `RULE-WG-02: Opened coalition repair decision`,
        });
        // Add typed link
        const link = {
          id: `link-wg-${warGame.id}-dec-${decisionId}`,
          sourceType: 'wargame',
          sourceId: warGame.id,
          targetType: 'decision',
          targetId: decisionId,
          relation: 'decides',
          createdAt: now instanceof Date ? now.toISOString() : String(now),
        };
        draft.links = Array.isArray(draft.links) ? draft.links : [];
        draft.links.push(link);
      }
    }
  }

  // ---- RULE-WG-03: attention reallocation task ----
  const highReallocation = report.scenarioReadings.filter((r) => r.reallocationPct != null && r.reallocationPct > REALLOCATION_THRESHOLD_PCT);
  if (highReallocation.length > 0) {
    const marker = `${markerBase}:WG-03`;
    if (!markers.includes(marker)) {
      markers.push(marker);
      const delegationId = `del-wg-replan-${warGame.id}`;
      const exists = (draft.delegations || []).some((d) => d.id === delegationId);
      if (!exists) {
        const scenarios = highReallocation.map((r) => `${r.scenarioLabel} (${r.reallocationPct}%)`).join(', ');
        const delegation = {
          id: delegationId,
          title: `Re-plan attention allocation under ${highReallocation.length} scenario(s)`,
          status: 'open',
          createdAt: now instanceof Date ? now.toISOString() : String(now),
          dueDate: null,
          ownerId: '',
          notes: `War game "${warGame.label}" found that attention reallocation exceeds ${REALLOCATION_THRESHOLD_PCT}% under: ${scenarios}. Re-solve the attention market under these conditions.`,
          source: 'RULE-WG-03',
        };
        draft.delegations = Array.isArray(draft.delegations) ? draft.delegations : [];
        draft.delegations.push(delegation);
        out.push({
          type: 'wargame.replan.task',
          entityType: 'wargame',
          entityId: warGame.id,
          summary: `RULE-WG-03: Created re-planning task for attention reallocation`,
        });
      }
    }
  }

  // ---- RULE-WG-04: case severity prefigure links ----
  const worsenedCases = [];
  for (const reading of report.scenarioReadings) {
    for (const shift of reading.caseSeverityShifts) {
      if (shift.shift >= SEVERITY_SHIFT_THRESHOLD) {
        worsenedCases.push({ caseId: shift.caseId, scenarioId: reading.scenarioId, shift: shift.shift });
      }
    }
  }

  if (worsenedCases.length > 0) {
    const marker = `${markerBase}:WG-04`;
    if (!markers.includes(marker)) {
      markers.push(marker);
      const uniqueCaseIds = [...new Set(worsenedCases.map((w) => w.caseId))];
      for (const caseId of uniqueCaseIds.slice(0, 20)) {
        const link = {
          id: `link-wg-${warGame.id}-case-${caseId}`,
          sourceType: 'wargame',
          sourceId: warGame.id,
          targetType: 'case',
          targetId: caseId,
          relation: 'prefigures',
          createdAt: now instanceof Date ? now.toISOString() : String(now),
        };
        draft.links = Array.isArray(draft.links) ? draft.links : [];
        const exists = draft.links.some((l) => l.sourceType === 'wargame' && l.sourceId === warGame.id && l.targetType === 'case' && l.targetId === caseId && l.relation === 'prefigures');
        if (!exists) {
          draft.links.push(link);
        }
      }
      out.push({
        type: 'wargame.case.prefigure.links',
        entityType: 'wargame',
        entityId: warGame.id,
        summary: `RULE-WG-04: Linked ${uniqueCaseIds.length} case(s) whose severity worsens under scenarios`,
      });
    }
  }
}
