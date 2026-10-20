import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { ApiError, isAuthContext, jsonError, parseJsonBody, requireAuth } from "@/lib/apiUtils";
import { sessionRevokeSchema } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { revokeSession } from "@/lib/authService";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Incident-response primitive: force-revoke any session in the caller's org. */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.SESSION_REVOKE });
  if (!isAuthContext(auth)) return auth;

  try {
    const body = await parseJsonBody(req, sessionRevokeSchema);

    const [target] = await db
      .select({ id: sessions.id, orgId: users.orgId })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, body.sessionId))
      .limit(1);

    if (!target || target.orgId !== auth.session.orgId) {
      // Same response whether the session belongs to another org or does
      // not exist — do not leak cross-tenant existence.
      return jsonError(404, "NOT_FOUND", "Session not found.", auth.correlationId);
    }

    await revokeSession(body.sessionId, body.reason ?? "admin_revoked");

    await recordAuditEvent({
      correlationId: auth.correlationId,
      orgId: auth.session.orgId,
      actorUserId: auth.session.sub,
      actorEmail: auth.session.email,
      action: "auth.session.revoke",
      resourceType: "session",
      resourceId: body.sessionId,
      reason: body.reason,
      ip: auth.ip,
      userAgent: auth.userAgent,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, auth.correlationId);
    return jsonError(500, "INTERNAL_ERROR", "Failed to revoke session.", auth.correlationId);
  }
}
