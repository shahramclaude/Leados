/**
 * app/core/domain/synergyRegistry.js — the closed vocabulary of the Deal Thesis
 * & Synergy Realization Register (ADR-0216, Session 289, Schema v170,
 * `RULE-SYN-01`, CSV scope #158, `#/finance?panel=synergy`).
 *
 * THE DUTY, IN A CHIEF EXECUTIVE'S WORDS. The deal closed in March. The board
 * pack now says the acquisition is "tracking to plan" and prints one number. The
 * number is a self-reported exit run-rate for a saving that two business lines
 * have each claimed in their own budget, netted against nothing, annualised from
 * a quarter that has not ended, with the one-off cost of getting it sitting in a
 * different slide. Four different claims are wearing one word.
 *
 * THE GAP THIS CLOSES, QUOTED FROM THE CODE RATHER THAN ASSERTED. The workspace
 * appraises an ORGANIC investment case to the cent (ADR-0208), rations one
 * capital ceiling across cases (ADR-0211), divides a cost budget into volume,
 * price and usage (ADR-0213), and attributes the movement in the owners' claim
 * to operating, perimeter, re-rating and net debt (ADR-0214). Nothing anywhere
 * holds the PROMISE MADE AT SIGNING: which lever, owned by whom, delivering how
 * much by which date, verified by whom against which evidence, at what
 * cost-to-achieve, with the same saving claimed twice across two lines. A
 * targeted search of `app/` before this build returned ZERO files for `synergy`
 * outside one printed limit in the capital-rationing panel, ZERO for
 * `post-merger`, ZERO for `cost-to-achieve`, and ZERO for a run-rate register;
 * `run-rate` appeared once in this roadmap, inside another module's benchmark
 * paragraph. Wider absence: [UNVERIFIED].
 *
 * FIVE THINGS THIS REGISTER ADDS, EACH OF WHICH IS A REFUSAL AS WELL AS A FIELD.
 *
 *   1. A DATED PROMISE, NOT A NUMBER. Every claim names one deal, one closed
 *      lever, one effect (a synergy or a DIS-SYNERGY), one accountable owner,
 *      and a PHASED LADDER of dates on which an annual run-rate is promised.
 *      "Promised to date" is read from that ladder at the day of the reading;
 *      the full promise is never printed as if it were due today.
 *
 *   2. TWO KINDS OF READING THAT ARE NEVER ADDED. A `run-rate` reading is a
 *      declared annualised effect at a date — the exit-rate an integration
 *      office reports. A `pnl` reading is the effect actually in one named
 *      period. Adding them is the commonest corruption of a synergy report:
 *      the same money counted once as a rate and once as cash. Here they are
 *      separate collections, separate totals, and the CSV keeps them apart.
 *
 *   3. CLAIMED IS NOT VERIFIED, AND THE PROMISER NEVER VERIFIES. A reading is
 *      stored `claimed` (somebody's statement) or `verified` (a seat ABOVE the
 *      owner on at least one reporting line, naming the evidence it read). The
 *      action refuses the owner, refuses a peer, and the reader recomputes the
 *      verifier's reach on every read — so a verifier who later moves out from
 *      above the owner shows up as drift rather than authority.
 *
 *   4. ONE SAVING, COUNTED ONCE — OR NAMED AND COUNTED NOWHERE. Two claims on
 *      one deal that name the same `savingRef` are CONTESTED: both are kept,
 *      both owners are printed, the contested amount is held OUT of the
 *      headline and printed beside it, and the arithmetic proves itself
 *      (`headline + contested + dis-synergy = the sum of the rows`). The
 *      register never splits a saving between two lines and never picks the
 *      larger one: an allocation no human agreed to is exactly what the matrix
 *      mandate forbids.
 *
 *   5. COST-TO-ACHIEVE AND PAYBACK, REFUSED RATHER THAN ASSUMED. One-off
 *      integration cost is its own ledger. Payback is printed only when cost is
 *      declared AND the verified net run-rate is positive; otherwise the cell
 *      carries the reason it was refused. A payback of zero because nobody
 *      declared a cost is the reassuring blank this doctrine bans.
 *
 * WHAT IT NEVER DOES. It never values a deal, never computes a purchase-price
 * premium, never discounts a synergy to a present value, never annualises a
 * period, never converts a currency, never pools two currencies, never infers a
 * lever from a title, never re-allocates a contested saving, and never rates a
 * person. It says what was promised, what was verified, what it cost, and what
 * nobody has checked.
 */

export const SYNERGY_ENGINE_VERSION = 'deal-synergy-2026.11-v1';
export const SYNERGY_ADR = 'ADR-0216';
export const SYNERGY_RULE_ID = 'RULE-SYN-01';
export const SYNERGY_ROUTE = 'synergy';
export const SYNERGY_HREF = '#/finance?panel=synergy';
export const SYNERGY_CSV_SCOPE = 'deal-synergy-realization';
export const SYNERGY_MARKER_KIND = 'deal-synergy';

export const SYNERGY_EVENTS = Object.freeze({
  DEAL_DECLARED: 'synergy.deal.declared',
  CLAIM_DECLARED: 'synergy.claim.declared',
  CLAIM_WITHDRAWN: 'synergy.claim.withdrawn',
  READING_RECORDED: 'synergy.reading.recorded',
  READING_WITHDRAWN: 'synergy.reading.withdrawn',
  COST_RECORDED: 'synergy.cost.recorded',
  CONVENTIONS: 'synergy.conventions.set',
  SCAN: 'synergy.scan',
});
export const SYNERGY_EVENT_PREFIX = 'synergy.';

/**
 * Reading is enterprise material: a deal's economics are the owners' money, and
 * the record class floor is rank 4 (the same floor as the value bridge, for the
 * same reason). DECLARING a deal and its promise is the executive act that signs
 * it; the action further requires the declaring seat to HOLD the owner it names,
 * so a line never promises another line's saving.
 *
 * RECORDING is open to the director altitude and above because a reading is
 * evidence, not authority — and the action splits it: a `verified` reading must
 * come from a seat ABOVE the owner on at least one line and the owner is refused
 * outright. Governing the conventions is the chief's.
 */
export const SYNERGY_RIGHTS = Object.freeze({
  READ: 'read-deal-synergy',
  DECLARE: 'declare-deal-synergy',
  RECORD: 'record-synergy-reading',
  SELF_REPORT: 'report-own-synergy-reading',
  GOVERN: 'govern-deal-synergy',
});

export const SYNERGY_LIMITS = Object.freeze({
  deals: 120,
  claims: 1200,
  readings: 4000,
  costs: 1200,
  markers: 400,
  /** 9 × 10^12 currency units, in cents — inside the safe integer range. */
  maxCents: 900_000_000_000_000,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  labelMin: 3,
  labelMax: 120,
  thesisMin: 20,
  thesisMax: 600,
  savingRefMin: 3,
  savingRefMax: 160,
  basisMin: 12,
  basisMax: 400,
  noteMax: 400,
  personIdMax: 120,
  currencyLength: 3,
  phasesMax: 6,
  periodKeyMax: 16,
  claimsShown: 60,
});

export const SYNERGY_SETTING_KEYS = Object.freeze({
  materialityPct: 'synergyMaterialityPct',
  staleDays: 'synergyStaleDays',
  autoPropagate: 'synergyAutoPropagate',
});

export const SYNERGY_SETTING_LABELS = Object.freeze({
  materialityPct: 'Shortfall, as a share of the promised run-rate, that still reads as met',
  staleDays: 'Days after which the newest verified reading is printed as stale',
  autoPropagate: 'Ask owners for the verification a promise is owed',
});

export const SYNERGY_BOUNDS = Object.freeze({
  materialityPct: Object.freeze([0, 50]),
  staleDays: Object.freeze([7, 400]),
});

export const SYNERGY_DEFAULTS = Object.freeze({
  materialityPct: 2,
  staleDays: 120,
  autoPropagate: true,
});

/**
 * The closed lever list. These are the classes a deal thesis is actually built
 * from, and the printed `says` is the honest caveat attached to each — including
 * the one that matters most: revenue synergies are the category most often
 * promised and least often delivered, so a revenue lever prints that fact rather
 * than a target with no warning on it.
 */
export const SYNERGY_LEVERS = Object.freeze([
  Object.freeze({
    key: 'cost-cogs',
    label: 'Cost of goods — scale and procurement',
    says: 'Unit cost from volume, sourcing or footprint. The most defensible class, because it is measured against a cost base that already exists.',
    framework: 'cost synergy (Chatterjee 1986; Goold & Campbell 1998)',
  }),
  Object.freeze({
    key: 'cost-sga',
    label: 'Overhead — duplicated functions',
    says: 'A duplicated function removed: one finance team, one HR team, one ERP. The saving is real only when the headcount has actually left, not when the role is frozen.',
    framework: 'cost synergy; one-off versus recurring (Koller, Goedhart & Wessels, ch. 36)',
  }),
  Object.freeze({
    key: 'cost-capex',
    label: 'Capital expenditure avoided',
    says: 'Spend that will not now be made. It is a cash saving, not an EBITDA effect, and this register keeps it in the same ledger as EBITDA levers only because the promise was made in the same sentence — the effect is printed per lever.',
    framework: 'financial synergy (Chatterjee 1986)',
  }),
  Object.freeze({
    key: 'revenue-cross-sell',
    label: 'Revenue — cross-sell into the other book',
    says: 'The category with the weakest delivery record in the published literature. It is a legitimate promise; it is not evidence until a buyer has paid twice for it.',
    framework: 'revenue synergy and the under-delivery base rate (Christofferson, McNish & Sias 2004)',
  }),
  Object.freeze({
    key: 'revenue-pricing',
    label: 'Revenue — price and mix',
    says: 'Price power attributed to the combination. A price rise is the easiest number to promise and the hardest to attribute: the register never prices the market into it.',
    framework: 'revenue synergy; attribution discipline (Koller et al., ch. 36)',
  }),
  Object.freeze({
    key: 'financial-tax',
    label: 'Financial — tax structure',
    says: 'A tax effect from the combination. Executed by a treasurer and verified by a tax seat; it is not an operating achievement and is never attributed as one.',
    framework: 'financial synergy (Chatterjee 1986)',
  }),
  Object.freeze({
    key: 'financial-capital',
    label: 'Financial — cost of capital and refinancing',
    says: 'Cheaper debt against a combined balance sheet. A rate, not a managerial act, and it moves with the market.',
    framework: 'financial synergy (Chatterjee 1986; Damodaran, ch. 26)',
  }),
  Object.freeze({
    key: 'other',
    label: 'Other declared lever',
    says: 'A promise that fits none of the declared classes. It is still a promise, and it is still owed a verifier.',
    framework: 'declared, not inferred',
  }),
]);
export const SYNERGY_LEVER_KEYS = Object.freeze(SYNERGY_LEVERS.map((row) => row.key));
export const synergyLeverByKey = (key) => SYNERGY_LEVERS.find((row) => row.key === key) || null;

/** A claim is a GAIN or a LOSS. The sign is a declared direction, never a minus. */
export const SYNERGY_EFFECTS = Object.freeze([
  Object.freeze({
    key: 'synergy',
    label: 'Synergy — value promised to arrive',
    says: 'An annual effect the deal said would arrive. Behind means less of it has been verified than was promised.',
  }),
  Object.freeze({
    key: 'dis-synergy',
    label: 'Dis-synergy — value promised to leave',
    says: 'Customer attrition, retention packages, a lost contract — a loss the deal itself declared. It is subtracted from the headline and printed on its own line, because a plan that declares its own damage is more trustworthy, not less.',
  }),
]);
export const SYNERGY_EFFECT_KEYS = Object.freeze(SYNERGY_EFFECTS.map((row) => row.key));
export const synergyEffectByKey = (key) => SYNERGY_EFFECTS.find((row) => row.key === key) || null;

/** Two reading kinds that are never added to one another. */
export const SYNERGY_READING_KINDS = Object.freeze([
  Object.freeze({
    key: 'run-rate',
    label: 'Run-rate — the annualised effect at a date',
    says: 'An exit-rate: "the annual effect running on 30 September is X". It is the integration office’s normal unit and it is NOT cash: nothing has been annualised here, the declarer says the rate.',
  }),
  Object.freeze({
    key: 'pnl',
    label: 'P&L — the effect actually in a named period',
    says: 'Money that landed in one declared period. It is never added to a run-rate, never annualised from, and a period cannot be recorded twice.',
  }),
]);
export const SYNERGY_READING_KIND_KEYS = Object.freeze(SYNERGY_READING_KINDS.map((row) => row.key));
export const synergyReadingKindByKey = (key) => SYNERGY_READING_KINDS.find((row) => row.key === key) || null;

/**
 * WHO SAID IT. A claim is a statement by an interested party; a verification is a
 * statement by a seat accountable for the owner. The two are stored separately
 * and reported separately, and the reader never lets a claim stand in for a
 * verification.
 */
export const SYNERGY_BASES = Object.freeze([
  Object.freeze({
    key: 'claimed',
    label: 'Claimed — reported by the line that owns it',
    says: 'Self-reported. It is recorded, printed, and never counted as verified value.',
  }),
  Object.freeze({
    key: 'verified',
    label: 'Verified — read against named evidence by a seat above the owner',
    says: 'The verifier must sit above the claim’s owner on at least one reporting line, must not be the owner, and must name the evidence read. The test is recomputed on every read.',
  }),
]);
export const SYNERGY_BASIS_KEYS = Object.freeze(SYNERGY_BASES.map((row) => row.key));
export const synergyBasisByKey = (key) => SYNERGY_BASES.find((row) => row.key === key) || null;

/** One-off cost of getting the saving. Its own ledger, its own sign. */
export const SYNERGY_COST_KINDS = Object.freeze([
  Object.freeze({ key: 'advisory', label: 'Advisory and diligence' }),
  Object.freeze({ key: 'severance', label: 'Severance and exit' }),
  Object.freeze({ key: 'systems', label: 'Systems and migration' }),
  Object.freeze({ key: 'retention', label: 'Retention and integration team' }),
  Object.freeze({ key: 'other', label: 'Other one-off cost' }),
]);
export const SYNERGY_COST_KIND_KEYS = Object.freeze(SYNERGY_COST_KINDS.map((row) => row.key));
export const synergyCostKindByKey = (key) => SYNERGY_COST_KINDS.find((row) => row.key === key) || null;

/**
 * One state at a time, decided in this order, and every one of them is a fact
 * about the RECORD rather than a verdict on a person:
 *
 *   withdrawn  → the promise was retracted; it stays on the record, out of totals
 *   unowned    → its owner is not on the active roster, so nobody can be asked
 *   not-due    → no phase of the ladder has come due yet; nothing is owed today
 *   unverified → a phase is due and NO verified reading exists: refused, not failed
 *   behind     → verified short of the due target beyond the declared materiality
 *   met        → verified at or above the due target, within the materiality band
 *
 * `unverified` outranks `behind` deliberately: a promise nobody has checked is not
 * a miss, and printing it as a shortfall would let an unchecked number pass for a
 * measured one in the other direction.
 */
export const SYNERGY_STATES = Object.freeze([
  Object.freeze({ key: 'withdrawn', label: 'Withdrawn', tone: 'neutral', says: 'The promise was retracted with a written reason. It is kept on the record and excluded from every total, and the exclusion is counted.' }),
  Object.freeze({ key: 'unowned', label: 'No owner on the roster', tone: 'bad', says: 'The person who made the promise is not on the active roster. The promise is kept and printed; no ask is filed, because there is nobody to ask.' }),
  Object.freeze({ key: 'not-due', label: 'Not yet due', tone: 'info', says: 'The first phase of the ladder is in the future. Nothing is owed as of this reading, and no attainment is printed against a date that has not arrived.' }),
  Object.freeze({ key: 'unverified', label: 'Due, and nobody has verified it', tone: 'bad', says: 'A phase is due and the only readings are self-reported or absent. The register refuses to call this met or missed: the number has not been checked.' }),
  Object.freeze({ key: 'behind', label: 'Verified short of the promise', tone: 'warn', says: 'The newest VERIFIED run-rate is below the due target by more than the declared materiality band.' }),
  Object.freeze({ key: 'met', label: 'Met', tone: 'good', says: 'The newest verified run-rate is at or above the due target, within the declared materiality band. A shortfall inside the band is printed as an amount, never rounded into "met".' }),
]);
export const SYNERGY_STATE_KEYS = Object.freeze(SYNERGY_STATES.map((row) => row.key));
export const SYNERGY_STATE_BY_KEY = Object.freeze(Object.fromEntries(SYNERGY_STATES.map((row) => [row.key, row])));

/** Why a figure is not printed. Each is a reflected refusal, never a zero. */
export const SYNERGY_WITHHOLD_REASONS = Object.freeze({
  noPromiseDue: 'no phase of this ladder has come due, so there is no promised amount to compare with',
  nothingVerified: 'no verified reading exists, so there is no measured figure to divide',
  noCost: 'no one-off cost has been declared, so a payback would be zero by accident',
  nonPositiveRunRate: 'the verified net run-rate is zero or negative, so a payback would be infinite',
  mixedCurrency: 'this workspace holds deals in more than one currency; no single total is printed',
  noDeals: 'no deal thesis has been declared in this workspace',
});

/**
 * Named refusals. Each is a control a real integration office has, and the name is
 * what the panel prints — never a generic "invalid".
 */
export const SYNERGY_REFUSALS = Object.freeze([
  Object.freeze({ key: 'deal-label-required', says: 'A deal needs a name a reader can recognise. "The acquisition" is not a name.' }),
  Object.freeze({ key: 'deal-currency-required', says: 'A deal is declared in exactly one currency (three letters). A deal with no currency has no unit for its promises.' }),
  Object.freeze({ key: 'deal-date-required', says: 'The day the deal was signed is a real calendar day, and it cannot be in the future.' }),
  Object.freeze({ key: 'thesis-required', says: 'Write the thesis the deal was bought on, in at least a sentence. A promise with no thesis is a number with no reason.' }),
  Object.freeze({ key: 'lead-not-on-roster', says: 'The integration lead must be a person this roster holds, or the workspace leader.' }),
  Object.freeze({ key: 'claim-unknown-deal', says: 'A promise belongs to a deal this record holds.' }),
  Object.freeze({ key: 'claim-unknown-lever', says: 'The lever must be one the register declares. It is never inferred from the title of the promise.' }),
  Object.freeze({ key: 'claim-unknown-effect', says: 'A promise is either a synergy or a declared dis-synergy. The direction is never guessed from a minus sign.' }),
  Object.freeze({ key: 'claim-owner-required', says: 'A promise names exactly one accountable owner. A promise owned by "the deal team" has nobody to verify it.' }),
  Object.freeze({ key: 'owner-not-on-roster', says: 'The named owner is not on the active roster.' }),
  Object.freeze({ key: 'owner-not-reachable', says: 'A promise may only be made by a seat that holds its owner, on the home line or a declared line. One line does not promise another line’s saving.' }),
  Object.freeze({ key: 'promise-not-positive', says: 'A promised amount is a positive magnitude. The direction lives in the effect (synergy or dis-synergy), never in a minus sign that can be netted by accident.' }),
  Object.freeze({ key: 'promise-date-required', says: 'Every promise states the day its full run-rate is due.' }),
  Object.freeze({ key: 'promise-before-signing', says: 'A promise cannot fall due before the deal it belongs to was signed.' }),
  Object.freeze({ key: 'phase-ladder-order', says: 'A phase ladder runs forward: every date strictly after the one before it, with no duplicate phase.' }),
  Object.freeze({ key: 'phase-ladder-final', says: 'The last phase of the ladder must equal the full promised run-rate. A ladder that ends short of its own promise is two promises.' }),
  Object.freeze({ key: 'phase-ladder-count', says: 'A ladder holds at most six phases. More is a plan nobody can hold in view, and this register would be printing a schedule it cannot check.' }),
  Object.freeze({ key: 'phase-before-signing', says: 'Every phase is dated on or after the day the deal was signed.' }),
  Object.freeze({ key: 'saving-ref-required', says: 'Name the saving itself (for example "sga-duplicated-finance"), so the register can tell when two lines promise the same money.' }),
  Object.freeze({ key: 'claim-withdrawn', says: 'This promise has been withdrawn. A withdrawn promise takes no new reading.' }),
  Object.freeze({ key: 'reading-unknown-claim', says: 'A reading belongs to a promise this record holds.' }),
  Object.freeze({ key: 'reading-kind-unknown', says: 'A reading is a run-rate or a P&L effect. The two are never the same row.' }),
  Object.freeze({ key: 'reading-basis-unknown', says: 'A reading is claimed or verified. There is no third basis and no default.' }),
  Object.freeze({ key: 'reading-amount-required', says: 'A reading states an amount in the deal’s currency, to the cent.' }),
  Object.freeze({ key: 'reading-date-required', says: 'A reading is dated with a real calendar day, and it cannot be in the future.' }),
  Object.freeze({ key: 'reading-before-claim', says: 'A reading cannot predate the promise it measures. A number recorded before the promise was made is measuring something else.' }),
  Object.freeze({ key: 'period-key-required', says: 'A P&L reading names the period it is in (for example 2026-Q3). A P&L effect with no period is not attributable to any quarter.' }),
  Object.freeze({ key: 'period-duplicate', says: 'This promise already carries a P&L reading for that period. A restatement withdraws the first; it does not stack a second on top.' }),
  Object.freeze({ key: 'evidence-required', says: 'A verification names the evidence it read. "Verified" with no evidence is a second claim wearing a better word.' }),
  Object.freeze({ key: 'self-verification', says: 'The owner of a promise cannot verify their own saving. Self-reported value is stored as a claim, which is what it is.' }),
  Object.freeze({ key: 'verifier-out-of-reach', says: 'A verifier must sit above the promise’s owner on at least one reporting line — home line or declared line. A peer cannot verify.' }),
  Object.freeze({ key: 'reading-withdraw-not-yours', says: 'Only the seat that recorded a reading, or a seat that holds the promise’s owner, may withdraw it.' }),
  Object.freeze({ key: 'cost-unknown-deal', says: 'A one-off cost belongs to a deal this record holds.' }),
  Object.freeze({ key: 'cost-amount-required', says: 'A cost is a positive amount in the deal’s currency, to the cent.' }),
  Object.freeze({ key: 'cost-date-required', says: 'A cost is dated with the day it was incurred, and it cannot be in the future.' }),
  Object.freeze({ key: 'cost-kind-unknown', says: 'The cost kind must be one the register declares.' }),
  Object.freeze({ key: 'cost-claim-mismatch', says: 'A cost allocated to a promise must belong to the same deal.' }),
  Object.freeze({ key: 'convention-out-of-bounds', says: 'A declared convention outside its bounds is refused, never clamped. A typo must not move the materiality line the board reads.' }),
  Object.freeze({ key: 'cap-reached', says: 'The register reached its row cap for this ledger. Export the workspace before adding another row.' }),
]);

/**
 * The frameworks this register applies, named rather than paraphrased, printed on
 * the Method view so a reader can check the register against the practice it
 * claims to implement.
 */
export const SYNERGY_FRAMEWORKS = Object.freeze([
  Object.freeze({
    key: 'koller',
    label: 'Koller, Goedhart & Wessels, *Valuation*, 7th ed., ch. 36 — mergers and acquisitions',
    says: 'Value created by a deal is the synergy value minus the premium paid minus the cost of achieving it, and only the first of those three is a promise made in a board paper. This register holds the promise and the cost, and deliberately does not hold the premium: that belongs to the deal file, and inferring it here would let a register call a deal good or bad.',
  }),
  Object.freeze({
    key: 'chatterjee',
    label: 'Chatterjee (1986); Goold & Campbell (1998) — synergy classification and parenting advantage',
    says: 'Cost, revenue and financial synergies are different bets with different evidence. A closed lever list forces the promise into a class, so a revenue target cannot hide among cost savings.',
  }),
  Object.freeze({
    key: 'christofferson',
    label: 'Christofferson, McNish & Sias (2004), "Where mergers go wrong" — the revenue-synergy base rate',
    says: 'Revenue synergies are the most frequently promised and least frequently delivered. Each revenue lever therefore prints its own caveat on the panel rather than appearing as a target with the same standing as a procurement saving.',
  }),
  Object.freeze({
    key: 'pmi',
    label: 'Post-merger integration practice — the phased synergy curve and exit run-rate',
    says: 'Synergies are captured on a schedule: a fraction in the first year, the full run-rate later. The ladder is declared by a human and the reader measures against the phase that is actually due, so a plan is never graded against its own final year on day one.',
  }),
  Object.freeze({
    key: 'coso',
    label: 'COSO 2013 principle 10 (control activities) and the segregation-of-duties principle',
    says: 'The person who promises a number does not verify it, and the verifier must sit above the promiser on a line. Verification is a dated act against named evidence, not an adjective — which is why "self-verification" is a named refusal.',
  }),
  Object.freeze({
    key: 'galbraith',
    label: 'Matrix theory (Galbraith 1971; Bartlett & Ghoshal 1990) and double-entry integrity',
    says: 'In a matrix, two lines naturally claim the same saving in their own budgets. Counting both is double counting; splitting it is inventing an allocation. Here it is named CONTESTED, held out of the headline and printed with both owners, so the board settles it and the arithmetic still adds up.',
  }),
  Object.freeze({
    key: 'kahneman',
    label: 'Kahneman & Tversky (1979); Flyvbjerg (2006) — planning fallacy and reference-class forecasting',
    says: 'Promised synergy plans are systematically optimistic. The register prints the promise AS MADE and the verification AS FOUND, and never re-bases a promise to what was later believed; a shortfall is a fact about the deal, not a reason to rewrite the thesis.',
  }),
]);

/** The register's own account of what it is and is not. Printed, not implied. */
export const SYNERGY_METHOD = Object.freeze({
  identity:
    'One reader (`buildDealSynergy`) stands behind every count, every row, the brief and the CSV. No figure on the screen is computed in the panel and nothing derived is stored: every state, every promised-to-date figure, every contested amount, every payback and every verification verdict is re-derived from the dated rows on read.',
  promise:
    'A promise is a dated ladder of annual run-rates owed by one named owner on one closed lever and one direction. "Promised to date" is the target of the last phase that has come due; the full promise is never printed as if it were owed today. A ladder must end at the full promised figure, because a ladder that ends short is a second, quieter promise.',
  verification:
    'A reading is CLAIMED (somebody’s statement) or VERIFIED (a seat above the owner on at least one reporting line, naming the evidence). The owner can never verify their own saving and a peer can never verify at all. Reach is recomputed on every read, so a verifier who later moves out from above the owner is printed as drift — the value stays recorded and stops being called verified.',
  doubleCount:
    'Two claims on one deal that name the same saving are CONTESTED. Both are kept, both owners are printed, and the contested amount is held OUT of the headline and printed beside it. The arithmetic is printed as an identity: headline plus contested plus dis-synergy equals the sum of the rows, re-added from the printed integers. No saving is ever counted twice and no saving is ever split between two people who did not agree to a split.',
  runRateVsPnl:
    'A run-rate reading is an annualised effect at a date; a P&L reading is money in one named period. They are different collections with different totals and are never added, never annualised into one another, and never divided one by the other.',
  cost:
    'One-off cost to achieve is its own dated ledger. Payback is printed only when a cost has been declared AND the verified net run-rate is positive; otherwise the cell carries the reason it is refused. A payback of zero from an undeclared cost would be a reassuring blank, which this doctrine bans.',
  currency:
    'A deal is declared in one currency and every row of that deal is in it. Currencies are never converted and never pooled: where a workspace holds more than one, each is printed with its own totals and no single number is offered.',
  limits:
    'It does not value a deal, compute a premium, discount a synergy to a present value, judge whether the deal was worth doing, or rate a person. It records what was promised, by whom, when, what was verified against what evidence, what it cost, and what nobody has checked.',
});

/** CSV #158 — aggregate, identity-free, blanks a refused figure rather than zeroing it. */
export const SYNERGY_CSV_COLUMNS = Object.freeze([
  'as_of',
  'currency',
  'row_kind',
  'lever',
  'effect',
  'state_key',
  'deals_n',
  'claims_n',
  'claims_live_n',
  'state_count',
  'promised_full_cents',
  'promised_to_date_cents',
  'verified_run_rate_cents',
  'unverified_promised_cents',
  'contested_cents',
  'dis_synergy_cents',
  'cost_to_achieve_cents',
  'pnl_periods_n',
  'pnl_cents',
  'capture_verified_ppm',
  'verification_share_ppm',
  'payback_months_x10',
  'counts_reconcile',
  'figures_complete',
]);

export const SYNERGY_CSV_DESCRIPTOR = Object.freeze({
  key: SYNERGY_CSV_SCOPE,
  label: 'Deal thesis & synergy realization (aggregate)',
  group: 'finance',
  sensitive: true,
  filenameSlug: 'deal-synergy-realization',
  description: 'One summary row per currency plus one row per (lever × effect × state) bucket, over the register as read on as_of. Every money figure is an exact integer number of whole cents in that currency; a refused figure exports BLANK with its reason printed on the panel, never a zero. NO owner, NO deal name, NO saving reference, NO thesis text, NO evidence reference and NO person id is exported — the counts and the amounts are the whole of it, and currencies are never pooled.',
});

export const SYNERGY_VIEWS = Object.freeze([
  Object.freeze({ key: 'thesis', label: 'Thesis & promises' }),
  Object.freeze({ key: 'contested', label: 'Contested & unverified' }),
  Object.freeze({ key: 'method', label: 'Method' }),
]);
