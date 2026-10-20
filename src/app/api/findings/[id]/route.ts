import { z } from "zod";
import { ApiError, ok, readJsonBody, withRouteErrors } from "@/lib/server/http";
import { deleteFinding, getFinding, updateFindingStatus } from "@/lib/server/repositories/findings";
import { findIdempotentResponse, getIdempotencyKey, recordIdempotentResponse } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  status: z.enum(["open", "resolved"]),
});

export const PATCH = withRouteErrors(async (req) => {
  const id = req.nextUrl.pathname.split("/").pop()!;
  const idempotencyKey = getIdempotencyKey(req);
  const replay = await findIdempotentResponse(idempotencyKey);
  if (replay) return replay;

  const parsed = patchSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid finding update.", parsed.error.flatten());
  }

  const existing = await getFinding(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Finding not found.");

  const row = await updateFindingStatus(id, parsed.data.status);
  const response = ok(row);
  await recordIdempotentResponse(idempotencyKey, `/api/findings/${id}`, 200, await response.clone().json());
  return response;
});

export const DELETE = withRouteErrors(async (req) => {
  const id = req.nextUrl.pathname.split("/").pop()!;
  const existing = await getFinding(id);
  if (!existing) throw new ApiError(404, "NOT_FOUND", "Finding not found.");
  await deleteFinding(id);
  return ok({ id });
});
