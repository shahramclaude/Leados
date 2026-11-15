/**
 * app/core/domain/incentiveRegistry.js — the closed vocabulary of the
 * Variable-Pay Design & Incentive Integrity Register
 * (ADR-0220, Schema v174, `RULE-INC-01`, CSV scope #162, `#/incentive`).
 *
 * THE DUTY, IN A DIRECTOR'S WORDS. "I can tell you what each of my people was
 * paid. I cannot tell you, on one page, what the plans in my remit actually pay
 * FOR — which measure, at what target, verified by whom, against what funding
 * ceiling — nor whether the same result is being paid twice because a person
 * sits on two of my lines, nor which paid awards are now owed back because the
 * number they rested on was restated." That is the question this register
 * answers, and no surface in the product answered it before.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE RECORD RATHER THAN ASSERTED.
 *   - `comp.js` is the Merit & Pay-Equity Terminal: given a FIXED merit budget
 *     it decides where the next dollar of BASE pay goes, decomposes the
 *     resulting pattern (Oaxaca–Blinder), and models retention value. It holds
 *     no plan, no measure, no target, no reading, no award, no ceiling and no
 *     recovery — it allocates salary, it does not describe what a plan rewards.
 *   - `meritEvidence.js` / `meritStructure.js` answer "whose review, under whose
 *     pay right, on which lines" for a merit decision. That is the EVIDENCE
 *     behind a fixed-pay number, not the design of a variable-pay scheme.
 *   - `measurement.js` models incentive DISTORTION: given a declared incentive
 *     model it simulates effort allocation, the cosmetic share and a Goodhart
 *     index. It is a model of gaming, not a record of a real plan — nothing in
 *     it names a measure, a target, a verified reading, an award, a ceiling or
 *     a clawback.
 *   - `riskAppetite.js` (ADR-0219) declares what the enterprise will retain;
 *     `goalAttainment.js` closes a period's objectives. Neither says what money
 *     is paid if a measure is met, and neither can refuse an award that rests
 *     on a reading nobody verified.
 *   - Word-boundary searches of `app/` before this build return ZERO files for
 *     `variable pay`, `incentive plan`, `incentive scheme`, `pay for
 *     performance`, `clawback`, `malus`, `at-risk pay` and `deferred bonus`.
 *     Wider absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORKS THIS ENCODES, AND NOTHING BEYOND THEM.
 *   1. AGENCY THEORY (Jensen & Meckling 1976) — variable pay is a contract that
 *      transfers risk to the agent, and its integrity rests on the PRINCIPAL
 *      being able to observe the measure. Hence `control`: a measure the paying
 *      line does not control is printed as a line-of-sight gap rather than
 *      silently accepted. [Citation details from memory, UNVERIFIED.]
 *   2. EXPECTANCY THEORY (Vroom 1964) — effort follows expectancy ×
 *      instrumentality × valence; a target nobody can influence pays for luck.
 *      The register therefore prints the control declaration beside every award
 *      and counts the money resting on an `outside` measure.
 *   3. GOAL-SETTING THEORY (Locke & Latham 1990) — a specific, measurable
 *      target is what makes a variable-pay link real; an award with no measure
 *      and no verified reading is not a weak link, it is a different instrument
 *      (discretion) and is counted as such.
 *   4. MALUS AND CLAWBACK GOVERNANCE — remuneration must be recoverable where an
 *      outcome is restated or the basis ceases to hold (FRC UK Corporate
 *      Governance Code 2018, Provisions 40–41; US SEC Rule 10D-1 recovery
 *      policy for listed issuers). The register records a recovery as a human
 *      act with a state and a reason; it never reverses money by itself.
 *      [Citation details from memory, UNVERIFIED.]
 *   5. MATRIX ACCOUNTABILITY (ADR-0140/0141) — one person may sit on several
 *      lines, so the same outcome can be paid by two plans. The register names
 *      the pair CONTESTED and holds it OUT of the provable total rather than
 *      splitting it or counting it twice. An escalation goes to the lowest seat
 *      above EVERY funding line (`matrixJointApex`), never to an awardee.
 *   6. Two-facts discipline (Bulletproof Reliability Mandate) — "the figures add
 *      up" (`countsReconcile`) and "the printed figures are the computed ones"
 *      (`figuresComplete`) are different claims and are reported apart.
 *
 * WHAT IT NEVER DOES. It never infers a plan from a budget, a goal, a merit
 * cycle or a scorecard model; never converts or pools a currency; never
 * decides that a target was met from prose; never reverses a payment; never
 * splits one outcome between two lines; never rates a person; and never prints
 * an unverified or contested amount inside the headline "money this workspace
 * can prove".
 */

export const INC_ENGINE_VERSION = 'incentive-integrity-2026.11-v1';
export const INC_ADR = 'ADR-0220';
export const INC_RULE_ID = 'RULE-INC-01';
export const INC_ROUTE = 'incentive';
export const INC_HREF = '#/incentive';
export const INC_CSV_SCOPE = 'incentive-integrity';
export const INC_MARKER_KIND = 'incentive-integrity';

export const INC_EVENTS = Object.freeze({
  PLAN_DECLARED: 'incentive.plan.declared',
  PLAN_RETIRED: 'incentive.plan.retired',
  MEASURE_ADDED: 'incentive.measure.added',
  READING_RECORDED: 'incentive.reading.recorded',
  AWARD_RECORDED: 'incentive.award.recorded',
  RECOVERY_RECORDED: 'incentive.recovery.recorded',
  SCANNED: 'incentive.scan',
});
export const INC_EVENT_PREFIX = 'incentive.';

/**
 * Five rights.
 *
 *  - READ is portfolio material at the director's own altitude. The row filter
 *    (a seat sees the awards of people it holds) and the record class (a plan's
 *    individual awards stop being item detail above rank 3) do the disclosure;
 *    the right itself only says the register is not handed to the frontline.
 *  - DESIGN is the funding line's own act: declare a plan for a line you hold,
 *    add its measures, retire it. A plan whose owner is unreachable from the
 *    acting seat is refused, so one line never designs another line's pay.
 *  - VERIFY is deliberately separated from DESIGN: the person who funds a
 *    number does not get to be the only person who confirms it. The action
 *    requires a seat ABOVE the plan's owner, refuses the owner, and refuses any
 *    person who receives an award resting on that measure.
 *  - AWARD records what was awarded. The action requires the awardee to be on
 *    the funding line and refuses self-award; it does not block an expensive
 *    award (see below).
 *  - RECOVER is an executive act. Clawing money back from a person is not a
 *    line-level edit, so it starts at the VP altitude and is narrowed to a seat
 *    that holds the plan's owner.
 *
 * WHY THE DOOR REFUSES AN UNREADABLE AWARD AND NOT AN EXPENSIVE ONE. A register
 * that refuses to record a payment the organisation has already made does not
 * prevent the payment; it pushes it off the record, which is the failure this
 * register exists to prevent. So an award that takes a plan over its declared
 * ceiling is RECORDED and printed as `over-ceiling` with the exact cents, and
 * `RULE-INC-01` asks the seat above the funding line for the decision. What is
 * refused at the door is an award that cannot be read back exactly, names a
 * person outside the funding line, or claims a measured basis with no verified
 * reading behind it.
 */
export const INC_RIGHTS = Object.freeze({
  READ: 'read-incentive-integrity',
  DESIGN: 'design-incentive-plan',
  VERIFY: 'verify-incentive-reading',
  AWARD: 'award-incentive',
  RECOVER: 'recover-incentive',
});

export const INC_LIMITS = Object.freeze({
  plans: 120,
  measures: 480,
  readings: 2400,
  awards: 2400,
  recoveries: 1200,
  markers: 400,
  measuresPerPlan: 8,
  /** A plan's window: no plan runs longer than five years. */
  periodMaxDays: 1827,
  /** How far ahead a plan's period may start. */
  periodStartMaxDaysAhead: 400,
  textMin: 24,
  textMax: 600,
  labelMin: 3,
  labelMax: 120,
  keyMin: 2,
  keyMax: 40,
  currencyMax: 3,
  idMax: 120,
  /** Whole units for a count measure. */
  countMax: 100_000_000,
  /** Whole cents. 10 trillion major units — far above any real award, far
   * below Number.MAX_SAFE_INTEGER, so a printed figure is an exact integer. */
  centsMax: 1_000_000_000_000_000,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  plansShown: 40,
  awardsShown: 120,
  readingsShown: 60,
});

export const INC_SETTING_KEYS = Object.freeze({
  autoPropagate: 'incentiveAutoPropagate',
});

export const INC_DEFAULTS = Object.freeze({
  autoPropagate: true,
});

export const INC_BOUNDS = Object.freeze({
  autoPropagate: 'boolean',
});

/* ------------------------------------------------------------- vocabulary */

/**
 * Two directions. A measure is either better when it goes up (revenue, margin,
 * quality score) or better when it goes down (cost, defect rate, cycle time).
 * The direction is what decides whether a reading MEETS the target, so it is a
 * declared fact, never inferred from the sign of the number.
 */
export const INC_DIRECTIONS = Object.freeze([
  Object.freeze({ key: 'increase', label: 'Higher is better — the target is a floor', meets: 'actual ≥ target' }),
  Object.freeze({ key: 'decrease', label: 'Lower is better — the target is a ceiling', meets: 'actual ≤ target' }),
]);
export const INC_DIRECTION_KEYS = Object.freeze(INC_DIRECTIONS.map((row) => row.key));

/**
 * Two units, and only two.
 *  - `money` targets and actuals are exact integer CENTS in one currency.
 *  - `count` targets and actuals are whole units (units shipped, incidents,
 *    days, points) and carry no currency at all.
 * A count is never compared to an amount, and a money measure never mixes
 * currencies: the plan carries exactly one.
 */
export const INC_UNITS = Object.freeze([
  Object.freeze({ key: 'money', label: 'Money — exact cents in the plan’s currency' }),
  Object.freeze({ key: 'count', label: 'Count — whole units, no currency' }),
]);
export const INC_UNIT_KEYS = Object.freeze(INC_UNITS.map((row) => row.key));

/**
 * Who can actually move the measure. This is a DECLARATION by the plan's
 * designer, printed on every award, because the register cannot observe
 * control and will not guess at it.
 *  - `own-work`  the person receiving the award influences it directly.
 *  - `line`      the funding line's manager influences it; the awardee does not.
 *  - `outside`   neither — the measure is set elsewhere (a corporate allocation,
 *                a market price, another line's decision). An award resting on
 *                it is a line-of-sight gap and is counted, never hidden.
 */
export const INC_CONTROLS = Object.freeze([
  Object.freeze({ key: 'own-work', label: 'The awardee’s own work — they can move it' }),
  Object.freeze({ key: 'line', label: 'The funding line — the manager can move it, the awardee cannot' }),
  Object.freeze({ key: 'outside', label: 'Outside the line — neither the awardee nor their manager sets it' }),
]);
export const INC_CONTROL_KEYS = Object.freeze(INC_CONTROLS.map((row) => row.key));

/**
 * Two bases, and only two.
 *  - `measured`      the award rests on a measure and a verified reading. The
 *                    door refuses it without one.
 *  - `discretionary` a human decided, in writing, outside the measured link.
 *                    Discretion is a legitimate instrument and this register
 *                    does not pretend otherwise — but its money is counted
 *                    separately and never enters the provable total.
 */
export const INC_BASES = Object.freeze([
  Object.freeze({ key: 'measured', label: 'Measured — a declared measure and a verified reading stand behind it' }),
  Object.freeze({ key: 'discretionary', label: 'Discretionary — a written human judgement, outside the measured link' }),
]);
export const INC_BASIS_KEYS = Object.freeze(INC_BASES.map((row) => row.key));

/** A recovery is either money already paid (clawback) or money withheld (malus). */
export const INC_RECOVERY_KINDS = Object.freeze([
  Object.freeze({ key: 'clawback', label: 'Clawback — money already paid is to be recovered' }),
  Object.freeze({ key: 'malus', label: 'Malus — an amount is withheld or reduced before payment' }),
]);
export const INC_RECOVERY_KIND_KEYS = Object.freeze(INC_RECOVERY_KINDS.map((row) => row.key));

/**
 * The three states a recovery act can carry. `demanded` is the decision that
 * money is owed; `recovered` records money actually back; `waived` is a written
 * executive decision that it will not be pursued. A waiver is a decision, not
 * an absence, and is printed as one.
 */
export const INC_RECOVERY_STATES = Object.freeze([
  Object.freeze({ key: 'demanded', label: 'Demanded — recorded as owed, nothing received yet' }),
  Object.freeze({ key: 'recovered', label: 'Recovered — money is back (or was withheld)' }),
  Object.freeze({ key: 'waived', label: 'Waived — an executive decision, in writing, not to pursue it' }),
]);
export const INC_RECOVERY_STATE_KEYS = Object.freeze(INC_RECOVERY_STATES.map((row) => row.key));

/** The plan's own verdict over its declared ceiling. */
export const INC_PLAN_VERDICTS = Object.freeze([
  Object.freeze({ key: 'within-ceiling', label: 'Within ceiling — what was awarded is at or under the declared envelope' }),
  Object.freeze({ key: 'over-ceiling', label: 'Over ceiling — what was awarded is above the declared envelope' }),
  Object.freeze({ key: 'unmeasurable', label: 'Unmeasurable — the register cannot compute this plan and says why' }),
]);
export const INC_PLAN_VERDICT_KEYS = Object.freeze(INC_PLAN_VERDICTS.map((row) => row.key));

/**
 * The state of one award. Exactly one at a time, and the order of precedence is
 * fixed here so two screens cannot disagree:
 *
 *   1. `unverified`   no verified reading stands behind it (or the verifier is
 *                     no longer above the funding line). Its money is NEVER in
 *                     the provable total.
 *   2. `discretionary` the basis was discretion. Counted apart, never provable.
 *   3. `recovery-due` the reading it rested on was restated and the restated
 *                     figure no longer meets the target. Money is owed back.
 *   4. `provable`     a verified reading met the target and still does.
 *   5. `missed`       a verified reading stands, and the target was NOT met.
 *                     The money is on the record and printed; the register does
 *                     not call it earned and does not reverse it.
 */
export const INC_AWARD_STATES = Object.freeze([
  Object.freeze({ key: 'provable', label: 'Provable — verified reading, target met' }),
  Object.freeze({ key: 'missed', label: 'Missed — verified reading, target not met' }),
  Object.freeze({ key: 'discretionary', label: 'Discretionary — no measured link claimed' }),
  Object.freeze({ key: 'unverified', label: 'Unverified — no verified reading stands behind it' }),
  Object.freeze({ key: 'recovery-due', label: 'Recovery due — a restated reading no longer meets the target' }),
]);
export const INC_AWARD_STATE_KEYS = Object.freeze(INC_AWARD_STATES.map((row) => row.key));

export const INC_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  retired: 'This plan was retired. A retired plan is history: declare a new one rather than reviving it.',
});

export const incDirection = (key) => INC_DIRECTIONS.find((row) => row.key === key) || null;
export const incUnit = (key) => INC_UNITS.find((row) => row.key === key) || null;
export const incControl = (key) => INC_CONTROLS.find((row) => row.key === key) || null;
export const incBasis = (key) => INC_BASES.find((row) => row.key === key) || null;
export const incRecoveryKind = (key) => INC_RECOVERY_KINDS.find((row) => row.key === key) || null;
export const incRecoveryState = (key) => INC_RECOVERY_STATES.find((row) => row.key === key) || null;
export const incAwardState = (key) => INC_AWARD_STATES.find((row) => row.key === key) || null;
export const incPlanVerdict = (key) => INC_PLAN_VERDICTS.find((row) => row.key === key) || null;

/**
 * The key a shared OUTCOME occupies across plans. Two plans that declare the
 * same measure key are talking about the same result — that is what makes a
 * payment on both of them a double payment rather than two different schemes.
 * Normalised to lower-case kebab so a spelling difference cannot hide a
 * duplicate.
 */
export function incMeasureKey(value) {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(raw)) return null;
  return raw;
}

/** Two plan windows overlap when one starts before the other ends. Half-open by day. */
export function incPeriodsOverlap(a, b) {
  if (!a || !b || !a.from || !a.to || !b.from || !b.to) return null;
  return a.from <= b.to && b.from <= a.to;
}

/* ------------------------------------------------------------------ method */

export const INC_METHOD = Object.freeze({
  engine: INC_ENGINE_VERSION,
  adr: INC_ADR,
  frameworks: Object.freeze([
    'Agency theory (Jensen & Meckling 1976) — variable pay shifts risk to the agent; its integrity rests on the principal being able to observe the measure, so control is declared per measure [citation details UNVERIFIED]',
    'Expectancy theory (Vroom 1964) — effort follows expectancy × instrumentality × valence; a target a person cannot influence pays for luck, and is printed as a line-of-sight gap',
    'Goal-setting theory (Locke & Latham 1990) — a specific measurable target is what makes a pay link real; an award outside a measure is discretion and is counted as discretion',
    'Malus and clawback governance — FRC UK Corporate Governance Code (2018) Provisions 40–41 and the US SEC Rule 10D-1 recovery policy: pay must be recoverable where the outcome is restated [citation details UNVERIFIED]',
    'Bulletproof Reliability Mandate — “the figures add up” and “the printed figures are the computed ones” are two different claims, reported apart',
    'Matrix accountability (ADR-0140/0141) — one person, several lines, one outcome: a result paid by two plans is named CONTESTED and held out of the total, and the ask goes to the seat above every funding line',
  ]),
  printed: Object.freeze([
    'Every amount is exact integer cents in the plan’s own currency. Currencies are never converted and never pooled; each currency gets its own total.',
    'The provable total counts only awards whose measured basis rests on a VERIFIED reading that met the target and still does. Discretionary, unverified, missed and recovery-due money is printed beside it, never inside it.',
    'The same outcome paid by two plans whose windows overlap is CONTESTED: both amounts are held out of the provable total and the pair is named, rather than one being chosen or the money being split.',
    'Control is a DECLARATION per measure, not an inference. Money resting on a measure the funding line does not control is counted and printed as a line-of-sight gap.',
    'A recovery is a human act with a state and a written reason. The register never reverses, offsets or nets a payment by itself.',
    'An award whose verifier is no longer above the funding line on the live matrix reads unverified: the evidence weakened after the fact, and the register reports the drift instead of preserving a stale verification.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No plan, measure, target, reading or award is inferred from a budget, a goal, a merit cycle, a scorecard model or a payroll number.',
    'No exchange rate, currency pooling, present value, vesting schedule or tax treatment.',
    'No proxy for a market benchmark or a salary survey: this register measures design integrity, not market competitiveness.',
    'No automatic reversal, offset or deduction — a recovery is recorded, never executed.',
    'No rating, ranking or scoring of a person: every finding is about a plan, a measure, a reading or an award.',
  ]),
});

/* ------------------------------------------------------------------ CSV #162 */

export const INC_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'currency',
  'plans_live', 'plans_retired', 'plans_over_ceiling', 'plans_without_measure', 'plans_without_reading',
  'measures_declared', 'measures_controlled_outside',
  'awards_total', 'awards_provable', 'awards_missed', 'awards_discretionary', 'awards_unverified', 'awards_recovery_due',
  'awarded_cents', 'provable_cents', 'missed_cents', 'discretionary_cents', 'unverified_cents',
  'contested_outcomes', 'contested_cents', 'recovery_due_cents', 'recovery_recorded_cents', 'recovery_waived_cents',
  'counts_reconcile', 'figures_complete', 'blank_reason',
]);

/**
 * CSV #162 (ADR-0220, Schema v174). IDENTITY-FREE BY CONSTRUCTION. One summary
 * row per currency. No plan label, no measure key, no person, no verifier, no
 * rationale and no evidence reference crosses this boundary. A figure the
 * reader cannot compute exports BLANK with its reason, never a zero.
 */
export const INC_CSV_DESCRIPTOR = Object.freeze({
  key: INC_CSV_SCOPE,
  label: 'Variable-pay design & incentive integrity (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'incentive-integrity',
  description: 'One summary row per currency over the register as read: plans, over-ceiling plans, measures, the control gap, award states, exact cents for every state, contested outcomes, recovery due/recorded/waived, and the register’s two separate claims. No plan label, measure key, person, verifier, rationale or evidence reference is exported; an uncomputable figure is blank with its reason, never zero.',
});

export const INC_SECTION_TITLES = Object.freeze({
  plans: 'Plans',
  awards: 'Awards',
  queries: 'Queries',
  method: 'Method',
});
