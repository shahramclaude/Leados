/**
 * app/core/domain/aarCorroborationRegistry.js — closed vocabulary for the
 * Cross-Line After-Action Corroboration & Lesson-Adoption Parity register
 * (ADR-0188, Session 256, Schema v149, `#/learning?panel=cross-line`,
 * CSV #141, `RULE-AAC-01`).
 *
 * THE DUTY. LeadOS has held a reviewed after-action ledger since Schema v43,
 * and a review has always been authored inside one line. When the event being
 * reviewed involved people on more than one reporting line, that single account
 * speaks for every line — the cause, the lesson and the follow-up action — and
 * nothing asked the other lines whether it is what happened, or whether they
 * have adopted the lesson they are now expected to act on. Four other registers
 * (ADR-0147 reviews, ADR-0166 merit evidence, ADR-0168 bench evidence, ADR-0185
 * change impacts) each closed this same blind spot; `learning.js` is the last
 * consequential record type without it.
 *
 * WHAT THIS REGISTER REFUSES TO DO
 * --------------------------------
 *   1. It never treats silence as agreement. `unrequested`, `pending`,
 *      `overdue` and `expired` are four printed states, and none of them counts
 *      as a corroboration.
 *   2. It never rewrites the AAR ledger. The lesson's own `applied` state
 *      remains the author's claim; adoption parity is printed BESIDE it. A
 *      lesson one line says it applied and another line refused is a
 *      disagreement, not an application.
 *   3. It never rates a person. The four outcomes describe THE ACCOUNT and THE
 *      LESSON; no field on any row is a judgement about a human.
 *   4. It never invents a line. A participant whose active line set cannot be
 *      read makes the affected row `unattributable`, with the reason printed.
 *   5. It never substitutes the home line for an ambiguous apex. An unresolved
 *      joint apex is counted and printed.
 *
 * Leaf module: imports nothing, so schema, read model, rule, actions, CSV and
 * view can all depend on it without an import cycle.
 */

export const AAR_CORROBORATION_ENGINE_VERSION = 'aar-corroboration-2026.11-v1';
export const AAR_CORROBORATION_ADR = 'ADR-0188';
export const AAR_CORROBORATION_RULE_ID = 'RULE-AAC-01';
export const AAR_CORROBORATION_PANEL = 'cross-line';
export const AAR_CORROBORATION_CSV_SCOPE = 'matrix-aar-corroboration';

export const AAR_CORROBORATION_EVENTS = Object.freeze({
  REQUESTED: 'learning.aar.corroboration.requested',
  RESPONDED: 'learning.aar.corroboration.responded',
  ADOPTED: 'learning.aar.corroboration.adopted',
  CONVENTIONS: 'learning.aar.corroboration.conventions.set',
  SCAN: 'learning.aar.corroboration.scan',
});

/**
 * Asking a line to corroborate is the act of a manager who reaches the review
 * (its author's span or a participant's line). Answering is the act of the
 * manager who HOLDS the named line — never a peer, never the person. Adopting a
 * lesson is a third, separate statement: a line saying it has taken the lesson
 * on. Governing the register is separate again because it changes conventions
 * for every seat.
 */
export const AAR_CORROBORATION_RIGHTS = Object.freeze({
  READ: 'read-aar-corroboration',
  REQUEST: 'request-aar-corroboration',
  RESPOND: 'respond-aar-corroboration',
  ADOPT: 'adopt-aar-lesson',
  GOVERN: 'govern-aar-corroboration',
});

/**
 * THE FOUR ANSWER OUTCOMES. Each describes the ACCOUNT and the LESSON, never
 * the person who wrote them. `partly` exists because the honest middle ground
 * is common — a line can support the lesson while disputing the recorded cause —
 * and forcing a binary would manufacture a dispute or a false agreement.
 */
export const AAR_CORROBORATION_OUTCOMES = Object.freeze([
  Object.freeze({
    key: 'corroborated', label: 'Corroborated', tone: 'good',
    says: 'This line agrees the recorded account and the lesson as written are sound, on its own evidence.',
    countsAsCorroboration: true,
  }),
  Object.freeze({
    key: 'partly', label: 'Part supported', tone: 'warn',
    says: 'This line supports the lesson but disputes the recorded cause, or the reverse. The note says which.',
    countsAsCorroboration: true,
  }),
  Object.freeze({
    key: 'disputed', label: 'Disputed', tone: 'bad',
    says: 'This line’s own evidence does not support the recorded account or the lesson. The reason is required.',
    countsAsCorroboration: false,
  }),
  Object.freeze({
    key: 'declined', label: 'Declined to answer', tone: 'warn',
    says: 'This line was asked and states why it will not answer. A decline is not a dispute and not an agreement.',
    countsAsCorroboration: false,
  }),
]);

export const AAR_CORROBORATION_OUTCOME_KEYS = Object.freeze(
  AAR_CORROBORATION_OUTCOMES.map((row) => row.key),
);

const OUTCOME_BY_KEY = new Map(AAR_CORROBORATION_OUTCOMES.map((row) => [row.key, row]));
export function aarCorroborationOutcome(key) {
  return OUTCOME_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * ANSWER VISIBILITY. A first-hand observation from a reviewer is stored and
 * printed but never counts as corroboration: "I saw something different" and "I
 * agree with what was recorded" are two different claims and collapsing them is
 * the failure this register exists to stop.
 */
export const AAR_CORROBORATION_ANSWER_KINDS = Object.freeze([
  Object.freeze({
    key: 'corroboration', label: 'A line’s answer',
    says: 'A first-person verdict from the manager who holds the requested line.',
    countsTowardCoverage: true,
  }),
  Object.freeze({
    key: 'observation', label: 'A reviewer’s observation',
    says: 'A first-hand note offered inside one line. It is evidence for a reviewer, never a line’s verdict.',
    countsTowardCoverage: false,
  }),
]);

export const AAR_CORROBORATION_ANSWER_KIND_KEYS = Object.freeze(
  AAR_CORROBORATION_ANSWER_KINDS.map((row) => row.key),
);

/**
 * THE REQUEST STATES, high severity first. Precedence is declared so no row can
 * be read as two different things and no refusal is folded into a reassuring
 * word.
 */
export const AAR_CORROBORATION_STATES = Object.freeze([
  Object.freeze({ key: 'unverifiable', label: 'Line state unreadable', tone: 'bad', severity: 0, says: 'The lines of the people this review touches cannot be resolved, so the register refuses to say who should answer. It is not a pass.' }),
  Object.freeze({ key: 'stale', label: 'Snapshot changed — answer is history', tone: 'bad', severity: 1, says: 'The review, its participants or their active lines changed after this request. The earlier answer is retained as history and no longer counts.' }),
  Object.freeze({ key: 'disputed', label: 'A line disputes the account', tone: 'bad', severity: 2, says: 'At least one answering line does not support the recorded account or lesson, with a reason. The disagreement is printed and nothing averages it away.' }),
  Object.freeze({ key: 'declined', label: 'A line declined to answer', tone: 'warn', severity: 3, says: 'A line was asked and states why it will not answer. Declining is not agreeing.' }),
  Object.freeze({ key: 'partly', label: 'Part supported', tone: 'warn', severity: 4, says: 'A line supports the lesson but disputes the recorded cause (or the reverse). The note names which.' }),
  Object.freeze({ key: 'overdue', label: 'No answer by the due date', tone: 'warn', severity: 5, says: 'The due date passed with no first-person answer. Silence is not corroboration.' }),
  Object.freeze({ key: 'pending', label: 'Awaiting the line’s answer', tone: 'warn', severity: 6, says: 'The line was asked and the due date has not passed.' }),
  Object.freeze({ key: 'unrequested', label: 'Not yet asked', tone: 'warn', severity: 7, says: 'No dated corroboration request exists for this line and review. Nothing is inferred from its absence.' }),
  Object.freeze({ key: 'corroborated', label: 'Corroborated by this line', tone: 'good', severity: 8, says: 'This line answered and agrees the recorded account and the lesson are sound.' }),
  Object.freeze({ key: 'expired', label: 'Answer’s validity passed', tone: 'warn', severity: 9, says: 'The line’s answer carried a validity window that has ended. It is kept as history and counted as not current.' }),
  Object.freeze({ key: 'superseded', label: 'Superseded request — history', tone: 'neutral', severity: 10, says: 'A later request for the same review and line is the current obligation.' }),
  Object.freeze({ key: 'historical', label: 'Review is history', tone: 'neutral', severity: 11, says: 'The review is no longer held (draft or skipped), so no current corroboration is owed for it.' }),
]);

const STATE_BY_KEY = new Map(AAR_CORROBORATION_STATES.map((row) => [row.key, row]));
export function aarCorroborationState(key) {
  return STATE_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * WHY A FIGURE IS NOT PRINTED ON READ. Distinct from the door's refusals: an act
 * that was legal when declared can become unattributable when a line ends. The
 * list is closed and the test suite fails the build if the reader raises a
 * reason that is not declared here, because an undeclared reason is a sentence
 * the method section cannot explain.
 */
export const AAR_CORROBORATION_READ_REFUSALS = Object.freeze([
  Object.freeze({ key: 'no-multi-line-participant', says: 'Every participant sits on one active line, so there is no second line to ask. The cross-line claim is inert, not satisfied.' }),
  Object.freeze({ key: 'lines-unresolvable', says: 'At least one participant’s active line set cannot be read, so the set of lines that owe an answer is incomplete.' }),
  Object.freeze({ key: 'no-lesson-under-review', says: 'The review as recorded carries no lesson, so there is nothing to corroborate or adopt.' }),
  Object.freeze({ key: 'review-not-held', says: 'The review has not been held, so no line can corroborate an account that does not yet exist.' }),
  Object.freeze({ key: 'subject-unlinked', says: 'The review was detached from the record it reviewed, so its participants and lines cannot be established from that record.' }),
  Object.freeze({ key: 'off-seat', says: 'The review sits outside the operating seat’s span and declared lines.' }),
  Object.freeze({ key: 'below-floor', says: 'The denominator is smaller than the declared disclosure floor, so a rate would describe one named person.' }),
  Object.freeze({ key: 'coverage-unreconciled', says: 'The printed line states do not add back to the required-line denominator.' }),
  Object.freeze({ key: 'rows-withheld', says: 'In-scope rows could not be disclosed in this seat’s view, so a coverage figure would rest on a partial display.' }),
]);

export const AAR_CORROBORATION_READ_REFUSAL_KEYS = Object.freeze(
  AAR_CORROBORATION_READ_REFUSALS.map((row) => row.key),
);

/**
 * ADOPTION PARITY, per touched line. This is a property of the LESSON and the
 * LINES IT TOUCHES, not of the person who wrote it. `not-asked` and
 * `unattributable` are printed as themselves and never counted as adopted.
 */
export const AAR_ADOPTION_STATES = Object.freeze([
  Object.freeze({ key: 'adopted', label: 'Adopted by this line', tone: 'good', severity: 0, says: 'The line recorded a dated adoption of this lesson, with a note saying what it changed.' }),
  Object.freeze({ key: 'refused', label: 'Line refuses to adopt', tone: 'bad', severity: 1, says: 'The line recorded, with a reason, that it will not adopt this lesson. The lesson author’s own state is unchanged and the disagreement is printed.' }),
  Object.freeze({ key: 'not-asked', label: 'Not asked to adopt', tone: 'warn', severity: 2, says: 'Nobody has asked this touched line to adopt the lesson. Silence is not adoption.' }),
  Object.freeze({ key: 'unattributable', label: 'Line cannot be resolved', tone: 'bad', severity: 3, says: 'An owner or participant the lesson touches has no readable active line, so this line is neither asked nor counted.' }),
]);

const ADOPTION_BY_KEY = new Map(AAR_ADOPTION_STATES.map((row) => [row.key, row]));
export function aarAdoptionState(key) {
  return ADOPTION_BY_KEY.get(String(key || '').trim()) || null;
}

/**
 * THE PARITY VERDICT for one lesson. Precedence is declared. `inert` is the
 * single-line / no-line-touched answer and is deliberately NOT a pass: a lesson
 * that touches one line is that line's business and the register says so rather
 * than reporting adoption as a cross-line success.
 */
export const AAR_PARITY_VERDICTS = Object.freeze([
  Object.freeze({ key: 'unattributable', label: 'Touched lines unresolved', tone: 'bad', severity: 0, says: 'A person the lesson touches has no readable active line. Parity cannot be stated.' }),
  Object.freeze({ key: 'inert', label: 'Not a cross-line lesson', tone: 'neutral', severity: 1, says: 'The lesson touches one line only. It is that line’s own business and this register claims nothing about it.' }),
  Object.freeze({ key: 'parity-broken', label: 'A touched line refused', tone: 'bad', severity: 2, says: 'At least one touched line recorded a reasoned refusal to adopt. The lesson’s own state is unchanged; the disagreement is the finding.' }),
  Object.freeze({ key: 'parity-open', label: 'A touched line has not adopted', tone: 'warn', severity: 3, says: 'At least one touched line has not been asked, or was asked and has not adopted. This is not a refusal and not an adoption.' }),
  Object.freeze({ key: 'parity-complete', label: 'Every touched line adopted', tone: 'good', severity: 4, says: 'Every line this lesson touches recorded a dated adoption.' }),
]);

const PARITY_BY_KEY = new Map(AAR_PARITY_VERDICTS.map((row) => [row.key, row]));
export function aarParityVerdict(key) {
  return PARITY_BY_KEY.get(String(key || '').trim()) || null;
}

/** Every reason a request can be refused at the door. */
export const AAR_CORROBORATION_REQUEST_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-review', says: 'That after-action review no longer exists in this workspace.' }),
  Object.freeze({ key: 'review-not-held', says: 'Only a held review can be corroborated; a draft or a skipped review has no account to answer for.' }),
  Object.freeze({ key: 'unknown-lesson', says: 'That lesson is not part of this review. A request names one recorded lesson or the review’s account as a whole.' }),
  Object.freeze({ key: 'no-multi-line-participant', says: 'Every participant sits on one active line. There is no second line to ask, and the register refuses to manufacture one.' }),
  Object.freeze({ key: 'lines-unresolvable', says: 'A participant’s active line set cannot be read. Resolve the named Matrix defect before asking a line to answer.' }),
  Object.freeze({ key: 'off-seat', says: 'The review sits outside your span and declared Matrix lines. A request cannot cross into a peer span.' }),
  Object.freeze({ key: 'self-line-only', says: 'The only lines this request could ask are ones you hold. A line holder cannot ask themself to answer for their own account.' }),
  Object.freeze({ key: 'bad-due-day', says: 'Choose an explicit due date inside the declared window. LeadOS never invents a deadline.' }),
  Object.freeze({ key: 'duplicate-request', says: 'A live request already exists for this review, lesson and line. Answer it or let it lapse; asking twice would double the denominator.' }),
  Object.freeze({ key: 'ledger-full', says: 'The request ledger holds its declared cap.' }),
]);

/** Every reason a first-person answer can be refused at the door. */
export const AAR_CORROBORATION_RESPONSE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-request', says: 'That dated corroboration request no longer exists.' }),
  Object.freeze({ key: 'not-line-holder', says: 'Only the manager named on the requested line can answer. A peer, a reviewer or the person cannot answer for somebody else’s line.' }),
  Object.freeze({ key: 'operator-not-first-person', says: 'A workspace operator is not a first-person line holder. Select the active seat named on this line before answering.' }),
  Object.freeze({ key: 'already-answered', says: 'This request already has its one dated answer. It is append-only; issue a new request when a refresh is due.' }),
  Object.freeze({ key: 'superseded', says: 'A later request is the current obligation. This one stays as history and cannot be answered.' }),
  Object.freeze({ key: 'snapshot-moved', says: 'The review, its participants or their lines changed after this request. The answer would be stale; issue a new request against the current snapshot.' }),
  Object.freeze({ key: 'bad-outcome', says: 'Choose one of the four declared outcomes. An empty answer is not a corroboration.' }),
  Object.freeze({ key: 'reason-too-short', says: 'A dispute or a decline needs a written reason at least as long as the declared minimum.' }),
  Object.freeze({ key: 'note-too-short', says: 'A part-support answer needs a note saying which half it supports.' }),
  Object.freeze({ key: 'bad-valid-through', says: 'The answer’s validity window is outside the declared bounds, or has already passed.' }),
  Object.freeze({ key: 'answer-ledger-full', says: 'The answer ledger holds its declared cap.' }),
]);

/** Every reason an adoption act can be refused at the door. */
export const AAR_ADOPTION_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-review', says: 'That after-action review no longer exists.' }),
  Object.freeze({ key: 'unknown-lesson', says: 'That lesson is not part of this review.' }),
  Object.freeze({ key: 'not-touched-line', says: 'That line is not one this lesson touches, so adopting it there would be a claim about work that line does not carry.' }),
  Object.freeze({ key: 'not-line-holder', says: 'Only the manager who holds a touched line can record that line’s adoption.' }),
  Object.freeze({ key: 'operator-not-first-person', says: 'A workspace operator is not a first-person line holder and cannot adopt on a line’s behalf.' }),
  Object.freeze({ key: 'already-adopted', says: 'This line already recorded an adoption of this lesson. The record is append-only.' }),
  Object.freeze({ key: 'bad-adopted-day', says: 'An adoption carries an explicit date; LeadOS does not date a claim for you.' }),
  Object.freeze({ key: 'note-too-short', says: 'An adoption needs a note saying what the line changed.' }),
  Object.freeze({ key: 'adoption-ledger-full', says: 'The adoption ledger holds its declared cap.' }),
]);

export const AAR_CORROBORATION_LIMITS = Object.freeze({
  requests: 1200,
  responses: 1200,
  adoptions: 1200,
  reportRows: 200,
  snapshotLines: 12,
  participants: 20,
  reasonMin: 8,
  reasonMax: 400,
  noteMax: 400,
  promptMax: 400,
  requestDueDays: Object.freeze([0, 30]),
  responseTermDays: Object.freeze([1, 365]),
  asksPerCommit: 8,
});

/* ------------------------------------------------------------------ settings */

export const AAR_CORROBORATION_SETTING_KEYS = Object.freeze({
  dueDays: 'aarCorroborationDueDays',
  minLines: 'aarCorroborationMinLines',
  adoptWarnDays: 'aarCorroborationAdoptWarnDays',
  autoPropagate: 'aarCorroborationAutoPropagate',
});

export const AAR_CORROBORATION_DEFAULTS = Object.freeze({
  /**
   * A request that goes this many days past its due date without an answer is a
   * derived `overdue` finding and reaches the rule. The due date itself is
   * always chosen by the human issuing the request; this is only the escalation
   * threshold, and it never invents a deadline.
   */
  dueDays: 14,
  /**
   * Below this many required line answers the coverage rate is withheld: a
   * fraction over one or two rows identifies the individuals behind it.
   */
  minLines: 3,
  /** A parity-open lesson older than this is escalated to the joint apex. */
  adoptWarnDays: 21,
  autoPropagate: true,
});

export const AAR_CORROBORATION_BOUNDS = Object.freeze({
  dueDays: Object.freeze([1, 60]),
  minLines: Object.freeze([2, 25]),
  adoptWarnDays: Object.freeze([1, 90]),
});

export const AAR_CORROBORATION_SETTING_LABELS = Object.freeze({
  [AAR_CORROBORATION_SETTING_KEYS.dueDays]: 'Days after a request’s due date before an unanswered line is escalated',
  [AAR_CORROBORATION_SETTING_KEYS.minLines]: 'Minimum required line answers before a coverage rate is printed',
  [AAR_CORROBORATION_SETTING_KEYS.adoptWarnDays]: 'Days a lesson may stay unadopted on a touched line before it is escalated',
  [AAR_CORROBORATION_SETTING_KEYS.autoPropagate]: 'File governed asks for unanswered or unadopted lessons on the shared spine',
});

/**
 * DISCLOSURE LADDER. Applied in the READ MODEL, never in the view, so a scoped
 * projection cannot be reconstructed from a field a higher-altitude seat does
 * not receive.
 */
export const AAR_CORROBORATION_DETAIL_REASONS = Object.freeze({
  full: 'The operating seat is the workspace view, or sits at rank 3 or above: named reviews, lines and answers are returned.',
  span: 'A manager seat reads the reviews it authorises and the participants in its span, and no others; names, lines and answer prose are withheld while the arithmetic stays intact.',
  none: 'No seat is declared, or the seat reaches nobody in this ledger: only workspace totals are returned and no rows at all, because a redacted row would read as an empty workspace.',
});

/* --------------------------------------------------------------------- csv */

/** CSV scope #141 — aggregate only. No person, review, lesson, line or prose. */
export const AAR_CORROBORATION_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'as_of',
  'held_reviews_n',
  'multi_line_reviews_n',
  'required_line_answers_n',
  'corroborated_n',
  'partly_n',
  'disputed_n',
  'declined_n',
  'pending_n',
  'overdue_n',
  'unrequested_n',
  'stale_n',
  'expired_n',
  'unverifiable_n',
  'superseded_n',
  'historical_n',
  'single_line_excluded_n',
  'lessons_n',
  'parity_complete_n',
  'parity_open_n',
  'parity_broken_n',
  'parity_inert_n',
  'parity_unattributable_n',
  'observations_n',
  'withheld_rows_n',
  'coverage_pct',
  'coverage_withheld',
  'coverage_withheld_reason',
  'parity_complete_pct',
  'parity_withheld',
  'counts_reconcile',
  'figures_complete',
  'engine_version',
]);

export const AAR_CORROBORATION_CSV_DESCRIPTOR = Object.freeze({
  key: AAR_CORROBORATION_CSV_SCOPE,
  label: 'Cross-line after-action corroboration & lesson parity (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'matrix-aar-corroboration',
  description: 'One workspace summary row plus one row per request state and per adoption-parity verdict: dated corroboration requests, first-person line answers, the parity partition and the three claims. NO person, manager, line, review id, lesson text, answer prose or decline reason. Coverage and parity rates are blank below the declared floor or when the read is incomplete; a corroboration is agreement with an account, never approval, and adoption parity never rewrites the review’s own state.',
});

/* ------------------------------------------------------------------ method */

export const AAR_CORROBORATION_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'aar', label: 'After-Action Review (US Army TC 25-20, 1993)',
    says: 'The four questions are the review’s own; this register adds who else saw the same event and whether they agree with the answer.',
  }),
  Object.freeze({
    key: 'double-loop', label: 'Double-loop learning (Argyris & Schön, 1978)',
    says: 'A lesson is only learning when a governing policy changes. Parity asks every line the lesson touches whether it actually changed, instead of accepting one line’s word.',
  }),
  Object.freeze({
    key: 'galbraith', label: 'Information-processing view of the organisation (Galbraith, 1974)',
    says: 'A review is an information artifact. When its information crosses a unit boundary, the receiving unit’s interpretation is not implied by the sender’s.',
  }),
  Object.freeze({
    key: 'garvin', label: 'Learning organisation (Garvin, 1993)',
    says: 'A learning organisation transfers knowledge across boundaries; a lesson adopted inside its author’s line and nowhere else has not been transferred.',
  }),
  Object.freeze({
    key: 'sosa', label: 'Interface mismatch (Sosa, Eppinger & Rowles, 2004)',
    says: 'The most expensive interface failures sit where organisational boundaries and work boundaries do not line up — precisely the accounts a single line writes alone.',
  }),
]);

export const AAR_CORROBORATION_METHOD = Object.freeze({
  unit: 'required line answer',
  definition: 'One dated request to ONE line holder — the manager who holds an active line of at least one participant in a held after-action review — and one current first-person answer from that holder. A holder with several participants answers once about the review’s account; that holder is one line, and asking them twice for the same account would inflate the denominator. A reviewer’s observation is stored and never counted.',
  notSaid: 'A corroboration is not approval of the outcome, not consent, not a performance judgement about any person, and not a rewrite of the review. It states only whether this line agrees with the account and the lesson as recorded.',
  coverage: 'Coverage counts `corroborated` and `partly` answers whose snapshot still matches and whose validity window has not ended, over the required-line denominator. Silence, a decline, a dispute, a stale answer and an observation are each counted separately and none of them counts as coverage.',
  parity: 'Parity is per lesson and per touched line HOLDER: the holders of every line belonging to the lesson’s owner, to every participant, and to every person the lesson’s own evidence names. Adoption is a statement a manager makes about their accountability, so a holder with several touched people adopts once and the row prints how many people and kinds it rests on. A lesson is parity-complete only when every touched holder recorded a dated adoption. Refusal, silence and an unresolvable holder are three different printed outcomes; a lesson touching one holder is `inert`, because that is one manager’s own business and not a cross-line transfer.',
});

/**
 * The one sentence a reader needs when they meet the answer column: the four
 * outcomes describe an account, and an observation is never an answer.
 */
export const AAR_CORROBORATION_ANSWERS_NOTE = 'Four outcomes, all about the ACCOUNT: corroborated, part supported, disputed and declined. A reviewer\'s first-hand observation is stored and printed, and it never counts as a line\'s answer. No field on any row is a judgement about a person.';

/** The link/event words this register writes. */
export const AAR_CORROBORATION_EVENT_PREFIX = 'learning.aar.corroboration';
export const AAR_CORROBORATION_ASK_PREFIX = 'AAR-CORR-ASK';
export const AAR_CORROBORATION_CLOSED_PREFIX = 'Closed by RULE-AAC-01:';
