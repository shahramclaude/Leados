import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { accounts, leads } from "@/db/schema";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { serializeLead } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

// Nested route kept shallow on purpose (one level): /accounts/{id}/leads.
// This is the only nested resource in the v1 surface — see docs/API.md
// "Resource naming" for the rationale against deeper nesting.
export const GET = withApiRoute("leads:read", async (req, ctx, params) => {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, params.id), eq(accounts.orgId, ctx.auth.orgId)))
    .limit(1);
  if (!account) throw new ApiError("NOT_FOUND", `Account ${params.id} not found.`);

  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(leads.orgId, ctx.auth.orgId), eq(leads.accountId, account.id)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(op(leads.createdAt, new Date(cursor.v)), and(eq(leads.createdAt, new Date(cursor.v)), op(leads.id, cursor.id)))!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(leads)
    .where(and(...conditions))
    .orderBy(dir(leads.createdAt), dir(leads.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeLead);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
