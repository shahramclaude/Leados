import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk } from "@/lib/api/respond";
import { UpdateWebhookSubscriptionSchema } from "@/lib/api/schemas";
import { serializeWebhookSubscription } from "@/lib/api/serializers";

async function findSub(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.id, id), eq(webhookSubscriptions.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export const GET = withApiRoute("webhooks:read", async (_req, ctx, params) => {
  const sub = await findSub(ctx.auth.orgId, params.id);
  if (!sub) throw new ApiError("NOT_FOUND", `Webhook subscription ${params.id} not found.`);
  return jsonOk(serializeWebhookSubscription(sub), ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const PATCH = withApiRoute("webhooks:write", async (req, ctx, params) => {
  const sub = await findSub(ctx.auth.orgId, params.id);
  if (!sub) throw new ApiError("NOT_FOUND", `Webhook subscription ${params.id} not found.`);
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = UpdateWebhookSubscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const [updated] = await db
    .update(webhookSubscriptions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(webhookSubscriptions.id, sub.id))
    .returning();
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "webhook_subscription.updated",
    resourceType: "webhook_subscription",
    resourceId: sub.id,
    metadata: parsed.data,
    correlationId: ctx.correlationId,
  });
  return jsonOk(serializeWebhookSubscription(updated), ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const DELETE = withApiRoute("webhooks:write", async (_req, ctx, params) => {
  const sub = await findSub(ctx.auth.orgId, params.id);
  if (!sub) throw new ApiError("NOT_FOUND", `Webhook subscription ${params.id} not found.`);
  await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, sub.id));
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "webhook_subscription.deleted",
    resourceType: "webhook_subscription",
    resourceId: sub.id,
    correlationId: ctx.correlationId,
  });
  return jsonOk({ id: sub.id, deleted: true }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
