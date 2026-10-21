import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/errors";
import { generateWebhookSecret } from "@/lib/api/webhooks";
import { withApiRoute } from "@/lib/api/handler";
import { withIdempotency } from "@/lib/api/idempotency";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { CreateWebhookSubscriptionSchema } from "@/lib/api/schemas";
import { serializeWebhookSubscription } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

export const GET = withApiRoute("webhooks:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(webhookSubscriptions.orgId, ctx.auth.orgId)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(webhookSubscriptions.createdAt, new Date(cursor.v)),
        and(eq(webhookSubscriptions.createdAt, new Date(cursor.v)), op(webhookSubscriptions.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(...conditions))
    .orderBy(dir(webhookSubscriptions.createdAt), dir(webhookSubscriptions.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeWebhookSubscription);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const POST = withApiRoute("webhooks:write", async (req, ctx) => {
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = CreateWebhookSubscriptionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const result = await withIdempotency(
    req,
    ctx.auth.orgId,
    ctx.auth.tokenId,
    "POST /api/v1/webhooks/subscriptions",
    raw,
    async () => {
      const secret = generateWebhookSecret();
      const [created] = await db
        .insert(webhookSubscriptions)
        .values({ orgId: ctx.auth.orgId, secret, ...parsed.data })
        .returning();
      await writeAudit({
        orgId: ctx.auth.orgId,
        tokenId: ctx.auth.tokenId,
        action: "webhook_subscription.created",
        resourceType: "webhook_subscription",
        resourceId: created.id,
        correlationId: ctx.correlationId,
      });
      return { status: 201, body: { ...serializeWebhookSubscription(created), secret } };
    },
  );
  return jsonOk(result.body, ctx.correlationId, {
    status: result.status,
    rateLimit: ctx.rateLimit,
    headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined,
  });
});
