/**
 * app/core/domain/lineConsentRegistry.js — the declared vocabulary of Matrix
 * Line Consent (ADR-0148, Schema v123, `#/matrix?panel=consent`).
 *
 * THE DUTY. ADR-0140 lets one manager DECLARE that another holds 40% of a
 * person. ADR-0141 lets that manager then read the work. Neither act asks the
 * people the number is about. So the register can print:
 *
 *   - a project manager nominally owning 40% of an engineer she has never
 *     agreed a delivery with,
 *   - an engineer who was never told she is on the hook to two people for the
 *     same hours,
 *   - a home manager still planning her at 100%,
 *   - and a roll-up that adds all of it up as though every share had been
 *     accepted by somebody.
 *
 * That failure has a name in practice: SHADOW ACCOUNTABILITY — responsibility
 * that exists on a chart and nowhere in the relationship. It is the normal way
 * a matrix rots: not one bad decision, but a register of commitments no human
 * ever answered.
 *
 * WHAT THIS MODULE IS. The consent protocol the ledger was missing, in the same
 * shape ADR-0127 gave declared duty covers (declared → asked → accepted /
 * declined / lapsed). Two humans answer, each for themselves:
 *
 *   manager side  the manager who was GIVEN the line accepts the share and its
 *                 decision rights, or declines with a stated reason.
 *   person side   the person the share is taken from acknowledges it: "I am on
 *                 the hook to these people for these hours."
 *
 * WHAT IT REFUSES TO DO (Bulletproof Reliability Mandate)
 * -------------------------------------------------------
 *  - It never turns a declaration into an acceptance. `unanswered` is its own
 *    printed state: a share nobody answered is not a share that was agreed.
 *  - It never treats silence as agreement, and never treats a decline as
 *    nothing: a declined line is still CHARGED by the ledger's arithmetic, so
 *    the difference is printed as a named finding, not quietly subtracted.
 *  - It never accepts a share that would take a person past one whole person.
 *    The arithmetic is printed with the refusal (40 + 70 = 110 of 100).
 *  - It never lets a manager accept on the person's behalf, or a person accept
 *    on a manager's behalf. Each side is that seat's own first-person act.
 *  - It is INERT in a single-chain workspace: no second line, no row, no ask.
 *
 * Cross-domain basis: consent-based RACI and the "accountability without
 * authority" literature; French & Raven's (1959) distinction between assigned
 * and ACCEPTED authority; Barnard's (1938) zone of indifference — an
 * instruction is obeyed only inside a zone the recipient has accepted; and
 * Simon's (1947) decision-premise account of why an unaccepted assignment is
 * not a commitment but a proposal.
 */

export const LINE_CONSENT_ENGINE_VERSION = 'line-consent-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const LINE_CONSENT_RULE_ID = 'RULE-LCN-01';

/**
 * Every stored row is ONE human act, dated, by one named side:
 *   ACCEPT       a line's manager accepted this share and these rights;
 *   DECLINE      a line's manager refused the share, with a reason;
 *   ACKNOWLEDGE  the person accepted that this share is taken from her hours;
 *   SCAN         an explicit operator retry for work a cap deferred.
 * A declaration (`matrix.line.declared`) and its retune/end are the rule's
 * other triggers; none of them is itself an acceptance.
 */
export const LINE_CONSENT_EVENTS = Object.freeze({
  ACCEPT: 'matrix.line.accepted',
  DECLINE: 'matrix.line.declined',
  ACKNOWLEDGE: 'matrix.line.acknowledged',
  SCAN: 'matrix.line.consent.scan',
});

/** The two sides. Neither may answer for the other. */
export const LINE_CONSENT_SIDES = Object.freeze({
  manager: 'manager',
  person: 'person',
});

/**
 * Five states for one declared line. Printed, never collapsed: "nobody has
 * answered", "the manager refused", "the acceptance expired", "the manager
 * accepted but the person was never told", and "both people answered" imply
 * five different next actions and four of them are not consent.
 */
export const LINE_CONSENT_STATES = Object.freeze({
  unanswered: 'unanswered',
  declined: 'declined',
  /**
   * The line was accepted at one share and the declaration now carries a
   * DIFFERENT share. Consent to 40% is not consent to 90%: the acceptance stored
   * the number it was given for, so the register can print the difference instead
   * of quietly inheriting a bigger commitment.
   */
  changed: 'changed',
  lapsed: 'lapsed',
  awaitingPerson: 'awaiting-person',
  accepted: 'accepted',
});

export const LINE_CONSENT_STATE_LABELS = Object.freeze({
  unanswered: 'Never answered',
  declined: 'Declined by the line',
  changed: 'Accepted a different share',
  lapsed: 'Acceptance lapsed',
  'awaiting-person': 'Accepted, person not told',
  accepted: 'Accepted and acknowledged',
});

export const LINE_CONSENT_STATE_TONES = Object.freeze({
  unanswered: 'caution',
  declined: 'bad',
  changed: 'bad',
  lapsed: 'bad',
  'awaiting-person': 'warn',
  accepted: 'good',
});

/** A line is SETTLED only when both sides have answered in its favour. */
export const LINE_CONSENT_SETTLED_STATES = Object.freeze([LINE_CONSENT_STATES.accepted]);

/**
 * Per-person verdict. Declared precedence, so the rule, the panel and the CSV
 * cannot disagree about which word a row gets.
 */
export const LINE_CONSENT_VERDICTS = Object.freeze([
  { key: 'over-accepted', label: 'Accepted past one whole person', severity: 0, tone: 'bad', open: true,
    detail: 'The shares the managers have ACCEPTED for this person add up to more than 100% of her. The record now contains a commitment the person physically cannot honour.' },
  { key: 'changed-share', label: 'A line was retuned after it was accepted', severity: 1, tone: 'bad', open: true,
    detail: 'The share on the declaration is not the share the manager accepted. The acceptance recorded the number it was given for, so the register prints both and refuses to read the old consent as covering the new share.' },
  { key: 'declined-line', label: 'A line was declined and is still charged', severity: 2, tone: 'bad', open: true,
    detail: 'A manager refused the share it was given, and the ledger still counts that share because the declaration itself was never withdrawn. Only the declaring manager or the span above both can end the line.' },
  { key: 'lapsed', label: 'An acceptance expired', severity: 3, tone: 'bad', open: true,
    detail: 'A line was accepted, but the declared acceptance window has closed. Consent that never expires is consent nobody can be held to.' },
  { key: 'unanswered', label: 'A line was never answered', severity: 4, tone: 'warn', open: true,
    detail: 'The person holds a declared share and the manager it was given to has neither accepted nor declined it. The share is an ask, not an agreement.' },
  { key: 'awaiting-person', label: 'The person was never told', severity: 5, tone: 'warn', open: true,
    detail: 'A manager accepted the share but the person whose hours it is has not acknowledged it. A commitment made about someone without them is not a commitment they hold.' },
  { key: 'consented', label: 'Both sides consented', severity: 6, tone: 'good', open: false,
    detail: 'Every declared line in force has been accepted by its manager and acknowledged by the person, inside the declared window.' },
  { key: 'single-line', label: 'Single line — nothing to consent', severity: 7, tone: 'neutral', open: false,
    detail: 'This person reports to one manager. There is no second share to accept and the ordinary single-chain record applies.' },
]);

export const LINE_CONSENT_VERDICT_KEYS = Object.freeze(LINE_CONSENT_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(LINE_CONSENT_VERDICTS.map((v) => [v.key, v]));

export function lineConsentVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Bounds on stored acts and printed rows. Every cap is counted, never silent. */
export const LINE_CONSENT_LIMITS = Object.freeze({
  /** Acts kept against one workspace. Oldest displaced, displacement printed. */
  decisions: 800,
  /** Acts against one declaration that are retained in the row history. */
  perLine: 24,
  /** Characters in a decline reason. */
  reasonChars: 400,
  /** Characters in an acceptance basis (what this line is on the hook to deliver). */
  basisChars: 600,
  /** Rule idempotency markers retained for this module. */
  markers: 800,
  /** Rows the board renders before the remainder is counted only. */
  board: 40,
});

/** Bounds on the two declared windows, in whole days. */
export const LINE_CONSENT_BOUNDS = Object.freeze({
  /** How long an acceptance stands before it must be re-affirmed. */
  acceptDays: Object.freeze([7, 365]),
  /** How long a line's manager has to answer an ask the rule issued. */
  askDueDays: Object.freeze([1, 30]),
  /** How long the person has to acknowledge an acceptance before it is chased. */
  ackDays: Object.freeze([1, 30]),
});

export const LINE_CONSENT_DEFAULTS = Object.freeze({
  acceptDays: 90,
  askDueDays: 7,
  ackDays: 5,
});

/**
 * The rights this module uses, named on the same spine as every other command.
 * Reading the register is the matrix register's own read right: this panel adds
 * no new visibility, it only reaches the people the seat already reaches.
 */
export const LINE_CONSENT_RIGHTS = Object.freeze({
  read: 'declare-matrix-line',
  accept: 'accept-matrix-line',
  acknowledge: 'acknowledge-matrix-line',
});

/** One unit of the internal share scale is one whole percent of a person. */
export const LINE_CONSENT_FULL_H = 100;

/** CSV scope #110: aggregate-only. No person, no name, no declaration id. */
export const LINE_CONSENT_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'line_kind',
  'lines_n',
  'unanswered_n',
  'declined_n',
  'lapsed_n',
  'changed_share_n',
  'awaiting_person_n',
  'accepted_n',
  'declared_share_h',
  'accepted_share_h',
  'persons_n',
  'persons_over_accepted_n',
  'persons_undeclared_n',
  'share_refused',
  'share_refused_reason',
]);

/** What the panel prints about its own method. */
export const LINE_CONSENT_METHOD = Object.freeze([
  Object.freeze({
    name: 'Consent-based RACI (assigned vs accepted authority)',
    why: 'A declared share is an assignment. Only the manager’s dated acceptance, and the person’s own dated acknowledgement, make it a commitment. The register prints which one it holds and never substitutes one for the other.',
  }),
  Object.freeze({
    name: 'Barnard’s zone of indifference; Simon’s decision premises',
    why: 'An instruction is obeyed inside a zone the recipient has accepted. A share nobody acknowledged sits outside it, so the register names it as unanswered rather than counting it as capacity that will actually be delivered.',
  }),
  Object.freeze({
    name: 'Exact integer arithmetic on one person',
    why: 'Shares are whole percentages of one person and every total is an integer sum of printed rows. 40 + 70 = 110 is printed, refused and never rounded, netted or normalised down to 100.',
  }),
  Object.freeze({
    name: 'Expiry, not permanence',
    why: 'An acceptance carries a declared window. Consent that never expires cannot be distinguished from consent nobody revisited, so a lapsed line reads lapsed — not accepted, and not unanswered either.',
  }),
  Object.freeze({
    name: 'What is derived and what is stored',
    why: 'Stored: the dated acts only. Derived on every read: every state, every lapse, every day count, every verdict and every total. A printed state therefore cannot drift from the acts that produced it.',
  }),
]);

/** Printed on the panel so the reading cannot be mistaken for a survey. */
export const LINE_CONSENT_LIMITS_TEXT = Object.freeze([
  'This register records who ANSWERED, not who is willing. An accepted line is a stated commitment on a stated date; it is not evidence that the hours were worked.',
  'A declined line is not removed from the matrix ledger’s arithmetic. The panel prints the difference and names it, because only a human can end a declaration.',
  'LeadOS does not store when `person.managerId` changed, so the home line is read as in force for the whole record and the panel says so rather than inventing a date.',
  'Seats are workflow declarations, not authentication. A seat check is a routing control, not an identity boundary. Where a person has no leadership seat, the operator view may record their acknowledgement as a scribed statement; the row is marked `operator` and never prints as an authenticated identity.',
  'An acceptance records who ANSWERED, not how many hours were worked. Reading it as effort is exactly the inference this register refuses.',
]);
