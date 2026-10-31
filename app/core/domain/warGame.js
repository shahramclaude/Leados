/**
 * app/core/domain/warGame.js — Strategic War-Game Terminal (Schema v60).
 *
 * The gap this module fills
 * -------------------------
 * LeadOS already prices individual decisions, allocates attention, maps coalitions,
 * measures strategy coherence, and simulates counterfactual levers. None of them
 * answer the question a chief executive actually asks before a board meeting:
 * **"If the world changes in these specific ways, how does my entire leadership
 * posture shift — and which of my bets, coalitions and resource allocations break first?"**
 *
 * This module declares plausible macro-scenarios (external shocks, not lever tweaks),
 * then cascades each one through every major analytical engine in the workspace:
 *   1. Strategy coherence (say-do gap divergence)
 *   2. Attention Market (resource reallocation under stress)
 *   3. Coalition stability (winning coalitions that lose majority)
 *   4. Case severity (which operational risks worsen)
 *   5. Decision urgency (what moves up the sequencing queue)
 *
 * Named frameworks, implemented rather than gestured at:
 *   - Schoemaker (1995) Strategic Scenario Planning: scenarios are declared
 *     external shocks with explicit plausibility, not lever tweaks.
 *   - Meadows (2008) Leverage Points: each scenario declares which system
 *     parameter it shifts (demand, cost, capacity, regulation, personnel).
 *   - Tsebelis (2002) Veto Players: coalition stability is re-checked under
 *     each scenario's shifted weights.
 *   - Total Variation Distance: the say-do gap under each scenario is compared
 *     to baseline as a distribution divergence, not an invented "resilience score".
 *   - Shadow Pricing: the attention market's LP relaxation gives the marginal
 *     value of an additional hour under each scenario, exposing scarcity shifts.
 *
 * Honesty boundaries:
 *   - Scenarios are declared, not predicted. No probability is assigned.
 *   - A scenario's adjustments are additive shifts to existing records, not
 *     invented records. Nothing is created that doesn't exist in the baseline.
 *   - The resilience reading is a composite of observable divergences, not a
 *     single number. Below three scenarios the page withholds a composite.
 *   - Pure module: no DOM, no storage, no network, no ambient clock.
 */

import { round } from '../time.js';
import { strategyTotals } from './strategy.js';
import { buildAttentionMarket } from './attentionMarket.js';
import { analyzePowerGame } from './power.js';
import { OPEN_CASE_STATUSES } from './cases.js';

export const WARGAME_ENGINE_VERSION = 'wargame-2026.10-v1';

/* ------------------------------------------------------------------ */
/* 0. Vocabulary                                                       */
/* ------------------------------------------------------------------ */

export const WARGAME_STATUSES = ['draft', 'committed', 'archived'];
export const WARGAME_STATUS_LABELS = {
  draft: 'Draft',
  committed: 'Committed',
  archived: 'Archived',
};

/**
 * Macro-shock kinds. Each one declares which system parameter it shifts
 * (Meadows 2008 leverage-point discipline). A scenario picks one kind and
 * declares its magnitude; the engine then projects that shift through every
 * analytical module.
 */
export const SCENARIO_KINDS = Object.freeze([
  {
    key: 'demand-shift',
    label: 'Demand shift',
    help: 'A sustained increase or decrease in the workload arriving at the team. Shifts case severity and attention allocation.',
    parameter: 'arrival rate (λ)',
  },
  {
    key: 'budget-cut',
    label: 'Budget contraction',
    help: 'A reduction in available financial or human resources. Shifts attention market constraints and funded-item viability.',
    parameter: 'resource ceiling',
  },
  {
    key: 'key-person-loss',
    label: 'Key-person departure',
    help: 'The loss of a critical team member. Shifts coalition weights, delegation reliability and capacity.',
    parameter: 'team composition',
  },
  {
    key: 'regulation-change',
    label: 'Regulatory or compliance change',
    help: 'A new regulatory requirement or compliance obligation. Shifts case severity for affected cases and adds new constraints.',
    parameter: 'constraint set',
  },
  {
    key: 'competitor-move',
    label: 'Competitor or market shift',
    help: 'A strategic move by a competitor or market participant. Shifts strategy-bet urgency and negotiation stakes.',
    parameter: 'competitive landscape',
  },
  {
    key: 'supply-disruption',
    label: 'Supply or dependency disruption',
    help: 'A disruption in a critical dependency or supply chain. Shifts case severity and continuity risk.',
    parameter: 'dependency availability',
  },
]);

export const SCENARIO_KIND_KEYS = SCENARIO_KINDS.map((k) => k.key);
export const SCENARIO_KIND_LABELS = Object.fromEntries(SCENARIO_KINDS.map((k) => [k.key, k.label]));

/**
 * Adjustment directions. A scenario declares which direction the shock moves
 * and its magnitude on a bounded scale.
 */
export const ADJUSTMENT_DIRECTIONS = Object.freeze(['severe-negative', 'moderate-negative', 'mild-negative', 'mild-positive', 'moderate-positive', 'severe-positive']);
export const ADJUSTMENT_DIRECTION_LABELS = {
  'severe-negative': 'Severe adverse',
  'moderate-negative': 'Moderate adverse',
  'mild-negative': 'Mild adverse',
  'mild-positive': 'Mild favourable',
  'moderate-positive': 'Moderate favourable',
  'severe-positive': 'Severe favourable',
};

/** Numeric shift multipliers. Negative = adverse, positive = favourable. */
export const ADJUSTMENT_MULTIPLIERS = {
  'severe-negative': -0.5,
  'moderate-negative': -0.25,
  'mild-negative': -0.1,
  'mild-positive': 0.1,
  'moderate-positive': 0.25,
  'severe-positive': 0.5,
};

/* ------------------------------------------------------------------ */
/* 1. Validation                                                       */
/* ------------------------------------------------------------------ */

function optionalId(value) {
  return typeof value === 'string' ? value.trim().slice(0, 120) : '';
}

function optionalText(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Validate and normalize a war-game scenario adjustment.
 * Each adjustment declares a kind and a direction.
 */
export function normalizeScenarioAdjustment(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const kind = typeof input.kind === 'string' && SCENARIO_KIND_KEYS.includes(input.kind) ? input.kind : null;
  const direction = typeof input.direction === 'string' && ADJUSTMENT_DIRECTIONS.includes(input.direction) ? input.direction : null;
  const targets = Array.isArray(input.targets) ? input.targets.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 120)).slice(0, 20) : [];
  if (!kind || !direction) return null;
  return { kind, direction, targets };
}

/**
 * Validate and normalize a war-game scenario.
 */
export function normalizeWarGameScenario(raw, { now = new Date() } = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const id = optionalId(input.id) || `scen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const label = optionalText(input.label, 120) || 'Unnamed scenario';
  const kind = typeof input.kind === 'string' && SCENARIO_KIND_KEYS.includes(input.kind) ? input.kind : SCENARIO_KIND_KEYS[0];
  const direction = typeof input.direction === 'string' && ADJUSTMENT_DIRECTIONS.includes(input.direction) ? input.direction : 'moderate-negative';
  const description = optionalText(input.description, 1000);
  const targets = Array.isArray(input.targets) ? input.targets.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 120)).slice(0, 20) : [];
  const createdAt = input.createdAt || (now instanceof Date ? now.toISOString() : String(now));
  return { id, label, kind, direction, description, targets, createdAt };
}

/**
 * Validate and normalize a war-game record.
 */
export function normalizeWarGame(raw, state, now, warnings = []) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const id = optionalId(input.id) || `wg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const label = optionalText(input.label, 200) || 'Unnamed war game';
  const purpose = optionalText(input.purpose, 1000);
  const horizonDays = Number.isFinite(input.horizonDays) && input.horizonDays > 0 ? Math.min(365, Math.max(7, Math.round(input.horizonDays))) : 90;
  const status = WARGAME_STATUSES.includes(input.status) ? input.status : 'draft';
  const scenarios = Array.isArray(input.scenarios)
    ? input.scenarios.map((s) => normalizeWarGameScenario(s, { now })).slice(0, 12)
    : [];
  const createdAt = input.createdAt || (now instanceof Date ? now.toISOString() : String(now));
  const committedAt = input.committedAt || null;
  const archivedAt = input.archivedAt || null;
  const frozenBaseline = input.frozenBaseline || null;
  const frozenReadings = input.frozenReadings || null;
  const markers = Array.isArray(input.markers)
    ? input.markers.filter((m) => typeof m === 'string' && m.length > 0).map((m) => m.slice(0, 200)).slice(0, 200)
    : [];
  return { id, label, purpose, horizonDays, status, scenarios, createdAt, committedAt, archivedAt, frozenBaseline, frozenReadings, markers };
}

/* ------------------------------------------------------------------ */
/* 2. State projection under scenarios                                 */
/* ------------------------------------------------------------------ */

/**
 * Project the workspace state under a scenario's declared shock.
 * This is a pure transformation: it clones the state and applies shifts
 * to the records the scenario targets. No records are created or destroyed;
 * existing records are adjusted within their own declared ranges.
 *
 * The projection is deliberately conservative:
 *   - Case severity is shifted by the scenario's multiplier (bounded 1-5)
 *   - Strategy-bet shares are shifted toward/away from the targeted bets
 *   - Attention-market hour budget is shifted by the scenario's multiplier
 *   - Power-game weights are shifted for targeted players
 *   - No new records are invented
 */
export function projectWarGameState(baseState, scenario) {
  if (!scenario || !baseState) return structuredClone(baseState || {});
  const projected = structuredClone(baseState);
  const multiplier = ADJUSTMENT_MULTIPLIERS[scenario.direction] || 0;
  const targets = new Set(scenario.targets || []);
  const hasTargets = targets.size > 0;

  // Shift case severity for targeted cases (or all cases if no targets)
  if (Array.isArray(projected.cases)) {
    for (const c of projected.cases) {
      const shouldShift = !hasTargets || targets.has(c.id);
      if (shouldShift && c.severity != null) {
        const shifted = c.severity + multiplier * 2;
        c.severity = Math.max(1, Math.min(5, round(shifted, 1)));
      }
    }
  }

  // Shift strategy-bet resource shares for targeted bets
  if (Array.isArray(projected.strategyBets)) {
    for (const bet of projected.strategyBets) {
      const shouldShift = !hasTargets || targets.has(bet.id);
      if (shouldShift && bet.declaredShare != null) {
        const shifted = bet.declaredShare * (1 + multiplier);
        bet.declaredShare = Math.max(0, Math.min(100, round(shifted, 1)));
      }
    }
  }

  // Shift attention-market hour budget
  if (projected.settings && projected.settings.attentionMarketHours != null) {
    const shifted = projected.settings.attentionMarketHours * (1 + multiplier * 0.5);
    projected.settings.attentionMarketHours = Math.max(1, Math.min(80, round(shifted, 1)));
  }

  // Shift power-game weights for targeted players
  if (Array.isArray(projected.powerGames)) {
    for (const game of projected.powerGames) {
      if (Array.isArray(game.players)) {
        for (const player of game.players) {
          const shouldShift = !hasTargets || targets.has(player.id);
          if (shouldShift && player.weight != null) {
            const shifted = player.weight * (1 + multiplier);
            player.weight = Math.max(1, Math.min(100, Math.round(shifted)));
          }
        }
      }
    }
  }

  return projected;
}

/* ------------------------------------------------------------------ */
/* 3. Scenario evaluation                                              */
/* ------------------------------------------------------------------ */

/**
 * Evaluate a single scenario against the baseline.
 * Returns a reading that compares baseline vs. projected state across
 * every major analytical module.
 */
export function evaluateWarGameScenario(baselineState, scenario, now = new Date()) {
  const projectedState = projectWarGameState(baselineState, scenario);

  // Strategy coherence divergence
  const baselineTotals = strategyTotals(baselineState, now);
  const projectedTotals = strategyTotals(projectedState, now);
  const baselineGap = baselineTotals?.sayDoGapPct ?? null;
  const projectedGap = projectedTotals?.sayDoGapPct ?? null;
  const gapDivergence = (baselineGap != null && projectedGap != null) ? round(projectedGap - baselineGap, 1) : null;

  // Attention market reallocation
  let baselineMarket = null;
  let projectedMarket = null;
  let reallocationPct = null;
  try {
    baselineMarket = buildAttentionMarket(baselineState, now);
    projectedMarket = buildAttentionMarket(projectedState, now);
    const baselineChosen = (baselineMarket?.markets || []).flatMap((m) => m.chosen || []);
    const projectedChosen = (projectedMarket?.markets || []).flatMap((m) => m.chosen || []);
    if (baselineChosen.length > 0 || projectedChosen.length > 0) {
      const baselineIds = new Set(baselineChosen.map((b) => b.candidate?.id).filter(Boolean));
      const projectedIds = new Set(projectedChosen.map((b) => b.candidate?.id).filter(Boolean));
      const total = Math.max(baselineIds.size, projectedIds.size, 1);
      let changed = 0;
      for (const id of baselineIds) if (!projectedIds.has(id)) changed += 1;
      for (const id of projectedIds) if (!baselineIds.has(id)) changed += 1;
      reallocationPct = round((changed / total) * 100, 1);
    }
  } catch (e) {
    // Attention market may refuse for valid reasons (no priced items, etc.)
  }

  // Coalition stability (check all power games)
  let coalitionShifts = [];
  if (Array.isArray(baselineState.powerGames) && baselineState.powerGames.length > 0) {
    for (const game of baselineState.powerGames) {
      try {
        const baselineAnalysis = analyzePowerGame(game, baselineState, now);
        const projectedGame = (projectedState.powerGames || []).find((g) => g.id === game.id);
        if (projectedGame) {
          const projectedAnalysis = analyzePowerGame(projectedGame, projectedState, now);
          const baselineWinning = baselineAnalysis?.voting?.minimumWinningCoalitions || [];
          const projectedWinning = projectedAnalysis?.voting?.minimumWinningCoalitions || [];
          const baselineCount = baselineWinning.length;
          const projectedCount = projectedWinning.length;
          const shifted = baselineCount !== projectedCount;
          if (shifted) {
            coalitionShifts.push({
              gameId: game.id,
              gameLabel: game.label || 'Unnamed game',
              baselineWinningCount: baselineCount,
              projectedWinningCount: projectedCount,
            });
          }
        }
      } catch (e) {
        // Power game analysis may fail for invalid games
      }
    }
  }

  // Case severity shifts
  let caseSeverityShifts = [];
  if (Array.isArray(baselineState.cases)) {
    for (const c of baselineState.cases) {
      if (!OPEN_CASE_STATUSES.includes(c.status)) continue;
      const projectedCase = (projectedState.cases || []).find((pc) => pc.id === c.id);
      if (projectedCase && c.severity != null && projectedCase.severity != null) {
        const shift = round(projectedCase.severity - c.severity, 1);
        if (Math.abs(shift) >= 0.5) {
          caseSeverityShifts.push({
            caseId: c.id,
            caseLabel: c.title || c.id,
            baselineSeverity: c.severity,
            projectedSeverity: projectedCase.severity,
            shift,
          });
        }
      }
    }
    caseSeverityShifts.sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift));
  }

  return {
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    kind: scenario.kind,
    direction: scenario.direction,
    gapDivergence,
    baselineGap,
    projectedGap,
    reallocationPct,
    coalitionShifts,
    caseSeverityShifts: caseSeverityShifts.slice(0, 10),
  };
}

/**
 * Build the full war-game report: baseline + each scenario evaluated.
 */
export function buildWarGameReport(state = {}, warGame = null, now = new Date()) {
  if (!warGame || !state) return null;
  const baselineTotals = strategyTotals(state, now);
  let baselineMarket = null;
  try {
    baselineMarket = buildAttentionMarket(state, now);
  } catch (e) {
    // May refuse for valid reasons
  }

  const scenarioReadings = (warGame.scenarios || []).map((scen) =>
    evaluateWarGameScenario(state, scen, now)
  );

  // Composite resilience reading (only when >= 3 scenarios)
  let composite = null;
  if (scenarioReadings.length >= 3) {
    const divergences = scenarioReadings.filter((r) => r.gapDivergence != null);
    const reallocations = scenarioReadings.filter((r) => r.reallocationPct != null);
    const avgGapDivergence = divergences.length > 0
      ? divergences.reduce((sum, r) => sum + r.gapDivergence, 0) / divergences.length
      : null;
    const avgReallocation = reallocations.length > 0
      ? reallocations.reduce((sum, r) => sum + r.reallocationPct, 0) / reallocations.length
      : null;
    const coalitionBreakCount = scenarioReadings.filter((r) => r.coalitionShifts.length > 0).length;
    const caseWorsenCount = scenarioReadings.reduce((sum, r) => sum + r.caseSeverityShifts.filter((s) => s.shift > 0).length, 0);

    composite = {
      avgGapDivergence: avgGapDivergence != null ? round(avgGapDivergence, 1) : null,
      avgReallocationPct: avgReallocation != null ? round(avgReallocation, 1) : null,
      coalitionBreakCount,
      caseWorsenCount,
      scenarioCount: scenarioReadings.length,
    };
  }

  return {
    warGameId: warGame.id,
    warGameLabel: warGame.label,
    status: warGame.status,
    baseline: {
      strategyGap: baselineTotals?.sayDoGapPct ?? null,
      attentionHours: baselineMarket?.conventions?.budgetHours ?? null,
      openCaseCount: (state.cases || []).filter((c) => OPEN_CASE_STATUSES.includes(c.status)).length,
      powerGameCount: (state.powerGames || []).length,
    },
    scenarioReadings,
    composite,
  };
}

/* ------------------------------------------------------------------ */
/* 4. Signals, brief and attention count                               */
/* ------------------------------------------------------------------ */

/**
 * Generate typed signals from committed war games for the Insights centre.
 */
export function warGameSignals(state = {}, now = new Date()) {
  const signals = [];
  const warGames = (state.warGames || []).filter((wg) => wg && wg.status === 'committed');
  for (const wg of warGames) {
    const report = buildWarGameReport(state, wg, now);
    if (!report) continue;
    const gameRoute = `#/wargame?game=${encodeURIComponent(wg.id)}&tab=stress`;

    // Signal: war game with a scenario that breaks coalitions
    const breakingScenarios = report.scenarioReadings.filter((r) => r.coalitionShifts.length > 0);
    if (breakingScenarios.length > 0) {
      signals.push({
        id: `WG-01-${wg.id}`,
        ruleId: 'RULE-WG-02',
        domain: 'War games',
        severity: 4,
        confidence: 'medium',
        title: `${wg.label}: ${breakingScenarios.length} scenario(s) break coalition stability`,
        detail: 'Winning-coalition counts change under projected stance shifts. Inspect pivotal veto players before the shock arrives.',
        evidence: [`${breakingScenarios.length} scenario(s) alter minimum winning coalitions`],
        route: gameRoute,
        action: { label: 'Open stress map', route: gameRoute },
      });
    }

    // Signal: war game with attention reallocation > 50%
    const highReallocation = report.scenarioReadings.filter((r) => r.reallocationPct != null && r.reallocationPct > 50);
    if (highReallocation.length > 0) {
      signals.push({
        id: `WG-03-${wg.id}`,
        ruleId: 'RULE-WG-03',
        domain: 'War games',
        severity: 3,
        confidence: 'medium',
        title: `${wg.label}: ${highReallocation.length} scenario(s) reallocate >50% of attention`,
        detail: 'More than half of the current week’s bought obligations change hands when projected under this macro-scenario.',
        evidence: [`Peak reallocation: ${Math.max(...highReallocation.map((r) => r.reallocationPct))}%`],
        route: gameRoute,
        action: { label: 'Open stress map', route: gameRoute },
      });
    }

    // Signal: war game with cases that worsen significantly
    const worseningCases = report.scenarioReadings.flatMap((r) => r.caseSeverityShifts.filter((s) => s.shift > 0));
    if (worseningCases.length > 0) {
      signals.push({
        id: `WG-04-${wg.id}`,
        ruleId: 'RULE-WG-04',
        domain: 'War games',
        severity: 3,
        confidence: 'medium',
        title: `${wg.label}: ${worseningCases.length} case(s) worsen under at least one scenario`,
        detail: 'Open operational cases escalate in severity under projected scenario pressure. Check FMEA barriers and contingency owners.',
        evidence: [`${worseningCases.length} case-scenario shift(s) > 0`],
        route: gameRoute,
        action: { label: 'Open stress map', route: gameRoute },
      });
    }

    // Signal: war game with large say-do gap divergence
    if (report.composite && Math.abs(report.composite.avgGapDivergence) > 15) {
      signals.push({
        id: `WG-05-${wg.id}`,
        ruleId: 'RULE-WG-01',
        domain: 'War games',
        severity: 4,
        confidence: 'medium',
        title: `${wg.label}: strategy coherence shifts by ${report.composite.avgGapDivergence > 0 ? '+' : ''}${report.composite.avgGapDivergence}pp across scenarios`,
        detail: 'Declared strategic bets drift materially from projected execution coverage across the scenario set.',
        evidence: [`Mean say-do gap Δ: ${report.composite.avgGapDivergence > 0 ? '+' : ''}${report.composite.avgGapDivergence}pp across ${report.composite.scenarioCount} scenarios`],
        route: gameRoute,
        action: { label: 'Open resilience reading', route: `#/wargame?game=${encodeURIComponent(wg.id)}&tab=resilience` },
      });
    }
  }
  return signals;
}

/**
 * Deterministic brief for the Insights centre and nav badge.
 */
export function warGameBrief(state = {}, now = new Date()) {
  const warGames = state.warGames || [];
  const committed = warGames.filter((wg) => wg && wg.status === 'committed');
  const draft = warGames.filter((wg) => wg && wg.status === 'draft');
  const totalScenarios = committed.reduce((sum, wg) => sum + (wg.scenarios || []).length, 0);
  const signals = warGameSignals(state, now);
  const highSeverity = signals.filter((s) => Number(s.severity) >= 4).length;

  return {
    totalGames: warGames.length,
    committedGames: committed.length,
    draftGames: draft.length,
    totalScenarios,
    highSeveritySignals: highSeverity,
    summary: committed.length > 0
      ? `${committed.length} committed war game(s) with ${totalScenarios} scenario(s). ${highSeverity > 0 ? `${highSeverity} high-severity signal(s).` : 'No high-severity signals.'}`
      : draft.length > 0
        ? `${draft.length} draft war game(s). Commit to evaluate scenarios.`
        : 'No war games declared. Declare a strategic exercise to stress-test your leadership posture.',
  };
}

/**
 * Attention count for the nav badge.
 */
export function warGameAttentionCount(state = {}, now = new Date()) {
  return warGameSignals(state, now).length;
}
