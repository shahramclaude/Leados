/**
 * app/core/domain/valueBridgeRegistry.js — the closed vocabulary of the
 * Enterprise Value Bridge (ADR-0214, Session 287, Schema v168, CSV scope #156,
 * `#/finance?panel=value`).
 *
 * THE DUTY, IN A CHIEF EXECUTIVE'S WORDS. The board meets on Thursday. EBITDA is
 * up 9%, the multiple has come in half a turn, a competitor was bought in June
 * and 240 million of debt was repaid. The pack says "equity value is down 4%".
 * Four facts, four owners: the operating lines delivered; the market changed its
 * mind; a cheque bought earnings that are not evidence about anybody's
 * management; and cash paid down debt, which is value to the owner. The single
 * percentage is not a fact about any of them.
 *
 * THE GAP THIS CLOSES. The workspace appraises an investment case to the cent,
 * rations one capital ceiling across cases, and divides a cost budget into
 * volume, price and usage. Nothing anywhere read the VALUE OF THE OWNERS' CLAIM
 * at two dates and said what moved it. A targeted search of `app/` and the
 * roadmap for `enterprise value`, `net debt`, `EV/EBITDA`, `valuation multiple`,
 * `equity value` and `value bridge` found no implementation before this
 * register; wider absence is [UNVERIFIED].
 *
 * WHAT THIS REGISTER ADDS — DECLARATION, EXACT ARITHMETIC, AND REFUSAL.
 *
 *   1. TWO DATED READINGS — EBITDA, the multiple the market put on it and net
 *      debt, in one currency, with a written source (the board pack, the
 *      valuation memo). Typed, never scraped, never inferred from a budget.
 *
 *   2. THE EXACT BRIDGE — operating, perimeter, re-rating and net debt, in whole
 *      cents that provably re-add to the movement in equity, with the sub-cent
 *      residue apportioned and counted rather than rounded away.
 *
 *   3. LIKE-FOR-LIKE OR REFUSED — each reading declares whether its EBITDA is
 *      already organic or carries a perimeter adjustment. A reading that says
 *      "reported" and declares no adjustment is `unseparated`: the total
 *      movement is printed and the ATTRIBUTION IS REFUSED with a reason. No
 *      adjustment is ever inferred from a transaction, a case file or the shape
 *      of the numbers.
 *
 *   4. WHO OWNS WHICH LEG — a seat declares that a person it holds answers for
 *      one leg over one period, and what that leg was PROMISED to deliver. A leg
 *      with one owner gets a promise-versus-realised line; a leg with two owners
 *      — the ordinary matrix case, where a functional and a business line both
 *      claim the same EBITDA movement — is printed CONTESTED with both names and
 *      is never split between them. A leg nobody claimed prints as undeclared.
 *
 *   5. TWO CLAIMS, KEPT APART — "the printed figures add up" (re-added from the
 *      printed whole cents) and "the printed figures are the computed figures"
 *      (how many cells are exact, how many are the nearest cent, how many the
 *      apportionment moved to keep the column adding up).
 *
 * WHAT IT NEVER DOES. It never values a company for a transaction, never
 * re-bases a multiple to a chosen comparable set, never infers a perimeter
 * adjustment or a promise, never converts a currency, never pools two currencies
 * in one total, never averages a multiple, and never attributes a re-rating to a
 * line manager. It never rates a person: it says which declared owner a leg was
 * promised to, and what the printed leg did.
 */

export const VALUE_BRIDGE_ENGINE_VERSION = 'value-bridge-2026.11-v1';
export const VALUE_BRIDGE_ADR = 'ADR-0214';
export const VALUE_BRIDGE_ROUTE = 'finance';
export const VALUE_BRIDGE_PANEL = 'value';
export const VALUE_BRIDGE_HREF = '#/finance?panel=value';
export const VALUE_BRIDGE_CSV_SCOPE = 'value-bridge-movements';

export const VALUE_BRIDGE_EVENTS = Object.freeze({
  READING_RECORDED: 'valueBridgeReading.recorded',
  READING_WITHDRAWN: 'valueBridgeReading.withdrawn',
  LEVER_CLAIMED: 'valueBridgeLever.claimed',
  LEVER_WITHDRAWN: 'valueBridgeLever.withdrawn',
  CONVENTIONS: 'valueBridge.conventions.set',
});

/**
 * Equity value is ENTERPRISE material: the owners' claim on the company is board
 * material, and the record class floor is rank 4 (VP / C-suite). A VP or the CFO
 * records the readings; a director and below is refused with a printed reason
 * rather than shown a number they cannot act on. Claiming a leg is the act of a
 * seat that holds the claimant; governing the conventions is the chief's act.
 */
export const VALUE_BRIDGE_RIGHTS = Object.freeze({
  READ: 'read-value-bridge',
  RECORD: 'record-value-bridge-reading',
  CLAIM: 'claim-value-bridge-lever',
  GOVERN: 'govern-value-bridge',
});

export const VALUE_BRIDGE_LIMITS = Object.freeze({
  readings: 240,
  claims: 600,
  bridgesShown: 24,
  maxCents: 900_000_000_000_000, // 9 × 10^12 currency units, in cents — inside the safe integer range
  maxMultipleE4: 1_000_000, // one hundred turns
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  reasonMin: 12,
  reasonMax: 600,
  basisMax: 600,
  claimedPeriodMaxDays: 1461,
  personIdMax: 120,
});

export const VALUE_BRIDGE_SETTING_KEYS = Object.freeze({
  staleDays: 'valueBridgeStaleDays',
});
export const VALUE_BRIDGE_SETTING_LABELS = Object.freeze({
  staleDays: 'Days after a reading’s date at which the bridge it ends is printed as stale',
});
export const VALUE_BRIDGE_BOUNDS = Object.freeze({
  staleDays: Object.freeze([1, 400]),
});
export const VALUE_BRIDGE_DEFAULTS = Object.freeze({
  staleDays: 45,
});

/* ------------------------------------------------------------ vocabularies */

/** How a reading stands on the perimeter it measures. */
export const VALUE_BRIDGE_PERIMETERS = Object.freeze([
  Object.freeze({
    key: 'organic',
    label: 'Organic — already like-for-like',
    says: 'This EBITDA excludes every business that entered or left the perimeter during the period. No adjustment is needed and none is stored.',
  }),
  Object.freeze({
    key: 'reported',
    label: 'Reported — with a declared perimeter adjustment',
    says: 'This is the reported figure and it carries EBITDA that belongs to a changed perimeter. The adjustment is declared, so the operating leg measures what operators did.',
  }),
  Object.freeze({
    key: 'unseparated',
    label: 'Reported — perimeter not separated',
    says: 'A reported figure with no declared adjustment. The movement is still printed; the ATTRIBUTION IS REFUSED, because adding acquired EBITDA to an opening base and reading the difference as growth is the one corruption a value bridge exists to prevent.',
  }),
]);
export const VALUE_BRIDGE_PERIMETER_KEYS = Object.freeze(VALUE_BRIDGE_PERIMETERS.map((row) => row.key));
export const valueBridgePerimeterByKey = (key) => VALUE_BRIDGE_PERIMETERS.find((row) => row.key === key) || null;

/** Why a bridge is or is not attributed. One state at a time, decided in order. */
export const VALUE_BRIDGE_STATES = Object.freeze([
  Object.freeze({
    key: 'attributable',
    label: 'Attributed',
    tone: 'good',
    says: 'Both readings declare their perimeter, so the movement is divided into operating, perimeter, re-rating and net debt, and the printed parts re-add to the printed movement.',
  }),
  Object.freeze({
    key: 'unreadable',
    label: 'Two live readings on one day',
    tone: 'bad',
    says: 'More than one live reading exists for one of the two days, and this register will not choose between them. The pair is counted and nothing is printed — silently preferring the later file is how two versions of the same board pack become one number nobody can reproduce.',
  }),
  Object.freeze({
    key: 'perimeter-undeclared',
    label: 'Perimeter not separated',
    tone: 'bad',
    says: 'At least one reading is reported with no declared perimeter adjustment. Opening and closing equity are printed and the total movement is the difference between two independently rounded figures; no operating, perimeter or re-rating figure is claimed, because separating them would mean inventing an adjustment.',
  }),
]);

/** Facts printed beside the state, never folded into it. */
export const VALUE_BRIDGE_FLAGS = Object.freeze([
  Object.freeze({
    key: 'stale',
    label: 'Stale reading',
    says: 'The closing reading is older than the declared staleness window. The bridge is still arithmetic; it is no longer news.',
  }),
  Object.freeze({
    key: 'multiple-not-meaningful',
    label: 'Multiple on non-positive EBITDA',
    says: 'A multiple is not a meaningful statement about non-positive EBITDA. The arithmetic is printed exactly as the readings imply and is not endorsed as a valuation.',
  }),
  Object.freeze({
    key: 'net-cash',
    label: 'Net cash position',
    says: 'Net debt is negative at one end: the company holds more cash than debt. It is printed as recorded and never floored at zero.',
  }),
  Object.freeze({
    key: 'perimeter-moved',
    label: 'Perimeter moved',
    says: 'A declared perimeter adjustment is non-zero in this bridge, so part of the movement was bought or sold rather than operated.',
  }),
]);
export const VALUE_BRIDGE_FLAG_KEYS = Object.freeze(VALUE_BRIDGE_FLAGS.map((row) => row.key));

/** Ownership of a leg is decided by declaration only. */
export const VALUE_BRIDGE_OWNERSHIP_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Declared', tone: 'neutral', says: 'Exactly one live claim names a person for this leg over exactly this period. Promise versus realised is printed for that person.' }),
  Object.freeze({ key: 'contested', label: 'Contested', tone: 'bad', says: 'Two or more live claims name different people for this leg over the same period — the ordinary matrix case. Both names are printed and the realised figure is attributed to NOBODY: an allocation no human agreed to is never invented.' }),
  Object.freeze({ key: 'undeclared', label: 'Undeclared', tone: 'neutral', says: 'Nobody declared an owner for this leg over this period. The figure is printed with no name against it.' }),
  Object.freeze({ key: 'no-matching-bridge', label: 'No bridge for this period', tone: 'neutral', says: 'A claim names a period for which no bridge is printed — the readings do not bracket it. The promise is kept and counted, and no attainment is computed from a period it does not cover.' }),
]);

/**
 * Everything the register can refuse, in the words it refuses with. Shown on the
 * Method view so the boundary is legible before a figure is trusted.
 */
export const VALUE_BRIDGE_REFUSALS = Object.freeze([
  Object.freeze({ key: 'no-adjustment', says: 'A reported reading with no declared perimeter adjustment is stored as UNSEPARATED and its bridge is refused attribution. No adjustment is inferred from a transaction, a case, a news item or the shape of the numbers.' }),
  Object.freeze({ key: 'no-multiple', says: 'A multiple of zero or less is refused. A negative multiple is not a valuation; it is a typo or a different instrument.' }),
  Object.freeze({ key: 'no-currency-pool', says: 'Two currencies are never pooled and never converted. Each currency is its own chain; a total across currencies is not printed.' }),
  Object.freeze({ key: 'no-future', says: 'A reading dated after today is refused. Nobody has read the market’s view of the future; a projection belongs in a forecast, not in a bridge.' }),
  Object.freeze({ key: 'one-live-per-day', says: 'A day carries one live reading per currency. Changing it means naming the reading it supersedes, so the restatement is visible instead of silent.' }),
  Object.freeze({ key: 'no-ambiguous-day', says: 'Where two live readings exist for one day, the bridges that touch that day are printed as unreadable and counted — never silently resolved by picking the later file.' }),
  Object.freeze({ key: 'no-claim-on-a-peer', says: 'A seat declares a leg owner only among the people it holds through its reporting tree or a declared line, or itself. One line never attributes a value leg to a peer line’s manager.' }),
  Object.freeze({ key: 'no-split-of-a-contested-leg', says: 'A contested leg prints both names and no realised figure per person, and no promise-versus-realised line. The sum of two people’s promises is not an attribution.' }),
  Object.freeze({ key: 'no-attainment-without-promise', says: 'A leg with no declared promise has no attainment. A missing promise is not a promise of zero, and "delivered 100% of plan" is never printed for a plan nobody wrote.' }),
  Object.freeze({ key: 'no-flattering-aggregate', says: 'The register never prints one total for several currencies, never averages multiples and never sums equity values from different days as though they were the same claim.' }),
]);

/* ------------------------------------------------------------------- CSV */

export const VALUE_BRIDGE_CSV_COLUMNS = Object.freeze([
  'row_code',
  'kind',
  'currency',
  'from_day',
  'to_day',
  'state',
  'flag_stale',
  'flag_multiple_not_meaningful',
  'flag_net_cash',
  'reading_age_days',
  'opening_equity_cents',
  'operating_cents',
  'perimeter_cents',
  'rerating_cents',
  'debt_cents',
  'closing_equity_cents',
  'total_movement_cents',
  'balances',
  'cells_exact',
  'cells_nearest_cent',
  'cells_moved',
  'max_drift_e3',
  'legs_declared',
  'legs_undeclared',
  'legs_contested',
  'promised_cents',
  'attained_cents',
  'withheld_reason',
]);

export const VALUE_BRIDGE_CSV_DESCRIPTOR = Object.freeze({
  key: VALUE_BRIDGE_CSV_SCOPE,
  label: 'Enterprise value bridges (identity-free)',
  group: 'analytics',
  sensitive: false,
  filenameSlug: 'value-bridge-movements',
  description: 'One identity-free row per printed bridge (B01, B02 …) and per multi-period chain (C01 …): the two dates, the currency, the state, the stale and non-positive-EBITDA flags, the age of the closing reading, opening equity, the operating, perimeter, re-rating and net-debt legs, closing equity and the total movement in whole cents, plus the two integrity claims — whether the printed cents add up and how many cells are exact, nearest-cent or moved — and the ownership counts with the promised and attained cents. Contains NO person, manager, reading id, basis or reason text, and NO multiple, EBITDA or net-debt level. A figure that is withheld or cannot be claimed exports BLANK with its reason key, never zero. Currencies are never pooled and a pending chain never enters a total.',
});

/* ------------------------------------------------------------------ method */

export const VALUE_BRIDGE_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'ev-equity',
    label: 'Enterprise value and the equity bridge (Koller, Goedhart & Wessels, Valuation, ch. 2–3; Rosenbaum & Pearl, Investment Banking, ch. 1)',
    says: 'Enterprise value is the operating claim on the business; owner equity is that claim less net debt. A bridge that starts at EBITDA and ends at "value" without crossing net debt is telling the owners a story about somebody else’s money.',
  }),
  Object.freeze({
    key: 'attribution',
    label: 'Value-driver attribution: operating, perimeter, re-rating (Damodaran, Investment Valuation, ch. 11; Koller ch. 12–14)',
    says: 'EBITDA growth at a stable multiple is operating performance. A change in the multiple is the market’s opinion. EBITDA that arrived with an acquisition is a cheque. Each is measured with the other two held still: operating at the OPENING multiple, re-rating on the CLOSING EBITDA, perimeter at the opening multiple.',
  }),
  Object.freeze({
    key: 'organic',
    label: 'Like-for-like (organic) reporting and the perimeter trap',
    says: 'Reported growth across a changing perimeter is not growth. The adjustment is declared on each reading and subtracted before the operating leg is computed, so an acquisition can never be read as a manager’s performance — and a reading that will not declare it gets a refused attribution instead of an invented one.',
  }),
  Object.freeze({
    key: 'multiple',
    label: 'The multiple as a claim, not a measurement (Damodaran ch. 17; Liu, Nissim & Thomas 2002)',
    says: 'A multiple is an opinion of the market at a date, held as an exact rational number and never averaged across dates or companies. On non-positive EBITDA it is not meaningful, and the register prints that beside the arithmetic rather than hiding either.',
  }),
  Object.freeze({
    key: 'responsibility',
    label: 'Responsibility accounting at board level (Anthony & Govindarajan, Management Control Systems; Merchant & Van der Stede)',
    says: 'A figure is put in front of the person who can act on it. No line manager controls a re-rating and no operator controls a perimeter adjustment, so those legs are not attributed to operating seats by default. Ownership is declared, never computed from the reporting graph.',
  }),
  Object.freeze({
    key: 'matrix',
    label: 'Matrix ownership: contested legs are named, never split',
    says: 'In a matrix a functional line and a business line can both legitimately claim the same EBITDA movement. The register stores both claims, prints both names, and computes attainment for NEITHER — an allocation no human agreed to is exactly what the Matrix Leadership Mandate forbids.',
  }),
  Object.freeze({
    key: 'apportionment',
    label: 'Largest-remainder apportionment (Hamilton) for printed cents',
    says: 'A multiple applied to whole cents is generally not a whole cent. Each printed figure is its floor or its floor plus one cent, the leftover cents go to the largest remainders, so every column adds up and no printed cell sits a whole cent from its exact value. How many cells moved is counted and printed.',
  }),
  Object.freeze({
    key: 'promise',
    label: 'Value-creation plan: promise versus delivery (iLevel / portfolio value-creation practice)',
    says: 'A value-creation plan states what each lever is expected to deliver over a period. Here the promise is a declared whole-cent figure with a written basis, and it is compared ONLY with the printed leg for the same period and the same single owner — so a board can see a promise that was missed without a second instrument guessing at it.',
  }),
]);

export const VALUE_BRIDGE_METHOD = Object.freeze({
  reading: 'A reading states one day, one currency, the reported EBITDA in whole cents, the multiple as a decimal with at most four places, net debt in whole cents (a negative is net cash), how the perimeter stands, and the source in writing. It is typed and signed by a seat at the executive altitude. Nothing is scraped from a budget, a case or an imported feed.',
  bridge: 'Equity = EBITDA × multiple − net debt, exactly, as a rational over integers. Operating = (organic EBITDA₁ − organic EBITDA₀) × multiple₀. Perimeter = (adjustment₁ − adjustment₀) × multiple₀. Re-rating = reported EBITDA₁ × (multiple₁ − multiple₀). Net debt = net debt₀ − net debt₁. The four legs re-add to the movement in equity, and the register re-adds the PRINTED cents to prove it rather than assuming it.',
  perimeter: 'Each reading declares ORGANIC (already like-for-like, adjustment zero), REPORTED with a declared adjustment, or leaves the perimeter UNSEPARATED. Unseparated is not a guessable state: the bridge prints both levels and the total movement, refuses the four legs, and says why.',
  ownership: 'A seat declares that a person it holds answers for one leg over one period, and what that leg was promised to deliver in whole cents, with a written basis. Only claims whose period equals the bridge’s period exactly are considered; any other claim is counted as having no matching bridge. One claim gives promise versus realised; two or more give CONTESTED with every name printed and no split.',
  staleness: 'The closing reading’s age is measured from its date to today against a declared window. An old reading does not stop the arithmetic; it stops the claim that the bridge is news. Staleness is a printed fact, never folded into the state.',
  rounding: 'Every figure is exact over arbitrary-precision integers. Printed cents are apportioned by largest remainder inside the identity, and the counts of exact, nearest-cent and moved cells are printed beside the bridge. Equity levels and the enterprise-value and net-debt levels are independently rounded and are not part of the additive claim.',
  notSaid: 'Nothing here values a company, recommends a multiple, predicts a re-rating, or judges a manager. It says: given the two readings a seat at the executive altitude signed and the ownership a seat declared, this is exactly how the owners’ claim moved, and this is who was declared to answer for each part of it.',
});

export const VALUE_BRIDGE_VIEWS = Object.freeze([
  Object.freeze({ key: 'bridge', label: 'Bridges' }),
  Object.freeze({ key: 'owners', label: 'Who owns which leg' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);
