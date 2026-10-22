import { listRisks, toSimulationInput } from "@/lib/risk";
import { simulatePortfolio, runCorrelationSensitivity, type CorrelationAssumption } from "@/lib/montecarlo";
import { db } from "@/db";
import { portfolioSimulationRuns } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let mode: "inherent" | "residual" = "residual";
  let correlation: CorrelationAssumption = "moderate";
  let trials = 10000;
  try {
    const body = await req.json();
    if (body?.mode === "inherent" || body?.mode === "residual") mode = body.mode;
    if (["independent", "moderate", "high", "comonotonic"].includes(body?.correlation)) correlation = body.correlation;
    if (body?.trials) trials = Math.min(Math.max(Number(body.trials), 1000), 50000);
  } catch {
    // defaults
  }

  const risks = await listRisks();
  const financial = risks.filter((r) => r.impact.kind === "lognormal").map(toSimulationInput);

  const summary = simulatePortfolio({ risks: financial, trials, mode, correlation, seedKey: `api-${Date.now()}` });
  const sensitivity = runCorrelationSensitivity(financial, Math.min(trials, 8000), mode, `api-sens-${Date.now()}`);

  await db.insert(portfolioSimulationRuns).values({
    trials,
    seed: 0,
    correlationAssumption: correlation,
    rho: summary.rho.toString(),
    summary: summary as unknown as Record<string, unknown>,
    sensitivity: sensitivity as unknown as Record<string, unknown>,
  });

  return Response.json({
    summary,
    sensitivity,
    tailDependenceCaveat:
      "Gaussian copula correlation structurally understates tail dependence. Treat P99/TVaR99 as a lower bound on true joint tail risk.",
    nonFinancialNote: "Categorical (non-financial) risks are excluded from this $ aggregate — see each risk's own page for their ordinal severity distribution.",
  });
}
