// POST /api/autonomous/run
//
// Entry point the external scheduler (cron) hits to advance the autonomous
// agent by one full 10-step intelligence cycle. See schedule.ts for the
// cadence configuration and src/lib/agentLoop.ts for the cycle itself.
//
// Auth: a bearer token / header must match process.env.CRON_SECRET. If
// CRON_SECRET is not configured (e.g. local dev), the request is allowed
// through with a console warning so the loop remains testable.

import { db } from "@/db";
import { loadPreviousResult, runAgentCycle } from "@/lib/agentLoop";
import { DEFAULT_AGENT_CONFIG } from "../../../../../schedule";

export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    // eslint-disable-next-line no-console
    console.warn("[autonomous/run] CRON_SECRET is not set — allowing request without auth.");
    return true;
  }

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const headerSecret = req.headers.get("x-cron-secret");

  return bearerToken === cronSecret || headerSecret === cronSecret;
}

export async function POST(req: Request) {
  const requestStart = Date.now();

  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const now = new Date();
    const previousResult = await loadPreviousResult(db);

    const result = await runAgentCycle({
      db,
      now,
      previousResult,
      config: DEFAULT_AGENT_CONFIG,
    });

    const requestDurationMs = Date.now() - requestStart;
    // eslint-disable-next-line no-console
    console.log(
      `[autonomous/run] cycle=${result.cycleId} status=${result.status} orgHealth=${result.brainFindings.orgHealthScore} cycleDurationMs=${result.totalDurationMs} requestDurationMs=${requestDurationMs}`,
    );

    return Response.json({
      ok: true,
      requestDurationMs,
      result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[autonomous/run] fatal error running agent cycle:", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Convenience GET alias for manual trigger during development/testing. */
export async function GET(req: Request) {
  return POST(req);
}
