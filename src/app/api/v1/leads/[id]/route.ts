import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { computeEtag, matchesIfNoneMatch } from "@/lib/api/etag";
import { LeadUpdateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toLead } from "@/lib/api/serialize";
import { recordAudit } from "@/lib/api/audit";
import { emitEvent } from "@/lib/webhooks/worker";

export const dynamic = "force-dynamic";

async function findActive(id: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), isNull(leads.deletedAt)))
    .limit(1);
  if (!row) throw new ApiError("NOT_FOUND", `No lead with id ${id}`);
  return row;
}

export const GET = withApi("leads:read", async (req, { correlationId, rl, params }) => {
  try {
    const row = await findActive(params.id);
    const etag = computeEtag(row.id, row.updatedAt);
    if (matchesIfNoneMatch(req, etag)) {
      return new Response(null, { status: 304, headers: baseHeaders(correlationId, { ETag: etag }) });
    }
    return jsonOk(toLead(row), correlationId, { headers: { ETag: etag } }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const PATCH = withApi("leads:write", async (req, { correlationId, key, rl, params }) => {
  try {
    await findActive(params.id);
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = LeadUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Lead payload failed validation", parsed.error.flatten());
    }
    const [row] = await db
      .update(leads)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(leads.id, params.id))
      .returning();
    await recordAudit({ actor: key.id, action: "lead.updated", resource: "lead", resourceId: row.id, correlationId });
    await emitEvent("lead.updated", { id: row.id, name: row.name, status: row.status });
    return jsonOk(toLead(row), correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const DELETE = withApi("leads:write", async (_req, { correlationId, key, rl, params }) => {
  try {
    await findActive(params.id);
    await db.update(leads).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(leads.id, params.id));
    await recordAudit({ actor: key.id, action: "lead.deleted", resource: "lead", resourceId: params.id, correlationId });
    return new Response(null, { status: 204, headers: baseHeaders(correlationId) });
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
