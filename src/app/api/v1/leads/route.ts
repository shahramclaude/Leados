import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { withIdempotency } from "@/lib/api/idempotency";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { buildFilterConditions, LEAD_FILTER_WHITELIST } from "@/lib/api/resourceFilters";
import { jsonOk } from "@/lib/api/respond";
import { CreateLeadSchema } from "@/lib/api/schemas";
import { serializeLead } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";
import { emitEvent } from "@/lib/api/stream";

const SORTABLE = ["createdAt", "score", "name"] as const;
const SORT_COLUMNS = { createdAt: leads.createdAt, score: leads.score, name: leads.name } as const;

export const GET = withApiRoute("leads:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, [...SORTABLE], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const sortColumn = SORT_COLUMNS[sort.field as keyof typeof SORT_COLUMNS];

  const filters = buildFilterConditions(url.searchParams, LEAD_FILTER_WHITELIST, {
    stage: leads.stage,
    score: leads.score,
    company: leads.company,
    createdAt: leads.createdAt,
    accountId: leads.accountId,
    email: leads.email,
  });

  const conditions = [eq(leads.orgId, ctx.auth.orgId), ...filters];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(or(op(sortColumn, cursor.v as never), and(eq(sortColumn, cursor.v as never), op(leads.id, cursor.id)))!);
  }

  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(dir(sortColumn), dir(leads.id))
    .limit(limit + 1);

  const serialized = rows.map(serializeLead);
  const { page, meta } = paginate(serialized, limit, sort.field as "createdAt" | "score" | "name", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const POST = withApiRoute("leads:write", async (req, ctx) => {
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = CreateLeadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }

  const result = await withIdempotency(req, ctx.auth.orgId, ctx.auth.tokenId, "POST /api/v1/leads", raw, async () => {
    const [created] = await db
      .insert(leads)
      .values({ orgId: ctx.auth.orgId, stage: "new", ...parsed.data })
      .returning();
    await writeAudit({
      orgId: ctx.auth.orgId,
      tokenId: ctx.auth.tokenId,
      action: "lead.created",
      resourceType: "lead",
      resourceId: created.id,
      correlationId: ctx.correlationId,
    });
    const serialized = serializeLead(created);
    await emitEvent(ctx.auth.orgId, "lead.created", serialized, ctx.correlationId);
    return { status: 201, body: serialized };
  });

  return jsonOk(result.body, ctx.correlationId, {
    status: result.status,
    rateLimit: ctx.rateLimit,
    headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined,
  });
});
