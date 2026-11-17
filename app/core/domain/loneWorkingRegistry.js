/**
 * app/core/domain/loneWorkingRegistry.js — the closed vocabulary of the
 * Lone-Working Welfare Check Register (ADR-0242, Schema v196, `#/lone-working`,
 * `RULE-LWK-01`, CSV scope #183).
 *
 * THE DUTY, IN A FRONTLINE SUPERVISOR'S WORDS. *"Danny is on his own at the
 * substation until four. He radios in every hour and if he misses one I ring him,
 * then I ring his other manager, then I go out. Where is that written down? If I
 * go off shift at three, who picks it up — and how does anyone know he never came
 * back?"*
 *
 * No surface in this workspace could answer any part of that. The workspace could
 * already record whether a station is manned (`stationCoverage`), who covers a
 * duty while somebody is absent (`dutyCoverage`), the rest between two shifts
 * (`workRest`), and a functional limit somebody must not exceed
 * (`workplaceAdjustment`, ADR-0241 — whose own `lone-work` domain is RECORDED
 * AND NOT TESTABLE, because nothing in the record says whether the person was
 * ever alone). Every one of those assumes the person is either on a staffed site
 * or simply absent. None of them knows that a named human being is working alone
 * right now, when they were last heard from, and what happens at the exact minute
 * that contact is overdue.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `lone worker`,
 * `lone working`, `welfare check`, `roll call`, `man-down`, `panic` and `buddy
 * system`; the single surviving hit for `lone work` is ADR-0241's untestable
 * functional domain, which is a restriction somebody declared and not a
 * deployment anybody is monitoring. Wider absence **[UNVERIFIED]**.
 *
 * WHAT THE BENCHMARKED CATEGORY GETS RIGHT, AND WHERE IT STOPS. Dedicated
 * lone-worker protection platforms (PeopleSafe, StaySafe, Blackline Safety,
 * SoloProtect) and the HSE's lone-working guidance set the bar with the same
 * three mechanics [vendor documentation, hands-on parity UNVERIFIED]:
 *
 *   1. **A declared check-in interval, and a timer that runs from the last
 *      contact.** The interval is a decision somebody made about this task, this
 *      site and this person; it is never a default.
 *   2. **Escalation when the timer expires**, to a named responder, with the
 *      response itself recorded.
 *   3. **A record that survives the shift handover**, because the supervisor who
 *      set the timer is usually not the one on duty when it expires.
 *
 * WHAT THIS REGISTER ADDS THAT NO PRODUCT IN THE CATEGORY DOES — AND WHY IT IS
 * THE POINT RATHER THAN A FEATURE. A timer app knows a phone has not moved. It
 * cannot answer the two questions a matrix organisation actually fails:
 *
 *   - **Whose duty is it?** The person working alone usually holds more than one
 *     reporting line, and the line that sent them out is often not the line that
 *     owns the site. The ask therefore goes to the JOINT APEX above every line
 *     holding the person — never to one line on another's behalf — and it never
 *     goes to the person themselves, who is the one it protects.
 *   - **What does the record PROVE at this minute?** Late contact, a concern
 *     nobody answered, an unclosed deployment past its declared end and a closed
 *     deployment with no contact ever recorded are four DIFFERENT facts. This
 *     register prints them separately, with exact whole minutes, and never folds
 *     them into a reassuring "checked in".
 *
 * THE THREE THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No person is ever declared missing.** The strongest state this register
 *     will print is `welfare-unconfirmed`: the record does not know where anybody
 *     is and says so. Calling a colleague "missing" is a claim about the world
 *     that a records system cannot make and must not imply.
 *   - **No person and no line is scored.** The register counts deployments,
 *     contacts, late minutes and unconfirmed deployments. It never produces a
 *     per-person reliability figure, a "% checked in" league table or a
 *     named comparison — those turn a safety control into a reason not to radio
 *     in, which is the failure mode that kills people.
 *   - **No location tracking.** There is a declared SITE REFERENCE — the place a
 *     supervisor wrote down — and no coordinate, no movement trail, no device
 *     telemetry. The register is a duty record, not surveillance.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A deployment belongs to a PERSON and is
 * declared by ONE line holder. The reader therefore:
 *   - resolves every active reporting line that holds the person today, so the
 *     second line that also gives them work is never invisible;
 *   - addresses every rule ask to `matrixJointApex` over those lines;
 *   - counts a person ONCE in every people figure;
 *   - prints the declaring line beside the deployment, because "who sent them
 *     out" and "who answers for them now" are two different hands.
 */

export const LWK_ENGINE_VERSION = 'lone-working-2026.11-v1';
export const LWK_ADR = 'ADR-0242';
export const LWK_RULE_ID = 'RULE-LWK-01';
export const LWK_ROUTE = 'lone-working';
export const LWK_HREF = '#/lone-working';
export const LWK_CSV_SCOPE = 'lone-working-welfare';
export const LWK_MARKER_KIND = 'lone-working';
export const LWK_EVENT_PREFIX = 'loneWorking.';

export const LWK_EVENTS = Object.freeze({
  DEPLOYMENT_DECLARED: 'loneWorking.deployment.declared',
  CHECK_IN_RECORDED: 'loneWorking.checkIn.recorded',
  ESCALATION_RAISED: 'loneWorking.escalation.raised',
  DEPLOYMENT_CLOSED: 'loneWorking.deployment.closed',
  CONVENTIONS_SET: 'loneWorking.conventions.set',
  SCANNED: 'loneWorking.scan',
});

export const LWK_RIGHTS = Object.freeze({
  READ: 'read-lone-working',
  DECLARE: 'declare-lone-working',
});

export const LWK_SETTING_KEYS = Object.freeze({
  autoPropagate: 'lwkAutoPropagate',
  privacyFloor: 'lwkPrivacyFloor',
  horizonDays: 'lwkHorizonDays',
});

export const LWK_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  horizonDays: { min: 1, max: 90 },
});

export const LWK_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  horizonDays: 30,
});

export const LWK_LIMITS = Object.freeze({
  deployments: 600,
  checkins: 4000,
  escalations: 2000,
  markers: 400,
  /** A written reference that is shorter than this names nothing. */
  textMin: 24,
  textMax: 600,
  /** A site, a task or a basis: bounded and non-empty, never free prose. */
  shortMin: 3,
  shortMax: 120,
  /** The written lone-working assessment a deployment is declared against. */
  protocolMin: 12,
  idMax: 120,
  /** Whole minutes between contacts. Five is the shortest interval a human can honour. */
  intervalMin: 5,
  intervalMax: 1440,
  /** The grace after the deadline before the register says the contact is overdue. */
  graceMax: 120,
  /** How long one deployment may be declared to run. */
  spanMaxMinutes: 20_160,
  /** How far ahead a deployment may be planned, and how far back it may be recorded. */
  backfillMaxDays: 365,
  /** Rule asking. */
  askDueDays: 1,
  chaseDays: 1,
  rowsShown: 60,
});

/** Rank that may read the register. A person may always read their own deployment. */
export const LWK_READ_MIN_RANK = 1;
/**
 * Rank that may declare, check in on another's behalf, escalate and close out.
 *
 * RANK 1, DELIBERATELY. The actor this register exists for is the first-line
 * supervisor who sends somebody out alone and owns the welfare clock for the
 * shift. Gating the declaration above them would leave the one person who can
 * see the site unable to record the duty, and the register would hold nothing but
 * the failures nobody declared. What protects the record is not the rank: it is
 * the written-protocol requirement, the `holdsPerson` reach, the refusal of
 * self-declaration, and RULE-LWK-01 addressing the joint apex.
 */
export const LWK_DECLARE_MIN_RANK = 1;

/** How contact was made. A closed list: "somehow" is not a channel. */
export const LWK_CHANNELS = Object.freeze([
  Object.freeze({ key: 'radio', label: 'Radio', says: 'A spoken radio check on the site channel.' }),
  Object.freeze({ key: 'phone', label: 'Phone call', says: 'A call to the person’s own number.' }),
  Object.freeze({ key: 'app', label: 'Check-in app', says: 'A press-and-hold check-in on the lone-worker device. The record holds the press, not the location.' }),
  Object.freeze({ key: 'in-person', label: 'In person', says: 'Somebody physically went to the site and saw them.' }),
  Object.freeze({ key: 'system', label: 'Site system', says: 'A plant, access or telemetry system reported the person present. This is the weakest channel and the screen says so.' }),
]);
export const LWK_CHANNEL_KEYS = Object.freeze(LWK_CHANNELS.map((row) => row.key));
export const LWK_CHANNEL_BY_KEY = Object.freeze(Object.fromEntries(LWK_CHANNELS.map((row) => [row.key, row])));

/**
 * Two outcomes and no third. `ok` resets the clock. `concern` ALSO resets the
 * clock — a person who radios in to say they are unwell has made contact — but it
 * opens a duty nobody has answered until an escalation records the response.
 * Folding `concern` into `ok` would be the register losing the one thing the
 * person actually said.
 */
export const LWK_CHECKIN_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'ok', label: 'All well', says: 'Contact made and the person reported all well.' }),
  Object.freeze({ key: 'concern', label: 'Concern raised', says: 'Contact made and the person raised a concern. The clock resets; the concern does not close itself.' }),
]);
export const LWK_CHECKIN_OUTCOME_KEYS = Object.freeze(LWK_CHECKIN_OUTCOMES.map((row) => row.key));
export const LWK_CHECKIN_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(LWK_CHECKIN_OUTCOMES.map((row) => [row.key, row])));

/**
 * Why an escalation was raised. Declared, never inferred: the register does not
 * guess which condition moved the supervisor.
 */
export const LWK_ESCALATION_BASES = Object.freeze([
  Object.freeze({ key: 'check-overdue', label: 'Check overdue', says: 'The declared interval and grace passed with no contact.' }),
  Object.freeze({ key: 'concern-follow-up', label: 'Concern follow-up', says: 'The person raised a concern at the last contact.' }),
  Object.freeze({ key: 'overrun', label: 'Past the declared end', says: 'The deployment ran past the end it was declared to.' }),
  Object.freeze({ key: 'welfare-doubt', label: 'Welfare doubt', says: 'A supervisor formed a doubt about welfare from something outside this record. The record stores the doubt, not its source.' }),
  Object.freeze({ key: 'third-party-report', label: 'Third-party report', says: 'Somebody else raised it. The register stores that a report arrived, never the reporter.' }),
]);
export const LWK_ESCALATION_BASIS_KEYS = Object.freeze(LWK_ESCALATION_BASES.map((row) => row.key));
export const LWK_ESCALATION_BASIS_BY_KEY = Object.freeze(Object.fromEntries(LWK_ESCALATION_BASES.map((row) => [row.key, row])));

/**
 * What the escalation actually did. `welfare-confirmed` is the only outcome that
 * clears the unconfirmed state, and it clears NOTHING ELSE: the exact late
 * minutes stay printed beside it, because the lateness happened.
 */
export const LWK_ESCALATION_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'attempted', label: 'Attempted, no contact', says: 'Somebody tried to reach the person and did not.' }),
  Object.freeze({ key: 'contact-made', label: 'Contact made', says: 'Contact was made and welfare was discussed. Confirmation is recorded separately by whoever heard it.' }),
  Object.freeze({ key: 'welfare-confirmed', label: 'Welfare confirmed', says: 'A named hand has confirmed the person is safe. The lateness remains on the record.' }),
  Object.freeze({ key: 'unresolved', label: 'Unresolved', says: 'The response ran out of things it could do and the deployment is still open.' }),
  Object.freeze({ key: 'emergency-services', label: 'Emergency services called', says: 'The response escalated outside the organisation. The register records that the call was made, never its content.' }),
]);
export const LWK_ESCALATION_OUTCOME_KEYS = Object.freeze(LWK_ESCALATION_OUTCOMES.map((row) => row.key));
export const LWK_ESCALATION_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(LWK_ESCALATION_OUTCOMES.map((row) => [row.key, row])));

/** How a deployment ended. Closing out is an act, and it names what happened. */
export const LWK_CLOSE_OUTCOMES = Object.freeze([
  Object.freeze({ key: 'returned', label: 'Returned', says: 'The person came back in.' }),
  Object.freeze({ key: 'handed-over', label: 'Handed over', says: 'The person was passed to another named hand before the deployment ended.' }),
  Object.freeze({ key: 'stood-down', label: 'Stood down', says: 'The work ended early and the person was released.' }),
  Object.freeze({ key: 'transferred', label: 'Transferred to another site', says: 'The person moved to a staffed site and is no longer alone.' }),
]);
export const LWK_CLOSE_OUTCOME_KEYS = Object.freeze(LWK_CLOSE_OUTCOMES.map((row) => row.key));
export const LWK_CLOSE_OUTCOME_BY_KEY = Object.freeze(Object.fromEntries(LWK_CLOSE_OUTCOMES.map((row) => [row.key, row])));

/**
 * The ten states. Each one is a DIFFERENT FACT, and the register's whole value is
 * that it never folds one into another. `tone` only colours the badge; `says` is
 * what the screen prints under it.
 */
export const LWK_STATES = Object.freeze([
  Object.freeze({
    key: 'concern-unanswered',
    label: 'Concern unanswered',
    tone: 'bad',
    says: 'The person raised a concern at their last contact and no escalation has been recorded since. Contact is not an answer.',
  }),
  Object.freeze({
    key: 'welfare-unconfirmed',
    label: 'Welfare unconfirmed',
    tone: 'bad',
    says: 'The declared interval and grace have passed with no contact and no escalation on the record. The register does not know where this person is and does not claim to.',
  }),
  Object.freeze({
    key: 'escalation-open',
    label: 'Escalation open',
    tone: 'warn',
    says: 'The contact is overdue and an escalation has been raised, but nobody has recorded welfare as confirmed. Late is still late.',
  }),
  Object.freeze({
    key: 'welfare-confirmed-late',
    label: 'Confirmed late',
    tone: 'warn',
    says: 'Contact was missed past the grace and welfare has since been confirmed. The exact late minutes remain on the record.',
  }),
  Object.freeze({
    key: 'check-due',
    label: 'Check due',
    tone: 'warn',
    says: 'The declared interval has passed and the deployment is inside its declared grace. The next check is owed now.',
  }),
  Object.freeze({
    key: 'overran',
    label: 'Past declared end',
    tone: 'warn',
    says: 'The deployment is past the end it was declared to and has not been closed out. Nobody has said the person is off site.',
  }),
  Object.freeze({
    key: 'checked-in',
    label: 'Checked in',
    tone: 'good',
    says: 'Contact was made inside the declared interval.',
  }),
  Object.freeze({
    key: 'not-yet-due',
    label: 'Not yet due',
    tone: 'neutral',
    says: 'No contact is expected yet under the declared interval.',
  }),
  Object.freeze({
    key: 'closed-without-contact',
    label: 'Closed, never contacted',
    tone: 'warn',
    says: 'The deployment was closed out with no contact recorded at any point. The register cannot prove welfare was ever confirmed.',
  }),
  Object.freeze({
    key: 'closed-out',
    label: 'Closed out',
    tone: 'good',
    says: 'The deployment was closed out with at least one contact on the record.',
  }),
]);
export const LWK_STATE_KEYS = Object.freeze(LWK_STATES.map((row) => row.key));
export const LWK_STATE_BY_KEY = Object.freeze(Object.fromEntries(LWK_STATES.map((row) => [row.key, row])));
export const LWK_OPEN_STATE_KEYS = Object.freeze(LWK_STATE_KEYS.filter((key) => !key.startsWith('closed-')));

/** Refusals printed at the door. Each one is a control, not a message. */
export const LWK_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not declare another line’s people alone.',
});

export const LWK_SECTION_TITLES = Object.freeze({
  now: 'Now',
  lines: 'Lines',
  history: 'History',
  method: 'Method',
});

export const LWK_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'deployments_n', 'open_n', 'closed_n', 'people_n',
  'checkins_n', 'escalations_n', 'due_n', 'unconfirmed_n', 'unconfirmed_minutes_total',
  'escalation_open_n', 'overran_n', 'overran_minutes_total', 'concern_n',
  'confirmed_late_n', 'closed_without_contact_n', 'lines_n', 'privacy_floor',
  'complete', 'blank_reason',
]);

/**
 * CSV #183 (ADR-0242, Schema v196). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row and one row per printed state. No person id, no name, no manager, no site
 * reference, no task, no protocol reference and no instant crosses this
 * boundary: a deployment is a fact about where a named human being was, and the
 * export is a count. A figure the reader cannot compute exports BLANK with its
 * reason, never a zero.
 */
export const LWK_CSV_DESCRIPTOR = Object.freeze({
  key: LWK_CSV_SCOPE,
  label: 'Lone-working welfare checks (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'lone-working-welfare',
  description: 'One summary row and one row per printed state. Counts of deployments, open and closed, people, contacts, escalations, checks due, welfare unconfirmed with the exact late minutes in total, escalations still open, deployments past their declared end with the exact overrun minutes, unanswered concerns, late confirmations and deployments closed with no contact at all, plus the reporting lines involved. No person, manager, site, task, reference or instant is exported.',
});

/** The published framework basis, printed on the method tab. Never a claim of parity. */
export const LWK_METHOD = Object.freeze({
  engine: LWK_ENGINE_VERSION,
  adr: LWK_ADR,
  frameworks: Object.freeze([
    'HSE lone-working guidance: the risk assessment is task- and person-specific, and the control is a declared means of contact with a declared response when it fails.',
    'BS 8484 / lone-worker protection practice: an automatic check-in timer, a two-stage escalation, and a record that the responder reached.',
    'Supervisory duty of care: the supervisor who set the timer is not always the one on duty when it expires, so the duty has to be addressable to a seat (ADR-0140/0141 matrix addressing).',
    'ALARP reasoning: the record states what is known, refuses to convert silence into safety, and never asserts a location.',
  ]),
  printed: Object.freeze([
    'The declared interval, the last instant of contact, and the exact whole minutes since.',
    'The declared grace and the exact deadline the supervisor is working to.',
    'Whether a concern was raised and whether anybody recorded a response to it.',
    'Whether the deployment ran past its declared end and by exactly how many minutes.',
    'Whether it was closed out, by whom, and whether any contact was ever recorded.',
    'Which reporting lines hold the person today, and the joint seat above them.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No location, coordinate, movement trail or device telemetry. There is a declared site reference and nothing else.',
    'No “missing” state. The strongest claim is that welfare is unconfirmed.',
    'No per-person or per-line reliability score, rate or league table.',
    'No inference of an interval, a grace or a site from history, from a rota or from another deployment.',
    'No automatic close-out when the declared end passes: time cannot end a deployment a human did not end.',
  ]),
});
