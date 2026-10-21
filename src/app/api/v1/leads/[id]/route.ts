import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { writeAudit } from "@/lib/api/audit";
import { computeEtag, isNotModified } from "@/lib/api/etag";
import { ApiError } from "@/lib/api/errors";
import { withApiRoute } from "@/lib/api/handler";
import { jsonOk, withCommonHeaders } from "@/lib/api/respond";
import { UpdateLeadSchema } from "@/lib/api/schemas";
import { serializeLead } from "@/lib/api/serializers";
import { emitEvent } from "@/lib/api/stream";

async function findLead(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export const GET = withApiRoute("leads:read", async (req, ctx, params) => {
  const lead = await findLead(ctx.auth.orgId, params.id);
  if (!lead) throw new ApiError("NOT_FOUND", `Lead ${params.id} not found.`);
  const serialized = serializeLead(lead);
  const etag = computeEtag(serialized);
  if (isNotModified(req, etag)) {
    const headers = withCommonHeaders(new Headers({ ETag: etag }), ctx.correlationId, ctx.rateLimit);
    return new Response(null, { status: 304, headers });
  }
  return jsonOk(serialized, ctx.correlationId, { rateLimit: ctx.rateLimit, headers: { ETag: etag } });
});

export const PATCH = withApiRoute("leads:write", async (req, ctx, params) => {
  const lead = await findLead(ctx.auth.orgId, params.id);
  if (!lead) throw new ApiError("NOT_FOUND", `Lead ${params.id} not found.`);
  const raw = await req.json().catch(() => {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  });
  const parsed = UpdateLeadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("VALIDATION_ERROR", "Request body failed validation.", parsed.error.flatten());
  }
  const [updated] = await db
    .update(leads)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(leads.id, lead.id))
    .returning();
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "lead.updated",
    resourceType: "lead",
    resourceId: lead.id,
    metadata: parsed.data,
    correlationId: ctx.correlationId,
  });
  const serialized = serializeLead(updated);
  await emitEvent(ctx.auth.orgId, "lead.updated", serialized, ctx.correlationId);
  return jsonOk(serialized, ctx.correlationId, { rateLimit: ctx.rateLimit });
});

export const DELETE = withApiRoute("leads:write", async (_req, ctx, params) => {
  const lead = await findLead(ctx.auth.orgId, params.id);
  if (!lead) throw new ApiError("NOT_FOUND", `Lead ${params.id} not found.`);
  await db.delete(leads).where(eq(leads.id, lead.id));
  await writeAudit({
    orgId: ctx.auth.orgId,
    tokenId: ctx.auth.tokenId,
    action: "lead.deleted",
    resourceType: "lead",
    resourceId: lead.id,
    correlationId: ctx.correlationId,
  });
  await emitEvent(ctx.auth.orgId, "lead.deleted", { id: lead.id }, ctx.correlationId);
  return jsonOk({ id: lead.id, deleted: true }, ctx.correlationId, { rateLimit: ctx.rateLimit });
});
