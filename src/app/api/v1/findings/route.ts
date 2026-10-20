import { CreateFindingSchema } from "@/lib/openapi/schemas";
import { ApiError } from "@/lib/platform/envelope";
import { createFinding, listFindings } from "@/lib/platform/findings";
import { withApiV1 } from "@/lib/platform/handler";
import { withIdempotency } from "@/lib/platform/idempotency";
import { parseLimit } from "@/lib/platform/pagination";
import { toFindingDTO } from "@/lib/platform/serialize";

export const dynamic = "force-dynamic";

export const GET = withApiV1("read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursor = url.searchParams.get("cursor");

  const { items, nextCursor } = await listFindings(ctx.orgId, { limit, cursor });

  return Response.json({ items: items.map(toFindingDTO), page: { nextCursor, limit } });
});

export const POST = withApiV1("write", async (req, ctx) => {
  const json = await req.json().catch(() => null);
  const parsed = CreateFindingSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Invalid finding payload", parsed.error.flatten());
  }

  const idempotencyKey = req.headers.get("idempotency-key");
  const { status, body } = await withIdempotency(
    { orgId: ctx.orgId, route: "POST /api/v1/findings", key: idempotencyKey, requestBody: parsed.data },
    async () => {
      const row = await createFinding(ctx.orgId, parsed.data);
      return { status: 201, body: toFindingDTO(row) };
    },
  );

  return Response.json(body, { status });
});
