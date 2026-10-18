// src/app/api/autonomous/run/route.ts
//
// Autonomous/cron entry point. Previously (per the task brief) this route
// only triggered evaluateRules(); it now runs the full orchestration
// pipeline (rules -> beliefs -> causal chains -> fusion -> predictive
// scoring -> decision health -> knowledge graph -> narratives -> scenarios)
// and caches the unified result, exactly like POST /api/orchestrate. The
// CRON_SECRET bearer-token auth is preserved.
import { db } from "@/db";
import { cacheOrchestratorResult, runFullOrchestration } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // No secret configured: fail closed rather than silently allowing
    // unauthenticated autonomous runs.
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  const headerSecret = request.headers.get("x-cron-secret");
  return bearerToken === expected || headerSecret === expected;
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runFullOrchestration(db, new Date());
    await cacheOrchestratorResult(db, result);
    return Response.json({
      ok: true,
      generatedAt: result.generatedAt,
      orgHealthScore: result.orgHealthScore,
      timings: result.timings,
      findingsCount: result.intelligence.ruleEvaluation.findings.length,
      narrativesCount: result.narratives.narratives.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/autonomous/run] unexpected failure: ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  // Convenience alias so cron providers that only support GET pings can
  // still trigger a run; same auth requirement applies.
  return POST(request);
}
