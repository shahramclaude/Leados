/**
 * app/core/domain/undertakingRegistry.js — closed vocabulary for the
 * Regulatory Undertaking & Outward-Commitment Closure Register (ADR-0234,
 * `RULE-UDT-01`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. The enterprise promised something to
 * somebody outside itself. An undertaking was given to a regulator, a licence
 * condition was accepted, the board committed to a remedy, a management
 * representation was signed over a declared scope, a sub-certification was
 * given to a parent. The promise is real, it is dated, and it is enforceable.
 *
 * Then three things happen in most organisations, and not one of them is
 * visible anywhere in this workspace:
 *
 *   1. THE WORK IS DONE AND NOBODY OUTSIDE IS TOLD. The fix ships; the
 *      regulator, the board, the customer hears nothing. In the instruments
 *      that matter the promise is not discharged by doing the work — it is
 *      discharged by DOING IT AND REPORTING IT. The gap between "we did it" and
 *      "we told them" is precisely where this duty fails, and it is the gap
 *      this register is built around.
 *   2. THE PERSON WHO DID THE WORK GRADES IT. A function reports its own
 *      deliverable as met. Nobody independent on the reporting graph ever
 *      tested it. A remediation that closes on its deliverer's word is not a
 *      discharge; it is a claim.
 *   3. THE DAY PASSES QUIETLY. The due date goes by with no report on the
 *      record, and the organisation discovers it when the supervisor writes.
 *      The register prints `lapsed` and never converts a passed day into a met
 *      promise.
 *
 * THREE ACTS, KEPT APART FOREVER. The register stores three distinct facts and
 * never collapses them into one reassuring word:
 *
 *   DELIVERED  — the accountable line's owner asserts the deliverable exists,
 *                with dated evidence in their own name.
 *   CONFIRMED  — a seat strictly ABOVE that owner on the reporting graph
 *                independently confirms the deliverable is really there.
 *   REPORTED   — the accountable executive records that the counterparty was
 *                told, in writing, on a day, under a named instrument, and
 *                whether the counterparty acknowledged it.
 *
 * An undertaking is `reported-met` only when all three hold on every line.
 * Everything short of that reads as exactly what it is.
 *
 * THE MATRIX IS THE POINT. A licence condition does not land on one
 * department: it lands on operations, legal and finance at once, held by three
 * different people with three different managers. So an undertaking carries
 * ONE OR MORE OBLIGATION LINES, each with its own named holder, its own
 * deliverable and its own due day — never invented, never inferred from org
 * position. The seat that must answer for the whole promise is the JOINT APEX
 * ABOVE EVERY ACCOUNTABLE LINE, computed from the graph and never chosen by
 * the actor; where no such seat exists the register prints `no-authority` and
 * asks nobody rather than promoting an unrelated manager into the role.
 *
 * TWO DOCTRINES, CARRIED FROM THE HOUSE RULES.
 *   NO SCORE ON A PERSON OR A FUNCTION. The register counts undertakings,
 *   lines, acts and days. It never computes a compliance score, a maturity
 *   rating, a league table or a "percentage of promises kept" per team.
 *   THE DAY NEVER DECIDES. A passed due day reads `lapsed-unreported` with the
 *   consequence named. Nothing is closed, extended or met by the passage of
 *   time; only a dated human act moves a promise.
 *
 * The register states nothing about a person beyond the line they hold: no
 * volume, no rate over people, no ranking.
 */

export const UDT_ENGINE_VERSION = 'undertaking-closure-2026.11-v1';
export const UDT_ADR = 'ADR-0234';
export const UDT_RULE_ID = 'RULE-UDT-01';
export const UDT_ROUTE = 'undertakings';
export const UDT_HREF = '#/undertakings';
export const UDT_MARKER_KIND = 'undertaking';

export const UDT_LIMITS = Object.freeze({
  undertakings: 200,
  acts: 4000,
  markers: 400,
  /** Obligation lines one promise may carry. A licence condition rarely lands
   * on more than a handful of lines; beyond six the declaration is almost
   * certainly a programme, and a programme is not a promise with one date. */
  linesMin: 1,
  linesMax: 6,
  refMin: 3,
  refMax: 80,
  textMin: 24,
  textMax: 600,
  counterpartyMin: 3,
  counterpartyMax: 120,
  /** How far ahead a promise may be dated, in whole days. */
  horizonMaxDays: 3650,
  /** How close to the due day the "report owed" flag fires. */
  closingWindowDays: 14,
  /** How long after the last confirmation the counterparty report is chased. */
  reportChaseDays: 5,
  /** Rank that may declare a promise to an outside party, or report its closure. */
  declareMinRank: 4,
  privacyFloor: 3,
  askDueDays: 2,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/**
 * WHO was promised. A closed list, because a promise to a supervisor and a
 * promise to a customer carry different enforcement, different evidence and a
 * different consequence when the day passes — and the register must be able to
 * print the difference rather than average it.
 */
export const UDT_COUNTERPARTY_KINDS = Object.freeze([
  Object.freeze({ key: 'regulator', label: 'Regulator / supervisor', note: 'A statutory or supervisory body with enforcement powers over the entity.' }),
  Object.freeze({ key: 'board', label: 'Board / board committee', note: 'The entity’s own governing body or one of its committees.' }),
  Object.freeze({ key: 'customer', label: 'Customer / client', note: 'A commercial counterparty to whom a contractual promise was given.' }),
  Object.freeze({ key: 'lender', label: 'Lender / investor', note: 'A provider of capital, or a covenant beneficiary under a facility.' }),
  Object.freeze({ key: 'certifier', label: 'Certification / assurance body', note: 'A body that issues or maintains a certificate or attestation.' }),
  Object.freeze({ key: 'authority', label: 'Other public authority', note: 'A public body that is not a supervisor — a planning authority, a grantor, a ministry.' }),
]);
export const UDT_COUNTERPARTY_KEYS = Object.freeze(UDT_COUNTERPARTY_KINDS.map((row) => row.key));

/**
 * The INSTRUMENT the promise was given under. Closed, because a licence
 * condition may not be moved by internal fiat while an internal board
 * commitment may — the register refuses an extension on an external instrument
 * without the counterparty's own recorded agreement.
 */
export const UDT_INSTRUMENTS = Object.freeze([
  Object.freeze({ key: 'licence-condition', label: 'Licence / permit condition', external: true, note: 'A condition attached to a licence or permit the entity holds. Its date is not the entity’s alone to move.' }),
  Object.freeze({ key: 'regulatory-undertaking', label: 'Regulatory undertaking / consent order', external: true, note: 'A formal undertaking given to, or an order agreed with, a supervisory body.' }),
  Object.freeze({ key: 'board-resolution', label: 'Board resolution / board commitment', external: false, note: 'A commitment recorded in the entity’s own governance, owed to the board.' }),
  Object.freeze({ key: 'management-representation', label: 'Management representation letter', external: true, note: 'A signed representation given to an auditor or third party over a declared scope.' }),
  Object.freeze({ key: 'sub-certification', label: 'Sub-certification to a parent / group', external: true, note: 'A certification given upward to a parent entity or group function.' }),
  Object.freeze({ key: 'contractual-covenant', label: 'Contractual covenant / service commitment', external: true, note: 'A covenant or committed service level owed under an agreement.' }),
]);
export const UDT_INSTRUMENT_KEYS = Object.freeze(UDT_INSTRUMENTS.map((row) => row.key));

/** True when the instrument's terms are not the entity's alone to move. */
export const udtInstrumentIsExternal = (key) => Boolean(UDT_INSTRUMENTS.find((row) => row.key === key)?.external);

/**
 * Derived undertaking states. Nothing stores a state; every one is re-read
 * from the acts and the live reporting graph on every call. Precedence is
 * declared once, here, and the kernel, the panel and the CSV all read it from
 * this list's order — so no two surfaces can disagree about which state wins.
 *
 *   lapsed wins over everything: the day has gone and the counterparty has not
 *   been told, and that is the fact the counterparty experiences.
 *   disputed wins over reported: a report the counterparty does not accept is
 *   a disputed promise, never a met one.
 *   rejected wins over reported: an independent seat has found the deliverable
 *   is not there. Whatever was told to the counterparty, the promise is not met,
 *   and the register will not print the reassuring word over the tested fact.
 */
export const UDT_STATES = Object.freeze([
  Object.freeze({ key: 'lapsed-unreported', label: 'Lapsed — the due day passed with no report on the record' }),
  Object.freeze({ key: 'report-disputed', label: 'Report disputed — the counterparty does not accept the report as meeting the promise' }),
  Object.freeze({ key: 'rejected', label: 'Rejected — an independent seat tested a deliverable and found it not there' }),
  Object.freeze({ key: 'reported-met', label: 'Met and reported — every line confirmed, the counterparty notified in writing' }),
  Object.freeze({ key: 'confirmed-unreported', label: 'Confirmed, unreported — every line is independently confirmed and the counterparty has not been told' }),
  Object.freeze({ key: 'delivered-untested', label: 'Delivered, untested — a line asserts its deliverable; no independent confirmation is on the record' }),
  Object.freeze({ key: 'in-progress', label: 'In progress — the lines are at work; nothing is delivered yet' }),
  Object.freeze({ key: 'declared', label: 'Declared — none of the obligation lines carries a named holder yet' }),
]);
export const UDT_STATE_KEYS = Object.freeze(UDT_STATES.map((row) => row.key));

/** Per-line states, the parts the undertaking's state is built from. */
export const UDT_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'unassigned', label: 'The line has named no holder yet' }),
  Object.freeze({ key: 'working', label: 'A holder is named and the deliverable is not yet asserted' }),
  Object.freeze({ key: 'delivered', label: 'The holder asserts the deliverable exists — an independent test is owed' }),
  Object.freeze({ key: 'confirmed', label: 'An independent seat confirmed the deliverable is really there' }),
  Object.freeze({ key: 'rejected', label: 'An independent seat tested the deliverable and found it not there' }),
]);
export const UDT_LINE_STATE_KEYS = Object.freeze(UDT_LINE_STATES.map((row) => row.key));

/**
 * The one closed decision an independent test can return. A third word —
 * "partly" — is deliberately absent: a partly-done promise is a delivered
 * assertion and a rejection waiting to be written, not a hidden middle.
 */
export const UDT_VERDICTS = Object.freeze(['confirm', 'reject']);
export const UDT_VERDICT_KEYS = Object.freeze([...UDT_VERDICTS]);

/** How the declared lines sat against each other when the promise was DECLARED.
 * A promise held by three lines with different managers has no single owner,
 * and the register prints that rather than picking one. */
export const UDT_ACCOUNTABILITY = Object.freeze([
  Object.freeze({ key: 'single-holder', label: 'One line, one holder — the promise has a single accountable seat' }),
  Object.freeze({ key: 'joint-apex', label: 'Several lines under a common seat — the joint apex above them answers' }),
  Object.freeze({ key: 'no-authority', label: 'No seat above every line — no single seat answers, and none was invented' }),
]);
export const UDT_ACCOUNTABILITY_KEYS = Object.freeze(UDT_ACCOUNTABILITY.map((row) => row.key));

/** Whether the counterparty acknowledged the report. A closed list, never free
 * text: "they replied" and "we have heard nothing" are different facts. */
export const UDT_ACKNOWLEDGEMENTS = Object.freeze([
  Object.freeze({ key: 'acknowledged', label: 'Acknowledged — the counterparty confirmed receipt or acceptance in writing' }),
  Object.freeze({ key: 'no-response', label: 'No response yet — reported in writing, no reply on the record' }),
  Object.freeze({ key: 'disputed', label: 'Disputed — the counterparty does not accept the report as meeting the promise' }),
]);
export const UDT_ACKNOWLEDGEMENT_KEYS = Object.freeze(UDT_ACKNOWLEDGEMENTS.map((row) => row.key));

/** Derived flags. Every one is a statement about the RECORD, never a rating. */
export const UDT_FLAGS = Object.freeze({
  /** No report on the record and the due day is inside the closing window. */
  closing: 'report-window-closing',
  /** No report on the record and the due day has passed. */
  lapsed: 'lapsed-unreported',
  /** Every line confirmed and no counterparty report on the record. */
  unreported: 'confirmed-not-reported',
  /** A line's deliverable was rejected by an independent seat. */
  rejected: 'deliverable-rejected',
  /** The counterparty disputed the report: the promise is not accepted as met. */
  disputed: 'report-disputed',
  /** A named line holder is no longer active on the roster. Printed, never repaired. */
  holderUnresolved: 'line-holder-not-active',
  /** No seat above every accountable line exists on the graph. Printed, never repaired. */
  noAuthority: 'no-authority-above-all-lines',
  /** An instrument that cannot be moved internally was extended without the
   * counterparty's agreement on the record. Printed, never repaired. */
  unilateralExtension: 'external-instrument-extended-unilaterally',
});

/**
 * SIX act kinds. `deliver` and `verify` are per-line; `report` and `extend` are
 * undertaking-level; `notify` records the counterparty's acknowledgement after a
 * report. Nothing here can close an undertaking except a report that every line
 * has been confirmed and the counterparty accepts.
 */
export const UDT_ACT_KINDS = Object.freeze(['assign', 'deliver', 'verify', 'report', 'notify', 'extend']);

export const UDT_REFUSALS = Object.freeze({
  unknownUndertaking: 'unknown-undertaking',
  notAExecutive: 'not-an-executive-seat',
  counterpartyUnreadable: 'counterparty-unreadable',
  instrumentUnreadable: 'instrument-unreadable',
  scopeUnreadable: 'scope-unreadable',
  dueOutOfRange: 'due-day-out-of-range',
  dueInPast: 'due-day-in-the-past',
  duplicateLine: 'duplicate-obligation-line',
  lineOutOfRange: 'obligation-line-count-out-of-range',
  declaredLineUnresolved: 'declared-line-not-resolved',
  notLineHolder: 'not-the-holder-of-this-line',
  lineAlreadyAssigned: 'line-already-carries-a-holder',
  lineUnassigned: 'line-has-no-holder',
  holderInactive: 'line-holder-not-active',
  alreadyDelivered: 'deliverable-already-asserted',
  nothingToVerify: 'nothing-asserted-to-test',
  notIndependent: 'not-independent-of-the-line-holder',
  alreadyVerified: 'deliverable-already-tested',
  deliversNothing: 'not-every-line-is-confirmed',
  notDeclarant: 'not-the-accountable-executive',
  alreadyReported: 'counterparty-already-reported',
  reportBeforeConfirmation: 'report-predates-full-confirmation',
  reportBeforeDueCheck: 'report-is-not-a-report',
  notifyBeforeReport: 'no-report-to-acknowledge',
  alreadyNotified: 'report-already-acknowledged',
  extensionRefusedExternal: 'external-instrument-may-not-be-extended-internally',
  extensionNotForward: 'extension-does-not-move-the-due-day-forward',
  extensionBeyondHorizon: 'extension-beyond-the-declared-horizon',
  extensionAfterDue: 'extension-refused-after-the-due-day',
  alreadyClosed: 'undertaking-already-closed',
  beforeDeclared: 'before-declared',
  futureDated: 'future-dated',
  ledgerFull: 'ledger-full',
  unreadable: 'unreadable',
  noActor: 'no-actor',
});

export const UDT_EVENTS = Object.freeze({
  DECLARED: 'undertaking.declared',
  ASSIGNED: 'undertaking.line.assigned',
  DELIVERED: 'undertaking.line.delivered',
  VERIFIED: 'undertaking.line.verified',
  REPORTED: 'undertaking.counterparty.reported',
  NOTIFIED: 'undertaking.counterparty.acknowledged',
  EXTENDED: 'undertaking.due.extended',
  SCANNED: 'undertaking.register.scanned',
});
export const UDT_EVENT_PREFIX = 'undertaking.';

/**
 * SIX rights, every one re-proved inside the action when a record is named.
 *   READ      — any seat reads what it is a party to or holds; the register-wide
 *               rate is withheld whole when any row is hidden.
 *   DECLARE   — an executive (rank 4+) declares a promise the entity has given.
 *               A promise is not invented by a rule; it is recorded by the seat
 *               that answers for it.
 *   ASSIGN    — the declarer names a holder and a deliverable on one line. The
 *               holder is named, never inferred from org position.
 *   DELIVER   — the line's holder asserts the deliverable in their own name.
 *   VERIFY    — a seat STRICTLY ABOVE the holder on the reporting graph
 *               independently confirms or rejects. The deliverer never grades
 *               their own work.
 *   REPORT    — the accountable executive records that the counterparty was
 *               told, in writing, and records the acknowledgement.
 */
export const UDT_RIGHTS = Object.freeze({
  READ: 'read-undertakings',
  DECLARE: 'declare-undertaking',
  ASSIGN: 'assign-undertaking-line',
  DELIVER: 'deliver-undertaking-line',
  VERIFY: 'verify-undertaking-line',
  REPORT: 'report-undertaking-closure',
});

export const UDT_SECTION_TITLES = Object.freeze({
  rows: 'Undertakings',
  lines: 'Obligation lines',
  counts: 'Counts, days and closure rates',
  refusals: 'Refused acts',
  method: 'Method & limits',
});

/**
 * The pause switch, named by its literal key so the pause-permit census can
 * grep it. Silencing this rule leaves an overdue line untested and an
 * unreported promise unasked — and the counterparty outside the organisation
 * is told nothing, which is exactly the failure the register exists for.
 */
export const UDT_PAUSE_SWITCH = 'undertakingAutoPropagate';
export const UDT_DEFAULTS = Object.freeze({ autoPropagate: true });

export function normalizeUndertakingSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { [UDT_PAUSE_SWITCH]: s[UDT_PAUSE_SWITCH] !== false };
}

export const UDT_METHOD = Object.freeze({
  engine: UDT_ENGINE_VERSION,
  adr: UDT_ADR,
  frameworks: Object.freeze([
    'Three Lines Model (IIA, 2020) applied to an OUTWARD promise: the line that owns the deliverable asserts it, and a seat that holds no part of the delivery independently confirms it. A promise that closes on its deliverer’s word is a claim, not a discharge.',
    'Regulatory-commitment closure doctrine (IOSCO / FCA supervisory practice; COSO 2013 monitoring): an undertaking is discharged when the work is done AND the supervisor has been informed in writing. The register keeps DELIVERED, CONFIRMED and REPORTED apart on the record, and `reported-met` is the only state that asserts all three.',
    'Deadline gating (operations, and the same doctrine as ADR-0233): a due day that passes with no report reads `lapsed-unreported` with the consequence named. Nothing is met, closed or extended by the passage of time.',
    'Management-representation and sub-certification discipline (PCAOB AS 2201; SOX §302/906 in spirit): a representation is given over a DECLARED scope, by a named seat, with a date — never inferred from a control’s existence. The register stores the declared scope and the declared instrument and looks no jurisdiction up.',
    'Matrix accountability (ADR-0140, ADR-0226): a licence condition lands on several lines at once. Each line carries its own named holder, deliverable and day; the seat answerable for the whole promise is the JOINT APEX ABOVE EVERY LINE, computed from the graph and never chosen by the actor, and `no-authority` is printed where no such seat exists rather than promoting an unrelated manager.',
    'Procedural-fairness doctrine: the register records dated acts in words and closed vocabularies and never computes a compliance score, a maturity rating or a per-team league table. The weighing of a deliverable is the independent seat’s recorded verdict, with their name on it.',
  ]),
  invariants: Object.freeze([
    'An undertaking is declared once, by an executive (rank 4+) in their own name, with a named counterparty, a closed-list counterparty kind, a closed-list instrument, a declared scope and a due day. The declared identity is never edited; a correction is a new undertaking.',
    'Every obligation line names its holder at declaration or by a later assign act. A holder is named by a human, never inferred from org position, tenure or the reporting graph.',
    'A line’s deliverable is asserted by that line’s holder in their own name. One assertion per line; a second is refused and the first stands until it is tested.',
    'A line’s deliverable is confirmed or rejected only from a seat STRICTLY ABOVE the holder on the reporting graph — never the holder, never below them, never an unrelated branch. The person who delivers does not grade.',
    'A counterparty report is refused until EVERY line is confirmed. Reporting a promise as met while one line is untested is the exact substitution this register exists to prevent.',
    'A counterparty report may not predate the last confirmation on the record, and must name the written instrument by which the counterparty was told.',
    'An EXTEND is refused on an instrument whose date is not the entity’s alone to move unless the counterparty’s own agreement is recorded; refused if it does not move the due day forward; refused past the declared horizon; and refused after the due day has passed (a lapsed promise is not un-lapsed by moving the date).',
    'A counterparty acknowledgement is recorded once, after a report, and never before it.',
    'Counts are re-derived from stored records on every read. `partitionReconciles` (the printed state counts add to the undertaking total) and `figuresComplete` (no refused act, no dropped row, no unresolved holder) are reported apart — neither implies the other.',
    'This register does not verify that a cited instrument, correspondence or counterparty exists outside the workspace. References are declared, not checked, and the method note says so.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No compliance score, no maturity rating, no league table, no “percentage of promises kept” per team, per line or per person. The register counts undertakings, lines, acts and days.',
    'No inference of an undertaking from an assurance finding, a risk statement, a board memo, a contract record or a jurisdiction database. A promise is a human declaration naming the counterparty, the instrument and the date.',
    'No automatic closure, no automatic report, no automatic extension. The rule asks; it never reports a promise to a regulator on anybody’s behalf.',
    'No document generation. The report act records the day, the instrument reference and the acknowledgement; the register does not draft or send the letter.',
    'No jurisdiction lookup. The register stores declared terms and enforces internal consistency; it is not legal advice and knows no statutory deadline.',
    'No per-counterparty volume revealing a relationship the register’s privacy floor withholds. Aggregate counts only, and a cell below the floor of three is blank with its reason.',
  ]),
});

/* ------------------------------------------------------------------- CSV */

/**
 * CSV scope #177 (ADR-0234, Schema v189). Aggregate and identity-free: one
 * summary row, one coverage row, one row per derived state, per counterparty
 * kind, per instrument, per due-window bucket, one rate row and one row for
 * the report/acknowledgement position. No undertaking id, counterparty name,
 * scope, deliverable, instrument reference, holder, verifier or reporter name
 * crosses this boundary; a cell below the privacy floor exports BLANK with its
 * reason, never zero.
 */
export const UDT_CSV_SCOPE = 'undertakings';

export const UDT_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'state', 'counterparty_kind',
  'undertakings', 'open', 'reported', 'lapsed',
  'closing', 'unreported', 'rejected', 'disputed',
  'owed', 'on_time', 'on_time_rate_bp', 'blank_reason',
]);

export const UDT_CSV_DESCRIPTOR = Object.freeze({
  key: UDT_CSV_SCOPE,
  label: 'Regulatory undertaking & outward-commitment closure register (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'undertakings',
  description: 'One summary row, one coverage row, one row per derived state, per counterparty kind, per instrument and per due-window bucket, plus the closure-rate and report rows, all as exact integer counts over the whole register. No undertaking id, counterparty name, scope, deliverable, instrument reference or person name is exported; a rate whose denominator is not published exports blank with its reason, never zero.',
});
