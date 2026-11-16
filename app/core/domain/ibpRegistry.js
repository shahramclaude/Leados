/**
 * app/core/domain/ibpRegistry.js — the declared vocabulary of the Integrated
 * Business Plan (S&OP) Cycle Register (ADR-0231, Schema v184, `RULE-IBP-01`,
 * CSV scope #172, `#/ibp`).
 *
 * Pure leaf: zero imports, so schema, reader, actions, post-commit rule, CSV
 * export and view all share one vocabulary without a cycle risk.
 *
 * THE DUTY, IN THE WORDS OF THE PERSON WHO OWNS IT
 * ------------------------------------------------
 * A director or VP owns the monthly cycle in which a business decides what it
 * will actually commit to sell and make. Oliver Wight and Richard Ling gave it
 * its canonical shape in 1988 and it has not changed: five reviews in a fixed
 * order, each producing the decision the next one depends on, ending in ONE
 * approved operating plan that every function works from until the next cycle.
 *
 *   1. Portfolio review   — what launches, phases out, changes, and when.
 *   2. Demand review      — the UNCONSTRAINED consensus demand plan.
 *   3. Supply review      — feasibility against DEMONSTRATED capacity, and the
 *                           named gaps where it cannot be met.
 *   4. Reconciliation     — the gaps, quantified into costed options; what can
 *       (pre-S&OP)         be settled below executive, what must escalate.
 *   5. Executive review   — one plan approved by a seat that can commit the
 *                           resources, with the residual explicitly owned.
 *
 * THE SEVEN WAYS THIS CYCLE BREAKS, AND WHICH ONE THIS REGISTER CATCHES
 * --------------------------------------------------------------------
 * The published practitioner literature is unusually consistent about the
 * failure modes, and every one of them is a *record* failure, not an
 * intelligence failure. Each is a printed verdict here, never a silent pass:
 *
 *  - The sales target substituted for the demand plan. A target is a wish with
 *    a bonus attached; a demand plan is what the market will take. The register
 *    records BOTH the statistical baseline and the commercial target beside the
 *    consensus figure, so a consensus that is the target in disguise is printed
 *    as `target-substituted` rather than passed off as a forecast.
 *  - Demand constrained before the supply review. "Unconstrained" is the
 *    operative word in step two: the supply review exists to expose the
 *    constraint, and a demand plan already shaved to capacity has hidden it. A
 *    consensus at or below demonstrated capacity, in a month where the
 *    statistical baseline was above it, is printed as `demand-constrained`.
 *  - Planning against theoretical capacity. Capacity is what the limiting
 *    resource has demonstrated, over a declared observation window, not what
 *    the nameplate says. A capacity row declared `theoretical` is printed as
 *    `theoretical-capacity` and never used as though it were evidence.
 *  - A gap left unquantified. A gap that is described but not counted cannot
 *    be costed, and an uncosted gap is settled by argument in the room. The
 *    gap is an exact integer in plan units, and it is reconciled row by row.
 *  - Options with no price. Every option carries an exact integer-cent impact
 *    and an exact integer plan-unit effect on one side of the equation. An
 *    option with no price is a preference; it is refused at the door.
 *  - The residual silently zeroed. The gap does NOT have to close. It has to be
 *    counted, owned by a named seat, and approved. A cycle whose residual is
 *    non-zero and unowned is `escalation-open`; one approved with a declared
 *    residual is `plan-approved-with-residual` — a different fact from a plan
 *    that closes, printed as a different fact.
 *  - The meeting that produces minutes, not decisions. Step five is a decision
 *    or it did not happen, so the executive act is a dated decision by a seat
 *    that holds the authority, and it is recorded once.
 *
 * WHY THIS IS A MATRIX DUTY, NOT A SUPPLY-CHAIN DUTY
 * --------------------------------------------------
 * The demand owner and the supply owner are almost never on the same reporting
 * line. That is the point of the register: the gap between them has no single
 * manager, so its owner is the LOWEST SEAT ABOVE BOTH LINES, computed from the
 * reporting graph and never chosen by the actor. Where that seat is genuinely
 * ambiguous (a diamond), the register names the ambiguity and asks every joint
 * apex rather than picking one. And because demonstrated capacity is a property
 * of a line and a month, two cycles drawing on the SAME supply line in the SAME
 * month consume the same capacity: the reader sums what every live cycle
 * demands from that line and prints the contention. A register that compared
 * each cycle to capacity on its own would report two plans that fit against a
 * line that cannot serve either.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No forecast algorithm, no learned model, no inferred capacity from a headcount
 * or a rota. No currency conversion. No automatic approval. No per-person
 * performance signal: every finding is about a plan, a line or a month.
 */

/* ------------------------------------------------------------- identity */

export const IBP_ENGINE_VERSION = 'integrated-business-plan-2026.11-v1';
export const IBP_ADR = 'ADR-0231';
export const IBP_RULE_ID = 'RULE-IBP-01';
export const IBP_ROUTE = 'ibp';
export const IBP_HREF = '#/ibp';
export const IBP_CSV_SCOPE = 'integrated-business-plan';
export const IBP_MARKER_KIND = 'integrated-business-plan';

export const IBP_EVENTS = Object.freeze({
  CYCLE_DECLARED: 'ibp.cycle.declared',
  CYCLE_WITHDRAWN: 'ibp.cycle.withdrawn',
  DEMAND_RECORDED: 'ibp.demand.recorded',
  CAPACITY_RECORDED: 'ibp.capacity.recorded',
  OPTION_RECORDED: 'ibp.option.recorded',
  PLAN_APPROVED: 'ibp.plan.approved',
  DEMAND_GRADED: 'ibp.demand.graded',
  SCANNED: 'ibp.scan',
});
export const IBP_EVENT_PREFIX = 'ibp.';

/* ---------------------------------------------------------------- rights */

/**
 * READ (3–5): a plan of record carries commercial volume, price-sensitive
 * capacity and named customers indirectly — it is portfolio material, readable
 * from director up, exactly as the record-class engine already classifies it.
 * FRONTLINE reaches the plan that concerns them through their own line's view,
 * not by reading every cycle in the enterprise.
 *
 * DECLARE (3–5): opening a cycle is the process owner's act — a director's.
 * RECORD (2–5): the demand plan and the demonstrated capacity are recorded by
 *   the manager who holds the line, at their own rank, because that is who
 *   knows them and who is accountable for them.
 * FRAME (3–5): pricing an option commits analysis and often cash; it is
 *   director-and-above.
 * DECIDE (4–5): the executive review commits resources. A director frames the
 *   trade-off; a VP or chief approves the plan. This is the separation the
 *   register exists to make visible.
 * GRADE (3–5): grading the forecast against what actually sold is the process
 *   owner's ordinary duty and never the approver's alone.
 */
export const IBP_RIGHTS = Object.freeze({
  READ: 'read-integrated-business-plan',
  DECLARE: 'declare-integrated-business-plan',
  RECORD: 'record-integrated-business-plan',
  FRAME: 'frame-integrated-business-plan',
  DECIDE: 'decide-integrated-business-plan',
  GRADE: 'grade-integrated-business-plan',
});

/* ---------------------------------------------------------------- limits */

export const IBP_LIMITS = Object.freeze({
  cycles: 120,
  demandRows: 2_400,
  capacityRows: 2_400,
  options: 1_200,
  decisions: 400,
  grades: 1_200,
  markers: 200,
  textMin: 24,
  textMax: 600,
  titleMin: 12,
  titleMax: 160,
  reasonMin: 24,
  reasonMax: 600,
  idMax: 120,
  /** Plan units are whole units of the product; a fractional unit is refused. */
  unitsMax: 1_000_000_000,
  /** Whole cents, as everywhere else in this repository. */
  centsMax: 9_007_199_254_740_000,
  /** Month indices are 1-based within a cycle's declared horizon. */
  monthMin: 1,
  monthMax: 36,
  horizonMin: 1,
  horizonMax: 36,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  /** Below this many graded months, no bias or error figure is printed. */
  gradeFloor: 5,
  /** A capacity claim must observe at least this long to be `demonstrated`. */
  demonstratedWindowMinDays: 28,
  cyclesShown: 40,
  monthsShown: 36,
  optionsShown: 80,
});

/* -------------------------------------------------------------- settings */

export const IBP_SETTING_KEYS = Object.freeze({
  autoPropagate: 'ibpAutoPropagate',
});

export const IBP_DEFAULTS = Object.freeze({ autoPropagate: true });
export const IBP_BOUNDS = Object.freeze({ autoPropagate: 'boolean' });

/**
 * Settings normalizer, declared in the leaf so `schema.js` can normalize the
 * register's switch without importing the read model, and so the rule reads
 * exactly the normalization the writer wrote.
 */
export function normalizeIbpSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    ibpAutoPropagate: s.ibpAutoPropagate !== false,
  };
}

/* ------------------------------------------------------------ the five steps */

/**
 * The canonical cycle, in order. `order` is load-bearing: a step recorded out of
 * sequence is a cycle that has already broken, and the reader prints which step
 * ran early rather than re-sorting the record to look tidy.
 */
export const IBP_STEPS = Object.freeze([
  Object.freeze({
    key: 'portfolio',
    order: 1,
    label: 'Portfolio review',
    owner: 'Product management or marketing',
    decides: 'What launches, phases out, is reformulated or repackaged in the horizon — and the volume assumption behind each.',
    output: 'New items and discontinuations flagged early enough not to surprise the demand plan.',
  }),
  Object.freeze({
    key: 'demand',
    order: 2,
    label: 'Demand review',
    owner: 'Demand planning, with commercial input',
    decides: 'The UNCONSTRAINED consensus demand plan: the statistical baseline reconciled with promotions, pricing, customer wins and losses.',
    output: 'One demand number every function plans against.',
  }),
  Object.freeze({
    key: 'supply',
    order: 3,
    label: 'Supply review',
    owner: 'Supply planning and operations',
    decides: 'Whether demonstrated capacity can meet the unconstrained plan, and where it cannot.',
    output: 'A constrained supply plan and a named list of gaps.',
  }),
  Object.freeze({
    key: 'reconcile',
    order: 4,
    label: 'Reconciliation (pre-S&OP)',
    owner: 'The S&OP process owner, with finance',
    decides: 'Which gaps can be settled below executive level, and what each remaining option costs.',
    output: 'Costed options with service implications and a recommendation.',
  }),
  Object.freeze({
    key: 'executive',
    order: 5,
    label: 'Executive S&OP',
    owner: 'The executive sponsor',
    decides: 'Which gaps are funded, which demand is served first, and what the business does where the plan deviates from budget.',
    output: 'ONE approved operating plan, with the residual explicitly owned.',
  }),
]);
export const IBP_STEP_KEYS = Object.freeze(IBP_STEPS.map((row) => row.key));
export const ibpStep = (key) => IBP_STEPS.find((row) => row.key === key) || null;

/* ----------------------------------------------------------------- capacity */

/**
 * How a capacity figure was obtained. Only `demonstrated` is evidence; a
 * `theoretical` figure is carried and printed as an assertion, never compared
 * as though it had been observed.
 */
export const IBP_CAPACITY_KINDS = Object.freeze([
  Object.freeze({
    key: 'demonstrated',
    label: 'Demonstrated — what this line actually produced over the declared window',
    isEvidence: true,
    detail: 'Counted from the window the recorder declared. The only capacity kind the reader will compare against demand as evidence.',
  }),
  Object.freeze({
    key: 'theoretical',
    label: 'Theoretical — nameplate, standard time or a vendor claim',
    isEvidence: false,
    detail: 'Carried and printed so it can be argued with, but never used as though it were observed. A plan built on it is `theoretical-capacity`.',
  }),
]);
export const IBP_CAPACITY_KIND_KEYS = Object.freeze(IBP_CAPACITY_KINDS.map((row) => row.key));
export const ibpCapacityKind = (key) => IBP_CAPACITY_KINDS.find((row) => row.key === key) || null;

/* ------------------------------------------------------------------ options */

/**
 * The levers that actually appear on a pre-S&OP page, each stating WHICH SIDE of
 * the equation it moves. A lever that moves neither side is not an option, it
 * is a note — and notes are refused at the door because they have no price.
 *
 * `moves`: 'capacity' adds plan units of supply; 'demand' removes plan units of
 * demand (shaping, re-phasing, declining the revenue). Every option carries
 * exactly one side, one integer cent cost, and a written note.
 */
export const IBP_OPTION_KINDS = Object.freeze([
  Object.freeze({ key: 'build-ahead', label: 'Build ahead', moves: 'capacity', detail: 'Produce into inventory ahead of the demand month.' }),
  Object.freeze({ key: 'add-shift', label: 'Add a shift or overtime', moves: 'capacity', detail: 'Buy extra hours on an existing line.' }),
  Object.freeze({ key: 'expedite', label: 'Expedite freight or lead time', moves: 'capacity', detail: 'Pull supply forward by paying for speed.' }),
  Object.freeze({ key: 'dual-source', label: 'Qualify a second source', moves: 'capacity', detail: 'Add a supplier or line for the constrained item.' }),
  Object.freeze({ key: 'outsource', label: 'Outsource to a third party', moves: 'capacity', detail: 'Buy capacity from outside the firm.' }),
  Object.freeze({ key: 'allocate', label: 'Allocate constrained supply', moves: 'demand', detail: 'Serve one customer group before another; the unserved demand is removed from the plan on purpose.' }),
  Object.freeze({ key: 'decline', label: 'Decline the demand', moves: 'demand', detail: 'Walk away from the revenue deliberately, and say so.' }),
  Object.freeze({ key: 'shape-demand', label: 'Shape demand timing', moves: 'demand', detail: 'Move demand between months with promotion timing, pricing or terms.' }),
  Object.freeze({ key: 'rephase-launch', label: 'Re-phase a launch', moves: 'demand', detail: 'Move a launch or phase-out decided in the portfolio review.' }),
]);
export const IBP_OPTION_KIND_KEYS = Object.freeze(IBP_OPTION_KINDS.map((row) => row.key));
export const ibpOptionKind = (key) => IBP_OPTION_KINDS.find((row) => row.key === key) || null;

/* ----------------------------------------------------------------- verdicts */

/**
 * The verdicts a cycle can carry, with the precedence the reader applies in
 * exactly this order — so the panel, the rule and the CSV cannot disagree about
 * which one wins. Lowest rank wins.
 */
export const IBP_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'unreadable',
    rank: 0,
    tone: 'bad',
    label: 'Unreadable — the record cannot support any reconciliation',
  }),
  Object.freeze({
    key: 'no-demand',
    rank: 1,
    tone: 'bad',
    label: 'No demand plan — a cycle with no recorded consensus demand is not a cycle',
  }),
  Object.freeze({
    key: 'demand-constrained',
    rank: 2,
    tone: 'bad',
    label: 'Demand constrained in step two — the consensus sits at or below capacity while the baseline was above it, so the constraint is hidden until it bites',
  }),
  Object.freeze({
    key: 'theoretical-capacity',
    rank: 3,
    tone: 'bad',
    label: 'Planned against theoretical capacity — no demonstrated figure is on the record',
  }),
  Object.freeze({
    key: 'target-substituted',
    rank: 4,
    tone: 'bad',
    label: 'The sales target is standing in as the demand plan — the consensus equals the target and no commercial adjustment was declared',
  }),
  Object.freeze({
    key: 'reconciliation-open',
    rank: 5,
    tone: 'warn',
    label: 'Gap quantified, reconciliation incomplete — the shortfall is counted and no option has been framed against it',
  }),
  Object.freeze({
    key: 'escalation-open',
    rank: 6,
    tone: 'warn',
    label: 'Residual gap unowned — options are framed and no executive decision has approved a plan with that residual',
  }),
  Object.freeze({
    key: 'plan-approved-with-residual',
    rank: 7,
    tone: 'caution',
    label: 'Plan approved WITH a declared residual — an honest part-served plan, and a different fact from one that closes',
  }),
  Object.freeze({
    key: 'plan-approved',
    rank: 8,
    tone: 'good',
    label: 'Plan approved — the residual is owned and the plan closes',
  }),
]);
export const IBP_VERDICT_KEYS = Object.freeze(IBP_VERDICTS.map((row) => row.key));
export const ibpVerdict = (key) => IBP_VERDICTS.find((row) => row.key === key) || null;

/** The progress state of a cycle, independent of the reconciliation question. */
export const IBP_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Declared — the cycle is open and nothing has been recorded against it' }),
  Object.freeze({ key: 'demand-recorded', label: 'Demand recorded — the consensus plan exists and capacity has not been stated' }),
  Object.freeze({ key: 'supply-recorded', label: 'Supply recorded — feasibility has been tested and the gaps are counted' }),
  Object.freeze({ key: 'reconciled', label: 'Reconciled — options are framed against the gap' }),
  Object.freeze({ key: 'approved', label: 'Approved — the executive review has signed one plan' }),
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn — the cycle was abandoned before approval' }),
]);
export const IBP_STATE_KEYS = Object.freeze(IBP_STATES.map((row) => row.key));
export const ibpState = (key) => IBP_STATES.find((row) => row.key === key) || null;

/* ----------------------------------------------------------------- refusals */

export const IBP_REFUSALS = Object.freeze({
  notSeated: 'No live seat is declared, so no act can be attributed and nothing was saved. Declare a seat first.',
  notFound: 'That cycle is not on the register.',
  withdrawn: 'That cycle has been withdrawn. A withdrawn cycle never reopens — open a new one so the abandoned plan stays on the record.',
  ledgerFull: 'The register is at its declared cap; close or withdraw a cycle before opening another.',
  unitsInvalid: 'Plan units are whole units. A fractional unit is refused rather than rounded, because a rounded unit is a different plan.',
  unitsNegative: 'A plan quantity cannot be negative. Record the side it belongs to instead.',
  monthInvalid: 'The month index must be a whole number inside the cycle’s declared horizon.',
  dayInvalid: 'That is not a real calendar day.',
  capacityNotEvidence: 'A theoretical capacity figure is carried but never compared as evidence. Record a demonstrated figure over a declared window, or accept the `theoretical-capacity` verdict.',
  windowTooShort: 'A demonstrated capacity claim must observe at least 28 days. A shorter window is an impression, not a demonstrated rate.',
  wrongLine: 'This cycle is not on a line you hold, and you are not above every line it touches. A cycle is recorded by the lines it belongs to.',
  selfDecide: 'The seat that framed the options does not also approve the plan. The party that built the trade-off has an interest in the answer.',
  secondDecision: 'A cycle is approved once. A re-approval, a revision or a restated plan is a NEW cycle, so the first decision stays on the record and cannot be retro-edited.',
  secondGrade: 'One demand grade per cycle-month. A forecast graded twice is a forecast improved after the fact.',
  loaderRefused: 'The row could not be read back by the loader, so nothing was saved.',
  graphUnreadable: 'The reporting graph could not be read, so no seat above this cycle’s lines can be proved and nothing was saved.',
  duplicateOption: 'That lever is already framed on this cycle. Two rows for one lever would count its cost and its effect twice.',
  noDemandOwner: 'The demand owner must be on the active roster.',
  noSupplyLine: 'The supply line must resolve to a real line on the reporting graph.',
});

/* ------------------------------------------------------------------ method */

export const IBP_METHOD = Object.freeze({
  engine: IBP_ENGINE_VERSION,
  adr: IBP_ADR,
  frameworks: Object.freeze([
    'Sales & Operations Planning, the five-step monthly cycle (Ling & Goddard, Orchestrating Success, 1988; Oliver Wight) — portfolio, demand, supply, reconciliation, executive. Each step produces the decision the next depends on, and the cycle ends in one approved plan.',
    'Unconstrained demand planning — the demand plan states what the market will take, not what the factory can make, because conflating the two hides the constraint the supply review exists to expose.',
    'Demonstrated versus theoretical capacity (Lean/TPS, Ohno; rough-cut capacity planning as taught in APICS/ASCM CPIM) — a capacity figure is evidence only when it names the window over which it was observed.',
    'Forecast bias and error as separate measures (Makridakis, Wheelwright & Hyndman) — signed bias and absolute error are reported apart, because a forecast that runs 8% high every month has zero pure error and a fatal bias. Both are withheld below a declared observation floor.',
    'The gap as the primary output (S&OP maturity literature) — the cycle does not have to close its gap; it has to quantify it, cost the options, and have the residual owned by a seat that can carry it. An unstated gap is a document, not a decision.',
    'Matrix accountability (ADR-0140/ADR-0141) — the demand owner and the supply owner sit on different lines, so the gap has no single manager: its owner is the lowest seat above BOTH lines, computed from the graph and never chosen by the actor. Shared demonstrated capacity is summed across cycles per line and month, so two plans that each fit cannot both be approved against a line that serves neither.',
    'Bulletproof reliability (NORTH_STAR) — "the totals add up" (every printed total equals the sum of the printed rows) and "the printed figures are the computed figures" (no rounding, no coercion, whole units and whole cents) are reported as two separate claims. A figure the record cannot support is a printed refusal with its reason, never a zero.',
  ]),
  printed: Object.freeze([
    'Demand, capacity and option effects are whole plan units and are never rounded. Money is whole cents. A fractional unit or a third decimal place is refused at the door, because a rounded plan is a different plan.',
    'Capacity is compared as evidence only when it is declared `demonstrated` over a window of at least 28 days; a `theoretical` row is carried, printed and marked as an assertion.',
    'The gap is printed per month and in total, and the total is proved to be the sum of the printed months. The residual is printed as its own figure and is never netted into the gap.',
    'A residual of zero and a residual that has been acknowledged and owned are two different verdicts, printed as two different verdicts.',
    'The statistical baseline, the commercial target and the consensus plan are printed side by side, so a consensus that is a target in disguise is visible rather than inferred.',
    'Forecast grade reports signed bias (actual minus consensus) and mean absolute percentage error separately, and prints neither below the declared floor of five graded months.',
    'Demonstrated capacity is shared: every live cycle drawing on the same supply line in the same month is summed against that line’s capacity, and any contention is printed against the line, not against a person.',
    'The register never rates a planner, a manager or a salesperson. Every finding is a statement about a plan, a line, a month or a pair of lines.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No forecast algorithm, no statistical model and no learned curve: the register records the consensus human beings agreed and grades it. Producing the forecast belongs to the demand-planning tool that has the history and the seasonality.',
    'No capacity inferred from headcount, a rota, a shift pattern or a vendor catalogue. A capacity figure is a dated declaration by a line holder.',
    'No currency conversion and no FX policy.',
    'No automatic approval, no automatic plan change and no write to any planning, ERP or scheduling system.',
    'No per-person performance signal from a plan outcome, a forecast error or a residual.',
  ]),
});

/* ------------------------------------------------------------- CSV scope #172 */

/**
 * Identity-free aggregate columns. Every column is either a count, a whole plan
 * unit, a whole cent, a basis point or a closed-vocabulary key. No cycle title,
 * cycle id, family name, owner, manager, line name, note, basis or reason
 * crosses this boundary.
 */
export const IBP_CSV_COLUMNS = Object.freeze([
  'as_of',
  'row_kind',
  'key',
  'currency',
  'cycles_n',
  'live_n',
  'approved_n',
  'state',
  'verdict',
  'step',
  'demand_units',
  'baseline_units',
  'target_units',
  'capacity_units',
  'gap_units',
  'option_capacity_units',
  'option_demand_units',
  'residual_units',
  'residual_owned_n',
  'contended_lines_n',
  'contention_units',
  'option_cost_cents',
  'grade_n',
  'bias_units',
  'mape_bp',
  'identity_holds',
  'audit_clean',
  'blank_reason',
]);

export const IBP_CSV_DESCRIPTOR = Object.freeze({
  key: IBP_CSV_SCOPE,
  label: 'Integrated business plan / S&OP cycle (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'integrated-business-plan',
  description: 'One summary row, one row per cycle state, one row per verdict and one row per step: cycle counts, unconstrained demand, capacity, the exact signed gap, the option effects, the exact residual and the count of approved plans whose residual is owned, per-currency option cost in whole cents, and the signed forecast bias with mean absolute percentage error in basis points. No cycle title, cycle id, family name, owner, manager, supply line name, basis, note or reason is exported; a figure the record cannot support is BLANK with its reason, never zero. Plan units are whole units and money is whole cents; nothing is pooled across currencies.',
});

export const IBP_SECTION_TITLES = Object.freeze({
  cycles: 'Cycles',
  reconcile: 'Reconcile',
  learning: 'Forecast grade',
  method: 'Method & limits',
});

/* ---------------------------------------------------------- key helpers */

/**
 * The deterministic signature that makes a rule ask idempotent. Opaque on
 * purpose: the typed `issues-obligation` link carries this string, never the
 * cycle title, and a delegation is readable above the addressee.
 */
export const ibpAskSignature = (kind, cycleId) => `ibp1:${kind}:${cycleId}`;

export function parseIbpAskSignature(value) {
  const text = String(value || '');
  const match = /^ibp1:(demand|supply|reconcile|executive|grade):([A-Za-z0-9:_-]{1,120})$/.exec(text);
  if (!match) return null;
  return { kind: match[1], cycleId: match[2] };
}

export const ibpAskSummary = (signature) => `ibp-ask|${String(signature || '').slice(0, 120)}`;

export function parseIbpAskSummary(value) {
  const text = String(value || '');
  if (!text.startsWith('ibp-ask|')) return null;
  return parseIbpAskSignature(text.slice('ibp-ask|'.length));
}

/** Tolerance-free comparison of two integer plan-unit figures. */
export const ibpSameUnits = (a, b) => Number.isInteger(a) && Number.isInteger(b) && a === b;
