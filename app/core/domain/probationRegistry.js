/**
 * app/core/domain/probationRegistry.js — closed vocabulary for the Probation
 * Confirmation Gate Register (ADR-0233, `RULE-PBG-01`).
 *
 * THE DUTY, IN THE OPERATOR'S WORDS. Somebody was hired on a probationary
 * period. The contract and the law give that period an end day, and the
 * confirming manager must make a real decision before it — confirm, extend
 * where the instrument allows, or end within the short notice the window
 * carries. Then three things happen in most organisations and none of them is
 * visible anywhere in the workspace:
 *
 *   1. the day passes and NOBODY DECIDES — the default outcome (in most
 *      instruments, automatic confirmation, or the loss of the short-notice
 *      lever) arrives silently, without a decision ever having been made;
 *   2. the manager decides on their own impression — the project or
 *      functional manager who saw the daily work was never asked, so the
 *      evidence that mattered never reached the record; and
 *   3. the decision is made and never COMMUNICATED — the joiner is never told
 *      in writing, which in most instruments is the step that makes the
 *      decision real.
 *
 * This register is the memory for that duty, and it is built on the reporting
 * graph: the evidence duty sits on EVERY declared reporting line the joiner
 * serves on. A confirmation is refused while any declared line has no
 * evidence on the record — not because software knows better than the
 * manager, but because a confirmation made on one line's word while another
 * line holds silence is exactly the failure the gate exists to prevent.
 *
 * TWO DOCTRINES, CARRIED FROM THE HOUSE RULES.
 *   NO SCORE ON THE PERSON. The register records dated evidence in words and
 *   a closed-vocabulary recommendation per line. It never computes a
 *   capability score, a grade, a ranking or a "pass percentage". A joiner is
 *   a person starting a job, not a number awaiting a threshold.
 *   THE GATE NEVER DEFAULTS. A window whose day passes with no decision is
 *   printed `lapsed` with the consequence named — the register never
 *   substitutes the instrument's default outcome for a decision nobody made.
 *
 * The register states nothing about a person beyond the gate: no volume, no
 * rate over people, no ranking. It counts gates, lines, acts and days.
 */

export const PBG_ENGINE_VERSION = 'probation-confirmation-gate-2026.11-v1';
export const PBG_ADR = 'ADR-0233';
export const PBG_RULE_ID = 'RULE-PBG-01';
export const PBG_ROUTE = 'probation';
export const PBG_HREF = '#/probation';
export const PBG_MARKER_KIND = 'probation-gate';

export const PBG_LIMITS = Object.freeze({
  gates: 200,
  acts: 4000,
  markers: 400,
  refMin: 3,
  refMax: 80,
  textMin: 24,
  textMax: 600,
  /** The declared probation window itself, in whole days. */
  spanMinDays: 1,
  spanMaxDays: 365,
  /** The declared legal cap on the TOTAL probation span, in whole days. */
  capMinDays: 1,
  capMaxDays: 730,
  /** How close to the window's end the "decision owed now" flag fires. */
  decisionWindowDays: 7,
  /** How long after a decision the written-notification duty is chased. */
  notifyDueDays: 3,
  privacyFloor: 3,
  askDueDays: 2,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
});

/**
 * The instruments a gate can be declared under. A closed list, because "the
 * law set this window" and "the contract set this window" carry different
 * ceilings and different consequences, and the register must be able to print
 * the difference rather than average it. The instrument's text is declared
 * beside it: this register stores declared terms and enforces internal
 * consistency — it is not a legal database, and no jurisdiction's figures are
 * looked up or inferred here.
 */
export const PBG_INSTRUMENTS = Object.freeze([
  Object.freeze({ key: 'statutory', label: 'Statutory / legal provision' }),
  Object.freeze({ key: 'collective-agreement', label: 'Collective agreement' }),
  Object.freeze({ key: 'contract', label: 'Individual employment contract' }),
  Object.freeze({ key: 'internal-policy', label: 'Internal policy / appointment letter' }),
  Object.freeze({ key: 'assignment', label: 'Internal assignment / secondment terms' }),
]);
export const PBG_INSTRUMENT_KEYS = Object.freeze(PBG_INSTRUMENTS.map((row) => row.key));

/** The two decisions that CLOSE a gate. Nothing else closes it. An extension
 * is not a decision: it is its own append-only act that moves the window
 * forward under the declared instrument, after which the evidence duty runs
 * again and the final decision is still owed. */
export const PBG_DECISIONS = Object.freeze(['confirm', 'end']);

/**
 * What a line's evidence can say. Three words, closed, because "support" and
 * "cannot say" are different facts and a register that let evidence read as
 * prose would average them.
 */
export const PBG_RECOMMENDATIONS = Object.freeze([
  Object.freeze({ key: 'support', label: 'Support — the work I saw meets the declared expectations' }),
  Object.freeze({ key: 'concern', label: 'Concern — I saw work that fell short of the declared expectations' }),
  Object.freeze({ key: 'unresolved', label: 'Cannot say — I have not seen enough of the work' }),
]);
export const PBG_RECOMMENDATION_KEYS = Object.freeze(PBG_RECOMMENDATIONS.map((row) => row.key));

/** Derived gate states. Nothing stores a state; every one is re-read from acts. */
export const PBG_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Declared — the evidence duty has not been put to every declared line yet' }),
  Object.freeze({ key: 'evidence-gathering', label: 'Evidence gathering — every declared line has been asked; evidence is outstanding' }),
  Object.freeze({ key: 'evidence-complete', label: 'Evidence complete — every declared line carries evidence; the decision is owed' }),
  Object.freeze({ key: 'decided-confirmed', label: 'Confirmed — the joiner is confirmed on evidence from every declared line' }),
  Object.freeze({ key: 'decided-ended', label: 'Ended — the engagement ends within the window’s short notice' }),
  Object.freeze({ key: 'lapsed-no-decision', label: 'Lapsed — the window’s day passed with no decision on the record' }),
]);
export const PBG_STATE_KEYS = Object.freeze(PBG_STATES.map((row) => row.key));

/** Per-line evidence states, the parts the gate's state is built from. */
export const PBG_LINE_STATES = Object.freeze([
  Object.freeze({ key: 'unasked', label: 'No evidence is on the record from this line yet' }),
  Object.freeze({ key: 'asked', label: 'Asked — the line owes evidence by the day named in the ask' }),
  Object.freeze({ key: 'submitted', label: 'Evidence is on the record from this line' }),
]);

export const PBG_FLAGS = Object.freeze({
  /** No decision and the effective end day is within the closing window. */
  decisionClosing: 'decision-window-closing',
  /** No decision and the effective end day has passed. */
  lapsed: 'lapsed-no-decision',
  /** A decision exists and the joiner has no recorded written notification. */
  unnotified: 'decision-unnotified',
  /** A confirmation recorded while at least one line read `concern`. */
  confirmedOverConcern: 'confirmed-over-concern',
  /** A confirmation recorded while at least one line read `cannot say`. */
  confirmedOverUnresolved: 'confirmed-over-unresolved',
  /** A declared line the reporting graph no longer carries. Printed, never repaired. */
  lineUnresolved: 'declared-line-unresolved',
  /** The joiner is no longer an active person on the roster. Printed, never repaired. */
  joinerUnresolved: 'joiner-not-active',
});

/** FIVE act kinds. `extend` moves the window and closes nothing; `decide`
 * (confirm | end) is the one final decision the gate exists for. */
export const PBG_ACT_KINDS = Object.freeze(['ask', 'submit', 'extend', 'decide', 'notify']);

export const PBG_REFUSALS = Object.freeze({
  unknownGate: 'unknown-gate',
  alreadyOpen: 'joiner-already-carries-an-open-gate',
  notHomeManager: 'not-the-joiners-home-manager',
  joinerUnknown: 'joiner-unknown',
  joinerArchived: 'joiner-archived',
  joinerWithoutManager: 'joiner-has-no-human-home-manager',
  spanOutOfRange: 'probation-span-out-of-range',
  spanBeyondCap: 'declared-span-exceeds-declared-cap',
  capOutOfRange: 'legal-cap-out-of-range',
  endBeforeStart: 'window-ends-before-it-starts',
  lineUnresolved: 'declared-line-not-resolved',
  notJoinersLine: 'line-does-not-belong-to-the-joiner',
  notLineManager: 'not-the-holder-of-this-line',
  alreadyAsked: 'line-already-asked',
  askDueOutOfRange: 'ask-due-out-of-range',
  nothingSubmitted: 'no-evidence-duty-on-this-line',
  notDeclarant: 'not-the-confirming-manager',
  alreadyDecided: 'gate-already-carries-a-decision',
  windowClosed: 'probation-window-has-closed',
  confirmEvidenceMissing: 'confirmation-refused-lines-without-evidence',
  extensionRefusedByInstrument: 'instrument-does-not-allow-extension',
  extensionNotForward: 'extension-does-not-move-the-window-forward',
  extensionBeyondCap: 'extension-exceeds-the-declared-cap',
  notifyBeforeDecision: 'no-decision-to-notify',
  alreadyNotified: 'decision-already-notified',
  notifyBeforeDecisionDay: 'notification-predates-the-decision',
  beforeDeclared: 'before-declared',
  futureDated: 'future-dated',
  ledgerFull: 'ledger-full',
  unreadable: 'unreadable',
  noActor: 'no-actor',
});

export const PBG_EVENTS = Object.freeze({
  DECLARED: 'probation.gate.declared',
  ASKED: 'probation.evidence.asked',
  SUBMITTED: 'probation.evidence.submitted',
  DECIDED: 'probation.gate.decided',
  NOTIFIED: 'probation.decision.notified',
  SCANNED: 'probation.gates.scanned',
});
export const PBG_EVENT_PREFIX = 'probation.';

/**
 * FIVE RIGHTS, every one re-proved inside the action when a record is named:
 *   READ    — the joiner reads their own gate; the confirming manager, every
 *             asked line holder and the spans above them read what they are a
 *             party to or hold.
 *   DECLARE — the joiner's home manager opens the gate in their own name. No
 *             gate is opened by HR machinery, an onboard flow or a rule: a
 *             probation window is a term of a relationship, and the person who
 *             will answer for the decision opens the record.
 *   ASK     — the confirming manager puts the evidence duty to a declared
 *             line's holder.
 *   SUBMIT  — the holder of the line the evidence is about (for the home line,
 *             the confirming manager themselves) records dated evidence.
 *   DECIDE  — the confirming manager records the decision and the written
 *             notification. Nobody else decides a joiner's gate.
 */
export const PBG_RIGHTS = Object.freeze({
  READ: 'read-probation-gates',
  DECLARE: 'declare-probation-gate',
  ASK: 'ask-probation-evidence',
  SUBMIT: 'submit-probation-evidence',
  DECIDE: 'decide-probation-gate',
});

export const PBG_SECTION_TITLES = Object.freeze({
  rows: 'Gates',
  lines: 'Evidence by line',
  counts: 'Counts, windows and on-time rates',
  refusals: 'Refused acts',
  method: 'Method & limits',
});

/** The pause switch, named by its literal key so the pause-permit census can grep it. */
export const PBG_PAUSE_SWITCH = 'probationAutoPropagate';
export const PBG_DEFAULTS = Object.freeze({ autoPropagate: true });

export function normalizeProbationSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return { [PBG_PAUSE_SWITCH]: s[PBG_PAUSE_SWITCH] !== false };
}

export const PBG_METHOD = Object.freeze({
  engine: PBG_ENGINE_VERSION,
  adr: PBG_ADR,
  frameworks: Object.freeze([
    'Employment-law boundary (declared, not checked): most instruments make the probation window a term of the relationship with its own end day and short-notice lever, and most default the outcome when the day passes un-decided (e.g. automatic confirmation, or the loss of the short notice). This register stores the DECLARED instrument and its declared cap and enforces internal consistency — an extension past the declared cap is refused, never warned about — but it looks no jurisdiction up, infers no statutory limit and is not legal advice.',
    'Personnel-selection evidence doctrine (Sackett, Zhang, Berry & Lievens 2022, as encoded in the hiring module): a single rater\'s impression is the weakest structured signal. A confirmation here must rest on evidence from EVERY declared reporting line of the joiner — the project or functional manager who saw the daily work is not optional — and directional disagreement between lines is surfaced, never averaged away.',
    'Deadline gating (operations): a gate whose day passes with no decision is printed `lapsed` with the consequence named. The register never substitutes the instrument\'s default outcome for a decision nobody made, and never lets the passage of time decide anything.',
    'The communication duty: the outcome must be recorded as COMMUNICATED to the joiner in writing — the gap between "we decided" and "we told them" is where this duty actually fails, and the register holds both dates apart.',
    'Matrix accountability (ADR-0140): a joiner above a few hundred people usually serves a home line and one or more declared matrix lines. The evidence duty sits on every active declared line at decision time, and no line can be dropped for being inconvenient.',
    'Fair-process doctrine (procedural justice): the joiner reads their own gate, sees every line\'s evidence and the decision, and sees whether it was communicated. The register never computes a score, a grade or a ranking of the joiner — it records acts, words and dates.',
  ]),
  invariants: Object.freeze([
    'A gate is declared once, by the joiner\'s home manager, in their own name. The declared terms — window, instrument, cap, extension permission — are never edited; a correction is a new gate.',
    'The joiner may carry only one open gate at a time. A second overlapping gate is refused.',
    'Evidence is append-only per line: the latest submission on a line is the line\'s reading, and every earlier one stays on the record.',
    'Only the confirming manager decides, once: confirm, extend or end. A second decision is refused — a changed decision is a new human act on the decision log, not an edit of this one.',
    'A confirmation is refused while any declared reporting line of the joiner carries no evidence. An END is allowed without evidence, because ending is the urgent path and a process that forces evidence-gathering before it can stop a clearly-failing start would protect the process and not the people.',
    'An extension is refused unless the declared instrument allows one, refused if it does not move the window forward, and refused if it would carry the total probation span past the declared legal cap.',
    'A decision dated after the window closed is refused: the short-notice lever is gone with the window, and recording it here would print a right nobody had.',
    'The joiner is told: a decision with no recorded written notification is printed `decision-unnotified` and chased. Nothing closes the duty but the confirming manager\'s own dated notification act.',
    'Counts are re-derived from stored records on every read. `partitionReconciles` (the printed state counts add to the gate total) and `figuresComplete` (no refused act, no dropped row) are reported apart — neither implies the other.',
    'This register does not verify that a cited instrument, letter or evidence record exists elsewhere in the workspace. References are declared, not checked, and the method note says so.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No capability score, no readiness grade, no pass percentage and no ranking of the joiner. The register records dated evidence in words and a closed-vocabulary recommendation per line; the weighing is the confirming manager\'s recorded decision, with their name on it.',
    'No inference of a probation window from a start date, a contract record or a jurisdiction database. The window, the cap and the extension permission are declared terms, read from the gate row.',
    'No automatic decision, no automatic confirmation when the window lapses, no automatic ending. The rule asks; it never decides.',
    'No per-person volume, rate or ranking across gates. The register counts gates, lines, acts and days; a manager\'s confirmation record is not a score.',
    'No salary, benefit or payroll figure anywhere in the register.',
    'No template letters and no document generation. The notification act records the day and the reference of what was sent; the register does not draft it.',
  ]),
});

/* ------------------------------------------------------------------- CSV */

/**
 * CSV scope #176 (ADR-0233, Schema v188). Aggregate and identity-free: one
 * summary row, one coverage row, one row per derived state, one row per
 * decision outcome, one row per decision-window bucket, and the notification
 * and on-time rows. No joiner id, manager id, line id, role label,
 * expectation, instrument reference, evidence text or letter reference crosses
 * this boundary; a rate with no published denominator exports BLANK with its
 * reason, never zero.
 */
export const PBG_CSV_SCOPE = 'probation-gates';

export const PBG_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'state', 'outcome',
  'gates', 'open', 'closed', 'lapsed',
  'closing', 'unnotified', 'overdue_asks',
  'owed', 'on_time', 'on_time_rate_bp', 'blank_reason',
]);

export const PBG_CSV_DESCRIPTOR = Object.freeze({
  key: PBG_CSV_SCOPE,
  label: 'Probation confirmation gate register (aggregate)',
  group: 'people',
  sensitive: true,
  filenameSlug: 'probation-gates',
  description: 'One summary row, one coverage row, one row per derived state, per decision outcome and per decision-window bucket, plus the notification and on-time rows, all as exact integer counts over the whole register. No joiner, manager, line, role label, expectation, evidence text or letter reference is exported; a rate whose denominator is not published exports blank with its reason, never zero.',
});
