import { UpdateDecisionSchema } from "@/lib/openapi/schemas";
import { deleteDecision, getDecision, updateDecision } from "@/lib/platform/decisions";
import { ApiError } from "@/lib/platform/envelope";
import { computeEtag, matchesEtag } from "@/lib/platform/etag";
import { withApiV1 } from "@/lib/platform/handler";
import { withIdempotency } from "@/lib/platform/idempotency";
import { toDecisionDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export const GET = withApiV1<RouteCtx>("read", async (req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  const row = await getDecision(ctx.orgId, id);
  const dto = toDecisionDTO(row);
  const etag = computeEtag(dto);

  if (matchesEtag(req, etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return Response.json(dto, { headers: { ETag: etag, "Cache-Control": "private, max-age=0, must-revalidate" } });
});

export const PATCH = withApiV1<RouteCtx>("write", async (req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  const json = await req.json().catch(() => null);
  const parsed = UpdateDecisionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten());
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  const { status, body } = await withIdempotency(
    { orgId: ctx.orgId, route: `PATCH /api/v1/decisions/${id}`, key: idempotencyKey, requestBody: parsed.data },
    async () => {
      const row = await updateDecision(ctx.orgId, id, parsed.data);
      return { status: 200, body: toDecisionDTO(row) };
    },
  );

  return Response.json(body, { status });
});

export const DELETE = withApiV1<RouteCtx>("write", async (_req, ctx, _correlationId, routeCtx) => {
  const { id } = await routeCtx.params;
  await deleteDecision(ctx.orgId, id);
  return new Response(null, { status: 204 });
});
