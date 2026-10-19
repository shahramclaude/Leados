// src/lib/scenarioEngine.ts
//
// PROVENANCE NOTE: the full scenario engine (Part 2/3 scope) is not present
// in this sandbox. Part 5 only needs the metric metadata for a handful of
// financial metrics, so this file is a minimal reconstruction limited to
// that subset (`burnRate`, `cashBalance`, `runwayMonths`) plus the generic
// shape later parts are expected to extend. Nothing here is copied from a
// pre-existing scenarioEngine.ts because none existed in this repo.

export interface MetricDefinition {
  key: string;
  label: string;
  unit: string;
  category: string;
  description: string;
  /** Design default used when no observed value exists yet. */
  defaultValue: number;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  burnRate: {
    key: "burn_rate",
    label: "Monthly Burn Rate",
    unit: "USD/mo",
    category: "financial",
    description:
      "Net cash spent per month (gross burn minus revenue collected).",
    defaultValue: 150_000,
  },
  cashBalance: {
    key: "cash_balance",
    label: "Cash Balance",
    unit: "USD",
    category: "financial",
    description: "Cash and cash equivalents currently held by the company.",
    defaultValue: 1_800_000,
  },
  runwayMonths: {
    key: "runway_months",
    label: "Runway",
    unit: "months",
    category: "financial",
    description:
      "Months until cash balance reaches zero at current burn/revenue trajectory.",
    defaultValue: 12,
  },
};
