/**
 * app/core/domain/voiceRegistry.js — the closed vocabulary of the Employee Voice &
 * Collective Consultation Register (ADR-0243, Schema v197, `#/voice`,
 * `RULE-VOI-01`, CSV scope #184).
 *
 * THE DUTY, IN A DIRECTOR'S WORDS. *"We told the staff council about the shift
 * change on the Tuesday. They came back on the Thursday saying the night crew had
 * not been consulted and the rota would break. We had already signed the change on
 * the Wednesday. Nobody can tell me now whether they were told before or after we
 * decided, and the minute that says 'representatives briefed; no objection
 * recorded' tells me nothing at all."*
 *
 * No surface in this workspace could answer any part of that. It can record a
 * workforce transition (`transition.js`) whose checklist has a row called
 * "Consultation opens with employee representatives", and an org change whose
 * gate list mentions consultation — but a CHECKED BOX IS NOT A CONSULTATION. A
 * tick asserts that somebody spoke to somebody. It does not hold what was put to
 * the body, the instrument that set the clock, the day the advice arrived, the
 * day the decision was taken, or whether the second preceded the first — which is
 * the only question a consultation record exists to answer.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `information and
 * consultation`, `collective consultation`, `works-council`, `employee forum`,
 * `staff representative`, `trade union` and `joint consultative`. `works council`
 * appeared twice, both times in prose explaining that consultation duties "vary
 * by jurisdiction"; `consultation` otherwise means the Diligence Ledger's record
 * that somebody was *consulted before a decision* — a different duty, discharged
 * by the decision-maker alone — or that same transition checklist row. Wider
 * absence **[UNVERIFIED]**.
 *
 * WHAT THE BENCHMARKED CATEGORY GETS RIGHT, AND WHERE IT STOPS. Works-council and
 * employee-relations case-management tooling, and the EU information-and-
 * consultation framework it is built to serve (Directive 2002/14/EC and the EWC
 * recast, 2009/38/EC), set the bar with four mechanics [vendor documentation and
 * the directives, hands-on parity UNVERIFIED]:
 *
 *   1. A DECLARED BODY with elected or appointed members and dated terms.
 *   2. AN AGENDA ITEM with the documents that were supplied and the day they were
 *      supplied.
 *   3. A PERIOD the body was given, set by the constitution or the instrument —
 *      never a default the software chose.
 *   4. A MINUTE and a recorded opinion, and a decision that follows.
 *
 * WHAT THIS REGISTER ADDS THAT THE CATEGORY DOES NOT — AND WHY IT IS THE POINT.
 * Consultation is defined by ORDER, and almost every tool stores an unordered bag
 * of meetings and documents. This register derives, on every read, whether the
 * decision was taken BEFORE the period the body was given had run out, and prints
 * it as `decided-before-advice` with the exact number of days early. It never
 * repairs that ordering, never lets a later minute erase it, and the door refuses
 * to create one. Two further facts no product in the category separates:
 *
 *   - **Advice is not the same as agreement.** `followed-advice`, `departed` and
 *     `proceeded-without-advice` are three different records, each carrying its
 *     own written reason, and none is folded into "consulted".
 *   - **Silence is not consent.** A window that closes with no advice on the
 *     record is `advice-lapsed` — printed, counted and asked of a seat — and it
 *     stays on the record beside whatever decision was taken afterwards.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). A consultation item names the reporting
 * lines whose work the change affects. Each line has its own holder; the seat
 * answerable for the item is the JOINT APEX above them, computed through the ONE
 * matrix engine, never chosen by the actor. The door therefore refuses a decision
 * recorded by a holder of only ONE of the affected lines: that is the matrix
 * silently picking a winner between two managers, which is exactly what the
 * doctrine forbids. A person is counted once; a body is not a reporting line and
 * is never addressed as if it were a person.
 *
 * THE THREE THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No representative is ever scored.** The register counts items, days,
 *     sittings and advice. It never prints a per-member attendance rate, a
 *     "cooperative index", a ranking of bodies or a named comparison — a voice
 *     channel that rates the people using it is a channel that closes.
 *   - **No default consultation period.** The window is declared per item from a
 *     written instrument; an item with no instrument is refused at the door, and
 *     there is no jurisdiction table and no statutory fallback anywhere in the
 *     code.
 *   - **No invented advice.** The register does not summarise, interpret or
 *     paraphrase what a body said. It stores the body's own written note and
 *     prints it verbatim or not at all.
 */

export const VOI_ENGINE_VERSION = 'employee-voice-2026.11-v1';
export const VOI_ADR = 'ADR-0243';
export const VOI_RULE_ID = 'RULE-VOI-01';
export const VOI_ROUTE = 'voice';
export const VOI_HREF = '#/voice';
export const VOI_CSV_SCOPE = 'employee-voice';
export const VOI_MARKER_KIND = 'employee-voice';
export const VOI_EVENT_PREFIX = 'voice.';

export const VOI_EVENTS = Object.freeze({
  BODY_DECLARED: 'voice.body.declared',
  MEMBER_DECLARED: 'voice.member.declared',
  ITEM_OPENED: 'voice.item.opened',
  DOCUMENT_SUPPLIED: 'voice.item.documentSupplied',
  SITTING_HELD: 'voice.sitting.held',
  MINUTES_RECORDED: 'voice.sitting.minutesRecorded',
  ADVICE_RECORDED: 'voice.advice.recorded',
  REPLY_RECORDED: 'voice.advice.replied',
  DECISION_RECORDED: 'voice.decision.recorded',
  INFORMED: 'voice.item.informed',
  CONVENTIONS_SET: 'voice.conventions.set',
  SCANNED: 'voice.scan',
});

export const VOI_RIGHTS = Object.freeze({
  READ: 'read-employee-voice',
  DECLARE: 'declare-employee-voice',
});

export const VOI_SETTING_KEYS = Object.freeze({
  autoPropagate: 'voiceAutoPropagate',
  privacyFloor: 'voicePrivacyFloor',
  replyDays: 'voiceReplyDays',
  minutesDueDays: 'voiceMinutesDueDays',
});

export const VOI_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  replyDays: { min: 1, max: 60 },
  minutesDueDays: { min: 1, max: 60 },
});

export const VOI_DEFAULTS = Object.freeze({
  privacyFloor: 3,
  replyDays: 10,
  minutesDueDays: 10,
});

export const VOI_LIMITS = Object.freeze({
  bodies: 60,
  members: 600,
  items: 900,
  sittings: 900,
  responses: 900,
  decisions: 900,
  markers: 400,
  /** A body names something; a two-letter label names nothing. */
  nameMin: 3,
  nameMax: 120,
  /** A subject a human put to a body. */
  subjectMin: 8,
  subjectMax: 200,
  /** The written instrument (constitution, agreement, clause) a clock rests on. */
  instrumentMin: 24,
  textMin: 24,
  textMax: 600,
  /** A document label or a role name. */
  shortMin: 3,
  shortMax: 120,
  idMax: 120,
  /** Whole days the body is given, declared per item. No default exists. */
  windowMin: 1,
  windowMax: 90,
  /** Members required for a sitting to transact. Declared per body. */
  quorumMin: 1,
  quorumMax: 50,
  /** Rule asking. */
  askDueDays: 1,
  rowsShown: 60,
});

/** Rank that may read the register; above rank 3 the reader withholds names. */
export const VOI_READ_MIN_RANK = 1;
/**
 * Rank that may declare a body, open an item, record a sitting, advice, a reply
 * and a decision.
 *
 * RANK 2, NOT 1: putting a change to a consultation body is a line-holder's act,
 * and the door narrows it further to a seat that holds one of the item's own
 * affected lines. Rank 1 can read the register and be represented in it; it
 * cannot speak for a line it does not hold.
 */
export const VOI_DECLARE_MIN_RANK = 2;

/** What kind of body this is. A closed list: "some reps" is not a body. */
export const VOI_BODY_KINDS = Object.freeze([
  Object.freeze({ key: 'works-council', label: 'Works council', says: 'An elected body with a declared constitution and a dated term.' }),
  Object.freeze({ key: 'cooperation-committee', label: 'Cooperation committee', says: 'A joint management/employee committee constituted by written agreement.' }),
  Object.freeze({ key: 'employee-forum', label: 'Employee forum', says: 'A staff forum with declared membership, whether elected or appointed.' }),
  Object.freeze({ key: 'union-recognition', label: 'Recognised union body', says: 'A recognised union or staff association acting through named representatives.' }),
  Object.freeze({ key: 'ad-hoc', label: 'Ad-hoc consultation group', says: 'A group constituted for a named matter, with its own declared term.' }),
]);
export const VOI_BODY_KIND_KEYS = Object.freeze(VOI_BODY_KINDS.map((row) => row.key));
export const VOI_BODY_KIND_BY_KEY = Object.freeze(Object.fromEntries(VOI_BODY_KINDS.map((row) => [row.key, row])));

/** A member's standing in the body. */
export const VOI_MEMBER_ROLES = Object.freeze([
  Object.freeze({ key: 'chair', label: 'Chair', says: 'Convenes the body and speaks for it.' }),
  Object.freeze({ key: 'member', label: 'Representative', says: 'An elected or appointed representative with a dated term.' }),
  Object.freeze({ key: 'observer', label: 'Observer', says: 'Attends and reads but does not vote. Counted for attendance, never for quorum.' }),
]);
export const VOI_MEMBER_ROLE_KEYS = Object.freeze(VOI_MEMBER_ROLES.map((row) => row.key));
export const VOI_MEMBER_ROLE_BY_KEY = Object.freeze(Object.fromEntries(VOI_MEMBER_ROLES.map((row) => [row.key, row])));

/**
 * Three kinds of item, and the difference is what the body OWES back.
 *
 *   information   the body is told. Nothing is owed and no window exists; the
 *                 state is `notified` once the documents are on the record.
 *   consultation  the body is given a declared period to advise. Its advice is
 *                 recorded and the organisation's reply to that advice is owed.
 *   negotiation   the same period and the same advice, and the departure from it
 *                 is a negotiated position the register prints beside the advice.
 */
export const VOI_ITEM_KINDS = Object.freeze([
  Object.freeze({ key: 'information', label: 'Information', owesAdvice: false, says: 'The body is informed. No period runs and no advice is owed.' }),
  Object.freeze({ key: 'consultation', label: 'Consultation', owesAdvice: true, says: 'The body is given a declared period to advise, and its advice is answered.' }),
  Object.freeze({ key: 'negotiation', label: 'Negotiation', owesAdvice: true, says: 'The body is given a declared period to advise, and any departure from its position is recorded as a negotiated position.' }),
]);
export const VOI_ITEM_KIND_KEYS = Object.freeze(VOI_ITEM_KINDS.map((row) => row.key));
export const VOI_ITEM_KIND_BY_KEY = Object.freeze(Object.fromEntries(VOI_ITEM_KINDS.map((row) => [row.key, row])));

/** What the body advised. A closed list: "feedback" is not advice. */
export const VOI_ADVICE_COURSES = Object.freeze([
  Object.freeze({ key: 'support', label: 'Support', says: 'The body supported the proposal as put.' }),
  Object.freeze({ key: 'amend', label: 'Amend', says: 'The body advised changes to the proposal as put.' }),
  Object.freeze({ key: 'oppose', label: 'Oppose', says: 'The body opposed the proposal as put.' }),
  Object.freeze({ key: 'no-view', label: 'No view', says: 'The body was consulted and recorded no position. This is not agreement.' }),
]);
export const VOI_ADVICE_COURSE_KEYS = Object.freeze(VOI_ADVICE_COURSES.map((row) => row.key));
export const VOI_ADVICE_COURSE_BY_KEY = Object.freeze(Object.fromEntries(VOI_ADVICE_COURSES.map((row) => [row.key, row])));

/**
 * What the organisation did with the advice. `proceeded-without-advice` is
 * available ONLY when no advice ever arrived and the window had closed; it is a
 * separate record from a departure, because "we went against them" and "they
 * never came back" are different facts about a body that was or was not heard.
 */
export const VOI_DECISION_COURSES = Object.freeze([
  Object.freeze({ key: 'followed-advice', label: 'Followed the advice', needsAdvice: true, says: 'The decision follows the advice on the record.' }),
  Object.freeze({ key: 'departed', label: 'Departed from the advice', needsAdvice: true, says: 'The decision departs from the advice on the record. The departure carries its own written reason.' }),
  Object.freeze({ key: 'proceeded-without-advice', label: 'Proceeded with no advice', needsAdvice: false, says: 'The window closed with no advice on the record and the decision was taken. The register keeps both facts.' }),
]);
export const VOI_DECISION_COURSE_KEYS = Object.freeze(VOI_DECISION_COURSES.map((row) => row.key));
export const VOI_DECISION_COURSE_BY_KEY = Object.freeze(Object.fromEntries(VOI_DECISION_COURSES.map((row) => [row.key, row])));

/**
 * The fourteen item states. Each one is a DIFFERENT FACT and the register's
 * whole value is that it never folds one into another. `tone` colours the badge;
 * `says` is printed beneath it in the leader's language.
 *
 * The three `breach-` states are UNREACHABLE THROUGH THE DOOR — the commands
 * refuse to create them. They exist because an imported or hand-edited file can
 * carry one, and deleting it would erase the exact fact the register exists to
 * surface. The loader therefore keeps the row and the reader prints the breach,
 * permanently.
 */
export const VOI_STATES = Object.freeze([
  Object.freeze({
    key: 'breach-decided-before-advice',
    label: 'Decided before the window closed',
    tone: 'bad',
    says: 'A decision was recorded before the declared consultation period had run out. The register did not create this ordering and will not hide it: the decision-day and the day the window closed are both printed, with the exact days early.',
  }),
  Object.freeze({
    key: 'breach-implemented-before-decision',
    label: 'Implemented before the decision',
    tone: 'bad',
    says: 'The change was recorded as in place before the decision that authorised it. An implementation with no decision behind it is a change nobody decided.',
  }),
  Object.freeze({
    key: 'breach-body-lapsed',
    label: 'Put to a body after its term',
    tone: 'bad',
    says: 'The item was opened after the body’s declared term had ended, so the hands that advised were not constituted to advise. The register prints the body’s end day beside it.',
  }),
  Object.freeze({
    key: 'implemented',
    label: 'Decided and in place',
    tone: 'good',
    says: 'The advice, the decision and the day the change took effect are all on the record.',
  }),
  Object.freeze({
    key: 'decided-departing',
    label: 'Decided, departing from the advice',
    tone: 'warn',
    says: 'A decision is recorded that departs from the body’s advice, with its own written reason. The departure is a decision somebody must own, not a footnote.',
  }),
  Object.freeze({
    key: 'decided-without-advice',
    label: 'Decided with no advice',
    tone: 'warn',
    says: 'The window closed with nothing from the body and the decision was taken. The register keeps both facts side by side; silence is not consent.',
  }),
  Object.freeze({
    key: 'decided',
    label: 'Decided',
    tone: 'good',
    says: 'An advice is on the record and the decision follows it. No implementation day is recorded yet.',
  }),
  Object.freeze({
    key: 'reply-overdue',
    label: 'Advice unanswered',
    tone: 'warn',
    says: 'The body advised and the organisation’s own written reply is past the declared reply window. A body that is consulted and never answered learns that consulting changes nothing.',
  }),
  Object.freeze({
    key: 'advice-replied',
    label: 'Advice answered',
    tone: 'good',
    says: 'The advice is on the record and the organisation replied in writing. The decision is still owed.',
  }),
  Object.freeze({
    key: 'advised-late',
    label: 'Advice received late',
    tone: 'warn',
    says: 'The body advised after the declared period had run out. The advice is kept and the exact late days stay printed beside it.',
  }),
  Object.freeze({
    key: 'advised',
    label: 'Advice received',
    tone: 'good',
    says: 'The body advised inside its declared period. The organisation’s reply and the decision are owed.',
  }),
  Object.freeze({
    key: 'advice-lapsed',
    label: 'Window closed, no advice',
    tone: 'bad',
    says: 'The declared period ran out with nothing from the body on the record. This is not agreement, and the register does not read silence as approval.',
  }),
  Object.freeze({
    key: 'advice-owed',
    label: 'Advice owed',
    tone: 'neutral',
    says: 'The declared period is running. The exact days left are printed.',
  }),
  Object.freeze({
    key: 'notified',
    label: 'Informed',
    tone: 'neutral',
    says: 'An information item: the body was told and owes nothing back.',
  }),
]);
export const VOI_STATE_KEYS = Object.freeze(VOI_STATES.map((row) => row.key));
export const VOI_STATE_BY_KEY = Object.freeze(Object.fromEntries(VOI_STATES.map((row) => [row.key, row])));
export const VOI_OPEN_STATE_KEYS = Object.freeze(VOI_STATE_KEYS.filter((key) => !['implemented', 'decided', 'decided-departing', 'decided-without-advice', 'advice-replied'].includes(key)));

/** The six sitting states: what a dated meeting actually proves. */
export const VOI_SITTING_STATES = Object.freeze([
  Object.freeze({ key: 'minutes-lapsed', label: 'Minutes overdue', tone: 'bad', says: 'The declared day for minutes has passed and none are on the record. A sitting nobody minuted cannot be shown to have advised anything.' }),
  Object.freeze({ key: 'minutes-late', label: 'Minutes recorded late', tone: 'warn', says: 'Minutes are on the record but arrived after the declared day. The exact late days stay printed.' }),
  Object.freeze({ key: 'minutes-owed', label: 'Minutes still due', tone: 'neutral', says: 'The sitting has been held and its minutes are still inside the declared day. Nothing is overdue yet.' }),
  Object.freeze({ key: 'below-quorum', label: 'Below quorum', tone: 'bad', says: 'Fewer representatives attended than the body’s own constitution requires. The register records the sitting and does not pretend the body transacted.' }),
  Object.freeze({ key: 'minuted', label: 'Minuted', tone: 'good', says: 'The sitting was held, attended, and minuted inside the declared day.' }),
  Object.freeze({ key: 'scheduled', label: 'Scheduled', tone: 'neutral', says: 'The sitting is dated in the future. Nothing is owed yet.' }),
]);
export const VOI_SITTING_STATE_KEYS = Object.freeze(VOI_SITTING_STATES.map((row) => row.key));
export const VOI_SITTING_STATE_BY_KEY = Object.freeze(Object.fromEntries(VOI_SITTING_STATES.map((row) => [row.key, row])));

/** Refusals printed at the door. Each one is a control, not a message. */
export const VOI_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That line is not one this seat holds. One line does not put another line’s work to a body.',
  noLine: 'Name at least one affected reporting line. An item no line owns is a change nobody is accountable for.',
});

export const VOI_SECTION_TITLES = Object.freeze({
  board: 'Board',
  items: 'Items',
  sittings: 'Sittings',
  lines: 'Lines',
  method: 'Method',
});

export const VOI_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'bodies_n', 'members_n', 'items_n', 'consultation_n',
  'negotiation_n', 'information_n', 'open_n', 'advice_owed_n', 'advice_lapsed_n',
  'advised_n', 'advised_late_n', 'replied_n', 'reply_overdue_n', 'decisions_n',
  'departed_n', 'without_advice_n', 'implemented_n', 'sittings_n', 'below_quorum_n',
  'minutes_lapsed_n', 'breaches_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #184 (ADR-0243, Schema v197). IDENTITY-FREE BY CONSTRUCTION. A consultation
 * record names representatives, a body, a subject somebody might be disciplined
 * for and a written advice. The export therefore carries counts and state keys
 * only: no person, no body name, no subject, no instrument reference, no advice
 * note, no reply note and no day. State keys are a published vocabulary, so a
 * reader can see which kind of failure the workspace is carrying without being
 * able to attach one to a human being or a body.
 */
export const VOI_CSV_DESCRIPTOR = Object.freeze({
  key: VOI_CSV_SCOPE,
  label: 'Employee voice & consultation (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'employee-voice',
  description: 'One summary row and one row per printed state. Counts of bodies, members in term, items by kind, advice owed and lapsed, advice received and received late, replies and replies overdue, decisions taken, decisions departing from advice, decisions taken with no advice, implementations, sittings, sittings below quorum and sittings whose minutes lapsed, plus the breach count. No person, body name, subject, instrument, advice note, reply note or day is exported.',
});

/** The published framework basis, printed on the method tab. Never a claim of parity. */
export const VOI_METHOD = Object.freeze({
  engine: VOI_ENGINE_VERSION,
  adr: VOI_ADR,
  frameworks: Object.freeze([
    'EU information-and-consultation framework (Directive 2002/14/EC; EWC recast 2009/38/EC): the body is informed and consulted on the matters within its competence, in good time, on the basis of relevant information, and the consultation must permit the body to express a view BEFORE the decision is taken.',
    'Hirschman (1970), Exit, Voice and Loyalty: a voice channel that is not answered is a channel that decays into exit, so the organisation’s reply to the body’s advice is a first-class dated act rather than a courtesy.',
    'Dundon & Wilkinson employee-voice literature: voice is a set of channels with different depth (information, consultation, negotiation), and conflating them is how "we consulted" becomes an unfalsifiable claim.',
    'Committee governance: quorum and minutes, because a body that transacted below its own quorum, or with no minute, cannot be shown to have advised anything at all.',
  ]),
  printed: Object.freeze([
    'The written instrument each item’s clock rests on, and the period it declared in whole days.',
    'The day the window closed, the day advice arrived, and the exact days late when it did.',
    'The day the decision was taken and whether it preceded the close of the window.',
    'The advice course, the organisation’s written reply and the exact days it took.',
    'Which affected reporting lines the item names, and the joint seat above them.',
    'Each sitting’s attendance against the body’s own declared quorum, and the exact days to minutes.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No default consultation period, no jurisdiction table and no statutory fallback: the window is declared per item from a written instrument.',
    'No per-representative attendance rate, cooperation index or body ranking. A voice channel that scores the people using it closes.',
    'No summarising or paraphrasing of the advice: the body’s own written note is stored and printed verbatim or not at all.',
    'No inference of an item from a change, a transition checklist tick or an existing decision.',
    'No automatic decision, no automatic close, and no repair of an imported decision that precedes its window.',
  ]),
});
