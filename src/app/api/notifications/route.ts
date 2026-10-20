import { z } from "zod";
import { ApiError, ok, readJsonBody, withRouteErrors } from "@/lib/server/http";
import { createNotification, listNotifications, type NotificationStatus } from "@/lib/server/repositories/notifications";
import { findIdempotentResponse, getIdempotencyKey, recordIdempotentResponse } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const STATUSES = new Set<NotificationStatus>(["unread", "read", "archived"]);

export const GET = withRouteErrors(async (req) => {
  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const status = statusParam && STATUSES.has(statusParam as NotificationStatus) ? (statusParam as NotificationStatus) : undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const { rows, total, unreadCount } = await listNotifications({ status, limit });
  return ok({ rows, total, unreadCount });
});

const createNotificationSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
  domain: z.string().optional(),
  severity: z.number().int().min(1).max(5).optional(),
});

export const POST = withRouteErrors(async (req) => {
  const idempotencyKey = getIdempotencyKey(req);
  const replay = await findIdempotentResponse(idempotencyKey);
  if (replay) return replay;

  const parsed = createNotificationSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid notification payload.", parsed.error.flatten());
  }
  const row = await createNotification(parsed.data);
  const response = ok(row);
  await recordIdempotentResponse(idempotencyKey, "/api/notifications", 200, await response.clone().json());
  return response;
});
