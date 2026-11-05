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
  // ADR-0086: a disclosure release is a bounded authority contract, so it is
  // readable at every altitude that can hold one — and its ledger is exactly
  // what makes the widening auditable afterwards.
  disclosureGrants: { classKey: 'authority', label: 'Disclosure release contracts', route: '#/disclosure' },
  disclosureMarkers: { classKey: 'unit', label: 'Disclosure idempotency markers', route: '#/disclosure' },
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
  // Raw renewal rows carry cohort IDs for the atomic rule engine. Declared seats
  // receive only the identity-reduced report, never these stored projections.
  strategyCycles: { classKey: 'unit', detailCeiling: 0, label: 'Frozen strategy renewal readings (report only)', route: '#/strategy-cycle' },
  strategyCycleMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Strategy renewal rule markers', route: '#/strategy-cycle' },
  // ADR-0088: the Federated Envoy's ledger, its attested copies and its
  // idempotency markers. A packet's *content* class is decided by the receiving
  // altitude (`ENVOY_FIELDS`), not by this row; what this row fixes is that the
  // ledger itself is span material, never enterprise material — a workspace may
  // not read another span's exchange history at the top of the house.
  // ADR-0090: frozen federation readings are span material by contract. The
  // stored rows carry span ids, counts and dates — never a name, title or note —
  // and a declared seat receives only the scoped report, never the raw ledger.
  federationAssessments: { classKey: 'unit', detailCeiling: 0, label: 'Frozen federation readings (report only)', route: '#/federation' },
  // ADR-0094: a frozen contract holds a cohort of RECORD IDS and a title; a
  // grade holds only counts, dates and a proper score. The raw ledgers are
  // never projected into declared-seat view state — only the scoped report is.
  prospectiveContracts: { classKey: 'unit', detailCeiling: 0, label: 'Frozen pre-registrations (report only)', route: '#/prospective' },
  prospectiveGrades: { classKey: 'unit', detailCeiling: 0, label: 'Once-only Brier grades (report only)', route: '#/prospective' },
  prospectiveMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Prospective rule markers', route: '#/prospective' },
  // ADR-0095: the Robust Allocation Terminal. Plans and markers are report-only;
  // the scoped adapter applies subtree scope, small-cell suppression and a
  // rank-gated pooled rate, and never projects a title, a person or an amount.
  robustPlans: { classKey: 'unit', detailCeiling: 0, label: 'Robust allocation plans (report only)', route: '#/robust-allocation' },
  robustMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Robust allocation rule markers', route: '#/robust-allocation' },
  // ADR-0098: raw rounds carry sealed tiers, frozen externalities and
  // settlements, so declared seats receive only the scoped Clearinghouse report.
  clearingRounds: { classKey: 'unit', detailCeiling: 0, label: 'Internal clearing rounds (report only)', route: '#/clearing' },
  clearingMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Clearinghouse rule markers', route: '#/clearing' },
  federationMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Federation rule markers', route: '#/federation' },
  // ADR-0092: the publication register is published material and therefore span
  // material: a release belongs to the seat that made it. Stored rows carry span
  // ids, states, counts and dates — never a span name, person, title or amount —
  // and a declared seat receives only the scoped report, never the raw ledger.
  differenceReleases: { classKey: 'unit', detailCeiling: 0, label: 'Published aggregate register (report only)', route: '#/differencing' },
  differenceMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Publication-integrity rule markers', route: '#/differencing' },
  exchangePackets: { classKey: 'unit', label: 'Sealed exchange packets', route: '#/envoy' },
  exchangeArtefacts: { classKey: 'unit', label: 'Attested exchange copies', route: '#/envoy' },
  exchangeMarkers: { classKey: 'unit', label: 'Exchange idempotency markers', route: '#/envoy' },
  // ADR-0087: credential enrollments are enterprise security metadata — the
  // PBKDF2 salt, key fingerprint and verifier of another span are not the
  // frontline lead's business. Per-seat status reaches its holder through the
  // session panel, not through record projection; roll-ups carry counts.
  seatIdentities: { classKey: 'enterprise', label: 'Seat credential enrollments', route: '#/identity' },
  identityMarkers: { classKey: 'unit', label: 'Attestation idempotency markers', route: '#/identity' },
  // ADR-0088: the Escalation Economy. The disposition ledger is unit-scoped so
  // a declared seat reads its own span and its leadership ancestors, never a
  // sideways peer span.
  escalationRecords: { classKey: 'unit', label: 'Escalation ledger', route: '#/escalation' },
  escalationCommitments: { classKey: 'unit', label: 'Intervention-rate commitments', route: '#/escalation' },
  escalationMarkers: { classKey: 'unit', label: 'Escalation idempotency markers', route: '#/escalation' },
  valueStreamContracts: { classKey: 'unit', label: 'Peer value-stream SLA contracts', route: '#/valuestream' },
  valueStreamRounds: { classKey: 'unit', label: 'Peer SLA negotiation rounds', route: '#/valuestream' },
  valueStreamReallocations: { classKey: 'portfolio', label: 'Stop-rule capital carryover receipts', route: '#/valuestream?panel=reallocation' },
  valueStreamMarkers: { classKey: 'unit', label: 'Value Stream idempotency markers', route: '#/valuestream' },
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
  // ADR-0084: the operating model's declarations. A declared work-type split is
  // PORTFOLIO material: it is a claim about how every position at a level spends
  // its week, which is not a frontline lead's artefact to author. A declared
  // collaboration edge is unit work; a priced portfolio item is portfolio work.
  omWorkSplits: { classKey: 'portfolio', label: 'Declared work-type splits', route: '#/operating-model?panel=norms' },
  omEdges: { classKey: 'unit', label: 'Declared collaboration edges', route: '#/operating-model?panel=coupling' },
  omDecisions: { classKey: 'portfolio', label: 'Priced operating-model items', route: '#/operating-model?panel=levers' },
  omMarkers: { classKey: 'unit', label: 'Operating-model markers', route: '#/operating-model' },
  voiDecisions: { classKey: 'enterprise', label: 'Information-value frames', route: '#/voi' },
  // ADR-0087: board memos are enterprise material. They carry claims, thresholds,
  // verdicts and counts — never a person, a 1:1 or a rating — but they are the
  // pack, and the pack is not handed below the executive floor.
  boardMemos: { classKey: 'enterprise', label: 'Board disclosure memos', route: '#/board' },
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
  // ADR-0084: the operating model carries attributable labour cost, the
  // utilisation ceiling and structural levers — portfolio material. A frontline
  // lead reads their own span's design through Mission Control, not by authoring
  // the split for an entire level.
  'operating-model',
]);
const ENTERPRISE_ROUTES = Object.freeze([
  // Pay, workforce shape and board-reported statistical audit claims. Capital
  // allocation is PORTFOLIO (floor rank 3): a director legitimately funds a
  // function, while a frontline lead's horizon is the week.
  'merit', 'transition', 'parity', 'integrity', 'sceptic',
  'attribution', 'counterfactual', 'orgdesign', 'voi',
  // ADR-0084: the board line is enterprise material. The executive altitude may
  // READ it; committing and freezing the pack is the chief's own act right.
  'board',
]);

/**
 * ADR-0086: the same windows, exposed as DATA so the Disclosure Compiler gates a
 * route on exactly the window the nav uses. Two copies of a rank table is how a
 * nav and a screen start disagreeing about who may see what.
 */
export function routeRankWindow(route) {
  const enterprise = ENTERPRISE_ROUTES.includes(route);
  const portfolio = PORTFOLIO_ROUTES.includes(route);
  return {
    floor: enterprise
      ? RECORD_CLASSES.enterprise.minRank
      : portfolio
        ? RECORD_CLASSES.portfolio.minRank
        : 1,
    ceiling: INDIVIDUAL_ROUTES.includes(route) ? RECORD_CLASSES.individual.maxRank : 5,
    kind: enterprise ? 'enterprise' : portfolio ? 'portfolio' : INDIVIDUAL_ROUTES.includes(route) ? 'individual' : 'open',
  };
}

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
  // ADR-0087: the Board Room. Reading is enterprise-level (route floor rank 4);
  // opening, declaring, looking and committing are the chief's act, and freezing
  // the disclosed pack stays on its own rank-5 right above.
  'declare-board-line': { minRank: 5, maxRank: 5, label: 'Open, declare and commit a board disclosure memo' },
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
  // ADR-0084: authoring the operating model is an org-design act — it declares
  // how every position at a level spends its week and prices structural change.
  // The same right that edits a reporting line authors the model of the lines.
  'author-operating-model': { minRank: 3, maxRank: 5, label: 'Author the operating model — declared splits, edges and priced items' },
  // ADR-0084: bilateral Hoshin Kanri & Catchball negotiation across spans.
  'negotiate-catchball': { minRank: 1, maxRank: 5, label: 'Propose, counter, accept or check in on a Hoshin Catchball pact' },
  // ADR-0089: each altitude freezes a scoped renewal reading and may explicitly scan it.
  'govern-strategy-cycle': { minRank: 1, maxRank: 5, label: 'Freeze or scan a scoped strategy renewal cycle' },
  // ADR-0092: publishing an aggregate is an act every altitude performs — a
  // frontline lead puts a table in a review deck and a chief puts one in a board
  // pack. The right is therefore open at every rank; the ACTIONS enforce the span
  // (your own seat only) and the arithmetic decides what may be published.
  'publish-aggregate': { minRank: 1, maxRank: 5, label: 'Publish a module aggregate through the publication register' },
  // The conventions that bound what everyone else may publish — the small-cell
  // floor, the audit window and the drift floor — are a director+ act, on the
  // same footing as the disclosure floor and the federation window.
  'govern-differencing': { minRank: 3, maxRank: 5, label: 'Set the publication floor, audit window and drift conventions' },
  // ADR-0090: every altitude may freeze its own scoped federation reading and
  // run an explicit scan. Setting the WINDOW and the FLOORS is director-and-above
  // (checked in the action), because those numbers bound what everyone below reads.
  'govern-federation': { minRank: 1, maxRank: 5, label: 'Freeze or scan a scoped programme federation reading' },
  // ADR-0094: every altitude that leads anyone may pre-register one bet about
  // its own work, and every altitude may explicitly grade a due cohort. Setting
  // the evidence/cell/skill conventions is director+ (enforced in the action),
  // because those numbers bound what every altitude below reads.
  'declare-prospective': { minRank: 1, maxRank: 5, label: 'Pre-register, grade or govern a prospective intervention contract' },
  // ADR-0095: every altitude that leads anyone may model, adopt and scan an
  // allocation for its own span. Setting the cell/review/solver conventions is
  // director+ (enforced in the action), because those numbers bound what every
  // altitude below reads.
  'declare-robust-allocation': { minRank: 1, maxRank: 5, label: 'Declare, adopt, scan or govern a robust allocation' },
  // ADR-0098: open/withdraw/commit/settle are chairing acts; a subordinate
  // span may submit only its own sealed package, and director+ governs the
  // workspace conventions. The action adapter applies the finer span checks.
  'chair-clearing-round': { minRank: 2, maxRank: 5, label: 'Open, commit or settle a hierarchical clearing round' },
  'submit-clearing-bid': { minRank: 1, maxRank: 5, label: 'Submit a sealed multi-tranche clearing bid' },
  'govern-clearing': { minRank: 3, maxRank: 5, label: 'Govern Clearinghouse floors, windows and solver bounds' },
  // ADR-0088: recording whether a decision moment was absorbed or escalated is
  // every leader's business, at every altitude — that is the whole point of the
  // module. Declaring a binding intervention-rate commitment is a manager-and-
  // above act, because it constrains a span's own future behaviour.
  'record-escalation': { minRank: 1, maxRank: 5, label: 'Record a decision moment as absorbed or escalated' },
  'commit-intervention-rate': { minRank: 2, maxRank: 5, label: 'Declare or grade an intervention-rate commitment' },
  // ADR-0086: a disclosure release is requested by the altitude that needs the
  // detail and consented by the altitude that owns it. Both directions are open
  // at every rank, because either side may sit at any altitude; the pair, the
  // purpose, the days and the class are what the action checks.
  'request-disclosure': { minRank: 1, maxRank: 5, label: 'Request a bounded disclosure release' },
  'consent-disclosure': { minRank: 1, maxRank: 5, label: 'Consent to, refuse or revoke a disclosure release' },
  // ADR-0087: the standing forum is a governance server; any altitude that chairs
  // one may declare it and record its sittings, but never for a peer span.
  'run-cadence': { minRank: 1, maxRank: 5, label: 'Declare a standing forum, record its sittings and freeze a cadence reading' },
  // ADR-0087: every altitude that holds a record may attest it upward, and every
  // altitude may receive one — the disclosure class is what limits the content,
  // not the right to exchange. The action itself enforces the sending span.
  'exchange-packets': { minRank: 1, maxRank: 5, label: 'Publish or ingest a sealed inter-workspace packet' },
  // ADR-0089: managing your own seat credential is every altitude's right —
  // attestation without the frontline is theater. The actions themselves
  // enforce "your own seat only" under a declared seat.
  'attest-seat-identity': { minRank: 1, maxRank: 5, label: 'Enroll, unlock, lock or scan a seat credential' },
  // Governance of the authorship boundary itself (enforcement on/off,
  // revoking a credential) is director-and-above: it is a claim the whole
  // workspace makes about itself (cf. 'set-disclosure-floor').
  'govern-attestation': { minRank: 3, maxRank: 5, label: 'Govern the attestation boundary (enforcement, revocation)' },
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
