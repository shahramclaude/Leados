/**
 * app/core/domain/sourcingRegistry.js — the declared vocabulary of the
 * Capability Sourcing & Firm-Boundary Register (ADR-0229, Schema v182,
 * `RULE-SRC-01`, CSV scope #170, `#/sourcing`).
 *
 * THE DUTY, IN THE WORDS OF THE PERSON WHO OWNS IT
 * ------------------------------------------------
 * The chief executive is the only seat whose job is to decide what this company
 * does itself and what it buys — the *boundary of the firm*. Every other money
 * register in this workspace answers a narrower question:
 *
 *   - envelopes and the DoA schedule say whether money MAY be spent;
 *   - the Investment Case Register (ADR-0208) says whether one proposal is
 *     worth funding against a declared hurdle;
 *   - capital rationing (ADR-0213) chooses the best SET under a ceiling;
 *   - the transfer-price and chargeback ledgers (ADR-0177/ADR-0194) price
 *     labour that already moved between lines.
 *
 * None of them asks the boundary question, and it is not a cost comparison:
 * *for THIS capability, should the firm own the asset and the know-how, or
 * contract for an output?* Williamson's answer is that the choice turns on
 * **asset specificity** and the **safeguards** the contract can carry, not on
 * which column is cheaper. Buy the wrong one and the firm is held up at the
 * renewal it did not plan for; make the wrong one and the firm has built a
 * commodity it will maintain forever for no strategic return.
 *
 * THE FOUR FAILURES THIS REGISTER EXISTS TO MAKE VISIBLE
 * -----------------------------------------------------
 *  1. **A comparison of the wrong number.** A build case quoted against a
 *     licence fee is not a comparison: the honest figure is total cost of
 *     ownership on BOTH sides, over the same horizon, in the same currency, at
 *     the same discount convention. Gartner's standing guidance is that
 *     organisations systematically under-estimate buy-side implementation and
 *     over-estimate build capability, which is exactly an accounting defect
 *     this register refuses to reproduce.
 *  2. **Hold-up.** A capability with high asset specificity sourced under a
 *     contract that carries no safeguard (no exit plan, no escrow, no
 *     second source) leaves the firm exposed at renewal. The register does not
 *     forbid that; it prints it, priced, and asks somebody to answer for it.
 *  3. **Deciding at the wrong altitude.** A manager may recommend. A
 *     director may commit spend inside a delegated limit. Only the executive
 *     seat may move the boundary of the firm — and a capability that two lines
 *     each depend on is a boundary decision for the seat above BOTH lines, not
 *     for the louder one.
 *  4. **Memory loss.** Six quarters later nobody remembers what was assumed,
 *     so the renewal is signed on the same optimistic numbers the first
 *     decision used, and the firm never learns what its own sourcing
 *     assumptions were worth. The register freezes the assumptions and grades
 *     them, once, out of sample.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * -----------------------------
 * No inferred costs from a budget envelope. No exchange rate. No currency
 * pooling. No vendor score, no "best value" ranking of suppliers, and no
 * rating of any person. No automatic sourcing recommendation: the register
 * computes the comparison the leader declared and prints where the declared
 * basis cannot support a verdict.
 *
 * Leaf module: imports nothing, so the schema normalizers, the read model, the
 * post-commit rule, the CSV rows and the panel can all depend on it without a
 * cycle.
 */

export const SRC_ENGINE_VERSION = 'capability-sourcing-2026.11-v1';
export const SRC_ADR = 'ADR-0229';
export const SRC_RULE_ID = 'RULE-SRC-01';
export const SRC_ROUTE = 'sourcing';
export const SRC_HREF = '#/sourcing';
export const SRC_CSV_SCOPE = 'capability-sourcing';
export const SRC_MARKER_KIND = 'capability-sourcing';

export const SRC_EVENTS = Object.freeze({
  CASE_DECLARED: 'sourcing.case.declared',
  CASE_WITHDRAWN: 'sourcing.case.withdrawn',
  OPTION_RECORDED: 'sourcing.option.recorded',
  DECIDED: 'sourcing.decided',
  GRADED: 'sourcing.graded',
  SCANNED: 'sourcing.scan',
});
export const SRC_EVENT_PREFIX = 'sourcing.';

/**
 * Four rights, each at the altitude that can actually answer for it.
 *
 *  - READ (3–5): the boundary book is portfolio material. A manager has no
 *    business reading the enterprise's contract positions, and the reader
 *    narrows every case to the lines the seat holds anyway.
 *  - RECORD (2–5): the leader who HOLDS the capability records the options —
 *    the engineer who would build it, the manager who would run the contract.
 *    Narrowed inside the action to a seat that holds at least one line the case
 *    names, and never the seat that will decide it unilaterally.
 *  - DECIDE (5): moving the boundary of the firm is the chief altitude's act.
 *    A branch that has no chief seat reads `no-authority-at-rank` and the
 *    decision stays owed — the register never promotes a lower seat to fill it.
 *  - GRADE (4–5): grading the frozen assumptions against what actually
 *    happened is an independent review, so it sits ABOVE the decision where
 *    the graph can hold it, and never with the person who wrote the options.
 */
export const SRC_RIGHTS = Object.freeze({
  READ: 'read-capability-sourcing',
  RECORD: 'record-capability-sourcing',
  DECIDE: 'decide-capability-sourcing',
  GRADE: 'grade-capability-sourcing',
});

export const SRC_LIMITS = Object.freeze({
  cases: 200,
  options: 600,
  acts: 900,
  markers: 400,
  textMin: 24,
  textMax: 600,
  titleMin: 12,
  titleMax: 160,
  reasonMin: 24,
  reasonMax: 600,
  refMin: 3,
  refMax: 160,
  idMax: 120,
  currencyMax: 3,
  /** Whole cents. One quadrillion major units: far above any real contract,
   * far below Number.MAX_SAFE_INTEGER, so every printed figure is exact. */
  centsMax: 1_000_000_000_000_000,
  /** Basis points: 100% is 10,000 bp, so a share is never a float. */
  bpMax: 10_000,
  /** A capability's own assessed specificity/rationale fields are 0–100. */
  scoreMax: 100,
  dayMin: '2000-01-01',
  dayMax: '2100-12-31',
  /** The shortest and longest decision horizon the register will price, in days. */
  horizonMinDays: 30,
  horizonMaxDays: 3650,
  /** Below this many recorded option(s) on one side, no comparison is claimed. */
  minOptionsPerSide: 1,
  /** Below this many graded cases, no calibration figure is printed at all. */
  gradeFloor: 5,
  casesShown: 40,
  optionsShown: 60,
  actsShown: 60,
});

export const SRC_SETTING_KEYS = Object.freeze({
  autoPropagate: 'sourcingAutoPropagate',
});

export const SRC_DEFAULTS = Object.freeze({ autoPropagate: true });
export const SRC_BOUNDS = Object.freeze({ autoPropagate: 'boolean' });

/* ------------------------------------------------------------ the vocabulary */

/**
 * A capability's strategic weight. Not a score of the team — a declaration
 * about the WORK, which is the only thing a boundary decision may turn on.
 * The distinction is Prahalad & Hamel's core/context test, made operable: if
 * losing this capability for a year would not change what customers buy, it is
 * context, and context sourced externally is a success, not a surrender.
 */
export const SRC_STRATEGIC_WEIGHTS = Object.freeze([
  Object.freeze({ key: 'differentiating', label: 'Differentiating — losing it for a year changes what customers buy', rank: 3 }),
  Object.freeze({ key: 'supporting', label: 'Supporting — it makes the differentiator work, but customers never see it', rank: 2 }),
  Object.freeze({ key: 'context', label: 'Context — every competitor needs it and none of them wins on it', rank: 1 }),
]);
export const SRC_WEIGHT_KEYS = Object.freeze(SRC_STRATEGIC_WEIGHTS.map((row) => row.key));

/**
 * Asset specificity, on Williamson's ladder. This is the variable the whole
 * transaction-cost argument turns on: a site-specific or human-specific asset
 * cannot be redeployed without losing value, so a contract around it needs
 * safeguards, and the absence of safeguards is the hold-up exposure.
 */
export const SRC_SPECIFICITY = Object.freeze([
  Object.freeze({
    key: 'none',
    label: 'None — generic; a replacement supplier could deliver it next month',
    rank: 0,
    holdUp: 0,
    says: 'No specificity. The market is thick and switching is ordinary procurement.',
  }),
  Object.freeze({
    key: 'low',
    label: 'Low — mild tailoring; some re-work to move, no lost value',
    rank: 1,
    holdUp: 10,
    says: 'Mild tailoring. Moving costs effort, not value.',
  }),
  Object.freeze({
    key: 'mixed',
    label: 'Mixed — standard core with firm-specific integration',
    rank: 2,
    holdUp: 35,
    says: 'The integration is ours; the core is not. The exposed part is the seam.',
  }),
  Object.freeze({
    key: 'high',
    label: 'High — firm-specific know-how, data or plant that cannot be redeployed',
    rank: 3,
    holdUp: 65,
    says: 'Redeployment loses value. A contract without a safeguard is a renewal held at the other party’s price.',
  }),
  Object.freeze({
    key: 'site',
    label: 'Site-specific — the asset only works where it is, for us',
    rank: 4,
    holdUp: 100,
    says: 'Relocation is not merely costly, it destroys the asset. Only ownership or a long safeguarded contract is defensible.',
  }),
]);
export const SRC_SPECIFICITY_KEYS = Object.freeze(SRC_SPECIFICITY.map((row) => row.key));

/**
 * The four sourcing modes, not two. Real boundary decisions are rarely a
 * binary: the honest options are make, buy, partner and a hybrid where the
 * firm owns the differentiating layer and rents the commodity around it. This
 * is the decomposition the 2026 build-vs-buy literature converges on from both
 * the transaction-cost and the sourcing side.
 */
export const SRC_MODES = Object.freeze([
  Object.freeze({
    key: 'make',
    label: 'Make — the firm owns the asset, the know-how and the delivery',
    governance: 'hierarchy',
    owns: 'asset',
  }),
  Object.freeze({
    key: 'buy',
    label: 'Buy — a contract for an output; the supplier owns the asset',
    governance: 'market',
    owns: 'output',
  }),
  Object.freeze({
    key: 'partner',
    label: 'Partner — a joint venture or co-development; the asset is shared',
    governance: 'hybrid',
    owns: 'shared',
  }),
  Object.freeze({
    key: 'hybrid',
    label: 'Hybrid — own the differentiating layer, rent the commodity substrate',
    governance: 'hybrid',
    owns: 'layer',
  }),
]);
export const SRC_MODE_KEYS = Object.freeze(SRC_MODES.map((row) => row.key));
export const srcMode = (key) => SRC_MODES.find((row) => row.key === key) || null;

/**
 * A contract safeguard. Each is a real instrument, not a sentiment, and each
 * carries the specificity it can actually answer for — so a "we know the
 * vendor well" note is not a safeguard and cannot clear a site-specific asset.
 */
export const SRC_SAFEGUARDS = Object.freeze([
  Object.freeze({
    key: 'exit-plan',
    label: 'Written exit plan — what we do on day one after termination',
    answers: ['low', 'mixed'],
    strengthBp: 2500,
    says: 'Answers low and mixed specificity. An exit plan does not help where the asset cannot leave.',
  }),
  Object.freeze({
    key: 'source-code-escrow',
    label: 'Source-code / data escrow with a tested release condition',
    answers: ['mixed', 'high'],
    strengthBp: 3500,
    says: 'Answers mixed and high specificity for software and data. Useless if the release condition is never tested.',
  }),
  Object.freeze({
    key: 'second-source',
    label: 'A qualified second source that has delivered before',
    answers: ['low', 'mixed', 'high'],
    strengthBp: 4500,
    says: 'Answers low through high specificity, but only where a genuinely qualified alternative exists.',
  }),
  Object.freeze({
    key: 'long-term-fixed-price',
    label: 'Long-term contract with a fixed price and a bounded renewal',
    answers: ['low', 'mixed', 'high'],
    strengthBp: 3000,
    says: 'Answers low through high specificity for the contract term only. It expires, and the exposure returns with it.',
  }),
  Object.freeze({
    key: 'joint-ownership',
    label: 'Shared ownership of the asset with a governed governance board',
    answers: ['mixed', 'high', 'site'],
    strengthBp: 4000,
    says: 'Answers mixed through site specificity, because the firm holds a seat at the asset’s own table.',
  }),
  Object.freeze({
    key: 'co-located-handover',
    label: 'Co-located handover with a named successor and a proven cut-over',
    answers: ['site'],
    strengthBp: 5000,
    says: 'The only safeguard that answers site specificity, because the asset cannot move and the people must.',
  }),
]);
export const SRC_SAFEGUARD_KEYS = Object.freeze(SRC_SAFEGUARDS.map((row) => row.key));
export const srcSafeguard = (key) => SRC_SAFEGUARDS.find((row) => row.key === key) || null;

/** Does a declared safeguard actually answer a declared specificity? */
export function srcSafeguardAnswers(safeguardKey, specificityKey) {
  const safeguard = srcSafeguard(safeguardKey);
  if (!safeguard) return false;
  return safeguard.answers.includes(specificityKey);
}

/**
 * Cost lines, in the two buckets that must never be merged.
 *
 * ONE-TIME lines are what the option costs to stand up. RECURRING lines are
 * what it costs per year to keep. A comparison that adds them together without
 * the horizon is a category error, so the register keeps them apart and
 * capitalises the recurring lines over the declared horizon at the declared
 * discount rate, at Actual/365 Fixed.
 */
export const SRC_COST_BUCKETS = Object.freeze({
  oneTime: 'one-time',
  recurring: 'recurring',
});

export const SRC_COST_LINES = Object.freeze([
  // Make
  Object.freeze({ key: 'build-effort', label: 'Incremental build / stand-up effort', bucket: 'one-time', sides: ['make', 'hybrid'], note: 'The people and tools spent only because this capability is being built.' }),
  Object.freeze({ key: 'build-tooling', label: 'One-time tooling, licences and infrastructure to build', bucket: 'one-time', sides: ['make', 'hybrid'], note: 'The build’s own toolchain — not the capability’s running cost.' }),
  Object.freeze({ key: 'run-team', label: 'Run and maintain the capability, per year', bucket: 'recurring', sides: ['make', 'hybrid'], note: 'The team that keeps it alive after the launch. The cost nobody puts in the first slide.' }),
  Object.freeze({ key: 'run-infrastructure', label: 'Running infrastructure, per year', bucket: 'recurring', sides: ['make', 'hybrid'], note: 'Hosting, storage, licences the build itself consumes.' }),
  Object.freeze({ key: 'reinvest', label: 'Reinvestment to stay current, per year', bucket: 'recurring', sides: ['make', 'hybrid'], note: 'What must be spent every year simply to not fall behind.' }),
  // Buy / partner
  Object.freeze({ key: 'licence', label: 'Licence / subscription, per year', bucket: 'recurring', sides: ['buy', 'partner'], note: 'The advertised price. Never the total.' }),
  Object.freeze({ key: 'implementation', label: 'Implementation and configuration, one-time', bucket: 'one-time', sides: ['buy', 'partner'], note: 'The cost that turns a licence into a working capability.' }),
  Object.freeze({ key: 'integration', label: 'Integration with our systems, one-time', bucket: 'one-time', sides: ['buy', 'partner'], note: 'What it costs to make it talk to what we already run.' }),
  Object.freeze({ key: 'migration', label: 'Migration off the incumbent, one-time', bucket: 'one-time', sides: ['buy', 'partner', 'hybrid'], note: 'Moving the data and the people from what we have today.' }),
  Object.freeze({ key: 'onboarding', label: 'Training and onboarding, one-time', bucket: 'one-time', sides: ['buy', 'partner', 'hybrid'], note: 'The capability is only bought when the people can use it.' }),
  Object.freeze({ key: 'support', label: 'Support tier and professional services, per year', bucket: 'recurring', sides: ['buy', 'partner'], note: 'The line that grows after signature.' }),
  Object.freeze({ key: 'exit-reserve', label: 'Exit / lock-in reserve, per year', bucket: 'recurring', sides: ['buy', 'partner'], note: 'What it would cost to leave, spread over the term. The tax almost nobody prices upfront.' }),
  // Shared across sides
  Object.freeze({ key: 'transition', label: 'Transition and dual-running, one-time', bucket: 'one-time', sides: ['make', 'buy', 'partner', 'hybrid'], note: 'The overlap period where both the old and the new cost money.' }),
]);
export const SRC_COST_LINE_KEYS = Object.freeze(SRC_COST_LINES.map((row) => row.key));
export const srcCostLine = (key) => SRC_COST_LINES.find((row) => row.key === key) || null;

/** Which cost lines a given mode may carry. A line outside the mode is refused. */
export function srcCostLinesForMode(modeKey) {
  return SRC_COST_LINES.filter((row) => row.sides.includes(modeKey)).map((row) => row.key);
}

/**
 * The verdicts a case can carry. The precedence is declared here and applied in
 * the reader in exactly this order, so the rule, the panel and the CSV cannot
 * disagree about which one wins.
 */
export const SRC_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'unreadable',
    rank: 0,
    tone: 'bad',
    label: 'Unreadable — the record cannot support any comparison',
  }),
  Object.freeze({
    key: 'not-comparable',
    rank: 1,
    tone: 'bad',
    label: 'Not comparable — the declared options are not a like-for-like question',
  }),
  Object.freeze({
    key: 'safeguard-missing',
    rank: 2,
    tone: 'bad',
    label: 'Hold-up unaddressed — the specificity is not answered by any recorded safeguard',
  }),
  Object.freeze({
    key: 'decision-owed',
    rank: 3,
    tone: 'warn',
    label: 'Decision owed — a comparison exists and no boundary decision has been recorded',
  }),
  Object.freeze({
    key: 'mismatch',
    rank: 4,
    tone: 'warn',
    label: 'Declared choice does not follow the declared basis — printed, never blocked',
  }),
  Object.freeze({
    key: 'decided',
    rank: 5,
    tone: 'good',
    label: 'Decided — the chosen mode is the lowest total cost of ownership and its specificity is answered',
  }),
  Object.freeze({
    key: 'decided-premium',
    rank: 6,
    tone: 'good',
    label: 'Decided at a premium — a dearer mode was chosen on record for a stated reason, which is a judgement, not an error',
  }),
]);
export const SRC_VERDICT_KEYS = Object.freeze(SRC_VERDICTS.map((row) => row.key));
export const srcVerdict = (key) => SRC_VERDICTS.find((row) => row.key === key) || null;

/** The state a case is in, independent of the money question. */
export const SRC_STATES = Object.freeze([
  Object.freeze({ key: 'declared', label: 'Declared — no option recorded for either side yet' }),
  Object.freeze({ key: 'one-sided', label: 'One-sided — only one side of the comparison has a recorded option' }),
  Object.freeze({ key: 'comparable', label: 'Comparable — both sides priced over the same horizon and currency' }),
  Object.freeze({ key: 'decided', label: 'Decided — a boundary decision is on the record' }),
]);
export const SRC_STATE_KEYS = Object.freeze(SRC_STATES.map((row) => row.key));

/** Risk domains a sourcing case can be tagged with, so it joins the risk book. */
export const SRC_RISK_DOMAINS = Object.freeze(['financial', 'operational', 'compliance', 'strategic', 'reputational']);

export const SRC_FLAGS = Object.freeze({
  reviewOverdue: 'review-overdue',
  assumptionsStale: 'assumptions-stale',
  holdUp: 'hold-up-exposure',
  singleSource: 'single-source',
  noSafeguard: 'no-safeguard',
  premiumUnexplained: 'premium-unexplained',
});

export const SRC_REFUSALS = Object.freeze({
  notSeated: 'The declared seat is unresolved and read-only. Choose a valid seat first.',
  notFound: 'That row is not on this record. Nothing was saved.',
  withdrawn: 'This case was withdrawn. A withdrawal is final; declare a new case rather than reviving one.',
  notSourcingCase: 'That operational case is not a sourcing decision.',
  selfRecord: 'The seat that will DECIDE this case does not also record its options: the comparison would be written by the party that benefits from the answer.',
  currencyMismatch: 'The two sides are priced in different currencies. No exchange rate is invented here — price both sides in one currency or record that the comparison cannot be made.',
  horizonMismatch: 'The two sides are priced over different horizons. A five-year build compared with a one-year licence is not a comparison.',
  lineNotInMode: 'That cost line does not belong to this sourcing mode.',
  duplicateLine: 'That cost line is already recorded on this option. Amend it rather than adding it twice.',
  badBasisPoints: 'A share is a whole number of basis points between 0 and 10,000.',
  noOptions: 'Nothing is recorded on this side yet, so there is nothing to compare.',
  alreadyDecided: 'A boundary decision is already recorded on this case. A later reconsideration is a new case, so the first decision stays on the record.',
  decisionNotOurs: 'Only the chief altitude moves the boundary of the firm for the whole enterprise.',
  wrongLine: 'This seat holds neither the capability’s line nor a declared line over the seat that does.',
});

/* ------------------------------------------------------------------- method */

export const SRC_METHOD = Object.freeze({
  engine: SRC_ENGINE_VERSION,
  adr: SRC_ADR,
  frameworks: Object.freeze([
    'Transaction-cost economics and the boundary of the firm (Coase 1937; Williamson 1975/1985) — the make-or-buy question is answered by asset specificity and the safeguards a contract can carry, not by which column is cheaper.',
    'The resource-based view and the core/context test (Penrose 1959; Prahalad & Hamel 1990) — a differentiator the firm does not own is a dependency; a commodity the firm insists on owning is a museum.',
    'Total cost of ownership with a declared horizon and discount convention (Gartner’s standing build-vs-buy guidance), including the two lines organisations systematically omit: buy-side implementation/integration and build-side run-and-reinvest.',
    'Real-options discipline (Dixit & Pindyck 1994) — a capability whose requirements are still moving buys an option, not an asset: the register prices the reversible mode and prints it beside the irreversible one.',
    'Matrix accountability (ADR-0140/ADR-0141) — a capability two lines depend on is a boundary decision for the seat above BOTH lines; one line may not source on the others’ behalf, and a genuine diamond tie asks every joint apex.',
    'Bulletproof reliability (NORTH_STAR) — “the totals add up” and “every printed figure is the computed figure” are reported as two separate claims; a figure the record cannot support is printed as a refusal with its reason, never as a zero.',
  ]),
  printed: Object.freeze([
    'Every figure is whole cents, capitalised at Actual/365 Fixed to the case’s declared horizon and discount rate. Nothing is rounded into a different amount; a printed figure is the computed figure.',
    'One-time and recurring costs are kept apart and printed apart. Only the declared total, over the declared horizon, is compared.',
    'The comparison is per currency and is never pooled. A case whose two sides sit in different currencies reads `not-comparable` with the reason.',
    'The hold-up reading is a property of the (specificity, safeguard) PAIR, printed as a named exposure. A safeguard that cannot answer the declared specificity is printed as not answering it — never counted as reassurance.',
    'A decision dearer than the cheapest comparable option is `decided-premium`, not an error: a written reason is required and printed. The register never overrides a human judgement.',
    'Frozen assumptions are graded once, after the review date, against the cost outcomes actually recorded. Below the declared floor, no calibration figure is printed at all.',
    'The register never rates a supplier, and never rates a person. Every finding is a statement about a capability, a contract or a pair of lines.',
  ]),
  deliberatelyAbsent: Object.freeze([
    'No inferred cost from a budget envelope, an invoice total or a headcount.',
    'No exchange rate, no currency pooling, no inflation index.',
    'No vendor score, no "best value" league table and no recommendation engine: the register computes the comparison the leader declared and states where that comparison cannot support a verdict.',
    'No automatic re-sourcing, no automatic contract action and no write to any commercial system.',
    'No per-person performance signal from a sourcing outcome.',
  ]),
});

/* ---------------------------------------------------------------- CSV #170 */

export const SRC_CSV_COLUMNS = Object.freeze([
  'as_of',
  'row_kind',
  'key',
  'currency',
  'cases_n',
  'comparable_n',
  'decided_n',
  'hold_up_n',
  'no_safeguard_n',
  'review_overdue_n',
  'state',
  'verdict',
  'specificity',
  'mode_chosen',
  'cheapest_mode',
  'chosen_total_cents',
  'cheapest_total_cents',
  'premium_cents',
  'premium_bp',
  'safeguard_answers',
  'option_count',
  'cost_line_count',
  'blank_reason',
]);

/**
 * CSV #170 (ADR-0229, Schema v182). IDENTITY-FREE BY CONSTRUCTION.
 *
 * One summary row, one row per state, one row per verdict and one row per
 * currency. No capability title, no case id, no owner, no manager, no vendor
 * name, no contract reference, no rationale and no cost line text crosses this
 * boundary. A figure the reader cannot compute exports BLANK with its reason,
 * never a zero.
 */
export const SRC_CSV_DESCRIPTOR = Object.freeze({
  key: SRC_CSV_SCOPE,
  label: 'Capability sourcing & firm boundary (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'capability-sourcing',
  description: 'One summary row, one row per case state, one row per verdict and one row per currency: case counts, comparable and decided counts, hold-up and missing-safeguard counts, and per currency the chosen and cheapest total cost of ownership with the exact premium in cents and basis points. No capability title, case id, owner, manager, vendor, contract reference, rationale or cost line text is exported; an uncomputable figure is BLANK with its reason, never zero. Money is whole cents and is never pooled across currencies.',
});

export const SRC_SECTION_TITLES = Object.freeze({
  cases: 'Capability cases',
  compare: 'Side-by-side',
  calibration: 'Frozen assumptions & calibration',
  method: 'Method & limits',
});

/* --------------------------------------------------------------- key helpers */

/**
 * The key that fixes the comparison’s terms. Two options are comparable only
 * when they were priced on the same currency, over the same horizon and at the
 * same discount rate — because those three facts, not the totals, are what make
 * two totals the same question.
 */
export function srcComparabilityKey({ currency = '', horizonDays = null, discountBp = null } = {}) {
  const cur = String(currency || '').toUpperCase();
  const horizon = Number.isInteger(horizonDays) ? horizonDays : '*';
  const discount = Number.isInteger(discountBp) ? discountBp : '*';
  return `${cur}|${horizon}|${discount}`;
}

/** The opaque ask signature a filed obligation carries (never in the ask text). */
export const srcAskSignature = (kind, caseId) => `src1:${kind}:${caseId}`;

/** Parse an opaque ask signature back. Returns null for anything else. */
export function parseSrcAskSignature(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^src1:([a-z-]+):([A-Za-z0-9:_-]{1,120})$/.exec(raw);
  if (!match) return null;
  return { kind: match[1], caseId: match[2], signature: raw };
}

export const srcAskSummary = (signature) => `src-ask|${String(signature || '').slice(0, 120)}`;

export function parseSrcAskSummary(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  const match = /^src-ask\|(src1:[a-z-]+:[A-Za-z0-9:_-]{1,120})$/.exec(raw);
  return match ? match[1] : null;
}

/* ------------------------------------------------------------- normalizers */

export const SRC_SETTINGS_DEFAULTS = SRC_DEFAULTS;

/**
 * Settings normalizer. Declared here (the leaf) so `schema.js` can normalize the
 * register’s switch without importing the read model, and so the rule can read
 * the SAME normalization the writer wrote.
 */
export function normalizeSourcingSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    sourcingAutoPropagate: s.sourcingAutoPropagate !== false,
  };
}
