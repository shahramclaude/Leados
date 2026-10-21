import { getCorrelationId } from "@/lib/api/context";
import { ApiError } from "@/lib/api/errors";
import { toErrorResponse, jsonOk } from "@/lib/api/respond";
import { processDueDeliveries } from "@/lib/api/webhooks";

// Internal-only route (not part of the public spec — flagged `x-internal` in
// the OpenAPI document and excluded from docs/API.md's public endpoint
// table). Invoked by a scheduler (cron) with a shared secret, not by API
// tokens, which is why it bypasses `withApiRoute`'s token auth: it runs the
// exponential-backoff retry sweep over `webhook_deliveries` and promotes
// deliveries that exhaust `maxAttempts` to `dead_letter`.
export async function POST(req: Request) {
  const correlationId = getCorrelationId(req);
  try {
    const expected = process.env.WEBHOOK_WORKER_SECRET;
    const provided = req.headers.get("x-worker-secret");
    if (!expected || provided !== expected) {
      throw new ApiError("UNAUTHORIZED", "Missing or invalid worker secret.");
    }
    const result = await processDueDeliveries(50);
    return jsonOk(result, correlationId);
  } catch (err) {
    return toErrorResponse(err, correlationId);
  }
}
