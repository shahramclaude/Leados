import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { ApiError, isAuthContext, parseJsonBody, requireAuth } from "@/lib/apiUtils";
import { jsonError } from "@/lib/apiUtils";
import { personCreateSchema } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * GET/POST /api/people — every query is scoped by `eq(people.orgId,
 * session.orgId)`. There is no code path that lets a request read or write
 * another tenant's rows, regardless of what id a client sends (see
 * SECURITY_AUDIT.md "Cross-tenant isolation" and the authz matrix tests).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_READ });
  if (!isAuthContext(auth)) return auth;

  const rows = await db
    .select()
    .from(people)
    .where(and(eq(people.orgId, auth.session.orgId), isNull(people.deletedAt)))
    .orderBy(desc(people.createdAt))
    .limit(200);

  await recordAuditEvent({
    correlationId: auth.correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "people.list",
    resourceType: "person",
    metadata: { count: rows.length },
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  return NextResponse.json({ people: rows });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_WRITE });
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await parseJsonBody(req, personCreateSchema);
    const [row] = await db
      .insert(people)
      .values({
        orgId: auth.session.orgId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email || null,
        phone: body.phone || null,
        notes: body.notes || null,
        sensitiveData: body.sensitiveData ?? {},
        createdBy: auth.session.sub,
      })
      .returning();

    await recordAuditEvent({
      correlationId: auth.correlationId,
      orgId: auth.session.orgId,
      actorUserId: auth.session.sub,
      actorEmail: auth.session.email,
      action: "people.create",
      resourceType: "person",
      resourceId: row.id,
      ip: auth.ip,
      userAgent: auth.userAgent,
    });

    return NextResponse.json({ person: row }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, auth.correlationId);
    return jsonError(500, "INTERNAL_ERROR", "Failed to create person.", auth.correlationId);
  }
}
