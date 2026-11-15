/**
 * app/core/domain/portfolioReviewRegistry.js — closed vocabularies, limits,
 * rights, verdicts and named frameworks of the Enterprise Portfolio Review
 * Register (Keep / Fix / Sell / Exit, ADR-0222, Schema v176, CSV #164,
 * `#/portfolio`).
 *
 * Pure leaf: zero imports, so schema, reader, actions, post-commit rule, CSV
 * export and view all share one vocabulary without cycle risk.
 *
 * THE DEFECT THIS REGISTER PREVENTS
 * ---------------------------------
 * A CEO or C-suite must periodically judge every business unit the enterprise
 * carries — keep it, fix it, sell it, or exit it — on dated evidence. Without
 * a dated portfolio ledger:
 *   - a business unit drifts for years with no recorded verdict, because no
 *     surface ever asked whether it should still be owned;
 *   - a "fix" verdict is pronounced and then forgotten — no dated re-review,
 *     no milestones, no escalation when the fix slips;
 *   - a sell/exit verdict names no expected proceeds, no expected date, and
 *     no execution track, so the exit is a press release, not a commitment;
 *   - a unit spanning two matrix lines is judged by whichever line shouts
 *     loudest, and the losing line's evidence is silently dropped;
 *   - a review older than the declared cadence is treated as current, so a
 *     stale verdict reads as a live one.
 */

export const PRV_ENGINE_VERSION = 'portfolio-review-2026.11-v1';
export const PRV_RULE_ID = 'RULE-PRV-01';
export const PRV_ROUTE = '#/portfolio';
export const PRV_CSV_SCOPE = 'portfolio-review';

export const PRV_RIGHTS = Object.freeze({
  READ: 'read-portfolio',
  DECLARE: 'declare-portfolio',
  REVIEW: 'review-portfolio',
  VERDICT: 'verdict-portfolio',
  TRACK: 'track-portfolio',
});

export const PRV_SETTING_KEYS = Object.freeze({
  reviewDays: 'portfolioReviewDays',
  autoPropagate: 'portfolioAutoPropagate',
});

export const PRV_DEFAULTS = Object.freeze({
  reviewDays: 90,
  autoPropagate: true,
});

export const PRV_BOUNDS = Object.freeze({
  reviewDays: Object.freeze({ min: 7, max: 365 }),
});

export const PRV_LIMITS = Object.freeze({
  unitsMax: 500,
  reviewsMax: 4000,
  verdictsMax: 2000,
  milestonesMax: 6000,
  markersMax: 2000,
  idMax: 96,
  personIdMax: 96,
  evidenceIdMax: 120,
  labelMin: 3,
  labelMax: 120,
  basisMin: 24,
  basisMax: 600,
  rationaleMin: 24,
  rationaleMax: 600,
  reasonMin: 24,
  reasonMax: 600,
  noteMax: 400,
  centsMax: 9_000_000_000_000_000,
  dayMin: '1970-01-01',
  dayMax: '2200-12-31',
  asksPerCommit: 4,
  askDueReviewDays: 5,
  askDueVerdictDays: 5,
  askDueSlippageDays: 5,
});

export const PRV_EVIDENCE_KINDS = Object.freeze([
  Object.freeze({ key: 'case', label: 'Operational case' }),
  Object.freeze({ key: 'investment-case', label: 'Investment case appraisal' }),
  Object.freeze({ key: 'decision', label: 'Logged leadership decision' }),
  Object.freeze({ key: 'document', label: 'Written instrument or board paper' }),
  Object.freeze({ key: 'goal', label: 'Goal or OKR' }),
]);
export const PRV_EVIDENCE_KIND_KEYS = Object.freeze(PRV_EVIDENCE_KINDS.map((row) => row.key));
const EVIDENCE_BY_KEY = new Map(PRV_EVIDENCE_KINDS.map((row) => [row.key, row]));
export const prvEvidenceByKey = (key) => EVIDENCE_BY_KEY.get(key) || null;

/**
 * Four mutually exclusive, exhaustive portfolio verdicts. A verdict is a
 * CEO/C-suite judgement recorded with a dated rationale; the register never
 * derives one from a score.
 */
export const PRV_VERDICTS = Object.freeze([
  Object.freeze({
    key: 'keep',
    label: 'Keep',
    says: 'The unit stays in the portfolio on the strength of the dated review; the next review is due on the declared cadence.',
  }),
  Object.freeze({
    key: 'fix',
    label: 'Fix',
    says: 'The unit stays for now under a dated improvement commitment with a declared re-review date; milestones track the fix.',
  }),
  Object.freeze({
    key: 'sell',
    label: 'Sell',
    says: 'The unit is offered for sale; expected proceeds and an expected date are declared and tracked to completion.',
  }),
  Object.freeze({
    key: 'exit',
    label: 'Exit',
    says: 'The unit is wound down or closed; expected proceeds (if any) and an expected date are declared and tracked to completion.',
  }),
]);
export const PRV_VERDICT_KEYS = Object.freeze(PRV_VERDICTS.map((row) => row.key));
const VERDICT_BY_KEY = new Map(PRV_VERDICTS.map((row) => [row.key, row]));
export const prvVerdictByKey = (key) => VERDICT_BY_KEY.get(key) || null;

/**
 * Eight mutually exclusive, exhaustive derived unit states, evaluated in fixed
 * precedence on read and never stored on the row.
 */
export const PRV_UNIT_STATES = Object.freeze([
  Object.freeze({
    key: 'unmeasurable',
    rank: 1,
    tone: 'bad',
    label: 'Unmeasurable — graph or unit error',
    says: 'The live matrix graph or the unit row could not be resolved; the portfolio reading is refused rather than guessed.',
  }),
  Object.freeze({
    key: 'unreviewed',
    rank: 2,
    tone: 'bad',
    label: 'No review on record',
    says: 'A declared business unit with zero dated reviews; it has never been judged on evidence.',
  }),
  Object.freeze({
    key: 'review-overdue',
    rank: 3,
    tone: 'bad',
    label: 'Review overdue',
    says: 'The latest review is older than the declared cadence; any verdict resting on it is stale and named as such.',
  }),
  Object.freeze({
    key: 'verdict-pending',
    rank: 4,
    tone: 'warn',
    label: 'Reviewed, verdict pending',
    says: 'A current review exists but no CEO/C-suite verdict has been recorded against it.',
  }),
  Object.freeze({
    key: 'keep',
    rank: 5,
    tone: 'good',
    label: 'Keep — current',
    says: 'The latest verdict is keep and the review it rests on is inside the declared cadence.',
  }),
  Object.freeze({
    key: 'fix',
    rank: 6,
    tone: 'warn',
    label: 'Fix — under commitment',
    says: 'The latest verdict is fix; milestone progress and the re-review date are tracked, never assumed.',
  }),
  Object.freeze({
    key: 'sell',
    rank: 7,
    tone: 'warn',
    label: 'Sell — in execution',
    says: 'The latest verdict is sell; expected proceeds, expected date and milestone progress are tracked.',
  }),
  Object.freeze({
    key: 'exit',
    rank: 8,
    tone: 'warn',
    label: 'Exit — in execution',
    says: 'The latest verdict is exit; expected proceeds, expected date and milestone progress are tracked.',
  }),
]);
const UNIT_STATE_BY_KEY = new Map(PRV_UNIT_STATES.map((row) => [row.key, row]));
export const prvUnitStateByKey = (key) => UNIT_STATE_BY_KEY.get(key) || null;

export const PRV_MILESTONE_STATES = Object.freeze([
  Object.freeze({ key: 'done', tone: 'good', label: 'Done' }),
  Object.freeze({ key: 'overdue', tone: 'bad', label: 'Overdue' }),
  Object.freeze({ key: 'open', tone: 'warn', label: 'Open' }),
]);

export const PRV_CONDITION_KINDS = Object.freeze({
  REVIEW_OVERDUE: 'review-overdue',
  VERDICT_PENDING: 'verdict-pending',
  EXECUTION_SLIPPAGE: 'execution-slippage',
});

export const PRV_MARKER_REASONS = Object.freeze({
  NO_JOINT_APEX: 'no-joint-apex',
  HOLDER_OFF_ROSTER: 'holder-off-roster',
  OWNER_OFF_ROSTER: 'owner-off-roster',
});

export const PRV_FRAMEWORKS = Object.freeze([
  Object.freeze({
    id: 'bcg-1970',
    citation: 'Henderson, B. D. & Boston Consulting Group (1970, Perspectives on Experience; Growth-Share Matrix)',
    principle: 'Portfolio balance: relative market share against market growth places each business unit (star, cash cow, question mark, dog) so capital and attention flow to where they compound.',
  }),
  Object.freeze({
    id: 'rumelt-2011',
    citation: 'Rumelt, R. P. (2011, Good Strategy Bad Strategy — the Kernel)',
    principle: 'Diagnosis, guiding policy, coherent actions: a portfolio verdict is a guiding policy with dated actions, not a preference.',
  }),
  Object.freeze({
    id: 'porter-1980',
    citation: 'Porter, M. E. (1980, Competitive Strategy — Five Forces)',
    principle: 'Industry attractiveness bounds what any unit can earn; a keep verdict without an attractiveness reading is a hope, not a policy.',
  }),
  Object.freeze({
    id: 'simons-1995',
    citation: 'Simons, R. (1995, Levers of Control — Interactive Control Systems)',
    principle: 'Strategic uncertainty is governed interactively: the verdict, its milestones and its re-review date are the control system, not a report.',
  }),
  Object.freeze({
    id: 'jaques-1989',
    citation: 'Jaques, E. (1989, Requisite Organization)',
    principle: 'Stratum-appropriate accountability: only the stratum that owns the portfolio may judge it; a director may prepare the evidence, never the verdict.',
  }),
]);

export const PRV_CSV_COLUMNS = Object.freeze([
  'as_of',
  'engine_version',
  'row_kind',
  'currency',
  'units_live_total',
  'units_retired_total',
  'units_keep',
  'units_fix',
  'units_sell',
  'units_exit',
  'units_verdict_pending',
  'units_review_overdue',
  'units_unreviewed',
  'units_unmeasurable',
  'reviews_total',
  'verdicts_total',
  'milestones_open',
  'milestones_done',
  'milestones_overdue',
  'money_measured_cents',
  'money_expected_proceeds_cents',
  'counts_reconcile',
  'figures_complete',
  'incomplete_reasons',
]);

export const PRV_CSV_DESCRIPTOR = Object.freeze({
  key: PRV_CSV_SCOPE,
  label: 'Enterprise portfolio review summary (aggregate)',
  group: 'governance',
  sensitive: true,
  filenameSlug: 'portfolio-review',
  description: 'One workspace control row (unit verdict states, review and verdict counts, milestone states) plus one currency row per declared currency (exact integer cents for measured value and expected proceeds) and the register’s two separate claims. No person, unit name, line holder, rationale, or evidence reference crosses this boundary.',
});
