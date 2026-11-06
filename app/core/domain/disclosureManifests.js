/**
 * app/core/domain/disclosureManifests.js — the module catalogue, declared once.
 *
 * Every route the shell can render appears here exactly once. A route that is
 * missing is WITHHELD with a printed reason (fail closed), so adding a module is
 * one row — not a new adapter, and never a silent hole.
 *
 * A row answers four questions:
 *   1. Which governed collections does this screen read?
 *   2. Which record class does it belong to? (defaults to the collection's own
 *      declared class in seatRegistry.RECORD_POLICIES — never duplicated here
 *      unless the route has no collection of its own.)
 *   3. What can be counted without reading a single sentence? (`dates`, `dues`,
 *      `statuses`, `severities`, `amounts`, `currencies` — candidate field
 *      paths, first one present wins, so a rename degrades to "unknown" instead
 *      of inventing a number.)
 *   4. May the legacy screen render under a declared seat inside its own rank
 *      window (`adaptive`), or is it a modelling surface that publishes only its
 *      span aggregate to a seat (`aggregate`)?
 *
 * The `aggregate` choice is not modesty: a terminal whose report reads scan the
 * whole workspace cannot be handed to a seat that sees one span of it without
 * leaking peers. It publishes the altitude-appropriate aggregate and says so,
 * rather than pretending to be audited. Each row's `note` is printed in the
 * Disclosure Console, so the reason travels with the screen.
 */

import { DISCLOSURE_MODES } from './disclosureRegistry.js';

const A = DISCLOSURE_MODES.ADAPTIVE;
const G = DISCLOSURE_MODES.AGGREGATE;

const OPEN = ['open', 'active', 'pending', 'draft', 'running', 'in-progress', 'in_progress', 'requested', 'granted', 'held'];

function row(route, label, collections, opts = {}) {
  return Object.freeze({
    route,
    label,
    collections: Object.freeze(collections),
    mode: opts.mode || G,
    // Used when there is no collection, or when a custom report adapter owns
    // the scoping and suppression contract instead of exposing raw records.
    classKey: opts.classKey || null,
    adapterScoped: Boolean(opts.adapterScoped),
    detailCeiling: Number.isInteger(opts.detailCeiling) ? opts.detailCeiling : null,
    dates: Object.freeze(opts.dates || ['createdAt', 'openedAt']),
    dues: Object.freeze(opts.dues || []),
    statuses: Object.freeze(opts.statuses || ['status']),
    severities: Object.freeze(opts.severities || []),
    amounts: Object.freeze(opts.amounts || []),
    currencies: Object.freeze(opts.currencies || []),
    openStatuses: Object.freeze(opts.open || OPEN),
    // Some screens read a record from the URL (a detail page). They inherit the
    // parent list's posture so the list and the row cannot disagree.
    parent: opts.parent || null,
    note: opts.note || '',
  });
}

const WORK = ['cases', 'decisions', 'delegations', 'goals'];

export const MODULE_MANIFESTS = Object.freeze({
  /* ----------------------------------------------------- every-altitude core */
  today: row('today', 'Today', WORK, { mode: A, open: ['open', 'active', 'pending'], note: 'A seat always sees its own week.' }),
  mission: row('mission', 'Mission Control', WORK, { mode: A, note: 'The seat’s operating loop. Command Flow notes are returned only to their preparing seat; ancestors receive governed work and typed provenance.' }),
  disclosure: row('disclosure', 'Disclosure Console', ['disclosureGrants'], { mode: A, classKey: 'authority', note: 'Where the boundary explains itself: coverage, posture, grants and the upward brief.' }),
  seat: row('seat', 'Altitude Lens', [], { mode: A, classKey: 'authority', note: 'Who is operating, and what the position may see.' }),
  settings: row('settings', 'Settings & data', [], { mode: A, classKey: 'authority', note: 'Operator settings stay readable; identity and floor changes keep their rank gate.' }),
  assurance: row('assurance', 'Automation control', [], { mode: A, classKey: 'authority', note: 'Module automation pauses are a reviewed settings adapter.' }),
  propagation: row('propagation', 'Propagation ledger', [], { mode: A, classKey: 'authority', note: 'Rule provenance and typed edges, with no record content copied in.' }),
  seal: row('seal', 'Integrity & seals', [], { mode: A, classKey: 'authority', note: 'Verifies the append-only audit chain; writes only an audit event.' }),
  intake: row('intake', 'Intake triage', ['intakeDrafts'], { mode: A, note: 'A draft a seat typed itself.' }),
  routing: row('routing', 'Altitude Router', ['altitudeRoutingPlans'], { mode: A }),

  /* ------------------------------------------------------- frontline duties */
  oneonones: row('oneonones', '1:1s', ['oneOnOnes'], { mode: A, dates: ['date'], statuses: ['status'], note: 'Notes are individual detail: full at the manager altitude, counts above it.' }),
  'agenda-ledger': row('agenda-ledger', '1:1 agenda ledger', ['agendaEntries', 'agendaMarkers'], { mode: A, classKey: 'individual', adapterScoped: true, dates: ['filedOn'], statuses: ['status'], note: 'Which prompts stand on a span’s waiting lists and who owes each one, which prompts the leader filed as a commitment, and whether a filed prompt was actually raised. A prompt is individual detail: it is named at rank 1–2 and above rank 2 the ledger prints counts, shares, Wilson intervals and refusals only. A withheld rate is BLANK with its refusal printed, never zero.' }),
  feedback: row('feedback', 'Feedback', ['feedback'], { mode: A, dates: ['date', 'observedOn'], note: 'Free-text observations are never rolled up — only their count.' }),
  conflicts: row('conflicts', 'Conflict resolution', ['conflicts'], { mode: A, dates: ['openedOn'], dues: ['resolveBy'], severities: ['severity'] }),
  conflict: row('conflict', 'Conflict detail', ['conflicts'], { mode: A, parent: 'conflicts' }),
  goals: row('goals', 'Goals', ['goals'], { mode: A, dates: ['createdOn', 'createdAt'], dues: ['dueOn', 'targetOn'], statuses: ['status'] }),
  delegations: row('delegations', 'Delegations', ['delegations'], { mode: A, dates: ['delegatedOn'], dues: ['dueOn'], statuses: ['status'] }),
  growth: row('growth', 'Growth plans', ['growthPlans'], { mode: A, statuses: ['status'] }),
  readiness: row('readiness', 'Succession readings', ['readiness'], { mode: A, dates: ['assessedOn'], note: 'A readiness reading names a person; above the manager rank it is a count.' }),
  onboarding: row('onboarding', 'Onboarding', ['onboarding'], { mode: A, dates: ['startOn'], dues: ['targetOn'] }),
  recognition: row('recognition', 'Recognition', ['recognition'], { mode: A, dates: ['date'] }),
  reviews: row('reviews', 'Performance reviews', ['reviews'], { mode: A, dates: ['openedOn', 'cycleStart'], dues: ['dueOn'], statuses: ['status'] }),
  review: row('review', 'Review detail', ['reviews'], { mode: A, parent: 'reviews' }),
  prep: row('prep', 'Conversation prep', ['oneOnOnes'], { mode: A, parent: 'oneonones' }),
  performance: row('performance', 'Performance recovery', ['performanceConcerns'], { mode: A, dates: ['openedOn'], statuses: ['status'], note: 'A recovery plan is individual detail by construction.' }),
  people: row('people', 'People', ['people'], { mode: A, classKey: 'individual', note: 'Above the manager rank the roster is structure: names, roles and reporting lines — never pay or talking points.' }),
  person: row('person', 'Person', ['people'], { mode: A, classKey: 'individual', parent: 'people' }),

  /* ------------------------------------------------------ manager/unit work */
  cases: row('cases', 'Operational cases', ['cases'], { mode: A, dates: ['openedOn'], dues: ['reviewOn'], severities: ['fmea.severity', 'severity'], statuses: ['status'] }),
  case: row('case', 'Case detail', ['cases'], { mode: A, parent: 'cases' }),
  decisions: row('decisions', 'Decisions', ['decisions'], { mode: A, dates: ['date'], dues: ['reviewOn'], statuses: ['outcome'], open: ['pending', 'open'] }),
  'decision-robustness': row('decision-robustness', 'Decision robustness lab', [], { mode: A, classKey: 'authority', adapterScoped: true, detailCeiling: 5, note: 'Hypothetical inputs only; no pulse reads. The owner picker uses the projected roster and the ordinary case command enforces span rights.' }),
  health: row('health', 'Team health', ['pulses'], { mode: A, classKey: 'unit', dates: ['date'], note: 'Pulse aggregates keep their own anonymity floor; that floor is never lowered by this console.' }),
  capacity: row('capacity', 'Capacity', ['delegations', 'cases'], { mode: A, dates: ['delegatedOn', 'openedOn'], dues: ['dueOn', 'reviewOn'] }),
  load: row('load', 'Coupled load', WORK, { mode: A, dates: ['openedOn', 'delegatedOn', 'date'] }),
  hiring: row('hiring', 'Hiring', ['requisitions', 'candidates'], { mode: A, dates: ['openedOn'], dues: ['targetOn'], statuses: ['status'] }),
  'hiring-detail': row('hiring-detail', 'Requisition detail', ['requisitions'], { mode: A, parent: 'hiring' }),
  changes: row('changes', 'Org changes', ['changes'], { mode: A, dates: ['openedOn'], dues: ['reviewOn'], statuses: ['status'] }),
  change: row('change', 'Change detail', ['changes'], { mode: A, parent: 'changes' }),
  comms: row('comms', 'Comms outbox', ['commsDrafts'], { mode: A, dates: ['createdAt'], statuses: ['status'] }),
  retention: row('retention', 'Retention & economics', ['retentionPlans'], { mode: A, dates: ['createdOn'], dues: ['reviewOn'] }),
  stakeholders: row('stakeholders', 'Stakeholders', ['stakeholders'], { mode: A, dates: ['createdAt'], note: 'Mendelow salience is not personal data; free-text influence notes still roll up as counts.' }),
  stakeholder: row('stakeholder', 'Stakeholder detail', ['stakeholders'], { mode: A, parent: 'stakeholders' }),
  negotiations: row('negotiations', 'Negotiation', ['negotiations'], { mode: A, dates: ['openedOn'], dues: ['reviewOn'], statuses: ['status'] }),
  negotiation: row('negotiation', 'Negotiation detail', ['negotiations'], { mode: A, parent: 'negotiations' }),
  finance: row('finance', 'Budget & finance', ['budgets'], { mode: A, dates: ['createdAt'], amounts: ['limit'], currencies: ['currency'], statuses: ['status'], note: 'Money is aggregated per currency and never pooled across currencies.' }),
  budget: row('budget', 'Budget detail', ['budgets'], { mode: A, parent: 'finance' }),
  insights: row('insights', 'Signals', WORK, { mode: A, dates: ['openedOn'] }),

  /* ------------------------------------------------------------- succession */
  succession: row('succession', 'Leadership bench', ['successionReadings'], { mode: G, dates: ['frozenOn'], classKey: 'unit', note: 'Every span’s certified bench reading is published to a seat as counts; the terminal’s own report reads are not seat-scoped yet.' }),
  mandates: row('mandates', 'Decision rights', ['mandates'], { mode: A, dates: ['requestedOn'], dues: ['expiresOn'], statuses: ['status'] }),
  authorityCalibration: row('authorityCalibration', 'Authority calibration', ['authorityCalibrationMarkers'], { mode: A, classKey: 'enterprise', note: 'Grades contracts by action class and altitude; no person is rated.' }),
  responses: row('responses', 'Response studio', ['responsePlans'], { mode: A, dates: ['createdAt'] }),
  bundles: row('bundles', 'Action bundles', ['actionBundles'], { mode: A, dates: ['createdAt'], statuses: ['status'] }),
  concordance: row('concordance', 'Expectation concordance', ['expectationRounds'], { mode: A, dates: ['openedOn'], statuses: ['status'] }),
  // ADR-0087: the Federated Envoy. Adaptive: its report filters packets to the
  // operating subtree and the item content is already capped by the receiving
  // altitude's disclosure class, so a declared seat may open its own desk.
  envoy: row('envoy', 'Federated exchange', ['exchangePackets'], { mode: A, dates: ['receivedAt'], statuses: ['status'] }),
  // ADR-0090: the Programme Federation Reading. Adaptive: the report adapter
  // recomputes the active seat's scope, suppresses small cells with a
  // complementary cell and refuses a coverage rate below the span floor, so a
  // declared seat may open its own reading and cannot read a peer span's rows.
  federation: row('federation', 'Programme federation', ['federationAssessments'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['frozenOn'], note: 'The federation adapter measures carriage per declared leadership edge inside the active seat\u2019s span, blanks small cells with a complementary cell and withholds the coverage rate below the declared span floor. Raw assessment and marker rows are never projected into declared-seat view state, and no person is ever named.' }),
  // ADR-0099: the Freeze-Line Continuity Audit. The adapter measures continuity
  // across each crossed freeze line inside the active seat's span, refuses a
  // verdict below the declared edge floor, suppresses small altitude cells with
  // a complementary cell, and NEVER prints a carriage date beside a suppressed
  // row (the timing channel). Freeze lines are derived from committed/reverted
  // org designs; raw reading and marker rows are never projected into
  // declared-seat view state.
  'freeze-line': row('freeze-line', 'Freeze-line continuity', ['freezeReadings'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['frozenOn', 'lineOn'], note: 'The freeze-line adapter measures continuity across each crossed freeze line inside the active seat\u2019s span: before/after connected shares with Wilson intervals, a verdict refused below the declared edge floor, small altitude cells blanked with a complementary cell, and no carriage date on any suppressed row. No person, span name or per-span detail is ever named.' }),
  // ADR-0100: the Discretion Calibrator. The adapter measures the ladder from the
  // whole workspace's record but publishes only rung-level counts, intervals and
  // verdicts — no item, no person, no span detail above the cell floor. It is
  // adapter-scoped for exactly that reason: a seat that sees one span of the
  // workspace would otherwise be reading its peers' decision latencies.
  'span-calibration': row('span-calibration', 'Discretion calibration', ['spanReadings', 'spanAdoptions'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['frozenOn'], note: 'The calibration adapter measures the leadership ladder from the workspace\u2019s own decision record and publishes rung-level survival estimates, test-inverted intervals and verdicts only. Per-span cells below the declared floor are blank with a complementary cell; no person, item title, record text or individual item date is ever projected, and individual-sensitive sources are excluded by name.' }),
  // ADR-0101: the Reputational Capital Ledger. Adapter-scoped for a structural
  // reason, not a cosmetic one: the adapter derives every cell from the acts of
  // the spans INSIDE the active seat, so a director reading it cannot be handed a
  // peer's reputational record by widening a filter. Per-span rows below the
  // publishing floor are blanked with a complementary cell, and the export carries
  // no person, act or source id.
  // ADR-0102: the Hindsight Lock owns a scoped report adapter. Raw locks carry
  // record IDS of the facts a decision rested on, so they never enter a declared
  // seat projection; the terminal itself applies hierarchy scope, a fact floor
  // below which coverage is REFUSED, a settled floor below which no resulting
  // share or p-value is printed, and complementary suppression on the roll-up.
  // ADR-0103: the Epistemic Ledger owns a scoped report adapter. Raw unknowns
  // carry a generated class-and-date title and a POINTER to the record they were
  // read from — never that record's content, and never a person — so the adapter
  // publishes counts by class, state and altitude, the four belief-versus-record
  // cells with kappa/PABAK/bias/prevalence and their refusals, and per-class blind
  // coverage. It projects no unknown title, no record id, no answer and no
  // dismissal reason; a suppressed cell is BLANK rather than zero.
  epistemic: row('epistemic', 'Epistemic ledger', ['epistemicUnknowns', 'epistemicObservations', 'epistemicGrades', 'epistemicMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['harvestedOn', 'evidencesOn'], statuses: ['state'], note: 'The epistemic adapter publishes what the record already knew and nobody read: counts of unopened, open, answered, dismissed and expired unknowns by class and altitude; the four belief-versus-record cells with Cohen kappa, PABAK and the prevalence/bias indices, each refused below the declared paired-belief floor; and per-class blind coverage as an exact ratio of measurable activity to arriving edges. It never asks for a sentiment score, never projects an unknown title, a record or person id, an answer or a dismissal reason, and a suppressed cell is BLANK rather than zero.' }),
  // ADR-0104: the Diligence Ledger owns a scoped report adapter. Raw frontiers
  // carry typed fact POINTERS and consultations carry a written reason, so they
  // never enter a declared-seat projection: the adapter publishes counts by
  // class, altitude and frontier, Wilson-bounded coverage, Jeffreys class
  // intervals and once-only Brier skill. A refused rate is BLANK, never zero.
  // ADR-0109: the Jurisdiction Compiler publishes ONLY compiled, identity-free
  // branch counts. Above rank 2 it withholds every objective key, member id and
  // person; a cell below the declared small-cell floor is BLANK, never zero.
  jurisdiction: row('jurisdiction', 'Jurisdiction compiler', ['jurFindings', 'jurReadings', 'jurMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 2, dates: ['frozenAt'], dues: ['reviewOn'], statuses: ['status', 'verdict'], note: 'The jurisdiction adapter publishes counts of cross-branch objectives, coalition sizes, escalation rungs and priced governance routes per altitude, with Wilson attribution lower bounds, once-only Brier grades and every printed refusal. No objective key, no member record id, no person, no case or decision title and no private note is projected; a suppressed cell and a refused route are BLANK rather than zero. Suppression is not differential privacy and is labelled as such.' }),
  diligence: row('diligence', 'Diligence ledger', ['diligenceChecklists', 'diligenceConsults', 'diligenceGrades', 'diligenceMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 0, dates: ['decisionOn', 'frozenOn'], statuses: ['status'], note: 'The diligence adapter publishes the frozen knowable set as COUNTS: frontiers, settled/open, knowable and consulted facts, Wilson-bounded coverage refused below the declared floor, one Jeffreys Beta(1/2,1/2) 90% interval per evidence class with its dark-class verdict, identity-free altitude roll-up rows, and once-only Brier skill for a pre-declared process forecast against a strictly-prior 0.5 base rate. It never projects a fact pointer, a decision id, a person, a written consultation reason or a forecast question; BLANK refusal columns are not zeros.' }),
  hindsight: row('hindsight', 'Decision process audit', ['decisionLocks', 'decisionLockMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['decisionOn', 'frozenOn'], statuses: ['status'], note: 'The hindsight adapter freezes, per decision, the records the link spine had already tied to it on or before the decision date, and publishes counts (known, knowable-and-unconsulted, arrived-later, undated), a Wilson-bounded coverage rate refused below the declared fact floor, the four quadrants plus an explicit unmeasured state, the resulting share and an exact association test refused below the settled floor. It never projects a decision title, a decision or lock id, a person, a span id or the content of any fact, and a suppressed cell is BLANK rather than zero.' }),
  reputation: row('reputation', 'Reputational capital', ['reputationActs', 'reputationPositions'], { mode: A, classKey: 'individual', adapterScoped: true, detailCeiling: 5, dates: ['openedOn', 'dueOn', 'on'], statuses: ['status'], note: 'The reputation adapter prices what an act will cost to guarantee from the dated records the active seat can read. It publishes act-class cells, Wilson intervals, obstacle prices and verdicts only; per-span cells below the publishing floor are blank with a complementary cell, a refused cell prints its reason and never a zero, and no person name, act id, source id or note is ever projected.' }),
  // ADR-0092: the Differencing Defender. Adaptive: the report adapter recomputes
  // the active seat's own register scope, refuses a coverage rate below the
  // release floor, and never carries a withheld VALUE into the read model — a
  // screen that printed one would become the disclosure it warns about.
  differencing: row('differencing', 'Differencing defender', ['differenceReleases'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['releasedOn'], statuses: ['verdict'], note: 'The publication register is audited as one integer system across releases, seats and modules. A determined value is reported as a coordinate and a proof, never as the number; a declared seat reads its own publications only.' }),
  // ADR-0094: the Prospective Intervention Contract. Adaptive, because the
  // report adapter recomputes the active seat's own subtree, withholds pooled
  // rates below the declared cell floor and below director rank, and publishes
  // only counts, dates and state names. Raw contract rows carry a frozen cohort
  // of RECORD IDS and a title, so `detailCeiling: 0` keeps them out of
  // declared-seat view state entirely: the scoped report is the only reader.
  prospective: row('prospective', 'Prospective contracts', ['prospectiveContracts', 'prospectiveGrades', 'prospectiveMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 0, dates: ['declaredOn', 'horizonOn'], statuses: ['instrumentKey'], note: 'A bet is frozen before the work and graded once from the workspace’s own dated records. The adapter applies subtree scope, withholds pooled rates below the declared cell floor and below director rank, complementary-suppresses small calibration cells, and never projects a cohort id, a title, a name or an amount. A refused rate is BLANK, never zero.' }),
  'robust-allocation': row('robust-allocation', 'Robust allocation', ['robustPlans', 'robustMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 0, dates: ['declaredOn', 'horizonOn'], statuses: ['status'], note: 'A multi-action allocation is solved exactly under declared effect ranges and hard capacity, budget and equity constraints. The adapter applies subtree scope, withholds the pooled falsified share below the declared cell floor and below director rank, complementary-suppresses small altitude rows, and never projects a plan id, a title, a name or a currency amount. Money is never pooled across currencies; a refused rate is BLANK, never zero.' }),
  // ADR-0098: the Clearinghouse owns a scoped report adapter. Raw rounds
  // contain sealed tiers, bid notes and frozen solver details, so they never
  // enter a declared-seat projection; the terminal itself applies hierarchy,
  // anti-anchoring and aggregate suppression.
  clearing: row('clearing', 'Internal clearinghouse', ['clearingRounds', 'clearingMarkers'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 0, dates: ['openedOn', 'horizonOn', 'clearedOn'], statuses: ['status'], amounts: ['budgetCap', 'reserveBudget'], currencies: ['currency'], note: 'The Clearinghouse adapter exposes only the active seat’s rounds, own sealed bid where invited and identity-free roll-ups. Sibling bids, raw notes, names and solver detail are withheld horizontally or above the chairing altitude; small cells and pooled calibration figures are withheld below the declared floor.' }),
  // ADR-0089: the report adapter recomputes the active seat's scoped cohort,
  // redacts pact details at high altitude and suppresses small cells. Raw cycle
  // and marker rows are never projected into declared-seat view state.
  'strategy-cycle': row('strategy-cycle', 'Strategy renewal', ['strategyCycles'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['frozenOn', 'reviewOn'], statuses: ['status'], note: 'The Strategy Cycle adapter applies subtree scope, altitude redaction and small-cell withholding. Raw cohort IDs and stored marker rows are not disclosed.' }),

  /* ------------------------------------------------------------------ analytics terminals */
  attribution: row('attribution', 'Outcome attribution', ['settlements'], { note: 'Earned-schedule settlement runs over the whole workspace ledger.' }),
  counterfactual: row('counterfactual', 'Counterfactual policy', ['policyEvaluations']),
  reliability: row('reliability', 'Measurement reliability', ['reliabilityReadings'], { classKey: 'enterprise' }),
  supply: row('supply', 'Evidence supply chain', ['supplyPlans'], { classKey: 'portfolio' }),
  solvency: row('solvency', 'Promise solvency', ['solvencyReadings'], { classKey: 'enterprise' }),
  sceptic: row('sceptic', 'Cross-examination', ['scepticRounds'], { classKey: 'enterprise' }),
  chain: row('chain', 'Command chain', ['chainReadings'], { classKey: 'enterprise' }),
  measurement: row('measurement', 'Measurement lab', ['scorecards'], { classKey: 'portfolio' }),
  allocation: row('allocation', 'Resource allocation', ['capitalPolicies'], { classKey: 'portfolio' }),
  dynamics: row('dynamics', 'Operating dynamics', ['dynamicsExperiments'], { classKey: 'portfolio' }),
  capital: row('capital', 'Capital portfolio', ['capitalPolicies'], { classKey: 'portfolio' }),
  strategy: row('strategy', 'Strategy', ['strategyBets'], { classKey: 'portfolio' }),
  learning: row('learning', 'Learning ledger', ['retros'], { classKey: 'portfolio' }),
  premises: row('premises', 'Assumption ledger', ['premises'], { classKey: 'portfolio' }),
  anomaly: row('anomaly', 'Anomaly intelligence', WORK, { classKey: 'portfolio' }),
  watch: row('watch', 'Early warning', ['watchAlerts', 'watchForecasts'], { classKey: 'portfolio' }),
  handover: row('handover', 'Handover', WORK, { classKey: 'portfolio' }),
  scenarios: row('scenarios', 'Scenarios', WORK, { classKey: 'portfolio' }),
  resilience: row('resilience', 'Resilience', ['dependencies'], { classKey: 'portfolio' }),
  'resilience-detail': row('resilience-detail', 'Dependency detail', ['dependencies'], { parent: 'resilience' }),
  power: row('power', 'Coalition map', ['powerGames'], { classKey: 'portfolio' }),
  'power-detail': row('power-detail', 'Coalition game detail', ['powerGames'], { parent: 'power' }),
  network: row('network', 'Org network', ['people'], { classKey: 'portfolio', note: 'Derived structure only: reporting and collaboration edges, never private fields.' }),
  impact: row('impact', 'Impact ledger', ['impactStudies'], { classKey: 'portfolio' }),
  fidelity: row('fidelity', 'Implementation fidelity', ['fidelityPlans'], { classKey: 'portfolio' }),
  merit: row('merit', 'Merit & pay equity', ['meritCycles', 'compBands'], { classKey: 'enterprise' }),
  transition: row('transition', 'Workforce transition', ['transitionPrograms'], { classKey: 'enterprise' }),
  orgdesign: row('orgdesign', 'Org design', ['orgDesigns'], { classKey: 'enterprise' }),
  voi: row('voi', 'Information value', ['voiDecisions', 'voiStudies'], { classKey: 'enterprise' }),
  portfolio: row('portfolio', 'Decision portfolio', ['portfolio'], { classKey: 'portfolio' }),
  attention: row('attention', 'Attention market', ['attentionPlans'], { classKey: 'portfolio' }),
  signal: row('signal', 'Signal path', ['signalClasses'], { classKey: 'portfolio' }),
  autopilot: row('autopilot', 'Autopilot', ['autopilotPolicies', 'autopilotRuns'], { classKey: 'portfolio' }),
  survival: row('survival', 'Delivery survival', ['survivalReadings'], { classKey: 'portfolio' }),
  wait: row('wait', 'Cost of waiting', WORK, { classKey: 'portfolio' }),
  parity: row('parity', 'Pay/leadership parity', ['parityAudits'], { classKey: 'enterprise' }),
  evidence: row('evidence', 'Evidence reviews', ['evidenceReviews'], { classKey: 'portfolio' }),
  consequences: row('consequences', 'Consequences', ['consequenceReadings'], { classKey: 'portfolio' }),
  deferral: row('deferral', 'Deferral option', ['deferralFrames'], { classKey: 'portfolio' }),
  integrity: row('integrity', 'Signal integrity', ['integrityReviews'], { classKey: 'enterprise' }),
  credibility: row('credibility', 'Evidence credibility', ['credibilityFrames'], { classKey: 'portfolio' }),
  confidence: row('confidence', 'Confidence transport', ['confidenceCertificates'], { classKey: 'enterprise' }),
  forecasts: row('forecasts', 'Forecast integrity', ['forecastChallenges'], { classKey: 'portfolio' }),
  tempo: row('tempo', 'Decision tempo', ['tempoSchedules'], { classKey: 'portfolio' }),
  wargame: row('wargame', 'War game', ['warGames'], { classKey: 'portfolio' }),
  coupling: row('coupling', 'Coupled load', ['couplingMarkers'], { classKey: 'portfolio' }),
  // ADR-0096: the Escalation Economy and the Operating Cadence Clock printed
  // per-table small-cell floors directly and never entered the publication
  // register (ADR-0092), so a SERIES of their tables was never audited across
  // days, seats or altitudes. Both now declare a manifest so their aggregates
  // can be planned and published into the differencing register.
  escalation: row('escalation', 'Escalation economy', ['escalationRecords', 'escalationCommitments'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['loggedOn', 'createdAt'], dues: ['decidedOn', 'reviewOn'], statuses: ['status', 'disposition'], note: 'The escalation adapter publishes span counts of recorded decision moments and graded commitments; no person, seat name, title, proposed action or note. The register audits the release series as one integer system.' }),
  cadence: row('cadence', 'Operating cadence', ['cadenceForums', 'cadenceSessions'], { mode: A, classKey: 'unit', adapterScoped: true, detailCeiling: 5, dates: ['createdAt', 'heldOn'], dues: ['nextOn'], statuses: ['status'], note: 'The cadence adapter publishes span counts of declared forums and held sittings; no chair name, attendee list, forum free text or item title. The register audits the release series as one integer system.' }),
});

/** Detail screens inherit their parent list's manifest. */
export const MANIFEST_PARENTS = Object.freeze(Object.fromEntries(
  Object.values(MODULE_MANIFESTS).filter((m) => m.parent).map((m) => [m.route, m.parent]),
));

export const MANIFEST_ROUTES = Object.freeze(Object.keys(MODULE_MANIFESTS));

/** The route a manifest is governed by (its parent when it is a detail page). */
export function manifestFor(route) {
  const own = MODULE_MANIFESTS[route];
  if (own) return own;
  const parent = MANIFEST_PARENTS[route];
  return parent ? MODULE_MANIFESTS[parent] || null : null;
}

/** Every collection any manifest can read — used by the compile-time audit. */
export const MANIFEST_COLLECTIONS = Object.freeze([...new Set(
  Object.values(MODULE_MANIFESTS).flatMap((m) => m.collections),
)].sort());
