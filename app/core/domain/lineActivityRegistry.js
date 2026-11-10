/**
 * app/core/domain/lineActivityRegistry.js — the declared vocabulary of the Matrix
 * Line Activity Reconciliation (ADR-0160, Schema v130 unchanged,
 * `#/matrix?panel=activity`, CSV scope #120).
 *
 * WHAT THIS REGISTRY IS FOR
 * -------------------------
 * ADR-0158 prices what each declared line was CHARGED across a named period.
 * Nothing says what each line DID. A line declared at 40% of a person that
 * originated no dated act about or for that person across a whole quarter is a
 * line that exists on paper: nobody briefed her, nobody answered for the share,
 * nobody re-affirmed the term, nobody settled a single obligation the line left
 * behind. A line declared at 10% that originated twelve such acts is consuming
 * managerial attention the declaration does not describe. Both are visible here
 * and nowhere else.
 *
 * WHY ACTS AND NOT WORK ITEMS
 * ---------------------------
 * A completed work item names the PERSON but not the line it served — a person
 * on three lines makes every item she touches reach all three. Attributing an
 * item to a line would be an allocation this workspace invented, so this module
 * does not do it. What the record DOES say exactly is which manager originated
 * each dated act, about which person, on which day. That is the observed side,
 * and it is exact rather than inferred.
 *
 * NOTHING HERE IS STORED. Every figure is derived on read from the live matrix,
 * the dated declarations and the workspace's own line-addressed acts.
 */

export const LINE_ACTIVITY_ENGINE_VERSION = 'line-activity/1';

/**
 * The scored sources, each an act a LINE HOLDER took about a named person on a
 * recorded day. The field names are the normalised ones the load gate writes, so
 * a row that would be malformed never reaches this reader in the first place.
 */
export const LINE_ACTIVITY_SOURCES = Object.freeze([
  Object.freeze({
    key: 'brief',
    collection: 'onboardingLineBriefs',
    datePath: 'declaredOn',
    label: 'Onboarding line brief',
    detail: 'The line told the person, in writing, what it expects of them — or declined to.',
  }),
  Object.freeze({
    key: 'consent',
    collection: 'lineConsents',
    datePath: 'decidedOn',
    label: 'Line consent answer',
    detail: 'A line manager accepted or declined the share, or the person acknowledged the hours.',
  }),
  Object.freeze({
    key: 'reaffirmation',
    collection: 'lineReaffirmations',
    datePath: 'decidedOn',
    label: 'Line re-affirmation answer',
    detail: 'A term was re-affirmed or released, accepted or objected to.',
  }),
  Object.freeze({
    key: 'remedy',
    collection: 'lineExitRemedies',
    datePath: 'decidedOn',
    label: 'Line-exit remedy',
    detail: 'An obligation a line left behind was retired or carried to a named manager.',
  }),
]);

export const LINE_ACTIVITY_SOURCE_KEYS = Object.freeze(LINE_ACTIVITY_SOURCES.map((s) => s.key));

/** The declared bounds. Stated once, read by the engine, the panel and the export. */
export const LINE_ACTIVITY_BOUNDS = Object.freeze({
  // 200 per-mille = 20 percentage points of the person's attributed acts.
  shareBandPermille: 200,
  // Three attributed acts is the minimum before any share is compared. A
  // proportion of two is arithmetic, not a reading.
  minAttributedActs: 3,
  rows: 200,
  acts: 4000,
});

/** How one dated act is placed against a person's priced lines. */
export const LINE_ACTIVITY_PLACEMENTS = Object.freeze([
  Object.freeze({
    key: 'line',
    label: 'One priced line',
    detail: 'The originating manager holds exactly one of the person’s priced lines. This is the only class that contributes to a comparison.',
  }),
  Object.freeze({
    key: 'home',
    label: 'Home manager',
    detail: 'The act was originated by the home manager. ADR-0158 prices additional lines only and the home pointer moves, so these are counted and printed and never charged to a named home line.',
  }),
  Object.freeze({
    key: 'ambiguous',
    label: 'Same manager, two lines',
    detail: 'The originating manager holds TWO of this person’s priced lines. The record does not say which declaration the act belonged to, so it is refused rather than assigned.',
  }),
  Object.freeze({
    key: 'unpriced',
    label: 'Line not priced',
    detail: 'The originating manager holds a line for this person that the period could NOT price. The act is real and the declared side is incomplete, so the comparison is refused rather than made against part of the person.',
  }),
  Object.freeze({
    key: 'other',
    label: 'No declared line',
    detail: 'The act came from a manager who holds no live declared line for this person (a skip-level, or a line that has since ended). Counted and printed; it is other managers’ activity, not this person’s line consumption.',
  }),
]);

export const LINE_ACTIVITY_PLACEMENT_KEYS = Object.freeze(LINE_ACTIVITY_PLACEMENTS.map((p) => p.key));

/**
 * The verdict ladder. `severity` is the ONLY place the precedence is stated, so
 * the panel, the brief and the export cannot disagree about a word. Lower wins.
 *
 * Every verdict is about a LINE. Nothing here rates a person, and nothing here
 * says a manager is doing a bad job: an act count is a fact about the record.
 */
export const LINE_ACTIVITY_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'refused',
    severity: 0,
    label: 'Refused',
    tone: 'bad',
    open: true,
    detail: 'The comparison is not made: the period could not price the person’s declared lines, or an act came from a manager whose line for the person could not be priced. A part is never compared to a whole.',
  }),
  Object.freeze({
    key: 'insufficient',
    severity: 1,
    label: 'Too few acts',
    tone: 'neutral',
    open: false,
    detail: 'Fewer than the declared floor of attributed acts landed inside the window. No share is compared: a count this small cannot carry a 20-point band without inventing precision.',
  }),
  Object.freeze({
    key: 'unattributable-dominant',
    severity: 2,
    label: 'Mostly unassignable',
    tone: 'warn',
    open: true,
    detail: 'More acts could not be assigned to one declaration than could. The composition this screen compares is therefore a minority of the line’s activity, and the reading is flagged rather than published as the whole.',
  }),
  Object.freeze({
    key: 'silent-line',
    severity: 3,
    label: 'Declared, nothing originated',
    tone: 'bad',
    open: true,
    detail: 'The line was charged share-days across the period and originated NO dated act about this person inside the window: no brief, no consent answer, no re-affirmation, no settled obligation. A line on paper — or a manager working outside this record, which the same sentence names.',
  }),
  Object.freeze({
    key: 'over-active',
    severity: 4,
    label: 'More activity than declared',
    tone: 'warn',
    open: true,
    detail: 'The line originated a materially larger share of this person’s line-addressed acts than the share-days it was charged. Its managerial demands are arriving out of proportion with the capacity it holds.',
  }),
  Object.freeze({
    key: 'under-active',
    severity: 5,
    label: 'Less activity than declared',
    tone: 'warn',
    open: true,
    detail: 'The line originated a materially smaller share of this person’s line-addressed acts than the share-days it was charged. Either the declaration is lagging the reality or the line holds capacity it is not exercising.',
  }),
  Object.freeze({
    key: 'sole-line',
    severity: 6,
    label: 'Only priced line',
    tone: 'neutral',
    open: false,
    detail: 'This is the person’s single priced line inside the window, so it necessarily received every attributed act. There is no second share to compare and none is manufactured.',
  }),
  Object.freeze({
    key: 'aligned',
    severity: 7,
    label: 'Activity matches',
    tone: 'good',
    open: false,
    detail: 'The observed and declared shares are within the declared band. This is agreement inside a convention, not proof that the time matches: the two sides are different units and the method says so.',
  }),
]);

export const LINE_ACTIVITY_VERDICT_KEYS = Object.freeze(LINE_ACTIVITY_VERDICTS.map((v) => v.key));

export function lineActivityVerdict(key) {
  return LINE_ACTIVITY_VERDICTS.find((v) => v.key === key) || null;
}

export function lineActivitySeverity(key) {
  const verdict = lineActivityVerdict(key);
  return verdict ? verdict.severity : 99;
}

/** The printable conventions. The panel renders these; it does not paraphrase. */
export const LINE_ACTIVITY_CONVENTIONS = Object.freeze([
  Object.freeze({
    key: 'band',
    label: 'Materiality band',
    value: `${LINE_ACTIVITY_BOUNDS.shareBandPermille} per-mille (${LINE_ACTIVITY_BOUNDS.shareBandPermille / 10} percentage points)`,
    detail: 'A declared share and an observed share closer than this are read as the same composition. The band is a declared convention, not a measured tolerance.',
  }),
  Object.freeze({
    key: 'floor',
    label: 'Act floor',
    value: `${LINE_ACTIVITY_BOUNDS.minAttributedActs} attributed acts`,
    detail: 'Below the floor the comparison is refused and the count is printed instead of a share.',
  }),
  Object.freeze({
    key: 'per-mille',
    label: 'Share unit',
    value: 'whole per-mille of the person’s attributed acts, allocated by largest remainder',
    detail: 'Both sides sum to exactly 1000 by construction and the identity is printed as a claim. Nothing is rounded into looking right.',
  }),
  Object.freeze({
    key: 'window',
    label: 'Window',
    value: 'the SAME named period on both sides',
    detail: 'Declared share-days are charged across the period, and only acts whose own recorded day falls inside that same period are counted. Two windows would make the comparison meaningless.',
  }),
  Object.freeze({
    key: 'home-line',
    label: 'Home line',
    value: 'out of scope on both sides',
    detail: 'ADR-0158 prices additional lines only and the home pointer moves (ADR-0149). Acts originated by the home manager are counted as home acts and are never charged to a named home line.',
  }),
]);

/**
 * What the reading IS, stated before any number. The two sides are deliberately
 * different units and pretending otherwise is the failure this block prevents.
 */
export const LINE_ACTIVITY_METHOD = Object.freeze([
  Object.freeze({
    name: 'Attention-based view of the firm (Ocasio, 1997)',
    why: 'A declared share is a claim on a person’s attention. This screen reads the claim against the dated acts the line actually originated, so a share nobody is exercising and a line demanding more than it holds are both visible while they can still be corrected — not at the annual review, when they have become a story about the person.',
  }),
  Object.freeze({
    name: 'Activity-based costing (Kaplan & Anderson)',
    why: 'A declared allocation is a cost driver, and cost drivers drift from the activity that actually consumes them. The declared side is ADR-0158’s own time-weighted share-day ledger; this module re-prices nothing.',
  }),
  Object.freeze({
    name: 'Counts of acts, never hours',
    why: 'The observed side counts dated ACTS a line holder originated about the person: a brief, a consent answer, a re-affirmation, a settled obligation. Acts differ in weight, so a printed gap is a screening signal about composition — which line is actually being run — and never a measurement of managerial effort or quality.',
  }),
  Object.freeze({
    name: 'Refusal instead of imputation',
    why: 'An act from a manager holding two of the person’s priced lines is never assigned to one; an act from a manager whose line could not be priced refuses the person’s comparison; a period below the act floor prints its count instead of a share. Every one of those refusals is the product working.',
  }),
  Object.freeze({
    name: 'Report, never retune',
    why: 'A silent or over-active line is not corrected here. Changing a declaration is a human agreement between two managers and, under ADR-0148/0157, an answer the person is entitled to give. This module prints the question and writes nothing.',
  }),
  Object.freeze({
    name: 'No person rating and no manager rating',
    why: 'Every verdict is about a LINE — a declared share and the dated acts that line originated. The module ranks nobody, scores no manager, and exports no identity: a mismatch between a declaration and the activity under it is a structural fact, not a performance.',
  }),
]);

/**
 * The export's columns. One workspace summary row plus one row per declared
 * line KIND. Counts, shares and claims only: no person, no manager, no
 * declaration id and no free text.
 */
export const LINE_ACTIVITY_CSV_COLUMNS = Object.freeze([
  'scope',
  'period_from',
  'period_to',
  'period_days',
  'line_kind',
  'lines_n',
  'priced_lines_n',
  'compared_n',
  'aligned_n',
  'over_active_n',
  'under_active_n',
  'silent_line_n',
  'unattributable_dominant_n',
  'insufficient_n',
  'refused_n',
  'sole_line_n',
  'share_days_h',
  'attributed_acts_n',
  'home_acts_n',
  'ambiguous_acts_n',
  'unpriced_acts_n',
  'other_acts_n',
  'band_permille',
  'act_floor',
  'counts_reconcile',
  'shares_reconcile',
  'withheld_reason',
]);

export const LINE_ACTIVITY_LIMITS_TEXT = Object.freeze(
  `Up to ${LINE_ACTIVITY_BOUNDS.rows} person rows are rendered and up to ${LINE_ACTIVITY_BOUNDS.acts} acts are read; anything beyond is counted and printed as omitted, never silently dropped.`,
);
