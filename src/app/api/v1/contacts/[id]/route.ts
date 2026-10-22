import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts } from "@/db/schema";
import { withApi } from "@/lib/api/handler";
import { jsonOk, jsonFromCaught, baseHeaders } from "@/lib/api/respond";
import { computeEtag, matchesIfNoneMatch } from "@/lib/api/etag";
import { ContactUpdateSchema } from "@/lib/api/schemas";
import { ApiError } from "@/lib/api/errors";
import { toContact } from "@/lib/api/serialize";
import { recordAudit } from "@/lib/api/audit";

export const dynamic = "force-dynamic";

async function findActive(id: string) {
  const [row] = await db.select().from(contacts).where(and(eq(contacts.id, id), isNull(contacts.deletedAt))).limit(1);
  if (!row) throw new ApiError("NOT_FOUND", `No contact with id ${id}`);
  return row;
}

export const GET = withApi("contacts:read", async (req, { correlationId, rl, params }) => {
  try {
    const row = await findActive(params.id);
    const etag = computeEtag(row.id, row.updatedAt);
    if (matchesIfNoneMatch(req, etag)) return new Response(null, { status: 304, headers: baseHeaders(correlationId, { ETag: etag }) });
    return jsonOk(toContact(row), correlationId, { headers: { ETag: etag } }, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const PATCH = withApi("contacts:write", async (req, { correlationId, key, rl, params }) => {
  try {
    await findActive(params.id);
    const rawBody = await req.json().catch(() => {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON");
    });
    const parsed = ContactUpdateSchema.safeParse(rawBody);
    if (!parsed.success) throw new ApiError("VALIDATION_ERROR", "Contact payload failed validation", parsed.error.flatten());
    const [row] = await db.update(contacts).set({ ...parsed.data, updatedAt: new Date() }).where(eq(contacts.id, params.id)).returning();
    await recordAudit({ actor: key.id, action: "contact.updated", resource: "contact", resourceId: row.id, correlationId });
    return jsonOk(toContact(row), correlationId, {}, rl);
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});

export const DELETE = withApi("contacts:write", async (_req, { correlationId, key, rl, params }) => {
  try {
    await findActive(params.id);
    await db.update(contacts).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(contacts.id, params.id));
    await recordAudit({ actor: key.id, action: "contact.deleted", resource: "contact", resourceId: params.id, correlationId });
    return new Response(null, { status: 204, headers: baseHeaders(correlationId) });
  } catch (err) {
    return jsonFromCaught(err, correlationId, rl);
  }
});
