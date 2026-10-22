// Part 08 — seeded historical "actuals" for the behavioural (non-headcount)
// drivers. Headcount actuals live in `src/lib/org/costBridge.ts` (the Part
// 06 org-twin stand-in). Everything here is deterministic (seeded PRNG) so
// reconciliation tests, the forecast backtest, and the citation check are
// reproducible across runs.
//
// Each series covers exactly HISTORY_MONTHS (24) months and is tagged
// "actual" confidence when read into the model.

import { HISTORY_MONTHS, monthOfYear } from "./timeline";
import { mulberry32 } from "./montecarlo";

function seededSeries(
  seed: number,
  start: number,
  end: number,
  opts: { noise?: number; seasonalAmp?: number; seasonalPeakMonth?: number; floor?: number; ceil?: number } = {},
): number[] {
  const rng = mulberry32(seed);
  const { noise = 0.02, seasonalAmp = 0, seasonalPeakMonth = 11, floor = -Infinity, ceil = Infinity } = opts;
  const out: number[] = [];
  for (let i = 0; i < HISTORY_MONTHS; i++) {
    const trend = start + ((end - start) * i) / (HISTORY_MONTHS - 1);
    const moy = monthOfYear(i);
    const phase = ((moy - seasonalPeakMonth + 12) % 12) / 12;
    const seasonal = seasonalAmp * Math.cos(2 * Math.PI * phase);
    const n = (rng() - 0.5) * 2 * noise * Math.abs(trend || 1);
    const v = trend * (1 + seasonal) + n;
    out.push(Math.min(ceil, Math.max(floor, v)));
  }
  return out;
}

/** Deals closed per sales rep per month. Dips in Dec/Jan (holidays), peaks
 * around fiscal-quarter close (Mar/Jun/Sep/Dec push, modeled as a single
 * annual peak near Nov-Dec for simplicity of a one-cycle seasonal index). */
export const PRODUCTIVITY_PER_REP = seededSeries(201, 1.05, 1.55, {
  noise: 0.06,
  seasonalAmp: 0.12,
  seasonalPeakMonth: 12,
  floor: 0.4,
});

/** Win rate (0-1). Slow improvement from better sales enablement. */
export const WIN_RATE = seededSeries(202, 0.19, 0.27, { noise: 0.04, seasonalAmp: 0.03, seasonalPeakMonth: 12, floor: 0.08, ceil: 0.45 });

/** Average sales cycle length in days. Trending down (process improvements). */
export const CYCLE_TIME_DAYS = seededSeries(203, 54, 39, { noise: 0.03, seasonalAmp: 0.05, seasonalPeakMonth: 6, floor: 25 });

/** Monthly logo+revenue churn rate (0-1) on the subscription base. Improves
 * as onboarding and CS investment compound. */
export const CHURN_RATE_MONTHLY = seededSeries(204, 0.024, 0.012, { noise: 0.08, seasonalAmp: 0.1, seasonalPeakMonth: 1, floor: 0.006, ceil: 0.05 });

/** Core platform subscription price, $/customer/month. Two step price
 * increases are baked in around month 9 and month 18 (noise stays low). */
export const PRICE_CORE = (() => {
  const base = seededSeries(205, 640, 640, { noise: 0.01 });
  return base.map((v, i) => {
    if (i >= 18) return v * 1.12;
    if (i >= 9) return v * 1.06;
    return v;
  });
})();

/** Professional-services average project fee, $ per project delivered. */
export const PRICE_SERVICES = seededSeries(206, 16500, 19500, { noise: 0.05, seasonalAmp: 0.04, seasonalPeakMonth: 11 });

/** Services projects delivered per month (volume for the services segment),
 * driven loosely by new-customer onboarding but seeded independently here
 * for simplicity; the model still treats it as an observed driver. */
export const SERVICES_PROJECTS = seededSeries(207, 3, 7, { noise: 0.15, seasonalAmp: 0.1, seasonalPeakMonth: 11, floor: 0 });

/** Non-headcount marketing/program spend, $/month. */
export const SM_PROGRAM_SPEND = seededSeries(208, 9000, 34000, { noise: 0.1, seasonalAmp: 0.08, seasonalPeakMonth: 11, floor: 0 });

/** Hosting/infra cost per active customer per month (COGS driver). Falls
 * slowly with scale efficiencies. */
export const HOSTING_COST_PER_CUSTOMER = seededSeries(209, 46, 29, { noise: 0.05, floor: 15 });

/** Direct delivery cost rate for services (fraction of services revenue
 * consumed by delivery cost, e.g. contractor pass-through). */
export const SERVICES_COST_RATE = seededSeries(210, 0.58, 0.49, { noise: 0.03, floor: 0.3, ceil: 0.85 });

/** Other (non-headcount) G&A spend, $/month: rent, insurance, software, etc. */
export const OTHER_GA_SPEND = seededSeries(211, 7000, 15000, { noise: 0.06, floor: 0 });

/** Monthly capex, $. Mostly laptops/equipment scaling with headcount. */
export const CAPEX_MONTHLY = seededSeries(212, 2200, 6800, { noise: 0.2, floor: 0 });

export const STARTING_CUSTOMERS = 36;
// Opening balance sheet is constructed to balance exactly:
//   cash + AR + PPE = AP + paidInCapital + retainedEarnings
//   3,317,000 + 95,000 + 180,000 = 42,000 + 4,200,000 + (-650,000) = 3,592,000
export const STARTING_PPE = 180_000;
export const STARTING_AR = 95_000;
export const STARTING_AP = 42_000;
export const STARTING_RETAINED_EARNINGS = -650_000;
export const STARTING_PAID_IN_CAPITAL = 4_200_000;
export const STARTING_CASH =
  STARTING_AP + STARTING_PAID_IN_CAPITAL + STARTING_RETAINED_EARNINGS - STARTING_AR - STARTING_PPE;
