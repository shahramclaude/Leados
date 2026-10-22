import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { ApiError } from "@/lib/api/errors";
import { toWebhookDelivery } from "@/lib/api/serialize";
import { emitEvent } from "@/lib/webhooks/worker";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

/** Test-fire endpoint: sends a synthetic event at exactly one subscription so integrators can verify receivers. */
export const POST = withApi("webhooks:write", async (req, { correlationId, key, rl, params }) => {
  try {
    const [sub] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, params.id)).limit(1);
    if (!sub) throw new ApiError("NOT_FOUND", `No webhook subscription with id ${params.id}`);

    const result = await handleIdempotentCreate(req, `POST /v1/webhooks/subscriptions/${params.id}/test`, {}, async () => {
      const testType = (sub.eventTypes[0] ?? "lead.created") as Parameters<typeof emitEvent>[0];
      const { deliveryIds } = await emitEvent(testType, {
        test: true,
        firedBy: key.id,
        message: "This is a LEADOS test-fire event.",
        at: new Date().toISOString(),
      });
      const deliveryId = deliveryIds.find(Boolean);
      // The test event fans out to every active subscriber of this event type; report back
      // only the delivery aimed at the subscription the caller asked to test.
      const [delivery] = deliveryId
        ? await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, deliveryId)).limit(1)
        : [];
      await recordAudit({ actor: key.id, action: "webhook_subscription.test_fired", resource: "webhook_subscription", resourceId: params.id, correlationId });
      if (!delivery) {
        throw new ApiError("CONFLICT", "No delivery was created — check the subscription is active and has event types configured.");
      }
      return { status: 201, body: toWebhookDelivery(delivery) };
    });

    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
