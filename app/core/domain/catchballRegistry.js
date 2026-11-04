/**
 * app/core/domain/catchballRegistry.js — canonical vocabulary for the Hoshin
 * Kanri & Catchball Cascade Terminal (`#/catchball`, Schema v90, ADR-0084).
 *
 * Leaf registry importing only `chainRegistry.js` so `schema.js`,
 * `catchballSchema.js`, `catchball.js`, `catchballRules.js`,
 * `propagationContracts.js`, `csv.js` and `views/catchball.js` share one
 * source of truth without circular dependencies.
 */

import { ALTITUDES, ALTITUDE_KEYS } from './chainRegistry.js';

export const CATCHBALL_ENGINE_VERSION = 'hoshin-catchball-2026.11-v1';

export const PACT_STATUSES = Object.freeze([
  'proposed',
  'countered',
  'agreed',
  'settled',
  'withdrawn',
]);

export const ACTIVE_PACT_STATUSES = Object.freeze([
  'proposed',
  'countered',
  'agreed',
]);

export const ROUND_KINDS = Object.freeze([
  'propose',
  'counter',
  'accept',
  'checkin',
  'withdraw',
]);

export const COUNTER_MECHANISMS = Object.freeze([
  'none',
  'scope-trim',
  'trade-off',
  'resource-ask',
]);

export const COUNTER_MECHANISM_LABELS = Object.freeze({
  none: 'Direct proposal / acceptance',
  'scope-trim': 'Scope or horizon trim (revised target or date)',
  'trade-off': 'Explicit trade-off (de-scope an active commitment)',
  'resource-ask': 'Resource ask (capacity or budget encumbrance)',
});

export const CORRELATION_STRENGTHS = Object.freeze([
  'strong',
  'moderate',
  'supporting',
]);

export const CORRELATION_WEIGHTS = Object.freeze({
  strong: 1.0,
  moderate: 0.6,
  supporting: 0.3,
});

export const CORRELATION_SYMBOLS = Object.freeze({
  strong: '● Strong (1.0)',
  moderate: '◐ Moderate (0.6)',
  supporting: '○ Supporting (0.3)',
});

export const TRADEOFF_SOURCE_TYPES = Object.freeze([
  'portfolio',
  'goal',
  'case',
]);

export const GRADED_OUTCOMES = Object.freeze([
  'delivered',
  'missed',
  'thesis-invalidated',
]);

export const GRADED_OUTCOME_LABELS = Object.freeze({
  delivered: 'Delivered (target met)',
  missed: 'Missed (execution fell short)',
  'thesis-invalidated': 'Thesis invalidated (leading held, bet falsified)',
});

export const BOWLER_STATES = Object.freeze([
  'unmeasured',
  'aligned',
  'execution-drift',
  'outcome-lag',
  'lucky-variance',
  'thesis-suspect',
]);

export const BOWLER_STATE_LABELS = Object.freeze({
  unmeasured: 'Unmeasured (awaiting bowler check-in)',
  aligned: 'Aligned (leading & lagging on track)',
  'execution-drift': 'Execution drift (leading inputs lagging plan)',
  'outcome-lag': 'Outcome lag (leading inputs holding; continue observation)',
  'lucky-variance': 'Lucky variance (lagging green without leading inputs)',
  'thesis-suspect': 'Thesis suspect — execution exonerated (double-loop)',
});

export const CATCHBALL_PANELS = Object.freeze([
  'matrix',
  'workbench',
  'watermelon',
  'calibration',
  'brief',
]);

export const CATCHBALL_EVENTS = Object.freeze({
  PROPOSED: 'catchball.proposed',
  COUNTERED: 'catchball.countered',
  AGREED: 'catchball.agreed',
  CHECKIN: 'catchball.checkin',
  GRADED: 'catchball.graded',
  WITHDRAWN: 'catchball.withdrawn',
  SCAN: 'catchball.scan',
});

export const CATCHBALL_RULE_IDS = Object.freeze({
  ROLLUP: 'RULE-HK-01',
  WATERMELON_THESIS: 'RULE-HK-02',
  CALIBRATION_FANOUT: 'RULE-HK-03',
});

export const CATCHBALL_DEFAULTS = Object.freeze({
  catchballWatermelonGapPct: 25,
  catchballLeadingFloorPct: 80,
  catchballLaggingFloorPct: 70,
  catchballThesisRedPct: 35,
  catchballFloorN: 5,
  catchballReliabilityFloorPct: 70,
  catchballCellFloor: 3,
  catchballMaxFanout: 4,
  catchballAutoPropagate: true,
});

export const CATCHBALL_BOUNDS = Object.freeze({
  catchballWatermelonGapPct: Object.freeze([10, 60]),
  catchballLeadingFloorPct: Object.freeze([50, 95]),
  catchballLaggingFloorPct: Object.freeze([40, 95]),
  catchballThesisRedPct: Object.freeze([10, 60]),
  catchballFloorN: Object.freeze([3, 20]),
  catchballReliabilityFloorPct: Object.freeze([40, 95]),
  catchballCellFloor: Object.freeze([2, 10]),
  catchballMaxFanout: Object.freeze([2, 10]),
});

export const CATCHBALL_LIMITS = Object.freeze({
  pacts: 250,
  rounds: 1000,
  markers: 400,
});

/**
 * Five-altitude Hoshin & Catchball operating contract aligned with
 * `ALTITUDES` in `chainRegistry.js` (7 / 30 / 90 / 180 / 365 days).
 */
export const CATCHBALL_ALTITUDE_PLAYBOOK = Object.freeze(
  ALTITUDES.map((alt) => {
    const byKey = {
      frontline: {
        disclosure: 'names',
        quadrantRole: 'Weekly leading-process commitments & capacity feasibility',
        catchballQuestion: 'Can this team execute the weekly leading cadence inside real person-day supply without silent overload?',
        negotiationRight: 'Accept within headroom, or counter upward with a concrete scope-trim, trade-off, or resource-ask.',
      },
      manager: {
        disclosure: 'names',
        quadrantRole: 'Monthly squad pacts, bilateral Catchball trades & 1:1 alignment',
        catchballQuestion: 'Which active commitment comes off the table when a new strategic pact lands on a saturated squad?',
        negotiationRight: 'Translate quarterly objectives into 30-day pacts, price de-scoped items, and record bowler check-ins.',
      },
      director: {
        disclosure: 'unit',
        quadrantRole: 'Quarterly functional X-Matrix, bottleneck floor & cross-team arbitration',
        catchballQuestion: 'Where does a green average mask a red weakest-link span, and is cascade fan-out staying focused?',
        negotiationRight: 'Deploy annual bets into functional pacts, arbitrate trade-offs across managers, and resolve watermelons.',
      },
      exec: {
        disclosure: 'aggregate',
        quadrantRole: 'Semi-annual portfolio X-Matrix, budget encumbrance & double-loop thesis review',
        catchballQuestion: 'Are funded bets backed by encumbered authority, and which red outcomes actually falsify our causal bet?',
        negotiationRight: 'Fund resource-asks against open budgets, review Fréchet joint delivery bounds, and pivot invalidated bets.',
      },
      chief: {
        disclosure: 'aggregate',
        quadrantRole: 'Annual enterprise Breakthrough Bets, cascade coherence & Brier calibration',
        catchballQuestion: 'Does every Breakthrough Bet have capacity-verified deployment, and do negotiated pacts outperform top-down mandates?',
        negotiationRight: 'Steward Breakthrough Bets, inspect small-cell-safe cascade health, and export board-ready briefs.',
      },
    }[alt.key];
    return Object.freeze({
      key: alt.key,
      rank: alt.rank,
      label: alt.label,
      shortLabel: alt.shortLabel,
      horizonDays: alt.horizonDays,
      ...byKey,
    });
  }),
);

export { ALTITUDE_KEYS };
