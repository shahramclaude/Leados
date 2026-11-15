/**
 * app/core/domain/workRestRegistry.js — the closed vocabulary of the Cross-Line
 * Work/Rest Recovery Ledger (ADR-0209, Session 278, Schema v163, `RULE-WRR-01`,
 * CSV scope #151, `#/standard-work?panel=rest`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. A shift lead rosters Sam 06:00–14:00 on
 * Tuesday. It is a lawful, ordinary shift. What the lead cannot see is that the
 * project line Sam also reports to kept him on a commissioning run until 22:50
 * on Monday night. Each manager looked at their own roster and saw nothing
 * wrong. Sam had seven hours and ten minutes between two jobs, and nobody was
 * accountable for the gap, because nobody could see both ends of it.
 *
 * Before this ledger the workspace could prove who is qualified for a station
 * and whether a set of stations can be manned at once. It held no interval of
 * work at all — so it could not say how long a person had actually been off
 * between the end of one line's work and the start of another's.
 *
 * WHAT IS RECORDED. Four dated human statements, and nothing derived:
 *   - a SHIFT: one person, one reporting line, a start and an end as wall-clock
 *     times in a named IANA zone, with the UTC offset each end resolved to;
 *   - an AMENDMENT of a shift: the times actually worked, or a cancellation;
 *   - a COVERAGE ATTESTATION: a line's holder states that the record of a
 *     person's work for that line is complete for a range of days;
 *   - a POLICY: the thresholds a human declares apply, with their written source.
 *
 * WHAT IS REFUSED. Silence is not rest. A person is read `clear` only when no
 * threshold is breached AND every one of their reporting lines has attested its
 * record across the whole horizon. No statutory limit is built in: a threshold
 * that no human declared is `not tested`, printed as such, and never assumed.
 * A provable conflict is asserted without waiting for coverage, because unseen
 * work can only shorten a rest or remove it — it can never give rest back.
 *
 * WHAT IT NEVER DOES. It never infers tiredness, scores alertness or diagnoses
 * anyone: it compares clock time with a declared number. It never rosters,
 * moves or cancels a shift. It never picks one of two managers as the owner of
 * a gap they made together.
 */

export const WORK_REST_ENGINE_VERSION = 'work-rest-2026.11-v1';
export const WORK_REST_ADR = 'ADR-0209';
export const WORK_REST_RULE_ID = 'RULE-WRR-01';
export const WORK_REST_ROUTE = 'standard-work';
export const WORK_REST_PANEL = 'rest';
export const WORK_REST_HREF = '#/standard-work?panel=rest';
export const WORK_REST_CSV_SCOPE = 'work-rest-recovery';
export const WORK_REST_MARKER_KIND = 'work-rest';

export const WORK_REST_EVENTS = Object.freeze({
  SHIFT_DECLARED: 'workRest.shift.declared',
  SHIFT_AMENDED: 'workRest.shift.amended',
  COVERAGE_ATTESTED: 'workRest.coverage.attested',
  COVERAGE_WITHDRAWN: 'workRest.coverage.withdrawn',
  POLICY_DECLARED: 'workRest.policy.declared',
  POLICY_RETIRED: 'workRest.policy.retired',
  CONVENTIONS: 'workRest.conventions.set',
  SCAN: 'workRest.scan',
});
export const WORK_REST_EVENT_PREFIX = 'workRest.';

/**
 * Reading is open at every altitude and scoped by the reader to the seat's own
 * tree and declared lines. Rostering (a shift, its actual times, a coverage
 * attestation) is the act of whoever HOLDS the line the work is for — a
 * frontline lead included; the action re-proves the line. Declaring which
 * thresholds apply is governance and starts at the director altitude.
 */
export const WORK_REST_RIGHTS = Object.freeze({
  READ: 'read-work-rest',
  ROSTER: 'roster-work-rest',
  POLICY: 'declare-work-rest-policy',
  GOVERN: 'govern-work-rest',
});

export const WORK_REST_LIMITS = Object.freeze({
  /** Declared shifts kept. Append-only. */
  shifts: 6000,
  /** Amendments (actual times, cancellations) kept across every shift. */
  acts: 6000,
  actsPerShift: 6,
  /** Coverage attestations kept. */
  coverage: 3000,
  /** One attestation may cover at most this many days. */
  coverageMaxDays: 92,
  policies: 120,
  peoplePerPolicy: 200,
  markers: 400,
  /** One shift, in minutes. Longer than 72 h is not a shift; standby is not recorded here. */
  shiftMinMinutes: 5,
  shiftMaxMinutes: 4320,
  /** Offsets are whole minutes east of UTC, inside the range any IANA zone uses. */
  offsetMin: -840,
  offsetMax: 840,
  yearMin: 2000,
  yearMax: 2100,
  labelMin: 3,
  labelMax: 80,
  reasonMin: 8,
  reasonMax: 400,
  findingsPerPerson: 40,
  peopleRowsShown: 60,
  asksPerCommit: 4,
});

/** Threshold bounds in whole minutes. A declared value outside them is refused, never clamped. */
export const WORK_REST_THRESHOLD_BOUNDS = Object.freeze({
  minRestMin: Object.freeze([60, 2880]),
  maxSpellMin: Object.freeze([60, 4320]),
  longRestMin: Object.freeze([600, 10080]),
  longRestWithinMin: Object.freeze([1440, 40320]),
  workCapMin: Object.freeze([60, 263520]),
  workCapWindowMin: Object.freeze([1440, 263520]),
});

export const WORK_REST_THRESHOLDS = Object.freeze([
  Object.freeze({
    key: 'minRest', fields: Object.freeze(['minRestMin']), finding: 'short-rest',
    label: 'Minimum rest between spells of work',
    says: 'The shortest continuous time off allowed between the end of one spell of work and the start of the next, across every line.',
    shape: 'The shape of Directive 2003/88/EC Article 3 (eleven consecutive hours per 24-hour period) — named as a shape, not applied as law.',
  }),
  Object.freeze({
    key: 'maxSpell', fields: Object.freeze(['maxSpellMin']), finding: 'long-spell',
    label: 'Longest continuous spell of work',
    says: 'The longest unbroken stretch of work allowed. Two lines’ shifts that touch or overlap are ONE spell.',
    shape: 'A site or contract limit; the Directive implies thirteen hours by leaving eleven of every twenty-four for rest.',
  }),
  Object.freeze({
    key: 'longRest', fields: Object.freeze(['longRestMin', 'longRestWithinMin']), finding: 'long-rest-overdue',
    label: 'A long rest, starting no later than a fixed time after the previous one ended',
    says: 'A continuous rest of at least the first figure must BEGIN no later than the second figure after the previous such rest ended.',
    shape: 'The shape of Regulation (EC) 561/2006 Article 8(6): a weekly rest period starts no later than the end of six 24-hour periods from the end of the previous one.',
  }),
  Object.freeze({
    key: 'workCap', fields: Object.freeze(['workCapMin', 'workCapWindowMin']), finding: 'work-cap',
    label: 'Total work inside any rolling window',
    says: 'The most work allowed inside ANY window of the declared length — read on every window, not on calendar weeks.',
    shape: 'A rolling limit. Directive 2003/88/EC Article 6 (48 hours a week on average over a reference period) is written as its total: 48 h × the weeks of the period, over that period.',
  }),
]);
export const WORK_REST_THRESHOLD_FIELDS = Object.freeze(Object.keys(WORK_REST_THRESHOLD_BOUNDS));

export const WORK_REST_SETTING_KEYS = Object.freeze({
  backDays: 'workRestBackDays',
  aheadDays: 'workRestAheadDays',
  autoPropagate: 'workRestAutoPropagate',
});
export const WORK_REST_DEFAULTS = Object.freeze({ backDays: 28, aheadDays: 14, autoPropagate: true });
export const WORK_REST_BOUNDS = Object.freeze({
  backDays: Object.freeze([7, 183]),
  aheadDays: Object.freeze([1, 60]),
});
export const WORK_REST_SETTING_LABELS = Object.freeze({
  backDays: 'Days of record read behind today',
  aheadDays: 'Days of roster read ahead of today',
  autoPropagate: 'Work/rest conflict automation (RULE-WRR-01)',
});

/* ------------------------------------------------------------ vocabularies */

export const WORK_REST_SOURCES = Object.freeze([
  Object.freeze({ key: 'roster', label: 'Published roster', says: 'The shift as planned and published.' }),
  Object.freeze({ key: 'timeclock', label: 'Time clock', says: 'Times taken from a clocking record.' }),
  Object.freeze({ key: 'attested', label: 'Line holder’s own statement', says: 'The line’s holder states the times from their own knowledge.' }),
]);
export const WORK_REST_SOURCE_KEYS = Object.freeze(WORK_REST_SOURCES.map((row) => row.key));
export const WORK_REST_SOURCE_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_SOURCES.map((row) => [row.key, row])));

/** How the acting seat held the LINE the shift is worked for. A fact of the act. */
export const WORK_REST_ROUTES = Object.freeze([
  Object.freeze({ key: 'operator', label: 'Workspace leader', says: 'Recorded from the undeclared operator view — the workspace leader, who sits above every roster seat.' }),
  Object.freeze({ key: 'line-holder', label: 'Line holder', says: 'The acting seat is the manager this line reports to.' }),
  Object.freeze({ key: 'above-line', label: 'Above the line', says: 'The acting seat holds the line’s manager in its own reporting tree.' }),
]);
export const WORK_REST_ROUTE_KEYS = Object.freeze(WORK_REST_ROUTES.map((row) => row.key));
export const WORK_REST_ROUTE_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_ROUTES.map((row) => [row.key, row])));

export const WORK_REST_ACT_KINDS = Object.freeze(['actual', 'cancel']);
export const WORK_REST_FOLDS = Object.freeze(['first', 'second']);
export const WORK_REST_POLICY_SCOPES = Object.freeze(['workspace', 'people']);

export const WORK_REST_SHIFT_STATES = Object.freeze([
  Object.freeze({ key: 'planned', label: 'As rostered', says: 'Read at the rostered times. It has not ended yet, or no actual times were recorded after it did.' }),
  Object.freeze({ key: 'worked', label: 'As worked', says: 'Read at times recorded after the fact: an amendment to the times actually worked, or a shift declared after it ended.' }),
  Object.freeze({ key: 'cancelled', label: 'Cancelled', says: 'Cancelled with a written reason. Kept on the record; it is not work and is not read as rest either.' }),
]);
export const WORK_REST_SHIFT_STATE_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_SHIFT_STATES.map((row) => [row.key, row])));

/** Every kind of conflict the kernel can prove. Unrecorded work never gives rest back: it can change a conflict’s shape, not its direction. */
export const WORK_REST_FINDING_KINDS = Object.freeze([
  Object.freeze({ key: 'double-booked', label: 'Double-booked', needsPolicy: false, says: 'Two recorded shifts put one person in two places over the same minutes. No threshold is needed to call that a conflict.' }),
  Object.freeze({ key: 'short-rest', label: 'Rest too short', needsPolicy: true, says: 'The time off between the end of one spell of work and the start of the next is below the declared minimum.' }),
  Object.freeze({ key: 'long-spell', label: 'Spell too long', needsPolicy: true, says: 'An unbroken stretch of work — possibly two lines’ shifts end to end — runs past the declared maximum.' }),
  Object.freeze({ key: 'long-rest-overdue', label: 'Long rest overdue', needsPolicy: true, says: 'No rest of the declared length began inside the declared time after the previous one ended.' }),
  Object.freeze({ key: 'work-cap', label: 'Over the rolling cap', needsPolicy: true, says: 'The work inside one rolling window of the declared length exceeds the declared total.' }),
]);
export const WORK_REST_FINDING_KEYS = Object.freeze(WORK_REST_FINDING_KINDS.map((row) => row.key));
export const WORK_REST_FINDING_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_FINDING_KINDS.map((row) => [row.key, row])));

/** One person's reading. Exhaustive and mutually exclusive; decided in this order. */
export const WORK_REST_VERDICTS = Object.freeze([
  Object.freeze({ key: 'conflict', label: 'Provable conflict', tone: 'bad', says: 'At least one conflict is proved by the record as it stands. More record cannot remove it; only changing a shift can.' }),
  Object.freeze({ key: 'policy-conflict', label: 'Two policies claim this person', tone: 'warn', says: 'More than one live policy applies and no human said which governs. Nothing is tested and no clearance is given.' }),
  Object.freeze({ key: 'no-policy', label: 'No policy declared', tone: 'warn', says: 'No live policy applies to this person, so no threshold exists to test against. No limit is assumed.' }),
  Object.freeze({ key: 'unproven', label: 'Unproven', tone: 'warn', says: 'No conflict was found, but the record cannot support a clearance — a line has not attested its record, or a threshold could not be tested over the horizon.' }),
  Object.freeze({ key: 'clear', label: 'Clear on the record', tone: 'good', says: 'Every declared threshold holds, and every one of this person’s lines attested its record across the whole horizon.' }),
  Object.freeze({ key: 'no-record', label: 'No shift on record', tone: 'neutral', says: 'No shift intersects the horizon. Silence is not rest: nothing is claimed either way.' }),
]);
export const WORK_REST_VERDICT_KEYS = Object.freeze(WORK_REST_VERDICTS.map((row) => row.key));
export const WORK_REST_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_VERDICTS.map((row) => [row.key, row])));

/** Why a clearance is withheld when nothing is breached. Counted and printed, never dropped. */
export const WORK_REST_UNPROVEN_REASONS = Object.freeze([
  Object.freeze({ key: 'coverage-gap', says: 'At least one of this person’s reporting lines has not attested that its record is complete for every day of the horizon. An unrecorded shift there could shorten any rest printed here.' }),
  Object.freeze({ key: 'no-long-rest-on-record', says: 'A long-rest threshold is declared, and no rest of that length lies inside the record. Nothing proves it is overdue; nothing proves it was taken.' }),
  Object.freeze({ key: 'window-exceeds-horizon', says: 'The declared rolling window is longer than the horizon that is read, so no whole window could be tested. Widen the horizon to test it.' }),
  Object.freeze({ key: 'no-threshold-tested', says: 'The governing policy declares no threshold that could be tested.' }),
]);
export const WORK_REST_UNPROVEN_BY_KEY = Object.freeze(Object.fromEntries(WORK_REST_UNPROVEN_REASONS.map((row) => [row.key, row])));

/** Who a preventable conflict is owed to, and why nobody was asked when nobody is. */
export const WORK_REST_OWNER_STATES = Object.freeze([
  Object.freeze({ key: 'seat', says: 'A roster seat holds it and is asked.' }),
  Object.freeze({ key: 'leader-held', says: 'The line, or the only seat above both lines, is the workspace leader. It is printed on the leader’s own board; no delegation is filed.' }),
  Object.freeze({ key: 'ambiguous', says: 'The lines involved share no single seat above them. The conflict is printed and no owner is invented.' }),
  Object.freeze({ key: 'off-roster', says: 'The person or every line involved has left the active roster. Nobody is substituted.' }),
]);

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #151. One workspace row, one row per policy and one row per person
 * under opaque positional codes. No person, no manager, no shift id, no label,
 * no note or reason text, and no clock time. A figure that cannot be claimed
 * exports BLANK with its reason, never zero. Durations are whole minutes.
 */
export const WORK_REST_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'generated_on', 'horizon_from', 'horizon_to',
  'people_n', 'conflict_n', 'policy_conflict_n', 'no_policy_n', 'unproven_n', 'clear_n', 'no_record_n',
  'verdict', 'policy_key', 'lines_n', 'coverage_complete', 'actuals_complete',
  'shifts_n', 'cancelled_n', 'unconfirmed_past_n', 'zone_drift_n',
  'work_minutes', 'longest_spell_minutes', 'shortest_rest_minutes',
  'findings_n', 'ahead_n', 'cross_line_n',
  'double_booked_n', 'short_rest_n', 'long_spell_n', 'long_rest_overdue_n', 'work_cap_n',
  'min_rest_minutes', 'max_spell_minutes', 'long_rest_minutes', 'long_rest_within_minutes', 'work_cap_minutes', 'work_cap_window_minutes',
  'policy_scope', 'policy_people_n',
  'balances', 'audit_clean', 'claim_reason', 'engine_version',
]);

export const WORK_REST_CSV_DESCRIPTOR = Object.freeze({
  key: WORK_REST_CSV_SCOPE,
  label: 'Cross-line work/rest recovery ledger (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'work-rest-recovery',
  description: 'One identity-free workspace row, one row per declared policy and one row per person under an opaque positional code: the reading (provable conflict, unproven, clear, no policy, no record), whether every reporting line attested its record, whether ended shifts carry actual times, work minutes inside the horizon, the longest spell and the shortest rest, and conflicts by kind — double-booked, rest too short, spell too long, long rest overdue, over the rolling cap — with how many are still ahead and how many span two lines. No person, manager, shift, clock time, label or note is exported; a figure that cannot be claimed is blank with its reason, never zero.',
});

/* ------------------------------------------------------------------ method */

export const WORK_REST_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'frms', label: 'Fatigue risk management — the prescriptive layer (ICAO Doc 9966; HSE HSG256)', says: 'A fatigue-risk system has two layers: prescriptive limits on hours of work and rest, and a risk model on top. This ledger is the first layer only, done exactly: it compares elapsed clock time with a declared limit. It carries no alertness model and makes no claim about how anyone feels.' }),
  Object.freeze({ key: 'wtd', label: 'Directive 2003/88/EC, Articles 3, 5, 6 and 16 — the shapes of the limits', says: 'Eleven consecutive hours of rest per 24-hour period; an uninterrupted 24 hours on top of it in each seven-day period; 48 hours a week on average over a reference period of up to four months. These are the shapes the four thresholds can express. None is built in: which limits bind a given person depends on country, contract, opt-out and derogation, and that is a human declaration with its source in writing.' }),
  Object.freeze({ key: 'ec561', label: 'Regulation (EC) 561/2006, Article 8(6) — a rest is timed from the previous rest, not from the calendar', says: '“A weekly rest period shall start no later than at the end of six 24-hour periods from the end of the previous weekly rest period.” That is the form the long-rest threshold takes here, because it refuses calendar weeks — two compliant-looking weeks can hide twelve days of work in a row.' }),
  Object.freeze({ key: 'open-world', label: 'Open-world reading — absence of a record is not evidence of rest', says: 'A roster that shows no shift on Sunday proves nothing about Sunday unless someone accountable says the roster is complete. Clearance therefore needs every line’s attestation; a conflict does not, because adding work to a record can only shorten or remove its rests, lengthen its spells and raise its totals — it never gives rest back.' }),
  Object.freeze({ key: 'common-agency', label: 'Common agency (Bernheim & Whinston 1986) — the gap two principals make together', says: 'When two managers each direct part of one person’s time, each optimises their own part and the cost of the join falls on the person. A conflict made by two lines is owed to the lowest seat above BOTH of them, never to whichever line happened to roster last.' }),
  Object.freeze({ key: 'reason-layers', label: 'Reason (1997) — latent conditions are built upstream of the shift', says: 'A short rest is decided when the roster is written, days before anyone is tired. So the rule acts only on conflicts that are still ahead — while a start time can still be moved — and leaves the past to the record.' }),
]);

export const WORK_REST_METHOD = Object.freeze({
  unit: 'One shift = one person × one reporting line × a start and an end, each a wall-clock time in a named IANA time zone together with the UTC offset it resolved to when it was recorded. A wall time that does not exist (clocks went forward) is refused; one that occurs twice (clocks went back) must say which.',
  elapsed: 'Every duration is elapsed time between two instants, in whole minutes — never the difference of two wall-clock readings. A night shift across the autumn clock change is nine hours long, and the ledger prints nine.',
  spells: 'Shifts are merged per person across EVERY line. Shifts that touch or overlap are one spell of work; the time between two spells is a rest. Overlapping minutes are counted once in every total, and reported as a double-booking.',
  thresholds: 'Four threshold shapes can be declared: a minimum rest, a longest spell, a long rest that must begin within a fixed time of the previous one ending, and a total inside any rolling window. A threshold nobody declared is printed as “not tested”.',
  rolling: 'The rolling total is exact: the work inside a window ending at time t only rises while t is inside a spell, so its maximum over every possible window is reached at the end of some spell. Each spell’s end is tested, and the first minute at which the cap is passed is printed.',
  longRest: 'The long-rest reading is anchored on the rests the record actually holds. Before the first such rest the history is unknown, so the most favourable assumption is made — that one ended exactly as the first recorded spell began — and a conflict is printed only if it holds even then.',
  coverage: 'A coverage attestation is a line holder’s statement that the record of one person’s work for that line is complete for a range of UTC days. A person is `clear` only where every one of their current lines attested the whole horizon. A rest that is not covered is printed with its length and marked unproven.',
  monotone: 'A conflict is asserted without coverage. Work another line has not recorded could only make that rest shorter still or remove it, make a spell longer, or raise a total — it can never give rest back. So a rest the partial record proves short was not longer in fact, whatever else is missing. What a fuller record can change is the conflict’s shape, never its direction.',
  twoClaims: 'Two claims are kept apart. The reading says what the record as it stands proves. “Actuals complete” says whether every ended shift in the horizon is read at times recorded after the fact, rather than as rostered. A reading on rostered times is a reading of the plan.',
  matrix: 'A person with several reporting lines is one person: their shifts are merged before anything is measured, and they are counted once in every span however many lines lead to it. A conflict made inside one line is owed to that line’s holder; one made by two lines is owed to the lowest seat above both. Where that is the workspace leader, or no single seat exists, an identity-free marker is recorded and nobody is asked.',
  zone: 'Offsets are resolved against the time-zone rules of the device at the moment of recording and stored with the shift, so every later reading is pure integer arithmetic and prints the same minute everywhere. If today’s rules no longer give that offset for that wall time, the shift is flagged as drifted rather than silently re-timed.',
  refusal: 'No statutory limit is assumed. No threshold is tested for a person two live policies claim. No clearance is given on an unattested day. No conflict is softened because it is small. Each refusal prints its sentence; none prints a zero.',
  notSaid: 'Nothing here measures fatigue, alertness or fitness for work, and nothing rates a person. It says how long the clock ran between two recorded instants, and whether that is less than a number a human declared.',
});

export const WORK_REST_ASK_PREFIX = 'Work/rest conflict: ';
export const WORK_REST_CLOSED_PREFIX = `Closed by ${WORK_REST_RULE_ID}:`;

/** The one condition `RULE-WRR-01` acts on. Nothing else is escalated. */
export const WORK_REST_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'conflict-ahead',
    label: 'A provable work/rest conflict that has not happened yet',
    says: 'The record proves a conflict whose decisive moment is still ahead — a start time can still be moved.',
  }),
]);
