/**
 * app/core/domain/asgRegistry.js — the closed vocabulary of the Secondment /
 * Assignment Return & Handover Register (ADR-0262, Schema v214,
 * `#/secondment`, `RULE-ASG-01`, CSV scope #198).
 *
 * THE DUTY, IN A MID-MANAGER'S WORDS. *"Samuel left my team in March for a
 * nine-month secondment to Priya's programme. June's review moved the return to
 * December. In December nobody decided anything — HR assumed he had come back,
 * Priya's team assumed he was staying, the two goals he carried were covered by
 * a contractor whose contract ended in October, and the first anyone wrote any
 * of this down was the exit interview. The workspace moved duties between
 * people a hundred times this year. It never once moved a PERSON across lines
 * and then asked whether anyone brought them back."*
 *
 * The workspace moves duties well — delegations, portfolio handovers, shift
 * handovers — and records people starts and exits. It never recorded the
 * ACT itself: a person taken from one line to another for a period, the duties
 * they carried and who covered each one, the decision that had to be made
 * BEFORE the declared return day, and the handback evidence from both lines.
 * `goalCommitmentRegistry.js` prints the absence in its own prose: a secondment
 * "does not exist in this workspace yet". This register is that absence,
 * closed.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD. The roadmap logged this gap at
 * Session 312 (Step 3) and left it Planned: *"the workspace moves duties well
 * (delegations, handovers) but never moves a person across lines for a period
 * and then asks the question every matrix organisation must answer: did they
 * come back, to which line, on which day, and who carried — and then handed
 * back — their duties while they were away?"* Word-boundary searches of `app/`
 * returned zero implementations for `seconded`, `assignment end`, `duty
 * transfer`, `home line duties` and `gardener` before this build. Wider
 * semantic absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORKS THIS REGISTER APPLIES, named not paraphrased:
 *
 *   - **Repatriation failure (Black, Gregersen & Mendenhall 1992; Scullion &
 *     Collings 2006).** The international-HR literature's most-replicated
 *     finding is that the return — not the departure — is where assignment
 *     programmes fail: no dated decision, no duty handback, the person drifts.
 *     This register makes the return decision a dated act with a clock.
 *   - **Principal–agent and incomplete contracts (Jensen & Meckling 1976;
 *     Hart & Moore 1988).** A secondment is a temporary reallocation of an
 *     agent between two principals. The conversion of a temporary move into a
 *     permanent one is the classic hold-up point, so it requires the HOME
 *     principal's own dated consent — a separate act, never implied by the
 *     passage of time or by silence.
 *   - **Reliability engineering: fail-safe versus fail-secure.** The register
 *     is fail-secure on the calendar: a return day that passes with no
 *     decision is printed `return-decision-overdue`, and the system NEVER
 *     auto-converts, auto-extends or auto-returns. Silence is a state, not a
 *     decision.
 *   - **Segregation of duties (COSO 2013; IIA).** The hand that carried the
 *     duty is not the hand that confirms its return. Handback is evidenced
 *     from BOTH the home and the host line, and the accountable seat is the
 *     matrix joint apex above all of them — never one manager on another's
 *     behalf.
 *
 * WHAT THIS REGISTER ADDS THAT A SPREADSHEET CANNOT. Five facts it expresses
 * that a typed row cannot:
 *
 *   - **The return decision is an act with a clock, not a column.** A
 *     spreadsheet holds a "planned end date" nobody owns. This register
 *     derives `decision-due` and `return-decision-overdue` from the declared
 *     day and files an ask to the joint apex above both lines.
 *   - **A conversion never completes silently.** `convert` needs the home
 *     line's own dated consent before the state moves, and both handbacks
 *     before it prints `transferred`. The register never edits the roster.
 *   - **Coverage is named per duty, never inferred from an org chart.** An
 *     `uncovered` duty prints as a hole, not as reassurance.
 *   - **Both lines hand back.** One side's word is not a handback; the
 *     register prints `handback-open` until both sides' evidence is on file.
 *   - **An overdue return never becomes a permanent move.** The state prints
 *     the exact days overdue and the assignment stays exactly what it was.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, PREVENTED BY CONSTRUCTION:
 *   - **No auto-end, no auto-extend, no auto-convert.** Every transition is a
 *     dated human act or it does not happen.
 *   - **No inferred coverage.** A duty cover is named by a hand or the hole is
 *     printed. The register never reads coverage off goals, delegations or
 *     org position.
 *   - **No roster edit.** A completed transfer is evidence that a roster
 *     change is OWED; the change itself is a separate human act in the matrix
 *     module. This register writes nothing to `person.managerId`.
 *   - **No score on the person.** No flexibility rating, no "good secondment"
 *     grade, no comparison between people. The register measures its own
 *     acts and its own clocks, never a person's adaptability.
 *   - **No re-dated decision.** A decision recorded after the return day in
 *     force keeps its own day and prints `decided-late` with the exact days.
 *     The declared return day is never moved to make a late act timely.
 *   - **No handback on one side's word.** Both sides' evidence, or the state
 *     stays open.
 */

export const ASG_ENGINE_VERSION = 'assignment-return-2026.11-v1';
export const ASG_ADR = 'ADR-0262';
export const ASG_RULE_ID = 'RULE-ASG-01';
export const ASG_ROUTE = 'secondment';
export const ASG_HREF = '#/secondment';
export const ASG_CSV_SCOPE = 'secondment';
export const ASG_MARKER_KIND = 'secondment';
export const ASG_EVENT_PREFIX = 'asg.';

/**
 * THE AGGREGATE EXPORT SHAPE (CSV scope #198). Every figure is a COUNT over
 * the whole register or a PUBLISHED-vocabulary key — the state keys and cover
 * keys are the same closed set the screen prints. No assignment reference,
 * person, manager, cover hand, duty label, terms reference, rationale, basis,
 * evidence reference or day crosses this boundary. A per-state count below the
 * declared privacy floor exports BLANK with its reason, never as a small
 * number.
 */
export const ASG_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key',
  'assignments_n', 'planned_n', 'active_n', 'decision_due_n', 'return_decision_overdue_n',
  'handback_open_n', 'returned_n', 'transfer_consent_owed_n', 'transfer_handback_open_n', 'transferred_n',
  'decisions_n', 'extends_n', 'decided_late_n', 'coverage_rows_n',
  'named_cover_n', 'retained_by_home_n', 'uncovered_n',
  'handbacks_n', 'consents_n', 'unresolved_hands_n',
  'privacy_floor', 'complete', 'blank_reason',
]);

export const ASG_CSV_DESCRIPTOR = Object.freeze({
  key: ASG_CSV_SCOPE,
  label: 'Secondment & assignment-return register (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'secondment',
  description: 'One summary row, one row per printed state and one row per coverage kind. Counts of assignments in each derived state, the decision and extension counts with the decided-late count, the named/retained/uncovered duty-cover split, the handback and consent act counts and the unresolved-hand count; the declared privacy floor. No assignment reference, person, manager, cover hand, duty label, terms reference, rationale, basis, evidence reference or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

export const ASG_EVENTS = Object.freeze({
  ASSIGNMENT_DECLARED: 'asg.assignment.declared',
  COVER_DECLARED: 'asg.cover.declared',
  DECISION_RECORDED: 'asg.decision.recorded',
  CONSENT_RECORDED: 'asg.consent.recorded',
  HANDBACK_RECORDED: 'asg.handback.recorded',
  CONVENTIONS_SET: 'asg.conventions.set',
  SCANNED: 'asg.scan',
});

export const ASG_RIGHTS = Object.freeze({
  READ: 'read-secondment',
  MANAGE: 'manage-secondment',
});

export const ASG_SETTING_KEYS = Object.freeze({
  autoPropagate: 'asgAutoPropagate',
  privacyFloor: 'asgPrivacyFloor',
  warnHorizonDays: 'asgWarnHorizonDays',
  handbackHorizonDays: 'asgHandbackHorizonDays',
});

export const ASG_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
  warnHorizonDays: { min: 1, max: 365 },
  handbackHorizonDays: { min: 1, max: 365 },
});

export const ASG_DEFAULTS = Object.freeze({
  autoPropagate: true,
  privacyFloor: 3,
  warnHorizonDays: 14,
  handbackHorizonDays: 14,
});

export const ASG_LIMITS = Object.freeze({
  idMax: 120,
  textMax: 2000,
  shortMax: 200,
  shortMin: 1,
  dutyMin: 2,
  dutyMax: 160,
  rationaleMin: 3,
  rationaleMax: 600,
  termsMax: 300,
  noteMax: 600,
  asksPerCommit: 4,
});

/** The act kinds, in the one acts ledger. */
export const ASG_ACT_KINDS = Object.freeze(['return-decision', 'home-consent', 'handback']);

export const ASG_ACT_KIND_BY_KEY = Object.freeze({
  'return-decision': { key: 'return-decision', label: 'Return decision' },
  'home-consent': { key: 'home-consent', label: 'Home-line consent' },
  handback: { key: 'handback', label: 'Handback' },
});

/**
 * The three return-decision kinds. `extend` answers the question in force and
 * opens a new one at a later declared day. `return` answers it and opens the
 * handback. `convert` answers it, opens the home-consent question, and — only
 * once consent and both handbacks are on file — prints `transferred`.
 */
export const ASG_DECISION_KEYS = Object.freeze(['extend', 'return', 'convert']);

export const ASG_DECISION_BY_KEY = Object.freeze({
  extend: { key: 'extend', label: 'Extend', detail: 'The assignment continues to a new declared return day. The extension decision itself is timed against the return day it answered.' },
  return: { key: 'return', label: 'Return', detail: 'The assignment ends at the return day in force. Both lines must evidence the handback before the register prints returned.' },
  convert: { key: 'convert', label: 'Convert to transfer', detail: 'The move becomes permanent — but only with the home line’s own dated consent and both handbacks. The register never edits the roster.' },
});

/** Which side of the assignment a handback is received on. */
export const ASG_SIDE_KEYS = Object.freeze(['home', 'host']);

export const ASG_SIDE_BY_KEY = Object.freeze({
  home: { key: 'home', label: 'Home line' },
  host: { key: 'host', label: 'Host line' },
});

/** The duty-coverage vocabulary. Named, never inferred. */
export const ASG_COVER_KINDS = Object.freeze(['named-cover', 'retained-by-home', 'uncovered']);

export const ASG_COVER_BY_KEY = Object.freeze({
  'named-cover': { key: 'named-cover', label: 'Named cover', detail: 'A named hand carries this duty while the person is away. The cover is a declaration by the home line, never inferred from the org chart.' },
  'retained-by-home': { key: 'retained-by-home', label: 'Retained by home', detail: 'The home line keeps this duty in its own hands. No cover hand is named and none is needed.' },
  uncovered: { key: 'uncovered', label: 'Uncovered', detail: 'A declared duty with nobody carrying it. The hole is printed and asked about; it is never smoothed over.' },
});

/**
 * The derived states. NINE facts, each a different answer to one question —
 * *where is this assignment in its own lifecycle?* — recomputed on every read
 * from the declared day, the act ledger and the injected clock:
 *
 *   planned                     the start day is still in the future.
 *   return-decision-overdue     the return day in force has passed with no
 *                               decision answering it. The exact days are
 *                               printed. It NEVER auto-converts.
 *   decision-due                the return day in force is inside the warn
 *                               horizon and no decision answers it.
 *   active                      in window, beyond the horizon, no decision.
 *   handback-open               the decision was `return` and at least one
 *                               side's handback evidence is missing.
 *   returned                    `return`, both handbacks on file.
 *   transfer-consent-owed       `convert` and the home line's consent is
 *                               missing. Nobody is transferred by silence.
 *   transfer-handback-open      `convert`, consent on file, a handback missing.
 *   transferred                 `convert`, consent and both handbacks on file.
 */
export const ASG_STATE_KEYS = Object.freeze([
  'planned',
  'return-decision-overdue',
  'decision-due',
  'active',
  'handback-open',
  'returned',
  'transfer-consent-owed',
  'transfer-handback-open',
  'transferred',
]);

export const ASG_STATE_BY_KEY = Object.freeze({
  planned: { key: 'planned', label: 'Planned', tone: 'neutral', detail: 'The assignment is declared and its start day is still in the future.' },
  'return-decision-overdue': { key: 'return-decision-overdue', label: 'Return decision overdue', tone: 'bad', detail: 'The return day in force has passed with no decision recorded. The assignment is neither ended nor extended nor converted — silence changes nothing.' },
  'decision-due': { key: 'decision-due', label: 'Decision due', tone: 'warn', detail: 'The return day in force is inside the declared warn horizon and no return decision answers it yet.' },
  active: { key: 'active', label: 'Active', tone: 'good', detail: 'The person is away within the declared window and the return question is still open beyond the warn horizon.' },
  'handback-open': { key: 'handback-open', label: 'Handback open', tone: 'warn', detail: 'The decision was to return, but handback evidence from both the home and the host line is not complete.' },
  returned: { key: 'returned', label: 'Returned', tone: 'good', detail: 'The decision was to return and both lines have evidenced the handback.' },
  'transfer-consent-owed': { key: 'transfer-consent-owed', label: 'Transfer consent owed', tone: 'warn', detail: 'The decision was to convert to a transfer, but the home line’s own dated consent is not on file. Nobody is transferred by silence.' },
  'transfer-handback-open': { key: 'transfer-handback-open', label: 'Transfer handback open', tone: 'warn', detail: 'The conversion has the home line’s consent but handback evidence from both lines is not complete.' },
  transferred: { key: 'transferred', label: 'Transferred', tone: 'good', detail: 'The conversion has the home line’s dated consent and both handbacks on file. The roster change itself is a separate human act — this register never edits it.' },
});

export const ASG_CONDITION_KEYS = Object.freeze([
  'return-decision-due',
  'return-decision-overdue',
  'duty-cover-uncovered',
  'handback-incomplete',
  'transfer-consent-owed',
]);

export const ASG_CONDITION_BY_KEY = Object.freeze({
  'return-decision-due': { key: 'return-decision-due', label: 'Return decision due', detail: 'The return day in force is inside the warn horizon and no return decision answers it.' },
  'return-decision-overdue': { key: 'return-decision-overdue', label: 'Return decision overdue', detail: 'The return day in force has passed with no decision recorded.' },
  'duty-cover-uncovered': { key: 'duty-cover-uncovered', label: 'Duty uncovered', detail: 'A declared duty has no named cover and is not retained by the home line.' },
  'handback-incomplete': { key: 'handback-incomplete', label: 'Handback incomplete', detail: 'A return or conversion is decided but handback evidence from both lines is missing past the handback horizon.' },
  'transfer-consent-owed': { key: 'transfer-consent-owed', label: 'Transfer consent owed', detail: 'A conversion is decided but the home line’s own dated consent is missing and the move is due or past due.' },
});

export const ASG_REFUSALS = Object.freeze({
  badAssignment: 'secondment:bad-assignment',
  badCover: 'secondment:bad-cover',
  badAct: 'secondment:bad-act',
  badWindow: 'secondment:bad-window',
  sidesIdentical: 'secondment:sides-identical',
  personIsSide: 'secondment:person-is-side',
  duplicateAssignment: 'secondment:duplicate-assignment',
  unknownAssignment: 'secondment:unknown-assignment',
  assignmentNotStarted: 'secondment:assignment-not-started',
  questionAnswered: 'secondment:question-answered',
  noForwardMotion: 'secondment:no-forward-motion',
  missingRationale: 'secondment:missing-rationale',
  missingBasis: 'secondment:missing-basis',
  missingEvidence: 'secondment:missing-evidence',
  consentWithoutConvert: 'secondment:consent-without-convert',
  handbackWithoutDecision: 'secondment:handback-without-decision',
  badSide: 'secondment:bad-side',
  futureDay: 'secondment:future-day',
  sideNotHeld: 'secondment:side-not-held',
  consentHand: 'secondment:consent-hand',
  handbackHand: 'secondment:handback-hand',
  outsideSeat: 'secondment:outside-seat',
  noRight: 'secondment:no-right',
});

export const ASG_PAUSE_SWITCH = 'asgAutoPropagate';

export function asgState(key) {
  return ASG_STATE_BY_KEY[key] || null;
}

export function asgCondition(key) {
  return ASG_CONDITION_BY_KEY[key] || null;
}

export function asgCoverKind(key) {
  return ASG_COVER_BY_KEY[key] || null;
}
