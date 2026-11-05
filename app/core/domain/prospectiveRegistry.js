/**
 * app/core/domain/prospectiveRegistry.js — the Prospective Intervention Contract
 * (ADR-0094, Schema v97).
 *
 * THE QUESTION
 * ------------
 * Cloverpop's Decision Bank and Aera's Decision Data Model store what was
 * decided and what happened afterwards; Good Judgment Project / Tetlock's
 * Superforecasting and the Foresight Arena commit-reveal protocol freeze a
 * probability BEFORE the outcome and score it with a proper scoring rule.
 * Neither world does the other's job. A leadership workspace that only stores
 * outcomes can always explain them afterwards; one that only scores forecasts
 * has no hierarchy, no operational record and no altitude-scoped disclosure.
 *
 * This terminal makes a leader PRE-REGISTER a bet about work the workspace
 * already holds, freezes the exact cohort before the intervention, and grades
 * the bet later FROM THE RECORD ITSELF — no human re-enters a verdict, no
 * outcome is selected after the fact, and no causality is claimed. The bet is
 * scored with the Brier score (Brier 1950, a proper scoring rule), compared
 * sequentially against the cell's own strictly-prior base rate (Brier skill),
 * and published with a Wilson (1927) interval. A cohort that cannot be resolved
 * is REFUSED, never scored as a miss.
 *
 * FRAMEWORKS ENCODED (named, not paraphrased)
 * -------------------------------------------
 *  - Brier (1950) quadratic scoring rule and Brier skill vs a climatological
 *    base rate: skill = 1 − mean Brier / mean reference Brier.
 *  - Tetlock & Gardner (2015) / Good Judgment Project: probability estimates
 *    frozen before resolution; Schoemaker & Tetlock (HBR 2016): keep the
 *    assumptions, date and forecaster process alongside the estimate.
 *  - Wilson (1927) score interval for the realised outcome proportion.
 *  - Pre-registration / cohort freezing (clinical-trial protocol discipline):
 *    the evaluated population is fixed before the intervention so an outcome
 *    cannot be cherry-picked afterwards.
 *  - Jaques' time-span of discretion: the horizon and the question change with
 *    the altitude that declares the bet; a chief is not reading shift notes.
 *  - Ashby requisite variety + Beer VSM: the reading is an instrument over the
 *    hierarchy's own records, and a silent channel degrades the reading.
 *  - Statistical disclosure control (small-cell + complementary suppression):
 *    below the floor a calibration cell is blank, and a second cell in the same
 *    published group blanks with it so it cannot be recovered by subtraction.
 *  - Fail-closed defaults: an unobservable outcome, a missing cohort member or
 *    a sub-floor cell is WITHHELD with a printed reason, never zero.
 *
 * WHAT THIS MODULE MAY NEVER DO
 * -----------------------------
 *  - Never rate, rank or score a person. The subject of every figure is a
 *    CONTRACT, a CELL (altitude × instrument) or a frozen COHORT of records.
 *  - Never assert causality. A graded bet says the declared threshold was or
 *    was not reached, not that the intervention caused it.
 *  - Never auto-adjust a declared probability, close a human decision, send a
 *    message, or change a reporting line.
 *  - Never read `conflicts` or `pulses` — both are forbidden endpoints.
 */

export const PROSPECTIVE_ENGINE_VERSION = 'prospective-contracts-v1';

export const PROSPECTIVE_LIMITS = Object.freeze({
  contracts: 120,
  grades: 240,
  markers: 900,
  cohortCap: 60,
  horizonDaysMin: 7,
  horizonDaysMax: 365,
  probabilityMin: 1,
  probabilityMax: 99,
  thresholdMin: 1,
  thresholdMax: 100,
  evidenceFloorMin: 2,
  evidenceFloorMax: 20,
  cellFloorMin: 2,
  cellFloorMax: 20,
  skillFloorMin: 0,
  skillFloorMax: 100,
  reviewDaysMin: 1,
  reviewDaysMax: 90,
  decisionsPerScan: 12,
  gradesPerScan: 40,
  titleMax: 120,
  noteMax: 240,
});

export const PROSPECTIVE_DEFAULTS = Object.freeze({
  prospectiveEvidenceFloor: 3,
  prospectiveCellFloor: 4,
  prospectiveSkillFloorPct: 10,
  prospectiveReviewDays: 14,
  prospectiveAutoPropagate: true,
});

/**
 * Four observable instruments. Each one is extracted ONLY from collections
 * other modules already own; this terminal adds no writer to any of them. A
 * contract freezes the exact record ids at declaration, so the population under
 * test cannot be re-selected after the outcome is known.
 */
export const PROSPECTIVE_INSTRUMENTS = Object.freeze([
  Object.freeze({
    key: 'case-resolution',
    label: 'Open cases resolved',
    collection: 'cases',
    entityType: 'case',
    terminalLabel: 'resolved or closed inside the horizon',
    unit: 'cases',
    question: 'What share of the open cases in this span will be resolved by the horizon?',
    source: 'Operational cases (#/cases) — caseCreatedRule, the shared case lifecycle.',
    detail: 'The cohort is every open / mitigating / monitoring case in the declaring span on the declaration date. Reached means the case is resolved or closed with a resolvedOn date no later than the horizon. A case closed AFTER the horizon does not count.',
  }),
  Object.freeze({
    key: 'delegation-closure',
    label: 'Delegations completed on time',
    collection: 'delegations',
    entityType: 'delegation',
    terminalLabel: 'completed with a dated completion inside the horizon',
    unit: 'delegations',
    question: 'What share of the delegations due inside this horizon will be completed on time?',
    source: 'Delegations (#/delegations) — the ordinary delegation write path.',
    detail: 'The cohort is every active delegation in the span whose dueOn falls inside the window. Reached means status done with a completedOn no later than the horizon. An undated completion is refused, not assumed timely.',
  }),
  Object.freeze({
    key: 'decision-review',
    label: 'Decisions reviewed by their review date',
    collection: 'decisions',
    entityType: 'decision',
    terminalLabel: 'reviewed with a reviewedOn inside the horizon',
    unit: 'decisions',
    question: 'What share of the decisions with a review date inside this horizon will actually be reviewed?',
    source: 'Decisions (#/decisions) — DACI records and decisionTempoRule.',
    detail: 'The cohort is every pending decision whose reviewOn falls inside the window. Reached means a reviewedOn date no later than the horizon. A decision reviewed late does not count.',
  }),
  Object.freeze({
    key: 'oneonone-cadence',
    label: '1:1 coverage of the span',
    collection: 'oneOnOnes',
    entityType: 'person',
    terminalLabel: 'at least one held 1:1 inside the horizon',
    unit: 'people',
    question: 'What share of the active people in this span will have a held 1:1 inside the horizon?',
    source: '1:1s (#/oneonones) — dated, status-bearing meeting records.',
    detail: 'The cohort is every active person in the declaring span. Reached means at least one held 1:1 with a date inside the window. The count is of PEOPLE covered, never of meetings or of a person\u2019s quality.',
  }),
]);

export const PROSPECTIVE_INSTRUMENT_KEYS = Object.freeze(PROSPECTIVE_INSTRUMENTS.map((i) => i.key));
export const PROSPECTIVE_INSTRUMENT_BY_KEY = Object.freeze(
  Object.fromEntries(PROSPECTIVE_INSTRUMENTS.map((i) => [i.key, i])),
);

/** Default review horizon by declaring altitude (Jaques time-span of discretion). */
export const PROSPECTIVE_ALTITUDE_HORIZONS = Object.freeze({
  frontline: 14,
  manager: 30,
  director: 60,
  exec: 90,
  chief: 180,
});

export const PROSPECTIVE_RULE_IDS = Object.freeze({
  declared: 'RULE-PIC-01',
  grade: 'RULE-PIC-02',
  calibration: 'RULE-PIC-03',
  overdue: 'RULE-PIC-04',
});

export const PROSPECTIVE_EVENTS = Object.freeze({
  DECLARED: 'prospective.declared',
  SCAN: 'prospective.scan',
  CONVENTIONS: 'prospective.conventions',
});

export const PROSPECTIVE_TRIGGER_PREFIX = 'prospective.';

export const PROSPECTIVE_MARKER_KINDS = Object.freeze([
  'declared', 'graded', 'ungradable', 'calibration', 'overdue', 'conventions',
]);

/**
 * Five altitude-specific jobs. The ledger is one instrument at every altitude;
 * the horizon, the question, the permitted action and the hand-up change.
 */
export const PROSPECTIVE_PLAYBOOK = Object.freeze({
  frontline: Object.freeze({
    title: 'Will this week\u2019s work actually land?',
    horizon: 'Next 7–14 days',
    question: 'Of the open work I am carrying now, how much will be closed by the date I name?',
    see: 'My own contracts and their frozen cohorts. No calibration rate is published at this altitude.',
    act: 'Declare one bet before acting, then keep doing the work. The ledger grades itself from the case and delegation record.',
    hand: 'A dated count and one governed decision; never a self-rating and never a claim about anyone\u2019s performance.',
  }),
  manager: Object.freeze({
    title: 'Is my unit delivering what it predicted?',
    horizon: '30–60 days',
    question: 'Which of my spans\u2019 bets reached their declared threshold, and which are still unobservable?',
    see: 'Bets declared in my span, their grade counts and any open calibration finding; pooled rates are withheld below the floor.',
    act: 'Open a channel for any cohort that cannot be resolved. The engine never closes a human decision.',
    hand: 'Counts of graded and refused contracts and one named gap, with no person named or ranked.',
  }),
  director: Object.freeze({
    title: 'Is this unit\u2019s judgment calibrated?',
    horizon: '60–180 days',
    question: 'Across altitude × instrument cells, is the Brier skill above the declared floor, and where is the evidence too thin?',
    see: 'Pooled Brier, sequential base-rate skill and a Wilson 95% interval per cell; small cells suppressed with a complementary sibling.',
    act: 'Set the evidence and calibration conventions, and own the one governed calibration decision per failing cell per week.',
    hand: 'A cell table with intervals and refusals; no cohort id, no title and no free text.',
  }),
  exec: Object.freeze({
    title: 'Which portfolio of bets is mispriced?',
    horizon: '90–365 days',
    question: 'Where is the organisation systematically over- or under-confident, and is the measured sample large enough to say?',
    see: 'Aggregate rows by altitude and instrument, skill against the base rate and the count of refused cells.',
    act: 'Decide which practice to change; the engine never changes a declared probability for anyone.',
    hand: 'A portfolio-level calibration row and the governed decisions this portfolio owns.',
  }),
  chief: Object.freeze({
    title: 'Is the leadership bench learning from its own predictions?',
    horizon: 'Company-wide',
    question: 'Across the whole declared tree, are pre-registered bets better than the base rate, and how much of the evidence is refused?',
    see: 'One workspace row, the identity-free brief and the reliability of the instrument itself.',
    act: 'Carry the identity-free brief to the board; never drill into an individual shift\u2019s cohort.',
    hand: 'A board-ready sentence with a Wilson interval and an explicit statement of what is NOT claimed.',
  }),
});

export const PROSPECTIVE_DISCLOSURE = Object.freeze({
  premise: 'A bet is frozen before the work is done, and graded from the workspace\u2019s own dated records. A grade says a declared threshold was reached or not; it never says the intervention caused the outcome and never rates a person.',
  cohort: 'The cohort of record ids is frozen at declaration so the evaluated population cannot be re-selected after the outcome is known. A missing cohort member, an undated completion or an unreached horizon REFUSES the grade instead of printing zero.',
  score: 'Brier score is (p − y)² for a declared probability p and a binary outcome y. Brier skill compares the mean score with the mean score of the cell\u2019s own strictly-prior base rate; a cell below the declared floor publishes counts only, with a complementary cell suppressed beside it.',
  rollup: 'A frozen contract and each grade are graph nodes fanned out to every leadership ancestor in the SAME atomic transaction. The upward form carries counts, rates, dates and state names — never a title, a cohort id, a person name or an amount.',
  engine: 'The engine opens governed decisions and owned dated work, writes typed provenance and grades once. It never adjusts a declared probability, never closes a human decision, never sends a message and never changes a reporting line.',
  local: 'Local seat selection is an auditable workflow declaration, not authentication. There is no server-side tenancy here; a real deployment still needs an authenticated boundary.',
});

export const PROSPECTIVE_PREMISE =
  'This screen measures the CALIBRATION OF DECLARED LEADERSHIP BETS — probability, cohort and horizon frozen before the work, graded once from the workspace\u2019s own record — and refuses to treat a post-hoc explanation, an undated outcome or a sub-floor cell as evidence.';
