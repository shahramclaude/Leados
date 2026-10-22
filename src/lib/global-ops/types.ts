// LEADOS — Part 37: shared types for entity hierarchy, multi-currency and fiscal plurality.
//
// Provenance note: Part 08 (finance model), Part 15 (i18n/tenancy) and Part 29 (obligations
// tracker) are referenced by the brief for this part, but their source files are not present in
// this repository snapshot (only the base Next.js/Drizzle starter exists here). Rather than
// silently invent behaviour that contradicts work we cannot read, every module in
// `src/lib/global-ops/*` is written as a self-contained, clearly-labelled extension point:
// it defines the contracts those parts are expected to expose (Money, format(), obligation
// scoping) so that when the real Part 08/15/29 modules are merged in, this code can be rewired
// to import from them instead of re-declaring the shapes locally. This is documented again in
// AI-SESSION-LOG.md.

export type CurrencyCode = string; // ISO 4217, e.g. "USD", "EUR", "GBP"

export type TranslationMethod = "closing" | "average" | "historical" | "none";

/** Money is never a bare number: every figure that can cross a currency boundary carries
 * provenance for how it got there. `rateDate`/`rateSource` are required on any translated
 * amount; `method === "none"` is used when no translation was necessary (same currency). */
export interface Money {
  value: number;
  currency: CurrencyCode;
  rateDate?: string;
  rateSource?: string;
  method?: TranslationMethod;
}

export type ConsolidationMethod = "full" | "proportional" | "equity";

export type FiscalCalendarType = "calendar" | "445" | "544" | "454" | "custom";

export interface CustomFiscalPeriodConfig {
  label: string;
  startDate: string;
  endDate: string;
}

export interface FiscalCalendarConfig {
  yearStartMonth?: number; // 1-12, default 1
  weekStartsOn?: number; // 0=Sun..6=Sat, default 1 (Monday)
  periods?: CustomFiscalPeriodConfig[]; // required when fiscalCalendarType === "custom"
}

export interface EntityRecord {
  id: number;
  groupId: number;
  parentEntityId: number | null;
  code: string;
  legalName: string;
  jurisdictionCode: string;
  region: string;
  functionalCurrency: CurrencyCode;
  ownershipPct: number; // % of this entity owned by its immediate parent (100 = wholly owned)
  consolidationMethod: ConsolidationMethod; // how this entity rolls into its immediate parent
  fiscalCalendarType: FiscalCalendarType;
  fiscalCalendarConfig: FiscalCalendarConfig;
  timezone: string;
  localeTag: string;
  isActive: boolean;
}

export interface EntityGroupRecord {
  id: number;
  code: string;
  name: string;
  groupCurrency: CurrencyCode;
}

export interface UnitRecord {
  id: number;
  entityId: number;
  code: string;
  name: string;
}

export interface FxRateRecord {
  baseCurrency: string;
  quoteCurrency: string;
  rateDate: string;
  rate: number;
  method: TranslationMethod;
  rateSource: string;
  fiscalYear: number;
  fiscalPeriod: number;
}

export type StatementType = "BS" | "PL" | "EQ";

export interface FinancialLine {
  entityId: number;
  fiscalYear: number;
  fiscalPeriod: number;
  statement: StatementType;
  accountCode: string;
  accountLabel: string;
  amountValue: number;
  amountCurrency: string;
  isIntercompany: boolean;
  counterpartyEntityId: number | null;
}

export interface EliminationEntry {
  fromEntityId: number;
  accountCode: string;
  amountValue: number;
  amountCurrency: string;
  reason: string;
  toEntityId: number;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
