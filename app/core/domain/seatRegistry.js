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
  // ADR-0109: a jurisdiction finding is UNIT-class — branch ids, ranks and
  // coordination units, never a person. A span reading is counts only, and the
  // marker ledger carries opaque ids. All three read as aggregates above rank 2.
  jurFindings: { classKey: 'unit', label: 'Cross-branch governance findings', route: '#/jurisdiction?panel=map' },
  jurReadings: { classKey: 'unit', label: 'Jurisdiction span readings', route: '#/jurisdiction?panel=grades' },
  jurMarkers: { classKey: 'unit', label: 'Jurisdiction idempotency markers', route: '#/jurisdiction' },
  mandates: { classKey: 'authority', label: 'Decision-rights contracts', route: '#/mandates' },
  // ADR-0100: a calibration reading is rung-level material — counts, intervals and
  // verdicts, never a person or an item. The adoption ledger is the same class:
  // it records a declaration about the ladder, not about anyone's work.
  spanReadings: { classKey: 'unit', label: 'Discretion calibration readings', route: '#/span-calibration' },
  spanAdoptions: { classKey: 'unit', label: 'Ladder adoption ledger', route: '#/span-calibration?panel=readings' },
  spanMarkers: { classKey: 'unit', label: 'Calibration idempotency markers', route: '#/span-calibration' },
  // ADR-0101: a reputational cell is about a PERSON AS A COUNTER-PARTY, so it is
  // classed with the individual detail it is derived from: only the people whose
  // acts it reads, and the spans above them, may see it. The positions ledger is
  // an authority record (a dated promise someone made) and reads at every altitude
  // that can hold one. Markers carry ids only.
  reputationActs: { classKey: 'individual', label: 'Hand-recorded reputational acts', route: '#/reputation?panel=acts' },
  reputationPositions: { classKey: 'authority', label: 'Guarantee and repair positions', route: '#/reputation?panel=positions' },
  reputationMarkers: { classKey: 'unit', label: 'Reputation idempotency markers', route: '#/reputation' },
  // ADR-0102: a lock is a frozen information set about a DECISION, which is a
  // workspace record — so it is classed with the units it rolls up from, not with
  // the individual detail a decision may happen to touch. Its stored content is
  // record TYPES, ids and dates; no fact content, no title and no person ever.
  decisionLocks: { classKey: 'unit', label: 'Frozen decision information sets', route: '#/hindsight?panel=locks' },
  decisionLockMarkers: { classKey: 'unit', label: 'Hindsight idempotency markers', route: '#/hindsight' },
  // ADR-0103: an unknown is a statement about a RECORD that nobody has read. Its
  // stored content is a generated class-and-date title plus a pointer; no note,
  // no free text and no person's name is ever stored on it, so it is classed with
  // the units it rolls up from rather than with individual detail. A declared
  // unknown is the one row a human authored, and it is authored at the seat that
  // owns it and visible nowhere else.
  epistemicUnknowns: { classKey: 'unit', label: 'Unread and declared unknowns', route: '#/epistemic?panel=unknowns' },
  epistemicObservations: { classKey: 'unit', label: 'Frozen belief observations', route: '#/epistemic?panel=calibration' },
  epistemicGrades: { classKey: 'unit', label: 'Once-only belief grades', route: '#/epistemic?panel=calibration' },
  epistemicMarkers: { classKey: 'unit', label: 'Epistemic idempotency markers', route: '#/epistemic' },
  // ADR-0104: a frozen knowable set is a statement about a DECISION and the
  // typed fact pointers the record held on that date, so it is classed with the
  // units it rolls up from — never with individual detail. Consultations carry
  // a written reason and are therefore held out of declared-seat view state
  // entirely; the scoped report is the only reader. Grades and markers carry
  // counts and ids only.
  diligenceChecklists: { classKey: 'unit', label: 'Frozen knowable sets', route: '#/diligence?panel=frontier' },
  diligenceConsults: { classKey: 'unit', label: 'Dated diligence consultations', route: '#/diligence?panel=frontier' },
  diligenceGrades: { classKey: 'unit', label: 'Once-only process-forecast grades', route: '#/diligence?panel=forecasts' },
  diligenceMarkers: { classKey: 'unit', label: 'Diligence idempotency markers', route: '#/diligence' },
  // ADR-0086: a disclosure release is a bounded authority contract, so it is
  // readable at every altitude that can hold one — and its ledger is exactly
  // what makes the widening auditable afterwards.
  disclosureGrants: { classKey: 'authority', label: 'Disclosure release contracts', route: '#/disclosure' },
  disclosureMarkers: { classKey: 'unit', label: 'Disclosure idempotency markers', route: '#/disclosure' },
  missionBriefs: { classKey: 'enterprise', label: 'Identity-free mission briefs', route: '#/mission?panel=brief' },
  missionCaptures: { classKey: 'unit', detailCeiling: 0, label: 'Seat-private capture plans (scoped adapter only)', route: '#/mission?panel=capture' },
  // Individual detail. Names, notes and ratings live here.
  oneOnOnes: { classKey: 'individual', label: '1:1 conversations', route: '#/oneonones' },
  // ADR-0113: a filed agenda line names one person and one prompt, so it IS
  // individual detail — the same class as the 1:1 it prepares. Above rank 2 the
  // ledger prints counts and rates only, never a prompt.
  agendaEntries: { classKey: 'individual', label: 'Filed 1:1 agenda lines', route: '#/agenda-ledger?panel=filed' },
  // ADR-0121: a declared duty cover is a statement about a POSITION, not about a
  // person's performance. It is unit-class: the seat that holds the duty and the
  // spans above it read the row, and above the manager altitude the register
  // prints counts, bands and refusals rather than the cover's name.
  dutyCovers: { classKey: 'unit', label: 'Declared duty covers', route: '#/duty-cover?panel=register' },
  dutyCoverageMarkers: { classKey: 'unit', label: 'Duty-coverage scan markers', route: '#/duty-cover' },
  absencePlans: { classKey: 'unit', label: 'Dated absence plans', route: '#/duty-cover?panel=plan' },
  // ADR-0127: an acknowledgement names a person as the answerer, so it carries
  // the same individual-detail ceiling as the cover ledger it answers.
  dutyStandbyAnswers: { classKey: 'unit', label: 'Cover acknowledgements', route: '#/standby?panel=asked' },
  // ADR-0143: an arbitration case names the DEMANDS two lines placed on one
  // person, and (at detail ranks) the arbiter above them. A demand title is item
  // detail about a named person's week, so the case reads as unit material: full
  // at the manager altitude, counts and derived states above the detail ceiling.
  // The marker ledger carries opaque keys only.
  priorityArbitrations: { classKey: 'unit', label: 'Cross-line priority cases', route: '#/arbitration?panel=board' },
  priorityArbitrationMarkers: { classKey: 'unit', label: 'Arbitration idempotency markers', route: '#/arbitration' },
  lineMandates: { classKey: 'unit', label: 'Declared line charters', route: '#/contradiction?panel=board' },
  contradictionReviews: { classKey: 'unit', label: 'Contradiction rulings', route: '#/contradiction?panel=log' },
  contradictionMarkers: { classKey: 'unit', label: 'Contradiction idempotency markers', route: '#/contradiction' },
  // ADR-0128: a rehearsal record attests practice of a POSITION's duty by a
  // named cover, so it carries the same unit class as the cover ledger it is
  // evidence for; above the manager altitude the plan prints counts, modes and
  // attestation strength rather than names or notes.
  dutyRehearsals: { classKey: 'unit', label: 'Dated cover rehearsal records', route: '#/duty-cover?panel=plan' },
  // ADR-0129: a branch reading is a disclosure about a POSITION's span, given by
  // the seat that holds it to the seat one level above — so it is unit class,
  // and above the manager altitude nothing here is re-printed as a person's name
  // (the band and the leader's words are the disclosure; there is no figure).
  branchReadingAsks: { classKey: 'unit', label: 'Branch reading requests', route: '#/duty-cover?panel=readings' },
  branchReadings: { classKey: 'unit', label: 'Published branch readings', route: '#/duty-cover?panel=readings' },
  agendaMarkers: { classKey: 'individual', label: 'Agenda ledger rule markers', route: '#/agenda-ledger' },
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
  // ADR-0118: a portfolio arbitration carries two candidate responses' declared
  // spend, owned work, footprints and the reasoning behind the call. That is
  // portfolio material — readable in detail from the VP rung up, and never
  // handed to a span that cannot author the commitment in the first place. The
  // detail ceiling stays at 5 because the CHIEF is a primary user of this screen:
  // rolling it to "aggregate only" above rank 4 would hide the comparison from
  // the seat the feature exists for.
  portfolioComparisons: { classKey: 'portfolio', detailCeiling: 5, label: 'Portfolio rehearsal comparisons', route: '#/compare' },
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
  // ADR-0118: comparing two reviewed responses and arbitrating between them is
  // the VP's and the chief's own act. A director reads the ledger of their own
  // span elsewhere; this screen opens at rank 4 so the comparison is never a
  // frontline screen with an executive's numbers on it.
  'compare',
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
  // ADR-0121: every leadership seat declares who answers for its own duties when
  // it is absent — a frontline lead as much as a chief. Explicitly NOT the
  // operator view's job: an undeclared workspace has no seat to cover.
  'declare-duty-cover': { minRank: 1, maxRank: 5, label: 'Declare a stand-in for a duty line' },
  'govern-duty-cover': { minRank: 4, maxRank: 5, label: 'Re-declare the duty-coverage conventions' },
  // ADR-0122: every leadership seat declares ITS OWN absence window — the date
  // range the register was missing. Self-service by design: an absence is the
  // seat holder's own dated act, and the span above reads it rolled up.
  'declare-duty-absence': { minRank: 1, maxRank: 5, label: 'Declare a dated absence window' },
  // ADR-0127: answering a standby ask is the STAND-IN's own act, so it is open at
  // every altitude and enforced in the action: only the seat named as the cover
  // may answer, only for dates inside the ask, and never twice over. Reading the
  // outgoing board is scoped to the spans the seat already governs.
  'answer-duty-standby': { minRank: 1, maxRank: 5, label: 'Answer a standby ask as the named cover' },
  // ADR-0143: opening a cross-line priority case is every leadership seat's
  // business — a frontline lead carrying two managers' demands is exactly who
  // needs it — and so is disposing of a demand. What is NOT open at every rank is
  // recording the BINDING precedence, because that act issues obligations to
  // somebody else's line. It is a director-and-above right (a seat that can hold a
  // span above two managers), and the action additionally refuses a seat that
  // cannot reach the person on either the tree or a declared line.
  'open-arbitration': { minRank: 1, maxRank: 5, label: 'Open a cross-line priority case and record the measured order' },
  'agree-arbitration': { minRank: 3, maxRank: 5, label: 'Record (or withdraw) the binding cross-line precedence' },
  // Answering is each named party's own first-person act — a line manager or the
  // person whose capacity was frozen. Open by rank at every altitude; the action
  // refuses any seat that is not one of the parties, and the normalizer keeps one
  // answer per seat so a second cannot overwrite the first.
  'answer-arbitration': { minRank: 1, maxRank: 5, label: 'Answer a cross-line precedence as a named party' },
  // ADR-0144: a line's charter is declared by the line — its manager or the span
  // above it — and open at every leadership rank, because a project lead with no
  // home-line reports still owns a charter. The action additionally refuses a
  // line the seat cannot reach on the tree OR a declared line.
  'declare-line-mandate': { minRank: 1, maxRank: 5, label: 'Declare, withdraw or read a line charter' },
  // ADR-0140: the Matrix Accountability Ledger gates every one of its
  // commands — reads as well as writes — on the right to declare a line's
  // decision-rights charter, and the module was built against that right
  // name. It must be registered here, on the same spine as the rest: an
  // action whose right was never declared is refused for EVERY seat,
  // including the operator view, so an unregistered right silently makes
  // the whole module unreachable through the live API.
  'declare-matrix-line': { minRank: 1, maxRank: 5, label: 'Declare, retune or read a line decision-rights charter' },
  // Ruling on a contradiction is a director-and-above act: a resequence issues a
  // dated obligation to somebody else's line, and the chief who owns the
  // portfolio trade-off is the seat this module exists for.
  'review-contradiction': { minRank: 3, maxRank: 5, label: 'Rule on a cross-line contradiction' },
  // The conventions decide when a pair reads incompatible, so re-declaring them
  // is a governance act for a rank-4+ seat, and the action additionally requires
  // full access — a scoped seat cannot re-price the audit for the whole workspace.
  'set-contradiction-conventions': { minRank: 4, maxRank: 5, label: 'Re-declare the contradiction-audit conventions' },
  // ADR-0128: recording a rehearsal is the act of a seat that WAS THERE — the
  // duty holder (a frontline lead as much as a chief), a leadership ancestor of
  // the holder, or the cover themselves. Open at every altitude by rank; the
  // position check is enforced in the action AND re-checked against the roster
  // by the schema on reload, because an attestation by a seat with no position
  // at the duty is an invented observation.
  'attest-duty-rehearsal': { minRank: 1, maxRank: 5, label: 'Record a dated cover rehearsal for a duty line' },
  // ADR-0129: asking a direct branch for a reading is a director-and-above act —
  // only rank 3 and up is ever shown the branch table whose cells can be
  // withheld, so only those seats can be holding the question. The action
  // additionally requires the target to be a DIRECT branch of the asking seat.
  'request-branch-reading': { minRank: 3, maxRank: 5, label: 'Request a reading from a direct branch' },
  // Answering is the branch's own act, at whatever altitude that branch's
  // leader sits (a manager under a director as much as a director under a
  // chief). Open by rank at every altitude; the action refuses any seat that is
  // not the one the ask named, and the schema refuses it again on reload.
  'answer-branch-reading': { minRank: 1, maxRank: 5, label: 'Answer a branch reading request as that branch’s leader' },
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
  // ADR-0105 + ADR-0114: a testable assumption is part of every leading seat's craft.
  // Command Flow offered `premise` to rank 2 from the start ("manager adds premise",
  // README, ADR-0105) while this window still read 3–5, so a manager's rehearsal died
  // at adoption. The shared right now matches the declared altitude doctrine: frontline
  // does not register premises; every rank from manager up does.
  'test-assumption': { minRank: 2, maxRank: 5, label: 'Register a testable operating assumption' },
  'prepare-comms': { minRank: 3, maxRank: 5, label: 'Prepare a stakeholder communication' },
  'set-disclosure-floor': { minRank: 3, maxRank: 5, label: 'Set the small-cell disclosure floor' },
  // ADR-0082: verifying the sealed audit chain is every altitude's business —
  // it writes only an audit event, never a record.
  'audit-seal': { minRank: 1, maxRank: 5, label: 'Verify the sealed audit chain' },
  // ADR-0101: the Reputational Capital Ledger. Recording an act and declaring a
  // dated promise are acts every altitude performs; re-pricing the workspace's
  // conventions is director+ because it moves every obstacle at once.
  'record-reputation-act': { minRank: 1, maxRank: 5, label: 'Record a dated reputational act or run an explicit scan' },
  'offer-reputation-guarantee': { minRank: 1, maxRank: 5, label: 'Offer or close a dated guarantee or repair' },
  'govern-reputation': { minRank: 4, maxRank: 5, label: 'Re-declare the reputational-capital conventions' },
  // ADR-0102: freezing a decision's information set is every altitude's business —
  // it is the only defensible way to re-open a decision record. Re-declaring what
  // counts as a sound process moves every quadrant in the workspace, so it is
  // director+ and the handler additionally requires a full-access seat.
  'record-decision-lock': { minRank: 1, maxRank: 5, label: 'Freeze a decision’s information set or run an explicit process audit' },
  'govern-hindsight': { minRank: 4, maxRank: 5, label: 'Re-declare the process-audit conventions' },
  // ADR-0103: recording an unknown, answering one, dismissing one with a reason
  // and freezing a belief are every altitude's business — the ledger is built
  // from what a span actually did and did not read. Re-declaring the harvest
  // window, the escalation age, the expiry and the four floors moves every
  // unknown, every cell and every kappa in the workspace at once, so it is
  // director+ AND the handler requires a full-access seat.
  'record-epistemic-unknown': { minRank: 1, maxRank: 5, label: 'Record, answer, dismiss or freeze a belief in the epistemic ledger' },
  'govern-epistemic': { minRank: 4, maxRank: 5, label: 'Re-declare the epistemic-ledger conventions' },
  // ADR-0104: recording that a leader LOOKED at a dated fact (used, deferred,
  // or ruled out WITH a reason), pre-registering a process forecast and running
  // an explicit scan are every altitude's business. Re-declaring the floors
  // moves every frontier, every class interval and every grade in the workspace
  // at once, so it is rank 4-5 AND the handler requires a full-access seat.
  'record-diligence-consult': { minRank: 1, maxRank: 5, label: 'Record a consultation, pre-register a process forecast or scan the diligence ledger' },
  'govern-diligence': { minRank: 4, maxRank: 5, label: 'Re-declare the diligence-ledger conventions' },
  // ADR-0108: scanning the Decision-Fit ledger, pricing the authority of one
  // call and accepting a delegation proposal are every leader's business — the
  // first two write only a derived reading, and the third opens a governed
  // decision a human still has to make. Re-declaring the conventions that price
  // EVERY delegation in the workspace is director+ and the handler additionally
  // requires the full-access root seat, exactly as the other convention rights do.
  'record-fit': { minRank: 1, maxRank: 5, label: 'Scan the decision-fit ledger or re-price one call’s authority' },
  'govern-fit': { minRank: 4, maxRank: 5, label: 'Re-declare the decision-fit conventions' },
  // ADR-0109: detecting and pricing a cross-branch objective is every leader's
  // business (the scan writes only derived findings and one governed decision a
  // human must still accept); re-declaring the conventions that price EVERY
  // boundary in the workspace is director+ and the handler additionally requires
  // the full-access root seat, exactly as the other convention rights do.
  'record-jurisdiction': { minRank: 1, maxRank: 5, label: 'Scan the jurisdiction compiler or read one span’s cross-branch governance' },
  // ADR-0113: filing and withdrawing a 1:1 agenda line is the leader's own
  // preparation act, open at every altitude that holds a 1:1 — and the action
  // handlers additionally enforce the seat's own detail boundary.
  'prepare-agenda': { minRank: 1, maxRank: 5, label: 'File or withdraw a 1:1 agenda line inside your own span' },
  'govern-jurisdiction': { minRank: 4, maxRank: 5, label: 'Re-declare the jurisdiction conventions' },
  // ADR-0107: scoring one adopted response is every leader's business;
  // re-declaring the floors that price EVERY response is director+ and the
  // handler additionally requires the full-access root seat.
  'record-outcome-learning': { minRank: 1, maxRank: 5, label: 'Scan the outcome-learning ledger or pre-register one reviewed probability' },
  'govern-outcome-learning': { minRank: 4, maxRank: 5, label: 'Re-declare the outcome-learning conventions' },
  // ADR-0118: a portfolio arbitration commits capital, work and messaging across
  // several spans at once, and the comparison it rests on is portfolio material.
  // VP and chief only — a director may fund a function, but comparing two
  // cross-division responses and choosing between them is the executive act.
  'compare-responses': { minRank: 4, maxRank: 5, label: 'Compare and arbitrate between reviewed portfolio responses' },
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
  // ADR-0100: every altitude may measure the ladder and grade a due reading —
  // the measurement is identity-free. ADOPTING a ladder re-prices every span's
  // escalation clock, so it is a workspace-leader declaration (enforced in the action).
  'calibrate-span': { minRank: 1, maxRank: 5, label: 'Measure the leadership ladder against the record and grade a due reading' },
  'adopt-ladder': { minRank: 1, maxRank: 5, label: 'Declare a calibrated leadership ladder in force, or restore the declared one' },
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
