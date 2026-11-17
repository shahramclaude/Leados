/**
 * app/core/domain/lfgRegistry.js — the closed vocabulary of the Claim, Limitation &
 * Settlement-Authority Register (ADR-0248, Schema v202, `#/claims`, `RULE-LFG-01`,
 * CSV scope #189).
 *
 * THE DUTY, IN A GENERAL COUNSEL'S WORDS. *"Somebody wrote to us in March. The
 * letter sat in a director's inbox because it did not look like a claim. By the
 * time legal saw it the limitation period had nine days left, nobody had booked the
 * expert the case turns on, and when we finally wanted to settle, four people had
 * to be found to agree a number nobody had written down as the ceiling. Which single
 * record holds the day the clock started, the day it stops, what we may pay without
 * going back for authority, and what we have conceded so far?"*
 *
 * No surface in this workspace could answer any part of that. It could store a
 * decision, a delegation, a conflict of interest, a risk appetite, a regulatory
 * undertaking, an information request, a statutory authorisation and a workplace
 * restriction. Every one of those is an INTERNAL instrument. Not one of them holds a
 * matter in which a third party asserts something against the organisation and a
 * clock, set by somebody else, runs against it.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `limitation period`,
 * `cause of action`, `tribunal`, `employment tribunal`, `early conciliation`,
 * `claimant`, `litigation`, `without prejudice`, `reserved rights`, `standstill`,
 * `tolling`, `settlement authority`, `counsel`, `solicitor`, `damages`, `injunction`
 * and `indemnity`. The surviving hits are of three kinds and none is this duty: the
 * word `limitation` in prose about a *methodological* limitation, `dispute` and
 * `mediation` inside the internal priority-arbitration register (whose subject is
 * a disagreement between two internal parties), and `settlement` as the name of the
 * Outcome Attribution & Loop Settlement Terminal (ADR-0067), which settles a
 * *forecast*, not a claim. Wider absence **[UNVERIFIED]**.
 *
 * THE BENCHMARKED CATEGORY SETS THIS BAR [vendor documentation fetched 2026-11-17;
 * hands-on parity UNVERIFIED]. The bar is four mechanics, and this register must
 * match all four:
 *
 *   1. **One matter record with its parties, its claim type and its limitation date**
 *      — Xakia's Dispute Log (`limitation periods`, `claim amounts and the amount at
 *      risk`, `insurance coverage`, `proceedings tracked across multiple stages`),
 *      Maatdesk and CloudLex (a limitation date on the matter, surfaced on a
 *      dashboard as upcoming or overdue until satisfied).
 *   2. **Early, escalating warning against statutory cutoffs** — law-firm docketing
 *      practice raises banners at twelve, six and one month, and ExpiryEdge sells
 *      the category on jurisdiction-specific limitation tracking with escalation
 *      protocols.
 *   3. **Delegated settlement authority with limits and a multi-level approval
 *      workflow** — Xakia configures invoice/reserve approval `based on amount and
 *      delegated authority limits`; enterprise legal management (Legal Tracker,
 *      TeamConnect) makes a reserve or settlement approval by authority a first-class
 *      control.
 *   4. **An audit trail of what was conceded, to whom and on what basis**, because
 *      the number paid is only defensible against the number authorised.
 *
 * WHAT THIS REGISTER ADDS THAT THE CATEGORY DOES NOT — AND WHY THAT IS THE POINT.
 * Every benchmarked product stores a limitation date somebody typed and a settlement
 * number somebody approved. That is the same failure shape as a licence tracker: a
 * date is not a derived verdict and an approval is not a tested authority. Four
 * facts this register derives on read and prints apart, that a stored-field product
 * cannot express:
 *
 *   - **The clock's origin is a declared FACT about when the claimant knew, not the
 *     date of the incident.** Limitation runs from accrual — the date of knowledge
 *     in a negligence claim, the date of the act in a discrimination claim — and
 *     these are different days that the record must name separately. A matter whose
 *     accrual is unreadable prints `clock-unprovable` and refuses a day count; it
 *     never falls back on the incident date, because a plausible default here is a
 *     missed deadline with a green tick on it.
 *   - **A stay suspends the clock and the register proves it rather than assuming
 *     it.** A standstill, an early-conciliation certificate or a suspension
 *     agreement is a dated act by a named party that freezes the running days. The
 *     reader computes the effective deadline from the accrual, the declared period
 *     and every proved suspension span, and prints the arithmetic. An alleged stay
 *     nobody can evidence does not move the date, and the row says so.
 *   - **Authority to settle is a COMPUTED CEILING over the resolving lines, not a
 *     typed number on the matter.** Where the decision falls across two reporting
 *     lines the ceiling is the LOWEST joint authority above every line that must
 *     agree, and the register computes whose authority is required instead of
 *     picking a "matter owner". A settlement above the computed ceiling is kept and
 *     printed as `settled-beyond-authority` — recorded, never refused, because the
 *     number was actually paid.
 *   - **A concession is a dated instrument, not a change of status.** A reserve, an
 *     offer made, an offer received, a payment and a costs award are separate rows
 *     with their own days and bases, so "what have we conceded" is a sum the reader
 *     can prove, and interest on a late payment is computed rather than remembered.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored state and no stored "days left".** Every verdict is derived on
 *     read from the accrual, the declared period, the proved stays and the clock.
 *   - **No invented accrual.** A matter with no declared accrual date and no
 *     declared basis for it is refused at the door and prints `clock-unprovable` if
 *     it arrives in an import.
 *   - **No stay assumed.** A suspension moves the deadline only with a dated act, a
 *     named basis and the span it covers.
 *   - **No settlement treated as authorised because somebody typed an approval.**
 *     The authority is computed from the graph; the approval is a recorded act
 *     compared against it, and a gap is printed, never smoothed.
 *   - **No clock run past in silence.** A matter whose proved deadline passed with
 *     no resolution prints `time-barred` and the exact days it ran over — and,
 *     separately, says that the record cannot prove whether proceedings were issued,
 *     because it holds no court feed.
 *   - **No person scored.** No fee earner, no manager and no line is rated, ranked or
 *     named as the cause of a claim. The register reports exposure, not blame.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A matter names one to four responsible hands
 * across reporting lines (a business owner, a functional lead, a group counsel). The
 * reader resolves every ACTIVE line that holds each of them through the ONE matrix
 * engine, counts a person ONCE, and derives the joint apex over every line as the
 * seat whose authority is required. Where the record names several hands the duty
 * sits above all of them and the screen says so; it never silently promotes one hand
 * to "owner of the matter".
 */

export const LFG_ENGINE_VERSION = 'claim-limitation-settlement-2026.11-v1';
export const LFG_ADR = 'ADR-0248';
export const LFG_RULE_ID = 'RULE-LFG-01';
export const LFG_ROUTE = 'claims';
export const LFG_HREF = '#/claims';
export const LFG_CSV_SCOPE = 'claims-control';
export const LFG_MARKER_KIND = 'claim';
export const LFG_EVENT_PREFIX = 'claim.';

export const LFG_EVENTS = Object.freeze({
  MATTER_OPENED: 'claim.matter.opened',
  ACCRUAL_DECLARED: 'claim.accrual.declared',
  STAY_RECORDED: 'claim.stay.recorded',
  RESOLUTION_RECORDED: 'claim.resolution.recorded',
  CONCESSION_RECORDED: 'claim.concession.recorded',
  AUTHORITY_DECLARED: 'claim.authority.declared',
  CONVENTIONS_SET: 'claim.conventions.set',
  SCANNED: 'claim.scan',
});

export const LFG_RIGHTS = Object.freeze({
  READ: 'read-claims',
  MANAGE: 'manage-claims',
});

export const LFG_SETTING_KEYS = Object.freeze({
  autoPropagate: 'lfgAutoPropagate',
  privacyFloor: 'lfgPrivacyFloor',
  warningHorizonDays: 'lfgWarningHorizonDays',
});

export const LFG_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  warningHorizonDays: { min: 1, max: 365 },
});

export const LFG_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  /**
   * The declared warning horizon. It is a WORKSPACE PLANNING convention — how far
   * ahead the bench wants to see — and is deliberately NOT a limitation period. No
   * default limitation period exists anywhere in this register: a period belongs to
   * the cause of action and the jurisdiction, and it is declared on the matter.
   */
  warningHorizonDays: 90,
});

export const LFG_LIMITS = Object.freeze({
  matters: 400,
  accruals: 400,
  stays: 1200,
  resolutions: 800,
  concessions: 4000,
  authorityGrants: 400,
  markers: 400,
  /** A written basis, a basis for a stay, a note: long enough to be a source. */
  textMin: 24,
  textMax: 600,
  /** A party, a forum, a claim-type label: bounded and non-empty. */
  shortMin: 3,
  shortMax: 120,
  /** A written claim or demand reference on the document that started the clock. */
  instrumentMin: 12,
  idMax: 120,
  /**
   * The longest limitation period the register will accept on one matter, in months.
   * This is a BOUND, not a default: it exists so a typo of `600` months cannot make a
   * matter immortal, and a matter past it is refused rather than clamped.
   */
  periodMonthsMax: 240,
  /** The longest single proved suspension, in days, that one stay may cover. */
  stayMaxDays: 1825,
  /** How far ahead a stay may be declared, and how far back a matter may be backfilled. */
  aheadMaxDays: 1825,
  backfillMaxDays: 3650,
  /** How many responsible hands one matter may name. */
  holdersMax: 4,
  /** Rule asking. */
  rowsShown: 80,
});

export const LFG_READ_MIN_RANK = 1;
/**
 * Rank that may open a matter, declare an accrual, record a stay or a resolution,
 * declare a concession or re-declare the conventions.
 *
 * RANK 1, DELIBERATELY, AND FOR A REASON OPPOSITE TO THE LICENCE REGISTER. A claim
 * arrives at the front line — a letter to a store, a note to a supervisor, an
 * employee's grievance escalation. The failure this register exists to prevent is
 * that letter waiting until somebody senior recognises it as a claim. What protects
 * the record is therefore not rank: it is the written reference on the document that
 * started the clock, the requirement that a limitation period is DECLARED rather than
 * inferred, the refusal to invent an accrual, and `RULE-LFG-01` addressing the joint
 * apex.
 */
export const LFG_MANAGE_MIN_RANK = 1;

/**
 * The resolution kinds. A matter leaves the register's live clock only by one of
 * these — and `time-barred` is NOT one of them, because a deadline passing is not an
 * outcome and the register holds no court feed to prove what happened next.
 */
export const LFG_RESOLUTION_KINDS = Object.freeze([
  Object.freeze({
    key: 'settled',
    label: 'Settled',
    says: 'A settlement agreement was concluded on a stated day for a stated amount. The amount is recorded against the ceiling the graph computed, never instead of it.',
    closesClock: true,
    requiresAmount: true,
  }),
  Object.freeze({
    key: 'withdrawn',
    label: 'Withdrawn or discontinued',
    says: 'The claimant withdrew or the claim was discontinued. No money changed hands on this row; any costs are recorded as their own concession.',
    closesClock: true,
    requiresAmount: false,
  }),
  Object.freeze({
    key: 'dismissed',
    label: 'Dismissed or defended',
    says: 'A forum determined the claim against the claimant. The record holds the outcome; it does not re-try the case.',
    closesClock: true,
    requiresAmount: false,
  }),
  Object.freeze({
    key: 'judgment-against',
    label: 'Judgment against the organisation',
    says: 'A forum determined the claim in the claimant’s favour for a stated sum. The sum is recorded here and is a real liability, whether or not it was in anybody’s authority.',
    closesClock: true,
    requiresAmount: true,
  }),
  Object.freeze({
    key: 'merged',
    label: 'Merged into another matter',
    says: 'This matter became part of another one already on the register. The clock passes to the surviving matter; this row closes and names it.',
    closesClock: true,
    requiresAmount: false,
  }),
]);
export const LFG_RESOLUTION_KIND_KEYS = Object.freeze(LFG_RESOLUTION_KINDS.map((row) => row.key));
export const LFG_RESOLUTION_KIND_BY_KEY = Object.freeze(Object.fromEntries(LFG_RESOLUTION_KINDS.map((row) => [row.key, row])));

/**
 * The claim types. Each carries the ACCRUAL RULE the record must be able to name —
 * the fact that starts the clock — because the commonest legal error in this domain
 * is dating the clock from the incident instead of from accrual.
 *
 * `accrualIsKnownDate` marks the types where accrual is normally the act itself;
 * where a type's accrual turns on knowledge, the door demands the knowledge date and
 * the basis for it.
 */
export const LFG_CLAIM_TYPES = Object.freeze([
  Object.freeze({
    key: 'breach-of-contract',
    label: 'Breach of contract',
    accrual: 'The date of the breach — normally the date the obligation was not performed.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'negligence',
    label: 'Negligence',
    accrual: 'The date of damage, subject to the date of knowledge — the day the organisation first knew, or ought reasonably to have known, the facts that make the claim arguable.',
    knowledgeBased: true,
  }),
  Object.freeze({
    key: 'personal-injury',
    label: 'Personal injury',
    accrual: 'The date of the injury, subject to the date of knowledge where the injury or its cause was not known at the time.',
    knowledgeBased: true,
  }),
  Object.freeze({
    key: 'discrimination',
    label: 'Discrimination or equal pay',
    accrual: 'The date of the act complained of — or, for a continuing act, the day the conduct ended. The record must say which of the two it is relying on.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'unfair-dismissal',
    label: 'Unfair or wrongful dismissal',
    accrual: 'The effective date of termination. Not the date the letter was sent and not the date of the hearing.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'wages-or-holiday',
    label: 'Unlawful deduction, wages or holiday pay',
    accrual: 'The date of the deduction or the date the payment fell due; a series of deductions is a question the matter must state.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'statutory-deduction',
    label: 'Statutory or regulatory penalty',
    accrual: 'The date of the notice or the date the penalty was imposed, as its own instrument states.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'property-damage',
    label: 'Property damage or nuisance',
    accrual: 'The date of the damage, subject to the date of knowledge where the cause was latent.',
    knowledgeBased: true,
  }),
  Object.freeze({
    key: 'debt',
    label: 'Debt recovery or unpaid sum',
    accrual: 'The date the sum fell due for payment under the terms that created it.',
    knowledgeBased: false,
  }),
  Object.freeze({
    key: 'other',
    label: 'Other — the matter states its own accrual rule',
    accrual: 'A type this register does not carry. The matter must state, in writing, the fact that starts the clock, and the register prints that it is an unsupported type rather than pretending to know the rule.',
    knowledgeBased: false,
  }),
]);
export const LFG_CLAIM_TYPE_KEYS = Object.freeze(LFG_CLAIM_TYPES.map((row) => row.key));
export const LFG_CLAIM_TYPE_BY_KEY = Object.freeze(Object.fromEntries(LFG_CLAIM_TYPES.map((row) => [row.key, row])));

/**
 * The stay kinds — the acts that genuinely suspend a clock. An ALLEGED stay is not
 * one of them; it is a row with `proved: false` that moves nothing and prints its
 * reason.
 */
export const LFG_STAY_KINDS = Object.freeze([
  Object.freeze({
    key: 'standstill-agreement',
    label: 'Standstill agreement',
    says: 'A written agreement between the parties that the clock stops for a stated span. It must be signed by both sides; the record names the instrument.',
    provesWith: 'the agreement instrument and both parties’ signatories',
  }),
  Object.freeze({
    key: 'conciliation-certificate',
    label: 'Conciliation or early-conciliation certificate',
    says: 'A certificate issued by the conciliation service that stops the clock for the period its own rules give. The certificate reference and its issue day are the proof.',
    provesWith: 'the certificate reference and its issue day',
  }),
  Object.freeze({
    key: 'court-order',
    label: 'Court order or direction',
    says: 'A forum directed that the claim be stayed or the clock suspended. The order reference and the day it was made are the proof.',
    provesWith: 'the order reference and the day it was made',
  }),
  Object.freeze({
    key: 'legal-suspension',
    label: 'Statutory suspension',
    says: 'A provision suspended the clock — insolvency, a legal disability, an arbitration clause invoked. The matter cites the provision.',
    provesWith: 'the provision cited and the span it covers',
  }),
]);
export const LFG_STAY_KIND_KEYS = Object.freeze(LFG_STAY_KINDS.map((row) => row.key));
export const LFG_STAY_KIND_BY_KEY = Object.freeze(Object.fromEntries(LFG_STAY_KINDS.map((row) => [row.key, row])));

/** The concession kinds. Every one is money or obligation moving, dated. */
export const LFG_CONCESSION_KINDS = Object.freeze([
  Object.freeze({ key: 'reserve-set', label: 'Reserve set', says: 'A reserve was set or raised on the matter. A reserve is a provision, not a payment.', movesMoney: false }),
  Object.freeze({ key: 'reserve-released', label: 'Reserve released', says: 'Reserve was released back. It reduces the provision and pays nobody.', movesMoney: false }),
  Object.freeze({ key: 'offer-received', label: 'Offer received', says: 'The claimant offered to settle for a stated sum on a stated day. It is their number, not ours.', movesMoney: false }),
  Object.freeze({ key: 'offer-made', label: 'Offer made', says: 'The organisation offered to settle for a stated sum. It is a concession the moment it is made, whether or not anybody accepts it.', movesMoney: false }),
  Object.freeze({ key: 'payments-on-account', label: 'Payment on account', says: 'Money actually paid to the claimant, dated and counted. This is the only kind that reduces what is still owed.', movesMoney: true }),
  Object.freeze({ key: 'costs-award', label: 'Costs', says: 'Legal costs incurred or awarded. Recorded apart from the claim sum, because a cheap claim defended expensively is the failure this row exists to show.', movesMoney: true }),
  Object.freeze({ key: 'interest', label: 'Interest', says: 'Interest accrued or paid on the sum. Computed by the reader where the record supports it; recorded here where a forum fixed it.', movesMoney: true }),
]);
export const LFG_CONCESSION_KIND_KEYS = Object.freeze(LFG_CONCESSION_KINDS.map((row) => row.key));
export const LFG_CONCESSION_KIND_BY_KEY = Object.freeze(Object.fromEntries(LFG_CONCESSION_KINDS.map((row) => [row.key, row])));

/**
 * The nine states. Each is a DIFFERENT FACT and the headline never hides the flags
 * underneath. `tone` colours the badge; `says` is what the screen prints.
 */
export const LFG_STATES = Object.freeze([
  Object.freeze({
    key: 'merged',
    label: 'Merged',
    tone: 'neutral',
    says: 'This matter was merged into another one on the register. Its clock passed to the surviving matter; read that matter, not this one.',
  }),
  Object.freeze({
    key: 'resolved',
    label: 'Resolved',
    tone: 'good',
    says: 'A resolution is recorded: settled, withdrawn, dismissed, judgment or merged. The clock stopped by an act, not by time passing.',
  }),
  Object.freeze({
    key: 'settled-beyond-authority',
    label: 'Settled beyond authority',
    tone: 'bad',
    says: 'The matter settled for more than the authority the reporting graph computes above its responsible lines. The settlement is real and is kept; the gap between the number paid and the number anyone was authorised to pay is printed, because it is the control this register exists to run.',
  }),
  Object.freeze({
    key: 'clock-unprovable',
    label: 'Clock unprovable',
    tone: 'bad',
    says: 'The record cannot derive a limitation deadline: the accrual day is missing or its basis is unreadable. The register refuses to guess, prints no days remaining, and asks for the fact. A plausible default here would be a green tick over a date nobody can prove.',
  }),
  Object.freeze({
    key: 'time-barred',
    label: 'Deadline passed, no resolution',
    tone: 'bad',
    says: 'The proved limitation deadline passed with no resolution on the record. The exact days it ran over are printed. The register holds no court feed and cannot say whether proceedings were issued — a record gap is not an allegation that the claim was lost.',
  }),
  Object.freeze({
    key: 'critical',
    label: 'Critical — inside the final warning band',
    tone: 'bad',
    says: 'The deadline is inside the narrowest warning band the workspace declared. The next responsible action is already late.',
  }),
  Object.freeze({
    key: 'urgent',
    label: 'Urgent',
    tone: 'bad',
    says: 'The deadline falls inside half the declared warning horizon, or inside a stay that would move it if proved.',
  }),
  Object.freeze({
    key: 'approaching',
    label: 'Approaching the horizon',
    tone: 'warn',
    says: 'The deadline falls inside the declared warning horizon but outside the urgent band. The next responsible start date has arrived.',
  }),
  Object.freeze({
    key: 'in-time',
    label: 'In time',
    tone: 'good',
    says: 'The deadline is outside the declared warning horizon and no stay or resolution is outstanding.',
  }),
]);
export const LFG_STATE_KEYS = Object.freeze(LFG_STATES.map((row) => row.key));
export const LFG_STATE_BY_KEY = Object.freeze(Object.fromEntries(LFG_STATES.map((row) => [row.key, row])));
export const LFG_BAD_STATE_KEYS = Object.freeze(['settled-beyond-authority', 'clock-unprovable', 'time-barred', 'critical', 'urgent']);

/** The three stay states. An alleged stay moves nothing. */
export const LFG_STAY_STATES = Object.freeze([
  Object.freeze({ key: 'proved', label: 'Proved', tone: 'good', says: 'The stay is evidenced with the instrument its kind requires, and its span is counted in the deadline arithmetic.' }),
  Object.freeze({ key: 'alleged', label: 'Alleged, not proved', tone: 'warn', says: 'A stay is recorded but the evidence its kind requires is not. It moves NO deadline; the row prints what is missing.' }),
  Object.freeze({ key: 'lapsed', label: 'Ended', tone: 'neutral', says: 'The suspending span has ended. The days it covered are frozen in the arithmetic and printed.' }),
]);
export const LFG_STAY_STATE_KEYS = Object.freeze(LFG_STAY_STATES.map((row) => row.key));
export const LFG_STAY_STATE_BY_KEY = Object.freeze(Object.fromEntries(LFG_STAY_STATES.map((row) => [row.key, row])));

/** Refusals printed at the door. Each is a control, not a message. */
export const LFG_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not open a matter for another line.',
});

export const LFG_SECTION_TITLES = Object.freeze({
  matters: 'Matters',
  clocks: 'Limitation clocks',
  settlements: 'Settlement authority',
  method: 'Method',
});

export const LFG_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'matters_n', 'open_n', 'in_time_n', 'approaching_n', 'urgent_n',
  'critical_n', 'time_barred_n', 'clock_unprovable_n', 'resolved_n', 'settled_n',
  'settled_beyond_authority_n', 'merged_n', 'stays_n', 'stays_proved_n', 'stays_alleged_n',
  'days_remaining_min', 'days_over_total', 'claimed_total_minor', 'reserve_total_minor',
  'paid_total_minor', 'costs_total_minor', 'authority_ceiling_minor', 'beyond_authority_minor',
  'holders_n', 'lines_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #189 (ADR-0248, Schema v202). IDENTITY-FREE BY CONSTRUCTION — and this one is
 * the most sensitive export in the estate, because a claim register names the party
 * suing us. One summary row, one row per printed matter state and one row per
 * printed stay state. No party, claim type, forum, instrument reference, person,
 * manager, day or individual amount crosses the boundary: amounts are exported only
 * as whole-register minor-unit totals. A per-state count below the declared privacy
 * floor exports BLANK with its reason, never as a small number.
 */
export const LFG_CSV_DESCRIPTOR = Object.freeze({
  key: LFG_CSV_SCOPE,
  label: 'Claims, limitation and settlement authority (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'claims-control',
  description: 'One summary row, one row per printed matter state and one row per printed stay state. Counts of matters open, in time, approaching the declared horizon, urgent, critical, past their proved deadline, with an unprovable clock, resolved, settled, settled beyond computed authority and merged; stays recorded, proved and merely alleged; the shortest days remaining, the total days over deadline, and whole-register minor-unit totals for claimed, reserved, paid, costs, the computed authority ceiling and the amount beyond it. No party, claim type, forum, instrument, person, manager or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method panel. Never a claim of parity. */
export const LFG_METHOD = Object.freeze({
  engine: LFG_ENGINE_VERSION,
  adr: LFG_ADR,
  frameworks: Object.freeze([
    'Limitation of actions: the clock runs from ACCRUAL, not from the incident — from the breach, the act, the termination date, or the date of knowledge. The register requires the accrual day and the rule it relied on, because dating the clock from the incident is the commonest way this duty is lost.',
    'Suspension of limitation (standstill, conciliation certificate, court order, statutory provision): a clock stops by a dated act of a named party over a stated span. Every proved span is added to the deadline and printed; an unproved allegation moves nothing.',
    'Delegated settlement authority (attorney-in-fact and board-delegation practice): the organisation may settle within a ceiling somebody was actually authorised to spend, and a settlement above it is a governance event — recorded, printed, never rejected after the fact.',
    'Provisioning under IAS 37 / ASC 450: a reserve is set from the obligation, a payment reduces it, and the two are printed apart so a provision is never confused with money spent.',
    'Cost-certainty of dispute resolution: costs, interest and the sum claimed are three different numbers, and a claim defended for more than it was worth is a finding the record can prove.',
    'Matrix addressing (ADR-0140/0141): a matter names responsible hands across reporting lines, and the authority required to settle is the joint apex above every line — never a matter “owner” the record selected.',
    'Bulletproof reliability: the register proves what the record supports and refuses the rest with a printed reason. A deadline it cannot derive is `clock-unprovable`; a deadline it can derive and that passed is `time-barred`, and it says plainly that it holds no court feed and cannot state whether proceedings were issued.',
  ]),
  printed: Object.freeze([
    'Each matter’s accrual day, the rule it relied on, its declared limitation period and the arithmetic to the effective deadline.',
    'Every proved suspension span and its exact contribution in whole days, and every allegation that moved nothing.',
    'The exact whole days remaining, or the exact whole days by which the proved deadline ran over.',
    'Every concession and resolution with its own day, basis and exact amount, and the sums derived from them.',
    'The computed settlement authority ceiling over every responsible line, and the exact gap where the number paid exceeded it.',
    'Every responsible hand, every active line that holds each of them, and the joint seat above them all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored status, no stored “days remaining” and no per-matter risk score.',
    'No default limitation period, no jurisdiction table and no automatic accrual. Every one is a fact about a particular cause of action, declared on the matter.',
    'No document store: an instrument REFERENCE is recorded, never the pleading or the agreement.',
    'No court feed, no filing integration and no docket import: the register cannot prove proceedings were issued and never implies it can.',
    'No legal advice and no merits assessment. It records the clock and the money, not whether the claim will succeed.',
    'No person, line or fee earner rated, ranked or named as the cause of a claim.',
  ]),
});
