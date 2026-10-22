// Part 08 — shared model timeline. 24 months of seeded history ("actual")
// followed by 24 months of forward horizon ("forecast"), monthly grain.

// 36 months of history (3 full seasonal cycles) is the minimum needed for
// the seasonal-index estimation to be stable enough for rolling-origin
// backtesting (see backtest.ts / AI-SESSION-LOG.md calibration notes).
export const HISTORY_MONTHS = 36;
export const FORECAST_MONTHS = 24;
export const TOTAL_MONTHS = HISTORY_MONTHS + FORECAST_MONTHS;
export const START_YEAR = 2022;
export const START_MONTH = 1; // January

export function buildMonthLabels(count: number = TOTAL_MONTHS): string[] {
  const labels: string[] = [];
  let y = START_YEAR;
  let m = START_MONTH;
  for (let i = 0; i < count; i++) {
    labels.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return labels;
}

export const MONTHS = buildMonthLabels();

/** Index of the last actual (closed) month. Everything after this is forecast. */
export const CUTOVER_INDEX = HISTORY_MONTHS - 1;

/** Calendar month (1-12) for a given 0-based model index. */
export function monthOfYear(index: number): number {
  return ((START_MONTH - 1 + index) % 12) + 1;
}

export function monthIndexFromLabel(label: string): number {
  return MONTHS.indexOf(label);
}

export function isHistory(index: number): boolean {
  return index <= CUTOVER_INDEX;
}
