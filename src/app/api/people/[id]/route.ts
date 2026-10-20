import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { ApiError, isAuthContext, jsonError, parseJsonBody, requireAuth } from "@/lib/apiUtils";
import { personUpdateSchema, uuidSchema } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

async function loadScopedPerson(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, id), eq(people.orgId, orgId), isNull(people.deletedAt)))
    .limit(1);
  return row;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_READ });
  if (!isAuthContext(auth)) return auth;

  const { id } = await params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return jsonError(400, "INVALID_ID", "Invalid person id.", auth.correlationId);

  // Scoping by org means a well-formed id belonging to another tenant
  // behaves identically to a nonexistent id: 404, never 403 (which would
  // leak existence) and never the data itself.
  const row = await loadScopedPerson(auth.session.orgId, parsedId.data);
  if (!row) return jsonError(404, "NOT_FOUND", "Person not found.", auth.correlationId);

  await recordAuditEvent({
    correlationId: auth.correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "people.read",
    resourceType: "person",
    resourceId: row.id,
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  return NextResponse.json({ person: row });
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_WRITE });
  if (!isAuthContext(auth)) return auth;

  const { id } = await params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return jsonError(400, "INVALID_ID", "Invalid person id.", auth.correlationId);

  try {
    const body = await parseJsonBody(req, personUpdateSchema);
    const existing = await loadScopedPerson(auth.session.orgId, parsedId.data);
    if (!existing) return jsonError(404, "NOT_FOUND", "Person not found.", auth.correlationId);

    const [row] = await db
      .update(people)
      .set({
        ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
        ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.phone !== undefined ? { phone: body.phone || null } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
        ...(body.sensitiveData !== undefined ? { sensitiveData: body.sensitiveData } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(people.id, parsedId.data), eq(people.orgId, auth.session.orgId)))
      .returning();

    await recordAuditEvent({
      correlationId: auth.correlationId,
      orgId: auth.session.orgId,
      actorUserId: auth.session.sub,
      actorEmail: auth.session.email,
      action: "people.update",
      resourceType: "person",
      resourceId: row.id,
      metadata: { fields: Object.keys(body) },
      ip: auth.ip,
      userAgent: auth.userAgent,
    });

    return NextResponse.json({ person: row });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, auth.correlationId);
    return jsonError(500, "INTERNAL_ERROR", "Failed to update person.", auth.correlationId);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_DELETE });
  if (!isAuthContext(auth)) return auth;

  const { id } = await params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) return jsonError(400, "INVALID_ID", "Invalid person id.", auth.correlationId);

  const existing = await loadScopedPerson(auth.session.orgId, parsedId.data);
  if (!existing) return jsonError(404, "NOT_FOUND", "Person not found.", auth.correlationId);

  await db
    .update(people)
    .set({ deletedAt: new Date() })
    .where(and(eq(people.id, parsedId.data), eq(people.orgId, auth.session.orgId)));

  await recordAuditEvent({
    correlationId: auth.correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "people.delete",
    resourceType: "person",
    resourceId: parsedId.data,
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  return NextResponse.json({ ok: true });
}
