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
  // ADR-0162: Bilateral management-interface operating agreements carry named
  // counterpart pairs and written basis prose, so declared seats read only the
  // seat-scoped report adapter rather than raw collection rows.
  matrixInterfaceAgreements: { classKey: 'unit', detailCeiling: 0, label: 'Matrix management-interface operating agreements (report only)', route: '#/matrix?panel=interfaces' },
  matrixInterfaceMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Matrix management-interface review markers', route: '#/matrix?panel=interfaces' },
  // ADR-0185: raw dated requests contain frozen impact/line snapshots and
  // responses contain first-person prose. Every declared seat receives them
  // only through the Matrix line-scoped read adapter, never raw projection.
  changeImpactRequests: { classKey: 'unit', detailCeiling: 0, label: 'Matrix change-impact line-review requests (scoped adapter only)', route: '#/matrix?panel=change-impacts' },
  changeImpactResponses: { classKey: 'unit', detailCeiling: 0, label: 'Matrix change-impact line responses (scoped adapter only)', route: '#/matrix?panel=change-impacts' },
  // ADR-0174: Standing delegation-of-authority schedule and RULE-DOA-01 markers
  // are surfaced exclusively via the seat-scoped `buildDoaReport` adapter.
  doaSchedule: { classKey: 'unit', detailCeiling: 0, label: 'Standing delegation-of-authority schedule (report only)', route: '#/matrix?panel=authority' },
  doaMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Delegation-of-authority ratification markers', route: '#/matrix?panel=authority' },
  // ADR-0175: Matrix Pattern Repair Register (`matrixRemedies`).
  matrixRemedies: { classKey: 'unit', detailCeiling: 0, label: 'Matrix pattern remedies (dated acts; verdicts re-derived on read)', route: '#/matrix?panel=remedies' },
  // ADR-0164: RULE-OOL-01 ask & observation ledger.
  oneOnOneLineMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Matrix 1:1 coverage ask & observation markers', route: '#/matrix?panel=one-on-ones' },
  // ADR-0176: Cross-Line Selection Corroboration.
  hiringLinePlans: { classKey: 'unit', detailCeiling: 0, label: 'Co-hiring line plans (dated acts; verdicts re-derived on read)', route: '#/matrix?panel=hiring' },
  hiringLineMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Co-hiring assessment ask & observation markers', route: '#/matrix?panel=hiring' },
  // ADR-0177: transfer-price acts and RULE-TPL-01 markers are surfaced only
  // through the seat-scoped `buildTransferPriceLedger` adapter, never as raw rows.
  transferPriceActs: { classKey: 'unit', detailCeiling: 0, label: 'Transfer-price acts (dated two-key acts; charges re-derived on read)', route: '#/matrix?panel=chargeback' },
  transferPriceMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Transfer-price ask & observation markers', route: '#/matrix?panel=chargeback' },
  chargebackPostings: { classKey: 'unit', detailCeiling: 0, label: 'Chargeback period postings (dated posting/reversal acts; audits re-derived on read)', route: '#/matrix?panel=postings' },
  chargebackPostingMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Chargeback posting ask & observation markers', route: '#/matrix?panel=postings' },
  // ADR-0208: report-only, like every money ledger above. The raw rows are never
  // handed to the generic projection; the register's own reader discloses a case
  // to the seat whose tree or declared line holds its benefit owner.
  investmentCases: { classKey: 'unit', detailCeiling: 0, label: 'Investment cases (report only; every figure re-derived on read)', route: '#/finance?panel=cases' },
  investmentCaseActs: { classKey: 'unit', detailCeiling: 0, label: 'Investment case ratification, withdrawal and review acts (report only)', route: '#/finance?panel=cases' },
  investmentCaseMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Investment case review observation markers', route: '#/finance?panel=cases' },
  // ADR-0209: report-only. A shift row names a person and their hours; the raw
  // rows are never handed to the generic projection. The ledger's own reader
  // discloses a person to the seat whose tree or declared line holds them.
  workRestShifts: { classKey: 'unit', detailCeiling: 0, label: 'Declared shifts (report only; every spell and rest re-derived on read)', route: '#/standard-work?panel=rest' },
  workRestActs: { classKey: 'unit', detailCeiling: 0, label: 'Shift amendments — actual times and cancellations (report only)', route: '#/standard-work?panel=rest' },
  workRestCoverage: { classKey: 'unit', detailCeiling: 0, label: 'Per-line coverage attestations of the work record (report only)', route: '#/standard-work?panel=rest' },
  workRestPolicies: { classKey: 'unit', detailCeiling: 0, label: 'Declared work/rest policies with their written source (report only)', route: '#/standard-work?panel=rest' },
  workRestMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Work/rest conflict observation markers', route: '#/standard-work?panel=rest' },
  // ADR-0226: report-only. A break names a person, a shift and an interval; the
  // raw rows are never handed to the generic projection. The reading's own
  // reader discloses a person to the seat whose tree or declared line holds
  // them, and records a break only for a line the seat holds.
  workBreaks: { classKey: 'unit', detailCeiling: 0, label: 'Declared in-shift breaks (report only; every continuous stretch re-derived on read)', route: '#/standard-work?panel=night' },
  workNightPolicies: { classKey: 'unit', detailCeiling: 0, label: 'Declared night policies — the window and the limits, with their source (report only)', route: '#/standard-work?panel=night' },
  workNightMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Night-work breach observation markers', route: '#/standard-work?panel=night' },
  // ADR-0210: report-only, like every governance ledger above. An interest names
  // a person and a record; the raw rows are never handed to the generic
  // projection. The register's own reader discloses a person to the seat whose
  // tree or declared line holds them, and withholds everybody else by name.
  conflictInterests: { classKey: 'unit', detailCeiling: 0, label: 'Decision-maker interests (report only; every verdict re-derived on read)', route: '#/recusal' },
  conflictNoneDeclarations: { classKey: 'unit', detailCeiling: 0, label: 'First-person declarations of no reportable interest (report only)', route: '#/recusal' },
  conflictStandings: { classKey: 'unit', detailCeiling: 0, label: 'Responses to declared interests — recusal, mitigation, determination (report only)', route: '#/recusal' },
  conflictRules: { classKey: 'unit', detailCeiling: 0, label: 'Reportable-conflict rules and their written sources', route: '#/recusal' },
  conflictRecusalMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Conflict-of-interest observation markers', route: '#/recusal' },
  // ADR-0212: report-only, like every governance ledger above. A request names a
  // person, a routine and a written reason; the raw rows are never handed to the
  // generic projection. The register's own reader discloses a routine to the seat
  // whose tree or declared line holds its owner, and withholds everybody else.
  standardWaiverRequests: { classKey: 'unit', detailCeiling: 0, label: 'Temporary standard-work waiver requests (report only; every state re-derived on read)', route: '#/standard-work?panel=waivers' },
  standardWaiverGrants: { classKey: 'unit', detailCeiling: 0, label: 'Answers to waiver requests — grant, refusal, revocation (report only)', route: '#/standard-work?panel=waivers' },
  standardWaiverDecisions: { classKey: 'unit', detailCeiling: 0, label: 'Closing decisions on waivers — standard restored, routine retired (report only)', route: '#/standard-work?panel=waivers' },
  standardWaiverMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Standard-waiver ask & observation markers', route: '#/standard-work?panel=waivers' },
  // ADR-0237: report-only. A revision names a routine, its prior and new text and
  // the people owed it; the register's own reader discloses it to the seat whose
  // reach holds the owner, and withholds the rest.
  standardRevisions: { classKey: 'unit', detailCeiling: 0, label: 'Standard-work revisions — prior text, new text, approver, effective day (report only)', route: '#/standard-work?panel=revisions' },
  standardRevisionBriefs: { classKey: 'unit', detailCeiling: 0, label: 'Briefings of people owed a revised standard (report only)', route: '#/standard-work?panel=revisions' },
  // ADR-0213: declared standards and dated actuals name a budget holder and the
  // declared owners of a variance. Report only: the panel reads its own
  // seat-checked report, never the raw rows.
  flexBudgetPlans: { classKey: 'unit', detailCeiling: 0, label: 'Flexible-budget standards (report only; every variance re-derived on read)', route: '#/finance?panel=variance' },
  flexBudgetActuals: { classKey: 'unit', detailCeiling: 0, label: 'Actuals recorded against a flexible-budget standard (report only)', route: '#/finance?panel=variance' },
  // ADR-0214: a valuation reading is the owners' claim on the whole company, and
  // a leg claim names a person as answerable for part of it. Both are ENTERPRISE
  // material: below the executive altitude there is no honest per-line reading of
  // enterprise value, so the floor is rank 4 rather than a redacted derivative.
  valueBridgeReadings: { classKey: 'enterprise', detailCeiling: 5, label: 'Dated enterprise valuation readings (report only; every leg re-derived on read)', route: '#/finance?panel=value' },
  valueBridgeLeverClaims: { classKey: 'enterprise', detailCeiling: 5, label: 'Declared ownership of value-bridge legs (report only)', route: '#/finance?panel=value' },
  // ADR-0215: report-only, like every governance ledger above. A concern names a
  // reporter, a subject, a receiver and a written summary; the raw rows are NEVER
  // handed to the generic projection. The register's own reader discloses a
  // concern to the receiver, to the reporter, and as category/route/state to a
  // seat that holds a party — and to everybody else as a count. The subject of a
  // concern is shown it never.
  concernReports: { classKey: 'unit', detailCeiling: 0, label: 'Raised concerns and the route each was given (report only; every state re-derived on read)', route: '#/speak-up' },
  concernActs: { classKey: 'unit', detailCeiling: 0, label: 'Dated acts answering a concern — acknowledgement, outcome, retaliation check, closure, withdrawal (report only)', route: '#/speak-up' },
  concernMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Speak-up observation markers — no impartial route, receiver drifted', route: '#/speak-up' },
  // ADR-0218: a review names a person's conduct and a decision is a verdict on it, so
  // both are INDIVIDUAL material — the same class as coaching notes and 1:1 content.
  // Above the manager altitude a seat reads counts only. Acts carry the person id so
  // a decision can never be readable when its review is not.
  justCultureReviews: { classKey: 'individual', label: 'Just Culture decision reviews — the conduct under review, its deciding line and the event', route: '#/just-culture' },
  justCultureActs: { classKey: 'individual', label: 'Just Culture decisions, concurrences, dissents and withdrawals', route: '#/just-culture' },
  // ADR-0219: an appetite statement is a board-level declaration and a risk
  // declaration is a named line's retention. Both are PORTFOLIO material: the
  // register's own reader discloses the exact ceiling to the director altitude
  // and above, and the generic projection never hands over the raw rows.
  riskAppetiteStatements: { classKey: 'portfolio', detailCeiling: 4, label: 'Declared appetite statements — one exact ceiling per domain, measure and currency (report only)', route: '#/risk-appetite' },
  riskDeclarations: { classKey: 'portfolio', detailCeiling: 4, label: 'Declared retained exposure per live risk, with its written basis (report only)', route: '#/risk-appetite' },
  riskAppetiteMarkers: { classKey: 'portfolio', detailCeiling: 4, label: 'Risk-appetite observation markers — no joint seat, declarer departed (identity-free)', route: '#/risk-appetite' },
  // ADR-0238: a working window and a sitting are INDIVIDUAL material — claims
  // about a person's daily life and the clock they worked under. The reader
  // discloses per-person rows below the executive altitude and counts above
  // it; the generic projection never hands over raw rows at the top.
  dweWindows: { classKey: 'individual', label: 'Declared working windows — one sourced daily span per person, with its zone', route: '#/distributed-equity' },
  dweSittings: { classKey: 'individual', label: 'Declared unsociable-hour sittings — dated wall-clock events with their attendees and chair', route: '#/distributed-equity' },
  dweMarkers: { classKey: 'unit', detailCeiling: 3, label: 'Distributed-equity observation markers — unreadable windows, no joint seat (identity-free)', route: '#/distributed-equity' },
  // ADR-0241: a functional restriction is INDIVIDUAL material — it is a statement
  // about a person's body, the same class as 1:1 content and Just Culture reviews.
  // The reader discloses per-person rows below rank 3 and counts above it; the
  // generic projection never hands over a raw row at the top. The adjustment,
  // acknowledgement and review ledgers are equally individual: each names a person.
  wpaRestrictions: { classKey: 'individual', label: 'Declared functional restrictions — the limitation the work must respect, its instrument and its written source', route: '#/adjustments' },
  wpaAdjustments: { classKey: 'individual', label: 'Adjustments agreed and made operational for a person — what was done, and the two dates', route: '#/adjustments' },
  wpaAcknowledgements: { classKey: 'individual', label: 'Per-line acknowledgements that a manager has been shown a restriction they hold', route: '#/adjustments' },
  wpaReviews: { classKey: 'individual', label: 'Recorded reviews of a restriction — the decision, its basis and the day', route: '#/adjustments' },
  wpaMarkers: { classKey: 'unit', detailCeiling: 3, label: 'Workplace-adjustment observation markers — no joint seat, no line to ask (identity-free)', route: '#/adjustments' },
  lwkDeployments: { classKey: 'individual', label: 'Declared lone deployments — who is alone, where, against which written assessment, checked how often and until when', route: '#/lone-working' },
  lwkCheckins: { classKey: 'individual', label: 'Recorded contacts on a lone deployment — the channel, the outcome and the exact instant', route: '#/lone-working' },
  lwkEscalations: { classKey: 'individual', label: 'Welfare escalations raised when a contact lapsed or a concern was raised — the basis, the outcome and what was actually done', route: '#/lone-working' },
  lwkMarkers: { classKey: 'unit', detailCeiling: 3, label: 'Lone-working observation markers — no joint seat, no line to ask (identity-free)', route: '#/lone-working' },
  // ADR-0240 (Schema v194): the incident command register. An incident record
  // names the people on the bridge, the instrument it was declared under and the
  // external parties it owes — individual detail that is not handed upward, so
  // the detail ceiling sits at the director altitude and above it only counts
  // survive. The acts are open at every rank (a responder must be able to see the
  // incident they are on) with the reader narrowing per-person detail.
  micIncidents: { classKey: 'individual', detailCeiling: 3, label: 'Declared incidents — title, severity and criterion, detection and declaration instants, response lines, declared clocks and notification obligations', route: '#/incidents' },
  micActs: { classKey: 'individual', detailCeiling: 3, label: 'Append-only incident acts — line assignment and acceptance, command assumption and transfer, notification records, severity changes, resolution and stand-down', route: '#/incidents' },
  micMarkers: { classKey: 'unit', detailCeiling: 3, label: 'Incident-command observation markers — no joint seat above the lines, unnamable commander (identity-free)', route: '#/incidents' },
  // ADR-0229: a capability case, its priced options and its acts are PORTFOLIO
  // material — the boundary of the firm is not a unit's own instrument. Each row
  // is span-scoped by its owner and lines inside the register's reader, so a
  // seat above the director altitude reads counts and the register narrows the
  // detail itself. The markers carry no joint seat and no declarer at all.
  sourcingCases: { classKey: 'portfolio', detailCeiling: 4, label: 'Declared capability cases — currency, horizon, discount rate and asset specificity (report only)', route: '#/sourcing' },
  sourcingOptions: { classKey: 'portfolio', detailCeiling: 4, label: 'Priced sourcing options — a mode, its exact cost lines and its declared safeguards', route: '#/sourcing' },
  sourcingActs: { classKey: 'portfolio', detailCeiling: 4, label: 'Boundary decisions and independent grades recorded against a frozen case', route: '#/sourcing' },
  sourcingMarkers: { classKey: 'portfolio', detailCeiling: 4, label: 'Capability-sourcing observation markers — no joint seat, no chief apex (identity-free)', route: '#/sourcing' },
  // ADR-0220: the variable-pay register. A PLAN, its MEASURES and its READINGS
  // are unit material: the funding line and the line above read the envelope and
  // the evidence, and above the director altitude the register is counts and
  // rates. Every row is span-scoped by its `ownerId`, so a manager reads their
  // own envelope and never a peer line's.
  incentivePlans: { classKey: 'unit', detailCeiling: 3, label: 'Variable-pay plans — a funding line’s envelope, window and written basis (report only)', route: '#/incentive' },
  incentiveMeasures: { classKey: 'unit', detailCeiling: 3, label: 'Declared incentive measures — outcome key, direction, exact target and declared control (report only)', route: '#/incentive' },
  incentiveReadings: { classKey: 'unit', detailCeiling: 3, label: 'Verified readings behind a measure, with their evidence reference (report only)', route: '#/incentive' },
  // AWARDS and RECOVERIES are money for a named person. Item detail stops ABOVE
  // the director: the line that administers the plan reads its own awards, and
  // the executive above it reads counts and control totals — the same posture the
  // merit terminal takes with pay, applied to variable pay.
  incentiveAwards: { classKey: 'unit', detailCeiling: 3, label: 'Individual variable-pay awards — money for a named person, on a measured or discretionary basis (report only)', route: '#/incentive' },
  incentiveRecoveries: { classKey: 'unit', detailCeiling: 3, label: 'Recovery acts against an award — demanded, recovered or waived, with a written reason (report only)', route: '#/incentive' },
  incentiveMarkers: { classKey: 'unit', detailCeiling: 3, label: 'Incentive-integrity observation markers — no joint seat, funding line departed (identity-free)', route: '#/incentive' },
  // ADR-0221: the Duty-Without-Means Register. Report-only (`detailCeiling: 0`)
  // so raw rows are never handed to the generic projection; `buildDutyMeans`
  // discloses duties to the carrier, demanding line, controlling line, and
  // joint-apex ancestors, while redacting individual contributor identity above
  // the director altitude.
  portfolioUnits: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio units (report only)', route: '#/portfolio-review' },
  portfolioReviews: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio dated evidence (report only)', route: '#/portfolio-review' },
  portfolioVerdicts: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio CEO verdicts (report only)', route: '#/portfolio-review' },
  portfolioMilestones: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio execution milestones (report only)', route: '#/portfolio-review' },
  portfolioExits: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio completed sell & exit settlements (report only)', route: '#/portfolio-review' },
  portfolioReviewMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Portfolio review identity-free observations (report only)', route: '#/portfolio-review' },
  dutyMeansDuties: { classKey: 'unit', detailCeiling: 0, label: 'Declared accountable duties and their demanding lines (report only; verdicts re-derived on read)', route: '#/means' },
  dutyMeansRequirements: { classKey: 'unit', detailCeiling: 0, label: 'Required authority, budget and protected-time pillars per duty (report only)', route: '#/means' },
  dutyMeansActs: { classKey: 'unit', detailCeiling: 0, label: 'Controlling-line supply, refusal, withdrawal and joint-apex entrepreneurial-gap acts (report only)', route: '#/means' },
  dutyMeansMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Duty-without-means observation markers — no joint apex, holder off roster (identity-free)', route: '#/means' },
  // ADR-0223: a changeover brief names two operators and the station they stood
  // at, so ALL rows are report-only (`detailCeiling: 0`); `buildShiftHandover`
  // discloses briefs at the manager altitude and redacts identities above the
  // director altitude, and the rule's markers are identity-free by construction.
  shiftHandovers: { classKey: 'unit', detailCeiling: 0, label: 'Shift handover changeover briefs — severity, station summary, open actions with owners, contingency (report only; state re-derived on read)', route: '#/shift-handover' },
  shiftHandoverReadbacks: { classKey: 'unit', detailCeiling: 0, label: 'The incoming operator’s two-key acts — synthesis or dispute, dated and immutable (report only)', route: '#/shift-handover' },
  shiftHandoverMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Shift-handover observation markers — no joint seat above both lines (identity-free)', route: '#/shift-handover' },
  // ADR-0224: one immutable stop is counted once for its work area; its
  // participants, hazard narrative and control evidence are report-only and
  // disclosed by the single stop-work reader, never the generic seat projection.
  workStops: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Human-declared stop-work holds, hazard and work-control evidence (report only; status re-derived on read)', route: '#/work-stop' },
  workStopActs: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Append-only mitigation, independent assessment and affected-operator decisions (report only)', route: '#/work-stop' },
  workStopMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Stop-work no-authority / matrix-drift observations — identity-free', route: '#/work-stop' },
  // ADR-0225: a managerial transition is counted once for its role; the
  // portfolio contents and the act stream are report-only and disclosed by the
  // single managerial-handover reader, never the generic seat projection.
  mgrHandovers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Declared managerial portfolio transitions (report only; state re-derived on read)', route: '#/manager-handover' },
  mgrHandoverActs: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Append-only outgoing brief, successor acceptance, governor release and dispute acts (report only)', route: '#/manager-handover' },
  mgrHandoverMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Managerial-handover no-authority / dispute observations — identity-free', route: '#/manager-handover' },
  // ADR-0227: an improvement suggestion names its author, its COMPUTED route
  // and maybe an owner, so ALL rows are report-only (`detailCeiling: 0`);
  // `buildSuggestionReport` discloses rows to parties and to the span that
  // holds the named people, and withholds the rates whole whenever any row is
  // hidden. The rule's markers are identity-free by construction.
  suggestions: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Frontline improvement suggestions — area, problem, proposal, computed route (report only; state re-derived on read)', route: '#/suggestions' },
  suggestionActs: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Append-only triage decisions, effect claims and independent confirmations (report only)', route: '#/suggestions' },
  suggestionMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Improvement-suggestion no-ask observations — a route member or owner the graph cannot name (identity-free)', route: '#/suggestions' },
  // ADR-0232: a finding names a control, a criteria it departed from, the lines
  // accountable for it and the people who own and test the fix, so ALL rows are
  // report-only (`detailCeiling: 0`); `buildAssuranceReport` discloses rows to
  // parties and to the span that holds the named people, and withholds the line
  // table and the rates whole whenever any row is hidden. The rule's markers
  // are identity-free by construction.
  assuranceFindings: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Assurance findings — control, scope, criteria, accountable lines (report only; state and recurrence re-derived on read)', route: '#/findings' },
  assuranceFindingActs: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Append-only assignments, assertions, independent verifications and residual-risk acceptances (report only)', route: '#/findings' },
  assuranceFindingMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Assurance-finding no-ask observations — an owner, holder or joint apex the graph cannot name (identity-free)', route: '#/findings' },
  // ADR-0233: a gate names a joiner, their declared terms, the lines asked for
  // evidence and the people who submit, extend, decide and notify, so ALL rows
  // are report-only (`detailCeiling: 0`); `buildProbationReport` discloses rows
  // to parties (the joiner included — a fair process is one the person it is
  // about can see) and to the span that holds the named people, and withholds
  // the register-wide rate whole whenever any row is hidden. The rule's markers
  // are identity-free by construction.
  probationGates: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Probation gates — joiner, declared window, instrument terms, lines (report only; state and lapse re-derived on read)', route: '#/probation' },
  probationActs: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Append-only evidence asks, submissions, extensions, decisions and notifications (report only)', route: '#/probation' },
  probationMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Probation no-ask observations — a confirming manager or line holder the graph cannot name (identity-free)', route: '#/probation' },
  // ADR-0234: an undertaking names a COUNTERPARTY OUTSIDE the organisation, a
  // declared executive, the holders of every obligation line and the seats that
  // tested and reported it, so ALL rows are report-only (`detailCeiling: 0`) —
  // a promise to a regulator is never handed to the generic projection.
  // `buildUndertakingReport` discloses rows to parties and to the span that
  // holds the named people, and withholds the register-wide rate whole whenever
  // any row is hidden. The rule's markers are identity-free by construction.
  undertakings: { classKey: 'enterprise', detailCeiling: 0, reportOnly: true, label: 'Undertakings — counterparty, instrument, scope, due day, obligation lines (report only; state, closure and lapse re-derived on read)', route: '#/undertakings' },
  // ADR-0235/0236 (Schema v191): an information request names a REQUESTER OUTSIDE
  // the organisation, the instrument they asked under, the material they demanded,
  // the day they set and, where declared, the earlier insufficient demand it follows.
  // Which lines produced what, who reviewed it, what was withheld under privilege
  // and what was released are the entity's own records about its response work —
  // the material's contents are not held here, so a `full` read releases no
  // document. But a named requester, a named scope and a named review of one line
  // tells a reader which relationship is under examination and which people are
  // carrying it, which is the same exposure ADR-0234 closed, one level earlier in
  // the life of a demand. A lineage edge grants no read to its parent or child.
  // `reportOnly` is therefore the whole class ceiling, at every altitude.
  informationRequests: { classKey: 'enterprise', detailCeiling: 0, reportOnly: true, label: 'Information requests — requester, instrument, requested scope, receipt day, declared clock (report only; state, lapse, review coverage and privilege position re-derived on read)', route: '#/information-requests' },
  informationRequestActs: { classKey: 'enterprise', detailCeiling: 0, reportOnly: true, label: 'Append-only line assignments, productions, independent reviews, privilege rulings, releases, requester verdicts and clock moves (report only)', route: '#/information-requests' },
  informationRequestMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Information-request no-ask observations — a reviewer or answerer the graph cannot name (identity-free)', route: '#/information-requests' },
  undertakingActs: { classKey: 'enterprise', detailCeiling: 0, reportOnly: true, label: 'Append-only assignments, deliveries, independent tests, counterparty reports, acknowledgements and extensions (report only)', route: '#/undertakings' },
  undertakingMarkers: { classKey: 'unit', detailCeiling: 0, reportOnly: true, label: 'Undertaking no-ask observations — an executive or line holder the graph cannot name (identity-free)', route: '#/undertakings' },
  // ADR-0216: a deal thesis, its promises, their readings and one-off costs are
  // ENTERPRISE material — a synergy belongs to the whole deal, not to one line's
  // reading of it, and below the executive altitude there is no honest per-line
  // view of it. Report only: the panel reads its own seat-checked report, never
  // the raw rows, so a promise is never handed to the generic projection.
  dealTheses: { classKey: 'enterprise', detailCeiling: 5, label: 'Deal theses (report only; every figure re-derived on read)', route: '#/finance?panel=synergy' },
  synergyClaims: { classKey: 'enterprise', detailCeiling: 5, label: 'Promised synergy levers and their phased ladders (report only)', route: '#/finance?panel=synergy' },
  synergyReadings: { classKey: 'enterprise', detailCeiling: 5, label: 'Dated run-rate and P&L readings, claimed or verified (report only)', route: '#/finance?panel=synergy' },
  synergyCosts: { classKey: 'enterprise', detailCeiling: 5, label: 'One-off integration costs to achieve (report only)', route: '#/finance?panel=synergy' },
  synergyMarkers: { classKey: 'enterprise', detailCeiling: 5, label: 'Deal-synergy observation markers — owner departed, verifier drifted', route: '#/finance?panel=synergy' },
  // ADR-0217 (Schema v171): the earned-value delivery register. A delivery
  // baseline carries the money of a programme — portfolio material, director
  // and above, detail readable up to the VP rung. Report-only: every figure is
  // re-derived on read by the exact BigInt kernel.
  earnedValueCases: { classKey: 'portfolio', detailCeiling: 4, label: 'Earned-value cases — one accountable delivery owner, one currency, one declared measure (report only)', route: '#/finance?panel=earned-value' },
  earnedValuePackages: { classKey: 'portfolio', detailCeiling: 4, label: 'Baselined work packages with increments re-proved to budget to the cent (report only)', route: '#/finance?panel=earned-value' },
  earnedValueReadings: { classKey: 'portfolio', detailCeiling: 4, label: 'Dated progress readings under the case’s declared measure (report only)', route: '#/finance?panel=earned-value' },
  earnedValueActuals: { classKey: 'portfolio', detailCeiling: 4, label: 'Dated actual costs, package-allocated or honestly unallocated (report only)', route: '#/finance?panel=earned-value' },
  earnedValueMarkers: { classKey: 'portfolio', detailCeiling: 4, label: 'Earned-value observation markers — owner departed (identity-free)', route: '#/finance?panel=earned-value' },
  delegationLineActs: { classKey: 'unit', detailCeiling: 0, label: 'Cross-line ask attribution acts (report only)', route: '#/matrix?panel=asks' },
  delegationLineMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Cross-line overload reconciliation markers', route: '#/matrix?panel=asks' },
  // ADR-0181: classification acts and RULE-NPW-01 markers are surfaced only
  // through the seat-scoped `buildWorkTurns` adapter, never as raw rows.
  workTurnActs: { classKey: 'unit', detailCeiling: 0, label: 'Non-promotable work classification acts (report only)', route: '#/matrix?panel=turns' },
  workTurnMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Non-promotable work rotation markers', route: '#/matrix?panel=turns' },
  // ADR-0196: source-line proposals and receiving-line answers are surfaced
  // only through the seat-scoped reassignment adapter, never as raw acts.
  workReassignmentActs: { classKey: 'unit', detailCeiling: 0, label: 'Cross-line work-reassignment consent and capacity acts (scoped adapter only)', route: '#/matrix?panel=reassignments' },
  // ADR-0182: permits and RULE-PMP-01 markers are surfaced only through the
  // seat-scoped `buildPausePermits` adapter, never as raw rows.
  pausePermits: { classKey: 'unit', detailCeiling: 0, label: 'Automation pause permits (dated authority over a silenced control; states re-derived on read)', route: '#/settings?panel=pause-permits' },
  pausePermitMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Automation pause authority ask & observation markers', route: '#/settings?panel=pause-permits' },
  // ADR-0168: RULE-BNE-01's idempotency ledger names no person and carries no
  // rating, so it is unit-class with NO detail printed at any ceiling.
  benchEvidenceMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Bench-evidence ask markers', route: '#/succession?panel=evidence' },
  // ADR-0172: frozen window readings name a claim and a review but carry no
  // assessment, and the rule's markers carry the pair snapshot — unit-class
  // with NO detail printed at any ceiling, read through the report adapter.
  benchRegressionReadings: { classKey: 'unit', detailCeiling: 0, label: 'Bench-regression frozen readings (report only)', route: '#/succession?panel=evidence' },
  benchRegressionMarkers: { classKey: 'unit', detailCeiling: 0, label: 'Bench-regression ask markers', route: '#/succession?panel=evidence' },
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
    // A report-only collection is never enumerated by the generic projection,
    // even as opaque per-row IDs; its module reader owns scope and aggregation.
    reportOnly: declared?.reportOnly === true,
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
  // ADR-0175: a span-level seat names an owner, a dated remedy and a review date for
  // ONE recurring matrix pattern visible in that seat. The action refuses a pattern
  // the record does not show and a second active remedy for the same pattern.
  'declare-matrix-remedy': { minRank: 4, maxRank: 5, label: 'Record a dated remedy for a recurring matrix pattern' },
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
  // ADR-0148: a declared share is an ASK until the manager it was given to
  // answers it, and until the person whose hours it takes acknowledges it. Both
  // are first-person acts, open at every leadership rank by the spine and
  // enforced in the action: only the line's own manager may accept or decline,
  // and only the person may acknowledge. Registering them here is not ceremony —
  // an action whose right was never declared is refused for EVERY seat,
  // including the operator view.
  'close-line-obligation': { minRank: 1, maxRank: 5, label: 'Retire or carry an obligation an ended line left behind' },
  'accept-matrix-line': { minRank: 1, maxRank: 5, label: 'Accept or decline a reporting line you were given' },
  'acknowledge-matrix-line': { minRank: 1, maxRank: 5, label: 'Acknowledge a share taken from your own hours' },
  // ADR-0157: giving a declared line a TERM and calling it back. Re-affirming or
  // releasing is the line's own manager's act, open at every leadership rank for
  // the same reason ADR-0148 opens acceptance there — a project lead with no
  // home-line reports is exactly who holds a line. The action additionally
  // refuses any seat that is not that manager. Answering as the person whose hours
  // are taken is a SEPARATE right, because it is that person's own first-person
  // act and neither side may answer for the other.
  'reaffirm-matrix-line': { minRank: 1, maxRank: 5, label: 'Re-affirm a reporting line you hold, or release it with a reason' },
  'answer-line-reaffirmation': { minRank: 1, maxRank: 5, label: 'Answer for a share taken from your own hours: accept it or object' },
  // ADR-0159: settling a drifted frozen decision (`stand-behind` vs `refer-reopen`).
  // Open across leadership ranks 1–5 because a team lead or project lead can
  // hold the live RAPID right on a matrix line; `canSettleAuthority` in the
  // action strictly narrows standing to the live right holder (or a joint
  // matrix principal above all contesting/multi-principal holders).
  'reaffirm-frozen-authority': { minRank: 1, maxRank: 5, label: 'Stand behind or refer a drifted frozen decision under live matrix authority' },
  // ADR-0162: Bilateral management-interface operating agreements. Signing or
  // retiring an interface is open across ranks 1–5 (because project/product leads
  // without home reports hold matrix interfaces); `matrixInterfaceActions` strictly
  // restricts first-person signing to the counterpart managers themselves. Setting
  // workspace interface term/warning conventions is director+.
  'affirm-matrix-interface': { minRank: 1, maxRank: 5, label: 'Sign, confirm, retire or scan a bilateral management-interface agreement' },
  'govern-matrix-interface': { minRank: 3, maxRank: 5, label: 'Set matrix management-interface agreement term and warning conventions' },
  // ADR-0174: Standing delegation-of-authority schedule. Downward-span standing,
  // anti-self-grant and nemo-dat ceilings are enforced in `doaScheduleActions`.
  'declare-doa-limit': { minRank: 1, maxRank: 5, label: 'Declare, retire, price or scan standing delegation-of-authority limits' },
  'govern-doa-schedule': { minRank: 3, maxRank: 5, label: 'Set delegation-of-authority ratification window and propagation conventions' },
  // ADR-0149: moving a home line is a SEPARATE act from declaring a second line.
  // Declaring an additional line ADDS accountability; moving the home line
  // REWRITES the tree every other module rolls up through. Open from rank 1
  // because the manager a person is leaving or joining is frequently a team lead
  // with no home-line reports of their own — exactly who a re-org moves somebody
  // between. The action additionally requires the seat to be one of the two
  // managers involved or the span above both, so the rank here is not the control.
  // Registering it is not ceremony: an action whose right was never declared is
  // refused for EVERY seat, including the operator view.
  'record-structure-change': { minRank: 1, maxRank: 5, label: 'Record a dated home-line change and reconcile stored acts against it' },
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
  'govern-oneonone-lines': { minRank: 3, maxRank: 5, label: 'Scan silent 1:1 lines and set matrix 1:1 coverage conventions' },
  'attribute-delegation-line': { minRank: 1, maxRank: 5, label: 'Attribute an open ask to a reporting line you hold' },
  'govern-delegation-lines': { minRank: 3, maxRank: 5, label: 'Scan cross-line ask overload reconciliation' },
  // ADR-0181: the lead who hands the work out classifies it; the action refuses
  // any seat that does not reach the person, and the person's own seat.
  'classify-work-turn': { minRank: 1, maxRank: 5, label: 'Classify an ask you can reach as non-promotable or promotable' },
  'govern-work-turns': { minRank: 3, maxRank: 5, label: 'Scan non-promotable work turns and set the turn conventions' },
  // ADR-0196: each command is an ordinary manager act, then narrowed in the
  // action to the current source or receiving line holder. No peer can speak
  // for a line they do not hold.
  'propose-work-reassignment': { minRank: 1, maxRank: 5, label: 'Propose a consented cross-line work-turn transfer from a source line you hold' },
  'answer-work-reassignment': { minRank: 1, maxRank: 5, label: 'Accept or decline a work-turn transfer for a receiving line you hold' },
  'withdraw-work-reassignment': { minRank: 1, maxRank: 5, label: 'Withdraw a work-turn transfer from a source or receiving line you hold' },
  'govern-hiring-lines': { minRank: 3, maxRank: 5, label: 'Scan co-hiring lines for declared managers who have not assessed a candidate' },
  // ADR-0184: recording a dated workforce move is a manager deed at every
  // leadership rank — the action narrows it to a person the seat reaches. The
  // intended SHAPE of the workforce is a whole-workspace plan and is director+.
  // ADR-0186: declaring what one's own line is putting on a person, and bounding
  // the capacity one's own people or pool will absorb, are ordinary manager deeds
  // at every leadership rank — the action narrows each to the line holder and to
  // the pool's own manager. The workspace-wide dials (a scan that issues asks, and
  // the conventions every seat reads against) are additionally gated to rank 3+
  // inside the action, because they move the ground under other people's readings.
  'declare-change-demand': { minRank: 1, maxRank: 5, label: 'Declare what one of your line’s changes puts on a person you reach' },
  'govern-change-saturation': { minRank: 1, maxRank: 5, label: 'Declare or retire the change-capacity ceiling for a person you reach or a pool you run' },
  'record-workforce-move': { minRank: 1, maxRank: 5, label: 'Record a dated workforce move for a person you reach' },
  'govern-workforce-plan': { minRank: 3, maxRank: 5, label: 'Declare the workforce’s intended shape, scan the plan and set its conventions' },
  // ADR-0187: re-running RULE-CYC-01 on the shared spine and governing the
  // dependency-cycle remediation ask window / automation pause are director+.
  'govern-dependency-cycles': { minRank: 3, maxRank: 5, label: 'Scan dependency feedback cycles on the shared spine and set cycle conventions' },
  // ADR-0189: re-running RULE-OIA-01 on the shared spine and governing the
  // interface-alignment windows / automation pause are director+.
  'govern-interface-alignment': { minRank: 3, maxRank: 5, label: 'Scan product–organisation interface alignment on the shared spine and set alignment conventions' },
  // ADR-0177: signing one's OWN side of a transfer price is open at every
  // leadership rank; the action refuses any seat that is not that side's manager.
  'agree-transfer-price': { minRank: 1, maxRank: 5, label: 'Sign your own side of a transfer price between two lines' },
  'govern-transfer-prices': { minRank: 3, maxRank: 5, label: 'Scan transfer prices for missing keys and unpriced pairs, and set the ask window' },
  'post-chargeback': { minRank: 4, maxRank: 5, label: 'Post a complete period chargeback statement against named budget envelopes, or reverse one with a written reason' },
  'log-feedback': { minRank: 1, maxRank: 2, label: 'Give feedback' },
  'log-conflict': { minRank: 1, maxRank: 2, label: 'Log a conflict' },
  'record-review': { minRank: 1, maxRank: 2, label: 'Record a review' },
  // ADR-0168: reading the cross-line bench-evidence register is succession work and
  // is director-and-above material (a bench claim is a portfolio decision, not a
  // weekly one). The panel further withholds every person's name above the matrix
  // detail ceiling, so the right never widens what the disclosure ladder hides.
  'read-bench-evidence': { minRank: 3, maxRank: 5, label: 'Read the cross-line bench-evidence register' },
  // ADR-0147: asking a line for its input is review work at the manager altitude;
  // the action additionally requires the seat to reach the person being reviewed.
  // Answering is the LINE HOLDER's own act and is enforced in the action to that
  // manager, so it is open at every rank here rather than narrowed twice.
  'ask-review-input': { minRank: 1, maxRank: 2, label: 'Ask a reporting line for review input' },
  'answer-review-input': { minRank: 1, maxRank: 5, label: 'Answer a review-input ask for your own line' },
  // ADR-0185: the general Changes route stays portfolio-gated at rank 3. This
  // separate Matrix adapter is open at frontline and mid-manager altitudes, but
  // the action/read model narrows every row to a reachable person and own line,
  // or to the span explicitly governed by a rank-3+ seat.
  'read-change-impact-review': { minRank: 1, maxRank: 5, label: 'Read the Matrix line-scoped change-impact review register' },
  'request-change-impact-review': { minRank: 1, maxRank: 5, label: 'Request dated review from a line outside your own' },
  'respond-change-impact-review': { minRank: 1, maxRank: 5, label: 'Record a first-person response for your own Matrix line' },
  // ADR-0188: a review is a frontline-to-director artifact, and every altitude
  // that can author or hold one may ask a line and answer for its own. Adoption
  // is the same first-person act on a lesson. Governing the register's
  // conventions is the rank 3–5 window the agreement registers use.
  'read-aar-corroboration': { minRank: 1, maxRank: 5, label: 'Read the cross-line after-action corroboration register' },
  'request-aar-corroboration': { minRank: 1, maxRank: 5, label: 'Ask a line holder to corroborate a held after-action review' },
  'respond-aar-corroboration': { minRank: 1, maxRank: 5, label: 'Record your own line’s first-person answer to a corroboration request' },
  'adopt-aar-lesson': { minRank: 1, maxRank: 5, label: 'Record your line’s dated adoption of, or refusal to adopt, a lesson it touches' },
  'govern-aar-corroboration': { minRank: 3, maxRank: 5, label: 'Set the corroboration escalation window, coverage floor and adoption window' },
  // ADR-0190: Leader Standard Work & Tiered Daily Management.
  'read-skill-coverage': { minRank: 1, maxRank: 5, label: 'Read task qualification coverage within your span' },
  'declare-skill-coverage': { minRank: 1, maxRank: 5, label: 'Declare your own task standards and attest qualifications only for your own reporting-line pool' },
  // ADR-0201: station coverage. A shift exists at every altitude; declaring one
  // is narrowed by the action to the holder's own span, and the availability
  // statement is the person's own act (or their line holder's, printed as such).
  'read-station-coverage': { minRank: 1, maxRank: 5, label: 'Read simultaneous station coverage and its provable shortages within your span' },
  'declare-station-coverage': { minRank: 1, maxRank: 5, label: 'Declare your own windows and stations, never another manager’s' },
  'declare-station-availability': { minRank: 1, maxRank: 5, label: 'Declare your own availability for a declared window, or state it for a person whose line you hold' },
  'govern-station-coverage': { minRank: 3, maxRank: 5, label: 'Set the station-coverage ask window and disclosure floor' },
  'read-standard-work': { minRank: 1, maxRank: 5, label: 'Read the leader standard work board' },
  'declare-standard-work': { minRank: 1, maxRank: 5, label: 'Declare or retire a standard-work routine for yourself or a leader you hold a line over' },
  'record-standard-work': { minRank: 1, maxRank: 5, label: 'Record your own standard-work check, or your own tier act on an abnormality addressed to you' },
  'govern-standard-work': { minRank: 3, maxRank: 5, label: 'Set the standard-work read window, lapse run and tier window' },
  // ADR-0212: temporary standard waivers. Asking is the routine owner's own act,
  // so the rank window admits every leadership altitude and the ACTION narrows it
  // to the person who owes the standard. Authorising is the line holder's act at
  // the manager altitude and above. Closing a departure is the owner's or the
  // authoriser's own act. Governing the windows and the review threshold is the
  // rank 3–5 window every other register's conventions use.
  'read-standard-work-waivers': { minRank: 1, maxRank: 5, label: 'Read the temporary standard waiver register within your span' },
  'request-standard-work-waiver': { minRank: 1, maxRank: 5, label: 'Ask to set aside the written standard of a routine you owe' },
  'authorise-standard-work-waiver': { minRank: 2, maxRank: 5, label: 'Answer a waiver request as the holder of the line the routine is owed under' },
  'decide-standard-work-waiver': { minRank: 1, maxRank: 5, label: 'Record that the standard is back in force, or that the routine was retired' },
  'govern-standard-work-waivers': { minRank: 3, maxRank: 5, label: 'Set the waiver window, renewal review threshold, reading horizon and slot floor' },
  // ADR-0237: the standard-work revision register. Approval is the holder of the
  // line a routine is owed under, re-proved in the action; the owner cannot approve
  // their own standard. Briefing is recorded only by the approver of that revision.
  'read-standard-revisions': { minRank: 1, maxRank: 5, label: 'Read the standard-work revision register within your span' },
  'approve-standard-revision': { minRank: 2, maxRank: 5, label: 'Approve a revision of a routine’s standard as the holder of the line it is owed under' },
  'brief-standard-revision': { minRank: 2, maxRank: 5, label: 'Record who was briefed on a revision you approved, on the day it happened' },
  // ADR-0191: the cross-line priority ballot. Declaring a round freezes one
  // person's work set for the lines that share them — a management act at any
  // leadership altitude, so the action narrows it rather than the rank. Casting
  // is the line holder's own first-person act. Governing the deadline, the ask
  // window and the ballot floor is director-and-above.
  'read-priority-ballots': { minRank: 1, maxRank: 5, label: 'Read the cross-line priority ballot board' },
  'declare-priority-round': { minRank: 2, maxRank: 5, label: 'Open or withdraw a priority round for a person you report to, or whose line you hold' },
  'cast-priority-ballot': { minRank: 1, maxRank: 5, label: 'Cast your line’s one ballot over a frozen priority round' },
  'govern-priority-ballots': { minRank: 3, maxRank: 5, label: 'Scan priority-ballot conditions and set the deadline, ask window and ballot floor' },
  // ADR-0193: the Cross-Line Goal Commitment Conflict register. Declaring what
  // YOUR line's goal consumes of a shared person is a first-person act at any
  // leadership altitude — a project lead with no home-line reports is exactly who
  // gets handed a shared person — so the ACTION narrows it to the line the actor
  // holds rather than the rank narrowing it. Releasing is the same seat's own
  // act. Governing the horizon, the ask threshold and the attribution floor is
  // director-and-above, the window every other matrix register uses.
  'read-goal-commitments': { minRank: 1, maxRank: 5, label: 'Read the cross-line goal commitment conflict board' },
  'declare-goal-commitment': { minRank: 1, maxRank: 5, label: 'Declare or re-baseline what a line you hold promises of a shared person' },
  'release-goal-commitment': { minRank: 1, maxRank: 5, label: 'Release a commitment your own line declared' },
  'govern-goal-commitments': { minRank: 3, maxRank: 5, label: 'Scan goal-commitment conditions and set the horizon, ask threshold and attribution floor' },
  // ADR-0206: reading a closed period's reported figures is open at every
  // altitude — a frontline manager may read what was reported about their span.
  // CLOSING a period and ACKNOWLEDGING a restatement are the acts of the altitude
  // that reports the figure upward, so they sit at director and above; the
  // conventions and the scan sit with every other matrix register.
  'read-goal-attainment': { minRank: 1, maxRank: 5, label: 'Read the goal attainment period close and restatement register' },
  'close-goal-attainment': { minRank: 4, maxRank: 5, label: 'Close an ended period’s attainment figures, or acknowledge one exact restatement of them' },
  'govern-goal-attainment': { minRank: 3, maxRank: 5, label: 'Scan restatements and set the goal-attainment ask window' },
  // ADR-0208: reading investment cases is open at every altitude and scoped by
  // the reader to the seat's own span. DECLARING a case is a manager's act and
  // above — a frontline lead's horizon is the week, and a capital promise is not
  // a week's work. RATIFYING and REVIEWING are decision control, which starts at
  // the director altitude and is the executive altitude's own decision form
  // ("investment & risk appetite"); the action further refuses the benefit owner.
  'read-investment-cases': { minRank: 1, maxRank: 5, label: 'Read the investment case register for your own span' },
  'declare-investment-case': { minRank: 2, maxRank: 5, label: 'Declare a dated investment case, or withdraw one before it is decided' },
  'ratify-investment-case': { minRank: 3, maxRank: 5, label: 'Ratify or refuse an investment case, or record its post-completion review — never as its benefit owner' },
  'govern-investment-cases': { minRank: 3, maxRank: 5, label: 'Scan due post-completion reviews and set the investment-case ask window' },
  // ADR-0211: reading the rationing register is open at every altitude and scoped
  // by the reader to the cases in its span. DECLARING A CEILING is a claim on the
  // enterprise's own balance sheet, so it starts at the VP / C-suite altitude —
  // the one whose declared decision form is "what do we fund, what do we refuse".
  // Declaring a RELATION between two cases is a director's act by rank, and the
  // ACTION additionally refuses any seat that does not hold BOTH cases' benefit
  // owners: a line that holds one side only would be ruling on its own
  // alternative. Governance sits with the same window every other register uses.
  'read-capital-rationing': { minRank: 1, maxRank: 5, label: 'Read the capital-rationing register for your own span' },
  'declare-capital-ceiling': { minRank: 4, maxRank: 5, label: 'Declare, retire or read a capital ceiling for one currency and period' },
  'declare-capital-relation': { minRank: 3, maxRank: 5, label: 'Declare or retire a relation between two investment cases you hold both sides of' },
  'govern-capital-rationing': { minRank: 3, maxRank: 5, label: 'Scan for missing ceilings and set the capital-rationing ask window' },
  // ADR-0213: reading a variance statement is open at every altitude and scoped
  // by the reader. DECLARING a standard is a director's act by rank — and the
  // ACTION refuses any seat that does not hold the budget holder, and refuses
  // the holder outright: a standard set by the person it measures is a target
  // they chose. RECORDING actuals is open to every seated altitude by rank,
  // because a frontline lead can run a cost object — and the ACTION admits only
  // the budget holder or a seat that holds them. The due window is governed at the VP / C-suite altitude.
  'read-flex-budget': { minRank: 1, maxRank: 5, label: 'Read the flexible-budget variance statements in your span, or that name you as an owner' },
  'declare-flex-budget-plan': { minRank: 3, maxRank: 5, label: 'Declare or retire a cost standard for a budget holder you hold — never your own' },
  'record-flex-budget-actuals': { minRank: 1, maxRank: 5, label: 'Record or withdraw actuals against a declared cost standard' },
  'govern-flex-budget': { minRank: 4, maxRank: 5, label: 'Set the window in which final actuals are due' },
  // ADR-0214: equity value is enterprise material — the record class floor is
  // rank 4, and the right matches it rather than letting a director read a number
  // the record class would deny. Recording a reading is the same altitude;
  // claiming a leg names a person and is re-proved against the reporting graph;
  // the staleness window is a chief's declaration.
  'read-value-bridge': { minRank: 4, maxRank: 5, label: 'Read the enterprise value bridges and the declared ownership of their legs' },
  'record-value-bridge-reading': { minRank: 4, maxRank: 5, label: 'Record, restate or withdraw a dated valuation reading' },
  'claim-value-bridge-lever': { minRank: 4, maxRank: 5, label: 'Declare that a person you hold answers for one value leg over one period' },
  'govern-value-bridge': { minRank: 5, maxRank: 5, label: 'Set the window at which a bridge is printed as stale' },
  // ADR-0215: the speak-up register. RAISING is open at every rank and every
  // altitude, deliberately: the person who needs a channel most holds the least
  // authority, and a register only a manager may open is a register that hears
  // from managers. The ACTION narrows it — a named reporter must be the seat's own
  // person or a person the seat holds, so nobody files somebody else's concern in
  // their name. ANSWERING is open by rank because a receiver can sit anywhere, and
  // the ACTION re-proves that the acting seat IS the named receiver and that the
  // receiver still passes the impartiality test. Declaring the windows is a
  // director-and-above act: the windows are the only thing that makes the promise
  // to a reporter measurable.
  'read-concerns': { minRank: 1, maxRank: 5, label: 'Read the speak-up register for your own span, your own concerns and the concerns routed to you' },
  'raise-concern': { minRank: 1, maxRank: 5, label: 'Raise a concern, unnamed if you choose, or withdraw one you raised' },
  'answer-concern': { minRank: 1, maxRank: 5, label: 'Acknowledge, resolve, check or close a concern routed to you — never one routed elsewhere' },
  'govern-concerns': { minRank: 3, maxRank: 5, label: 'Declare the acknowledgement, outcome and retaliation-check windows, and scan the register' },
  // ADR-0218: the Just Culture Decision Record. Individual conduct material: the
  // manager altitude and below may decide and concur, and only on a person whose
  // line they hold. Reading is open at every rank; the record class decides detail.
  'read-just-culture': { minRank: 1, maxRank: 5, label: 'Read the Just Culture reviews on the people your span and declared lines hold — full detail at the manager altitude, counts above it' },
  'decide-just-culture': { minRank: 1, maxRank: 2, label: 'Open, decide, revise or withdraw a Just Culture review on a person whose deciding line you hold' },
  'concur-just-culture': { minRank: 1, maxRank: 2, label: 'Concur with or dissent from a Just Culture decision, as another line the person holds' },
  // ADR-0219: the enterprise risk-appetite register. Reading is portfolio
  // material (rank 3, director and above) and matches the record class. The
  // ceiling is declared at the executive altitude (rank 4) and the retention by
  // a director's line (rank 3) — always narrowed in the action to a seat that
  // HOLDS the case owner, and never by the owner themselves.
  'read-risk-appetite': { minRank: 3, maxRank: 5, label: 'Read the enterprise risk-appetite register: every declared ceiling, its measured population and whether coverage is complete' },
  'declare-risk-appetite': { minRank: 4, maxRank: 5, label: 'Declare, retire or review an appetite statement for a risk domain, and scan the register for owed decisions' },
  'carry-risk-appetite': { minRank: 3, maxRank: 5, label: 'Declare or withdraw the retained exposure of one live risk whose owner you hold — never your own' },
  // ADR-0238: the distributed-work equity register. Reading is individual
  // material, open at every rank; the reader narrows what each altitude sees.
  // Declaring a window for another person or a sitting is a leader's act,
  // narrowed inside the action to a seat that holds the person or the chair.
  'read-distributed-equity': { minRank: 1, maxRank: 5, label: 'Read the distributed-work equity register: declared windows, placed burden, concentration verdicts and coverage gaps' },
  'declare-distributed-equity': { minRank: 1, maxRank: 5, label: 'Declare, withdraw or retract windows and sittings for people and chairs you hold, set the register’s conventions, and scan it' },
  // ADR-0229: the capability sourcing & firm-boundary register. Reading is
  // portfolio material (rank 3+), matching the record class. Recording an option
  // is a manager's act, narrowed inside the action to a line the case names and
  // refused for the joint chief apex that will decide it. Deciding is the chief
  // altitude alone — and where the graph holds no chief seat the register prints
  // the decision as owed rather than promoting anybody into it. Grading is an
  // independent review above the decision.
  'read-capability-sourcing': { minRank: 3, maxRank: 5, label: 'Read the capability sourcing register: where each declared capability sits relative to the boundary of the firm, and whether its comparison is complete' },
  'record-capability-sourcing': { minRank: 2, maxRank: 5, label: 'Declare a capability case, record a priced option on a line you hold, withdraw a case, or scan the register' },
  'decide-capability-sourcing': { minRank: 5, maxRank: 5, label: 'Decide the boundary of the firm for a capability — make, buy, partner or hybrid — on one exact comparison' },
  'grade-capability-sourcing': { minRank: 4, maxRank: 5, label: 'Grade a case’s frozen assumptions against the cost that actually landed — never your own decision or your own option' },
  // ADR-0230: Vroom–Yetton–Jago Decision-Participation Selector — choose how
  // much to involve others in a decision: autocratic I/II, consultative I/II,
  // or group II. Reading is open to any leadership seat; declaring a question is
  // open at every altitude; answering the diagnostics narrows to a seat holding
  // a line the decision touches; selecting the style is director-and-above.
  'read-vroom-yetton': { minRank: 2, maxRank: 5, label: 'Read the Vroom–Yetton decision-participation register: the declared diagnostics, the recommended style and the style selected for each decision' },
  'declare-vroom-yetton': { minRank: 1, maxRank: 5, label: 'Declare a decision-participation question — how much should the team be involved in this decision?' },
  'answer-vroom-yetton': { minRank: 2, maxRank: 5, label: 'Answer the seven Vroom–Yetton diagnostics for a decision on a line you hold' },
  'select-vroom-yetton': { minRank: 3, maxRank: 5, label: 'Select a participation style for a decision — accept the recommendation or override it with a written reason' },
  // ADR-0231: the Integrated Business Plan / S&OP Cycle Register. Reading a plan
  // of record is portfolio material (rank 3+), exactly as the record-class engine
  // already classifies it: it carries commercial volume, capacity commitments and
  // indirectly named customers. Declaring the cycle is the process owner's act
  // (rank 3+). Recording the demand plan and demonstrated capacity is the manager
  // who HOLDS the line (rank 2+), narrowed inside the action to a line the cycle
  // names. Framing a costed option is a director's act (rank 3+) because it
  // commits analysis and often cash. Approving the plan is the executive step
  // (rank 4+) and is refused for the seat that framed the options. Grading the
  // forecast against actuals is the process owner's ordinary duty (rank 3+).
  // READ opens at rank 2 deliberately. A supply manager at rank 2 must be able to
  // READ the demand plan they are asked to demonstrate capacity against; gating
  // the read above the record right would let a manager record a feasibility
  // verdict on a plan they are not allowed to see. Disclosure is not lost,
  // because the reader narrows every row to a line the seat holds.
  'read-integrated-business-plan': { minRank: 2, maxRank: 5, label: 'Read the integrated business plan for the cycles your lines carry: unconstrained demand, demonstrated capacity, the exact gap and the residual an executive actually accepted' },
  'declare-integrated-business-plan': { minRank: 3, maxRank: 5, label: 'Open or withdraw an S&OP cycle — the five-step monthly process that ends in one approved operating plan' },
  'record-integrated-business-plan': { minRank: 2, maxRank: 5, label: 'Record the consensus demand plan, the statistical baseline and target, or demonstrated capacity on a line you hold' },
  'frame-integrated-business-plan': { minRank: 3, maxRank: 5, label: 'Frame a costed pre-S&OP option against a quantified gap — a lever, a plan-unit effect and an exact cost' },
  'decide-integrated-business-plan': { minRank: 4, maxRank: 5, label: 'Approve the operating plan at the executive step, stating the residual you are accepting — never a plan whose options you framed' },
  'grade-integrated-business-plan': { minRank: 3, maxRank: 5, label: 'Grade the demand plan against what actually sold, once per cycle-month, against the consensus that was frozen' },
  // ADR-0220: the variable-pay design & incentive integrity register. Reading is
  // open to the manager altitude because a team envelope is a manager's own
  // instrument; the row class and the span filter decide what is printed. Every
  // write is narrowed inside the action to a seat that HOLDS the funding line —
  // and verification is narrowed further, to a seat ABOVE it.
  'read-incentive-integrity': { minRank: 2, maxRank: 5, label: 'Read the variable-pay register for the plans your lines fund: envelopes, measures, verified readings, awards and recovery status' },
  'design-incentive-plan': { minRank: 2, maxRank: 5, label: 'Declare, measure or retire a variable-pay plan on a funding line you hold, and scan the register for owed decisions' },
  'verify-incentive-reading': { minRank: 2, maxRank: 5, label: 'Record a verified reading for a measure on a plan whose funding line sits below you — never your own number and never one you are paid on' },
  'award-incentive': { minRank: 2, maxRank: 5, label: 'Record an award for a person you hold on a live plan that funds your line — never for yourself' },
  'recover-incentive': { minRank: 4, maxRank: 5, label: 'Record a clawback, malus or written waiver against an award whose funding line sits below you' },
  // ADR-0221: the Duty-Without-Means Register. Frontline leads and mid-managers
  // (rank 1+) read and declare duties they carry (or duties on people they hold)
  // and their required means; managers+ (rank 2+) supply, decline or revoke
  // means on lines they control; directors+ (rank 3+) govern joint-apex
  // entrepreneurial gaps strictly above both demanding and controlling lines.
  'read-portfolio': { minRank: 1, maxRank: 5, label: 'Read portfolio units within your span' },
  'declare-portfolio': { minRank: 5, maxRank: 5, label: 'Declare portfolio units or scan' },
  'review-portfolio': { minRank: 4, maxRank: 5, label: 'Record dated evidence for your owning line' },
  'verdict-portfolio': { minRank: 5, maxRank: 5, label: 'Judge, retire, or complete exit settlement of a portfolio unit' },
  'track-portfolio': { minRank: 3, maxRank: 5, label: 'Track verdict execution within your line' },
  'read-duty-means': { minRank: 1, maxRank: 5, label: 'Read the Duty-Without-Means Register for duties in your span or addressed to your line' },
  'declare-duty-means': { minRank: 1, maxRank: 5, label: 'Declare an accountable duty or required means pillar, retire a duty as demanding line, or scan parity' },
  'supply-duty-means': { minRank: 2, maxRank: 5, label: 'Record supplied, declined or revoked means on a requirement controlled by your line — never self-certified' },
  'govern-duty-means': { minRank: 3, maxRank: 5, label: 'Accept a bounded Simons entrepreneurial gap strictly above both the demanding line and the controlling line' },
  // ADR-0223: the Shift Handover & Two-Key Readback Ledger. Both the brief and
  // the readback are FIRST-PERSON acts at every altitude — the outgoing
  // operator declares their own boundary transfer; only the declared incoming
  // operator turns the second key. Reading is open from the frontline upward,
  // with identities redacted above the director altitude.
  'read-shift-handover': { minRank: 1, maxRank: 5, label: 'Read the shift-handover & two-key readback ledger: what was handed over, what was synthesized, what was disputed and what is overdue' },
  'declare-shift-handover': { minRank: 1, maxRank: 5, label: 'Declare the outgoing changeover brief for the station you hand over, cancel it before any key turns, or scan the register' },
  'readback-shift-handover': { minRank: 1, maxRank: 5, label: 'Turn the incoming key: synthesize the handover you accepted, or dispute it with its named reason' },
  // ADR-0227: the Frontline Improvement-Suggestion Ledger (kaizen teian).
  // Every act is first-person at every altitude: a person files their own
  // suggestion; the COMPUTED route (the joint-apex seat(s) above every line the
  // submitter holds) records the triage; the named owner claims the effect; the
  // submitter or a route member — never the owner — confirms it. Reading is
  // open from the frontline upward, narrowed to the rows the seat is a party
  // to or whose people it holds.
  'read-suggestions': { minRank: 1, maxRank: 5, label: 'Read the improvement-suggestion ledger within your grant: what was proposed, who owes the answer, what is overdue' },
  'declare-suggestion': { minRank: 1, maxRank: 5, label: 'File your own improvement suggestion, or scan the register — the route is computed from the reporting graph and is never chosen' },
  'triage-suggestion': { minRank: 1, maxRank: 5, label: 'Record the accept-or-decline decision your seat owes as a member of a suggestion’s computed route — once, with a stated reason' },
  'claim-suggestion': { minRank: 1, maxRank: 5, label: 'Claim the effect of an accepted change you own — and nobody else’s' },
  'confirm-suggestion': { minRank: 1, maxRank: 5, label: 'Independently confirm the effect you saw working, as the submitter or a route member — never as the owner' },
  // ADR-0224: the stop-work ledger. Any frontline seat may raise a hold; the
  // work lead records controls; Director+ joint apexes independently assess;
  // only an affected operator may provide the second restart/continue-hold key.
  'read-work-stop': { minRank: 1, maxRank: 5, label: 'Read the stop-work and safe-restart ledger within your span or as a joint reviewer' },
  'declare-work-stop': { minRank: 1, maxRank: 5, label: 'Declare a first-person stop-work hold, name the affected operators and work lead, or scan the review queue' },
  'mitigate-work-stop': { minRank: 1, maxRank: 5, label: 'Record a work control as the named work lead or a manager above that lead; never clear or restart work' },
  'assess-work-stop': { minRank: 3, maxRank: 5, label: 'Independently assess the latest mitigation as one of every frozen Director+ joint apex; hold or clear only your own key' },
  'decide-work-restart': { minRank: 1, maxRank: 5, label: 'As a named affected operator, personally confirm restart or keep the hold in force after independent clearance' },
  // ADR-0225: the managerial portfolio handover. A director or above declares
  // a transition and releases the outgoing authority; the outgoing manager
  // records the portfolio brief; the successor records the acceptance or the
  // dispute as their own first-person key.
  'read-mgr-handover': { minRank: 1, maxRank: 5, label: 'Read the managerial portfolio handover register within your span or as a frozen joint reviewer' },
  'declare-mgr-handover': { minRank: 3, maxRank: 5, label: 'Declare a managerial transition — outgoing manager, successor, governor, scope and dates' },
  'brief-mgr-handover': { minRank: 1, maxRank: 5, label: 'Record the outgoing portfolio brief as the outgoing manager, or as a manager strictly above them' },
  'accept-mgr-handover': { minRank: 1, maxRank: 5, label: 'As the named successor, personally accept the transferred portfolio' },
  'release-mgr-handover': { minRank: 3, maxRank: 5, label: 'As the declaring governor, or above them, release the outgoing manager’s authority after the successor acceptance' },
  'dispute-mgr-handover': { minRank: 1, maxRank: 5, label: 'As the named successor, personally dispute the handover with a stated ground' },
  // ADR-0216: the deal synergy register. Reading is enterprise material and
  // matches the record-class floor (rank 4) rather than letting a director read a
  // number the class would deny. Declaring a promise is an executive act, and the
  // ACTION narrows it to a seat that HOLDS the owner — one line never promises
  // another line's saving. Recording a reading is open to the director altitude
  // because a reading is evidence, not authority; the ACTION splits it, refusing
  // the owner as verifier and refusing any seat that is not above the owner.
  'read-deal-synergy': { minRank: 4, maxRank: 5, label: 'Read the deal thesis & synergy register and the realization of every promise' },
  'declare-deal-synergy': { minRank: 4, maxRank: 5, label: 'Declare a deal thesis or a promise owned by a person you hold, or withdraw a promise' },
  'record-synergy-reading': { minRank: 3, maxRank: 5, label: 'Record a run-rate or P&L reading, or a one-off cost — verified readings only above the owner' },
  // ADR-0216: the owner of a promise may state their OWN number at any altitude.
  // A claimed reading is counted nowhere until a seat above them verifies it, so
  // this is the weakest act on the register — and it must be open, because
  // RULE-SYN-01 asks the owner every cycle and an ask a frontline lead cannot
  // answer is a loop that closes by expiring rather than by being answered.
  'report-own-synergy-reading': { minRank: 1, maxRank: 5, label: 'Report a CLAIMED reading on a promise you own (counted nowhere until verified)' },
  'govern-deal-synergy': { minRank: 4, maxRank: 5, label: 'Set the materiality band and the verification staleness window, and scan the register' },
  // ADR-0217: the earned-value register. Reading is portfolio material and
  // matches the record-class floor (rank 3, director and above) — a case is a
  // programme, not a person. Declaring a case or its baseline names an owner and
  // money: the ACTION narrows it to a seat that HOLDS the owner — one line does
  // not baseline another line's programme. Recording readings and actuals is
  // evidence, open by rank at the director rung; the ACTION splits it and
  // enforces the cut-off discipline and the method’s admitted shares. The
  // conventions are the chief's (rank 4): the staleness window and the cost
  // floor are what every line reads against.
  'read-earned-value': { minRank: 3, maxRank: 5, label: 'Read the earned-value delivery register for your span and the programmes on the ledger' },
  'declare-earned-value': { minRank: 3, maxRank: 5, label: 'Declare a case and its baselined work packages, or re-baseline them — only for a person you hold' },
  'record-earned-value': { minRank: 3, maxRank: 5, label: 'Record a dated reading under the declared measure, or an actual cost, on a case you can reach' },
  'govern-earned-value': { minRank: 4, maxRank: 5, label: 'Set the staleness window and the cost floor, and scan the register' },
  // ADR-0209: reading the work/rest ledger is open at every altitude and scoped
  // by the reader. Rostering starts at the FRONTLINE — a shift lead writes the
  // roster — and the action re-proves that the seat holds the very line. Which
  // limits apply is a governance declaration and starts at the director.
  'read-work-rest': { minRank: 1, maxRank: 5, label: 'Read the work/rest recovery ledger for your own span' },
  'roster-work-rest': { minRank: 1, maxRank: 5, label: 'Record a shift, its actual times or cancellation, or attest a line’s work record — only for a line you hold' },
  'declare-work-rest-policy': { minRank: 3, maxRank: 5, label: 'Declare or retire the work/rest limits that apply, with their written source' },
  'govern-work-rest': { minRank: 3, maxRank: 5, label: 'Scan work/rest conflicts and set the ledger’s reading horizon' },
  'read-night-work': { minRank: 1, maxRank: 5, label: 'Read the night-work & in-shift break reading for your own span' },
  'roster-night-work': { minRank: 1, maxRank: 5, label: 'Record an in-shift break — only for a line you hold' },
  'declare-night-work-policy': { minRank: 3, maxRank: 5, label: 'Declare or retire the night window and the night limits that apply, with their written source' },
  'govern-night-work': { minRank: 3, maxRank: 5, label: 'Scan night-work breaches and set the reading’s automation' },
  // ADR-0210: the conflict-of-interest & recusal register. A person declares their
  // OWN interest, or a seat that can reach them records a disclosure it received
  // — so the declaring right is open at every leadership rank and the ACTION
  // re-proves the route and stores which one it was. Deciding HOW a declared
  // interest is handled (stand back, a named control, a written determination)
  // is a director-and-above act, because it is the seat above the person that
  // answers for the record's independence; the action refuses the holder
  // themselves and any seat that cannot reach them. Declaring which relationship
  // kinds are reportable is the same governance right.
  'read-conflict-recusal': { minRank: 1, maxRank: 5, label: 'Read the conflict-of-interest & recusal register for your own span' },
  'declare-conflict-interest': { minRank: 1, maxRank: 5, label: 'Declare your own interest, or record a disclosure from a person you can reach' },
  'decide-conflict-standing': { minRank: 3, maxRank: 5, label: 'Record the response to a declared interest — recuse, a named control, or a written determination — never your own' },
  'govern-conflict-recusal': { minRank: 3, maxRank: 5, label: 'Declare which relationship kinds are reportable, and set the register’s horizon' },
  // ADR-0150: onboarding a person into a matrix. Writing a line's brief is the act
  // of the manager who HOLDS that line, at whatever altitude that line's manager
  // sits (a project lead with no home-line reports gets this exactly as a
  // functional manager does), so it is open by rank and the action narrows it to
  // the line holder. Acknowledging is the PERSON's own act — the 90 days are
  // theirs — and the action refuses any seat that is not that person.
  'brief-onboarding-line': { minRank: 1, maxRank: 5, label: 'State in writing what your reporting line expects of a person during onboarding' },
  'acknowledge-onboarding-line': { minRank: 1, maxRank: 5, label: 'Acknowledge what a reporting line expects of you during onboarding' },
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
  // ADR-0182: silencing an automatic control is an authority over EVERY span the
  // rule reads, so the right is director+. The action narrows it further: a
  // scoped seat must BE the single seat above every reporting line, so no line
  // manager can silence a rule that carries another manager's work.
  'permit-automation-pause': { minRank: 4, maxRank: 5, label: 'Grant or withdraw a dated permit for a silenced automatic control' },
  'govern-automation-pauses': { minRank: 4, maxRank: 5, label: 'Scan the pause-permit register or re-declare its conventions' },
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
  // ADR-0228: the decision-domain sensing register (Cynefin). Declaring a
  // decision is a director-and-above act; a panel member states the domain on
  // their declared line, and the owner commits a mode — both are narrowed
  // inside the action to the named person, so the right window is manager and
  // above; the reader refuses anything it cannot verify.
  'read-domain-sense': { minRank: 2, maxRank: 5, label: 'Read the decision-domain sensing register' },
  'declare-domain-sense': { minRank: 3, maxRank: 5, label: 'Declare a decision for the panel to sense' },
  'scan-domain-sense': { minRank: 3, maxRank: 5, label: 'Scan the decision-domain sensing register' },
  'assess-domain-sense': { minRank: 2, maxRank: 5, label: 'State the domain for a decision on a declared line' },
  'commit-domain-sense': { minRank: 2, maxRank: 5, label: 'Commit the mode for a decision the seat owns' },
  // ADR-0232: the Assurance Finding & Remediation Register. Reading is open from
  // the frontline upward and narrowed to the findings this seat is a party to or
  // holds; anybody may DECLARE a finding (a self-identified control failure from
  // the person doing the work is the cheapest one an enterprise ever gets) and
  // anybody may be named to REMEDIATE or to VERIFY. Only an executive ACCEPTS a
  // residual risk, and never a person who owns the remediation on that finding.
  'read-assurance-findings': { minRank: 1, maxRank: 5, label: 'Read the assurance finding register within your grant: what failed, who owns the fix, what is overdue and what came back' },
  'declare-assurance-finding': { minRank: 1, maxRank: 5, label: 'Declare a finding on the register in your own name, or scan it — the accountable lines are declared, never inferred' },
  'remediate-assurance-finding': { minRank: 1, maxRank: 5, label: 'Name the owner and the day on an accountable line you hold (assign), or assert the fix you own (assert)' },
  'verify-assurance-remediation': { minRank: 1, maxRank: 5, label: 'Independently confirm or reject a fix — only from a seat strictly above the remediation owner, never as the owner' },
  'accept-assurance-finding-risk': { minRank: 4, maxRank: 5, label: 'Accept a finding’s residual risk in your own name, with a reason and a review date — never on a finding you remediate' },
  // ADR-0233: the Probation Confirmation Gate Register. Reading includes the
  // joiner (a fair process is one the person it is about can see); the gate is
  // opened, asked, decided and notified by the joiner's HOME manager in their
  // own name, and a line's evidence is that line's own holder's act. Every one
  // of those is narrowed inside the action to the named person, so the right
  // window is any people manager (rank 1–5) and the joiner.
  'read-probation-gates': { minRank: 1, maxRank: 5, label: 'Read the probation gate register within your grant — your own gate, the gates you confirm, the lines you have been asked on, and the span that holds them' },
  'declare-probation-gate': { minRank: 1, maxRank: 5, label: 'Open a probation gate on one of your direct reports in your own name, or scan the register — the window and instrument terms are declared, never inferred' },
  'ask-probation-evidence': { minRank: 1, maxRank: 5, label: 'Put the evidence duty to the holder of a declared line of your joiner, by a day' },
  'submit-probation-evidence': { minRank: 1, maxRank: 5, label: 'Record dated evidence on a line of the joiner — the home line’s is the confirming manager’s own act, and a matrix line’s is its own holder’s' },
  'decide-probation-gate': { minRank: 1, maxRank: 5, label: 'Record the final decision (confirm or end) on a gate you opened, extend the window where the instrument allows it, and record the written notification — nobody else decides a joiner’s gate' },
  // ADR-0234: the Undertaking & Outward-Commitment Closure Register. A promise
  // to an outside party is declared and reported by an executive seat, because
  // that is the seat whose name the counterparty holds. The line acts are
  // narrowed inside the action to the named holder (deliver) and to a seat
  // strictly above that holder (verify), so the right window is wide and the
  // action is the door.
  'read-undertakings': { minRank: 1, maxRank: 5, label: 'Read the undertaking register within your grant — the promises you declared, the lines you hold, the deliveries you tested, and the span that holds them' },
  'declare-undertaking': { minRank: 4, maxRank: 5, label: 'Record a promise the entity has given to an outside party, or scan the register — the counterparty, instrument, scope and due day are declared, never inferred' },
  'assign-undertaking-line': { minRank: 4, maxRank: 5, label: 'Name a holder, a deliverable and a day on one obligation line of an undertaking you declared — the holder is named, never inferred' },
  'deliver-undertaking-line': { minRank: 1, maxRank: 5, label: 'Assert the deliverable on a line you hold, in your own name, with dated evidence — nobody asserts on somebody else’s line' },
  'verify-undertaking-line': { minRank: 1, maxRank: 5, label: 'Independently confirm or reject a line’s deliverable — only from a seat strictly above the line’s holder, never as the holder and never below them' },
  'report-undertaking-closure': { minRank: 4, maxRank: 5, label: 'Record that the counterparty was told in writing that the promise is met, record their acknowledgement, and move a due day — only once every line is independently confirmed' },
  // ADR-0240 (Schema v194): the incident command register. Two rights, and the
  // split is the product. READING is open at every rank — a responder must be
  // able to see the incident they are on, and the READER narrows per-person
  // detail above the director altitude. COMMANDING an incident is a rank 2+ act
  // in the declaring seat's own span; the tighter tests (party to the incident,
  // strict reach above every line lead, only the holder may hand over or release)
  // are re-proved inside each action against the reporting graph, because rank
  // alone cannot say who is on a bridge.
  'read-incidents': { minRank: 1, maxRank: 5, label: 'Read the incident command register within your grant — the incidents you declared or command, the response lines you lead, and the span that holds them' },
  'command-incidents': { minRank: 2, maxRank: 5, label: 'Declare an incident against a written criterion, staff its response lines, take and hand over command, record notifications against their declared clocks, change severity, resolve and stand command down, and set the register’s conventions' },
  // ADR-0241 (Schema v195). Two rights, and the split is the moral centre of the
  // register: READING is open at rank 1 because a person must be able to read
  // their OWN restriction and whether the workplace put it in place, while the
  // READER narrows what any seat sees (names below rank 3, counts above).
  // DECLARING, acknowledging a line, marking an adjustment operational and
  // recording a review are leader acts, each narrowed inside the action to a seat
  // that HOLDS the person through the span or a declared line.
  'read-workplace-adjustments': { minRank: 1, maxRank: 5, label: 'Read the workplace adjustment register within your grant — your own restriction and whether it was put in place, and the restrictions of the people you hold' },
  'declare-workplace-adjustments': { minRank: 2, maxRank: 5, label: 'Declare a functional restriction on a written instrument, record an adjustment and the day it became operational, acknowledge a restriction on a line you hold, record a review, and set the register’s conventions' },
  'read-lone-working': { minRank: 1, maxRank: 5, label: 'Read the lone-working register within your grant — your own deployment and when you are next due to be heard from, and the deployments of the people you hold' },
  'declare-lone-working': { minRank: 1, maxRank: 5, label: 'Declare a lone deployment on a written assessment, record a contact, answer a lapsed check with an escalation, close a deployment out, and set the register’s conventions' },
  // ADR-0235/0236 (Schema v191). Six rights, and the shape is the point: RECORDING
  // a demand (with a follow-up link only to a readable insufficient parent),
  // STAFFING its lines and RELEASING to the authority are rank 3+ acts —
  // the director who signs the covering letter commits the enterprise's time to an
  // outside party; PRODUCING and REVIEWING are open to rank 1+, because the
  // reviewer of a production is chosen by CONFLICT, not by rank — a floor of
  // standing over the least senior producer is enforced in the action, and an
  // independent review from a seat that happens to be junior to a producer's own
  // manager is worth having, not worth forbidding. RELEASE is rank 4+ again: it is
  // the act that puts a document in a supervisor's hands.
  'read-information-requests': { minRank: 1, maxRank: 5, label: 'Read the information-request register within your grant — the demands you recorded, the lines you produce, the productions you reviewed, and the span that holds them' },
  'receive-information-request': { minRank: 3, maxRank: 5, label: 'Record that an authority has demanded records, link a follow-up only to a readable insufficient parent, and scan the register — the requester, instrument, scope and reply clock are declared, never inferred' },
  'assign-information-request-line': { minRank: 3, maxRank: 5, label: 'Name a producer, a subject and a day on one production line of a demand you recorded — the producer is named, never inferred' },
  'produce-information-request-line': { minRank: 1, maxRank: 5, label: 'Certify your line’s production and any privilege claim, in your own name, with a counted basis — nobody certifies a line they do not hold' },
  'review-information-request-production': { minRank: 1, maxRank: 5, label: 'Independently review a line’s production and rule on its privilege claim — only from a seat that is party to nothing on the request and holds standing over at least one producer' },
  'release-information-request-production': { minRank: 3, maxRank: 5, label: 'Release the production to the requester, record their verdict, and move a reply day — only once every line is independently reviewed' },
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
