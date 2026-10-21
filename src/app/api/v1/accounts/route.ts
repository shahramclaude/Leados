import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { withIdempotency } from "@/lib/api/idempotency";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { ACCOUNT_FILTER_WHITELIST, buildFilterConditions } from "@/lib/api/resourceFilters";
import { jsonOk } from "@/lib/api/respond";
import { CreateAccountSchema } from "@/lib/api/schemas";
import { serializeAccount } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";
import { emitEvent } from "@/lib/api/stream";

const SORTABLE = ["createdAt", "name"] as const;
const SORT_COLUMNS = { createdAt: accounts.createdAt, name: accounts.name } as const;

export const GET = withApiRoute("accounts:read", async (req, ctx) => {
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, [...SORTABLE], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const sortColumn = SORT_COLUMNS[sort.field as keyof typeof SORT_COLUMNS];
  const filters = buildFilterConditions(url.searchParams, ACCOUNT_FILTER_WHITELIST, {
    name: accounts.name,
    domain: accounts.domain,
    createdAt: accounts.createdAt,
  });
  const conditions = [eq(accounts.orgId, ctx.auth.orgId), ...filters];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(or(op(sortColumn, cursor.v as never), and(eq(sortColumn, cursor.v as never), op(accounts.id, cursor.id)))!);
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(accounts)
    .where(and(...conditions))
    .orderBy(dir(sortColumn), dir(accounts.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeAccount);
  const { page, meta } = paginate(serialized, limit, sort.field as "createdAt" | "name", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const POST = withApiRoute("accounts:write", async (req, ctx) => {
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = CreateAccountSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const result = await withIdempotency(req, ctx.auth.orgId, ctx.auth.tokenId, "POST /api/v1/accounts", raw, async () => {
    const [created] = await db.insert(accounts).values({ orgId: ctx.auth.orgId, ...parsed.data }).returning();
    await writeAudit({
      orgId: ctx.auth.orgId,
      tokenId: ctx.auth.tokenId,
      action: "account.created",
      resourceType: "account",
      resourceId: created.id,
      correlationId: ctx.correlationId,
    });
    const serialized = serializeAccount(created);
    await emitEvent(ctx.auth.orgId, "account.created", serialized, ctx.correlationId);
    return { status: 201, body: serialized };
  });
  return jsonOk(result.body, ctx.correlationId, {
    status: result.status,
    rateLimit: ctx.rateLimit,
    headers: result.replayed ? { "Idempotent-Replayed": "true" } : undefined,
  });
});
