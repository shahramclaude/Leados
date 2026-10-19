// Shared domain types inferred straight from the Drizzle schema so every
// engine (scenario, wargame, real options, monte carlo, strategic layer)
// speaks the same language.
import type { InferSelectModel } from "drizzle-orm";
import type {
  decisions,
  events,
  hypotheses,
  innovationPortfolioItems,
  metricValues,
  okrs,
  scenarios,
} from "@/db/schema";

export type Decision = InferSelectModel<typeof decisions>;
export type LeadosEvent = InferSelectModel<typeof events>;
export type MetricValue = InferSelectModel<typeof metricValues>;
export type ScenarioRow = InferSelectModel<typeof scenarios>;
export type OkrRow = InferSelectModel<typeof okrs>;
export type HypothesisRow = InferSelectModel<typeof hypotheses>;
export type InnovationPortfolioItem = InferSelectModel<typeof innovationPortfolioItems>;

export function toNumber(value: string | number | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}
