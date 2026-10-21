import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { buildFilterConditions, WEBHOOK_DELIVERY_FILTER_WHITELIST } from "@/lib/api/resourceFilters";
import { jsonOk } from "@/lib/api/respond";
import { serializeWebhookDelivery } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

// Delivery log UI data source: full attempt history, with
// `responseBodySnippet` already redacted per policy at write time
// (see src/lib/api/webhooks.ts `redact()`).
export const GET = withApiRoute("webhooks:read", async (req, ctx, params) => {
  const [sub] = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.id, params.id), eq(webhookSubscriptions.orgId, ctx.auth.orgId)))
    .limit(1);
  if (!sub) throw new ApiError("NOT_FOUND", `Webhook subscription ${params.id} not found.`);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const filters = buildFilterConditions(url.searchParams, WEBHOOK_DELIVERY_FILTER_WHITELIST, {
    status: webhookDeliveries.status,
    eventType: webhookDeliveries.eventType,
    createdAt: webhookDeliveries.createdAt,
  });
  const conditions = [eq(webhookDeliveries.subscriptionId, sub.id), ...filters];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(webhookDeliveries.createdAt, new Date(cursor.v)),
        and(eq(webhookDeliveries.createdAt, new Date(cursor.v)), op(webhookDeliveries.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(and(...conditions))
    .orderBy(dir(webhookDeliveries.createdAt), dir(webhookDeliveries.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeWebhookDelivery);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
