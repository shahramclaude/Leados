/**
 * src/lib/orchestrator.ts
 *
 * Aggregates per-domain "OS" health scores into one OrchestratorResult. In
 * this codebase slice, only the Financial Intelligence OS (Part 6) has been
 * built, so `peopleHealthScore` and `strategicHealthScore` are explicitly
 * `null` placeholders (not fabricated numbers) until a People OS / Strategic
 * OS module exists. `overallHealthScore` averages whichever pillar scores
 * are actually available, so it degrades gracefully instead of pretending to
 * combine data that doesn't exist yet.
 */

export interface OrchestratorResult {
  financialHealthScore: number;
  peopleHealthScore: number | null;
  strategicHealthScore: number | null;
  overallHealthScore: number;
  pillarsIncluded: ("financial" | "people" | "strategic")[];
  generatedAt: string;
}

export function buildOrchestratorResult(params: {
  financialHealthScore: number;
  peopleHealthScore?: number | null;
  strategicHealthScore?: number | null;
}): OrchestratorResult {
  const { financialHealthScore, peopleHealthScore = null, strategicHealthScore = null } = params;

  const pillars: { name: "financial" | "people" | "strategic"; score: number | null }[] = [
    { name: "financial", score: financialHealthScore },
    { name: "people", score: peopleHealthScore },
    { name: "strategic", score: strategicHealthScore },
  ];

  const available = pillars.filter((p): p is { name: "financial" | "people" | "strategic"; score: number } =>
    typeof p.score === "number",
  );

  const overallHealthScore = available.length
    ? Math.round(available.reduce((sum, p) => sum + p.score, 0) / available.length)
    : 0;

  return {
    financialHealthScore,
    peopleHealthScore,
    strategicHealthScore,
    overallHealthScore,
    pillarsIncluded: available.map((p) => p.name),
    generatedAt: new Date().toISOString(),
  };
}
