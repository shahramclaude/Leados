/**
 * app/core/domain/lineReaffirmationRegistry.js — the declared vocabulary of the
 * Matrix Line Re-Affirmation Register (ADR-0157, Schema v129,
 * `#/matrix?panel=renewal`, CSV scope #118).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. "Priya has held 40% of Sam since
 * September 2023. Sam's share is still charged at 40% of a person, Priya's
 * project no longer exists, and the only reason the number is still there is
 * that nobody ever called it back. The line was agreed for a delivery; the
 * delivery ended two years ago."
 *
 * THAT IS THE GAP THE OTHER LINE MODULES DO NOT CLOSE.
 *
 *   ADR-0148 (line consent)   records the FIRST answer: a manager accepted a
 *                             share on a day, and the acceptance carries a window.
 *                             When that window closes the line reads `lapsed` —
 *                             an accurate reading of an OLD question.
 *   ADR-0152 (line exit)      reads the work an ENDED line left behind. It waits
 *                             for someone to date the line out.
 *   ADR-0140 (the ledger)     keeps charging the share every day the line is
 *                             still declared, because a declaration stands until
 *                             a human ends it. That part is correct.
 *
 * What none of them does is the ordinary management act in between: **a line
 * that is still in force but whose agreement has run out has to be put back in
 * front of the people it binds, and it must be possible for it to FAIL — for the
 * person whose hours it takes, or the line itself, to say "no longer".** Without
 * that, consent decays into inheritance. Forty percent accepted by a manager two
 * years ago is forty percent nobody has agreed to today, and the register says so
 * on every roll-up that inherits it.
 *
 * WHAT THIS MODULE IS. A TERM OF OFFICE for a declared line, and the re-asking
 * protocol that term implies, in the same shape ADR-0148 gave the first answer
 * (declared → asked → answered), but with the one difference that makes it a
 * re-affirmation: **the answer can end the line.** A re-affirmation is not a
 * renewal of the question; it is a decision about whether this commitment still
 * holds, taken by the people who are bound by it, on a dated day, with the
 * CURRENT share in front of them.
 *
 *   line side    the manager who holds the line answers `reaffirm` (it still
 *                holds, at this share, until this date) or `release` (it does
 *                not — the line ends on the day they said, with a reason).
 *   person side  the person whose hours are taken answers `accept` (I am still
 *                on the hook to these people for these hours) or `object` (I am
 *                not — recorded, and the line is NOT ended by it, because ending
 *                somebody else's accountability is not the person's act; the
 *                objection escalates it as a finding and a named ask).
 *
 * THREE STATES OF A TERM, AND ONE ABSENCE THAT IS NOT A STATE.
 *
 *   `in-term`            a reaffirmed term covers today. Nothing is due.
 *   `reaffirmation-due`  the term's end day is inside the declared warning
 *                        window — still in force, and the question is open.
 *   `term-lapsed`        the term ended on or before today and no reaffirmation
 *                        reaches today. The line still CHARGES its share; the
 *                        agreement behind it does not cover today.
 *   `no-term`            no reaffirmation has ever been recorded for this line,
 *                        and the declaration carries no declared term either.
 *                        This is the state of every line in every workspace that
 *                        has not used this module yet, and it is NOT "fine": it
 *                        is unagreed, and it is printed that way.
 *
 * `lapsed` and `no-term` are the two readings that make the register worth
 * opening; neither is a person's fault and neither is a person's rating.
 *
 * WHAT IT REFUSES TO DO (Bulletproof Reliability Mandate)
 * ------------------------------------------------------
 *  - It never renews by arithmetic. A term that ran out is not extended because
 *    the work continued; no engine wrote an extension in this product and none
 *    does here. The declaration is untouched by every read.
 *  - It never reuses the original consent. The share accepted in 2023 is a dated
 *    fact; a reaffirmation must state the share it was given for, and a line
 *    retuned since that answer reads `changed` rather than inheriting agreement
 *    to a number nobody agreed to (ADR-0148's rule, carried forward).
 *  - It never treats silence as either continuation or release. A line nobody
 *    re-affirmed reads `term-lapsed`, not "renewed" and not "ended".
 *  - It never ends a line by itself. `release` records a decision a human made
 *    and names the day; the declaration's own end is the governed
 *    `matrixEndLine` action, run by the manager. An engine that ended lines would
 *    be silently removing accountability, which is the exact failure the matrix
 *    ledger was built to prevent.
 *  - It never accepts a re-affirmation that would take a person past one whole
 *    person, and it prints the arithmetic when it refuses.
 *  - It is INERT in a single-chain workspace: no second line, no term, no ask.
 *
 * Cross-domain basis
 * ------------------
 *  - Sunset-clause governance (Madisonian sunset provisions; the legislative
 *    re-authorisation pattern): authority granted for a period lapses at the end
 *    of that period unless re-authorised, and the burden of renewal sits on the
 *    holder of the authority rather than on the person whose capacity it takes.
 *  - Goold & Campbell, *Designing Effective Organizations* (2002) and the
 *    permanent-versus-temporary matrix literature (Hardy, *Managing Strategic
 *    Action*, 1994): DURATION is a design variable of a matrix line, and a
 *    temporary structure that is never closed becomes a permanent cost nobody
 *    chose.
 *  - Barnard (1938) zone of indifference and Simon (1947) decision premises: an
 *    instruction is obeyed inside a zone the recipient has ACCEPTED, and an
 *    acceptance is a statement about a moment — it does not travel indefinitely.
 *  - Kahneman & Tversky's status-quo/default effect and the omission bias: an
 *    inherited commitment is never re-examined because nobody's act changes it.
 *    The register makes continuation an ACT rather than an absence of one.
 *  - Park, Schmidt et al. on implicit renewal and evergreen contracts: an
 *    agreement that renews by silence transfers the option value to the party who
 *    benefits from the default. Making renewal explicit restores it to both.
 */

export const LINE_REAFFIRMATION_ENGINE_VERSION = 'line-reaffirmation-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const LINE_REAFFIRMATION_RULE_ID = 'RULE-LRF-01';

/**
 * Every stored row is ONE dated human act on one declared line:
 *   REAFFIRM   the line's manager says the commitment still holds, at the share
 *              it was given for, until the date they set;
 *   RELEASE    the line's manager ends the commitment, with a stated reason and
 *              the day it ends;
 *   ACCEPT     the person says the share is still taken from their hours;
 *   OBJECT     the person says it is not, in their own words;
 *   SCAN       an explicit operator retry for asks a cap deferred.
 * None of them edits a declaration, a share or a decision right.
 */
export const LINE_REAFFIRMATION_EVENTS = Object.freeze({
  REAFFIRM: 'matrix.line.reaffirmed',
  RELEASE: 'matrix.line.released',
  ACCEPT: 'matrix.line.reaffirmation.accepted',
  OBJECT: 'matrix.line.reaffirmation.objected',
  SCAN: 'matrix.line.reaffirmation.scan',
});

/** The two sides. Neither may answer for the other. */
export const LINE_REAFFIRMATION_SIDES = Object.freeze({
  manager: 'manager',
  person: 'person',
});

/** Manager-side outcomes. */
export const LINE_REAFFIRMATION_MANAGER_OUTCOMES = Object.freeze(['reaffirm', 'release']);
/** Person-side outcomes. */
export const LINE_REAFFIRMATION_PERSON_OUTCOMES = Object.freeze(['accept', 'object']);

/**
 * Seven line states. Printed, never collapsed: "nobody ever gave this line a
 * term", "the term has run out", "the line's manager renewed it and the person
 * has not answered", "a person objected", "the commitment was released",
 * "re-accepted at a different share", and "in term" imply seven different next
 * actions, and only the last is nothing-to-do.
 */
export const LINE_REAFFIRMATION_STATES = Object.freeze({
  noTerm: 'no-term',
  due: 'reaffirmation-due',
  lapsed: 'term-lapsed',
  awaitingPerson: 'awaiting-person',
  objected: 'person-objected',
  released: 'released',
  changed: 'changed-share',
  inTerm: 'in-term',
});

export const LINE_REAFFIRMATION_STATE_LABELS = Object.freeze({
  'no-term': 'No term ever declared',
  'reaffirmation-due': 'Re-affirmation due',
  'term-lapsed': 'Term lapsed',
  'awaiting-person': 'Re-affirmed, person not answered',
  'person-objected': 'The person objected',
  released: 'Released by the line',
  'changed-share': 'Re-affirmed a different share',
  'in-term': 'In term',
});

export const LINE_REAFFIRMATION_STATE_TONES = Object.freeze({
  'no-term': 'warn',
  'reaffirmation-due': 'warn',
  'term-lapsed': 'bad',
  'awaiting-person': 'warn',
  'person-objected': 'bad',
  released: 'neutral',
  'changed-share': 'bad',
  'in-term': 'good',
});

/** States in which the line's agreement does NOT cover today. */
export const LINE_REAFFIRMATION_UNCOVERED_STATES = Object.freeze([
  LINE_REAFFIRMATION_STATES.noTerm,
  LINE_REAFFIRMATION_STATES.lapsed,
  LINE_REAFFIRMATION_STATES.objected,
  LINE_REAFFIRMATION_STATES.changed,
  LINE_REAFFIRMATION_STATES.released,
]);

/**
 * Per-person verdicts. Declared precedence, so the rule, the panel, the brief
 * and the CSV cannot disagree about which word a row gets.
 */
export const LINE_REAFFIRMATION_VERDICTS = Object.freeze([
  { key: 'released', label: 'A line was released and is still charged', severity: 0, tone: 'bad', open: true,
    detail: 'The line decided its accountability ended, and the declaration has not been dated out, so the ledger still charges the share. Releasing is a decision; only a human ending the declaration makes the charge follow it.' },
  { key: 'objected', label: 'A person objected to a share still charged', severity: 1, tone: 'bad', open: true,
    detail: 'The person whose hours the line takes said, in their own words, that the commitment no longer holds. Nobody asked the person to end somebody else’s line — but the share is still charged and the objection is a finding that has to reach a human.' },
  { key: 'changed-share', label: 'A line was re-affirmed at a different share', severity: 2, tone: 'bad', open: true,
    detail: 'The share on the declaration is not the share the line re-affirmed. Re-affirming 40% is not agreeing to 90%, so the register prints both numbers and refuses to read the old answer as covering the new share.' },
  { key: 'over-term', label: 'The re-affirmed shares exceed one whole person', severity: 3, tone: 'bad', open: true,
    detail: 'The shares the lines have RE-AFFIRMED for this person add up to more than 100% of her. The record now contains a commitment the person cannot honour.' },
  { key: 'lapsed', label: 'A term ran out and nobody renewed it', severity: 4, tone: 'bad', open: true,
    detail: 'The line is still in force and the ledger still charges its share, but the agreement behind it ended on a day in the past. Inheritance is not consent; the line has to be re-affirmed or dated out.' },
  { key: 'due', label: 'A re-affirmation is due', severity: 5, tone: 'warn', open: true,
    detail: 'The line is still in term, and its end day is inside the declared warning window. The question is open now rather than on the day the share quietly stops being agreed.' },
  { key: 'awaiting-person', label: 'The person has not answered', severity: 6, tone: 'warn', open: true,
    detail: 'The line re-affirmed the commitment and the person whose hours it takes has not answered since. One side is not both sides.' },
  { key: 'no-term', label: 'No term was ever declared', severity: 7, tone: 'warn', open: true,
    detail: 'This line has never been given a term. That is not evidence that it is wrong — it is evidence that nobody has asked, and the declaration is inherited every day until somebody does.' },
  { key: 'in-term', label: 'In term, both sides answered', severity: 8, tone: 'good', open: false,
    detail: 'Every line in force has a re-affirmed term covering today and the person whose hours it takes has answered inside that term.' },
  { key: 'single-line', label: 'Single line — nothing to re-affirm', severity: 9, tone: 'neutral', open: false,
    detail: 'This person reports to one manager. There is no second share to call back and the ordinary single-chain record applies.' },
]);

export const LINE_REAFFIRMATION_VERDICT_KEYS = Object.freeze(LINE_REAFFIRMATION_VERDICTS.map((v) => v.key));
const VERDICT_BY_KEY = new Map(LINE_REAFFIRMATION_VERDICTS.map((v) => [v.key, v]));

export function lineReaffirmationVerdict(key) {
  return VERDICT_BY_KEY.get(String(key || '').trim()) || null;
}

/** Bounds on stored acts and printed rows. Every cap is counted, never silent. */
export const LINE_REAFFIRMATION_LIMITS = Object.freeze({
  /** Acts kept against one workspace. Oldest displaced, displacement printed. */
  acts: 900,
  /** Acts retained in one line's printed history. */
  perLine: 16,
  /** Characters in a release reason. */
  reasonChars: 400,
  /** Characters in a person's objection. */
  objectionChars: 400,
  /** Characters in the manager's stated basis for a re-affirmation. */
  basisChars: 600,
  /** Rule idempotency markers retained for this module. */
  markers: 900,
  /** Person rows the panel renders before the remainder is counted only. */
  rows: 40,
  /** Minimum characters in a release reason or an objection. */
  minReason: 8,
});

/** Bounds on the two declared windows, in whole days. */
export const LINE_REAFFIRMATION_BOUNDS = Object.freeze({
  /** How long a re-affirmed term may run. One year is the outer bound. */
  termDays: Object.freeze([14, 730]),
  /** How far ahead of a term's end the question opens. */
  warnDays: Object.freeze([0, 180]),
  /** How long a line's manager has to answer the ask the rule issued. */
  askDueDays: Object.freeze([1, 60]),
});

export const LINE_REAFFIRMATION_DEFAULTS = Object.freeze({
  termDays: 365,
  warnDays: 30,
  askDueDays: 14,
});

/**
 * The three declared windows above are ALSO the settings this module adds. They
 * are clamped, printed, and never fitted from the record.
 */
export const LINE_REAFFIRMATION_SETTINGS_KEYS = Object.freeze([
  'lineReaffirmTermDays',
  'lineReaffirmWarnDays',
  'lineReaffirmAskDueDays',
]);

/**
 * The rights this module uses, named on the same spine as every other command.
 * Re-affirming a line is the line's own manager's act and is open at every
 * leadership rank (a project lead with no home-line reports is exactly who holds
 * a line); ending a commitment outright is the same act, because it is the same
 * decision about the same line. Answering as the person is a separate right.
 */
export const LINE_REAFFIRMATION_RIGHTS = Object.freeze({
  read: 'declare-matrix-line',
  reaffirm: 'reaffirm-matrix-line',
  answer: 'answer-line-reaffirmation',
});

/** One unit of the internal share scale is one whole percent of a person. */
export const LINE_REAFFIRMATION_FULL_H = 100;

/** CSV scope #118: aggregate-only. No person, no name, no declaration id. */
export const LINE_REAFFIRMATION_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'line_kind',
  'lines_n',
  'no_term_n',
  'due_n',
  'lapsed_n',
  'awaiting_person_n',
  'objected_n',
  'released_n',
  'changed_share_n',
  'in_term_n',
  'uncovered_share_h',
  'reaffirmed_share_h',
  'persons_n',
  'persons_uncovered_n',
  'share_refused',
  'share_refused_reason',
]);

/** What the panel prints about its own method. */
export const LINE_REAFFIRMATION_METHOD = Object.freeze([
  Object.freeze({
    name: 'Sunset-clause governance (re-authorisation, not perpetual grant)',
    why: 'Authority granted for a period lapses at the end of that period unless it is re-authorised, and the burden of renewal sits on the holder of the authority. A line with no term is printed as UNTERMED rather than assumed permanent, and a term that ran out reads `term-lapsed` rather than renewing by silence.',
  }),
  Object.freeze({
    name: 'Duration as a matrix design variable (Goold & Campbell; Hardy)',
    why: 'A temporary structure that is never closed becomes a permanent cost nobody chose. The line’s term is a design parameter a leader sets, and this register reads it against the declaration instead of inferring it from how long the line has existed.',
  }),
  Object.freeze({
    name: 'Barnard’s zone of indifference; Simon’s decision premises',
    why: 'An acceptance is a statement about a moment, not a standing grant. Both sides answer inside the term: the manager re-affirms or releases, and the person whose hours are taken accepts or objects. One side is not both sides.',
  }),
  Object.freeze({
    name: 'Explicit renewal over the status-quo default (omission bias)',
    why: 'An inherited commitment is never re-examined because no act changes it. This register makes continuation an ACT by a named person on a dated day, and prints continuation-by-absence as its own state so a reader can tell the difference.',
  }),
  Object.freeze({
    name: 'Report, never act',
    why: 'Stored: dated answers only. Derived on every read: every state, every day count, every verdict and every total. Releasing a commitment records a decision; it never dates out the declaration, ends the charge, edits a share or reassigns a right. Ending a line remains the governed `matrixEndLine` action run by a human.',
  }),
]);

/** Printed on the panel so the reading cannot be mistaken for a renewal. */
export const LINE_REAFFIRMATION_LIMITS_TEXT = Object.freeze([
  'A re-affirmation records who ANSWERED, not who is willing. It is a stated commitment on a stated day; it is not evidence that the hours were worked or that the work was delivered.',
  'A release does NOT end the declaration, so the ledger keeps charging the share until a human dates the line out with the governed End action. The register prints the difference rather than quietly subtracting it.',
  'A person’s objection is recorded and escalates; it does not end somebody else’s accountability, because ending a line is the line manager’s act, not the informed party’s.',
  'This register never renews a term by arithmetic. A term that ran out is not extended because the work continued, and no extension is written by an engine.',
  'Seats are workflow declarations, not authentication. A seat check is a routing control, not an identity boundary. Where a person has no leadership seat, the operator view may record their answer as a scribed statement; the row is marked `operator` and never prints as an authenticated identity.',
  'LeadOS reads the home line from `person.managerId`; this register covers DECLARED additional lines only. Home-line history is ADR-0149’s.',
]);

/** The questions this panel answers, printed so a reader knows what it is for. */
export const LINE_REAFFIRMATION_QUESTIONS = Object.freeze([
  'Which declared lines are still charged to a person, and which of them has anyone actually agreed to TODAY?',
  'Which line’s term has run out while the work quietly continued, and how long ago did it end?',
  'Which lines are inside their warning window, so the question can be asked before the share stops being agreed rather than after?',
  'Where a line re-affirmed the commitment, has the person whose hours it takes answered since — and did anybody object?',
  'Which released commitments are STILL being charged to a person because the declaration was never dated out?',
]);
