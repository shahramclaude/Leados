/**
 * app/core/domain/mutualAidRegistry.js — the closed vocabulary of the Mutual-Aid
 * Activation & Resource-Commitment Register (ADR-0244, Schema v198,
 * `#/mutual-aid`, `RULE-MAA-01`, CSV scope #185).
 *
 * THE DUTY, IN A DIRECTOR'S WORDS. *"We called the neighbouring plant at six in
 * the morning and asked for two responders and a pump. Their duty officer said
 * he would 'see what he could do'. By noon we had a pump that had never been
 * promised and two responders who never came, and the incident commander was
 * still planning around help that was never accepted. When the pump eventually
 * left, nobody recorded that the commitment was released, and three weeks later
 * their invoice for 'standby' arrived."*
 *
 * No surface in this workspace could answer any part of that. ADR-0240
 * (`#/incidents`) starts at the incident and works inward — who declared it,
 * who commanded it, which notification clocks ran. ADR-0242 starts at the
 * unaccompanied person. NEITHER records the outward mutual-aid transaction: the
 * bilateral agreement under which help may be asked for, the request itself, the
 * external provider's EXPLICIT acceptance with the resources it promised, the
 * arrival of those resources against the promise, and the withdrawal and release
 * of the commitment when the help leaves.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. The Session 322
 * hunt logged this gap after word-boundary searches of `app/core/domain` and
 * ROADMAP for `mutual-aid`, `mutual aid`, `reciprocal-aid`, `backup-agreement`
 * and `aid-partner` returned no exact matches. Wider absence **[UNVERIFIED]**.
 *
 * THE FOUR FAILURE MODES THIS REGISTER EXISTS TO REFUSE.
 *   1. ACCEPTANCE INFERRED FROM A REQUEST. A partner who received a request has
 *      agreed to nothing. The register stores the partner's own dated acceptance,
 *      cited to the partner's written confirmation, with the promised resources
 *      and arrival day. There is no state in which a request reads as accepted.
 *   2. A PROMISE WITH NO NAMED HAND AND NO RESOURCES. An acceptance that cannot
 *      say who accepted, what was promised and when it would arrive is a promise
 *      nobody can be held to.
 *   3. ARRIVAL WITHOUT A PROMISE. Help that arrived is compared line by line
 *      against what was promised: short arrivals print with the exact shortfall,
 *      late arrivals print with the exact days late. A commander watching a
 *      clock must never be planning around help that was never promised.
 *   4. WITHDRAWAL WITHOUT RELEASE. The help leaves (withdrawal) and the
 *      commitment ends (release). Release before withdrawal is an ordering
 *      breach the door refuses to create and the reader prints permanently; a
 *      withdrawal with no release past the declared grace is a dangling
 *      commitment the rule asks about.
 *
 * THE BENCHMARKED CATEGORY, AND WHERE IT STOPS [vendor documentation and
 * published framework material; hands-on parity UNVERIFIED]. Mutual-aid
 * coordination in emergency management — FEMA mutual-aid agreements and the
 * EMAC compact, the UK LRF/RELIEF mutual-aid framework, and incident-command
 * SaaS — sets the bar with three mechanics: a WRITTEN bilateral agreement, a
 * REQUEST with a defined validity, and a documented RESPONSE. None of them
 * stores the four facts this register separates: the acceptance as its own cited
 * act, the promise compared against the ask, the arrival compared against the
 * promise, and the withdrawal/release ordering. That separation is the point.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A request is made from named reporting
 * lines. The seat answerable for the request — and the seat every rule ask
 * reaches — is the JOINT APEX above those lines, computed through the ONE matrix
 * engine, never the requesting line on another line's behalf, and NEVER the
 * external partner, which is not a person on this graph and cannot be asked to
 * answer for itself. A person is counted once in every people figure.
 *
 * THE THREE THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - No partner, external hand or requesting line is ever scored, ranked or
 *     compared. A register that rates the organisations it depends on in an
 *     emergency is a register nobody will call in an emergency.
 *   - No default request validity. The window a request stays open awaiting an
 *     answer is declared per request; a validity the software chose would let a
 *     stale request read as live.
 *   - No inferred acceptance, inferred arrival, inferred release or inferred
 *     withdrawal. Every one of those is a dated human act on the record, or the
 *     register says it is not on the record.
 */

export const MAA_ENGINE_VERSION = 'mutual-aid-2026.11-v1';
export const MAA_ADR = 'ADR-0244';
export const MAA_RULE_ID = 'RULE-MAA-01';
export const MAA_ROUTE = 'mutual-aid';
export const MAA_HREF = '#/mutual-aid';
export const MAA_CSV_SCOPE = 'mutual-aid-activation';
export const MAA_MARKER_KIND = 'mutual-aid';
export const MAA_EVENT_PREFIX = 'mutualAid.';

export const MAA_EVENTS = Object.freeze({
  AGREEMENT_DECLARED: 'mutualAid.agreement.declared',
  REQUEST_OPENED: 'mutualAid.request.opened',
  ACCEPTANCE_RECORDED: 'mutualAid.acceptance.recorded',
  ARRIVAL_RECORDED: 'mutualAid.arrival.recorded',
  WITHDRAWAL_RECORDED: 'mutualAid.withdrawal.recorded',
  RELEASE_RECORDED: 'mutualAid.release.recorded',
  REQUEST_CANCELLED: 'mutualAid.request.cancelled',
  CONVENTIONS_SET: 'mutualAid.conventions.set',
  SCANNED: 'mutualAid.scan',
});

export const MAA_RIGHTS = Object.freeze({
  READ: 'read-mutual-aid',
  DECLARE: 'declare-mutual-aid',
});

export const MAA_SETTING_KEYS = Object.freeze({
  autoPropagate: 'maaAutoPropagate',
  privacyFloor: 'maaPrivacyFloor',
  releaseGraceDays: 'maaReleaseGraceDays',
});

export const MAA_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  releaseGraceDays: { min: 0, max: 60 },
});

export const MAA_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  releaseGraceDays: 7,
});

export const MAA_LIMITS = Object.freeze({
  agreements: 120,
  requests: 900,
  acceptances: 900,
  arrivals: 900,
  withdrawals: 900,
  releases: 900,
  markers: 400,
  /** A partner organisation's name: bounded and non-empty. */
  nameMin: 3,
  nameMax: 120,
  /** The subject of a request — what help is actually being asked for. */
  subjectMin: 12,
  subjectMax: 200,
  /** The written bilateral agreement a request is made under. */
  agreementRefMin: 16,
  /** The partner's own confirmation that it accepts. */
  confirmationRefMin: 12,
  textMin: 16,
  textMax: 600,
  /** A resource kind or a short label. */
  shortMin: 3,
  shortMax: 120,
  idMax: 120,
  /** Whole days a request stays open awaiting an acceptance. No default exists. */
  validityMin: 1,
  validityMax: 30,
  /** A promised or arrived quantity of one resource line. */
  quantityMin: 1,
  quantityMax: 1000,
  /** How far ahead a promised arrival day may be declared. */
  arrivalMaxAheadDays: 365,
  /** How far back a recorded act may be dated. */
  actMaxBackDays: 30,
  /** Rule asking. */
  askDueDays: 1,
  rowsShown: 60,
});

/** Rank that may read the register; above rank 3 the reader withholds names. */
export const MAA_READ_MIN_RANK = 1;
/**
 * Rank that may declare an agreement, open a request, record an acceptance, an
 * arrival, a withdrawal, a release or a cancellation.
 *
 * RANK 2, NOT 1: committing another organisation's resources — or recording that
 * they arrived, left or were released — is a line-holder's act. Rank 1 can read
 * the register; it cannot commit resources on a line it does not hold.
 */
export const MAA_DECLARE_MIN_RANK = 2;

/**
 * What kind of help a request asks for. A closed list: "whatever they can send"
 * is not a request.
 */
export const MAA_REQUEST_KINDS = Object.freeze([
  Object.freeze({ key: 'personnel', label: 'Personnel', says: 'People who will come and work under the agreement.' }),
  Object.freeze({ key: 'equipment', label: 'Equipment', says: 'Machinery, plant or tools the partner will send.' }),
  Object.freeze({ key: 'transport', label: 'Transport', says: 'Vehicles or logistics capacity the partner will provide.' }),
  Object.freeze({ key: 'specialist-advice', label: 'Specialist advice', says: 'Expert input the partner will give, on the day it is promised.' }),
]);
export const MAA_REQUEST_KIND_KEYS = Object.freeze(MAA_REQUEST_KINDS.map((row) => row.key));
export const MAA_REQUEST_KIND_BY_KEY = Object.freeze(Object.fromEntries(MAA_REQUEST_KINDS.map((row) => [row.key, row])));

/**
 * The fourteen request states. Each is a DIFFERENT FACT, and the register's
 * whole value is that it never folds one into another. `tone` colours the
 * badge; `says` is printed beneath it in the leader's language.
 *
 * The three `breach-` states are UNREACHABLE THROUGH THE DOOR — the commands
 * refuse to create them. They exist because an imported or hand-edited file can
 * carry one, and dropping it would erase the exact fact the register exists to
 * surface. The loader therefore keeps the row and the reader prints the breach,
 * permanently.
 */
export const MAA_STATES = Object.freeze([
  Object.freeze({
    key: 'breach-agreement-lapsed',
    label: 'Requested under an agreement that had expired',
    tone: 'bad',
    says: 'The request was made under a bilateral agreement whose declared term had already ended, so the partner was not bound to answer it. The register prints the agreement’s end day beside it and keeps the row rather than hiding the fact.',
  }),
  Object.freeze({
    key: 'breach-release-before-withdrawal',
    label: 'Released before the help left',
    tone: 'bad',
    says: 'The commitment was released on a day before the withdrawal that ends it. An act dated before the act it depends on is an ordering the door refuses to create and the register will not repair; both days stay printed.',
  }),
  Object.freeze({
    key: 'breach-cancelled-after-acceptance',
    label: 'Cancelled after the partner accepted',
    tone: 'bad',
    says: 'The request was cancelled on a day after the partner’s acceptance. A cancellation can only close a request that was still awaiting an answer; both days stay printed.',
  }),
  Object.freeze({
    key: 'cancelled',
    label: 'Cancelled before any acceptance',
    tone: 'neutral',
    says: 'The requesting side cancelled the request before the partner accepted it. The request closes here and no commitment was ever created.',
  }),
  Object.freeze({
    key: 'not-arrived-overdue',
    label: 'Promised help has not arrived',
    tone: 'bad',
    says: 'The partner accepted and named a promised arrival day, that day has passed, and no arrival is on the record. This is the state the register exists to refuse to hide: the exact days past the promise stay printed, and the rule asks the joint seat above the requesting lines.',
  }),
  Object.freeze({
    key: 'withdrawn',
    label: 'Help left, release owed',
    tone: 'warn',
    says: 'The partner’s help has withdrawn and the release that ends the commitment is still owed. The exact days past the declared grace stay printed.',
  }),
  Object.freeze({
    key: 'arrived-late',
    label: 'Help arrived after the promised day',
    tone: 'warn',
    says: 'The promised help arrived, but after the day the partner named. The arrival is kept and the exact days late stay printed beside it — the lateness happened.',
  }),
  Object.freeze({
    key: 'arrived-partial',
    label: 'Help arrived short of the promise',
    tone: 'warn',
    says: 'The promised help arrived, but not in full: the exact shortfall per resource line stays printed. A commander must never plan around help that was promised and did not come complete.',
  }),
  Object.freeze({
    key: 'arrived-complete',
    label: 'Help arrived as promised',
    tone: 'good',
    says: 'The promised help arrived in full, on or before the day the partner named. The commitment ends when the withdrawal and release are recorded.',
  }),
  Object.freeze({
    key: 'accepted-differently',
    label: 'Accepted, but not as asked',
    tone: 'warn',
    says: 'The partner accepted, but the promise does not cover what was asked for. The exact shortfall per resource line stays printed: the partner answered a different question than the one that was put.',
  }),
  Object.freeze({
    key: 'awaiting-arrival',
    label: 'Accepted, help on its way',
    tone: 'neutral',
    says: 'The partner has accepted and named a promised arrival day that has not yet passed. The exact days to the promise stay printed.',
  }),
  Object.freeze({
    key: 'request-lapsed',
    label: 'Request window closed, no acceptance',
    tone: 'bad',
    says: 'The declared validity of the request ran out with no acceptance on the record. A request nobody answered is not a promise, and the register does not read it as one.',
  }),
  Object.freeze({
    key: 'awaiting-acceptance',
    label: 'Awaiting the partner’s answer',
    tone: 'neutral',
    says: 'The request is open and inside its declared validity. The exact days left stay printed.',
  }),
  Object.freeze({
    key: 'requested',
    label: 'Request sent',
    tone: 'neutral',
    says: 'The request is open and awaiting the partner’s answer. Nothing has been promised yet, and the register never reads a request as a promise.',
  }),
]);
export const MAA_STATE_KEYS = Object.freeze(MAA_STATES.map((row) => row.key));
export const MAA_STATE_BY_KEY = Object.freeze(Object.fromEntries(MAA_STATES.map((row) => [row.key, row])));
export const MAA_OPEN_STATE_KEYS = Object.freeze(MAA_STATE_KEYS.filter((key) => ![
  'cancelled', 'arrived-complete', 'arrived-partial', 'arrived-late', 'withdrawn', 'released-closed',
].includes(key)));

/** The three request states that mean a commitment has ended and been closed. */
export const MAA_CLOSED_STATE_KEYS = Object.freeze(['cancelled', 'arrived-complete', 'arrived-partial', 'arrived-late']);

/** Refusals printed at the door. Each one is a control, not a message. */
export const MAA_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That line is not one this seat holds. One line does not commit another line’s request for help.',
  noLine: 'Name at least one reporting line the request is made from. A request no line owns is a commitment nobody answers for.',
  agreementLapsed: 'That agreement’s declared term has already ended. The partner is not bound to answer a request made under an agreement that expired; declare a new agreement.',
  alreadyAccepted: 'That request already carries the partner’s acceptance. A second acceptance would overwrite a promise somebody made; record the arrival instead.',
  alreadyArrived: 'That acceptance already carries an arrival record. One arrival per promise: a second would overwrite the day the help actually came.',
  alreadyWithdrawn: 'That acceptance has already been withdrawn. The help left once, and the record keeps that day.',
  alreadyReleased: 'That commitment has already been released. A release ends the commitment; it is recorded once.',
  alreadyCancelled: 'That request has already been cancelled. A cancellation closes a request once.',
});

export const MAA_SECTION_TITLES = Object.freeze({
  board: 'Board',
  requests: 'Requests',
  lines: 'Lines',
  method: 'Method',
});

export const MAA_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'agreements_n', 'live_agreements_n', 'expired_agreements_n',
  'requests_n', 'requested_n', 'awaiting_acceptance_n', 'request_lapsed_n', 'cancelled_n',
  'acceptances_n', 'accepted_as_asked_n', 'accepted_differently_n', 'awaiting_arrival_n',
  'not_arrived_overdue_n', 'arrivals_n', 'arrived_complete_n', 'arrived_partial_n',
  'arrived_late_n', 'withdrawals_n', 'withdrawn_n', 'releases_n', 'breaches_n',
  'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #185 (ADR-0244, Schema v198). IDENTITY-FREE BY CONSTRUCTION. A mutual-aid
 * record names partner organisations, external people, bilateral agreement
 * references and the words of a request. The export therefore carries counts and
 * state keys only: no partner name, no agreement reference, no request subject,
 * no confirmation reference, no external hand, no resource line and no day.
 * State keys are a published vocabulary, so a reader can see which kind of
 * failure the workspace is carrying without being able to attach one to an
 * outside organisation or to a person.
 */
export const MAA_CSV_DESCRIPTOR = Object.freeze({
  key: MAA_CSV_SCOPE,
  label: 'Mutual-aid activation (aggregate)',
  group: 'operations',
  sensitive: true,
  filenameSlug: 'mutual-aid-activation',
  description: 'One summary row and one row per printed request state. Counts of bilateral agreements live and expired, requests by state, acceptances as asked and accepted differently, awaiting arrival, promised help not arrived, arrivals complete, partial and late, withdrawals, withdrawals without release, releases and ordering breaches. No partner name, agreement reference, request subject, confirmation reference, external hand, resource line or day is exported.',
});

/** The published framework basis, printed on the method tab. Never a claim of parity. */
export const MAA_METHOD = Object.freeze({
  engine: MAA_ENGINE_VERSION,
  adr: MAA_ADR,
  frameworks: Object.freeze([
    'Mutual-aid doctrine in emergency management (FEMA mutual-aid agreements and the Emergency Management Assistance Compact; the UK Local Resilience Forum / RELIEF mutual-aid framework): help between organisations rests on a WRITTEN bilateral agreement, a request with a defined validity, and a documented response — and acceptance is a separate act from the request that elicited it.',
    'Contract and commitment law on offer and acceptance: a request is an invitation to perform; the partner’s acceptance, cited to its own confirmation, is the act that creates the commitment. The register never reads the request as the acceptance.',
    'Incident command (ADR-0240): the commander plans on declared facts. A promised arrival day is a declared fact; the register prints the day the promise was made, the day the help was promised, and what actually arrived against it.',
    'Commitment closure discipline (the workspace’s own undertaking register, ADR-0234): what is promised outward is closed by a dated act, and an act dated before the act it depends on is a breach, not a shortcut.',
  ]),
  printed: Object.freeze([
    'The written bilateral agreement each request is made under, and whether it was live on the day the request was opened.',
    'The declared validity of each request, the day it closed, and the exact days left or lapsed.',
    'The partner’s acceptance as its own dated act, cited to the partner’s own written confirmation, with the promised resources and arrival day.',
    'The promise compared against the ask line by line, and the arrival compared against the promise line by line, with exact shortfalls and exact days late.',
    'The withdrawal that ends the help and the release that ends the commitment, in order, with the exact days past the declared grace.',
    'The joint reporting seat above the lines a request was made from, and never the partner as an addressee.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No acceptance, arrival, withdrawal or release inferred from a request, a reply, a prior arrangement or a job title: each is a dated act on the record or the register says it is not on the record.',
    'No default request validity: the window is declared per request from the situation the request was made in.',
    'No scoring, ranking or comparison of a partner organisation, an external hand or a requesting line. A register that rates the organisations it depends on in an emergency is a register nobody will call.',
    'No automatic acceptance, arrival, withdrawal, release or cancellation, and no repair of an imported act that precedes the act it depends on.',
    'No partner identity in the export: the boundary carries counts and state keys only.',
  ]),
});
