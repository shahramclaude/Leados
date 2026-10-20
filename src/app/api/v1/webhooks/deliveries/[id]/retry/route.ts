import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import { ApiError } from "@/lib/platform/envelope";
import { withApiV1 } from "@/lib/platform/handler";
import { retryDeliveryNow } from "@/lib/platform/webhooks";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = withApiV1<RouteCtx>("webhooks", async (_req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  const [row] = await db
    .select()
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.orgId, ctx.orgId), eq(webhookDeliveries.id, id)))
    .limit(1);

  if (!row) throw new ApiError("NOT_FOUND", `Delivery ${id} not found`);

  await retryDeliveryNow(id);
  return Response.json({ accepted: true }, { status: 202 });
});
