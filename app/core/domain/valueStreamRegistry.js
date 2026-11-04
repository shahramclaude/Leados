/**
 * Canonical vocabulary for the Value Stream Exchange (Schema v95, ADR-0089).
 * A contract is a supplier→consumer SLA between peer spans, not a vertical
 * Catchball pact and not a person-level performance rating.
 */
import { ALTITUDES } from './chainRegistry.js';

export const VALUE_STREAM_ENGINE_VERSION = 'value-stream-exchange-2026.11-v1';
export const VALUE_STREAM_CONTRACT_STATUSES = Object.freeze(['proposed', 'countered', 'agreed', 'settled', 'withdrawn']);
export const VALUE_STREAM_ACTIVE_STATUSES = Object.freeze(['proposed', 'countered', 'agreed']);
export const VALUE_STREAM_ROUND_KINDS = Object.freeze(['propose', 'counter', 'accept', 'checkin', 'settle', 'withdraw']);
export const VALUE_STREAM_DIRECTIONS = Object.freeze(['at-least', 'at-most']);
export const VALUE_STREAM_SETTLEMENTS = Object.freeze(['fulfilled', 'missed']);
export const VALUE_STREAM_PANELS = Object.freeze(['network', 'contracts', 'carryover', 'rollup', 'brief']);
export const VALUE_STREAM_EVENTS = Object.freeze({
  PROPOSED: 'valuestream.contract_proposed',
  COUNTERED: 'valuestream.contract_countered',
  AGREED: 'valuestream.contract_agreed',
  CHECKIN: 'valuestream.contract_checkin',
  SETTLED: 'valuestream.contract_settled',
  WITHDRAWN: 'valuestream.contract_withdrawn',
  REALLOCATED: 'valuestream.reallocated',
  SCAN: 'valuestream.scan',
});
export const VALUE_STREAM_RULE_IDS = Object.freeze({
  NETWORK_ROLLUP: 'RULE-VS-01',
  SLA_GOVERNANCE: 'RULE-VS-02',
  CARRYOVER_LINEAGE: 'RULE-VS-03',
});
export const VALUE_STREAM_DEFAULTS = Object.freeze({
  valueStreamCellFloor: 3,
  valueStreamMaxDecisions: 4,
  valueStreamAutoPropagate: true,
});
export const VALUE_STREAM_BOUNDS = Object.freeze({
  valueStreamCellFloor: Object.freeze([2, 10]),
  valueStreamMaxDecisions: Object.freeze([1, 10]),
});
export const VALUE_STREAM_LIMITS = Object.freeze({ contracts: 250, rounds: 1200, reallocations: 250, markers: 500 });

/** Distinct duties by Jaques time-span; one engine, five operating jobs. */
export const VALUE_STREAM_ALTITUDE_PLAYBOOK = Object.freeze(ALTITUDES.map((alt) => {
  const byKey = {
    frontline: {
      duty: 'Make and verify weekly supplier promises; record actual SLA evidence.',
      question: 'What exactly does my downstream peer need, by when, and what must I stop to supply it?',
      disclosure: 'Exact terms only for own party contracts; no sideways ledger browsing.',
      action: 'Propose or accept as a party, counter capacity, and check in actuals.',
    },
    manager: {
      duty: 'Negotiate monthly cross-team hand-offs and remove local bottlenecks.',
      question: 'Which peer hand-off constrains the squad, and is the promised effort inside real capacity?',
      disclosure: 'Party terms and unit-level roll-ups; unrelated peer contracts stay hidden.',
      action: 'Counter scope/lead time, verify fulfilment, and escalate a structural constraint.',
    },
    director: {
      duty: 'Mediate quarterly cross-functional service levels in the lowest common span.',
      question: 'Which supplier–customer path is critical, and where does a local SLA miss become a portfolio delay?',
      disclosure: 'Exact terms when LCA mediator; unit detail inside the managed value stream.',
      action: 'Mediate the two parties and own the governed breach decision; never consent for either party.',
    },
    exec: {
      duty: 'Rebalance half-year capacity across value streams and stop falsified allocations.',
      question: 'How much committed authority can move from an invalidated bet without erasing spend or bypassing consent?',
      disclosure: 'Aggregate cells above the floor; exact terms only when explicitly mediating.',
      action: 'Review a stale-protected carryover preview and commit a proposed receiving pact.',
    },
    chief: {
      duty: 'Set the annual capital-exchange boundary and inspect enterprise flow.',
      question: 'Which cross-enterprise path and invalidated thesis should change the next-cycle capital allocation?',
      disclosure: 'Identity-free enterprise aggregates and drill-down through typed lineage; small cells withheld.',
      action: 'Govern cross-unit carryover, inspect critical-path exposure, and preserve audit/seal history.',
    },
  };
  return Object.freeze({ ...alt, ...(byKey[alt.key] || {}) });
}));
