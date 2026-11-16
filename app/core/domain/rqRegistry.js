/**
 * app/core/domain/rqRegistry.js — closed vocabulary for the Regulator
 * Information-Request & Examination Response Register (ADR-0235,
 * `RULE-RQR-01`, `#/information-requests`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Somebody with authority over the entity
 * has ASKED it something: an information request from a supervisor, an
 * examination scope letter, a formal demand for document production, a data
 * protection query, a safety inspector's notice. The ask has a date on it, the
 * date to reply comes from the ask itself, and the answer is assembled by
 * several lines of the organisation at once.
 *
 * This is the mirror image of ADR-0234 and it fails in its own three ways:
 *
 *   1. SOMETHING IS WITHHELD AND NOBODY EVER TESTED THE WITHHOLDING. A line
 *      marks a swathe of its material privileged — or simply produces less
 *      than it found — and the file goes out. A privilege log the producer
 *      also certifies is not a control; it is the producer's word. This register
 *      makes the completeness assertion and the privilege claim two facts, and
 *      makes the second one REVIEWABLE by a seat that produced nothing.
 *   2. THE FILE IS OUT THE DOOR WITHOUT AN INDEPENDENT COMPLETENESS REVIEW.
 *      The regulator receives a production that was assembled and shipped by
 *      the same hands. The register refuses a release until every line has been
 *      reviewed by a seat that is not a party to the request.
 *   3. THE REPLY DAY PASSES QUIETLY. The clock the supervisor set runs out and
 *      the organisation finds out from the follow-up letter. The register prints
 *      `reply-lapsed` and never converts a passed day into an answered request.
 *
 * THREE FACTS, KEPT APART FOREVER. Every read carries three distinct booleans
 * and never collapses them into one reassuring word:
 *
 *   PRODUCED — the line's named holder asserts what that line searched, what it
 *              found, and that the list is COMPLETE. In their own name, with a
 *              dated method. Nobody asserts on somebody else's line.
 *   REVIEWED — a seat that produced NOTHING on this request confirms the line is
 *              complete and rules on any privilege claim, or refuses it. Rank is
 *              not the test; non-participation is.
 *   RELEASED — the seat that received the request records that the production
 *              went to the requester, in writing, on a day, under a named
 *              transmission. REFUSED until every line has been reviewed.
 *
 * A request is `released-answered` only when the requester has also received and
 * accepted the release. Everything short of that reads as exactly what it is.
 *
 * THE CLOCK IS NOT OURS TO SET. `replyClockDays` is declared — read off the
 * instrument and typed in — and the register REFUSES to infer it from a
 * convention, a jurisdiction table or a similar past request. There is no
 * jurisdiction table in this workspace, and inventing a statutory deadline would
 * be inventing a fact.
 *
 * THE MATRIX IS THE POINT. A document production lands on operations, legal,
 * finance and IT at once, held by different people under different managers. So
 * a request carries ONE OR MORE PRODUCTION LINES, each with its own named holder
 * and its own method — never invented, never inferred from org position. The
 * seat answerable for the whole response is the JOINT APEX above every line's
 * holder, computed from the graph and never chosen by the actor; where no such
 * seat exists the register prints `no-authority` and asks nobody.
 *
 * TWO DOCTRINES, CARRIED FROM THE HOUSE RULES.
 *   NO SCORE ON A PERSON OR A LINE. The register counts requests, lines, acts,
 *   privilege claims and days. It never computes a responsiveness score, a
 *   cooperation rating or a per-team league table — a function that produced
 *   less is not therefore a function at fault, and the register will not pretend
 *   to know the difference.
 *   THE DAY NEVER DECIDES. A passed reply day reads `reply-lapsed` with the
 *   consequence named. Nothing is answered, extended or cleared by the passage
 *   of time; only a dated human act moves a request.
 *
 * The register states nothing about a person beyond the line they hold: no
 * volume, no rate over people, no ranking.
 */

export const RQR_ENGINE_VERSION = 'information-request-production-2026.11-v1';
export const RQR_ADR = 'ADR-0235';
export const RQR_RULE_ID = 'RULE-RQR-01';
export const RQR_ROUTE = 'information-requests';
export const RQR_HREF = '#/information-requests';
export const RQR_ENTITY = 'informationrequest';
export const RQR_MARKER_KIND = 'informationrequest';

export const RQR_LIMITS = Object.freeze({
  requests: 200,
  acts: 4000,
  markers: 400,
  /** Production lines one demand may carry. Above four the ask is a programme
   * of work, and a programme is not a production with one reply day. */
  linesMin: 1,
  linesMax: 4,
  refMin: 3,
  refMax: 80,
  textMin: 24,
  textMax: 600,
  requesterMin: 3,
  requesterMax: 120,
  /** The declared reply clock must be a real number of days. The register knows
   * no jurisdiction, so it bounds the DECLARATION, never supplies one. */
  clockMinDays: 1,
  clockMaxDays: 365,
  /** How far ahead a reply day may sit from the day the ask is recorded. */
  horizonMaxDays: 3650,
  /** How close to the reply day the "release owed" flag fires. */
  closingWindowDays: 14,
  /** How long after the last review the release to the requester is chased. */
  releaseChaseDays: 5,
  /** Rank that may record an inbound demand from an authority, and release and
   * respond to it. This is the seat that signs the covering letter. */
  receiveMinRank: 3,
  privacyFloor: 3,
  askDueDays: 2,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/**
 * WHO asked. A closed list, because the requester decides what an extension
 * costs, what a refusal to produce exposes the entity to, and who has to be
 * told when the day passes — and the register must print the difference rather
 * than average it.
 */
export const RQR_REQUESTER_KINDS = Object.freeze([
  Object.freeze({ key: 'supervisor', label: 'Financial / prudential supervisor', note: 'A supervisory authority with examination and enforcement powers over the entity.' }),
  Object.freeze({ key: 'market', label: 'Market or conduct regulator', note: 'A body regulating conduct in a market the entity operates in.' }),
  Object.freeze({ key: 'tax', label: 'Tax authority', note: 'A revenue or customs authority making an assessment or transfer-pricing demand.' }),
  Object.freeze({ key: 'data-protection', label: 'Data protection authority', note: 'A privacy regulator, including a supervisory authority under a data-protection regime.' }),
  Object.freeze({ key: 'safety', label: 'Health & safety / environment inspector', note: 'An inspectorate with powers over premises, process or environmental performance.' }),
  Object.freeze({ key: 'audit', label: 'External auditor / certification body', note: 'A body examining the entity under an engagement or a certificate it holds.' }),
  Object.freeze({ key: 'court', label: 'Court, tribunal or law-enforcement demand', note: 'A compelled production: an order, a subpoena, a notice from an investigator.' }),
  Object.freeze({ key: 'parent', label: 'Group parent / internal audit of the group', note: 'A demand from above the entity in the group, or from group assurance.' }),
]);
export const RQR_REQUESTER_KEYS = Object.freeze(RQR_REQUESTER_KINDS.map((row) => row.key));

/**
 * The INSTRUMENT the demand arrived under. Closed, because only some of them
 * can be moved by agreement with the requester at all, and the register refuses
 * an extension on a compelled instrument without the requester's own recorded
 * agreement.
 */
export const RQR_INSTRUMENTS = Object.freeze([
  Object.freeze({ key: 'information-request', label: 'Supervisory information request', movableByAgreement: true, note: 'A written demand for information from a supervisor. Its clock is the supervisor’s.' }),
  Object.freeze({ key: 'examination-scope', label: 'Examination scope letter', movableByAgreement: true, note: 'The scoping document of an examination, including the material it demands and when.' }),
  Object.freeze({ key: 'production-notice', label: 'Document production notice / subpoena', movableByAgreement: false, note: 'A compelled production. The date is not the entity’s to move, and not its alone to extend by agreement either.' }),
  Object.freeze({ key: 'data-query', label: 'Data subject / privacy query', movableByAgreement: true, note: 'A query or complaint-driven demand for records about personal data.' }),
  Object.freeze({ key: 'safety-notice', label: 'Inspector notice / demand', movableByAgreement: true, note: 'A demand issued by an inspectorate under a notice power.' }),
  Object.freeze({ key: 'audit-request', label: 'Audit / assurance request', movableByAgreement: true, note: 'A request for evidence or representation support inside an engagement.' }),
]);
export const RQR_INSTRUMENT_KEYS = Object.freeze(RQR_INSTRUMENTS.map((row) => row.key));

/** True when the instrument's day may be moved only by agreement with the requester. */
export const rqrInstrumentIsCompelled = (key) => RQR_INSTRUMENTS.find((row) => row.key === key)?.movableByAgreement === false;

/**
 * THE ONE REVIEW-ELIGIBILITY TEST, defined here because this file imports
 * nothing and every surface must read the SAME rule: the kernel (to decide
 * whether an unreviewable production exists), the reader (to badge a seat), the
 * action (to accept or refuse a review) and the panel (to say who it will let
 * review). Two copies of this test is how a register ends up offering a seat a
 * review it then refuses — or refusing one it promised.
 *
 * THREE TESTS, IN THIS ORDER:
 *   1. NON-PARTICIPATION, the hard gate. Whoever recorded the demand, produces
 *      any line, or holds any act on the ledger is a party and cannot review.
 *      The producer's own clearance of their own withholding is worth nothing to
 *      the requester, however senior the producer is — which is exactly the
 *      failure a bare privilege log hides.
 *   2. GRAPH CONNECTION. The reviewer must sit in the producers' connected
 *      reporting graph (above a producer, or reachable down from one), so the
 *      review's standing is checkable and nobody reviews from a branch that
 *      could not compel a re-production.
 *   3. STANDING, NOT RANK. The reviewer must hold rank at or above the LEAST
 *      senior producer, so an individual contributor is never told to grade their
 *      own manager's production. This is a floor, not a ceiling: a specialist on
 *      another line with equal standing MAY review, which is how privilege review
 *      actually works and how a matrix works.
 *
 * Returns `{ allow: true }` or `{ allow: false, reason }` — `reason` is printed,
 * never swallowed.
 */
export function rqrReviewEligibility(matrix, candidateId, row) {
  if (!matrix || !row) return { allow: false, reason: 'no-graph' };
  if (!candidateId) return { allow: false, reason: 'no-actor' };
  const parties = Array.isArray(row.partyIds) ? row.partyIds : [];
  if (parties.includes(candidateId)) return { allow: false, reason: 'party' };
  const producers = [...new Set((row.lines || []).map((line) => line.producerId).filter(Boolean))];
  if (!producers.length) return { allow: false, reason: 'unstaffed' };
  const node = matrix.nodes?.get?.(candidateId);
  if (!node) return { allow: false, reason: 'not-on-graph' };
  const connected = producers.some((id) => {
    const producerNode = matrix.nodes?.get?.(id);
    if (!producerNode) return false;
    return producerNode.ancestors.has(candidateId) || node.descendants.has(id);
  });
  if (!connected) return { allow: false, reason: 'disconnected' };
  const ranks = producers.map((id) => Number(matrix.nodes?.get?.(id)?.rank ?? 0));
  if (Number(node.rank ?? 0) < Math.min(...ranks)) return { allow: false, reason: 'no-standing' };
  return { allow: true, reason: null };
}

/**
 * Derived request states. Nothing stores a state; every one is re-read from the
 * acts and the live reporting graph on every call, and the precedence is the
 * ORDER OF THIS LIST — so the kernel, the panel, the rule and the CSV cannot
 * disagree about which fact wins.
 *
 *   lapsed wins over everything: the day the requester set has gone and nothing
 *   has been released, and that is the fact the requester experiences.
 *   insufficient wins over released: a production the requester does not accept
 *   is not an answered request, whatever was sent.
 *   refused wins over released: an independent seat has found a line incomplete,
 *   or has struck out a privilege claim. The register will not print the
 *   reassuring word over the tested fact.
 */
export const RQR_STATES = Object.freeze([
  Object.freeze({ key: 'reply-lapsed', label: 'Reply day passed — nothing has been released to the requester' }),
  Object.freeze({ key: 'reply-insufficient', label: 'Found insufficient — the requester does not accept the production as answering the ask' }),
  Object.freeze({ key: 'refused', label: 'Refused in review — an independent seat found a line incomplete, or struck out its privilege claim' }),
  Object.freeze({ key: 'released-answered', label: 'Answered — every line reviewed, the production released, and the requester records it as received and complete' }),
  Object.freeze({ key: 'cleared-unreleased', label: 'Reviewed, unreleased — every line is independently reviewed and the requester has not been sent anything' }),
  Object.freeze({ key: 'produced-unreviewed', label: 'Produced, unreviewed — a line asserts its production; no independent completeness review is on the record' }),
  Object.freeze({ key: 'working', label: 'In progress — the lines are staffed; nothing is produced yet' }),
  Object.freeze({ key: 'received', label: 'Received — none of the production lines carries a named holder yet' }),
]);
export const RQR_STATE_KEYS = Object.freeze(RQR_STATES.map((row) => row.key));

/** Per-line states — the parts the request's state is built from. */
export const RQR_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'unassigned', label: 'The line has named no producer yet' }),
  Object.freeze({ key: 'working', label: 'A producer is named and nothing has been asserted' }),
  Object.freeze({ key: 'produced', label: 'The holder asserts what it searched, found and withheld — an independent review is owed' }),
  Object.freeze({ key: 'cleared', label: 'A seat that produced nothing confirmed completeness and ruled on the privilege claim' }),
  Object.freeze({ key: 'refused', label: 'A seat that produced nothing found the line incomplete, or struck out its privilege claim' }),
]);
export const RQR_LINE_STATE_KEYS = Object.freeze(RQR_LINE_STATES.map((row) => row.key));

/**
 * The one closed verdict a completeness review can return on a line. A third
 * word — "roughly" — is deliberately absent: a partly-checked production is an
 * unreviewed production, and the register says so.
 */
export const RQR_REVIEW_VERDICTS = Object.freeze(['clear', 'refuse']);

/**
 * The one closed verdict a review can return on a line's PRIVILEGE CLAIM. It
 * exists only where the producer claimed privilege. `refused` does not seize
 * anything and does not order a production: it removes the line's protection
 * claim from the record the requester is given, so the line can no longer be
 * released as privileged-and-complete while its withheld material stands
 * unaccounted for. A human then either produces it or the request is refused in
 * review.
 */
export const RQR_PRIVILEGE_OUTCOMES = Object.freeze(['sustain', 'refuse']);

/** How the declared lines sat against each other when the demand was RECORDED.
 * A production held by three lines under two managers has no single owner, and
 * the register prints that rather than picking one. */
export const RQR_ACCOUNTABILITY = Object.freeze([
  Object.freeze({ key: 'single-holder', label: 'One line, one holder — the response has a single accountable seat' }),
  Object.freeze({ key: 'joint-apex', label: 'Several lines under a common seat — the joint apex above them answers' }),
  Object.freeze({ key: 'no-authority', label: 'No seat above every line — no single seat answers, and none was invented' }),
]);
export const RQR_ACCOUNTABILITY_KEYS = Object.freeze(RQR_ACCOUNTABILITY.map((row) => row.key));

/** Whether the requester accepted the production. A closed list, never free
 * text: "they replied", "they want more" and "we have heard nothing" are three
 * different facts and the register never averages them. */
export const RQR_RESPONSES = Object.freeze([
  Object.freeze({ key: 'received-complete', label: 'Received and complete — the requester accepts the production as answering the ask' }),
  Object.freeze({ key: 'no-response', label: 'No response yet — released in writing, nothing back on the record' }),
  Object.freeze({ key: 'insufficient', label: 'Insufficient — the requester does not accept the production as answering the ask' }),
]);
export const RQR_RESPONSE_KEYS = Object.freeze(RQR_RESPONSES.map((row) => row.key));

/** Derived flags. Every one is a statement about the RECORD, never a rating. */
export const RQR_FLAGS = Object.freeze({
  /** No release on the record and the reply day is inside the closing window. */
  closing: 'release-window-closing',
  /** No release on the record and the reply day has passed. */
  lapsed: 'reply-lapsed',
  /** Every line reviewed and nothing released to the requester. */
  unreleased: 'reviewed-not-released',
  /** A line was refused in review. */
  refused: 'production-refused',
  /** The requester did not accept the production. */
  insufficient: 'production-insufficient',
  /** A line claims privilege that NO seat outside the producers has ever
   * reviewed. This is the state a bare privilege log hides, and the reason this
   * register exists alongside one. */
  privilegeUnreviewed: 'privilege-claim-unreviewed',
  /** A privilege claim was struck out in review, so the line's withheld material
   * is unaccounted for. Printed, never repaired. */
  privilegeRefused: 'privilege-claim-refused',
  /** A named line holder is no longer active on the roster. Printed, never repaired. */
  holderUnresolved: 'line-producer-not-active',
  /** No seat above every production line exists on the graph. Printed, never repaired. */
  noAuthority: 'no-authority-above-all-lines',
  /** The record holds no seat that can review a production independently of the
   * people who produced it. Printed, never repaired, and never waived. */
  noReviewer: 'no-independent-reviewer',
  /** A compelled instrument's day was moved without the requester's agreement
   * on the record. Printed, never repaired. */
  unilateralExtension: 'compelled-instrument-extended-unilaterally',
});

/**
 * SEVEN act kinds. `produce` and `review` are per-line; `release`, `respond` and
 * `extend` are request-level; `assign` staffs a line; `clock` records the
 * requester's OWN restatement of the reply day (a dated fact about the ask, not
 * an extension we granted ourselves).
 */
export const RQR_ACT_KINDS = Object.freeze(['assign', 'produce', 'review', 'release', 'respond', 'clock', 'extend']);

export const RQR_REFUSALS = Object.freeze({
  unknownRequest: 'unknown-information-request',
  notCapableSeat: 'not-a-capable-seat',
  requesterUnreadable: 'requester-unreadable',
  instrumentUnreadable: 'instrument-unreadable',
  scopeUnreadable: 'requested-scope-unreadable',
  clockUnreadable: 'reply-clock-unreadable',
  clockOutOfRange: 'reply-clock-out-of-range',
  replyDayUnreadable: 'reply-day-unreadable',
  duplicateLine: 'duplicate-production-line',
  lineOutOfRange: 'production-line-count-out-of-range',
  declaredLineUnresolved: 'declared-line-not-resolved',
  notLineProducer: 'not-the-producer-of-this-line',
  lineAlreadyAssigned: 'line-already-carries-a-producer',
  lineUnassigned: 'line-has-no-producer',
  producerInactive: 'line-producer-not-active',
  alreadyProduced: 'production-already-asserted',
  nothingToReview: 'nothing-produced-to-review',
  isParty: 'reviewer-is-a-party-to-this-request',
  notAboveAllHolders: 'reviewer-not-above-every-producer',
  noEligibleReviewer: 'no-seat-outside-the-producers',
  alreadyReviewed: 'production-already-reviewed',
  privilegeVerdictRequired: 'privilege-claim-needs-a-verdict',
  privilegeVerdictUnwanted: 'no-privilege-claim-on-this-line',
  releasesNothing: 'not-every-line-is-reviewed',
  notReceiver: 'not-the-seat-that-received-the-request',
  alreadyReleased: 'production-already-released',
  releaseBeforeReview: 'release-predates-the-review',
  transmissionUnreadable: 'transmission-reference-unreadable',
  respondBeforeRelease: 'no-release-to-respond-to',
  alreadyResponded: 'response-already-recorded',
  clockNotRestated: 'clock-not-restated-by-the-requester',
  clockRefusedNoReference: 'requester-restatement-uncited',
  extensionRefusedCompelled: 'compelled-instrument-may-not-be-extended-internally',
  extensionRefusedNoAgreement: 'extension-refused-without-requester-agreement',
  extensionNotForward: 'extension-does-not-move-the-reply-day-forward',
  extensionBeyondHorizon: 'extension-beyond-the-declared-horizon',
  extensionAfterDue: 'extension-refused-after-the-reply-day',
  alreadyClosed: 'request-already-answered',
  beforeDeclared: 'before-recorded',
  futureDated: 'future-dated',
  ledgerFull: 'ledger-full',
  unreadable: 'unreadable',
  noActor: 'no-actor',
});

export const RQR_EVENTS = Object.freeze({
  RECEIVED: 'informationrequest.received',
  ASSIGNED: 'informationrequest.line.assigned',
  PRODUCED: 'informationrequest.line.produced',
  REVIEWED: 'informationrequest.line.reviewed',
  RELEASED: 'informationrequest.released',
  RESPONDED: 'informationrequest.requester.responded',
  Clocked: 'informationrequest.clock.restated',
  EXTENDED: 'informationrequest.replyday.extended',
  SCANNED: 'informationrequest.register.scanned',
});
export const RQR_EVENT_PREFIX = 'informationrequest.';

/**
 * SIX rights, every one re-proved inside the action when a record is named.
 *   READ    — any seat reads what it is a party to or holds; the register-wide
 *             rate is withheld whole when any row is hidden.
 *   RECEIVE — a director seat (rank 3+) records that an authority has asked the
 *             entity something, with the requester's own clock. Nothing is
 *             inferred from a case, a risk or a calendar.
 *   ASSIGN  — the receiving seat names the producer of a line. A producer is
 *             named, never inferred from org position.
 *   PRODUCE — the line's named holder asserts what it searched, found and
 *             withheld, and whether it claims privilege over anything.
 *   REVIEW  — a seat that produced NOTHING on this request confirms completeness
 *             and rules on any privilege claim. Conflict, not rank, is the gate.
 *   RELEASE — the receiving seat records the release to the requester, the
 *             requester's own restatement of the clock, their response, and
 *             moves the day where the instrument allows it.
 */
export const RQR_RIGHTS = Object.freeze({
  READ: 'read-information-requests',
  RECEIVE: 'receive-information-request',
  ASSIGN: 'assign-information-request-line',
  PRODUCE: 'produce-information-request-line',
  REVIEW: 'review-information-request-production',
  RELEASE: 'release-information-request-production',
});

export const RQR_SECTION_TITLES = Object.freeze({
  rows: 'Information requests',
  lines: 'Production lines',
  counts: 'Counts, clocks and coverage',
  refusals: 'Refused acts',
  method: 'Method & limits',
});

/**
 * The pause switch, named by its literal key so the pause-permit census can grep
 * it. Silencing this rule leaves an unreviewed production unreferenced and a
 * reply day unasked — and the regulator is sent nothing, which is exactly the
 * failure the register exists for.
 */
export const RQR_PAUSE_SWITCH = 'informationRequestAutoPropagate';
export const RQR_DEFAULTS = Object.freeze({ autoPropagate: true });

export function normalizeInformationRequestSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { [RQR_PAUSE_SWITCH]: s[RQR_PAUSE_SWITCH] !== false };
}

export const RQR_METHOD = Object.freeze({
  engine: RQR_ENGINE_VERSION,
  adr: RQR_ADR,
  frameworks: Object.freeze([
    'Litigation-hold and document-production discipline (the Federal Rules of Civil Procedure 26/34 in shape, EDRM/SEDO document-production practice): production is a chain of dated acts — search, collect, review, log, produce — and the completeness certificate is given by the party that searched, never by the party that shipped. This register keeps PRODUCED, REVIEWED and RELEASED apart on the record and `released-answered` is the only state that asserts all three.',
    'Privilege-log doctrine (work-product and legal-advice privilege; the supervisory analogue in supervisory-book reporting): a claim of privilege is an ASSERTION by the withholding party that must be testable by somebody who withheld nothing. A privilege claim that no independent seat has ever reviewed is printed `privilege-claim-unreviewed` and never allowed to close a line.',
    'Three Lines Model (IIA, 2020) applied INWARD: the line that owns the material asserts what it found; a seat that holds no part of the production reviews it. Independence here is defined as NON-PARTICIPATION, not as rank — a review by the producer is structurally worthless however senior the producer is — with seniority retained as a floor so a review from an unrelated junior seat is not dressed up as assurance.',
    'Supervisory reporting and information-request practice (BCBS 239 lineage on timeliness and completeness of data to a supervisor; FCA/PRA information-request practice in shape): the reply day belongs to the requester. The register declares it from the instrument, refuses to infer it, and prints `reply-lapsed` when it passes. An extension is recorded only with the requester’s own written agreement or their own restatement of the clock.',
    'Matrix accountability (ADR-0140, ADR-0226): a demand lands on several lines at once. Each line carries its own named producer and method; the seat answerable for the whole response is the JOINT APEX above every line, computed from the graph and never chosen by the actor, and `no-authority` is printed where no such seat exists rather than promoting an unrelated manager.',
    'Procedural-fairness doctrine: the register records dated acts in words and closed vocabularies and never computes a cooperation score, a responsiveness rating or a per-team league table. The weighing of a production is the reviewer’s recorded verdict, with their name on it.',
  ]),
  invariants: Object.freeze([
    'A request is recorded once, by a director seat (rank 3+) in their own name, with a named requester, a closed-list requester kind, a closed-list instrument, a declared scope of what was asked, and a reply clock in whole days that is DECLARED from the instrument. The recorded identity is never edited; a correction is a new request.',
    'The reply day is derived once, from the day the ask was received plus the declared clock, and never re-guessed on read. The register knows no jurisdiction and supplies no deadline of its own.',
    'Every production line names its producer at recording or by a later assign act. A producer is named by a human, never inferred from org position, tenure or the reporting graph.',
    'A line’s production is asserted by that line’s producer in their own name, with a dated method, an item count that must be a real non-negative integer, and an explicit statement of whether the line is complete. A count of zero is allowed and reads as zero.',
    'A privilege claim is a separate, dated assertion on the line: the withheld count, the basis and the scope of the claim. A line claiming privilege it has never stated is refused, and a line stating a claim it cannot count is refused.',
    'A line is reviewed only by a seat that is NOT a party to the request — not the receiver, not a producer of any line, not anyone who asserted or tested a line. Where the graph names no such seat the review is refused and the register prints `no-independent-reviewer`; it does not waive the test and does not accept the producer’s own clearance.',
    'A release to the requester is refused until EVERY line has been reviewed. Releasing a production while one line is unreviewed is the exact substitution this register exists to prevent, and a release may not predate the last review.',
    'A compelled instrument’s day may not be moved at all by the entity alone; any other instrument may be moved only with the requester’s own recorded written agreement, never forward-only past the declared horizon, and never after the reply day has passed — a lapsed request is not un-lapsed by moving the date.',
    'A requester’s restatement of the clock (a granted extension, a moved date in a follow-up letter) is recorded only with the requester’s own dated reference, and only on the day they gave it. The register never converts a silent extension into a new deadline.',
    'Counts are re-derived from stored records on every read. `partitionReconciles` (the printed state counts add to the request total) and `figuresComplete` (no refused act, no dropped row, no unstaffed line, no unreviewed privilege claim) are reported apart — neither implies the other.',
    'This register does not verify that a cited requester, instrument, transmission or privilege basis exists outside the workspace, and it produces no documents. References are declared, not checked, and the method note says so.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No cooperation score, no responsiveness rating, no league table, no “percentage of requests answered on time” per team, per line or per person. The register counts requests, lines, acts, items and days.',
    'No inference of a request from a case, an assurance finding, a risk statement, a board minute, a contract or a calendar. An inbound demand is a dated human declaration naming the requester, the instrument and the clock.',
    'No jurisdiction table, no statutory deadline, no legal advice. The reply clock is typed from the instrument and bounded only as a declaration; nothing here looks up what a regulator’s deadline actually is.',
    'No document generation, no collection, no search, no technology-assisted review. The register records that a line searched, what it found and what it withheld; it never touches the material.',
    'No automatic release, no automatic extension, no automatic privilege clearance. The rule asks; it never sends anything to a regulator on anybody’s behalf.',
    'No per-requester volume revealing a relationship the register’s privacy floor withholds. Aggregate counts only, and a cell below the floor of three is blank with its reason.',
  ]),
});

/* ------------------------------------------------------------------- CSV */

/**
 * CSV scope #178 (ADR-0235, Schema v190). Aggregate and identity-free: one
 * summary row, one coverage row, one row per derived state, per requester kind,
 * per instrument, per reply-window bucket, one rate row, one privilege-position
 * row and one release-position row. No request id, requester name, scope,
 * method, transmission reference, producer, reviewer or receiver name crosses
 * this boundary; a cell below the privacy floor exports BLANK with its reason,
 * never zero.
 */
export const RQR_CSV_SCOPE = 'information-requests';

export const RQR_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'state', 'requester_kind',
  'requests', 'open', 'released', 'lapsed',
  'closing', 'unreleased', 'refused', 'insufficient',
  'owed', 'on_time', 'on_time_rate_bp', 'blank_reason',
]);

export const RQR_CSV_DESCRIPTOR = Object.freeze({
  key: RQR_CSV_SCOPE,
  label: 'Regulator information-request & examination response register (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'information-requests',
  description: 'One summary row, one coverage row, one row per derived state, per requester kind, per instrument and per reply-window bucket, plus the on-time-release rate and the privilege and release position rows, all as exact integer counts over the whole register. No request id, requester name, requested scope, search method, transmission reference, privilege basis or person name is exported; a rate whose denominator is not published exports blank with its reason, never zero.',
});
