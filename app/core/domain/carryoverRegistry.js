/**
 * app/core/domain/carryoverRegistry.js — canonical vocabulary for the Hoshin
 * Carryover Terminal (`#/carryover`, Schema v94, ADR-0088).
 *
 * Leaf registry importing only `chainRegistry.js` so `schema.js`,
 * `carryoverSchema.js`, `carryover.js`, `carryoverRules.js`,
 * `propagationContracts.js`, `csv.js` and `views/carryover.js` share one
 * source of truth without circular dependencies.
 *
 * The terminal closes the strategy loop that Session 124's double-loop
 * detection opened: when a Catchball pact settles as `thesis-invalidated`
 * (faithful execution, falsified upstream hypothesis), the bet it deployed
 * must be *settled* — stop rule judged, resources released — and the released
 * person-days and budget authority must re-enter the NEXT allocation cycle
 * instead of quietly disappearing.
 */

import { ALTITUDES, ALTITUDE_KEYS } from './chainRegistry.js';

export const CARRYOVER_ENGINE_VERSION = 'hoshin-carryover-2026.11-v1';

/** A carryover record's settlement state machine. */
export const CARRYOVER_STATUSES = Object.freeze([
  'pending-settlement',
  'settled-pending-release',
  'settled-released',
  'settled-withheld',
]);

export const CARRYOVER_STATUS_LABELS = Object.freeze({
  'pending-settlement': 'Awaiting stop-rule settlement',
  'settled-pending-release': 'Settled — release in flight',
  'settled-released': 'Settled and resources released',
  'settled-withheld': 'Settled — release withheld (with reason)',
});

/** Human settlement verdicts recorded against a bet's stop rule. */
export const CARRYOVER_SETTLEMENT_VERDICTS = Object.freeze([
  { key: 'retire-bet', label: 'Retire the bet', help: 'The thesis is falsified; retire the bet and release what it encumbered.' },
  { key: 'revise-stop-rule', label: 'Revise the stop rule', help: 'Keep the bet, judge it against a corrected rule and a new date.' },
  { key: 'reaffirm', label: 'Reaffirm with a new hypothesis', help: 'Keep the bet and replace the falsified causal mechanism.' },
]);

export const CARRYOVER_VERDICT_KEYS = CARRYOVER_SETTLEMENT_VERDICTS.map((v) => v.key);

/** Release outcomes for the resource bundle attached to a settled record. */
export const CARRYOVER_RELEASE_OUTCOMES = Object.freeze([
  'released',
  'withheld',
  'unencumbered',
  'already-spent',
]);

export const CARRYOVER_RELEASE_LABELS = Object.freeze({
  released: 'Released — authority returned',
  withheld: 'Withheld — release refused in writing',
  unencumbered: 'Nothing encumbered — nothing to release',
  'already-spent': 'Already spent — the money landed; no release possible',
});

/** How a record's bet was resolved (printed, never silently guessed). */
export const CARRYOVER_BET_BASES = Object.freeze([
  'pact.strategyBetId',
  'goal-tag',
  'trade-off-tag',
  'premise',
  'unresolved',
]);

/** Rule event types. */
export const CARRYOVER_EVENTS = Object.freeze({
  RECORDED: 'carryover.recorded',
  SCAN: 'carryover.scan',
  SETTLED: 'carryover.settled',
});

export const CARRYOVER_RULE_IDS = Object.freeze({
  ROLLUP: 'RULE-CO-01',
  SETTLEMENT: 'RULE-CO-02',
  BET_RETIRED: 'RULE-CO-03',
  CALIBRATION: 'RULE-CO-04',
});

export const CATCHBALL_TRIGGER_GRADED = 'catchball.pactSettled';

/** Declared conventions (bounds are UI-clamped; defaults are the printed ones). */
export const CARRYOVER_BOUNDS = Object.freeze({
  carryoverCellFloor: [1, 100],
  carryoverReliabilityFloorPct: [1, 100],
  carryoverGradingDelayDays: [0, 120],
  carryoverDecisionReviewDays: [1, 90],
});

export const CARRYOVER_DEFAULTS = Object.freeze({
  carryoverCellFloor: 5,
  carryoverReliabilityFloorPct: 60,
  carryoverGradingDelayDays: 14,
  carryoverDecisionReviewDays: 14,
});

export const CARRYOVER_LIMITS = Object.freeze({
  records: 300,
  markers: 400,
  gradings: 200,
});

/** Label conventions for the terminal's printed statements. */
export const CARRYOVER_ALTITUDE_PLAYBOOK = Object.freeze(
  ALTITUDES.map((alt) => ({
    key: alt.key,
    label: alt.label,
    shortLabel: alt.shortLabel,
    horizonDays: alt.horizonDays,
    duty: alt.key === 'lead'
      ? 'Settle the invalidated pact at the span; hand the falsified hypothesis up with the resource bundle.'
      : alt.key === 'manager'
        ? 'Coordinate the settlement decision; protect the receiving span while the bet is judged.'
        : alt.key === 'director'
          ? 'Judge the bet against its stop rule; retire, revise or reaffirm with a new hypothesis.'
          : alt.key === 'vp'
            ? 'Settle the portfolio question: what does this falsification release for the next allocation cycle?'
            : 'Steward the enterprise: aggregate invalidations, released capacity and settlement backlog.',
  })),
);

export const CARRYOVER_DECISION_LABELS = Object.freeze({
  'retire-bet': 'Retire the bet and release its encumbered resources',
  'revise-stop-rule': 'Revise the stop rule and set a new date',
  'reaffirm': 'Reaffirm the bet with a new causal hypothesis',
});

export const CARRYOVER_DECISION_OPTION_LABELS = Object.freeze({
  'retire-bet': 'Retire the bet',
  'revise-stop-rule': 'Revise the stop rule',
  'reaffirm': 'Reaffirm with a new hypothesis',
});

/** Vocabulary kept beside the registry so tests and the view import one place. */
export const CARRYOVER_BUDGET_LINE_STATUSES = Object.freeze(['planned', 'committed', 'spent', 'released']);
