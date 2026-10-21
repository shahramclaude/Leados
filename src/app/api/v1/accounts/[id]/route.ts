import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { computeEtag, isNotModified } from "@/lib/api/etag";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk, withCommonHeaders } from "@/lib/api/respond";
import { UpdateAccountSchema } from "@/lib/api/schemas";
import { serializeAccount } from "@/lib/api/serializers";
import { emitEvent } from "@/lib/api/stream";

async function findAccount(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export const GET = withApiRoute("accounts:read", async (req, ctx, params) => {
  const account = await findAccount(ctx.auth.orgId, params.id);
  if (!account) throw new ApiError("NOT_FOUND", `Account ${params.id} not found.`);
  const serialized = serializeAccount(account);
  const etag = computeEtag(serialized);
  if (isNotModified(req, etag)) {
    const headers = withCommonHeaders(new Headers({ ETag: etag }), ctx.correlationId, ctx.rateLimit);
    return new Response(null, { status: 304, headers });
  }
  return jsonOk(serialized, ctx.correlationId, { rateLimit: ctx.rateLimit, headers: { ETag: etag } });
});

export const PATCH = withApiRoute("accounts:write", async (req, ctx, params) => {
  const account = await findAccount(ctx.auth.orgId, params.id);
  if (!account) throw new ApiError("NOT_FOUND", `Account ${params.id} not found.`);
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = UpdateAccountSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const [updated] = await db
    .update(accounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(accounts.id, account.id))
    .returning();
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "account.updated",
    resourceType: "account",
    resourceId: account.id,
    metadata: parsed.data,
    correlationId: ctx.correlationId,
  });
  const serialized = serializeAccount(updated);
  await emitEvent(ctx.auth.orgId, "account.updated", serialized, ctx.correlationId);
  return jsonOk(serialized, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const DELETE = withApiRoute("accounts:write", async (_req, ctx, params) => {
  const account = await findAccount(ctx.auth.orgId, params.id);
  if (!account) throw new ApiError("NOT_FOUND", `Account ${params.id} not found.`);
  await db.delete(accounts).where(eq(accounts.id, account.id));
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "account.deleted",
    resourceType: "account",
    resourceId: account.id,
    correlationId: ctx.correlationId,
  });
  await emitEvent(ctx.auth.orgId, "account.deleted", { id: account.id }, ctx.correlationId);
  return jsonOk({ id: account.id, deleted: true }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
