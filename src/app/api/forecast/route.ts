import { NextRequest } from "next/server";
import { resolveDemoTenantId } from "@/lib/demoTenant";
import { tenantHeadcountAndRisk } from "@/db/repositories/people";
import { getForecast, QueueFullError, forecastQueueStats } from "@/lib/forecastCache";
import { hashInputs } from "@/lib/hash";

export const dynamic = "force-dynamic";

const SCENARIOS: Record<string, { replications: number; horizonWeeks: number }> = {
  baseline: { replications: 800, horizonWeeks: 26 },
  "shock-attrition-spike": { replications: 800, horizonWeeks: 26 },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const scenarioKey = searchParams.get("scenario") ?? "baseline";
  const scenario = SCENARIOS[scenarioKey] ?? SCENARIOS.baseline;

  const tenantId = await resolveDemoTenantId();
  const { headcount, avgRisk } = await tenantHeadcountAndRisk(tenantId);

  const inputsHash = hashInputs({ headcount, avgRisk: avgRisk.toFixed(3), ...scenario, scenarioKey });

  try {
    const result = await getForecast({
      tenantId,
      scenarioKey,
      inputsHash,
      headcount,
      avgRisk,
      horizonWeeks: scenario.horizonWeeks,
      replications: scenario.replications,
    });

    return Response.json(
      {
        scenarioKey,
        headcount,
        avgRisk,
        final: result.value.final,
        series: result.value.series,
        stale: result.stale,
        staleForMs: result.staleForMs,
        computeMs: result.computeMs,
        queueDepth: result.queueDepth,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof QueueFullError) {
      return Response.json(
        {
          error: "compute saturated",
          message: "The forecast engine is at capacity. No cached result is available yet for this scenario.",
          queue: forecastQueueStats(),
        },
        { status: 503, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }
}
