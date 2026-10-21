import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk } from "@/lib/api/respond";
import { attemptDelivery, MAX_ATTEMPTS } from "@/lib/api/webhooks";

// Sandbox / test-fire endpoint: enqueues a synthetic `webhook.test` event and
// attempts delivery immediately (bypassing the backoff schedule) so an
// integrator can verify their signature-verification code without waiting
// for a real domain event.
export const POST = withApiRoute("webhooks:write", async (_req, ctx, params) => {
  const [sub] = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.id, params.id), eq(webhookSubscriptions.orgId, ctx.auth.orgId)))
    .limit(1);
  if (!sub) throw new ApiError("NOT_FOUND", `Webhook subscription ${params.id} not found.`);

  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      subscriptionId: sub.id,
      eventType: "webhook.test",
      payload: { message: "This is a LEADOS webhook test-fire event.", firedAt: new Date().toISOString() },
      status: "pending",
      attempt: 0,
      maxAttempts: MAX_ATTEMPTS,
      nextAttemptAt: new Date(),
    })
    .returning();

  await attemptDelivery(delivery.id);
  const [updated] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, delivery.id)).limit(1);

  return jsonOk(
    { deliveryId: delivery.id, status: updated?.status ?? "pending", responseStatus: updated?.responseStatus ?? null },
    ctx.correlationId,
    { status: 200, rateLimit: ctx.rateLimit },
  );
});
