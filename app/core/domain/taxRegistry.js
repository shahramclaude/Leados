/**
 * app/core/domain/taxRegistry.js — the closed vocabulary of the Tax Controversy
 * & Appeal-Control Register (ADR-0257, Schema v209, `#/tax`, `RULE-TAX-01`,
 * CSV scope #194).
 *
 * THE DUTY, IN A CHIEF FINANCIAL OFFICER'S WORDS. *"The provision register tells
 * us what we carry for an uncertain tax position. It does not tell me whether we
 * are inside the objection window, whether the objection was actually filed, or
 * whether the evidence that supports our position is on the record. A missed
 * challenge deadline is not a rounding error: it is the assessment becoming
 * final by default. I need every authority notice bound to the disputed
 * position, the jurisdiction-declared deadline, the filing that met it, the
 * evidence packet behind it, and the resolution — with the swing between what
 * was disputed and what was finally payable printed apart."*
 *
 * No surface in this workspace could answer any part of that. The provision
 * register (ADR-0250) holds the IAS 37 classification, the best estimate and the
 * reconciliation against the finance carrying. It holds no authority notice, no
 * objection deadline, no filing, no evidence packet and no resolution. The
 * claim register (ADR-0248) holds third-party claims and their limitation
 * clocks; a tax assessment is not a claim, and its clock runs from a notice, not
 * an accrual. This register closes that gap.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Session 329
 * (2026-11-18) recorded this as a planned, unbuilt gap: a targeted search
 * across `app/core/domain`, `app/views`, `app/actions.js` and
 * `app/core/schema.js` found authority-request handling but no complete
 * tax-contest lifecycle tying the disputed position, the notice, the
 * jurisdiction-declared deadline, the filed objection or appeal, the evidence
 * packet and the outcome together. ADR-0250's own "not built" list names
 * uncertain tax positions as the remaining piece; this register is the
 * controversy half of that pair and integrates with the provision record
 * through a declared reference, never by duplicating it. Wider absence
 * **[UNVERIFIED]**.
 *
 * THE FRAMEWORK THIS REGISTER APPLIES. The lifecycle follows the shape every
 * jurisdiction's post-issuance dispute path shares — notice, objection or
 * appeal within a statutory window, evidence, resolution — and the measurement
 * discipline of IFRIC 23 / IAS 12 and ASC 740 for the position behind it:
 *
 *   - **THE DEADLINE IS DECLARED, NEVER COMPUTED.** A statutory objection
 *     window differs by jurisdiction, tax type and notice kind, and this record
 *     holds no jurisdiction calendar. A deadline the seat cannot cite to a
 *     written basis is not a deadline; the register prints
 *     `deadline-undeclared` and files an ask rather than inventing a date.
 *   - **THE FILING IS A FACT, NOT AN INTENTION.** A filing carries the day it
 *     was filed and the authority's receipt reference. Timeliness is derived by
 *     comparing the two declared days; a late filing is recorded as late, never
 *     refused and never silently re-dated.
 *   - **THE EVIDENCE BINDS TO THE POSITION.** Evidence items name the notice
 *     whose disputed position they support. A filed objection with no evidence
 *     packet is printed as such; the register does not infer that evidence
 *     exists because a filing does.
 *   - **THE SWING IS PRINTED APART.** What was disputed and what was finally
 *     payable are two figures. The difference — the amount the controversy
 *     actually moved — is derived and printed beside both, never folded into
 *     either.
 *   - **THE PROVISION IS REFERENCED, NOT DUPLICATED.** A notice may carry the
 *     finance record reference where the uncertain-tax provision for the same
 *     position is carried. The register never recomputes or restates that
 *     provision; it binds the controversy to it.
 *
 * WHAT THIS REGISTER ADDS THAT A SPREADSHEET CANNOT. A spreadsheet holds a
 * deadline somebody typed and a status somebody updated. This register derives
 * the controversy state from declared facts — notice, deadline, filings,
 * evidence, resolution — refuses a deadline with no written basis, prints
 * timeliness as a computed verdict, and files a dated ask to the joint seat
 * above every responsible line when the record shows a duty unmet. Five facts
 * it expresses that a typed row cannot:
 *
 *   - **A notice with no declared deadline is `deadline-undeclared`, never
 *     "no deadline".** The absence of a deadline is the most dangerous state in
 *     the register, and it is printed as one.
 *   - **A deadline that has passed with no filing is `overdue-unfiled`.** The
 *     assessment is becoming final by default, and the register says so.
 *   - **Timeliness is derived, not asserted.** Filed on or before the declared
 *     deadline is `filed-on-time`; after it is `filed-late`. The register
 *     never takes a seat's word for either.
 *   - **A filed objection with no evidence is flagged `evidence-empty`.** A
 *     filing without a packet is a claim the record cannot yet support.
 *   - **The swing is a printed figure.** Disputed less resolved, per currency,
 *     with the resolved amount never silently substituted for the disputed one.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored state, no stored timeliness, no stored swing.** Every verdict
 *     is derived on read from the notice, the deadline, the filings, the
 *     evidence and the resolution.
 *   - **No computed deadline.** The register holds no jurisdiction calendar and
 *     derives no window from a notice day. A deadline without a written basis
 *     is refused at the door.
 *   - **No filing without a receipt.** A filing carries the authority's receipt
 *     reference; an unreceipted filing is an intention, not a filing.
 *   - **No evidence without a reference.** An evidence item carries the document
 *     reference it is drawn from; a bare label is not a packet.
 *   - **No resolution without an outcome.** The outcome vocabulary is closed,
 *     and the resolved amount is a whole number of minor units.
 *   - **No person scored.** No tax handler, counsel or line is rated, ranked or
 *     named as the cause of a controversy outcome. The register reports the
 *     notice and the money, not blame.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A notice names one to four responsible
 * hands across reporting lines (a tax manager, a finance lead, group counsel).
 * The reader resolves every ACTIVE line that holds each of them through the ONE
 * matrix engine, counts a person ONCE, and derives the joint apex over every
 * line as the seat whose authority is required to answer for the controversy.
 * Where the record names several hands the duty sits above all of them and the
 * screen says so; it never silently promotes one hand to "owner of the
 * dispute". Where a hand is off the graph the row is printed as an orphan
 * rather than dropped, because deleting it would erase a live controversy from
 * the record.
 */

export const TAX_ENGINE_VERSION = 'tax-controversy-2026.11-v1';
export const TAX_ADR = 'ADR-0257';
export const TAX_RULE_ID = 'RULE-TAX-01';
export const TAX_ROUTE = 'tax';
export const TAX_HREF = '#/tax';
export const TAX_CSV_SCOPE = 'tax-controversy';
export const TAX_MARKER_KIND = 'tax-controversy';
export const TAX_EVENT_PREFIX = 'tax.';

export const TAX_EVENTS = Object.freeze({
  NOTICE_RECORDED: 'tax.notice.recorded',
  DEADLINE_DECLARED: 'tax.deadline.declared',
  FILING_RECORDED: 'tax.filing.recorded',
  EVIDENCE_RECORDED: 'tax.evidence.recorded',
  RESOLUTION_RECORDED: 'tax.resolution.recorded',
  CONVENTIONS_SET: 'tax.conventions.set',
  SCANNED: 'tax.scan',
});

export const TAX_RIGHTS = Object.freeze({
  READ: 'read-tax-controversy',
  MANAGE: 'manage-tax-controversy',
});

export const TAX_SETTING_KEYS = Object.freeze({
  autoPropagate: 'taxAutoPropagate',
  privacyFloor: 'taxPrivacyFloor',
  resolutionHorizonDays: 'taxResolutionHorizonDays',
});

export const TAX_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  resolutionHorizonDays: { min: 30, max: 3650 },
});

export const TAX_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  resolutionHorizonDays: 365,
});

export const TAX_LIMITS = Object.freeze({
  notices: 400,
  deadlines: 400,
  filings: 4000,
  evidence: 8000,
  resolutions: 400,
  markers: 400,
  /** A written basis, a notice basis, a deadline basis: long enough to be a source. */
  textMin: 24,
  textMax: 600,
  /** A notice reference, a receipt reference, an evidence reference: bounded and non-empty. */
  shortMin: 3,
  shortMax: 120,
  /** A jurisdiction label: a declared code or name, never a guessed calendar key. */
  jurisdictionMin: 2,
  jurisdictionMax: 40,
  /** A written finance record reference binding the controversy to its provision. */
  instrumentMin: 12,
  idMax: 120,
  /** How many responsible hands one notice may name. */
  holdersMax: 4,
  /** Rule asking. */
  rowsShown: 80,
});

export const TAX_READ_MIN_RANK = 3;
/** A tax controversy moves the provision and the cash: director / VP and above. */
export const TAX_MANAGE_MIN_RANK = 3;

/**
 * The tax types. A PUBLISHED vocabulary, so the export can count by kind without
 * naming a notice. `other` is a declared kind, never a guess: the seat names the
 * type it is contesting.
 */
export const TAX_TYPES = Object.freeze([
  Object.freeze({
    key: 'income',
    label: 'Income tax',
    says: 'A dispute over the income-tax treatment of an item — the IFRIC 23 / IAS 12 and ASC 740 territory. The position behind the notice is the uncertain tax treatment.',
  }),
  Object.freeze({
    key: 'vat',
    label: 'VAT / GST',
    says: 'A dispute over an indirect-tax assessment — a rate, a place of supply, an exemption or a deduction the authority has reassessed.',
  }),
  Object.freeze({
    key: 'transfer-pricing',
    label: 'Transfer pricing',
    says: 'A dispute over the arm’s-length pricing of a cross-border transaction. The evidence packet is the transfer-pricing documentation.',
  }),
  Object.freeze({
    key: 'payroll',
    label: 'Payroll / social charges',
    says: 'A dispute over withholding, employer contributions or the classification of a payment to a worker.',
  }),
  Object.freeze({
    key: 'customs',
    label: 'Customs / excise',
    says: 'A dispute over a customs or excise assessment — a classification, a valuation or an origin the authority has reassessed.',
  }),
  Object.freeze({
    key: 'other',
    label: 'Other declared tax',
    says: 'A dispute over a tax this vocabulary does not name. The seat declares the kind in the notice basis; the register never guesses it.',
  }),
]);
export const TAX_TYPE_KEYS = Object.freeze(TAX_TYPES.map((row) => row.key));
export const TAX_TYPE_BY_KEY = Object.freeze(Object.fromEntries(TAX_TYPES.map((row) => [row.key, row])));

/**
 * The filing kinds. Each is a different act in the dispute path, and the register
 * never treats one as another: an information supply is not an objection, and a
 * response is not an appeal.
 */
export const TAX_FILING_KINDS = Object.freeze([
  Object.freeze({
    key: 'objection',
    label: 'Objection',
    says: 'The first challenge to the assessment, filed within the jurisdiction-declared objection window. This is the filing the deadline protects.',
  }),
  Object.freeze({
    key: 'appeal',
    label: 'Appeal',
    says: 'A challenge to the authority’s decision on the objection, taken to the next forum — a tribunal, a court or a higher administrative body.',
  }),
  Object.freeze({
    key: 'response',
    label: 'Response',
    says: 'A reply to an authority request within the controversy — a submission, a position paper or a reply to a notice of proposed adjustment.',
  }),
  Object.freeze({
    key: 'information-supply',
    label: 'Information supply',
    says: 'The supply of information the authority requested. It is recorded so the packet is complete; it is not a challenge and it does not meet a deadline on its own.',
  }),
]);
export const TAX_FILING_KIND_KEYS = Object.freeze(TAX_FILING_KINDS.map((row) => row.key));
export const TAX_FILING_KIND_BY_KEY = Object.freeze(Object.fromEntries(TAX_FILING_KINDS.map((row) => [row.key, row])));

/**
 * The resolution outcomes. A closed vocabulary: a controversy ends in one of
 * these, or it is still open. The register never infers an outcome from an
 * amount or a payment.
 */
export const TAX_OUTCOMES = Object.freeze([
  Object.freeze({
    key: 'upheld',
    label: 'Upheld (assessment stands)',
    says: 'The authority’s assessment is upheld. The resolved amount is the amount finally payable, which may equal the disputed amount.',
  }),
  Object.freeze({
    key: 'partially-upheld',
    label: 'Partially upheld',
    says: 'Part of the assessment stands and part does not. The resolved amount is the amount finally payable after the split.',
  }),
  Object.freeze({
    key: 'withdrawn',
    label: 'Withdrawn (assessment cancelled)',
    says: 'The authority withdraws the assessment. The resolved amount is the amount finally payable, which is ordinarily nil.',
  }),
  Object.freeze({
    key: 'settled',
    label: 'Settled by agreement',
    says: 'The parties settle the dispute by agreement. The resolved amount is the agreed amount finally payable.',
  }),
  Object.freeze({
    key: 'conceded',
    label: 'Conceded (not contested)',
    says: 'The organisation concedes the assessment without contest. The resolved amount is the amount finally payable.',
  }),
]);
export const TAX_OUTCOME_KEYS = Object.freeze(TAX_OUTCOMES.map((row) => row.key));
export const TAX_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(TAX_OUTCOMES.map((row) => [row.key, row])));

/**
 * The six states. Each is a DIFFERENT FACT and the headline never hides the flags
 * underneath. `tone` colours the badge; `says` is what the screen prints.
 */
export const TAX_STATES = Object.freeze([
  Object.freeze({
    key: 'deadline-undeclared',
    label: 'Deadline undeclared',
    tone: 'bad',
    says: 'The authority notice is on the record and no objection deadline is declared. The register holds no jurisdiction calendar and will not invent one: the clock that protects this position is not on the record, and an ask is filed.',
  }),
  Object.freeze({
    key: 'overdue-unfiled',
    label: 'Overdue, unfiled',
    tone: 'bad',
    says: 'The declared deadline has passed and no filing is on the record. The assessment is becoming final by default, and the register says so plainly.',
  }),
  Object.freeze({
    key: 'filed-late',
    label: 'Filed late',
    tone: 'warn',
    says: 'The first filing was made after the declared deadline. The register records it as late rather than refusing it or re-dating it; the consequence is for the seat to record.',
  }),
  Object.freeze({
    key: 'awaiting-filing',
    label: 'Awaiting filing',
    tone: 'warn',
    says: 'A deadline is declared and has not passed, and no filing is on the record yet. The days remaining are printed so the window is visible while it is still open.',
  }),
  Object.freeze({
    key: 'filed-on-time',
    label: 'Filed on time',
    tone: 'good',
    says: 'The first filing was made on or before the declared deadline. The timeliness is derived by comparing the two declared days, never asserted.',
  }),
  Object.freeze({
    key: 'resolved',
    label: 'Resolved',
    tone: 'good',
    says: 'A resolution is on the record with a closed-vocabulary outcome and the amount finally payable. The swing against the disputed amount is printed apart.',
  }),
]);
export const TAX_STATE_KEYS = Object.freeze(TAX_STATES.map((row) => row.key));
export const TAX_STATE_BY_KEY = Object.freeze(Object.fromEntries(TAX_STATES.map((row) => [row.key, row])));
export const TAX_ATTENTION_STATE_KEYS = Object.freeze(['deadline-undeclared', 'overdue-unfiled', 'filed-late', 'awaiting-filing']);

/** Refusals printed at the door. Each is a control, not a message. */
export const TAX_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not declare a tax controversy for another line.',
});

export const TAX_SECTION_TITLES = Object.freeze({
  controversies: 'Controversies',
  filings: 'Filings & timeliness',
  evidence: 'Evidence packets',
  resolutions: 'Resolutions & swing',
  method: 'Method',
});

export const TAX_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'notices_n', 'deadline_undeclared_n', 'overdue_unfiled_n',
  'filed_late_n', 'awaiting_filing_n', 'filed_on_time_n', 'resolved_n',
  'filings_n', 'evidence_n', 'evidence_empty_n', 'aging_unresolved_n',
  'disputed_total_minor', 'resolved_total_minor', 'swing_total_minor', 'currencies',
  'holders_n', 'lines_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #194 (ADR-0257, Schema v209). IDENTITY-FREE BY CONSTRUCTION — and this one
 * is as sensitive as the provision export, because a controversy schedule names
 * the authority, the position and the sum disputed. One summary row, one row
 * per printed controversy state, and one row per CURRENCY carrying the money
 * bridge (disputed, resolved, swing). No notice reference, jurisdiction,
 * position, person, manager, reference or day crosses the boundary: amounts
 * cross only as per-currency minor-unit totals. A per-state count below the
 * declared privacy floor exports BLANK with its reason, never as a small
 * number.
 */
export const TAX_CSV_DESCRIPTOR = Object.freeze({
  key: TAX_CSV_SCOPE,
  label: 'Tax controversy and appeal control (aggregate)',
  group: 'finance',
  sensitive: true,
  filenameSlug: 'tax-controversy',
  description: 'One summary row, one row per printed controversy state and one row per currency. Counts of notices, deadlines undeclared, overdue-unfiled notices, late filings, notices awaiting filing, on-time filings, resolutions, filings, evidence items, evidence-empty filings and aging unresolved controversies; and per-currency minor-unit totals for the disputed amount, the resolved amount and the swing. No notice reference, jurisdiction, position, person, manager, reference or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method panel. Never a claim of parity. */
export const TAX_METHOD = Object.freeze({
  engine: TAX_ENGINE_VERSION,
  adr: TAX_ADR,
  frameworks: Object.freeze([
    'Post-issuance dispute lifecycle: an authority notice is contested by an objection within a jurisdiction-declared window, then by an appeal to the next forum, supported by an evidence packet, and closed by a resolution. The register binds all five facts to one notice and derives the state from them.',
    'The deadline is declared, never computed. The record holds no jurisdiction calendar, so a deadline without a written jurisdictional basis is refused at the door and the notice prints `deadline-undeclared` rather than a date nobody cited.',
    'Timeliness is derived by comparing the declared deadline day with the declared filing day. A filing after the deadline is `filed-late`, recorded plainly rather than refused or re-dated.',
    'The position behind the notice follows IFRIC 23 / IAS 12 and ASC 740 discipline: the authority is assumed to examine with full knowledge, and the measurement is the most likely amount or the expected value, whichever better predicts resolution. The register records the position; it does not re-measure the provision.',
    'The swing — disputed less resolved — is printed apart from both figures, per currency. The resolved amount is never silently substituted for the disputed one.',
    'Matrix addressing (ADR-0140/0141): a notice names responsible hands across reporting lines, and the authority required to answer for the controversy is the joint apex above every line — never a dispute “owner” the record selected.',
    'Bulletproof reliability: the register proves what the record supports and refuses the rest with a printed reason. A deadline with no basis is refused, never guessed; a filing with no receipt is refused, never recorded as filed.',
  ]),
  printed: Object.freeze([
    'Each notice: the authority reference, the disputed position, the jurisdiction as declared, the tax type, the notice day, the disputed amount and the responsible hands across every reporting line.',
    'The declared deadline and its written basis, the days remaining or the days overdue, and the derived timeliness of the first filing.',
    'Every filing with its kind, its filed day and the authority’s receipt reference; every evidence item with its document reference.',
    'The resolution with its closed-vocabulary outcome, the amount finally payable, and the swing against the disputed amount.',
    'The joint seat above every line holding a responsible hand.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored state, no stored timeliness and no stored swing. Every verdict is re-derived on read.',
    'No computed deadline and no jurisdiction calendar. A deadline without a written basis is refused at the door.',
    'No filing without the authority’s receipt reference, and no evidence item without a document reference.',
    'No re-measurement of the uncertain-tax provision. The provision is referenced by its finance record, never restated here.',
    'No person, line or tax handler rated, ranked or named as the cause of a controversy outcome.',
  ]),
});
