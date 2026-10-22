import { and, asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { webhookSubscriptions } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught } from "@/lib/api/respond";
import { buildPageMeta, cursorRowCondition, decodeCursor, parseLimit, parseSort } from "@/lib/api/pagination";
import { WebhookSubscriptionCreateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toWebhookSubscription } from "@/lib/api/serialize";
import { handleIdempotentCreate } from "@/lib/api/writeHelpers";
import { recordAudit } from "@/lib/api/audit";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const SORT_COLUMN = { createdAt: webhookSubscriptions.createdAt, updatedAt: webhookSubscriptions.updatedAt } as const;

export const GET = withApi("webhooks:read", async (req, { correlationId, rl }) => {
  try {
    const sp = new URL(req.url).searchParams;
    const limit = parseLimit(sp.get("limit"));
    const { field, direction } = parseSort(sp.get("sort"), ["createdAt", "updatedAt"], "-createdAt");
    const sortColumn = SORT_COLUMN[field as keyof typeof SORT_COLUMN];

    const conditions = [];
    if (sp.get("cursor")) conditions.push(cursorRowCondition(sortColumn, webhookSubscriptions.id, decodeCursor(sp.get("cursor")!), direction));

    const orderFns = direction === "desc" ? [desc(sortColumn), desc(webhookSubscriptions.id)] : [asc(sortColumn), asc(webhookSubscriptions.id)];
    const rows = await db
      .select()
      .from(webhookSubscriptions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(...orderFns)
      .limit(limit + 1);
    const { items, hasMore, nextCursor } = buildPageMeta(rows, limit, field as keyof (typeof rows)[number]);
    return jsonOk({ data: items.map(toWebhookSubscription), page: { cursor: nextCursor, hasMore, limit } }, correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const POST = withApi("webhooks:write", async (req, { correlationId, key, rl }) => {
  try {
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = WebhookSubscriptionCreateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Webhook subscription payload failed validation", parsed.error.flatten());

    const result = await handleIdempotentCreate(req, "POST /v1/webhooks/subscriptions", rawBody, async () => {
      const secret = "whsec_" + randomBytes(24).toString("base64url");
      const [row] = await db
        .insert(webhookSubscriptions)
        .values({ url: parsed.data.url, eventTypes: parsed.data.eventTypes, description: parsed.data.description, secret })
        .returning();
      await recordAudit({ actor: key.id, action: "webhook_subscription.created", resource: "webhook_subscription", resourceId: row.id, correlationId });
      return { status: 201, body: { ...toWebhookSubscription(row), secret } };
    });
    return jsonOk(result.body, correlationId, { status: result.status, headers: result.replayed ? { "Idempotency-Replayed": "true" } : {} }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
