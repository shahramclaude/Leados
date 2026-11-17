/**
 * app/core/domain/personalDealingRegistry.js — the closed vocabulary of the
 * Personal-Account Dealing & Insider-List Register (ADR-0245, Schema v199,
 * `#/personal-dealing`, `RULE-DWL-01`, CSV scope #186).
 *
 * Pure leaf: zero imports, so schema, reader, actions, rule, CSV export and view
 * all share one vocabulary without a cycle.
 *
 * THE DUTY, IN A COMPLIANCE OFFICER'S WORDS. *"Priya is a designated insider
 * because she sees the half-year numbers three weeks before the market does. In
 * that window she sold 400 shares in her own account. The trade was permitted by
 * an approval the platform shows as a green tick — her own project manager
 * cleared it, because nothing in the system knew that clearing your own team's
 * trades, or trading inside the closed period, are the two things the control
 * exists to prevent. Six weeks later the incident review asks a simple question
 * and nobody can answer it: show me the closed period, show me who approved the
 * trade, and show me by what right."*
 *
 * No surface in this workspace could answer any part of that. The estate holds
 * conflict-of-interest recusal (ADR-0009), a speak-up channel, gifts-and-
 * hospitality-adjacent conduct records, and an employee-voice register — none of
 * which knows that a named person is on an insider list, that a dated window is
 * CLOSED, that a trade needed a clearance from an independent hand, or that the
 * trade that actually happened fell inside the window.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` returned ZERO files for `insider`, `blackout`, `MNPI`,
 * `material non-public`, `pre-clear`, `preclear`, `trading window`, `share
 * dealing`, `market abuse`, `inside information`, `PDMR`, `closed period`
 * (in the dealing sense), `securities` and `equity award`. 259 ADRs and the whole
 * ROADMAP carry none of them. Wider absence **[UNVERIFIED]**.
 *
 * WHAT IS RECORDED, AND WHY EACH PART IS A SEPARATE FACT
 *   1. A DESIGNATION. A person is on the insider list because a named instrument
 *      puts them there, on a stated basis, from a stated day. Not because a job
 *      title looks senior. A designation is its own dated act with an end.
 *   2. AN EVENT AND ITS WINDOW. A closed period is anchored to a declared public
 *      disclosure day and an explicitly declared number of whole days before and
 *      after it. The register carries NO default window: the span is declared per
 *      event from the instrument that governs it, because a window the software
 *      chose is a window nobody can defend.
 *   3. A CLEARANCE REQUEST. The person asks, naming the security, the side and
 *      the quantity, on a day. The request is not an approval.
 *   4. A DECISION, BY AN INDEPENDENT HAND. The decision is a separate dated act,
 *      made by a hand STRICTLY ABOVE the requester on the reporting graph across
 *      every line, with its own validity day (declared, never defaulted) or a
 *      written reason for refusal. Fama & Jensen's separation of decision
 *      management from decision control is the whole point: the person who wants
 *      to trade must never be the person who says yes.
 *   5. AN EXECUTED DEALING. What actually happened, cited to the broker's own
 *      contract note. A trade already executed is a FACT: the door records it,
 *      and the reader prints whether it fell inside a closed window, whether it
 *      came after a refusal, or whether it sits outside the clearance it cites.
 *      A register that refused to record a bad trade would push the fact off the
 *      record entirely, which is the opposite of a control.
 *
 * THE FOUR FAILURES THIS REGISTER EXISTS TO REFUSE
 *   - A CLOSED WINDOW NOBODY CAN SEE. The window is derived on read from the
 *     declared event and printed as open or closed for the day asked about, so
 *     "I did not know it was a closed period" stops being available.
 *   - THE REQUESTER CLEARING THEIR OWN TRADE. Refused at the door by name, and
 *     kept as a permanent printed breach where an imported record carries one.
 *   - A TRADE INSIDE A CLOSED WINDOW. Printed as `breach-dealt-in-closed-window`
 *     with the exact days inside the window, never folded into a percentage and
 *     never repaired.
 *   - SILENCE READ AS APPROVAL. A clearance with no decision past its declared
 *     turnaround is `pending-overdue` with the exact days late — never "approved
 *     by default", and the refusal stays printed because a clearance is the only
 *     thing that makes a trade approved.
 *
 * THE BENCHMARKED CATEGORY, AND WHERE IT STOPS [vendor documentation and
 * published framework material; hands-on parity UNVERIFIED]. Employee
 * personal-trading compliance platforms — StarCompliance, ComplySci (the Comply
 * Platform), MyComplianceOffice — set the bar with four mechanics: an insider
 * list, restricted/blackout windows, pre-clearance with an approval, and
 * post-trade surveillance against the list. They are feed-integrated and
 * broker-connected; this register is not and does not claim to be. What LeadOS
 * adds, and what none of them is published as doing, is that every one of the
 * five facts above is a separately dated, separately owned act resolved through
 * the ONE matrix engine, with the independent-decider test proved against the
 * live reporting graph rather than an administrator-configured role, and with
 * every branch — no decider above, no line holding the person, an unreadable
 * window — printing a counted refusal instead of a plausible green tick.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A designated person may sit on a functional
 * line and a project line at once. The reader resolves EVERY active line holding
 * them, prints them, counts the person ONCE, and files every rule ask to the JOINT
 * APEX above all of those lines — never to one line on another's behalf and never
 * to the person, whose own dealing is the thing being measured. A decision is
 * narrowed to a hand strictly above the requester across the union of their lines,
 * so a project-line manager two steps up a different branch legitimately
 * qualifies and a same-level peer never does.
 *
 * THE FOUR THINGS THAT MUST NEVER HAPPEN, PREVENTED BY CONSTRUCTION
 *   - No person is scored. There is no "risk rating", no "integrity index", no
 *     league table of who traded most. A person's dealing record is a fact about
 *     an act, not a judgement about a human being.
 *   - No default window, no default validity: both are declared per event and per
 *     decision.
 *   - No clearance inferred from a request, and no approval inferred from
 *     silence.
 *   - No security reference, person, broker reference or day in the export.
 */

export const DWL_ENGINE_VERSION = 'personal-dealing-2026.11-v1';
export const DWL_ADR = 'ADR-0245';
export const DWL_RULE_ID = 'RULE-DWL-01';
export const DWL_ROUTE = 'personal-dealing';
export const DWL_HREF = '#/personal-dealing';
export const DWL_CSV_SCOPE = 'personal-dealing-control';
export const DWL_MARKER_KIND = 'personal-dealing';
export const DWL_EVENT_PREFIX = 'personalDealing.';

export const DWL_EVENTS = Object.freeze({
  DESIGNATION_DECLARED: 'personalDealing.designation.declared',
  DESIGNATION_ENDED: 'personalDealing.designation.ended',
  EVENT_DECLARED: 'personalDealing.event.declared',
  CLEARANCE_REQUESTED: 'personalDealing.clearance.requested',
  CLEARANCE_DECIDED: 'personalDealing.clearance.decided',
  DEALING_RECORDED: 'personalDealing.dealing.recorded',
  CONVENTIONS_SET: 'personalDealing.conventions.set',
  SCANNED: 'personalDealing.scan',
});

/**
 * Four rights, and the split is the control.
 *
 * READING is open at rank 1 because a designated person must be able to see
 * whether a window is closed and what their own record holds — a control that
 * hides the closed period from the person it binds is not a control. The READER
 * then narrows hard: personal-account dealing is INDIVIDUAL detail (the
 * workspace's own `individual` record class, detail ceiling rank 2), so above
 * rank 2 the reader prints counts and withholds every name, security and broker
 * reference. A VP reading named personal trades is exactly the wrong direction
 * for this data to flow.
 *
 * DECLARING (a designation, an event and its window, the conventions) is a rank
 * 3+ control-room act: this is the hand that decides who is on the list and when
 * dealing is closed.
 *
 * REQUESTING is open at rank 1: the person asks for their own clearance, and
 * records their own executed dealing once the broker has confirmed it.
 *
 * DECIDING is rank 2+, and the door narrows it further to a hand strictly ABOVE
 * the requester across the union of their reporting lines. Rank alone never makes
 * anybody an independent decider.
 */
export const DWL_RIGHTS = Object.freeze({
  READ: 'read-personal-dealing',
  DECLARE: 'declare-personal-dealing',
  REQUEST: 'request-personal-dealing',
  DECIDE: 'decide-personal-dealing',
});

export const DWL_SETTING_KEYS = Object.freeze({
  autoPropagate: 'dwlAutoPropagate',
  privacyFloor: 'dwlPrivacyFloor',
  clearanceTurnaroundDays: 'dwlClearanceTurnaroundDays',
});

export const DWL_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  clearanceTurnaroundDays: { min: 1, max: 30 },
});

export const DWL_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  clearanceTurnaroundDays: 3,
});

export const DWL_LIMITS = Object.freeze({
  designations: 400,
  events: 200,
  clearances: 1200,
  decisions: 1200,
  dealings: 1600,
  markers: 400,
  idMax: 120,
  /** A designation basis: a short closed code, never free prose. */
  basisMax: 60,
  /** A person is named by an id this register resolves; never a free-typed name. */
  personMin: 1,
  /** A written instrument: the policy clause, the appointment letter. */
  instrumentRefMin: 16,
  instrumentRefMax: 400,
  /** What the event is about, and what the notice says. */
  subjectMin: 12,
  subjectMax: 200,
  /** A written reason: a refusal, a note. */
  textMin: 16,
  textMax: 600,
  /** A security reference, as the broker or the instrument writes it. */
  securityRefMin: 3,
  securityRefMax: 60,
  /** A broker's own contract-note reference. */
  brokerRefMin: 6,
  brokerRefMax: 120,
  /** A short label. */
  shortMin: 3,
  shortMax: 120,
  /** Whole days a closed window opens before the disclosure day. */
  beforeDaysMin: 0,
  beforeDaysMax: 120,
  /** Whole days the window stays closed after the disclosure day. */
  afterDaysMin: 0,
  afterDaysMax: 60,
  /** A whole quantity of securities. Refused rather than rounded. */
  quantityMin: 1,
  quantityMax: 100000000,
  /** How far ahead a disclosure day may be declared. */
  disclosureMaxAheadDays: 400,
  /** How far back an act may be dated. */
  actMaxBackDays: 730,
  /** The longest a clearance may declare itself valid for. */
  validityMaxDays: 90,
  /** Rule asking. */
  askDueDays: 1,
  rowsShown: 80,
});

/** Rank that may read the register at all. */
export const DWL_READ_MIN_RANK = 1;
/** Rank above which the reader prints counts and withholds every name. */
export const DWL_DETAIL_MAX_RANK = 2;
/** Rank that may declare a designation, an event / window, and the conventions. */
export const DWL_DECLARE_MIN_RANK = 3;
/** Rank that may record an executed dealing and request a clearance. */
export const DWL_REQUEST_MIN_RANK = 1;
/** Rank that may decide a clearance — narrowed further against the graph. */
export const DWL_DECIDE_MIN_RANK = 2;

/**
 * The closed list of bases on which somebody is a designated person. "Because
 * they are senior" is not one: a title is not a legal basis, and a register that
 * infers designations from titles puts people on an insider list they were never
 * appointed to.
 */
export const DWL_BASES = Object.freeze([
  Object.freeze({ key: 'statutory-insider', label: 'Statutory insider', says: 'Inside information by virtue of a directorate, a holding or access to a regulated market filing.' }),
  Object.freeze({ key: 'pdmr', label: 'Person discharging managerial responsibility', says: 'A notified manager whose dealings must be disclosed to the market separately.' }),
  Object.freeze({ key: 'access-to-unpublished-price-sensitive', label: 'Access to unpublished price-sensitive information', says: 'Holds, or can see, figures or facts the market does not yet have.' }),
  Object.freeze({ key: 'contractual', label: 'Contractual designation', says: 'A written policy or engagement puts them on the list even where no statute does.' }),
]);
export const DWL_BASIS_KEYS = Object.freeze(DWL_BASES.map((row) => row.key));
export const DWL_BASIS_BY_KEY = Object.freeze(Object.fromEntries(DWL_BASES.map((row) => [row.key, row])));

/** The three kinds of dated information event a window can be anchored to. */
export const DWL_EVENT_KINDS = Object.freeze([
  Object.freeze({ key: 'results-announcement', label: 'Results announcement', says: 'A scheduled or unscheduled results disclosure. The window is the classic closed period around it.' }),
  Object.freeze({ key: 'transaction', label: 'Transaction or deal', says: 'A significant transaction whose disclosure day ends the silence.' }),
  Object.freeze({ key: 'ad-hoc-mnpi', label: 'Ad-hoc inside information', says: 'The information arose without a scheduled event. The window is still anchored to a declared disclosure day.' }),
]);
export const DWL_EVENT_KIND_KEYS = Object.freeze(DWL_EVENT_KINDS.map((row) => row.key));
export const DWL_EVENT_KIND_BY_KEY = Object.freeze(Object.fromEntries(DWL_EVENT_KINDS.map((row) => [row.key, row])));

/** The two sides of a personal trade. A closed list: there is no third answer. */
export const DWL_SIDES = Object.freeze([
  Object.freeze({ key: 'buy', label: 'Buy / subscribe' }),
  Object.freeze({ key: 'sell', label: 'Sell / redeem' }),
]);
export const DWL_SIDE_KEYS = Object.freeze(DWL_SIDES.map((row) => row.key));

/**
 * The published vocabulary of a dealing's state. Each is a DIFFERENT fact, and
 * the register's whole value is that it never folds one into another. `tone`
 * colours the badge; `says` is printed beneath it in the leader's language.
 *
 * The four `breach-` states are the offences the register exists to surface. Two
 * of them (a decision by the requester, and any act dated before the act it
 * depends on) cannot be created through the door; they are kept when an imported
 * or hand-edited record carries them, because dropping them would erase the exact
 * fact the screen exists to show.
 */
export const DWL_STATES = Object.freeze([
  Object.freeze({
    key: 'breach-dealt-in-closed-window',
    label: 'Dealt inside a closed window',
    tone: 'bad',
    says: 'The trade fell on a day inside a declared closed period that applied to this person. The window’s first day, its last day and the exact day the trade fell are printed beside it, and the state is never repaired, rounded or reframed as a permitted trade.',
  }),
  Object.freeze({
    key: 'breach-dealt-after-refusal',
    label: 'Dealt after the clearance was refused',
    tone: 'bad',
    says: 'A clearance for this person was refused, and the trade is dated on or after the refusal. A refusal is an answer; a trade after it is the exact act the clearance existed to prevent.',
  }),
  Object.freeze({
    key: 'breach-dealt-outside-clearance',
    label: 'Dealt outside the clearance’s validity',
    tone: 'bad',
    says: 'The trade cites a clearance, but it is dated before the decision or after the declared validity day. A clearance approves a trade for a stated period and no longer; the exact days by which the trade missed it stay printed.',
  }),
  Object.freeze({
    key: 'breach-cleared-by-requester',
    label: 'Cleared by the person who asked',
    tone: 'bad',
    says: 'The clearance was granted by the same hand that requested it. Decision control must sit apart from decision management: the person who wants to trade is never the person who says yes. Unreachable through the door; kept and printed permanently when it arrives in the record.',
  }),
  Object.freeze({
    key: 'dealt-with-clearance',
    label: 'Dealt on an independent clearance',
    tone: 'good',
    says: 'The trade cites a clearance granted by a hand strictly above the requester, and it falls inside that clearance’s declared validity, on a day no declared window was closed. Every one of those is checked on every read.',
  }),
  Object.freeze({
    key: 'dealt-without-clearance',
    label: 'Dealt with no clearance on the record',
    tone: 'warn',
    says: 'The trade is on the record and no clearance is cited for it. The register does not know whether pre-clearance was required of this person — that is a matter for the written policy the designation cites — so it prints exactly what it knows: nothing approved this trade.',
  }),
  Object.freeze({
    key: 'dealt-window-undeterminable',
    label: 'A window applies but cannot be resolved',
    tone: 'warn',
    says: 'A closed-period event covers this person, but its declared arithmetic cannot be resolved, so the register refuses to say the trade was inside the window or outside it. A refusal with its reason, never a reassuring blank.',
  }),
  Object.freeze({
    key: 'dealt-after-designation-ended',
    label: 'Dealt after the designation ended',
    tone: 'warn',
    says: 'The person was designated, the designation ended before the trade, and the trade is on the record. The register cannot prove what the person knew, so it prints the fact and scores nobody.',
  }),
  Object.freeze({
    key: 'dealt-before-designation',
    label: 'Dealt before the designation began',
    tone: 'neutral',
    says: 'The trade predates the day the person was designated. It is outside this register’s control window, and the register says so rather than counting it against anybody.',
  }),
]);
export const DWL_STATE_KEYS = Object.freeze(DWL_STATES.map((row) => row.key));
export const DWL_STATE_BY_KEY = Object.freeze(Object.fromEntries(DWL_STATES.map((row) => [row.key, row])));
export const DWL_BREACH_STATE_KEYS = Object.freeze(DWL_STATE_KEYS.filter((key) => key.startsWith('breach-')));

/**
 * The clearance lifecycle. Requested → decided (cleared or refused), or lapsed
 * with no decision. `pending-overdue` is the state the register exists to refuse
 * to hide: silence past the declared turnaround is not an approval.
 */
export const DWL_CLEARANCE_STATES = Object.freeze([
  Object.freeze({ key: 'breach-decided-by-requester', label: 'Decided by the requester', tone: 'bad', says: 'The decision names the requester as the decider. Kept and printed permanently; never repaired.' }),
  Object.freeze({ key: 'breach-decided-before-request', label: 'Decided before it was asked', tone: 'bad', says: 'The decision is dated before the request it answers. An act dated before the act it depends on is an ordering the door refuses to create and the register will not repair.' }),
  Object.freeze({ key: 'pending-overdue', label: 'Decision owed past its day', tone: 'bad', says: 'The declared turnaround has passed and no decision is on the record. Silence is not an approval, and the exact days late stay printed.' }),
  Object.freeze({ key: 'cleared-not-dealt', label: 'Cleared, nothing dealt yet', tone: 'good', says: 'An independent hand cleared the trade, and the declared validity has not closed. No executed dealing is on the record yet.' }),
  Object.freeze({ key: 'cleared-and-dealt', label: 'Cleared and dealt', tone: 'good', says: 'An independent hand cleared the trade and a dealing citing it is on the record inside the validity.' }),
  Object.freeze({ key: 'cleared-lapsed', label: 'Cleared, validity closed unused', tone: 'warn', says: 'The clearance was granted and its declared validity closed with no dealing citing it. The approval expired; nothing was traded on it.' }),
  Object.freeze({ key: 'refused-not-dealt', label: 'Refused, nothing dealt', tone: 'neutral', says: 'The clearance was refused with a written reason and no dealing citing it is on the record. This is the control working.' }),
  Object.freeze({ key: 'refused-and-dealt', label: 'Refused, then dealt', tone: 'bad', says: 'The clearance was refused and a dealing is dated on or after the refusal. The dealing row carries `breach-dealt-after-refusal`.' }),
  Object.freeze({ key: 'pending', label: 'Awaiting a decision', tone: 'neutral', says: 'The request is open and inside its declared turnaround. The exact days left stay printed.' }),
]);
export const DWL_CLEARANCE_STATE_KEYS = Object.freeze(DWL_CLEARANCE_STATES.map((row) => row.key));
export const DWL_CLEARANCE_STATE_BY_KEY = Object.freeze(Object.fromEntries(DWL_CLEARANCE_STATES.map((row) => [row.key, row])));

/** The window verdict for one person on one day. Three answers, never two. */
export const DWL_WINDOW_STATES = Object.freeze([
  Object.freeze({ key: 'closed', label: 'Closed', says: 'A declared closed period covers this day for this person.' }),
  Object.freeze({ key: 'open', label: 'Open', says: 'No declared closed period covers this day for this person.' }),
  Object.freeze({ key: 'undeterminable', label: 'Cannot be resolved', says: 'A declared event covers this person but its window arithmetic cannot be resolved, so the register refuses to claim either answer.' }),
]);

/** Refusals printed at the door. Each one is a control, not a message. */
export const DWL_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not one this seat holds. One line does not record another line’s dealing.',
  personNotFound: 'That person is not on the active roster. Nothing was saved.',
  designationMissing: 'That person is not on the insider list at the dealing day. Record the designation first: this register measures the dealings of designated persons, not of anybody.',
  selfDecision: 'A clearance cannot be decided by the hand that requested it. Decision control must sit apart from decision management; ask a hand strictly above the requester.',
  notAboveRequester: 'That seat is not strictly above the requester on the reporting graph, through any of their lines. A peer, a subordinate or an unrelated branch cannot clear a trade.',
  alreadyDecided: 'That clearance already carries a decision. A decision is recorded once; a clearance nobody decided is `pending-overdue`, and that is the honest state, not a second answer.',
  validityMissing: 'A cleared decision must declare the last day it is valid for. Without it a clearance would approve a trade indefinitely.',
  reasonMissing: 'A refusal must state its written reason. A refusal nobody explained is not a decision anybody can appeal.',
  requestMissing: 'Cite the clearance request this decision answers. A decision with no request behind it approves nothing.',
  windowUndeterminable: 'The event’s declared window cannot be resolved, so this register will not say whether dealing is closed. Correct the event and re-declare it.',
  ledgerFull: 'The ledger is full. Export the workspace before proceeding.',
});

export const DWL_SECTION_TITLES = Object.freeze({
  list: 'Insider list',
  windows: 'Closed windows',
  clearances: 'Clearances',
  dealings: 'Dealings',
  method: 'Method',
});

/**
 * CSV #186 (ADR-0245, Schema v199). IDENTITY-FREE BY CONSTRUCTION. A
 * personal-dealing record is the most individually sensitive material in the
 * workspace: a named human being's own trades, their broker references and the
 * securities they hold. The export therefore carries COUNTS AND STATE KEYS ONLY:
 * no person, no designation basis per person, no security reference, no broker
 * reference, no quantity, no day.
 */
export const DWL_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'designations_n', 'live_designations_n', 'ended_designations_n',
  'events_n', 'open_window_events_n', 'clearances_n', 'pending_n', 'pending_overdue_n',
  'cleared_n', 'refused_n', 'lapsed_n', 'dealings_n', 'dealt_with_clearance_n',
  'dealt_without_clearance_n', 'dealt_in_closed_window_n', 'dealt_after_refusal_n',
  'dealt_outside_clearance_n', 'dealt_undeterminable_n', 'breaches_n',
  'privacy_floor', 'complete', 'blank_reason',
]);

export const DWL_CSV_DESCRIPTOR = Object.freeze({
  key: DWL_CSV_SCOPE,
  label: 'Personal-account dealing control (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'personal-dealing-control',
  description: 'One summary row and one row per printed dealing state and clearance state. Counts of designations live and ended, events and currently-open windows, clearances pending, overdue, cleared, refused and lapsed, dealings with and without clearance, dealings inside a closed window, after a refusal and outside a clearance, and the breach total. No person, no basis per person, no security reference, no broker reference, no quantity and no day is exported.',
});

/**
 * The published framework basis, printed on the Method tab. Never a claim of
 * parity with a specialist platform.
 */
export const DWL_METHOD = Object.freeze({
  engine: DWL_ENGINE_VERSION,
  adr: DWL_ADR,
  frameworks: Object.freeze([
    'Market-abuse regulation on inside information and the prohibition on dealing — the source of the CLOSED PERIOD and of the requirement that a person who holds unpublished price-sensitive information does not trade on it.',
    'Managers’ transactions disclosure regimes (the PDMR / closely-associated-person notification duty) — the source of naming a designated person explicitly, with the instrument that makes them one.',
    'Fama & Jensen (1983), “Separation of ownership and control”, on the distinction between decision management (initiating and implementing) and decision control (ratifying and monitoring). The register enforces exactly that split: the hand that wants the trade never decides it.',
    'The control-room discipline of a restricted list and a wall-crossing record: who is on the inside list, from which day, and what was approved for them while they were on it.',
    'The workspace’s own matrix engine (ADR-0140/0141): every line holding a designated person is resolved, the person is counted once, and no ask is ever addressed to the person whose own dealing is the subject.',
  ]),
  printed: Object.freeze([
    'The written instrument and basis on which each person is on the insider list, and the exact days the designation covers.',
    'Every declared closed period with its anchor disclosure day, the declared whole days before and after, and its first and last closed day.',
    'Whether dealing is OPEN or CLOSED for a named person on a named day, and the event that closed it.',
    'The clearance request as its own dated act, and the decision as a separate dated act by a hand strictly above the requester, with its validity day or its written refusal reason.',
    'The exact days a decision was late past its declared turnaround — silence is never printed as an approval.',
    'Every executed dealing against the window it fell in and the clearance it cites, with the exact days inside the window or outside the validity.',
    'The joint reporting seat above the lines holding the person, and never the person as an addressee.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No broker feed, no statement ingestion and no market-price data: a dealing is a dated human record cited to a contract-note reference, and the register says so rather than implying a feed it does not have.',
    'No inferred designation from a job title, a pay grade or a span: a designation is its own dated act on a written basis, or the person is not on the list.',
    'No default closed-period window and no default clearance validity: both are declared per event and per decision.',
    'No clearance inferred from a request, and no approval inferred from silence: `pending-overdue` is a printed state with the exact days late.',
    'No scoring, ranking or comparison of a person. There is no risk rating, no integrity index and no league table of who traded most; the record is about acts, not about human beings.',
    'No person, security, broker reference, quantity or day in the export: the boundary carries counts and published state keys only.',
  ]),
});
