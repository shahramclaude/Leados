/**
 * app/core/domain/prvRegistry.js — the closed vocabulary of the Provision &
 * Reimbursement Register (ADR-0250, Schema v204, `#/provisions`,
 * `RULE-PROV-01`, CSV scope #191).
 *
 * THE DUTY, IN A CHIEF FINANCIAL OFFICER'S WORDS. *"The claim register tells us
 * what is asserted against us and what it costs gross. The insurance register
 * tells us what the insurer paid. Neither tells me what I must carry on the
 * balance sheet. A provision is not the gross claim: it is recognized only where
 * there is a present obligation, an outflow that is probable, and an amount I
 * can reliably estimate. A recovery is not a reduction of the provision until it
 * is virtually certain — and even then it is a separate asset, never a netting.
 * I need to see the provision, the reimbursement asset and the net exposure as
 * three different facts, and I need to know whether the figure I am carrying
 * agrees with the figure the record supports."*
 *
 * No surface in this workspace could answer any part of that. The claim register
 * (ADR-0248) holds the matter, the accrual, the gross exposure and the settlement
 * authority. The insurance register (ADR-0249) holds the policy, the notification
 * window, the recoveries and the derived net cost. Neither classifies an
 * obligation, computes a best estimate, recognizes a reimbursement asset, or
 * reconciles the computed provision against the figure finance carries. This
 * register closes that gap.
 *
 * THE GAP CLAIM, QUOTED FROM THE RECORD RATHER THAN ASSERTED. Word-boundary
 * searches of `app/` before this build returned ZERO files for `IAS 37`,
 * `contingent liability`, `best estimate`, `reimbursement asset`, `onerous
 * contract`, `constructive obligation`, `virtually certain` and `provision
 * schedule`. The only surviving hit for `provision` is a route alias in
 * `app/main.js` (`'provision': 'claims'`) and prose about a reserve being a
 * provision, never a computed figure. ADR-0249's own gap list names this
 * register as the unbuilt item. Wider absence **[UNVERIFIED]**.
 *
 * THE FRAMEWORK THIS REGISTER APPLIES. IAS 37 (IFRS) and ASC 450 (US GAAP) are
 * the two regimes; they differ on the probability threshold and on discounting,
 * and the register does NOT choose between them silently. It applies the
 * *structure* both share — a present obligation, a probability test, a reliable
 * estimate, and a reimbursement asset recognized only when virtually certain —
 * and it makes the two regime-specific judgments **declared facts on the
 * assessment**, never defaults:
 *
 *   - **PROBABLE / POSSIBLE / REMOTE** is a human classification of the outflow.
 *     IAS 37's "probable" is more likely than not; ASC 450's is a stricter
 *     "likely". The register carries the classification the seat declared and
 *     prints the threshold in the classification's own words; it never infers a
 *     classification from an amount, a reserve or a claim state.
 *   - **THE BEST ESTIMATE** is either the most likely outcome (a single
 *     obligation) or the probability-weighted expected value over declared
 *     scenarios (a population or several distinct outcomes). An expected value
 *     whose probabilities do not sum to exactly 100%, or whose weighted sum is
 *     not a whole number of minor units, is REFUSED with its reason rather than
 *     rounded into a figure.
 *   - **THE REIMBURSEMENT ASSET** is recognized only when it is virtually
 *     certain. Cash the insurer has already paid is the strongest evidence and
 *     is DERIVED from the insurance register; a pending claim is not virtually
 *     certain unless a seat declares it so in writing. The asset can never exceed
 *     the provision, and the excess is printed rather than recognized.
 *   - **THE RECONCILIATION** is against a figure the finance seat declares it is
 *     carrying. The register computes the provision the record supports and
 *     prints the exact gap against the declared carrying — `reconciled` or
 *     `unreconciled` — and never silently adopts either number.
 *
 * WHAT THIS REGISTER ADDS THAT A SPREADSHEET CANNOT. A spreadsheet holds a
 * provision number somebody typed. This register derives the provision from a
 * declared classification and a declared best estimate, derives the reimbursement
 * asset from the insurance register's own payment facts, caps the asset at the
 * provision, and reconciles the result against a declared carrying — printing
 * every refusal with its reason. Four facts it expresses that a typed number
 * cannot:
 *
 *   - **A matter with no assessment is `unassessed`, never zero.** A zero here
 *     reads as "we decided no provision is owed"; an absent assessment reads as
 *     "nobody has decided". The register refuses to collapse the two.
 *   - **A probable obligation with no reliable estimate is `disclosed-only`.**
 *     IAS 37 forbids a provision without a reliable estimate; the matter is a
 *     contingent liability and is disclosed, not provided.
 *   - **The reimbursement asset is capped at the provision and the excess is
 *     printed.** A recovery larger than the obligation is not an asset beyond the
 *     obligation; recognizing it would invent value.
 *   - **The reconciliation gap is a printed figure, not a silent adoption.**
 *     Where the computed provision differs from the carried figure, the register
 *     says so in exact minor units and files an ask.
 *
 * THE SIX THINGS THAT MUST NEVER HAPPEN, AND ARE PREVENTED BY CONSTRUCTION:
 *   - **No stored state, no stored provision total, no stored asset.** Every
 *     verdict is derived on read from the assessment, the scenarios, the
 *     insurance register and the declared carrying.
 *   - **No inferred classification.** Probable / possible / remote is a declared
 *     accounting judgment; the register never derives it from an amount.
 *   - **No rounded expected value.** A weighted sum that is not a whole minor
 *     unit is refused, never rounded.
 *   - **No asset without virtual certainty.** Cash received, or a declared
 *     written judgment on a claimed amount, is required; a pending claim alone is
 *     not.
 *   - **No asset above the provision.** The asset is capped and the excess is
 *     printed.
 *   - **No person scored.** No seat, line or claims handler is rated, ranked or
 *     named as the cause of a provision outcome. The register reports the
 *     obligation and the money, not blame.
 *
 * MATRIX CORRECTNESS (ADR-0140/0141). An assessment names one to four responsible
 * hands across reporting lines (a claims manager, a finance lead, a group
 * counsel). The reader resolves every ACTIVE line that holds each of them through
 * the ONE matrix engine, counts a person ONCE, and derives the joint apex over
 * every line as the seat whose authority is required to answer for the
 * provision. Where the record names several hands the duty sits above all of them
 * and the screen says so; it never silently promotes one hand to "owner of the
 * provision".
 */

export const PROV_ENGINE_VERSION = 'provision-reimbursement-2026.11-v1';
export const PROV_ADR = 'ADR-0250';
export const PROV_RULE_ID = 'RULE-PROV-01';
export const PROV_ROUTE = 'provisions';
export const PROV_HREF = '#/provisions';
export const PROV_CSV_SCOPE = 'provision-reimbursement';
export const PROV_MARKER_KIND = 'provision';
export const PROV_EVENT_PREFIX = 'provision.';

export const PROV_EVENTS = Object.freeze({
  ASSESSMENT_DECLARED: 'provision.assessment.declared',
  SCENARIO_DECLARED: 'provision.scenario.declared',
  REIMBURSEMENT_DECLARED: 'provision.reimbursement.declared',
  CARRYING_DECLARED: 'provision.carrying.declared',
  CONVENTIONS_SET: 'provision.conventions.set',
  SCANNED: 'provision.scan',
});

export const PROV_RIGHTS = Object.freeze({
  READ: 'read-provisions',
  MANAGE: 'manage-provisions',
});

export const PROV_SETTING_KEYS = Object.freeze({
  autoPropagate: 'provAutoPropagate',
  privacyFloor: 'provPrivacyFloor',
});

export const PROV_BOUNDS = Object.freeze({
  privacyFloor: { min: 2, max: 20 },
});

export const PROV_DEFAULTS = Object.freeze({
  privacyFloor: 3,
});

export const PROV_LIMITS = Object.freeze({
  assessments: 400,
  scenarios: 4000,
  reimbursements: 400,
  carryings: 40,
  markers: 400,
  /** A written basis, a scenario outcome basis, a note: long enough to be a source. */
  textMin: 24,
  textMax: 600,
  /** A scenario outcome label: bounded and non-empty. */
  shortMin: 3,
  shortMax: 120,
  /** A written finance carrying reference. */
  instrumentMin: 12,
  idMax: 120,
  /** How many responsible hands one assessment may name. */
  holdersMax: 4,
  /** A probability in basis points: 0..10000. */
  probabilityBpsMax: 10000,
  /** Rule asking. */
  rowsShown: 80,
});

export const PROV_READ_MIN_RANK = 3;
/** A provision is an accounting judgment that moves the balance sheet: director / VP and above. */
export const PROV_MANAGE_MIN_RANK = 3;

/**
 * The obligation classifications. Each is a DIFFERENT accounting verdict, and the
 * register never infers one. `probable` is the threshold at which a provision may
 * be recognized; `possible` is a contingent liability that is disclosed, not
 * provided; `remote` carries neither.
 */
export const PROV_CLASSIFICATIONS = Object.freeze([
  Object.freeze({
    key: 'probable',
    label: 'Probable',
    says: 'A present obligation from a past event, an outflow that is more likely than not, and an amount that can be reliably estimated. A provision is recognized at the best estimate. (IAS 37’s threshold is "more likely than not"; ASC 450’s is a stricter "likely" — the seat declares which regime the classification was made under.)',
  }),
  Object.freeze({
    key: 'possible',
    label: 'Possible',
    says: 'Less likely than probable but more than remote. No provision is recognized; the matter is a contingent liability and is disclosed.',
  }),
  Object.freeze({
    key: 'remote',
    label: 'Remote',
    says: 'Slight. No provision and no disclosure are required; the matter is recorded and carries no balance-sheet figure.',
  }),
]);
export const PROV_CLASSIFICATION_KEYS = Object.freeze(PROV_CLASSIFICATIONS.map((row) => row.key));
export const PROV_CLASSIFICATION_BY_KEY = Object.freeze(Object.fromEntries(PROV_CLASSIFICATIONS.map((row) => [row.key, row])));

/**
 * The best-estimate methods. `most-likely` is the single dominant outcome;
 * `expected-value` is the probability-weighted sum over declared scenarios, used
 * where the obligation is a population or has several distinct outcomes.
 */
export const PROV_ESTIMATE_METHODS = Object.freeze([
  Object.freeze({
    key: 'most-likely',
    label: 'Most likely outcome',
    says: 'The single most likely settlement amount, in exact minor units. Used where the obligation is one obligation with one dominant outcome.',
  }),
  Object.freeze({
    key: 'expected-value',
    label: 'Expected value (probability-weighted)',
    says: 'The probability-weighted sum over the declared scenarios, each with its own whole-minor-unit amount. The probabilities must sum to exactly 100% and the weighted sum must be a whole number of minor units; otherwise the register refuses the estimate rather than rounding it.',
  }),
]);
export const PROV_ESTIMATE_METHOD_KEYS = Object.freeze(PROV_ESTIMATE_METHODS.map((row) => row.key));
export const PROV_ESTIMATE_METHOD_BY_KEY = Object.freeze(Object.fromEntries(PROV_ESTIMATE_METHODS.map((row) => [row.key, row])));

/**
 * The six states. Each is a DIFFERENT FACT and the headline never hides the flags
 * underneath. `tone` colours the badge; `says` is what the screen prints.
 */
export const PROV_STATES = Object.freeze([
  Object.freeze({
    key: 'unassessed',
    label: 'Unassessed',
    tone: 'bad',
    says: 'The matter carries a gross exposure on the claim register and no provision assessment. The register cannot say whether a provision is owed, and it refuses to print a zero as though a zero were a decision.',
  }),
  Object.freeze({
    key: 'provided-asset-capped',
    label: 'Provided, asset capped',
    tone: 'warn',
    says: 'A provision is recognized and a reimbursement asset is recognized against it, but the amount expected exceeds the provision, so the asset is capped at the provision and the excess is printed. The excess is not recognized as an asset.',
  }),
  Object.freeze({
    key: 'provided-with-asset',
    label: 'Provided, with reimbursement asset',
    tone: 'good',
    says: 'A provision is recognized and a reimbursement asset is recognized against it because the recovery is virtually certain — cash the insurer has paid, or a declared written judgment on a claimed amount. The asset never exceeds the provision.',
  }),
  Object.freeze({
    key: 'provided',
    label: 'Provided',
    tone: 'good',
    says: 'A probable obligation with a reliable best estimate: a provision is recognized at that estimate, and no reimbursement asset is recognized on the record.',
  }),
  Object.freeze({
    key: 'disclosed-only',
    label: 'Disclosed only',
    tone: 'warn',
    says: 'The obligation is possible, or probable but not reliably estimable. No provision is recognized; the matter is a contingent liability and is disclosed.',
  }),
  Object.freeze({
    key: 'remote',
    label: 'Remote',
    tone: 'neutral',
    says: 'The obligation is remote. No provision and no disclosure are required; the matter is recorded.',
  }),
]);
export const PROV_STATE_KEYS = Object.freeze(PROV_STATES.map((row) => row.key));
export const PROV_STATE_BY_KEY = Object.freeze(Object.fromEntries(PROV_STATES.map((row) => [row.key, row])));
export const PROV_ATTENTION_STATE_KEYS = Object.freeze(['unassessed', 'provided-asset-capped', 'disclosed-only']);

/** Refusals printed at the door. Each is a control, not a message. */
export const PROV_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  noReach: 'That person is not on a line this seat holds. One line does not declare a provision for another line.',
});

export const PROV_SECTION_TITLES = Object.freeze({
  provisions: 'Provisions',
  scenarios: 'Scenarios & best estimates',
  reimbursements: 'Reimbursement assets',
  reconciliation: 'Reconciliation',
  method: 'Method',
});

export const PROV_CSV_COLUMNS = Object.freeze([
  'as_of', 'row_kind', 'key', 'assessments_n', 'provided_n', 'provided_with_asset_n',
  'provided_asset_capped_n', 'disclosed_only_n', 'remote_n', 'unassessed_n',
  'scenarios_n', 'reimbursements_n', 'asset_recognized_n', 'asset_capped_n',
  'asset_without_cash_n', 'provision_total_minor', 'asset_total_minor',
  'net_exposure_minor', 'carried_total_minor', 'gap_minor', 'currencies',
  'holders_n', 'lines_n', 'privacy_floor', 'complete', 'blank_reason',
]);

/**
 * CSV #191 (ADR-0250, Schema v204). IDENTITY-FREE BY CONSTRUCTION — and this one
 * is as sensitive as the claim and insurance exports, because a provision
 * schedule names the matter, the party and the sum provided. One summary row,
 * one row per printed provision state, and one row per CURRENCY carrying the
 * money bridge. No matter reference, party, person, manager, instrument or day
 * crosses the boundary: amounts cross only as per-currency minor-unit totals.
 * A per-state count below the declared privacy floor exports BLANK with its
 * reason, never as a small number.
 */
export const PROV_CSV_DESCRIPTOR = Object.freeze({
  key: PROV_CSV_SCOPE,
  label: 'Provision and reimbursement (aggregate)',
  group: 'finance',
  sensitive: true,
  filenameSlug: 'provision-reimbursement',
  description: 'One summary row, one row per printed provision state and one row per currency. Counts of assessments, provisions, provisions with a reimbursement asset, capped assets, disclosed-only contingent liabilities, remote matters and unassessed matters; scenarios and reimbursement recognitions; the recognized, capped and cash-less asset counts; and per-currency minor-unit totals for the derived provision, the reimbursement asset, the net exposure, the declared finance carrying and the reconciliation gap. No matter reference, party, person, manager, instrument or day is exported. A per-state count below the declared privacy floor is withheld BLANK with its reason, never printed as a small number.',
});

/** The published framework basis, printed on the method panel. Never a claim of parity. */
export const PROV_METHOD = Object.freeze({
  engine: PROV_ENGINE_VERSION,
  adr: PROV_ADR,
  frameworks: Object.freeze([
    'IAS 37 / ASC 450 — the provision test: a provision is recognized only where there is a present obligation from a past event, an outflow of resources is probable, and the amount can be reliably estimated. The register carries the classification the seat declared and never infers it from an amount.',
    'Best estimate: for a single obligation, the most likely outcome; for a population or several distinct outcomes, the probability-weighted expected value over declared scenarios. The probabilities must sum to exactly 100% and the weighted sum must be a whole number of minor units; otherwise the estimate is refused, never rounded.',
    'Reimbursement asset: recognized only when it is virtually certain that reimbursement will be obtained. Cash the insurer has paid is derived from the insurance register; a pending claim is not virtually certain unless a seat declares it so in writing. The asset never exceeds the provision, and the excess is printed.',
    'Contingent liability: a possible obligation, or a probable obligation that cannot be reliably estimated, is not provided — it is disclosed. The register prints `disclosed-only` rather than collapsing it into a zero provision.',
    'Reconciliation: the computed provision is compared with the figure the finance seat declares it is carrying, and the exact gap is printed. The register never silently adopts either number.',
    'Matrix addressing (ADR-0140/0141): an assessment names responsible hands across reporting lines, and the authority required to answer for the provision is the joint apex above every line — never a provision “owner” the record selected.',
    'Bulletproof reliability: the register proves what the record supports and refuses the rest with a printed reason. A matter with no assessment is `unassessed`, never zero; an estimate that is not a whole minor unit is refused, never rounded.',
  ]),
  printed: Object.freeze([
    'Each open matter’s classification, best-estimate method and the exact best estimate derived from it.',
    'The provision recognized, the reimbursement asset recognized against it, and the net exposure — three figures printed apart.',
    'Every reimbursement recognition: the cash received from the insurer, the amount claimed, whether virtual certainty rests on cash or on a declared written judgment, and any excess above the provision.',
    'The declared finance carrying per currency and the exact reconciliation gap.',
    'Every responsible hand, every active line that holds each of them, and the joint seat above them all.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No stored state, no stored provision total and no stored asset. Every verdict is re-derived on read.',
    'No inferred classification and no default probability threshold. Probable / possible / remote is a declared accounting judgment.',
    'No rounding: an expected value that is not a whole minor unit is refused with its reason.',
    'No discounting, no tax effect and no risk adjustment. The register carries an undiscounted best estimate; a discounted present value is a separate judgment it does not perform.',
    'No onerous-contract or decommissioning schedule. This register carries the obligation a matter asserts, not a contract’s unavoidable cost.',
    'No person, line or claims handler rated, ranked or named as the cause of a provision outcome.',
  ]),
});
