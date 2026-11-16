/**
 * app/core/domain/workNightRegistry.js — the closed vocabulary of the
 * Night-Work & In-Shift Break Reading (ADR-0226, Session 303, Schema v181,
 * `RULE-WNR-01`, CSV scope #168, `#/standard-work?panel=night`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. The work/rest ledger (ADR-0209) reads the
 * gaps BETWEEN spells of work. It cannot answer the questions a shift lead
 * actually asks inside and across them: did a six-hour spell contain a break
 * at all; how many nights in a row has this person been rostered across their
 * lines; what share of their hours fall inside the window we call night — and
 * is any of that over a limit a human declared? ADR-0209's own consequences
 * section named these capabilities as not built: in-shift breaks, night-work
 * limits, standby/on-call classification and a fatigue-risk index. This module
 * builds the first, second and fourth. Standby/on-call is a different record
 * (an availability commitment, not worked time) and stays unbuilt.
 *
 * WHAT IS RECORDED. Three dated human statements, and nothing derived:
 *   - a BREAK: one person, one shift, a start and an end as wall-clock times
 *     in the shift's own zone, declared by the holder of the line the shift is
 *     worked for; immutable once declared, and it must lie inside that shift;
 *   - a NIGHT POLICY: the window we call night (a wall-clock minute-of-day
 *     range), and the limits a human declares apply — the largest share of a
 *     shift's minutes that may fall in the night window, the longest run of
 *     consecutive nights with night work, the longest continuous stretch of
 *     work inside a spell before a break must be recorded, and the shortest
 *     break a record may carry — each with a written source;
 *   - the rule's bounded idempotency ledger.
 *
 * WHAT IS REFUSED. A night window nobody declared is `no-policy`: no share is
 * computed and no limit is assumed. A provable breach is asserted without
 * waiting for coverage, because unrecorded work can only ADD night minutes or
 * lengthen a streak — it can never take them away. A missing break record is
 * NOT a breach: absence of a break record is absence of evidence, so the
 * reading refuses the clearance and says why, and the rule asks the line
 * holder to complete the record. A shift whose two stored offsets disagree
 * (one that straddles a clock change) is refused for the night reading with
 * its reason printed, never re-timed.
 *
 * WHAT IT NEVER DOES. It never measures fatigue, alertness or fitness for
 * work, and it never rates a person. The fatigue index is a SCHEDULE metric:
 * a transparent, declared-convention score of the pattern the roster produces,
 * printed with every factor that entered it. It is not the HSE RR446 formula
 * (cited from secondary sources, [UNVERIFIED]) — it is a native convention,
 * stated as one.
 */

export const WORK_NIGHT_ENGINE_VERSION = 'work-night-2026.11-v1';
export const WORK_NIGHT_ADR = 'ADR-0226';
export const WORK_NIGHT_RULE_ID = 'RULE-WNR-01';
export const WORK_NIGHT_ROUTE = 'standard-work';
export const WORK_NIGHT_PANEL = 'night';
export const WORK_NIGHT_HREF = '#/standard-work?panel=night';
export const WORK_NIGHT_CSV_SCOPE = 'night-work-breaks';
export const WORK_NIGHT_MARKER_KIND = 'work-night';

export const WORK_NIGHT_EVENTS = Object.freeze({
  BREAK_DECLARED: 'workNight.break.declared',
  POLICY_DECLARED: 'workNight.policy.declared',
  POLICY_RETIRED: 'workNight.policy.retired',
  CONVENTIONS: 'workNight.conventions.set',
  SCAN: 'workNight.scan',
});
export const WORK_NIGHT_EVENT_PREFIX = 'workNight.';

/**
 * Reading is open at every altitude and scoped by the reader to the seat's own
 * tree and declared lines. Recording a break is the act of whoever HOLDS the
 * line the shift is worked for; the action re-proves the line. Declaring which
 * night limits apply is governance and starts at the director altitude.
 */
export const WORK_NIGHT_RIGHTS = Object.freeze({
  READ: 'read-night-work',
  ROSTER: 'roster-night-work',
  POLICY: 'declare-night-work-policy',
  GOVERN: 'govern-night-work',
});

export const WORK_NIGHT_LIMITS = Object.freeze({
  /** Declared breaks kept. Append-only. */
  breaks: 6000,
  /** Breaks kept for one shift. */
  breaksPerShift: 12,
  /** Declared night policies kept. */
  nightPolicies: 120,
  peoplePerPolicy: 200,
  markers: 400,
  labelMin: 3,
  labelMax: 80,
  reasonMin: 8,
  reasonMax: 400,
  findingsPerPerson: 40,
  peopleRowsShown: 60,
  asksPerCommit: 4,
});

/**
 * Threshold bounds. A declared value outside them is refused, never clamped.
 * The night window is a wall-clock minute-of-day range that wraps at midnight.
 */
export const WORK_NIGHT_THRESHOLD_BOUNDS = Object.freeze({
  nightFromMin: Object.freeze([0, 1439]),
  nightToMin: Object.freeze([0, 1439]),
  nightMaxSharePct: Object.freeze([1, 100]),
  nightMaxConsecutiveNights: Object.freeze([1, 30]),
  breakAfterMin: Object.freeze([30, 4320]),
  breakMinMin: Object.freeze([1, 240]),
});

export const WORK_NIGHT_THRESHOLD_FIELDS = Object.freeze(Object.keys(WORK_NIGHT_THRESHOLD_BOUNDS));

export const WORK_NIGHT_THRESHOLDS = Object.freeze([
  Object.freeze({
    key: 'nightWindow', fields: Object.freeze(['nightFromMin', 'nightToMin']),
    label: 'The night window',
    says: 'The wall-clock hours the workspace calls night: a minute-of-day range that wraps at midnight, for example 22:00 → 06:00. It is a definition, not a limit; the limits below are tested against it.',
  }),
  Object.freeze({
    key: 'nightShare', fields: Object.freeze(['nightMaxSharePct']), finding: 'night-share-breach',
    label: 'Largest share of a shift inside the night window',
    says: 'No single shift may carry more than this percentage of its minutes inside the night window.',
  }),
  Object.freeze({
    key: 'nightStreak', fields: Object.freeze(['nightMaxConsecutiveNights']), finding: 'night-streak-breach',
    label: 'Longest run of consecutive nights with night work',
    says: 'No more than this many consecutive UTC days may each carry night work for one person, across every line.',
  }),
  Object.freeze({
    key: 'breakAfter', fields: Object.freeze(['breakAfterMin']),
    label: 'Longest continuous work before a break must be recorded',
    says: 'Inside one spell, no continuous stretch of work may run past this length without a recorded break. A missing break record refuses the clearance; it is never read as a breach of a person.',
  }),
  Object.freeze({
    key: 'breakMin', fields: Object.freeze(['breakMinMin']),
    label: 'Shortest break a record may carry',
    says: 'A recorded break shorter than this cannot be stored: the door refuses it and the loader drops it, with the reason printed.',
  }),
]);

/* ------------------------------------------------------------- settings */

/**
 * The night reading reads the SAME horizon the work/rest ledger reads
 * (`workRestBackDays` / `workRestAheadDays`), so one declaration of the reading
 * window governs both. The night module adds only its own automation switch.
 */
export const WORK_NIGHT_SETTING_KEYS = Object.freeze({
  autoPropagate: 'workNightAutoPropagate',
});
export const WORK_NIGHT_DEFAULTS = Object.freeze({ autoPropagate: true });
export const WORK_NIGHT_SETTING_LABELS = Object.freeze({
  autoPropagate: 'Night-work breach automation (RULE-WNR-01)',
});

/* ------------------------------------------------------------ vocabularies */

/**
 * A break is a statement about ONE shift of ONE line. The routes are the same
 * three the work/rest ledger uses for who held the line the act is for.
 */
export const WORK_NIGHT_ROUTES = Object.freeze([
  Object.freeze({ key: 'operator', label: 'Workspace leader', says: 'Recorded from the undeclared operator view — the workspace leader, who sits above every roster seat.' }),
  Object.freeze({ key: 'line-holder', label: 'Line holder', says: 'The acting seat is the manager this line reports to.' }),
  Object.freeze({ key: 'above-line', label: 'Above the line', says: 'The acting seat holds the line’s manager in its own reporting tree.' }),
]);
export const WORK_NIGHT_ROUTE_KEYS = Object.freeze(WORK_NIGHT_ROUTES.map((row) => row.key));
export const WORK_NIGHT_ROUTE_BY_KEY = Object.freeze(Object.fromEntries(WORK_NIGHT_ROUTES.map((row) => [row.key, row])));

export const WORK_NIGHT_POLICY_SCOPES = Object.freeze(['workspace', 'people']);

/** Every kind of provable night breach the kernel can prove from the record. */
export const WORK_NIGHT_FINDING_KINDS = Object.freeze([
  Object.freeze({ key: 'night-share-breach', label: 'Night share over the declared maximum', needsPolicy: true, says: 'One shift carries more of its minutes inside the night window than the declared maximum.' }),
  Object.freeze({ key: 'night-streak-breach', label: 'Night streak over the declared maximum', needsPolicy: true, says: 'The run of consecutive nights with night work is longer than the declared maximum.' }),
]);
export const WORK_NIGHT_FINDING_KEYS = Object.freeze(WORK_NIGHT_FINDING_KINDS.map((row) => row.key));
export const WORK_NIGHT_FINDING_BY_KEY = Object.freeze(Object.fromEntries(WORK_NIGHT_FINDING_KINDS.map((row) => [row.key, row])));

/** One person's night reading. Exhaustive and mutually exclusive; decided in this order. */
export const WORK_NIGHT_VERDICTS = Object.freeze([
  Object.freeze({ key: 'breach', label: 'Provable night breach', tone: 'bad', says: 'At least one declared night limit is proved by the record as it stands. More record can only add night minutes or lengthen a streak — it can never remove them.' }),
  Object.freeze({ key: 'policy-conflict', label: 'Two policies claim this person', tone: 'warn', says: 'More than one live night policy applies and no human said which governs. Nothing is tested and no clearance is given.' }),
  Object.freeze({ key: 'no-policy', label: 'No night policy declared', tone: 'warn', says: 'No live night policy applies to this person, so there is no night window and no limit to test against. Nothing is assumed.' }),
  Object.freeze({ key: 'unproven', label: 'Unproven', tone: 'warn', says: 'No night limit was breached, but the record cannot support a clearance — a line has not attested its record, or a break record the declared limit requires is missing.' }),
  Object.freeze({ key: 'clear', label: 'Clear on the record', tone: 'good', says: 'Every declared night limit holds, every required break record is on the record, and every one of this person’s lines attested its record across the whole horizon.' }),
  Object.freeze({ key: 'no-record', label: 'No shift on record', tone: 'neutral', says: 'No shift intersects the horizon. Silence is not a night: nothing is claimed either way.' }),
]);
export const WORK_NIGHT_VERDICT_KEYS = Object.freeze(WORK_NIGHT_VERDICTS.map((row) => row.key));
export const WORK_NIGHT_VERDICT_BY_KEY = Object.freeze(Object.fromEntries(WORK_NIGHT_VERDICTS.map((row) => [row.key, row])));

/** Why a night clearance is withheld when nothing is breached. Counted and printed, never dropped. */
export const WORK_NIGHT_UNPROVEN_REASONS = Object.freeze([
  Object.freeze({ key: 'coverage-gap', says: 'At least one of this person’s reporting lines has not attested that its record is complete for every day of the horizon. An unrecorded shift there could add night minutes or lengthen a streak.' }),
  Object.freeze({ key: 'break-record-missing', says: 'A declared limit requires a break record where the record shows continuous work past the point one was due. Absence of a break record is absence of evidence, not evidence of no break: the clearance is refused and the rule asks the line holder to complete the record.' }),
  Object.freeze({ key: 'no-threshold-tested', says: 'The governing policy declares no limit that could be tested.' }),
]);
export const WORK_NIGHT_UNPROVEN_BY_KEY = Object.freeze(Object.fromEntries(WORK_NIGHT_UNPROVEN_REASONS.map((row) => [row.key, row])));

/** A shift that cannot be read for the night reading, and why. Counted, never repaired. */
export const WORK_NIGHT_UNREADABLE = Object.freeze([
  Object.freeze({ key: 'dst-crossing', says: 'The shift’s two stored UTC offsets disagree, so it straddles a clock change. Which wall-clock minutes it actually contained cannot be resolved from the record, so its night minutes are refused rather than re-timed.' }),
]);
export const WORK_NIGHT_UNREADABLE_BY_KEY = Object.freeze(Object.fromEntries(WORK_NIGHT_UNREADABLE.map((row) => [row.key, row])));

/** Who a provable breach or a missing-break ask is owed to, and why nobody was asked when nobody is. */
export const WORK_NIGHT_OWNER_STATES = Object.freeze([
  Object.freeze({ key: 'seat', says: 'A roster seat holds it and is asked.' }),
  Object.freeze({ key: 'leader-held', says: 'The line, or the only seat above both lines, is the workspace leader. It is printed on the leader’s own board; no delegation is filed.' }),
  Object.freeze({ key: 'ambiguous', says: 'The lines involved share no single seat above them. The breach is printed and no owner is invented.' }),
  Object.freeze({ key: 'off-roster', says: 'The person or every line involved has left the active roster. Nobody is substituted.' }),
]);

/* --------------------------------------------------------------------- CSV */

/**
 * CSV scope #168. One workspace row, one row per policy and one row per person
 * under opaque positional codes. No person, manager, shift id, clock time,
 * label or note. A figure that cannot be claimed exports BLANK with its
 * reason, never zero.
 */
export const WORK_NIGHT_CSV_COLUMNS = Object.freeze([
  'row_type', 'key', 'generated_on', 'horizon_from', 'horizon_to',
  'people_n', 'breach_n', 'policy_conflict_n', 'no_policy_n', 'unproven_n', 'clear_n', 'no_record_n',
  'night_shifts_n', 'night_people_n', 'max_night_share_pct', 'max_consecutive_nights_n',
  'missing_break_records_n', 'fatigue_index_max',
  'verdict', 'policy_key', 'lines_n', 'coverage_complete', 'actuals_complete',
  'shifts_n', 'night_shifts_n_person', 'night_share_pct', 'consecutive_nights_n', 'longest_continuous_min',
  'missing_break_records_n_person', 'fatigue_index', 'fatigue_factors',
  'night_from_min', 'night_to_min', 'night_max_share_pct', 'night_max_consecutive_nights',
  'break_after_min', 'break_min_min',
  'policy_scope', 'policy_people_n',
  'balances', 'audit_clean', 'claim_reason', 'engine_version',
]);

export const WORK_NIGHT_CSV_DESCRIPTOR = Object.freeze({
  key: WORK_NIGHT_CSV_SCOPE,
  label: 'Night-work & in-shift break reading (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'night-work-breaks',
  description: 'One identity-free workspace row, one row per declared night policy and one row per person under an opaque positional code: the night reading (provable night breach, unproven, clear, no policy, no record), the largest share of any shift inside the declared night window, the longest run of consecutive nights with night work, the longest continuous work segment the record shows, how many break records a declared limit requires and are missing, and the schedule fatigue index with the factors that entered it. No person, manager, shift, clock time, label or note is exported; a figure that cannot be claimed is blank with its reason, never zero.',
});

/* ------------------------------------------------------------------ method */

export const WORK_NIGHT_FRAMEWORKS = Object.freeze([
  Object.freeze({ key: 'frms', label: 'Fatigue risk management — the prescriptive layer (ICAO Doc 9966; HSE HSG256)', says: 'A fatigue-risk system has two layers: prescriptive limits on hours of work, rest, night work and breaks, and a risk model on top. This module is the prescriptive layer, done exactly: it compares the clock with declared numbers. It carries no alertness model and makes no claim about how anyone feels.' }),
  Object.freeze({ key: 'rr446', label: 'HSE RR446 — the Fatigue & Risk Index Tool (the bar, cited from secondary sources [UNVERIFIED])', says: 'The published UK model scores shift patterns from shift timing, duration, breaks, rest periods and cumulative fatigue, producing a Fatigue Index and a Risk Index. The index here is a native, declared convention over the same inputs — a transparent schedule score printed with its factors — and is explicitly NOT claimed to be the RR446 formula, which models sleep bouts the record does not hold.' }),
  Object.freeze({ key: 'night-work', label: 'Directive 2003/88/EC, Article 4 — the shape of a night-work limit', says: 'Night work is work performed at a time normally between 22:00 and 06:00, with a limit of eight hours per 24-hour period averaged over a reference period. Named as a SHAPE only, read from secondary sources and [UNVERIFIED] against the primary text; which limits bind a given person depends on country, contract and derogation, and that is a human declaration with its source in writing.' }),
  Object.freeze({ key: 'open-world', label: 'Open-world reading — absence of a record is not evidence', says: 'A roster that shows no break on a shift proves nothing about that shift unless someone accountable says the record is complete. A breach is asserted without coverage, because adding work to a record can only add night minutes or lengthen a streak — it never removes them. A clearance needs every line’s attestation, and a missing break record refuses it.' }),
  Object.freeze({ key: 'common-agency', label: 'Common agency (Bernheim & Whinston 1986) — the night two principals make together', says: 'When two managers each direct part of one person’s time, each optimises their own part and the cost of the join falls on the person. A night breach made by shifts on two lines is owed to the lowest seat above BOTH of them, never to whichever line rostered last.' }),
  Object.freeze({ key: 'reason-layers', label: 'Reason (1997) — the pattern is decided when the roster is written', says: 'A night streak is decided when the roster is written, days before anyone is tired. So the rule acts only on breaches whose decisive minute is still ahead — while a start time can still be moved — and leaves the past to the record.' }),
]);

export const WORK_NIGHT_METHOD = Object.freeze({
  unit: 'One shift = one person × one reporting line × a start and an end, each a wall-clock time in a named IANA time zone together with the UTC offset it resolved to. One break = one person × one shift × a start and an end, declared by the holder of the line the shift is worked for, and admitted only inside that shift.',
  night: 'The night window is a wall-clock minute-of-day range that wraps at midnight, declared with its limits by a human. A shift’s night minutes are the wall-clock minutes of its coverage that fall inside it — computed from the stored wall times alone, so the figure is the same integer everywhere.',
  share: 'A shift’s night share is its night minutes over its wall-clock coverage minutes, in percent. The comparison against a declared maximum is exact integer arithmetic: a share is over the limit when night minutes × 100 exceeds coverage minutes × the declared percentage.',
  streak: 'A night is a UTC calendar day on which the person’s recorded work carries night minutes. The streak is the longest run of consecutive such days inside the horizon, across every line. A shift whose two stored offsets disagree is refused for this reading with its reason printed.',
  breaks: 'Breaks are recorded inside their shift. Inside one spell of work (shifts merged across every line), the continuous stretches are the spell minus its recorded breaks; a stretch longer than the declared break-after limit is a stretch the record cannot prove was broken — the clearance is refused and the rule asks the line holder to complete the record. Absence of a break record is never read as a breach of a person.',
  fatigue: 'The fatigue index is a schedule metric: a transparent, declared convention, 100 × the largest of the factors the policy declares (night share over its limit, night streak over its limit, continuous work over its limit), each capped at one. Every factor and its inputs are printed. It is not the HSE RR446 formula and is never a rating of a person.',
  coverage: 'A coverage attestation is a line holder’s statement that the record of one person’s work for that line is complete for a range of days — the same attestations the work/rest ledger reads. A person is clear only where every one of their current lines attested the whole horizon.',
  monotone: 'A night breach is asserted without coverage. Work another line has not recorded could only add night minutes or lengthen a streak — it can never remove them. What a fuller record can change is the breach’s shape, never its direction.',
  matrix: 'A person with several reporting lines is one person: their shifts are merged before anything is measured, and they are counted once in every span however many lines lead to it. A breach made inside one line is owed to that line’s holder; one made by two lines is owed to the lowest seat above both. Where that is the workspace leader, or no single seat exists, an identity-free marker is recorded and nobody is asked.',
  refusal: 'No night window is assumed. No limit is tested for a person two live policies claim. No clearance is given on an unattested day or a missing break record. Each refusal prints its sentence; none prints a zero.',
  notSaid: 'Nothing here measures fatigue, alertness or fitness for work, and nothing rates a person. It says which wall-clock minutes of the record fall in the window a human declared, whether that is over a number a human declared, and whether the record can prove a break was taken.',
});

export const WORK_NIGHT_ASK_PREFIX = 'Night-work breach: ';
export const WORK_NIGHT_CLOSED_PREFIX = `Closed by ${WORK_NIGHT_RULE_ID}:`;

/** The conditions `RULE-WNR-01` acts on. Nothing else is escalated. */
export const WORK_NIGHT_RULE_CONDITIONS = Object.freeze([
  Object.freeze({
    key: 'night-breach-ahead',
    label: 'A provable night breach that has not happened yet',
    says: 'The record proves a night-share or night-streak breach whose decisive moment is still ahead — a start time can still be moved.',
  }),
  Object.freeze({
    key: 'break-record-missing',
    label: 'A break record the declared limit requires is missing',
    says: 'A shift has ended and the record shows continuous work past the point a break was due, with no break recorded. The ask is for the record, never a judgement of the person.',
  }),
]);
