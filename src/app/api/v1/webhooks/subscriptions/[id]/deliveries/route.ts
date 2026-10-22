import { and, asc, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries, webhookSubscriptions } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseLimit, parseSort } from "@/lib/api/pagination";
import { ApiError } from "@/lib/api/errors";
import { toWebhookDelivery } from "@/lib/api/serialize";

export const dynamic = "force-dynamic";

/**
 * Delivery log for a subscription. Payloads are always redacted here — the raw
 * payload is only ever transmitted to the subscriber's own endpoint, never
 * replayed back over the API (see docs/API.md "Webhook delivery log").
 */
export const GET = withApi("webhooks:read", async (req, { correlationId, rl, params }) => {
  try {
    const [sub] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, params.id)).limit(1);
    if (!sub) throw new ApiError("NOT_FOUND", `No webhook subscription with id ${params.id}`);

    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { direction } = parseSort(sp.get("sort"), ["createdAt"], "-createdAt");
    const sortColumn = webhookDeliveries.createdAt;

    const conditions: SQL[] = [eq(webhookDeliveries.subscriptionId, params.id)];
    if (sp.get("cursor")) conditions.push(cursorRowCondition(sortColumn, webhookDeliveries.id, decodeCursor(sp.get("cursor")!), direction));

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(webhookDeliveries.id)] : [asc(sortColumn), asc(webhookDeliveries.id)];
    const rows = await db.select().from(webhookDeliveries).where(and(...conditions)).orderBy(...orderFns).limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, "createdAt");
    return jsonOk({ data: items.map(toWebhookDelivery), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
