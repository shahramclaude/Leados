/**
 * app/core/domain/workforceFlowRegistry.js — closed vocabulary for the Workforce
 * Stock-Flow (Markov manpower) Plan (ADR-0184, Session 252, Schema v146,
 * `#/matrix?panel=stock-flow`, CSV scope #138).
 *
 * THE DUTY. A chief does not decide one promotion, one hire or one attrition
 * spike. They decide the SHAPE of the organisation four to eight quarters out —
 * and the shape is a system of stocks and flows: how many people sit at each
 * level, at what rate people are promoted up, hired in and leave, and how long
 * they wait in grade. Without that, a hiring freeze, a promotion round or a
 * spike in attrition is judged one decision at a time and the structural
 * consequences (a hollowed-out middle, a promotion queue that cannot clear, a
 * span that has to widen) arrive unannounced.
 *
 * WHAT MAKES THIS HARD, AND WHAT THIS MODULE REFUSES TO DO
 * -------------------------------------------------------
 * The roster stores ONE level per person (`person.level`) and one promotion day
 * (`lastPromotionOn`). It does NOT store a level history. Every serious manpower
 * model needs a level-by-level transition COUNT observed over a window — and a
 * snapshot of today's levels cannot produce one. Estimating a rate from
 * snapshots that were never taken is the classic way this analysis lies: the
 * promotion rate becomes whatever today's pyramid happens to look like. So the
 * moves are recorded as their own dated, append-only acts (`workforceFlowActs`),
 * empty on upgrade, and every rate is estimated ONLY from acts observed inside
 * a declared window with the exposure printed beside it.
 *
 * The three refusals that carry the module:
 *   1. `insufficient-exposure` — a cell below the declared floor is BLANK with
 *      its reason, never smoothed toward a prior, never borrowed from a
 *      neighbouring level. (Bartholomew's small-cell discipline; the same
 *      fail-closed rule the retention engine already applies.)
 *   2. `incomplete-origin`  — a departure whose origin level was never recorded
 *      is counted and excluded from every rate; it is never assigned to the
 *      level the person carries today (they are archived, and today's level of
 *      an archived person is not the level they left from).
 *   3. `closed-window`      — a projection is refused outright unless the whole
 *      observation window is recorded. A projection from four months of data
 *      to eight quarters is arithmetic, not a forecast.
 *
 * MATRIX CORRECTNESS. A person on two reporting lines is ONE person in the
 * stock — counting them once per line is the double-count the Matrix Leadership
 * Mandate forbids. The per-line view therefore reports SHARE-WEIGHTED
 * headcount (integer hundredths, the matrix engine's own unit) beside the whole
 * headcount, and refuses any share-weighted figure for a person whose split was
 * never declared. The whole-workspace pyramid is untouched by any of this.
 *
 * Leaf-ish module: imports nothing (so schema, read model, rule, actions, CSV
 * and view can all depend on it without an import cycle).
 */

export const WORKFORCE_FLOW_ENGINE_VERSION = 'workforce-stock-flow-2026.11-v1';
export const WORKFORCE_FLOW_ADR = 'ADR-0184';
export const WORKFORCE_FLOW_RULE_ID = 'RULE-WFS-01';
export const WORKFORCE_FLOW_PANEL = 'stock-flow';
export const WORKFORCE_FLOW_CSV_SCOPE = 'matrix-workforce-stock-flow';

export const WORKFORCE_FLOW_EVENTS = Object.freeze({
  MOVE_RECORDED: 'workforce.move.recorded',
  MOVE_WITHDRAWN: 'workforce.move.withdrawn',
  TARGET_DECLARED: 'workforce.target.declared',
  TARGET_RETIRED: 'workforce.target.retired',
  CONVENTIONS: 'workforce.conventions.set',
  SCAN: 'workforce.flow.scan',
});

/**
 * The two acts a human performs. Recording a move is a manager act against a
 * person they reach; declaring the intended shape is the chief's act.
 */
export const WORKFORCE_FLOW_RIGHTS = Object.freeze({
  RECORD: 'record-workforce-move',
  GOVERN: 'govern-workforce-plan',
});

/**
 * THE STOCKS. The roster's own six levels, in ascending order — taken from
 * `LEVELS` in the schema by the reader, restated here in print order so this
 * file has no import. `index` is the position on the ladder and is the ONLY
 * thing a promotion or a demotion is measured against.
 */
export const WORKFORCE_FLOW_LEVELS = Object.freeze([
  Object.freeze({ key: 'ic', label: 'Individual contributor', index: 0 }),
  Object.freeze({ key: 'senior', label: 'Senior IC', index: 1 }),
  Object.freeze({ key: 'lead', label: 'Team lead', index: 2 }),
  Object.freeze({ key: 'manager', label: 'Manager', index: 3 }),
  Object.freeze({ key: 'director', label: 'Director', index: 4 }),
  Object.freeze({ key: 'vp', label: 'VP / Executive', index: 5 }),
]);

export const WORKFORCE_FLOW_LEVEL_KEYS = Object.freeze(WORKFORCE_FLOW_LEVELS.map((l) => l.key));

export function workforceLevel(key) {
  return WORKFORCE_FLOW_LEVELS.find((l) => l.key === key) || null;
}

export function workforceLevelIndex(key) {
  const row = workforceLevel(key);
  return row ? row.index : null;
}

export function workforceLevelLabel(key) {
  return workforceLevel(key)?.label || 'Level not recorded';
}

/**
 * THE FLOWS. A transition is one of exactly seven kinds. Anything else is not a
 * move this model can price, and is refused rather than binned into `other`.
 *
 * `from` / `to` are level keys or the two boundary stocks: `outside` (not yet
 * employed here / no longer employed here). `direction` is a DECLARATION, not a
 * derivation — an act whose declared direction disagrees with its own levels is
 * refused at the door, because a promotion recorded downwards would otherwise
 * quietly become an attrition term.
 */
export const WORKFORCE_FLOW_KINDS = Object.freeze([
  Object.freeze({
    key: 'hire', label: 'Hire', direction: 'in', tone: 'good',
    from: 'outside', to: 'level',
    why: 'A person enters the organisation at a named level. The hire is the stock growing, and its rate is hires per person-year of exposure at that level.',
  }),
  Object.freeze({
    key: 'promotion', label: 'Promotion', direction: 'up', tone: 'good',
    from: 'level', to: 'level',
    why: 'A person moves up one or more rungs. Recorded as ONE act with the count of rungs, so a double promotion cannot be counted as two unobserved single promotions.',
  }),
  Object.freeze({
    key: 'demotion', label: 'Demotion', direction: 'down', tone: 'warn',
    from: 'level', to: 'level',
    why: 'A person moves down one or more rungs. Recorded separately from a voluntary exit: the person stays, and the stock at both levels changes for a different reason.',
  }),
  Object.freeze({
    key: 'lateral', label: 'Lateral move', direction: 'flat', tone: 'neutral',
    from: 'level', to: 'same',
    why: 'A person changes line or role without changing rung. It moves nobody between stocks, so it carries no transition weight — it is recorded because a move that is not a promotion is a real event a reader will otherwise infer as one.',
  }),
  Object.freeze({
    key: 'attrition-voluntary', label: 'Voluntary exit', direction: 'out', tone: 'bad',
    from: 'level', to: 'outside',
    why: 'A person leaves of their own account from a named level. This is the flow a chief can least control and most needs the rate of, per level.',
  }),
  Object.freeze({
    key: 'attrition-involuntary', label: 'Involuntary exit', direction: 'out', tone: 'warn',
    from: 'level', to: 'outside',
    why: 'A person leaves on the organisation’s account from a named level. Kept apart from voluntary attrition: the two have different causes, different costs and different remedies, and pooling them hides both.',
  }),
  Object.freeze({
    key: 'retirement', label: 'Retirement', direction: 'out', tone: 'neutral',
    from: 'level', to: 'outside',
    why: 'A planned exit from a named level. Predictable in a way the other two are not, and separating it keeps the voluntary rate honest.',
  }),
]);

export const WORKFORCE_FLOW_KIND_KEYS = Object.freeze(WORKFORCE_FLOW_KINDS.map((k) => k.key));

export function workforceFlowKind(key) {
  return WORKFORCE_FLOW_KINDS.find((k) => k.key === key) || null;
}

/**
 * WHY A MOVE ACT IS REFUSED. Closed, each with a sentence a reader can act on.
 * A refused act is NOT stored: an act the model cannot read would be a count in
 * the ledger and an absence in every rate, which is worse than no act at all.
 */
export const WORKFORCE_FLOW_ACT_REFUSALS = Object.freeze([
  Object.freeze({ key: 'unknown-kind', label: 'Not a declared move kind' }),
  Object.freeze({ key: 'unknown-level', label: 'Names a level the roster does not carry' }),
  Object.freeze({ key: 'direction-mismatch', label: 'Its levels contradict its declared direction' }),
  Object.freeze({ key: 'same-level-promotion', label: 'A promotion or demotion that changes no rung' }),
  Object.freeze({ key: 'missing-person', label: 'Names a person who is not on the roster' }),
  Object.freeze({ key: 'bad-day', label: 'Its effective day is missing or unreadable' }),
  Object.freeze({ key: 'future-day', label: 'Its effective day has not arrived yet' }),
  Object.freeze({ key: 'before-start', label: 'Its effective day precedes the person’s recorded start' }),
  Object.freeze({ key: 'duplicate', label: 'A second act for the same person on the same day' }),
  Object.freeze({ key: 'ledger-full', label: 'The move ledger is at its declared cap' }),
]);

/**
 * WHY A PROJECTION IS WITHHELD. These are the four claims the panel prints
 * SEPARATELY, because they are four different facts:
 *   `observed`   the window's moves were recorded;
 *   `estimated`  a rate was computed from enough exposure;
 *   `projected`  the pyramid was stepped forward;
 *   `compared`   the projection was set against a declared target shape.
 * A projection printed beside a comparison that could not be made is the
 * reassuring lie this module exists to refuse.
 */
export const WORKFORCE_FLOW_WITHHELD_REASONS = Object.freeze([
  'no-window',
  'window-not-covered',
  'no-acts',
  'no-exposure',
  'incomplete-origin',
  'roster-contradiction',
  'insufficient-exposure',
  'ledger-full',
  'matrix-defect',
  'no-target',
  'bound-overrun',
]);

export const WORKFORCE_FLOW_WITHHELD_LABELS = Object.freeze({
  'no-promotion-outflow': 'Nobody left this level by promotion inside the window, so there is no outflow to divide the stock by. The waiting time is blank rather than infinite or zero.',
  'no-window': 'The observation window is missing or does not run forwards.',
  'window-not-covered': 'No recorded move falls in the window, so no rate can be estimated over it — the window is empty, not the organisation.',
  'no-acts': 'No move has ever been recorded in this workspace. The record holds today’s levels, which is not a history and cannot produce a rate.',
  'no-exposure': 'The level carries no recorded person-days of exposure, so no rate may be divided by it.',
  'incomplete-origin': 'At least one move names no origin level. It is counted and excluded from every rate rather than assigned to the level the person carries today.',
  'roster-contradiction': 'A recorded move and the roster disagree about somebody — an exit act behind a person still on the active roster, or a move that does not lead where today’s level sits. Their post-exit or unrecorded time is NOT counted as exposure, because a rate divided by time nobody actually stood at that level is the arithmetic this panel refuses.',
  'insufficient-exposure': 'A cell sits below the declared exposure floor. The rate is BLANK with its reason — it is never smoothed toward a prior or borrowed from a neighbouring level.',
  'ledger-full': 'The move ledger is at its declared cap and the window cannot be read whole; no rate is estimated from a partial ledger.',
  'matrix-defect': 'The declared reporting graph has structural defects, so the per-line reading refuses while the whole-workspace pyramid is unaffected.',
  'no-target': 'No intended shape has been declared, so the projection is printed with no comparison rather than compared with itself.',
  'bound-overrun': 'The reading exceeds a declared processing bound; the claim is refused rather than printed over a partial population.',
});

/**
 * DECLARED CONVENTIONS. Bounds and defaults live here ONCE: the loader clamps,
 * the setter REFUSES outside the bound, and the panel prints both.
 */
export const WORKFORCE_FLOW_SETTING_KEYS = Object.freeze({
  windowMonths: 'workforceFlowWindowMonths',
  horizonQuarters: 'workforceFlowHorizonQuarters',
  minExposure: 'workforceFlowMinExposure',
  askDueDays: 'workforceFlowAskDueDays',
  autoPropagate: 'workforceFlowAutoPropagate',
});

export const WORKFORCE_FLOW_DEFAULTS = Object.freeze({
  windowMonths: 12,
  horizonQuarters: 4,
  /** Person-months of exposure a cell needs before any rate is printed. */
  minExposure: 12,
  askDueDays: 14,
  autoPropagate: true,
});

export const WORKFORCE_FLOW_BOUNDS = Object.freeze({
  windowMonths: Object.freeze([3, 36]),
  horizonQuarters: Object.freeze([1, 8]),
  minExposure: Object.freeze([1, 240]),
  askDueDays: Object.freeze([1, 60]),
});

export const WORKFORCE_FLOW_SETTING_LABELS = Object.freeze({
  windowMonths: 'Observation window (months, 3–36)',
  horizonQuarters: 'Projection horizon (quarters, 1–8)',
  minExposure: 'Fewest person-months of exposure before any rate is printed (1–240)',
  askDueDays: 'Days allowed for a missing-history ask',
  autoPropagate: 'Issue missing-history asks automatically',
});

export const WORKFORCE_FLOW_LIMITS = Object.freeze({
  acts: 4000,
  targets: 200,
  markers: 600,
  /** Whole levels the pyramid may print. Six rungs, so this is a tripwire. */
  levels: 8,
  askedLevels: 6,
  asksPerCommit: 4,
  targetRows: 8,
});

/**
 * THE METHOD, in plain language, printed by the panel. No step is a black box.
 */
export const WORKFORCE_FLOW_METHOD = Object.freeze([
  'A person sits in exactly ONE stock: their roster level. A person on two reporting lines is still one person — the per-line reading reports share-weighted headcount in integer hundredths beside the whole headcount, and refuses the share-weighted figure when the split was never declared.',
  'A move is a dated, append-only human act: one kind (hire, promotion, demotion, lateral, voluntary exit, involuntary exit, retirement), the level it left and the level it went to, and the day it took effect. It is never inferred from a level that changed between two reloads, because that difference could be a correction, a re-organisation or a typo.',
  'Exposure is counted in person-months at each level inside the window — the time the stock actually stood there. A rate is a count of moves divided by that exposure, so a level with three people for a year and a level with thirty people for a month do not produce comparable rates by accident.',
  'A cell below the declared exposure floor prints NO rate. It prints the count it read, the exposure it had, the floor it failed and the arithmetic it declined to perform. There is no prior to smooth toward and no neighbouring level to borrow from.',
  'The projection steps the pyramid forward one quarter at a time: expected headcount per level from the estimated rates, applied to the current stock. The integer rounding remainder of every quarter is carried to the next, and the final rounding difference is printed, so the printed total is provably the sum of the printed rows.',
  'Two flows are kept apart from the transition matrix and priced separately rather than netted: hires enter a level directly and have no origin stock, and lateral moves change no rung. They appear in the projection because they change the stock, and they are excluded from the promotion/attrition rates because they are not transitions between levels.',
  'A projection is WITHHELD outright when the window is not recorded whole, when any move in it names no origin level, or when the record exceeds a processing bound. Four claims are printed apart: the window was observed, the rates were estimable, the pyramid was projected, and the projection was compared with a declared target.',
  'If an intended shape has been declared, the projection is set against it per level and the GAP is printed in whole people with its direction. The module never invents a reply — a gap of eight missing managers is a question for the chief, and the rule below asks it rather than answering it.',
  'Nothing here scores, ranks or forecasts a named person. The projection is a property of the STOCK, not of anybody in it, and no individual appears in any figure, row, brief or export.',
]);

/**
 * THE FRAMEWORKS this module is built on, named so a reader can argue with the
 * modelling choice rather than take it on trust.
 */
export const WORKFORCE_FLOW_FRAMEWORKS = Object.freeze([
  Object.freeze({
    name: 'Markov manpower planning (Bartholomew, Stochastic Models for Social Processes; Bartholomew, Forbes & McClean, Statistical Techniques for Manpower Planning)',
    why: 'A workforce is a Markov chain over grades: the state is the level, and the transition intensities are promotion, wastage (attrition) and recruitment. This module estimates exactly that transition matrix and nothing more — one row per origin stock, one column per destination stock, exposure-corrected.',
  }),
  Object.freeze({
    name: 'Stock-and-flow / system dynamics (Forrester; Sterman, Business Dynamics)',
    why: 'Headcount per level is a STOCK; hires, promotions and exits are FLOWS that change it. A decision that moves one flow without reading the others is the local reasoning stock-and-flow thinking exists to correct — a hiring freeze that stops inflows while promotions keep draining the bottom rung hollows the pyramid from both ends.',
  }),
  Object.freeze({
    name: 'Renewal theory and time-in-grade (Bartholomew; the manpower-planning literature’s waiting-time models)',
    why: 'A promotion queue that cannot clear is not a rate problem but a waiting-time problem. The module prints the observed waiting time in grade beside the projected queue, so a rate that looks healthy against a queue that cannot drain is visible as the contradiction it is.',
  }),
  Object.freeze({
    name: 'Little’s Law (Little, 1961) for the promotion queue',
    why: 'Stock at a level ÷ promotion outflow gives the expected time a person waits in that grade. Printed as an observation with its own reconciliation, never as a prediction about a named person.',
  }),
  Object.freeze({
    name: 'Fail-closed small-cell discipline (the same rule the retention and merit engines apply)',
    why: 'A rate computed over a handful of person-months is noise wearing a decimal point. Below the declared floor the figure is BLANK with its reason — the one convention this codebase will not relax, because a plausible-looking number over an empty cell is how people-analytics products mislead their buyers.',
  }),
]);

/**
 * THE CONVENTIONS THE PANEL PRINTS AS IN FORCE, resolved from settings.
 */
export const WORKFORCE_FLOW_CONVENTIONS = Object.freeze([
  Object.freeze({
    label: 'A rate needs exposure before it is printed',
    detail: 'Every rate in this panel is a count of moves divided by person-months of recorded exposure at that level inside the window. Below the declared floor the rate is BLANK with its reason printed on the row. Nothing is smoothed, nothing is borrowed from a neighbouring level, and no prior is applied silently.',
  }),
  Object.freeze({
    label: 'A move is a human act, never a difference between two loads',
    detail: 'Promotions, demotions, hires and exits enter the model only when a person records them with a day. Re-deriving a move from the difference between two snapshots would turn a correction, a re-organisation or a typo into a transition, and the rate would inherit the error forever.',
  }),
  Object.freeze({
    label: 'One person, one stock',
    detail: 'A person on several reporting lines is counted once in the pyramid. The per-line view adds share-weighted headcount in exact hundredths from the canonical matrix engine, and refuses that figure for any person whose split was never declared. The whole-workspace pyramid does not depend on the matrix at all.',
  }),
  Object.freeze({
    label: 'Rounding is carried, not hidden',
    detail: 'Expected headcount per level is a real number. The projection rounds per level per quarter and carries the remainder into the next quarter, then prints the difference between the sum of the rounded rows and the rounded total. A printed total is the sum of the printed rows, and where it cannot be, the panel says so.',
  }),
  Object.freeze({
    label: 'The projection is not a prediction about a person',
    detail: 'A transition rate is a property of the stock. No figure on this panel — and no column in its export — identifies anybody. The module never scores, ranks or forecasts an individual, and there is no per-person view to ask for.',
  }),
]);

/**
 * The declared columns of the aggregate export. Identity-free by construction:
 * counts, rates, exposure and gap sizes only.
 */
export const WORKFORCE_FLOW_CSV_COLUMNS = Object.freeze([
  'row_type',
  'generated_on',
  'detail_level',
  'window_months',
  'window_from',
  'window_to',
  'horizon_quarters',
  'as_of',
  'levels_declared',
  'headcount_total',
  'headcount_reconcile',
  'acts_total',
  'acts_in_window',
  'acts_refused',
  'origin_unknown',
  'hires',
  'promotions',
  'demotions',
  'laterals',
  'exits_voluntary',
  'exits_involuntary',
  'retirements',
  'flows_withdrawn',
  'flows_reconcile',
  'exposure_months_total',
  'cells_printed',
  'cells_withheld',
  'window_observed',
  'rates_estimable',
  'projection_printed',
  'target_compared',
  'projected_total',
  'rounding_difference',
  'target_total',
  'gap_total',
  'gap_rows_short',
  'gap_rows_over',
  'level',
  'level_label',
  'headcount_now',
  'exposure_months',
  'promotions_out',
  'promotion_rate',
  'attrition_out',
  'attrition_rate',
  'wait_months',
  'projected_q_end',
  'target_headcount',
  'gap',
  'row_reason',
  'open_history_asks',
]);

export const WORKFORCE_FLOW_CSV_DESCRIPTOR = Object.freeze({
  key: WORKFORCE_FLOW_CSV_SCOPE,
  label: 'Workforce stock-flow plan (aggregate)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: WORKFORCE_FLOW_CSV_SCOPE,
  description: 'One workspace row (window, declared conventions, act counts reconciled to the acts read, exposure, how many rate cells were printed and how many withheld, and the four claims kept apart: window observed / rates estimable / projection printed / target compared — plus the projected total, the integer rounding difference, the declared target total and the total gap), then one identity-free row per level: headcount now, person-months of exposure, promotion outflow and its rate (BLANK with its reason where the cell was withheld), attrition outflow and its rate, observed waiting time in grade, projected headcount at the end of the horizon, the declared target headcount and the gap between them. NO person, NO name, NO id, NO manager, NO line, NO free text of any kind crosses this boundary.',
});

/**
 * Disclosure. A chief reads the whole plan; a director reads their own span's
 * levels; a frontline seat reads counts only. What each is shown is PRINTED, not
 * silently produced — the same ladder the rest of the matrix uses.
 */
export const WORKFORCE_FLOW_DETAIL_LEVELS = Object.freeze(['full', 'span', 'none']);
export const WORKFORCE_FLOW_DETAIL_REASONS = Object.freeze({
  full: 'The whole plan: every level row, the transition matrix, the exposure behind each rate, the projection and the declared-target gap.',
  span: 'This seat reads the levels its own span occupies, with the same rates and refusals. Levels it does not reach are printed as a count, never as a zero, and the workspace total is withheld rather than shown in part.',
  none: 'This seat reads counts only. No level row, no rate, no exposure and no projection is returned; the workspace reads “withheld from this seat” with the reason.',
});

/**
 * The population states a rostered person can occupy in this reading. Four
 * states reconcile to the roster population; `unknown-level` and
 * `undated-start` are refusals, not defaults, and each is COUNTED rather than
 * folded into the level it might have been.
 */
export const WORKFORCE_FLOW_POPULATION_STATES = Object.freeze([
  Object.freeze({ key: 'stocked', label: 'In a level stock', tone: 'good' }),
  Object.freeze({ key: 'unknown-level', label: 'Level not recorded', tone: 'bad' }),
  Object.freeze({ key: 'undated-start', label: 'No recorded start day', tone: 'warn' }),
]);
