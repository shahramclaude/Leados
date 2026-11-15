/**
 * app/core/domain/earnedValueRegistry.js — the closed vocabulary of the
 * Earned-Value Delivery & Estimate-at-Completion Register (ADR-0217, Session 290,
 * Schema v171, `RULE-EVL-01`, CSV scope #159, `#/finance?panel=earned-value`).
 *
 * THE DUTY, IN A PROGRAMME DIRECTOR'S WORDS. The capital case was approved in
 * March with a dated plan. In November the board asks three questions: how much
 * of the work is actually DONE (not how much money was spent, not how excited the
 * steering group is), whether the remaining work will finish for the remaining
 * money, and whose plan it is when the answer is no. The investment case
 * register (ADR-0208) appraises the promise; it says nothing about whether the
 * work is arriving on the curve. The value bridge (ADR-0214) reads the owners'
 * claim at two dates; it does not see the work either. This register holds the
 * WORK: a baselined, time-phased earning plan, dated evidence of progress
 * against it, the money actually spent, and one common cut-off the whole board
 * reads against.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Targeted
 * searches of `app/` before this build returned ZERO files for `earned value`,
 * ZERO for `cost performance index` / `CPI`, ZERO for `schedule performance
 * index` / `SPI`, ZERO for `estimate at completion` / `EAC`, ZERO for `TCPI`
 * and ZERO for `actual cost`. The nearest relatives are printed in the Method
 * view and they are not this: the investment case records dated promised and
 * actual FINANCIAL flows (not the budgeted value of work completed), and the
 * value bridge attributes movement in the owners' claim (not delivery).
 * Wider absence: [UNVERIFIED].
 *
 * FIVE THINGS THIS REGISTER ADDS, EACH OF WHICH IS A REFUSAL AS WELL AS A FIELD.
 *
 *   1. A DECLARED, TIME-PHASED BASELINE — NEVER AN INVENTED CURVE. Every work
 *      package names a budget and the explicit INCREMENTS of planned value that
 *      come due, with their own dates. The increments must sum to the package
 *      budget to the cent, or the row is refused at the door. There is no
 *      straight-line default and no "typical S-curve": a curve the leader never
 *      declared is a curve the leader never signed.
 *   2. EV EVIDENCE BY DECLARED METHOD, WITH A COMMON CUT-OFF. Every reading
 *      declares the share of each live package that is DONE, measured under the
 *      case's declared method (`0/100`, `halves` at 0/50/100, or a declared
 *      integer percent). A package with no share refuses the reading's EV rather
 *      than zero-filling it; the missing packages are named.
 *   3. PV, EV, AC — AND THE RATIOS KEPT HONEST. PV is the increments dated on or
 *      before the cut-off. EV is the declared shares against the CURRENT live
 *      baseline. AC is the actuals dated on or before the cut-off. CPI = EV/AC
 *      (withheld with a reason when AC is zero — a division by "no spend" is not
 *      1.0 and not ∞). SPI = EV/PV (withheld when PV is zero). CV and SV are
 *      exact cents. Nothing is annualised, discounted, or projected from another
 *      register.
 *   4. ESTIMATE AT COMPLETION IS THREE ASSUMPTION-LABELLED FIGURES, NEVER ONE.
 *      EAC at CPI (current cost efficiency persists), EAC at plan (future work
 *      at the budgeted rate), EAC at CPI×SPI (cost and schedule both persist) —
 *      each printed with its assumption beside it, each refused separately with
 *      its own reason, and NONE printed as "the" answer. TCPI is printed only
 *      when BAC − AC > 0; beyond the budget the index would be fiction.
 *   5. CHANGE IS VISIBLE, NEVER SILENT. The baseline is append-only: a package
 *      is superseded by a dated, reasoned re-baseline act, never edited. Every
 *      reading freezes the signature of the baseline it was cut against; a
 *      re-baseline makes that mismatch print as `baseline-moved` — the reading
 *      stays on the record and stops being presented as today's position.
 *
 * WHAT IT NEVER DOES. It never infers progress from spend, never books an
 * invoice date as a completion, never accepts an EV share the declared method
 * forbids, never counts a shared package twice in a total, never splits a
 * package's money across lines that did not declare shares (a case whose
 * packages do not ALL carry a line split prints NO per-line attribution — the
 * split is refused, not estimated), never converts or pools a currency, never
 * values the programme's benefits, and never rates a person. It says what the
 * plan was, what was actually done, what it cost, and which estimate carries
 * which assumption.
 */

export const EV_ENGINE_VERSION = 'earned-value-2026.11-v1';
export const EV_ADR = 'ADR-0217';
export const EV_RULE_ID = 'RULE-EVL-01';
export const EV_ROUTE = 'earned-value';
export const EV_HREF = '#/finance?panel=earned-value';
export const EV_CSV_SCOPE = 'earned-value-delivery';
export const EV_MARKER_KIND = 'earned-value';

export const EV_EVENTS = Object.freeze({
  CASE_DECLARED: 'earned-value.case.declared',
  BASELINE_REVISED: 'earned-value.baseline.revised',
  CASE_WITHDRAWN: 'earned-value.case.withdrawn',
  READING_RECORDED: 'earned-value.reading.recorded',
  READING_WITHDRAWN: 'earned-value.reading.withdrawn',
  ACTUAL_RECORDED: 'earned-value.actual.recorded',
  ACTUAL_WITHDRAWN: 'earned-value.actual.withdrawn',
  CONVENTIONS: 'earned-value.conventions.set',
  SCAN: 'earned-value.scan',
});
export const EV_EVENT_PREFIX = 'earned-value.';

/**
 * The register is PORTFOLIO material: a delivery baseline carries the money of a
 * programme. Rank 3 (director) reads it; declaring a case and recording its
 * evidence are director acts; the conventions are the chief's. Frontline and
 * manager ranks are served by the people who hold the programme, not by this
 * floor — a case names real money and real dates.
 */
export const EV_RIGHTS = Object.freeze({
  READ: 'read-earned-value',
  DECLARE: 'declare-earned-value',
  RECORD: 'record-earned-value',
  GOVERN: 'govern-earned-value',
});

export const EV_LIMITS = Object.freeze({
  cases: 120,
  packages: 6000,
  readings: 2400,
  actuals: 6000,
  markers: 400,
  /** 9 × 10^12 currency units, in cents — inside the safe integer range. */
  maxCents: 900_000_000_000_000,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  labelMin: 3,
  labelMax: 120,
  codeMax: 40,
  noteMax: 800,
  reasonMin: 12,
  reasonMax: 400,
  evidenceMin: 20,
  evidenceMax: 800,
  sourceMax: 200,
  personIdMax: 120,
  phasesMax: 240,
  sharesShown: 100,
});

/**
 * The declared progress-measurement method. This is not a UI hint: the loader
 * and the writer both REFUSE shares the method does not admit, which is what
 * makes `0/100` mean something. A reading under the wrong method is a different
 * claim and is never silently accepted.
 */
export const EV_METHODS = Object.freeze([
  Object.freeze({
    key: 'zero-hundred',
    label: '0 / 100 — nothing until it is finished',
    says: 'Every package reads 0 until it is complete, then 100. The strictest method, and the only one that cannot print credit for effort: a package at 99% earns exactly nothing.',
    admits: Object.freeze([0, 100]),
  }),
  Object.freeze({
    key: 'halves',
    label: 'Halves — 0, 50 or 100',
    says: 'A package started-but-not-done earns half its budget. Refuses any other share, so "sort of nearly done" cannot round itself into money.',
    admits: Object.freeze([0, 50, 100]),
  }),
  Object.freeze({
    key: 'percent-complete',
    label: 'Percent complete — a declared integer 0–100',
    says: 'The share is whatever the accountable seat declares, as a whole percent. Weakest on its own; pair it with named evidence on the reading.',
    admits: null, // any integer 0..100
  }),
]);
export const EV_METHOD_KEYS = Object.freeze(EV_METHODS.map((row) => row.key));
export const evMethodByKey = (key) => EV_METHODS.find((row) => row.key === key) || null;

/**
 * One state at a time, decided in this order. Every state is a fact about the
 * record, never a verdict on a person:
 *
 *   withdrawn       → the case was retracted with a written reason; kept, out of totals
 *   unbaselined     → no live package exists; nothing is measured yet
 *   awaiting-reading→ a baseline exists and no live reading does
 *   baseline-moved  → the newest reading freezes an older baseline signature
 *   package-missing → the newest reading names no share for a live package
 *   overrun         → cost figures support it and CPI is under the declared floor
 *   stale           → the newest reading is older than the declared staleness window
 *   on-plan         → none of the above
 *
 * `baseline-moved` and `package-missing` outrank every figure-based word: a
 * reading computed against a plan that no longer exists is not overrun evidence,
 * it is a re-baseline waiting to happen.
 */
export const EV_CASE_STATES = Object.freeze([
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', says: 'The case was retracted with a written reason. It is kept on the record, excluded from every roll-up, and the exclusion is counted.' }),
  Object.freeze({ key: 'unbaselined', label: 'No baseline yet', tone: 'info', says: 'The case exists and no live package does. Nothing is measured, PV is zero, and no ratio is offered.' }),
  Object.freeze({ key: 'awaiting-reading', label: 'Baselined, never read', tone: 'warn', says: 'A live baseline exists and no live reading does. There is no evidence of progress on the record yet.' }),
  Object.freeze({ key: 'baseline-moved', label: 'Baseline moved since the reading', tone: 'warn', says: 'The newest reading freezes the signature of the baseline it was cut against, and the live baseline no longer carries that signature. Figures are re-derived against the CURRENT baseline and printed with the drift named.' }),
  Object.freeze({ key: 'package-missing', label: 'A package has no share in the reading', tone: 'bad', says: 'A live package names no earned share in the newest reading. EV — and everything derived from it — is refused rather than zero-filled; the missing packages are named.' }),
  Object.freeze({ key: 'overrun', label: 'Under the cost floor', tone: 'bad', says: 'The cost side of the record is complete and CPI is below the declared floor. A dated human decision is owed, not a recalculated plan.' }),
  Object.freeze({ key: 'stale', label: 'Reading is stale', tone: 'warn', says: 'The newest reading is older than the declared staleness window. The position on the board pack is a past fact wearing today’s date.' }),
  Object.freeze({ key: 'on-plan', label: 'On the record, nothing overdue', tone: 'good', says: 'The newest reading is complete against the current baseline, inside the staleness window, and CPI is at or above the declared floor. It is a statement about the record, not a congratulation.' }),
]);
export const EV_CASE_STATE_BY_KEY = Object.freeze(Object.fromEntries(EV_CASE_STATES.map((row) => [row.key, row])));

export const EV_SETTING_KEYS = Object.freeze({
  staleDays: 'earnedValueStaleDays',
  cpiFloorPpm: 'earnedValueCpiFloorPpm',
  autoPropagate: 'earnedValueAutoPropagate',
});

export const EV_SETTING_LABELS = Object.freeze({
  staleDays: 'Days after which the newest reading is printed as stale',
  cpiFloorPpm: 'Cost efficiency (CPI × 10,000) below which a dated ask is owed',
  autoPropagate: 'Ask the case owner for the reading or decision the record is owed',
});

export const EV_BOUNDS = Object.freeze({
  staleDays: Object.freeze([7, 180]),
  cpiFloorPpm: Object.freeze([8000, 10000]),
});

export const EV_DEFAULTS = Object.freeze({
  staleDays: 35,
  cpiFloorPpm: 9500,
  autoPropagate: true,
});

/** The five reading-state verdicts a stored reading can be shown with. */
export const EV_READING_STATES = Object.freeze([
  Object.freeze({ key: 'current', label: 'Current', tone: 'good', says: 'Cut against the live baseline, every live package named, date on or before today.' }),
  Object.freeze({ key: 'baseline-moved', label: 'Baseline moved', tone: 'warn', says: 'The baseline it was cut against has since been re-baselined. Kept as history; its figures are re-derived against today’s plan and printed as such.' }),
  Object.freeze({ key: 'package-missing', label: 'A live package is unnamed', tone: 'bad', says: 'A live package names no share in this reading. EV is refused for the reading rather than zero-filled.' }),
]);
export const EV_READING_STATE_BY_KEY = Object.freeze(Object.fromEntries(EV_READING_STATES.map((row) => [row.key, row])));

/** The named refusals. Every one of them is a control, not an error message. */
export const EV_REFUSALS = Object.freeze([
  Object.freeze({ key: 'case-label-required', says: 'A case names the work, in at least a few characters.' }),
  Object.freeze({ key: 'case-currency-required', says: 'A case is declared in three letters (for example DKK). Money has no unit without it.' }),
  Object.freeze({ key: 'case-owner-required', says: 'A case names one accountable delivery owner.' }),
  Object.freeze({ key: 'case-owner-not-on-roster', says: 'The delivery owner must be a person this roster holds, or the workspace leader.' }),
  Object.freeze({ key: 'case-owner-out-of-reach', says: 'The declaring seat may only name an owner it holds — on its home line or a declared line — or itself.' }),
  Object.freeze({ key: 'case-unknown', says: 'A package, reading or actual belongs to a case this record holds.' }),
  Object.freeze({ key: 'case-withdrawn', says: 'This case was withdrawn with a written reason. A withdrawn case takes no new packages, readings or actuals.' }),
  Object.freeze({ key: 'code-required', says: 'A work package carries its WBS code, unique within the case.' }),
  Object.freeze({ key: 'code-duplicate', says: 'That WBS code is already a live package of this case. A re-baseline supersedes the old package; it does not clone the code.' }),
  Object.freeze({ key: 'package-name-required', says: 'A work package names the work in at least a few characters.' }),
  Object.freeze({ key: 'package-budget-required', says: 'A work package carries a budget in whole cents, to the cent.' }),
  Object.freeze({ key: 'package-dates-required', says: 'A work package names its planned start and finish as real calendar days, start on or before finish.' }),
  Object.freeze({ key: 'package-dates-reversed', says: 'A package that finishes before it starts is not a plan.' }),
  Object.freeze({ key: 'phases-required', says: 'Declare the increments of planned value, one per line: a date on which an increment comes due, and whole cents.' }),
  Object.freeze({ key: 'phase-unparseable', says: 'One increment line could not be read as "YYYY-MM-DD <amount>". Nothing was saved.' }),
  Object.freeze({ key: 'phase-date-out-of-range', says: 'An increment is dated outside the register’s range.' }),
  Object.freeze({ key: 'phase-not-positive', says: 'Every increment is a positive number of cents. A zero or negative increment is not planned value.' }),
  Object.freeze({ key: 'phases-do-not-add-to-budget', says: 'The increments must sum to the package budget EXACTLY, to the cent. A phased plan that does not re-add to its own total is not a baseline.' }),
  Object.freeze({ key: 'line-share-duplicate', says: 'A line may hold at most one share of a package.' }),
  Object.freeze({ key: 'line-share-out-of-range', says: 'A line share is an integer 0–100.' }),
  Object.freeze({ key: 'line-shares-do-not-add', says: 'Line shares must sum to exactly 100 when declared. A package funded 70/70 across two lines is funded 140, and money does not work that way.' }),
  Object.freeze({ key: 'line-unknown', says: 'A line share must name a line this workspace has declared.' }),
  Object.freeze({ key: 'reading-date-required', says: 'A reading is dated with a real calendar day, on or after the day the case was declared, never in the future.' }),
  Object.freeze({ key: 'reading-before-declared', says: 'A reading cannot predate the case it measures. Evidence gathered before the plan existed is not evidence about the plan.' }),
  Object.freeze({ key: 'share-not-admitted', says: 'That share is not one the case’s declared method admits. Under 0/100 a package is nothing or finished; under halves it is 0, 50 or 100.' }),
  Object.freeze({ key: 'share-unknown-package', says: 'A share names a package this record holds — live or superseded, and the row keeps which.' }),
  Object.freeze({ key: 'reading-incomplete', says: 'Every live package needs a share in a reading. The missing packages are named; EV is refused, not zero-filled.' }),
  Object.freeze({ key: 'evidence-required', says: 'A reading names the evidence it read — the percent complete, the milestone ticked, the minutes, the inspection. Numbers with no source are a mood.' }),
  Object.freeze({ key: 'actual-amount-required', says: 'An actual is a positive amount in the case’s currency, to the cent.' }),
  Object.freeze({ key: 'actual-date-required', says: 'An actual is dated with the day it was incurred, never in the future.' }),
  Object.freeze({ key: 'actual-unknown-package', says: 'An actual names a package of this case — or none, to be honestly carried as unallocated.' }),
  Object.freeze({ key: 'rebaseline-reason-required', says: 'A re-baseline states why, in writing, in at least a sentence. "Because" is not a reason.' }),
  Object.freeze({ key: 'rebaseline-no-change', says: 'A re-baseline that changes nothing is not a re-baseline. Name a package, a budget, an increment set, a date range or a line share.' }),
  Object.freeze({ key: 'convention-out-of-bounds', says: 'A declared convention outside its bounds is refused, never clamped. A typo must not move the floor the board reads.' }),
  Object.freeze({ key: 'cap-reached', says: 'The register reached its row cap for this ledger. Export the workspace before adding another row.' }),
]);
export const EV_REFUSAL_BY_KEY = Object.freeze(Object.fromEntries(EV_REFUSALS.map((row) => [row.key, row])));

/**
 * The frameworks this register applies, named rather than paraphrased, printed on
 * the Method view so a reader can check the register against the practice it
 * claims to implement.
 */
export const EV_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'pmbok',
    label: 'PMI, *PMBOK Guide*, 7th ed. / Practice Standard for Earned Value Management — PV, EV, AC, CV, SV, CPI, SPI',
    says: 'Planned value is the authorised budget assigned to scheduled work; earned value is the value of work actually performed measured against the plan; actual cost is what the work cost. Everything in this register is a direct implementation of those three definitions, re-read from the record on every open.',
  }),
  Object.freeze({
    key: 'pmw',
    label: 'Fleming & Koppelman, *Earned Value Project Management* — the indices and their interpretations',
    says: 'CPI below 1 means the work costs more than it earns; SPI below 1 means it earns slower than planned. The register prints both with their denominators and refuses either when its denominator is zero or absent — an index of nothing is not a number.',
  }),
  Object.freeze({
    key: 'lipke',
    label: 'Lipke (2003), *Earned Schedule*; PMI — estimate at completion under stated assumptions',
    says: 'An EAC is an assumption wearing a number. This register prints three of them (at CPI, at plan, at CPI×SPI) each with its assumption attached, and refuses each separately when its inputs are missing — no EAC is printed as "the" estimate.',
  }),
  Object.freeze({
    key: 'coso',
    label: 'COSO 2013 principle 10 (control activities) and ISO 21502 baselining',
    says: 'A baseline is a controlled artefact: changing it is a dated, reasoned, append-only act — never an edit in place. A reading that no longer matches the baseline it was cut against is printed as baseline-moved rather than silently re-based, which is the same discipline as a period close in the finance ledgers.',
  }),
  Object.freeze({
    key: 'galbraith',
    label: 'Galbraith (1971); Bartlett & Ghoshal (1990) — matrix second lines and shared work',
    says: 'A package worked across two lines belongs to ONE case for money purposes. Line attribution is published only when every live package declares shares that sum to exactly 100; anything else prints NOTHING per line, because an estimated split is a fabricated allocation wearing a chart.',
  }),
  Object.freeze({
    key: 'kahneman',
    label: 'Kahneman & Tversky (1979); Flyvbjerg (2006) — planning fallacy and reference-class forecasting',
    says: 'Declared plans run optimistic. The register keeps the ORIGINAL baseline visible beside the re-baselined one and never silently re-phases a slipping package into the future: a plan that keeps moving its own goalposts reads as on-plan forever.',
  }),
  Object.freeze({
    key: 'sweeney',
    label: 'CDC / Sweeney (2002) — cell suppression, applied to money',
    says: 'Below the declared evidence floor — no AC, no PV, no complete share set — the affected cells are WITHHELD with the reason printed, never rendered as zero. A zero where the record is silent reads as reassurance; a withheld cell reads as a question.',
  }),
]);

/** The register's own account of what it is and is not. Printed, not implied. */
export const EV_METHOD = Object.freeze({
  baseline:
    'A baseline is a set of work packages. Each package carries a budget in whole cents and the explicit increments of planned value, with their dates, that RE-ADD to that budget exactly. There is no default curve and no interpolation at write time: if the increments do not sum to the budget, the package is refused. Changing a baseline is a dated, reasoned, append-only act — a package is superseded, never edited in place, and the reading that was cut against the old baseline prints as baseline-moved.',
  cutoff:
    'Every figure is read against ONE cut-off day, named on the reading. Actuals and increments dated after the cut-off are excluded and counted. There is no as-of-now default quietly substituted for the board’s date.',
  ev:
    'EV is the declared share of each live package, measured under the case’s declared method (0/100, halves, or a declared integer percent), against the CURRENT live baseline. A package with no share in the reading refuses EV entirely; the missing packages are named, because an EV that is quiet about what it does not know is a manufactured number.',
  ratios:
    'CPI = EV ÷ AC and SPI = EV ÷ PV. CPI is withheld with a reason when no actual cost has been recorded (a division by zero is not 1.0); SPI is withheld when PV is zero. CV and SV are exact cents. The apportionment of package EV to whole cents uses largest remainder, so printed rows re-add to printed totals.',
  eac:
    'Estimate at completion is printed as three assumption-labelled figures — EAC at CPI (current efficiency persists), EAC at plan (future work at the budgeted rate), EAC at CPI×SPI (both persist) — each refused separately when its inputs are missing, and none of them is "the" answer. TCPI is printed only while BAC − AC > 0.',
  lines:
    'Per-line attribution is published only when EVERY live package carries line shares summing to exactly 100. Apportionment is largest-remainder, so the lines re-add to the case to the cent. A case that fails the test prints NO per-line money and names itself in the refusal count — an estimated split is a fabricated allocation.',
  unallocated:
    'An actual that belongs to no package is carried as its own printed bucket: counted in the case AC, attributed to no package and no line, never dropped.',
  limits:
    'It never infers progress from spend, never books an invoice as a completion, never accepts a share the method forbids, never converts or pools a currency, never values the programme’s benefits (that is the investment case), and never rates a person. Readings are re-derived from the record on every read; nothing derived is stored.',
});

/** CSV #159 — aggregate, identity-free, blanks a refused figure rather than zeroing it. */
export const EV_CSV_COLUMNS = Object.freeze([
  'as_of',
  'currency',
  'row_kind',
  'register_scope_n',
  'cases_open_n',
  'cases_unbaselined_n',
  'cases_awaiting_reading_n',
  'cases_baseline_moved_n',
  'cases_package_missing_n',
  'cases_stale_n',
  'cases_overrun_n',
  'cases_on_plan_n',
  'packages_live_n',
  'readings_n',
  'actuals_unallocated_n',
  'line_split_refused_n',
  'bac_cents',
  'pv_cents',
  'ev_cents',
  'ac_cents',
  'cv_cents',
  'sv_cents',
  'cpi_ppm',
  'spi_ppm',
  'eac_at_cpi_cents',
  'eac_at_plan_cents',
  'eac_at_cpi_spi_cents',
  'counts_reconcile',
  'figures_complete',
]);

export const EV_CSV_DESCRIPTOR = Object.freeze({
  key: EV_CSV_SCOPE,
  label: 'Earned-value delivery (aggregate)',
  group: 'finance',
  sensitive: true,
  filenameSlug: 'earned-value-delivery',
  description: 'One summary row per currency over the register as read on as_of. Every money figure is an exact integer number of whole cents in that currency; a refused figure exports BLANK with its reason printed on the panel, never a zero. NO case name, NO package code, NO person id, NO cut-off date of any individual reading and NO evidence note is exported — counts, totals and the two printed identities are the whole of it, and currencies are never pooled.',
});

export const EV_PAUSE_SWITCH = EV_SETTING_KEYS.autoPropagate;

export const EV_VIEWS = Object.freeze([
  Object.freeze({ key: 'cases', label: 'Cases' }),
  Object.freeze({ key: 'lines', label: 'Line attribution' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);
