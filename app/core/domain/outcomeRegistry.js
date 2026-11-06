/**
 * ADR-0107 — the Outcome Learning Loop: declared vocabulary and subscriptions.
 *
 * A unit of analysis the workspace did not have: ONE ADOPTED CROSS-MODULE
 * RESPONSE. Session 146 reconciles that response from dated terminal evidence;
 * nothing freezes what the organisation expected when it adopted the response,
 * grades that expectation once, or carries the pooled result up the reporting
 * tree. The declarations here are shared by the engine, the rules, the schema
 * normalizers and the UI so no second vocabulary can drift away from the first.
 *
 * Named frameworks (doctrine §0.2), implemented in outcomePrior.js:
 *   - Brier (1950) proper scoring on a tri-state human outcome;
 *   - Wilson (1927) score interval on the pooled realised rate;
 *   - Vovk et al. (2005) split-conformal one-sided finite-sample coverage;
 *   - Kahneman & Tversky (1979) / Flyvbjerg (2006) reference-class forecasting,
 *     here computed from the workspace's OWN settled loops, shrunk toward the
 *     maximum-entropy 0.5 prior (Laplace / Beta(1,1)) so a thin record cannot
 *     masquerade as a base rate.
 *   - PDCA / Deming: Check and Act are separated, so a good outcome on thin
 *     delivery is labelled LUCK, not earned.
 */
import { BUNDLE_EVENTS } from './actionBundleRegistry.js';
import { EXECUTION_EVENTS, EXECUTION_SCAN_EVENT } from './executionRegistry.js';
import { MISSION_EVENTS } from './missionRegistry.js';

export const OUTCOME_VERSION = 'outcome-learning-2026.11-v1';
export const OUTCOME_RULE_IDS = Object.freeze({
  FREEZE: 'RULE-OLN-01',
  GRADE: 'RULE-OLN-02',
  STALE: 'RULE-OLN-03',
  BIAS: 'RULE-OLN-04',
});
export const OUTCOME_SCAN_EVENT = 'outcome.scan';
export const OUTCOME_PRIOR_EVENT = 'outcome.prior.declared';
export const OUTCOME_CHANGED_EVENT = 'outcome.contract.changed';

/** Human outcome values. `mixed` is a real half, never rounded into success. */
export const OUTCOME_VALUES = Object.freeze({ good: 1, mixed: 0.5, bad: 0 });
export const OUTCOME_LABELS = Object.freeze({ good: 'Good', mixed: 'Mixed', bad: 'Bad' });
export const OUTCOME_FORECAST_SOURCES = Object.freeze(['decision-command', 'premise-command', 'human', 'none']);
export const OUTCOME_CONTRACT_STATES = Object.freeze(['open', 'graded', 'ungradable']);
export const OUTCOME_GRADE_STATES = Object.freeze(['graded', 'ungradable']);
/** A quadrant is an ASSOCIATION between delivery fidelity and outcome, never a cause. */
export const OUTCOME_VERDICTS = Object.freeze(['earned', 'lucky', 'variance', 'fixable', 'ungradable']);
export const OUTCOME_VERDICT_LABELS = Object.freeze({
  earned: 'Earned — delivered and worked',
  lucky: 'Lucky — worked on thin delivery',
  variance: 'Variance — delivered, outcome bad',
  fixable: 'Fixable — thin delivery, outcome bad',
  ungradable: 'Refused — no frozen forecast or no human outcome',
});
export const OUTCOME_LIMITS = Object.freeze({
  contracts: 200,
  grades: 200,
  markers: 400,
  pointers: 12,
  ancestors: 16,
  fidelityFloorPct: 75,
});

/** Root events that can change the frozen expectation or its terminal evidence. */
export const OUTCOME_EVENTS = Object.freeze([...new Set([
  ...EXECUTION_EVENTS,
  BUNDLE_EVENTS.COMMITTED, BUNDLE_EVENTS.WITHDRAWN, BUNDLE_EVENTS.SCAN,
  MISSION_EVENTS.CAPTURE_ADOPTED, EXECUTION_SCAN_EVENT, OUTCOME_SCAN_EVENT, OUTCOME_PRIOR_EVENT,
])]);

/** Only these root events may freeze a NEW expectation. No scan on every write. */
export const OUTCOME_FREEZE_EVENTS = Object.freeze([
  BUNDLE_EVENTS.COMMITTED, BUNDLE_EVENTS.SCAN, MISSION_EVENTS.CAPTURE_ADOPTED,
  EXECUTION_SCAN_EVENT, OUTCOME_SCAN_EVENT, OUTCOME_PRIOR_EVENT,
]);
/** Governed stale/bias work is deliberately scan-only plus two rare settlements. */
export const OUTCOME_GOVERNANCE_EVENTS = Object.freeze([
  OUTCOME_SCAN_EVENT, BUNDLE_EVENTS.SCAN, EXECUTION_SCAN_EVENT,
  'decision.reviewed', 'case.resolved',
]);

export const OUTCOME_ALTITUDE_QUESTIONS = Object.freeze({
  1: 'Which of my own responses has a frozen expectation, and did the delivery evidence earn the outcome?',
  2: 'Where does my span keep running late or declaring confidence it has not earned?',
  3: 'Which child spans show a pooled gap, with small cells withheld rather than guessed?',
  4: 'Is the portfolio’s declared confidence calibrated, and does that change the price of waiting?',
  5: 'Can I tell the board the organisation’s own settled loops are measured, with every refusal named?',
});

export const OUTCOME_METHOD = Object.freeze({
  scoring: 'Brier (1950) proper score on a tri-state human outcome; base rate is the strictly-prior maximum-entropy 0.5, never a fitted curve.',
  interval: 'Wilson (1927) 95% score interval on the pooled realised rate; small cells are withheld, never printed as zero.',
  conformal: 'One-sided split-conformal upper bound on days past the declared horizon (Vovk et al., 2005), k = ceil((n+1)·coverage); refused below the declared grade floor. Assumes exchangeable loops — printed, not proven.',
  outsideView: 'Reference-class forecasting (Kahneman & Tversky, 1979; Flyvbjerg, 2006) on this workspace’s OWN graded loops, shrunk toward 0.5 by a declared k. An outside view is printed beside a leader’s forecast; it never overwrites one.',
  disclosure: 'Primary + complementary small-cell suppression with interval parent totals. Not differential privacy. No title, note, person name, proof pointer or forecast id travels above the individual-detail ceiling.',
  causal: 'Software reconciliation and association only. No causal claim about business benefit is made or implied.',
});
