import { z } from "zod";
import { ApiError, ok, readJsonBody, withRouteErrors } from "@/lib/server/http";
import { getNotification, updateNotificationStatus } from "@/lib/server/repositories/notifications";
import { findIdempotentResponse, getIdempotencyKey, recordIdempotentResponse } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["unread", "read", "archived"]),
});

export const PATCH = withRouteErrors(async (req) => {
  const id = req.nextUrl.pathname.split("/").pop()!;
  const idempotencyKey = getIdempotencyKey(req);
  const replay = await findIdempotentResponse(idempotencyKey);
  if (replay) return replay;

  const parsed = patchSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid notification update.", parsed.error.flatten());
  }

  const existing = await getNotification(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Notification not found.");

  const row = await updateNotificationStatus(id, parsed.data.status);
  const response = ok(row);
  await recordIdempotentResponse(idempotencyKey, `/api/notifications/${id}`, 200, await response.clone().json());
  return response;
});
