import { createDecision, listDecisions } from "@/lib/platform/decisions";
import { withApiV1 } from "@/lib/platform/handler";
import { withIdempotency } from "@/lib/platform/idempotency";
import { parseLimit } from "@/lib/platform/pagination";
import { toDecisionDTO } from "@/lib/platform/serialize";
import { CreateDecisionSchema } from "@/lib/openapi/schemas";
import { ApiError } from "@/lib/platform/envelope";

export const dynamic = "force-dynamic";

export const GET = withApiV1("read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");

  const { items, nextCursor } = await listDecisions(ctx.orgId, { limit, cursor });

  return Response.json({
    items: items.map(toDecisionDTO),
    page: { nextCursor, limit },
  });
});

export const POST = withApiV1("write", async (req, ctx) => {
  const json = await req.json().catch(() => null);
  const parsed = CreateDecisionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten());
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  const { status, body, replayed } = await withIdempotency(
    { orgId: ctx.orgId, route: "POST /api/v1/decisions", key: idempotencyKey, requestBody: parsed.data },
    async () => {
      const row = await createDecision(ctx.orgId, parsed.data);
      return { status: 201, body: toDecisionDTO(row) };
    },
  );

  return Response.json(body, {
    status,
    headers: replayed ? { "Idempotency-Replayed": "true" } : undefined,
  });
});
