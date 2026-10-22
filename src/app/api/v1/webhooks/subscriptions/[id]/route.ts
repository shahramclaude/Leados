import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { ApiError } from "@/lib/api/errors";
import { recordAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

export const DELETE = withApi("webhooks:write", async (_req, { correlationId, key, rl, params }) => {
  try {
    const [row] = await db.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, params.id)).limit(1);
    if (!row) throw new ApiError("NOT_FOUND", `No webhook subscription with id ${params.id}`);
    await db.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, params.id));
    await recordAudit({ actor: key.id, action: "webhook_subscription.deleted", resource: "webhook_subscription", resourceId: params.id, correlationId });
    return new Response(null, { status: 204, headers: baseHeaders(correlationId) });
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
