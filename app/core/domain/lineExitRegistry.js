/**
 * app/core/domain/lineExitRegistry.js — the declared vocabulary of the Matrix
 * Line-Exit Obligation Register (ADR-0152, Schema v127, `RULE-LEX-01`,
 * `#/matrix?panel=exit`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. "Priya's project line for Sam was dated out
 * on 31 March. The review input ask we sent Priya in February is still open, and
 * Sam's project onboarding brief was never acknowledged. Nothing in the workspace
 * tells me whether those asks are still owed by anyone, or whether I am looking
 * at work that structurally cannot close."
 *
 * That is the failure this register exists for. Every other matrix module reads
 * the LIVE line set: consent asks the manager the line was given to, stewardship
 * asks the manager who held the line during a review period, onboarding asks the
 * manager who holds the line in the window. The moment a line is dated out, all
 * of that work keeps its addressee and its roll-up edge while the line that
 * justified it no longer exists — so a person is chased about a job they no
 * longer hold, a manager carries an ask about a project that ended, and a
 * director reads an open-work figure that will never move.
 *
 * WHAT THIS MODULE IS
 * -------------------
 * One bounded read model over the open obligations the workspace ALREADY
 * records, matched against the lines that have actually ENDED. For every ended
 * line: which dated obligations it left open, whose words they are, whether the
 * work each one is about could even have been owed on that line, and the ONE
 * human act that settles it — retire it with a stated reason, or carry it
 * forward to a named manager who now owns it.
 *
 * WHAT IT IS NEVER ALLOWED TO DO (Bulletproof Reliability Mandate)
 * ---------------------------------------------------------------
 *  - It never RE-POINTS an obligation. Moving an ask from one manager to another
 *    is fabricating an accountability nobody accepted; a carry must name a
 *    manager who holds a live line for that person TODAY, and a retired
 *    obligation is never deleted — the remedy row is the record.
 *  - It never VOIDS an obligation by arithmetic. A line that ended before the
 *    work window began is FLAGGED (`after`), never silently dropped: the
 *    register does not decide that an ask is unnecessary. A human does.
 *  - It never treats silence as settlement. An open obligation on an ended line
 *    is `open`, with the whole days it has been open printed.
 *  - It never invents an end date. A line whose end day is not recorded, or an
 *    obligation naming a line key that no longer exists anywhere, reads
 *    `unverifiable` with the reason printed and is NOT counted as settled.
 *  - It never claims the HOME line. `person.managerId` has a recorded history in
 *    ADR-0149's ledger, and this register refuses to invent a home-line end from
 *    a pointer: home-keyed obligations are counted and handed to the structure
 *    reconciliation, not adjudicated here.
 *  - It counts LINES and OBLIGATIONS, never line-people; one person on two ended
 *    lines is two lines and one person, and both figures are printed.
 */

export const LINE_EXIT_ENGINE_VERSION = 'line-exit-2026.11-v1';

/** The one rule this module adds to the shared spine. */
export const LINE_EXIT_RULE_ID = 'RULE-LEX-01';

/**
 * Two declared events, each one human act:
 *   REMEDY  a leader settles ONE open obligation left by an ended line;
 *   SCAN    an explicit retry of the work a per-transaction cap deferred.
 * The rule also fires on `matrix.line.ended` and on `review.completed`, because
 * those are the two ordinary acts that create an obligation on a line that may
 * already be gone.
 */
export const LINE_EXIT_EVENTS = Object.freeze({
  REMEDY: 'matrix.line.exit.remedied',
  SCAN: 'matrix.line.exit.scan',
});

/** The right that settles an obligation. Every command is gated on it. */
export const LINE_EXIT_RIGHTS = Object.freeze({
  remedy: 'close-line-obligation',
});

/**
 * The obligation sources this register can read WITHOUT an inference.
 *
 * A source qualifies only when the stored record carries the LINE KEY it was
 * addressed to, so the register can prove which line left it. Two of the three
 * register families qualify today. The third — a line-consent acknowledgement —
 * does not: the ask is a generated delegation that names the person and no line,
 * so including it would mean guessing which line the ask belonged to. The panel
 * prints that limitation rather than inventing the join.
 */
export const LINE_EXIT_SOURCES = Object.freeze([
  Object.freeze({
    key: 'onboarding-brief',
    label: 'Line onboarding brief',
    detail: 'A dated brief a line wrote for a joiner that the person has never acknowledged. The line owes the person an agreement; nobody else can give it for them.',
  }),
  Object.freeze({
    key: 'review-input',
    label: 'Review input ask',
    detail: 'An ask for a line’s input into a performance review that the line never answered or declined. The packet is waiting on a line that may no longer exist.',
  }),
]);

export const LINE_EXIT_SOURCE_KEYS = Object.freeze(LINE_EXIT_SOURCES.map((s) => s.key));

/**
 * Three derived obligation states. Precedence is by NAME here, not by severity:
 * a remedy is a human act and outranks the absence of one.
 */
export const LINE_EXIT_STATES = Object.freeze({
  /** No remedy recorded. The obligation is still owed by whoever holds it. */
  open: 'open',
  /** A human stated that nothing was owed, with a reason. Closed, never deleted. */
  retired: 'retired',
  /** A human stated that the obligation survives the line and named who owes it. */
  carried: 'carried',
});

export const LINE_EXIT_STATE_LABELS = Object.freeze({
  open: 'Open — no remedy recorded',
  retired: 'Retired by a leader, with a reason',
  carried: 'Carried forward to a named manager',
});

export const LINE_EXIT_STATE_TONES = Object.freeze({
  open: 'warn',
  retired: 'good',
  carried: 'neutral',
});

/** The three states as an ordered list, so a count can never invent a fourth. */
export const LINE_EXIT_STATE_KEYS = Object.freeze([
  LINE_EXIT_STATES.open,
  LINE_EXIT_STATES.retired,
  LINE_EXIT_STATES.carried,
]);

/**
 * Did the obligation's own work window fall inside the line's window at all?
 *
 * `after`   the work the ask is about begins after the line ended, or ends
 *           before the line began: nothing on that line could have been owed.
 *           It is a PROMPT to retire, never a retirement.
 * `overlaps` the obligation's window and the line's window meet: the line could
 *           genuinely have owed the work, and the ask outlived the line.
 * `unknown`  one side carries no dated window. The register prints that it
 *           cannot tell instead of assuming the reassuring answer.
 */
export const LINE_EXIT_WINDOWS = Object.freeze({
  overlaps: 'overlaps',
  after: 'after',
  unknown: 'unknown',
});

export const LINE_EXIT_WINDOW_LABELS = Object.freeze({
  overlaps: 'The work window overlaps the line',
  after: 'The work window falls after the line ended',
  unknown: 'No dated work window — cannot tell',
});

/**
 * Five verdicts, one per ENDED LINE, with declared precedence so the rule, the
 * panel and the CSV cannot disagree about a word. `severity` is a sort key, not
 * a judgement about a person.
 */
export const LINE_EXIT_LINE_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'vanished',
    label: 'Obligation names a line that no longer exists',
    severity: 0,
    tone: 'bad',
    open: true,
    detail: 'An open obligation carries a line key that resolves to no declaration at all: the line was deleted rather than dated out, or it never existed. The register cannot say when it ended or who held it, so it refuses to classify the obligation and counts it as unsettled.',
  }),
  Object.freeze({
    key: 'open-obligation',
    label: 'The line ended with an obligation still open',
    severity: 1,
    tone: 'bad',
    open: true,
    detail: 'A person or a manager is still the addressee of work the ended line created. Either the work is still owed and needs a named owner, or nothing was owed and a leader must say so — the register will not decide which.',
  }),
  Object.freeze({
    key: 'carried',
    label: 'Every open obligation was carried to a named manager',
    severity: 2,
    tone: 'neutral',
    open: false,
    detail: 'A human stated that the obligations survive the line and named the manager who now owes them. The obligation is still owed; it is no longer unattributed.',
  }),
  Object.freeze({
    key: 'remedied',
    label: 'Every obligation was retired with a reason',
    severity: 3,
    tone: 'good',
    open: false,
    detail: 'A human stated, in writing, that nothing on this line was owed. The rows stand as history and no work is issued off them.',
  }),
  Object.freeze({
    key: 'no-obligation',
    label: 'The line ended with nothing open',
    severity: 4,
    tone: 'neutral',
    open: false,
    detail: 'No stored ask or unacknowledged brief names this line. That is a printed fact about the record, not evidence that the line delivered everything it promised.',
  }),
]);

export const LINE_EXIT_LINE_VERDICT_KEYS = Object.freeze(LINE_EXIT_LINE_VERDICTS.map((v) => v.key));

export function lineExitLineVerdict(key) {
  return LINE_EXIT_LINE_VERDICTS.find((v) => v.key === key) || null;
}

/**
 * Five workspace verdicts, declared precedence first-match:
 *   single-chain → unverifiable → orphaned → carried → remedied → clear.
 */
export const LINE_EXIT_VERDICTS = Object.freeze([
  Object.freeze({ key: 'single-chain', label: 'Single chain — nothing has ended', severity: 0, tone: 'neutral' }),
  Object.freeze({ key: 'unverifiable', label: 'An open obligation cannot be attributed to a line', severity: 1, tone: 'bad' }),
  Object.freeze({ key: 'orphaned', label: 'Ended lines left work still open', severity: 2, tone: 'bad' }),
  Object.freeze({ key: 'carried', label: 'Ended lines left work carried by a named manager', severity: 3, tone: 'warn' }),
  Object.freeze({ key: 'remedied', label: 'Every obligation of every ended line was retired with a reason', severity: 4, tone: 'good' }),
  Object.freeze({ key: 'clear', label: 'No ended line left any obligation', severity: 5, tone: 'good' }),
]);

export const LINE_EXIT_VERDICT_KEYS = Object.freeze(LINE_EXIT_VERDICTS.map((v) => v.key));

export function lineExitVerdict(key) {
  return LINE_EXIT_VERDICTS.find((v) => v.key === key) || null;
}

/** Two bounds, both printed, neither fitted to the record. */
export const LINE_EXIT_BOUNDS = Object.freeze({
  /** Days a remedy ask may carry before it is due. */
  dueDays: [1, 30],
});

export const LINE_EXIT_DEFAULTS = Object.freeze({
  dueDays: 7,
});

export const LINE_EXIT_LIMITS = Object.freeze({
  /** Remedy rows kept against one workspace. Oldest displaced, displacement printed. */
  remedies: 600,
  /** Rule idempotency markers retained for this module. */
  markers: 600,
  /** Characters in a remedy reason. */
  reasonChars: 400,
  /** Lines the board renders before the remainder is counted only. */
  board: 40,
  /** Rows one person's ended-line reading keeps after the cap. */
  rows: 120,
  /** Obligations one delegation marker may name before it is summarised. */
  markerKeys: 12,
  /** Provenance edges one delegation may write (ancestors). */
  ancestors: 40,
});

/** Minimum characters in a remedy reason: a bare "no" is not an answer. */
export const LINE_EXIT_MIN_REASON = 12;

/** Minimum characters in a brief or a delegation title. */
export const LINE_EXIT_MIN_SCOPE = 8;

/**
 * CSV columns. AGGREGATE ONLY: no person, no name, no manager id, no line id and
 * no free text. A line is identified by its KIND and a stable position, which is
 * enough to reconcile the export against the panel and nothing more.
 */
export const LINE_EXIT_CSV_COLUMNS = Object.freeze([
  'row_kind',
  'line_position',
  'line_role',
  'line_kind',
  'line_ended_on',
  'line_window_verifiable',
  'obligations',
  'open',
  'retired',
  'carried',
  'overdue',
  'after_window',
  'unknown_window',
  'max_days_open',
  'verdict',
  'verdict_open',
]);

/**
 * The named methods. The module prints these; it does not paraphrase them.
 * Each one is a real framework, not a metaphor.
 */
export const LINE_EXIT_METHOD = Object.freeze([
  Object.freeze({
    name: 'Orphaned work-in-process accounting (Goldratt, 1984; APICS WIP close-out discipline)',
    why: 'A work order whose cost centre has closed keeps consuming capacity until somebody closes it. The register prints every obligation an ended line left in process, with its age in whole days, instead of reporting an open-work figure that cannot move.',
  }),
  Object.freeze({
    name: 'Valid time versus transaction time (Snodgrass, 1999)',
    why: 'The line carries the days it was in force; the obligation carries the days the work it is about was possible. Only the overlap of the two can support a claim that the work was owed. The register computes the overlap and refuses the claim when either side is undated.',
  }),
  Object.freeze({
    name: 'Exit-criteria hygiene (PMI PMBOK, project closure)',
    why: 'A project is not closed when its date passes; it is closed when every open action has an owner or a written retirement. This register is the closure checklist the workspace never produced, and it is refused at the point where a human has not answered.',
  }),
  Object.freeze({
    name: 'Accountability without authority (Martin, 1993; RACI consent)',
    why: 'Re-pointing an ask to a manager who never agreed the work is exactly the shadow accountability ADR-0148 refuses. A carry must name a manager who holds a LIVE line for that person today; nothing is reassigned silently.',
  }),
]);

/** Every honest limit, printed on the Method panel and in the brief. */
export const LINE_EXIT_LIMITS_TEXT = Object.freeze([
  'This register never re-points an obligation. Retiring one records a reason; carrying one names a manager who holds a live line for that person today. Neither act deletes the original ask.',
  'A line that ended before the work window began is FLAGGED, never retired automatically. The register does not decide that an ask was unnecessary — a human does, in writing.',
  'A line whose end day is not recorded, and an obligation naming a line key that resolves to nothing, read `unverifiable`. They are counted, never treated as settled.',
  'The HOME line is not adjudicated here. `person.managerId` has a recorded history (ADR-0149), and home-keyed obligations are counted and handed to that reconciliation rather than given an invented end date.',
  'A line-consent acknowledgement ask is NOT read as an obligation: the generated ask names a person and no line, so joining it would be a guess. The panel says so instead of guessing.',
  'Nothing derived is stored: no state, no window verdict, no day count and no total. Every figure is recomputed from the stored asks, the dated declarations and the remedy rows on each read.',
  'Seats are workflow declarations, not authentication. A seat check is a routing control, not an identity boundary.',
]);

/** Refusals, each printed with the reason. */
export const LINE_EXIT_REFUSALS = Object.freeze({
  singleChain: 'This workspace has no ended reporting line, so there is no obligation left behind one. Nothing was recorded.',
  unknownObligation: 'That obligation does not resolve on an ended line any more. Reload the register and choose the row again.',
  alreadySettled: 'That obligation has been answered by the person or the line it was addressed to. An answered obligation cannot be retired: the answer is the record, and a remedy on top of it would rewrite it.',
  alreadyRetired: 'That obligation is already retired, with the reason on the record. A second retirement would add nothing.',
  reasonTooShort: 'Say why nothing is owed, or why the obligation survives the line. A bare refusal is indistinguishable from a forgotten one.',
  carryUnnamed: 'Name the manager who now owes this obligation. Carrying work to nobody is the same as leaving it orphaned.',
  carryNotHolder: 'That manager holds no live line for this person and does not hold their home line. Carrying an obligation to somebody who never took it is exactly the shadow accountability this register refuses.',
  notYourSpan: 'That line is outside your operating seat.',
  noEndedLine: 'That line has not ended. Obligations on a live line are read by the registers that own them.',
});

/**
 * The four questions this register answers, printed on the panel header so a
 * reader knows what the figures are for.
 */
export const LINE_EXIT_QUESTIONS = Object.freeze([
  'Which lines have ended, and on what day?',
  'Which dated obligations did each of them leave open, and whose words are they?',
  'Could the work each ask is about even have been owed on that line?',
  'Who has settled it — or nobody?',
]);

export const LINE_EXIT_HOME_SCOPE_NOTE = 'Home-line obligations are counted separately and are not adjudicated here: person.managerId has a recorded history (ADR-0149) and this register will not invent a home-line end from a pointer.';

export const LINE_EXIT_CONSENT_SCOPE_NOTE = 'A line-consent acknowledgement ask is not read as an obligation because the generated ask names a person and no line; joining it to a line would be a guess.';

export function currentLineExitSettingsDEFAULTS() {
  return { lineExitDueDays: LINE_EXIT_DEFAULTS.dueDays };
}
