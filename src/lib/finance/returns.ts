// Part 08 — DuPont decomposition + unit economics formulas.
// Pure calculators; callers (unitEconomics.ts, kpis.ts) wrap the outputs in
// `Explain<number>` with fact-ledger citations.

export interface DupontResult {
  roe: number;
  netMargin: number;
  assetTurnover: number;
  leverage: number;
}

/** ROE = netMargin x assetTurnover x leverage = (NI/Rev) x (Rev/Assets) x (Assets/Equity) = NI/Equity */
export function dupontROE(netIncome: number, revenue: number, assets: number, equity: number): DupontResult {
  const netMargin = revenue !== 0 ? netIncome / revenue : 0;
  const assetTurnover = assets !== 0 ? revenue / assets : 0;
  const leverage = equity !== 0 ? assets / equity : 0;
  return { roe: netMargin * assetTurnover * leverage, netMargin, assetTurnover, leverage };
}

/** LTV = ARPU x grossMargin / monthlyChurnRate (gross-profit lifetime value of an average customer). */
export function ltv(arpuMonthly: number, grossMarginFraction: number, churnRateMonthly: number): number {
  if (churnRateMonthly <= 0) return Infinity;
  return (arpuMonthly * grossMarginFraction) / churnRateMonthly;
}

/** CAC payback in months = CAC / (ARPU x grossMargin) */
export function paybackMonths(cac: number, arpuMonthly: number, grossMarginFraction: number): number {
  const monthlyGrossProfitPerCustomer = arpuMonthly * grossMarginFraction;
  if (monthlyGrossProfitPerCustomer <= 0) return Infinity;
  return cac / monthlyGrossProfitPerCustomer;
}

/** SaaS Magic Number = (ARR_now - ARR_priorQuarter) x 4 / S&M spend in the prior quarter. */
export function magicNumber(arrNow: number, arrPriorQuarter: number, smSpendPriorQuarter: number): number {
  if (smSpendPriorQuarter <= 0) return 0;
  return ((arrNow - arrPriorQuarter) * 4) / smSpendPriorQuarter;
}

export function grossMarginFraction(revenue: number, cogs: number): number {
  return revenue !== 0 ? (revenue - cogs) / revenue : 0;
}

export function ltvCacRatio(customerLtv: number, cac: number): number {
  return cac !== 0 ? customerLtv / cac : Infinity;
}
