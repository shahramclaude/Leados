import { and, desc, eq, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { withApiV1 } from "@/lib/platform/handler";
import { decodeCursor, encodeCursor, parseLimit } from "@/lib/platform/pagination";
import { toWebhookDeliveryDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiV1("webhooks", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = cursorParam ? decodeCursor(cursorParam) : null;

  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(
      cursor
        ? and(
            eq(webhookDeliveries.orgId, ctx.orgId),
            or(
              lt(webhookDeliveries.createdAt, cursor.createdAt),
              and(eq(webhookDeliveries.createdAt, cursor.createdAt), lt(webhookDeliveries.id, cursor.id)),
            ),
          )
        : eq(webhookDeliveries.orgId, ctx.orgId),
    )
    .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  const nextCursor = hasMore
    ? encodeCursor({ createdAt: page[page.length - 1].createdAt, id: page[page.length - 1].id })
    : null;

  return Response.json({ items: page.map(toWebhookDeliveryDTO), page: { nextCursor, limit } });
});
