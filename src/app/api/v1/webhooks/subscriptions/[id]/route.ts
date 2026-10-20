import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { ApiError } from "@/lib/platform/envelope";
import { withApiV1 } from "@/lib/platform/handler";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withApiV1<RouteCtx>("webhooks", async (_req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  const [row] = await db
    .update(webhookSubscriptions)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(webhookSubscriptions.orgId, ctx.orgId), eq(webhookSubscriptions.id, id)))
    .returning();

  if (!row) throw new ApiError("NOT_FOUND", `Webhook subscription ${id} not found`);
  return new Response(null, { status: 204 });
});
