// LEADOS — Part 37: locale-correct formatting, extended with fiscal-awareness.
//
// Part 15's i18n/tenancy `format.ts` is referenced by the brief but is not present in this
// repository snapshot. This module is written as the drop-in surface that extension was meant to
// have: all formatting goes through `Intl` (never hand-rolled string concatenation of currency
// symbols), keyed off the entity's `localeTag` so Group Consolidation/Entity Compare/Fiscal
// Calendar Matrix/Jurisdiction View all render locale-correct numbers, dates and currencies.

import type { Money, TranslationMethod } from "./types";

export function formatMoney(money: Pick<Money, "value" | "currency">, localeTag: string): string {
  return new Intl.NumberFormat(localeTag, {
    style: "currency",
    currency: money.currency,
    currencyDisplay: "symbol",
    maximumFractionDigits: 2,
  }).format(money.value);
}

export function formatNumber(value: number, localeTag: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(localeTag, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value0to100: number, localeTag: string, fractionDigits = 1): string {
  return new Intl.NumberFormat(localeTag, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value0to100 / 100);
}

export function formatDate(iso: string, localeTag: string): string {
  if (iso === "n/a") return iso;
  const [y, m, d] = iso.split("-").map((x) => Number.parseInt(x, 10));
  return new Intl.DateTimeFormat(localeTag, { year: "numeric", month: "short", day: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, (m || 1) - 1, d || 1)),
  );
}

export const METHOD_BADGE: Record<TranslationMethod, { label: string; title: string }> = {
  closing: { label: "CLOSE", title: "Translated at the closing (period-end) FX rate — balance sheet standard" },
  average: { label: "AVG", title: "Translated at the period-average FX rate — P&L standard" },
  historical: { label: "HIST", title: "Translated at the historical (transaction-date) FX rate — equity standard" },
  none: { label: "LOCAL", title: "No translation required — already in group currency" },
};

/** A figure's full provenance string, for tooltips/footnotes: never show a translated number
 * without being able to say exactly which rate, dated when, from where, produced it. */
export function rateProvenanceLabel(rateDate: string, rateSource: string, localeTag: string): string {
  if (rateDate === "n/a") return rateSource;
  return `${rateSource} · rate date ${formatDate(rateDate, localeTag)}`;
}

/** Fiscal-aware period label formatting: a plain fiscal period (e.g. "FY2025-P03 (4w)") is
 * rendered alongside its actual calendar date range in the viewer's locale, so "period 3" never
 * has to be mentally translated into a date range by the reader. */
export function formatFiscalPeriodLabel(label: string, startDate: string, endDate: string, localeTag: string): string {
  return `${label}: ${formatDate(startDate, localeTag)} – ${formatDate(endDate, localeTag)}`;
}
