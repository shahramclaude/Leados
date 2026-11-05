/**
 * app/core/domain/escalationRegistry.js — canonical vocabulary for the
 * Escalation Economy terminal (`#/escalation`, Schema v94, ADR-0088).
 *
 * THE GAP THIS CLOSES
 * -------------------
 * The 2026 market sells "escalation management" and means ticket routing:
 * ServiceNow, Jira Service Management, PagerDuty, Zendesk and the AI-support
 * entrants (Fini, Forethought, Traversal) all answer *who gets paged next and
 * how fast*. Not one of them answers the question that decides whether an
 * organisation can think: **is this problem being decided at the level that
 * holds the information, and what did passing it upward actually buy?**
 *
 * LeadOS already measures cognitive load on a person (`load.js`, Sweller +
 * Little + Kingman) and the transmission of bad news up declared channels
 * (`signalPath.js`, Shannon + signal detection + the mum effect). Neither
 * models the *escalation decision* — the moment a leader chooses to absorb a
 * problem or hand it upward — its price, its yield, or the incentive that
 * produced it. This module does, with named theory and exact arithmetic.
 *
 * Leaf registry importing only `chainRegistry.js` so `schema.js`,
 * `escalationSchema.js`, `escalation.js`, `escalationRules.js`,
 * `propagationContracts.js`, `csv.js` and `views/escalation.js` share one
 * source of truth without circular dependencies.
 */

import { ALTITUDES, ALTITUDE_KEYS } from './chainRegistry.js';

export const ESCALATION_ENGINE_VERSION = 'escalation-economy-2026.11-v1';

/** The two dispositions of every decision moment. Nothing else is a choice. */
export const DISPOSITIONS = Object.freeze(['absorbed', 'escalated']);

/**
 * Why a leader passed the item up. `cover` is the moral-hazard tell and is
 * named as deliberately as it is uncomfortable: Holmström & Milgrom (1991)
 * predict that an unmeasured task starves, and asking for cover is exactly the
 * unmeasured task that no performance system has ever counted.
 */
export const ESCALATION_REASONS = Object.freeze([
  'authority',
  'information',
  'risk-materiality',
  'precedent',
  'cross-span',
  'capacity',
  'cover',
  'other',
]);

export const ESCALATION_REASON_LABELS = Object.freeze({
  authority: 'Outside my decision rights (I may not decide this)',
  information: 'I lack the information to decide it well',
  'risk-materiality': 'The downside exceeds my mandate',
  precedent: 'It sets a precedent beyond my span',
  'cross-span': 'Needs arbitration above both spans',
  capacity: 'I lack the bandwidth to decide it well',
  cover: 'I want cover for a decision I could make (defensive escalation)',
  other: 'Other (recorded, not categorised)',
});

/** Which reason codes are structural vs. which are the incentive problem. */
export const DEFENSIVE_REASONS = Object.freeze(['cover', 'capacity']);

export const RECORD_STATUSES = Object.freeze(['open', 'received', 'settled', 'returned']);
export const OPEN_RECORD_STATUSES = Object.freeze(['open', 'received']);

/**
 * How the receiving level resolved it. `endorsed` means the higher level took
 * the decision the lower level proposed — the escalation moved the *risk*, not
 * the *answer*. That distinction is the whole point of the yield metric.
 */
export const RESOLUTIONS = Object.freeze(['endorsed', 'overruled', 'returned']);

export const RESOLUTION_LABELS = Object.freeze({
  endorsed: 'Endorsed the proposal (moved the risk, not the answer)',
  overruled: 'Decided differently from the proposal',
  returned: 'Returned downward with authority to decide',
});

export const SOURCE_TYPES = Object.freeze(['case', 'decision', 'delegation', 'goal', 'dependency', 'other']);

export const ESCALATION_EVENTS = Object.freeze({
  LOGGED: 'escalation.logged',
  RECEIVED: 'escalation.received',
  SETTLED: 'escalation.settled',
  RETURNED: 'escalation.returned',
  COMMITTED: 'escalation.committed',
  GRADED: 'escalation.graded',
  SCAN: 'escalation.scan',
});

export const ESCALATION_RULE_IDS = Object.freeze({
  ROLLUP: 'RULE-ESC-01',
  QUEUE_OVERLOAD: 'RULE-ESC-02',
  PURE_OVERHEAD: 'RULE-ESC-03',
  COMMITMENT_BREACH: 'RULE-ESC-04',
  MONKEY_RETURN: 'RULE-ESC-05',
});

export const ESCALATION_PANELS = Object.freeze(['ledger', 'queue', 'yield', 'authority', 'brief', 'publication']);

export const VERDICTS = Object.freeze([
  'insufficient',
  'decided-where-it-arose',
  'escalation-market-healthy',
  'over-escalating',
  'pure-overhead',
  'under-escalating',
  'de-facto-centralised',
  'de-facto-decentralised',
  'queue-saturated',
  'queue-unstable',
  'within-commitment',
  'above-commitment',
  'below-commitment',
  'unmeasured',
]);

export const VERDICT_LABELS = Object.freeze({
  insufficient: 'Below the evidence floor — refused, not zero',
  'decided-where-it-arose': 'Decided where it arose (subsidiarity holds)',
  'escalation-market-healthy': 'Escalation market healthy',
  'over-escalating': 'Over-escalating (rate above the declared band)',
  'pure-overhead': 'Pure overhead — escalation is not changing the answer',
  'under-escalating': 'Under-escalating (material items absorbed too low)',
  'de-facto-centralised': 'De facto centralised (formal authority delegated, real authority taken)',
  'de-facto-decentralised': 'De facto decentralised (decisions taken below the declared authority)',
  'queue-saturated': 'Queue saturated (utilisation above the red floor)',
  'queue-unstable': 'Queue unstable (arrivals at or above service rate)',
  'within-commitment': 'Within the declared intervention-rate commitment',
  'above-commitment': 'Above the declared intervention-rate commitment',
  'below-commitment': 'Below the declared commitment (shadow authority below)',
  unmeasured: 'No commitment declared — unmeasured',
});

/** Declared conventions. Every one is printed beside its own number in the UI. */
export const ESCALATION_DEFAULTS = Object.freeze({
  escalationFloorN: 5,
  escalationCellFloor: 5,
  escalationWindowDays: 90,
  escalationYieldFloorPct: 20,
  escalationRateRedPct: 60,
  escalationUtilisationRedPct: 85,
  escalationServiceRatePerWeek: 8,
  escalationServiceScv: 1.25,
  escalationContextLossPerRungPct: 15,
  escalationReturnDays: 10,
  escalationReviewDays: 14,
  escalationHoursPerEscalation: 2.5,
  escalationCurrency: 'USD',
  escalationRateFrontline: 40,
  escalationRateManager: 65,
  escalationRateDirector: 100,
  escalationRateExec: 160,
  escalationRateChief: 250,
  escalationAutoPropagate: true,
});

export const ESCALATION_BOUNDS = Object.freeze({
  escalationFloorN: Object.freeze([3, 40]),
  escalationCellFloor: Object.freeze([2, 20]),
  escalationWindowDays: Object.freeze([14, 730]),
  escalationYieldFloorPct: Object.freeze([5, 60]),
  escalationRateRedPct: Object.freeze([30, 95]),
  escalationUtilisationRedPct: Object.freeze([50, 99]),
  escalationServiceRatePerWeek: Object.freeze([0.5, 80]),
  escalationServiceScv: Object.freeze([0.25, 4]),
  escalationContextLossPerRungPct: Object.freeze([0, 49]),
  escalationReturnDays: Object.freeze([1, 90]),
  escalationReviewDays: Object.freeze([1, 180]),
  escalationHoursPerEscalation: Object.freeze([0.25, 80]),
  escalationRateFrontline: Object.freeze([0, 100000]),
  escalationRateManager: Object.freeze([0, 100000]),
  escalationRateDirector: Object.freeze([0, 100000]),
  escalationRateExec: Object.freeze([0, 100000]),
  escalationRateChief: Object.freeze([0, 100000]),
});

export const ESCALATION_LIMITS = Object.freeze({
  records: 600,
  commitments: 200,
  markers: 400,
});

/** Declared hourly cost rate per altitude, used only to price the tax. */
export const ALTITUDE_RATE_KEYS = Object.freeze({
  frontline: 'escalationRateFrontline',
  manager: 'escalationRateManager',
  director: 'escalationRateDirector',
  exec: 'escalationRateExec',
  chief: 'escalationRateChief',
});

/**
 * Five-altitude operating contract aligned with `ALTITUDES` in
 * `chainRegistry.js` (7 / 30 / 90 / 180 / 365 days).
 */
export const ESCALATION_ALTITUDE_PLAYBOOK = Object.freeze(
  ALTITUDES.map((alt) => {
    const byKey = {
      frontline: {
        disclosure: 'names',
        duty: 'Absorb what the team can decide; escalate only what it cannot.',
        question: 'Should I absorb this or pass it up — and am I passing it up for a real reason or for cover?',
        tool: 'Absorb-or-escalate logger with the reason vocabulary, and the monkey ledger of what I have sent upward.',
      },
      manager: {
        disclosure: 'names',
        duty: 'Hold an absorption queue that is not saturated, and return monkeys with authority, not answers.',
        question: 'Is my queue stable, and which monkeys on my back belong to someone else?',
        tool: 'Erlang/Kingman queue with absorption headroom, return-the-monkey actions, and the intervention-rate commitment.',
      },
      director: {
        disclosure: 'unit',
        duty: 'Find the escalation hotspots across managers and repair authority, not behaviour.',
        question: 'Where is a green average masking a saturated manager, and which decision class is systematically lifted?',
        tool: 'Subsidiarity index per decision class, de facto centralisation map, and escalation tax in person-days.',
      },
      exec: {
        disclosure: 'aggregate',
        duty: 'Price the escalation tax and fund the authority that removes it.',
        question: 'What does passing decisions upward cost us per quarter, and which spans are paying it?',
        tool: 'Portfolio of queue utilisation across spans and the escalation tax in declared currency.',
      },
      chief: {
        disclosure: 'aggregate',
        duty: 'See the enterprise escalation topology and change where authority lives.',
        question: 'Is authority sitting where the information is, and has our intervention-rate commitment held?',
        tool: 'Enterprise topology, graded commitments with Brier skill, and an identity-free board-ready brief.',
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
