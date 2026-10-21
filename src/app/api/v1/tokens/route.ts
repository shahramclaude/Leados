import { and, asc, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { apiTokens } from "@/db/schema";
import { generateToken, requireAdmin } from "@/lib/api/auth";
import { writeAudit } from "@/lib/api/audit";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { decodeCursor, paginate, parseLimit } from "@/lib/api/pagination";
import { jsonOk } from "@/lib/api/respond";
import { CreateTokenSchema } from "@/lib/api/schemas";
import { parseSort } from "@/lib/api/sorting";

function serializeToken(row: typeof apiTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    scopes: row.scopes,
    isAdmin: row.isAdmin,
    rateLimitPerMinute: row.rateLimitPerMinute,
    createdAt: row.createdAt.toISOString(),
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  };
}

// Admin-only: minting a token is the single most dangerous write in the
// entire API (an admin token can mint more admin tokens and read the audit
// log). Restricted to `tokens:admin` scope + admin flag. See self-review Q1.
export const GET = withApiRoute("tokens:admin", async (req, ctx) => {
  requireAdmin(ctx.auth);
  const url = new URL(req.url);
  const limit = parseLimit(url.searchParams);
  const sort = parseSort(url.searchParams, ["createdAt"], { field: "createdAt", direction: "desc" });
  const cursor = decodeCursor(url.searchParams.get("cursor"));
  const conditions = [eq(apiTokens.orgId, ctx.auth.orgId)];
  const op = sort.direction === "desc" ? lt : gt;
  if (cursor) {
    conditions.push(
      or(
        op(apiTokens.createdAt, new Date(cursor.v)),
        and(eq(apiTokens.createdAt, new Date(cursor.v)), op(apiTokens.id, cursor.id)),
      )!,
    );
  }
  const dir = sort.direction === "desc" ? desc : asc;
  const rows = await db
    .select()
    .from(apiTokens)
    .where(and(...conditions))
    .orderBy(dir(apiTokens.createdAt), dir(apiTokens.id))
    .limit(limit + 1);
  const serialized = rows.map(serializeToken);
  const { page, meta } = paginate(serialized, limit, "createdAt", "id");
  return jsonOk({ data: page, meta }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const POST = withApiRoute("tokens:admin", async (req, ctx) => {
  requireAdmin(ctx.auth);
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = CreateTokenSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const generated = generateToken();
  const [created] = await db
    .insert(apiTokens)
    .values({
      orgId: ctx.auth.orgId,
      name: parsed.data.name,
      tokenPrefix: generated.prefix,
      tokenHash: generated.hash,
      scopes: parsed.data.scopes,
      isAdmin: parsed.data.isAdmin,
      rateLimitPerMinute: parsed.data.rateLimitPerMinute,
    })
    .returning();
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "token.created",
    resourceType: "api_token",
    resourceId: created.id,
    metadata: { name: created.name, isAdmin: created.isAdmin },
    correlationId: ctx.correlationId,
  });
  return jsonOk(
    { ...serializeToken(created), secret: generated.raw },
    ctx.correlationId,
    { status: 201, rateLimit: ctx.rateLimit },
  );
});
