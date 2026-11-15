/**
 * app/core/domain/flexBudgetRegistry.js — the closed vocabulary of the
 * Flexible-Budget Variance Statement (ADR-0213, Session 286, Schema v167,
 * CSV scope #155, `#/finance?panel=variance`).
 *
 * THE DUTY, IN AN OPERATOR'S WORDS. It is the fourth working day of the month
 * and the director of a delivery function is in front of the VP with one line of
 * the pack highlighted: "Cost 134,000 over budget." Everybody in the room has a
 * theory. The work done was 9% above plan, so some of it is simply more work.
 * The senior engineers borrowed from another function on a project line cost
 * more per hour than the standard the budget priced. And the team spent more
 * hours per ticket than the plan allowed. Those are three different facts with
 * three different owners — the seat that set the volume, the line that sets the
 * rate, the manager who directs the work — and the pack gives them one number
 * and one name.
 *
 * THE GAP THIS CLOSES. The envelope ledger (`finance.js`) answers the question
 * BEFORE the fact — "will this envelope breach?" — by commitment accounting, and
 * says in its own header that variance analysis is not what it does. The
 * chargeback ledger prices a borrowed day. The investment-case register compares
 * a promise with what moved. Nothing in the workspace restated a budget for the
 * volume of work actually done, so nothing could separate "we did more" from "it
 * cost more" from "we used more", and in a matrix nothing could say that the
 * price of a borrowed hour and the number of hours consumed answer to two
 * different managers. A targeted search of `app/` for `flexible budget`, `price
 * variance`, `volume variance`, `mix variance` and `budget variance` found no
 * implementation before this register.
 *
 * WHAT THIS REGISTER ADDS — DECLARATION, EXACT ARITHMETIC, AND REFUSAL.
 *
 *   1. A DECLARED STANDARD — one cost object, one period, one currency, one
 *      activity driver with its planned volume; per variable input a budgeted
 *      quantity and a standard price; per fixed input a lump. Declared by a seat
 *      ABOVE the budget holder, never by the budget holder: a standard set by
 *      the person it measures is a target they chose (Jensen 2003; Merchant
 *      1985 on budgetary slack).
 *
 *   2. DATED ACTUALS — the activity actually done, the quantity actually
 *      consumed and the cost actually recorded for EVERY line, with a written
 *      source. A partial recording is refused: a line nobody entered would print
 *      as a favourable variance.
 *
 *   3. THE FLEXIBLE BUDGET — the standard restated for the work actually done,
 *      and the exact split of the gap into activity, price, the joint
 *      price×quantity term, efficiency, and — for substitutable inputs declared
 *      as one pool — mix and yield. Fixed lumps do not flex.
 *
 *   4. WHO ANSWERS FOR WHAT — only by declaration. The plan may name who agreed
 *      the prices, who directs the usage and who set the volume, per plan or per
 *      line. Where the rate and the usage answer to DIFFERENT people — the
 *      ordinary matrix case — the joint term is printed as shared between the
 *      two by name and is never added to either. Where nobody was named the
 *      amount is printed as undeclared. Nothing is read from the reporting graph
 *      to guess an owner.
 *
 *   5. TWO CLAIMS, KEPT APART — "the printed figures add up" (re-added from the
 *      printed whole cents) and "the printed figures are the computed figures"
 *      (how many cells are exact, how many are exact rationals shown to the
 *      cent). A flexible budget is a ratio and is rarely a whole cent.
 *
 * WHAT IT NEVER DOES. It never moves money, edits an envelope, posts a charge or
 * touches a commitment. It never infers a standard from a budget envelope, a
 * rate from the transfer-price ledger, or an actual from a posted period: each
 * is a different instrument with a different signatory. It never pools
 * currencies. It never prints an activity variance before the period has ended,
 * because the static budget is a full-period figure and no phasing was declared.
 * It never calls a favourable variance good or an unfavourable one bad — a
 * favourable efficiency variance bought by skipped work is a cost elsewhere. It
 * never rates a person.
 */

export const FLEX_BUDGET_ENGINE_VERSION = 'flex-budget-variance-2026.11-v1';
export const FLEX_BUDGET_ADR = 'ADR-0213';
export const FLEX_BUDGET_ROUTE = 'finance';
export const FLEX_BUDGET_PANEL = 'variance';
export const FLEX_BUDGET_HREF = '#/finance?panel=variance';
export const FLEX_BUDGET_CSV_SCOPE = 'flex-budget-variance-statements';

export const FLEX_BUDGET_EVENTS = Object.freeze({
  PLAN_DECLARED: 'flexBudgetPlan.declared',
  PLAN_RETIRED: 'flexBudgetPlan.retired',
  ACTUALS_RECORDED: 'flexBudgetActuals.recorded',
  ACTUALS_WITHDRAWN: 'flexBudgetActuals.withdrawn',
  CONVENTIONS: 'flexBudget.conventions.set',
});

/**
 * Reading is open at every altitude and scoped by the reader to the statements
 * whose budget holder sits in the seat's tree or on a declared line it holds —
 * plus any statement that names the seat as an owner of one of its variances,
 * because a person a variance is attributed to is entitled to read it.
 * DECLARING a standard is the act of a seat ABOVE the budget holder. RECORDING
 * actuals is the budget holder's own act, or that of a seat that holds them.
 */
export const FLEX_BUDGET_RIGHTS = Object.freeze({
  READ: 'read-flex-budget',
  DECLARE: 'declare-flex-budget-plan',
  RECORD: 'record-flex-budget-actuals',
  GOVERN: 'govern-flex-budget',
});

export const FLEX_BUDGET_LIMITS = Object.freeze({
  plans: 400,
  actuals: 2400,
  linesPerPlan: 24,
  unplannedPerActual: 8,
  titleMin: 3,
  titleMax: 120,
  labelMax: 80,
  unitMax: 16,
  poolMax: 24,
  driverMax: 60,
  reasonMin: 12,
  reasonMax: 600,
  periodMaxDays: 731,
  maxCents: 900_000_000_000_000, // 9 × 10^12 currency units, in cents — inside the safe integer range
  maxQtyE3: 1_000_000_000_000, // one thousand million units, in thousandths
  maxPriceE4: 100_000_000_000, // ten million currency units, in ten-thousandths
  maxMaterialityBp: 10000,
  statementsShown: 60,
  currenciesShown: 12,
});

export const FLEX_BUDGET_SETTING_KEYS = Object.freeze({
  actualsDueDays: 'flexBudgetActualsDueDays',
});
export const FLEX_BUDGET_SETTING_LABELS = Object.freeze({
  actualsDueDays: 'Days after a period ends within which its final actuals are due',
});
export const FLEX_BUDGET_BOUNDS = Object.freeze({
  actualsDueDays: Object.freeze([1, 90]),
});
export const FLEX_BUDGET_DEFAULTS = Object.freeze({
  actualsDueDays: 15,
});

/* ------------------------------------------------------------ vocabularies */

export const FLEX_LINE_BEHAVIOURS = Object.freeze([
  Object.freeze({
    key: 'variable',
    label: 'Variable — flexes with the activity',
    says: 'A budgeted quantity at a standard price. The standard is restated for the volume of work actually done, so doing more work is never read as overspending on this line.',
  }),
  Object.freeze({
    key: 'fixed',
    label: 'Fixed — a lump for the period',
    says: 'One amount for the whole period. It does not flex with the activity, so its only variance is spending — and that is printed only once the period has ended.',
  }),
]);
export const FLEX_LINE_BEHAVIOUR_KEYS = Object.freeze(FLEX_LINE_BEHAVIOURS.map((row) => row.key));

/**
 * The variance classes, in bridge order. `owner` names the declared role that
 * answers for the class — a role, never a person the register picked.
 */
export const FLEX_VARIANCE_CLASSES = Object.freeze([
  Object.freeze({ key: 'activity', label: 'Activity (volume)', owner: 'volume', says: 'Flexible budget − static budget: what the change in the volume of work alone explains, at standard quantities and standard prices. More work at standard cost is not overspending.' }),
  Object.freeze({ key: 'price', label: 'Price (pure)', owner: 'rate', says: '(Actual price − standard price) × the standard quantity allowed for the work done. The cost of the rate alone, on the quantity the standard would have used.' }),
  Object.freeze({ key: 'joint', label: 'Joint price × quantity', owner: 'shared', says: '(Actual price − standard price) × (actual quantity − standard quantity allowed). It exists only because the rate AND the usage both moved. The textbook two-way split bills it to the rate-setter; this register prints it apart and, where the two owners differ, shared.' }),
  Object.freeze({ key: 'efficiency', label: 'Efficiency (usage)', owner: 'usage', says: '(Actual quantity − standard quantity allowed) × standard price. The cost of using more or less input than the standard allows for the work actually done, priced at standard so a rate change cannot leak into it.' }),
  Object.freeze({ key: 'spending', label: 'Fixed spending', owner: 'usage', says: 'Actual − lump, for an input that does not flex. Printed once the period has ended.' }),
  Object.freeze({ key: 'unplanned', label: 'Unplanned', owner: 'holder', says: 'Cost recorded against this cost object for which the plan holds no line. The whole amount is a variance, and it answers to the budget holder.' }),
]);
export const flexVarianceClassByKey = (key) => FLEX_VARIANCE_CLASSES.find((row) => row.key === key) || null;

/** Why a statement is or is not printed. Decided in this order; one state each. */
export const FLEX_STATEMENT_STATES = Object.freeze([
  Object.freeze({ key: 'no-actuals', label: 'No actuals recorded', tone: 'neutral', says: 'A standard is declared and nothing has been recorded against it. No variance is printed — an unrecorded cost is not a zero cost.' }),
  Object.freeze({ key: 'unreadable', label: 'Actuals do not fit the plan', tone: 'bad', says: 'The recording on file does not carry exactly the lines of the plan it names, or a figure in it lies outside the range this register computes exactly. It is counted and nothing is computed from it.' }),
  Object.freeze({ key: 'interim', label: 'Interim — flexible-budget variances only', tone: 'info', says: 'The cut-off falls before the period ends. Price, joint, efficiency, mix and yield are valid at any cut-off because the standard is restated for the work done. The activity variance, the static-budget variance and every fixed-cost variance are WITHHELD: the static budget is a full-period figure and no phasing was declared.' }),
  Object.freeze({ key: 'final', label: 'Final — full bridge', tone: 'good', says: 'The cut-off is the last day of the period. The whole bridge is printed: static budget, activity, flexible budget, every cause, actual.' }),
]);
export const flexStatementStateByKey = (key) => FLEX_STATEMENT_STATES.find((row) => row.key === key) || null;

/** How a seat reaches a statement. */
export const FLEX_REACH_LABELS = Object.freeze({
  operator: 'operator view',
  own: 'your own cost object',
  tree: 'reporting tree',
  line: 'declared reporting line',
  named: 'named on this statement as an owner of a variance',
});

/** The refusals this register can print. Keys are stable; sentences are the screen's. */
export const FLEX_BUDGET_REFUSALS = Object.freeze([
  Object.freeze({ key: 'no-actuals', says: 'A statement with no recording prints no variance. Blank in the export, never zero.' }),
  Object.freeze({ key: 'interim-withheld', says: 'An interim statement withholds the activity variance, the static-budget variance and fixed-cost variances: a full-period budget cannot be compared with part of a period, and no phasing was declared to make it comparable.' }),
  Object.freeze({ key: 'no-quantity-no-split', says: 'A line that consumed no quantity has no actual price, so its price variance is printed whole and the joint term is not split out.' }),
  Object.freeze({ key: 'pool-of-one', says: 'A pool with a single line has nothing to substitute, so no mix or yield is computed for it.' }),
  Object.freeze({ key: 'owner-undeclared', says: 'A variance whose answering role nobody declared is printed as undeclared. No owner is read from the reporting graph and none is defaulted to the budget holder.' }),
  Object.freeze({ key: 'joint-shared', says: 'Where the rate and the usage of a line answer to different people, the joint price × quantity term is printed as shared between the two by name. It is added to neither.' }),
  Object.freeze({ key: 'currencies-not-pooled', says: 'Statements in different currencies are never summed. Each currency has its own roll-up, and nothing is converted.' }),
  Object.freeze({ key: 'interim-not-rolled-up', says: 'Only final statements enter a currency roll-up. An interim statement is listed and counted, never added to a period total it does not yet have.' }),
  Object.freeze({ key: 'outside-span', says: 'Statements whose budget holder sits outside this seat’s reporting tree and declared lines are counted, not shown.' }),
  Object.freeze({ key: 'unreadable-actuals', says: 'A recording that does not fit its plan is counted and computes nothing.' }),
  Object.freeze({ key: 'share-of-nothing', says: 'A share of a zero base is not a percentage. It prints a dash.' }),
]);

/* --------------------------------------------------------------------- CSV */

export const FLEX_BUDGET_CSV_COLUMNS = Object.freeze([
  'row_type', 'statement_code', 'line_code', 'currency', 'state', 'period_from', 'period_to', 'as_of',
  'behaviour', 'pooled', 'split',
  'volume_planned_e3', 'volume_actual_e3', 'volume_ratio_bp',
  'static_budget_cents', 'activity_variance_cents', 'flexible_budget_cents',
  'price_variance_cents', 'joint_variance_cents', 'efficiency_variance_cents',
  'mix_variance_cents', 'yield_variance_cents', 'fixed_spending_variance_cents', 'unplanned_cents',
  'actual_cents', 'flexible_budget_variance_cents', 'total_variance_cents',
  'direction', 'material', 'materiality_bp', 'materiality_floor_cents',
  'rate_owner_declared', 'usage_owner_declared', 'volume_owner_declared', 'joint_shared',
  'derived_cells', 'rounded_cells', 'apportioned_cells', 'balances', 'printed_exact',
  'statements_n', 'final_n', 'interim_n', 'no_actuals_n', 'unreadable_n', 'outside_span_n',
  'refusal_key', 'engine_version',
]);

export const FLEX_BUDGET_CSV_DESCRIPTOR = Object.freeze({
  key: FLEX_BUDGET_CSV_SCOPE,
  label: 'Flexible-budget variance statements (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'flex-budget-variance-statements',
  description: 'One identity-free workspace row, one roll-up row per currency (final statements only), one row per statement under an opaque positional code and one row per plan line: the static budget, the activity variance, the flexible budget, the pure price variance, the joint price × quantity term, the efficiency variance with its mix and yield where a pool was declared, fixed spending, unplanned cost, actual cost, and the two integrity claims — whether the printed whole cents add up, and whether they are the exact computed figures or exact rationals shown to the cent. Contains NO person, manager, cost-object title, line label, unit, basis or reason text; ownership exports only as declared / undeclared and whether the joint term is shared. Currencies are never pooled. A figure that is withheld or cannot be claimed exports BLANK with its reason key, never zero. Money is whole cents; quantities are thousandths.',
});

/* ------------------------------------------------------------------ method */

export const FLEX_BUDGET_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'flexible-budget',
    label: 'Flexible budgeting and the static-budget trap (Horngren, Datar & Rajan, Cost Accounting, ch. 7)',
    says: 'A static budget compared with actual cost confounds how much work was done with how well it was done. Restating the standard for the actual volume removes the first and leaves the second. Every variance below the activity line here is measured against that restated standard.',
  }),
  Object.freeze({
    key: 'price-efficiency',
    label: 'Price and efficiency variances at standard (Horngren ch. 7; Drury, Management and Cost Accounting, ch. 17)',
    says: 'The flexible-budget variance of a variable input splits into what the rate did and what the usage did. Efficiency is priced at STANDARD so a rate change cannot leak into the usage figure; price is taken on the standard quantity allowed so a usage change cannot leak into the rate figure.',
  }),
  Object.freeze({
    key: 'joint-variance',
    label: 'The joint price–quantity variance, kept apart',
    says: 'The conventional price variance is computed on the ACTUAL quantity, which bills the rate-setter for extra units somebody else consumed. The cross term (ΔP × ΔQ) belongs to neither alone. It is printed as its own line; conventional price = pure price + joint, and that identity is checked on every row.',
  }),
  Object.freeze({
    key: 'mix-yield',
    label: 'Mix and yield for substitutable inputs (Horngren ch. 14)',
    says: 'Where several inputs measured in one unit can stand in for each other — grades of labour, people drawn from different reporting lines — efficiency splits into MIX (the cost of the actual blend against the budgeted blend, at standard prices) and YIELD (the cost of the total quantity against the total the standard allows). A senior doing work the plan priced at a junior rate is a mix variance, not waste.',
  }),
  Object.freeze({
    key: 'responsibility',
    label: 'Responsibility accounting and controllability (Anthony & Govindarajan, Management Control Systems; Merchant & Van der Stede)',
    says: 'A variance is useful only when it is put in front of the person who can act on its cause. Who that is cannot be computed from a cost: it is declared with the standard. In a matrix the rate and the usage of one input routinely answer to two different managers, which is exactly why the joint term is never assigned to one of them.',
  }),
  Object.freeze({
    key: 'slack',
    label: 'Budgetary slack: the measured person does not set the standard (Merchant 1985; Jensen 2003, “Paying People to Lie”)',
    says: 'A budget holder who writes their own standard has every reason to make it loose, and every favourable variance that follows measures the looseness. A standard here is declared by a seat above the budget holder and by nobody else.',
  }),
  Object.freeze({
    key: 'exception',
    label: 'Management by exception, on a declared threshold',
    says: 'Which variances deserve attention is decided by a materiality threshold declared WITH the standard — an absolute floor and a share of the flexible budget, both of which must be exceeded — and tested on the exact figure, so a rounded cent cannot flip a verdict. Favourable variances are flagged as readily as unfavourable ones: a favourable efficiency variance can be skipped work.',
  }),
  Object.freeze({
    key: 'apportionment',
    label: 'Largest-remainder apportionment (Hamilton) for printed cents',
    says: 'A flexible budget is a ratio of two volumes and is generally not a whole cent. Each exact figure is printed as its floor or its floor plus one cent, with the leftover cents given to the largest remainders, so every row and column of printed cents adds up and no printed cell is a cent or more from its exact value. How many cells were affected is counted and printed.',
  }),
]);

export const FLEX_BUDGET_METHOD = Object.freeze({
  standard: 'A standard is declared, never inferred: one cost object, one period, one currency, one activity driver and its planned volume. Each variable line states a budgeted quantity for the period and a standard price per unit; each fixed line states a lump. The implied standard per unit of activity is budgeted quantity ÷ planned volume. Nothing is read from a budget envelope, a transfer price or a posted period.',
  actuals: 'A recording states the cut-off day, the volume of activity actually done to that day, and — for EVERY plan line — the quantity consumed and the cost recorded, with the source in writing. Cost for which the plan holds no line is recorded as unplanned. A later recording supersedes an earlier one; a withdrawn recording stays on the ledger with its reason.',
  flexible: 'The flexible budget is the standard restated for the work done: budgeted quantity × actual volume ÷ planned volume, at standard price. Fixed lumps and unplanned cost do not flex.',
  bridge: 'Static budget + activity variance = flexible budget. Flexible budget + price + joint + efficiency + fixed spending + unplanned = actual cost. Both identities are re-added from the printed whole cents on every read and the result is printed.',
  interim: 'A cut-off before the period’s last day is an interim reading. The flexible-budget variances of the variable lines are valid — the standard is restated for the work done to the cut-off. The activity variance, the static-budget variance and fixed-cost variances are withheld, because the static budget and the lumps are full-period figures and no phasing was declared.',
  materiality: 'A figure is material when its exact magnitude reaches BOTH declared thresholds: the absolute floor and the share of its base (the flexible budget of the line or statement; the static budget for the activity variance). A share of zero switches that test off. An unplanned cost has no base and passes the share test by definition.',
  owners: 'Three roles may be declared with the standard, per plan and per line: who agreed the prices (rate), who directs the usage (usage), and who set the planned volume (volume). A line that names no one inherits the plan’s declaration for that role; where neither names anyone the amount is undeclared. Unplanned cost answers to the budget holder. The joint term goes to one person only where the rate and usage owners are the same person; where they differ it is shared between the two by name; where either is undeclared it is undeclared.',
  matrix: 'A cost object is counted once however many reporting lines reach its budget holder. A statement is visible to a seat that holds the budget holder through its tree or a declared line, and to anyone it names as an owner. Owners are named only among the people the declaring seat itself holds — through the tree or a declared line — or the declaring seat itself, so one line never attributes a variance to a peer line’s manager; a rate set outside that span stays undeclared until the seat above both declares it.',
  rounding: 'Money is recorded in whole cents, quantities in thousandths, prices in ten-thousandths of a currency unit. Every computation is an exact rational over arbitrary-precision integers. Printed cents are apportioned by largest remainder inside each identity; the count of exact, rounded and apportioned cells is printed beside the statement.',
  notSaid: 'Nothing here says a variance is good or bad, that a standard was right, or that a person performed. A favourable variance can be a loose standard or skipped work; an unfavourable one can be a deliberate trade. It says: given the standard a seat above declared and the actuals recorded with their source, this is exactly how the gap divides, and these are the people who were declared to answer for each part.',
});

/** The bridge, in the order the chart and the commentary walk it. */
export const FLEX_BRIDGE_STEPS = Object.freeze([
  Object.freeze({ key: 'static', label: 'Static budget', kind: 'level', finalOnly: true }),
  Object.freeze({ key: 'activity', label: 'Activity', kind: 'delta', finalOnly: true }),
  Object.freeze({ key: 'flex', label: 'Flexible budget', kind: 'level', finalOnly: false }),
  Object.freeze({ key: 'price', label: 'Price', kind: 'delta', finalOnly: false }),
  Object.freeze({ key: 'joint', label: 'Joint', kind: 'delta', finalOnly: false }),
  Object.freeze({ key: 'efficiency', label: 'Efficiency', kind: 'delta', finalOnly: false }),
  Object.freeze({ key: 'spending', label: 'Fixed spending', kind: 'delta', finalOnly: true }),
  Object.freeze({ key: 'unplanned', label: 'Unplanned', kind: 'delta', finalOnly: false }),
  Object.freeze({ key: 'actual', label: 'Actual', kind: 'level', finalOnly: false }),
]);
