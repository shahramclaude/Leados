// Part 08 — Runway Cockpit calculations.
//
// netBurn_t = opex_t + cogs_t - revenue_t collected in cash terms. We
// approximate cash revenue using a collections lag (DSO) rather than
// accrual revenue, since the runway question is "do we run out of cash",
// not "are we profitable on paper". Burn is smoothed over a trailing
// window to avoid one noisy month swinging the headline number — this is
// the single biggest hidden assumption in this module (see AI-SESSION-LOG
// Phase 5 attack notes): if collections timing or churn shifts sharply in a
// single month, the trailing average will under/overstate true runway for
// a few months until it catches up.

export const BURN_SMOOTHING_WINDOW = 3;

export function trailingAverage(series: number[], index: number, window: number = BURN_SMOOTHING_WINDOW): number {
  const start = Math.max(0, index - window + 1);
  const slice = series.slice(start, index + 1);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export interface RunwayPoint {
  monthIndex: number;
  cash: number;
  netBurn: number;
  smoothedNetBurn: number;
  runwayMonths: number | null; // null = burn <= 0 (not burning, "infinite" runway)
}

export function computeRunwaySeries(cashSeries: number[], netBurnSeries: number[]): RunwayPoint[] {
  return cashSeries.map((cash, i) => {
    const smoothedNetBurn = trailingAverage(netBurnSeries, i);
    const runwayMonths = smoothedNetBurn > 0 ? cash / smoothedNetBurn : null;
    return { monthIndex: i, cash, netBurn: netBurnSeries[i], smoothedNetBurn, runwayMonths };
  });
}

/** Burn multiple = net burn / net new ARR added in the period. Lower is
 * more capital efficient. */
export function burnMultiple(netBurn: number, netNewArr: number): number {
  if (netNewArr <= 0) return Infinity;
  return netBurn / netNewArr;
}

export interface RunwayScenario {
  label: "P10" | "P50" | "P90";
  runwayMonths: number | null;
  endingCash: number[];
}

/** Builds P10/P50/P90 cash & runway scenarios from a burn Monte Carlo band
 * per month (already-computed bands from montecarlo.ts). P10 burn (worse
 * case, higher burn) -> shortest runway is reported as the P10 SCENARIO on
 * runway (we invert the burn percentile so "P10 runway" means "10% chance
 * runway is this short or shorter"). */
export function runwayScenariosFromBurnBands(
  startingCash: number,
  burnBandsByMonth: { p10: number; p50: number; p90: number }[],
): Record<"P10" | "P50" | "P90", RunwayScenario> {
  function build(pick: (b: { p10: number; p50: number; p90: number }) => number, label: "P10" | "P50" | "P90"): RunwayScenario {
    const endingCash: number[] = [];
    let cash = startingCash;
    let runwayMonths: number | null = null;
    for (let i = 0; i < burnBandsByMonth.length; i++) {
      const burn = pick(burnBandsByMonth[i]);
      cash -= burn;
      endingCash.push(cash);
      if (cash <= 0 && runwayMonths === null) {
        const priorCash = i === 0 ? startingCash : endingCash[i - 1];
        const frac = burn !== 0 ? priorCash / burn : 0;
        runwayMonths = i + frac;
      }
    }
    return { label, runwayMonths, endingCash };
  }

  return {
    // Worse case = higher burn = p90 of burn distribution -> shortest runway
    P10: build((b) => b.p90, "P10"),
    P50: build((b) => b.p50, "P50"),
    // Better case = lower burn = p10 of burn distribution -> longest runway
    P90: build((b) => b.p10, "P90"),
  };
}
