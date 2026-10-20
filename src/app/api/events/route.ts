import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, ok, readJsonBody, withRouteErrors } from "@/lib/server/http";
import { createEvent, listEvents } from "@/lib/server/repositories/events";
import { findIdempotentResponse, getIdempotencyKey, recordIdempotentResponse } from "@/lib/server/idempotency";

export const dynamic = "force-dynamic";

export const GET = withRouteErrors(async (req) => {
  const sp = req.nextUrl.searchParams;
  const domain = sp.get("domain") ?? undefined;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : undefined;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : undefined;
  const { rows, total } = await listEvents({ domain, limit, offset });
  return ok({ rows, total });
});

const createEventSchema = z.object({
  type: z.string().min(1),
  domain: z.string().min(1),
  severity: z.number().int().min(1).max(5).default(1),
  title: z.string().min(1).max(200),
  body: z.string().max(2000).optional(),
});

export const POST = withRouteErrors(async (req: NextRequest) => {
  const idempotencyKey = getIdempotencyKey(req);
  const replay = await findIdempotentResponse(idempotencyKey);
  if (replay) return replay;

  const parsed = createEventSchema.safeParse(await readJsonBody(req));
  if (!parsed.success) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid event payload.", parsed.error.flatten());
  }
  const row = await createEvent(parsed.data);
  const response = ok(row);
  await recordIdempotentResponse(idempotencyKey, "/api/events", 200, await response.clone().json());
  return response;
});
