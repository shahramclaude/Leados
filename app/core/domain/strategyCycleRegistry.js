/**
 * Bounded operating contract for the Hoshin renewal bridge. This is an
 * evidence/decision workflow, not an optimizer, causal claim, or spend engine.
 */
export const STRATEGY_CYCLE_ENGINE_VERSION = 'strategy-cycle-v1';

export const STRATEGY_CYCLE_LIMITS = Object.freeze({
  readings: 180,
  markers: 720,
  cohortPacts: 48,
  linksPerReading: 120,
  horizonDays: 730,
  historyRows: 40,
});

export const STRATEGY_CYCLE_DEFAULTS = Object.freeze({
  strategyCycleEvidenceFloor: 5,
  strategyCycleCellFloor: 3,
  strategyCycleAutoPropagate: true,
});

export const STRATEGY_CYCLE_RULE_IDS = Object.freeze({
  cycle: 'RULE-SCR-01',
  retiredBet: 'RULE-SCR-02',
});

export const STRATEGY_CYCLE_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Commitment recovery',
    horizon: 'Next 7–30 days',
    focus: 'Make one feasible promise, name the work that must stop, and surface blockers before the next hand-off.',
    decision: 'What can I finish, renegotiate, or stop before the next check-in?',
    handoff: 'Carry the named blocker and its next review date to the manager; do not carry a person score.',
    see: 'Your own commitments and the exact work in your operating span.',
    action: 'Freeze a dated local review; any change still goes through Catchball.',
  }),
  manager: Object.freeze({
    title: 'Capacity and delivery balance',
    horizon: '30–90 days',
    focus: 'Reconcile the team’s open promises, overdue work, carryover, and available effort before accepting another cascade.',
    decision: 'Which promise needs capacity, a smaller scope, or a negotiated date?',
    handoff: 'Roll up unresolved work and the minimum evidence needed by the director.',
    see: 'Named work in your span; sibling and higher-altitude detail is withheld.',
    action: 'Negotiate with the owning seat; never silently reassign its pact.',
  }),
  director: Object.freeze({
    title: 'Bet-to-delivery coherence',
    horizon: '90–180 days',
    focus: 'Compare active Hoshin bets with the Catchball commitments and effort tied to each bet.',
    decision: 'Is the portfolio still executable, and what evidence would change the bet?',
    handoff: 'Escalate a bounded reinvestment choice with its sample floor and unmeasured work visible.',
    see: 'Bet-level allocation and delivery evidence; small cells are suppressed.',
    action: 'Frame a reversible choice; strategy verdicts and funding remain human decisions.',
  }),
  exec: Object.freeze({
    title: 'Portfolio renewal gate',
    horizon: '180–365 days',
    focus: 'Inspect privacy-safe portfolio exposure and calibrated uncertainty, not identifiable local rows.',
    decision: 'Which strategic outcome merits renewed attention, and what must be stopped first?',
    handoff: 'Carry the evidence boundary, scenarios, and explicit owners to the enterprise root.',
    see: 'Suppressed child-span aggregates and bounded enterprise comparisons.',
    action: 'Authorize a review or decision record; no budget is moved by the engine.',
  }),
  chief: Object.freeze({
    title: 'Enterprise strategy renewal',
    horizon: '365–730 days',
    focus: 'Test whether the strategy’s commitments, outcomes, and learning cadence still agree across the whole system.',
    decision: 'What should be renewed, revised, or retired—and what evidence would falsify that choice?',
    handoff: 'Publish a dated, aggregate-only learning line and return an explicit direction to the next cycle.',
    see: 'Workspace-level counts, calibrated ranges, and deliberately withheld small cells.',
    action: 'Record the human choice; the system cannot commit funding or infer causality.',
  }),
});

export const STRATEGY_CYCLE_DISCLOSURE = Object.freeze({
  local: 'Operating seats are local workflow declarations, not authenticated multi-user security. Detailed work follows the seat’s reporting span; higher-altitude summaries use small-cell suppression. Suppression reduces simple differencing but is not differential privacy.',
  forecast: 'The delivery range is a historical reference interval, not a forecast or causal estimate. It is withheld below the configured evidence floor.',
  scenario: 'The reinvestment view is a transparent effort-weighted counterfactual. It does not change budgets, bets, owners, dates, or Catchball pacts.',
  rollup: 'A frozen reading contains identity-reduced counts and typed provenance. It never copies pact titles, notes, person names, or decision text into the snapshot.',
});

export const STRATEGY_CYCLE_PLAYBOOK_KEYS = Object.freeze(Object.keys(STRATEGY_CYCLE_PLAYBOOK));
