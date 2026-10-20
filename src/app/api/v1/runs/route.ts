import { TriggerRunSchema } from "@/lib/openapi/schemas";
import { ApiError } from "@/lib/platform/envelope";
import { withApiV1 } from "@/lib/platform/handler";
import { listRuns, triggerRun } from "@/lib/platform/jobs";
import { parseLimit } from "@/lib/platform/pagination";
import { toRunDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiV1("automation", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");

  const { items, nextCursor } = await listRuns(ctx.orgId, { limit, cursor });

  return Response.json({ items: items.map(toRunDTO), page: { nextCursor, limit } });
});

export const POST = withApiV1("automation", async (req, ctx) => {
  const json = await req.json().catch(() => null);
  const parsed = TriggerRunSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid run payload", parsed.error.flatten());
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  const { run, created } = await triggerRun({
    orgId: ctx.orgId,
    type: parsed.data.type,
    input: parsed.data.input,
    idempotencyKey,
  });

  return Response.json(toRunDTO(run), {
    status: 201,
    headers: created ? undefined : { "Idempotency-Replayed": "true" },
  });
});
