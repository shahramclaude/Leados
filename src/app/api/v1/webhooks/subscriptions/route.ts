import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { CreateWebhookSubscriptionSchema } from "@/lib/openapi/schemas";
import { ApiError } from "@/lib/platform/envelope";
import { withApiV1 } from "@/lib/platform/handler";
import { toWebhookSubscriptionDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiV1("webhooks", async (_req, ctx) => {
  const rows = await db
    .select()
    .from(webhookSubscriptions)
    .where(and(eq(webhookSubscriptions.orgId, ctx.orgId), eq(webhookSubscriptions.active, true)))
    .orderBy(desc(webhookSubscriptions.createdAt));

  return Response.json({ items: rows.map(toWebhookSubscriptionDTO) });
});

export const POST = withApiV1("webhooks", async (req, ctx) => {
  const json = await req.json().catch(() => null);
  const parsed = CreateWebhookSubscriptionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid webhook subscription payload", parsed.error.flatten());
  }

  const secret = `whsec_${randomBytes(24).toString("base64url")}`;
  const [row] = await db
    .insert(webhookSubscriptions)
    .values({
      orgId: ctx.orgId,
      url: parsed.data.url,
      secret,
      eventTypes: parsed.data.eventTypes,
      description: parsed.data.description ?? null,
    })
    .returning();

  return Response.json({ ...toWebhookSubscriptionDTO(row), secret }, { status: 201 });
});
