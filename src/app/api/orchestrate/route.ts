// src/app/api/orchestrate/route.ts
//
// POST: runs the full orchestration pipeline (src/lib/orchestrator.ts),
//       persists the result to orchestrator_cache, and returns it.
// GET:  returns the most recently cached orchestration result. If none
//       exists yet (first boot), runs the pipeline once to seed the cache
//       so callers never have to special-case an empty response.
import { db } from "@/db";
import { cacheOrchestratorResult, getLatestOrchestratorResult, runFullOrchestration } from "@/lib/orchestrator";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runFullOrchestration(db, new Date());
    await cacheOrchestratorResult(db, result);
    return Response.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/orchestrate][POST] unexpected failure: ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cached = await getLatestOrchestratorResult(db);
    if (cached) {
      return Response.json({ ok: true, result: cached, cached: true });
    }
    const result = await runFullOrchestration(db, new Date());
    await cacheOrchestratorResult(db, result);
    return Response.json({ ok: true, result, cached: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[api/orchestrate][GET] unexpected failure: ${message}`);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
