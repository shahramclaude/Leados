/**
 * Fairness metrics over grouped binary outcomes (e.g. decision approvals
 * broken down by cohort). All metrics are bounded in [0, 1], are 0 when
 * groups are identical, and are symmetric under group relabeling/order.
 */

export interface GroupOutcomes {
  readonly group: string;
  /** Number of positive outcomes (e.g. approvals). */
  readonly positives: number;
  /** Total number of trials/decisions for this group. */
  readonly total: number;
}

export interface GroupConfusion extends GroupOutcomes {
  /** True positives among the positives (i.e. correctly approved). */
  readonly truePositives: number;
  /** Actual positive-label count (ground truth), for TPR computation. */
  readonly actualPositives: number;
}

function rate(positives: number, total: number): number {
  if (total < 0 || positives < 0 || positives > total) {
    throw new Error("Invalid group outcome counts");
  }
  return total === 0 ? 0 : positives / total;
}

/**
 * Demographic parity difference: max - min of the positive-outcome rate
 * across groups. 0 means perfect parity; 1 is maximal disparity.
 */
export function demographicParityDifference(
  groups: readonly GroupOutcomes[],
): number {
  if (groups.length === 0) return 0;
  const rates = groups.map((g) => rate(g.positives, g.total));
  return Math.max(...rates) - Math.min(...rates);
}

/** Demographic parity ratio (disparate-impact ratio): min/max rate, in [0,1]. */
export function demographicParityRatio(
  groups: readonly GroupOutcomes[],
): number {
  if (groups.length === 0) return 1;
  const rates = groups.map((g) => rate(g.positives, g.total));
  const max = Math.max(...rates);
  const min = Math.min(...rates);
  return max === 0 ? 1 : min / max;
}

/**
 * Equalized-odds difference: max gap in true-positive rate (recall) across
 * groups. Requires ground-truth labels (actualPositives), unlike
 * demographic parity which only needs the approval counts.
 */
export function equalizedOddsDifference(
  groups: readonly GroupConfusion[],
): number {
  if (groups.length === 0) return 0;
  const tprs = groups.map((g) => rate(g.truePositives, g.actualPositives));
  return Math.max(...tprs) - Math.min(...tprs);
}
