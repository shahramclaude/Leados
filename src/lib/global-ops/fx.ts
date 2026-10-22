// LEADOS — Part 37: multi-currency translation engine.
//
// Standard applied (documented per the honesty rule — this is the mapping the engine enforces,
// it is not configurable per-call so every figure in the system is translated consistently):
//   - Balance sheet (BS) monetary items -> CLOSING rate (rate at period end)
//   - Profit & loss (PL) items          -> AVERAGE rate for the period
//   - Equity (EQ) items                 -> HISTORICAL rate (rate at the date the equity
//                                           instrument/transaction originated)
// Rates are never invented: `translate()` throws `FxRateMissingError` rather than defaulting to
// 1.0 or reusing a stale rate when no matching rate row exists for the requested
// (base, quote, fiscalYear, fiscalPeriod, method) tuple. Every FX rate carries `rateDate` and
// `rateSource` (provenance) and rates are versioned per fiscal period, never mutated in place.

import type { FxRateRecord, Money, StatementType, TranslationMethod } from "./types";
import { round2 } from "./types";

export class FxRateMissingError extends Error {
  constructor(
    public readonly baseCurrency: string,
    public readonly quoteCurrency: string,
    public readonly fiscalYear: number,
    public readonly fiscalPeriod: number,
    public readonly method: TranslationMethod,
  ) {
    super(
      `No FX rate on file for ${baseCurrency}->${quoteCurrency} (method=${method}) in FY${fiscalYear} P${fiscalPeriod}. ` +
        `Refusing to default to 1.0 or reuse a stale rate — add a rate row with provenance.`,
    );
    this.name = "FxRateMissingError";
  }
}

/** Per the documented standard above: which translation method applies to a given statement. */
export function methodForStatement(statement: StatementType): TranslationMethod {
  if (statement === "BS") return "closing";
  if (statement === "PL") return "average";
  return "historical";
}

export function findRate(
  rates: FxRateRecord[],
  baseCurrency: string,
  quoteCurrency: string,
  fiscalYear: number,
  fiscalPeriod: number,
  method: TranslationMethod,
): FxRateRecord | undefined {
  return rates.find(
    (r) =>
      r.baseCurrency === baseCurrency &&
      r.quoteCurrency === quoteCurrency &&
      r.fiscalYear === fiscalYear &&
      r.fiscalPeriod === fiscalPeriod &&
      r.method === method,
  );
}

/** Translate a Money value into `toCurrency` using the rate table. Same-currency amounts pass
 * through unchanged but are still annotated (method: "none", rateSource: "identity") so the UI
 * never has to guess whether a figure was translated. */
export function translate(
  money: Money,
  toCurrency: string,
  rates: FxRateRecord[],
  fiscalYear: number,
  fiscalPeriod: number,
  method: TranslationMethod,
): Money {
  if (money.currency === toCurrency) {
    return {
      value: money.value,
      currency: toCurrency,
      rateDate: "n/a",
      rateSource: "identity (same currency, no translation required)",
      method: "none",
    };
  }
  const rateRec = findRate(rates, money.currency, toCurrency, fiscalYear, fiscalPeriod, method);
  if (!rateRec) {
    throw new FxRateMissingError(money.currency, toCurrency, fiscalYear, fiscalPeriod, method);
  }
  return {
    value: round2(money.value * rateRec.rate),
    currency: toCurrency,
    rateDate: rateRec.rateDate,
    rateSource: rateRec.rateSource,
    method,
  };
}

export interface FxVarianceDecomposition {
  /** Effect of the FX rate changing, holding the local-currency value constant at the basis
   * period's value. */
  rateEffect: number;
  /** Effect of the local-currency value changing, holding the FX rate constant at the basis
   * period's rate. */
  volumeEffect: number;
  /** Residual/cross term: both rate and volume moved together. rateEffect + volumeEffect +
   * mixEffect always sums exactly to totalVariance — no hidden remainder. */
  mixEffect: number;
  totalVariance: number;
  basisGroupValue: number;
  currentGroupValue: number;
}

/** Decomposes the period-over-period change in a translated (group-currency) figure into the
 * portion caused by FX rate movement vs. the portion caused by the underlying local-currency
 * amount changing. Used in variance analysis so a currency swing is never mistaken for
 * operating performance, or vice versa. */
export function decomposeFxVariance(
  basis: { localValue: number; rate: number },
  current: { localValue: number; rate: number },
): FxVarianceDecomposition {
  const basisGroupValue = round2(basis.localValue * basis.rate);
  const currentGroupValue = round2(current.localValue * current.rate);
  const totalVariance = round2(currentGroupValue - basisGroupValue);
  const rateEffect = round2(basis.localValue * (current.rate - basis.rate));
  const volumeEffect = round2((current.localValue - basis.localValue) * basis.rate);
  const mixEffect = round2(totalVariance - rateEffect - volumeEffect);
  return { rateEffect, volumeEffect, mixEffect, totalVariance, basisGroupValue, currentGroupValue };
}
