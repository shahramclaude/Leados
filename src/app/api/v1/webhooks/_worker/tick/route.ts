import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { requireAdmin } from "@/lib/api/auth";
import { processDueDeliveries } from "@/lib/webhooks/worker";

export const dynamic = "force-dynamic";

/**
 * Admin-only: processes every webhook delivery/retry that is currently due.
 * In production this is a cron/queue worker; exposing a manual tick is useful
 * for ops and for deterministic tests, which is exactly why it is gated to
 * the 'admin' scope — see docs/API.md "Security notes" and Phase 5 below.
 */
export const POST = withApi("admin", async (_req, { correlationId, key, rl }) => {
  try {
    requireAdmin(key);
    const processed = await processDueDeliveries();
    return jsonOk({ processed }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
