import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { requireAdmin } from "@/lib/api/auth";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { serializeAuditLog } from "@/lib/api/serializers";
import { parseSort } from "@/lib/api/sorting";

// Admin-only: the audit log is the most sensitive read in the v1 surface
// (actor identity, resource ids, full mutation metadata). It requires the
// `audit:read` scope AND an admin token — a non-admin token can never read
// it even if misconfigured with the scope. See Part 14 self-review Q1.
export const GET = withApiRoute("audit:read", async (req, ctx) => {
  requireAdmin(ctx.auth);
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(auditLogs.orgId, ctx.auth.orgId)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(auditLogs.createdAt, new Date(cursor.v)),
        and(eq(auditLogs.createdAt, new Date(cursor.v)), op(auditLogs.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(dir(auditLogs.createdAt), dir(auditLogs.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeAuditLog);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
