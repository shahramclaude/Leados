import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { computeStats } from "@/lib/api/statsService";

export const dynamic = "force-dynamic";

/** Authenticated, business-level stats. For an unauthenticated ops heartbeat see /api/stats and /api/health. */
export const GET = withApi("leads:read", async (_req, { correlationId, rl }) => {
  try {
    const stats = await computeStats();
    return jsonOk(stats, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
