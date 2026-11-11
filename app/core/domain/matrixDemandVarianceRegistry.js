/** app/core/domain/matrixDemandVarianceRegistry.js — constants for the Matrix Demand-Variance Early Warning reader (ADR-0173, Schema v137 unchanged, `#/matrix?panel=demand-variance`).

Closed vocabularies only: verdicts, conventions and frameworks are declared so
they can be argued with, never inferred.
 */

export const DEMAND_VARIANCE_ENGINE_VERSION = 'demand-variance-2026.11-v1';

/** Below this many open decisions in the window, flow figures are withheld. */
export const DEMAND_VARIANCE_MIN_DECISIONS = 3;

/** The largest window the reader will price, in days. */
export const DEMAND_VARIANCE_MAX_WINDOW_DAYS = 366;

/** A person-day is carried in the same unit as share-days: hundredths. */
export const HUNDREDTHS_PER_PERSON_DAY = 100;

export const DEMAND_VARIANCE_VERDICTS = Object.freeze([
  { key: 'within-ceiling', label: 'Within the declared share-days ceiling', tone: 'good', rank: 0 },
  { key: 'at-ceiling', label: 'At the declared share-days ceiling', tone: 'warn', rank: 1 },
  { key: 'over-ceiling', label: 'Over the declared share-days ceiling', tone: 'bad', rank: 2 },
  { key: 'ceiling-unprovable', label: 'Ceiling could not be priced', tone: 'bad', rank: 3 },
  { key: 'no-demand', label: 'No open demand on this line', tone: 'neutral', rank: 4 },
  { key: 'unassigned', label: 'Demand no line can own', tone: 'bad', rank: 5 },
  { key: 'ambiguous-line', label: 'Demand spans more than one line', tone: 'warn', rank: 6 },
  { key: 'unresolvable', label: 'Demand could not be traced to a roster person', tone: 'bad', rank: 7 },
]);

export const DEMAND_VARIANCE_BOUNDS = Object.freeze({
  minDecisionsForFlow: DEMAND_VARIANCE_MIN_DECISIONS,
  maxWindowDays: DEMAND_VARIANCE_MAX_WINDOW_DAYS,
});

export const DEMAND_VARIANCE_CONVENTIONS = Object.freeze([
  {
    label: 'One decision is counted once',
    detail: 'An open decision is attributed to exactly one declared line, or refused as unassigned, ambiguous-line or unresolvable. It is never split across lines and never folded into a single manager by default.',
  },
  {
    label: 'Demand is age-weighted',
    detail: 'An open decision that has sat in the queue for d days carries d decision-days of demand on the line it is attributable to. Older, unmade calls weigh more than fresh ones.',
  },
  {
    label: 'The ceiling is declared share-days',
    detail: "A line's ceiling is its declared share-days for the window, swept day by day from its own dated share timeline (ADR-0158) — never projected from today's share. An unprovable ceiling refuses the comparison.",
  },
  {
    label: 'Variance is not a person score',
    detail: 'A line over its ceiling is a capacity-and-queue signal about the structure, never a rating of the person or the manager. No individual is ranked.',
  },
  {
    label: 'Refusals are counted',
    detail: 'Every decision that cannot be attributed is printed in its refusal class with its reason; refused demand is never smoothed into a line total.',
  },
  {
    label: 'Two claims stay apart',
    detail: '"The rows add up" (countsReconcile) and "every figure shown is the computed figure" (figuresComplete) are printed as separate claims.',
  },
]);

export const DEMAND_VARIANCE_FRAMEWORKS = Object.freeze([
  {
    label: "Little's Law (Little, 1961)",
    detail: 'L = λ × W: average queue length equals arrival rate times average time in queue. Printed as a flow observation over the window, explicitly not a forecast, and withheld below the decision floor.',
  },
  {
    label: "Kingman's approximation (Kingman, 1961)",
    detail: 'Expected queueing delay under arrival and service variation. Withheld here: the workspace records no service-time distribution for decisions, so a Wq estimate would be invented. Refused rather than guessed.',
  },
  {
    label: 'Matrix accountability (ADR-0140)',
    detail: 'Demand is attributed through the canonical matrix graph — declared additional lines over the reporting tree — so cross-line overload is visible where a single-chain tree would hide it.',
  },
]);

export const DEMAND_VARIANCE_CSV_COLUMNS = Object.freeze([
  'scope', 'period_key', 'period_from', 'period_to', 'window_days',
  'decisions_n', 'attributed_n', 'unassigned_n', 'ambiguous_line_n', 'unresolvable_n',
  'lines_n', 'within_ceiling_n', 'at_ceiling_n', 'over_ceiling_n', 'ceiling_unprovable_n', 'no_demand_n',
  'demand_days', 'ceiling_days_h', 'variance_days_h', 'figures_complete', 'counts_reconcile',
  'flow_lambda_per_day', 'flow_mean_age_days', 'flow_implied_wip', 'flow_withheld',
  'refusal_reason',
]);

export function demandVarianceVerdict(key) {
  return DEMAND_VARIANCE_VERDICTS.find((v) => v.key === key) || DEMAND_VARIANCE_VERDICTS[0];
}
