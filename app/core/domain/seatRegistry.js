/**
 * app/core/domain/seatRegistry.js — the Operating Seat's declarative contract.
 *
 * ADR-0076 (Session 116). ADR-0075 built the Command Chain: a reporting tree
 * read as a MODEL, an altitude per node (Jaques' time-span of discretion) and a
 * disclosure ladder. It then said, in §5, "It never asserts access control —
 * one operator, one keyboard, no authentication: the disclosure ladder is a
 * rendering contract". This file is the contract that turns that rendering
 * ladder into an ENFORCED one, without inventing a login.
 *
 * The primitive the whole of §0.3 was missing is the SEAT: the position in the
 * reporting tree from which this workspace is currently being operated. Every
 * record class, route and action below is declared once, against an altitude
 * rank window, so the permission engine (`seat.js`) contains no per-module and
 * no per-role glue. Adding a module is one row in RECORD_POLICIES; adding an
 * altitude is one row in ALTITUDES (already done in the chain registry).
 *
 * Three leaks are refused by construction:
 *   upward    — individual detail (1:1s, feedback, conflicts, pay) is never
 *               readable in full above the manager rank; above it only counts
 *               survive, with the reason printed;
 *   downward  — portfolio/enterprise material is never handed below its floor
 *               rank;
 *   sideways  — a record about people outside the seat's subtree is denied,
 *               because the reporting tree does not put it under this seat.
 *
 * The undeclared seat is the workspace leader's single-operator view: full
 * access, no filtering, exactly the behaviour the product had before this
 * session. That is the no-regression guarantee, and it is explicit rather than
 * implied: a declared seat at the root is a chief seat WITH enforcement, while
 * an undeclared seat is the operator view WITHOUT it.
 *
 * Pure module: no storage, no clock, no DOM.
 */

import { ALTITUDES, altitudeByKey, altitudeRank } from './chainRegistry.js';

export const SEAT_ENGINE_VERSION = 'operating-seat-2026.11-v1';

/** The sentinel for "no seat declared": the pre-0076 single-operator view. */
export const UNDECLARED_SEAT = '__operator__';

/**
 * Four sensitivity classes. `minRank`/`maxRank` bound who may read the FULL
 * record; `detailCeiling` is the highest rank at which item-level detail (a
 * title, a name, a note) is printed at all. Above that ceiling a record is
 * either an AGGREGATE (a count, with an evidence floor) or DENIED.
 */
export const RECORD_CLASSES = Object.freeze({
  authority: Object.freeze({ key: 'authority', label: 'Bounded authority contract', minRank: 1, maxRank: 5, detailCeiling: 5,
    reason: 'The receiver must read the exact rights and stop condition. Executive roll-ups redact source titles and names; private source notes are never copied into a contract.' }),
  individual: Object.freeze({
    key: 'individual', label: 'Individual detail', minRank: 1, maxRank: 2, detailCeiling: 2,
    reason: 'Individual coaching notes, 1:1 content, feedback and pay are the work of the person and the week. Above the manager altitude the unit of analysis is a span, not a person (Jaques 1956); the count is disclosed, the detail is not.',
  }),
  unit: Object.freeze({
    key: 'unit', label: 'Unit-level work', minRank: 1, maxRank: 5, detailCeiling: 3,
    reason: 'At director altitude and above, unit-level task lists are read as counts and rates; item titles and names are withheld so the level above is not buried in workflow minutiae (§0.3).',
  }),
  portfolio: Object.freeze({
    key: 'portfolio', label: 'Portfolio material', minRank: 3, maxRank: 5, detailCeiling: 4,
    reason: 'Portfolio-level capital allocation, org-wide risk and structural decisions are not handed below the director altitude; the frontline lead’s horizon is the week, not the half.',
  }),
  enterprise: Object.freeze({
    key: 'enterprise', label: 'Enterprise material', minRank: 4, maxRank: 5, detailCeiling: 5,
    reason: 'Pay bands, merit cycles, workforce transition and board-ready synthesis are not disclosed below the executive altitude. A screen that is not a conclusion is still a leak of the conclusion.',
  }),
});

/**
 * One row per governed collection. An unlisted collection falls to
 * DEFAULT_RECORD_POLICY — deliberately fail-closed: it is treated as unit work
 * whose detail stops at the director rank. Nothing is readable in full just
 * because nobody wrote a policy for it.
 */
export const DEFAULT_RECORD_POLICY = Object.freeze({
  classKey: 'unit', collection: null, route: null, label: 'Workspace record',
});

export const RECORD_POLICIES = Object.freeze({
  mandates: { classKey: 'authority', label: 'Decision-rights contracts', route: '#/mandates' },
  missionBriefs: { classKey: 'enterprise', label: 'Identity-free mission briefs', route: '#/mission?panel=brief' },
  // Individual detail. Names, notes and ratings live here.
  oneOnOnes: { classKey: 'individual', label: '1:1 conversations', route: '#/oneonones' },
  feedback: { classKey: 'individual', label: 'Feedback', route: '#/feedback' },
  conflicts: { classKey: 'individual', label: 'Conflict records', route: '#/conflicts' },
  reviews: { classKey: 'individual', label: 'Performance reviews', route: '#/reviews' },
  growthPlans: { classKey: 'individual', label: 'Growth plans', route: '#/growth' },
  readiness: { classKey: 'individual', label: 'Succession readings', route: '#/readiness' },
  recognition: { classKey: 'individual', label: 'Recognition', route: '#/recognition' },
  onboarding: { classKey: 'individual', label: 'Onboarding plans', route: '#/onboarding' },
  performanceConcerns: { classKey: 'individual', label: 'Performance concerns', route: '#/performance' },
  // Unit-level open work. The cross-module propagation spine's own sources.
  cases: { classKey: 'unit', label: 'Operational cases', route: '#/cases' },
  decisions: { classKey: 'unit', label: 'Decisions', route: '#/decisions' },
  delegations: { classKey: 'unit', label: 'Delegations', route: '#/delegations' },
  goals: { classKey: 'unit', label: 'Goals', route: '#/goals' },
  changes: { classKey: 'unit', label: 'Org changes', route: '#/changes' },
  requisitions: { classKey: 'unit', label: 'Requisitions', route: '#/hiring' },
  candidates: { classKey: 'unit', label: 'Candidates', route: '#/hiring' },
  commsDrafts: { classKey: 'unit', label: 'Stakeholder briefs', route: '#/comms' },
  intakeDrafts: { classKey: 'unit', label: 'Intake drafts', route: '#/intake' },
  altitudeRoutingPlans: { classKey: 'unit', label: 'Altitude routing plans', route: '#/routing' },
  altitudeRoutingMarkers: { classKey: 'unit', label: 'Routing idempotency markers', route: '#/routing' },
  catchballPacts: { classKey: 'unit', label: 'Hoshin Catchball pacts', route: '#/catchball' },
  catchballRounds: { classKey: 'unit', label: 'Hoshin Catchball rounds', route: '#/catchball' },
  catchballMarkers: { classKey: 'unit', label: 'Catchball idempotency markers', route: '#/catchball' },
  // Raw cycle rows contain typed cohort IDs for the atomic rule engine. Every
  // declared seat must use the identity-reduced report, never this projection.
  strategyCycles: { classKey: 'unit', detailCeiling: 0, label: 'Frozen strategy renewal readings (report only)', route: '#/strategy-cycle' },
  strategyCycleMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Strategy renewal rule markers', route: '#/strategy-cycle' },
  // Portfolio material. Functions, quarters and capital.
  budgets: { classKey: 'portfolio', label: 'Budgets', route: '#/finance' },
  strategyBets: { classKey: 'portfolio', label: 'Strategic bets', route: '#/strategy' },
  capitalPolicies: { classKey: 'portfolio', label: 'Capital policies', route: '#/capital' },
  portfolio: { classKey: 'portfolio', label: 'Decision portfolio', route: '#/portfolio' },
  stakeholders: { classKey: 'portfolio', label: 'Stakeholders', route: '#/stakeholders' },
  negotiations: { classKey: 'portfolio', label: 'Negotiations', route: '#/negotiations' },
  premises: { classKey: 'portfolio', label: 'Assumptions', route: '#/premises' },
  forecastChallenges: { classKey: 'portfolio', label: 'Forecast challenges', route: '#/forecasts' },
  dynamicsExperiments: { classKey: 'portfolio', label: 'System experiments', route: '#/dynamics' },
  dependencies: { classKey: 'portfolio', label: 'Operational dependencies', route: '#/resilience' },
  powerGames: { classKey: 'portfolio', label: 'Coalition maps', route: '#/power' },
  // Enterprise material. Pay, workforce shape, board-reported claims.
  meritCycles: { classKey: 'enterprise', label: 'Merit cycles', route: '#/merit' },
  compBands: { classKey: 'enterprise', label: 'Pay bands', route: '#/merit' },
  transitionPrograms: { classKey: 'enterprise', label: 'Workforce transitions', route: '#/transition' },
  parityAudits: { classKey: 'enterprise', label: 'Pay/leadership parity audits', route: '#/parity' },
  integrityLooks: { classKey: 'enterprise', label: 'Signal-integrity looks', route: '#/integrity' },
  scepticRounds: { classKey: 'enterprise', label: 'Cross-examination rounds', route: '#/sceptic' },
  chainReadings: { classKey: 'enterprise', label: 'Frozen command-chain readings', route: '#/chain' },
  solvencyReadings: { classKey: 'enterprise', label: 'Frozen promise readings', route: '#/solvency' },
  orgDesigns: { classKey: 'enterprise', label: 'Structural designs', route: '#/orgdesign' },
  voiDecisions: { classKey: 'enterprise', label: 'Information-value frames', route: '#/voi' },
});

/** Resolve a collection to its full, frozen policy (never undefined). */
export function recordPolicy(collection) {
  const declared = RECORD_POLICIES[collection] || null;
  const classKey = declared?.classKey || DEFAULT_RECORD_POLICY.classKey;
  const cls = RECORD_CLASSES[classKey] || RECORD_CLASSES.unit;
  return Object.freeze({
    collection,
    classKey,
    label: declared?.label || DEFAULT_RECORD_POLICY.label,
    route: declared?.route || DEFAULT_RECORD_POLICY.route,
    declared: Boolean(declared),
    minRank: cls.minRank,
    maxRank: cls.maxRank,
    detailCeiling: Number.isInteger(declared?.detailCeiling) ? declared.detailCeiling : cls.detailCeiling,
    classLabel: cls.label,
    reason: cls.reason,
  });
}

/** Every governed collection, for the projection walk and the CSV-free ledger. */
export const GOVERNED_COLLECTIONS = Object.freeze(Object.keys(RECORD_POLICIES));

/**
 * Route rank windows. A route absent from the table is open at every altitude
 * (navigation defaults to the union of all duties — no dead ends). A listed
 * route is DENIED outside its window with the printed reason. Team-health,
 * cases, goals and delegations are deliberately open at every altitude: a CEO
 * drills DOWN to a unit's aggregate, not to a person's 1:1 note.
 */
const INDIVIDUAL_ROUTES = Object.freeze([
  'oneonones', 'feedback', 'conflicts', 'conflict', 'person', 'people',
  'reviews', 'review', 'performance', 'growth', 'recognition', 'onboarding',
  'prep', 'oneOnOnes',
]);
const PORTFOLIO_ROUTES = Object.freeze([
  'capital', 'allocation', 'portfolio', 'strategy', 'wargame', 'orgdesign',
  'voi', 'deferral', 'solvency', 'supply', 'reliability', 'attribution',
  'counterfactual', 'credibility', 'confidence', 'evidence', 'consequences',
  'wait', 'survival', 'measurement', 'fidelity', 'signal', 'attention',
  'autopilot', 'coupling', 'power', 'network', 'impact', 'dynamics',
  'learning', 'watch', 'anomaly', 'forecasts', 'premises', 'stakeholders',
  'stakeholder', 'finance', 'budget', 'negotiations', 'negotiation',
  'tempo', 'decisions', 'sceptic', 'integrity', 'merit', 'transition',
  'parity', 'changes', 'change', 'hiring', 'hiring-detail', 'scenarios',
]);
const ENTERPRISE_ROUTES = Object.freeze([
  // Pay, workforce shape and board-reported statistical audit claims. Capital
  // allocation is PORTFOLIO (floor rank 3): a director legitimately funds a
  // function, while a frontline lead's horizon is the week.
  'merit', 'transition', 'parity', 'integrity', 'sceptic',
  'attribution', 'counterfactual', 'orgdesign', 'voi',
]);

/** Which routes are simply not a frontline/manager question. */
export function routeVerdict(route, seat) {
  if (!seat || seat.fullAccess) return { allow: true, reason: 'Undeclared operator view — the whole workspace, as before.' };
  if (seat.readOnly) {
    // An unresolved seat keeps exactly three exits, so the operator can always
    // recover without being handed a screen full of records they may not read.
    if (['today', 'seat', 'settings'].includes(route)) {
      return { allow: true, reason: 'Recovery route for an unresolved seat.' };
    }
    return { allow: false, reason: `The declared seat no longer exists in this roster; the workspace is read-only until a valid seat is declared on the Altitude Lens. #/${route} is withheld.` };
  }
  const rank = seat.rank;
  if (INDIVIDUAL_ROUTES.includes(route) && rank > RECORD_CLASSES.individual.maxRank) {
    return { allow: false, reason: `${seat.label} (rank ${rank}) is not shown individual coaching, 1:1 or review detail. Above the manager altitude the unit of analysis is a span. Read the unit aggregate on the Altitude Lens instead.` };
  }
  if (ENTERPRISE_ROUTES.includes(route) && rank < RECORD_CLASSES.enterprise.minRank) {
    return { allow: false, reason: `${seat.label} (rank ${rank}) is not handed enterprise material (pay, workforce shape, board-reported claims). Its floor is rank ${RECORD_CLASSES.enterprise.minRank}.` };
  }
  if (PORTFOLIO_ROUTES.includes(route) && !ENTERPRISE_ROUTES.includes(route) && rank < RECORD_CLASSES.portfolio.minRank) {
    return { allow: false, reason: `${seat.label} (rank ${rank}) is not handed portfolio-level capital or org-wide risk. Its floor is rank ${RECORD_CLASSES.portfolio.minRank}; the frontline horizon is the week.` };
  }
  return { allow: true, reason: '' };
}

/**
 * Action rights. A frontline lead may log a 1:1 or a conflict; a chief may not.
 * A chief may freeze a board line; a frontline lead may not. `declare-seat` is
 * open to every altitude because switching seat is how the workspace says who
 * is operating — it is an auditable handover, not a privilege escalation.
 */
export const ACTION_RIGHTS = Object.freeze({
  'log-oneonone': { minRank: 1, maxRank: 2, label: 'Log a 1:1' },
  'log-feedback': { minRank: 1, maxRank: 2, label: 'Give feedback' },
  'log-conflict': { minRank: 1, maxRank: 2, label: 'Log a conflict' },
  'record-review': { minRank: 1, maxRank: 2, label: 'Record a review' },
  'delegate': { minRank: 1, maxRank: 5, label: 'Delegate work' },
  'offer-authority': { minRank: 1, maxRank: 5, label: 'Offer bounded authority' },
  'accept-authority': { minRank: 1, maxRank: 5, label: 'Accept bounded authority' },
  'verify-authority': { minRank: 1, maxRank: 5, label: 'Verify authority outcome' },
  'open-case': { minRank: 1, maxRank: 5, label: 'Open a case' },
  'open-decision': { minRank: 1, maxRank: 5, label: 'Open a decision' },
  'edit-reporting-line': { minRank: 3, maxRank: 5, label: 'Change a reporting line' },
  'finalize-merit-cycle': { minRank: 4, maxRank: 5, label: 'Finalize a merit cycle' },
  'approve-capital': { minRank: 4, maxRank: 5, label: 'Approve capital allocation' },
  'freeze-board-summary': { minRank: 5, maxRank: 5, label: 'Freeze a board-ready summary' },
  'declare-seat': { minRank: 1, maxRank: 5, label: 'Declare the operating seat' },
  'route-intake': { minRank: 1, maxRank: 5, label: 'Route a natural-language situation note to modules and an altitude' },
  // ADR-0083: an expectation round is a two-sided instrument. Every altitude
  // that leads anyone may run one, including the chief — but the round is bound
  // to a real reporting pair inside the declared span (checked by the action).
  'close-expectation-round': { minRank: 1, maxRank: 5, label: 'Open, seal or withdraw a two-sided expectation round' },
  'coordinate-intervention': { minRank: 1, maxRank: 5, label: 'Rehearse and adopt a bounded cross-module intervention' },
  'test-assumption': { minRank: 3, maxRank: 5, label: 'Register a testable operating assumption' },
  'prepare-comms': { minRank: 3, maxRank: 5, label: 'Prepare a stakeholder communication' },
  'set-disclosure-floor': { minRank: 3, maxRank: 5, label: 'Set the small-cell disclosure floor' },
  // ADR-0082: verifying the sealed audit chain is every altitude's business —
  // it writes only an audit event, never a record.
  'audit-seal': { minRank: 1, maxRank: 5, label: 'Verify the sealed audit chain' },
  // ADR-0084: bilateral Hoshin Kanri & Catchball negotiation across spans.
  'negotiate-catchball': { minRank: 1, maxRank: 5, label: 'Propose, counter, accept or check in on a Hoshin Catchball pact' },
  // Schema v91: each altitude freezes a scoped renewal reading and can explicitly
  // scan its own window; only the rules may generate the cross-module links.
  'govern-strategy-cycle': { minRank: 1, maxRank: 5, label: 'Freeze or scan a scoped strategy renewal cycle' },
});

export function actionVerdict(action, seat) {
  if (!seat) return { allow: false, reason: 'No seat resolved.' };
  const right = ACTION_RIGHTS[action];
  // Existence is checked BEFORE the operator-view bypass: full access waives
  // the rank window, not the need for a declared right. An action nobody
  // declared is refused even on the unenforced view (deny by default).
  if (!right) return { allow: false, reason: `No declared right for “${action}”. An undeclared action is refused rather than assumed.` };
  if (seat.fullAccess) return { allow: true, reason: 'Undeclared operator view.' };
  if (seat.rank < right.minRank || seat.rank > right.maxRank) {
    return { allow: false, reason: `${seat.label} may not “${right.label}”. Its rank window is ${right.minRank}–${right.maxRank}; this seat is rank ${seat.rank}.` };
  }
  return { allow: true, reason: '' };
}

/** Event/relationship vocabulary, on the same spine as ADR-0008/0026. */
export const SEAT_EVENTS = Object.freeze({
  SWITCH: 'seat.switched',
  SCAN: 'seat.scan',
  PROPAGATE: 'seat.propagate',
  DENIED: 'seat.access_denied',
});

export const SEAT_RULE_IDS = Object.freeze({
  ROLLUP: 'RULE-SEAT-01',
  HANDOVER: 'RULE-SEAT-02',
  BOUNDARY: 'RULE-SEAT-03',
});

export const SEAT_SIGNAL_IDS = Object.freeze(['SEAT-01', 'SEAT-02', 'SEAT-03']);

export const SEAT_LIMITS = Object.freeze({
  floorN: Object.freeze([3, 12]),
  floorNDefault: 4,
  materialityPp: Object.freeze([1, 25]),
  materialityPpDefault: 5,
  windowDays: Object.freeze([30, 365]),
  windowDaysDefault: 90,
  maxLinks: Object.freeze([4, 64]),
  maxLinksDefault: 24,
  digestCap: 24,
  ledgerCap: 200,
});

export const SEAT_PREMISE = 'Altitude is a time span of discretion, not a rank. A permission boundary is a claim about what a level may legitimately decide, so it must be printed to the person it binds — an access control that cannot explain its own refusal is a broken access control.';

/** Rank helpers re-exported so the view and the tests read one source of truth. */
export { ALTITUDES, altitudeByKey, altitudeRank };
