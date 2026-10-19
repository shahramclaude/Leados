// Central pipeline orchestrator.
//
// Before Part 5, this pipeline only ran the inference layer (hypotheses) and
// the innovation portfolio scorer — it never touched scenarios, wargaming or
// real options, so the strategic layer was effectively disconnected from the
// rest of the system. This file now adds `runStrategicIntelligence` as a
// first-class pipeline stage.

import { db } from "@/db";
import { decisions as decisionsTable, events as eventsTable, hypotheses as hypothesesTable, innovationPortfolioItems, metricValues as metricValuesTable } from "@/db/schema";
import { updateAllHypotheses, type HypothesisUpdate } from "./hypothesis";
import { scorePortfolio, type PortfolioSummary } from "./innovationPortfolio";
import { runStrategicIntelligence, type StrategicIntelligenceReport } from "./strategicIntelligence";

export interface OrchestratorResult {
  hypotheses: HypothesisUpdate[];
  innovationPortfolio: PortfolioSummary;
  strategicIntelligence: StrategicIntelligenceReport;
  generatedAt: string;
}

/**
 * Run the full cross-engine pipeline once. Intended to be called from a
 * scheduled job or an on-demand API route (see /api/strategic).
 */
export async function runOrchestratorPipeline(now: Date = new Date()): Promise<OrchestratorResult> {
  const [decisions, events, metrics, hypothesisRows, portfolioRows] = await Promise.all([
    db.select().from(decisionsTable),
    db.select().from(eventsTable),
    db.select().from(metricValuesTable),
    db.select().from(hypothesesTable),
    db.select().from(innovationPortfolioItems),
  ]);

  const hypotheses = updateAllHypotheses(hypothesisRows, events, now);
  const innovationPortfolio = scorePortfolio(portfolioRows);

  // NEW in Part 5: the strategic intelligence layer is now a pipeline stage,
  // not a standalone, manually-triggered report.
  const strategicIntelligence = await runStrategicIntelligence(decisions, events, metrics, now);

  return {
    hypotheses,
    innovationPortfolio,
    strategicIntelligence,
    generatedAt: now.toISOString(),
  };
}
