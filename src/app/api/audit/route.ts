import { NextRequest, NextResponse } from "next/server";
import { ApiError, isAuthContext, jsonError, requireAuth } from "@/lib/apiUtils";
import { auditQuerySchema } from "@/lib/validation";
import { PERMISSIONS } from "@/lib/permissions";
import { queryAuditLog, recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Reading the audit log is itself audited — "who watches the watchers". */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.AUDIT_READ });
  if (!isAuthContext(auth)) return auth;

  const url = new URL(req.url);
  const parsed = auditQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return jsonError(422, "VALIDATION_ERROR", parsed.error.message, auth.correlationId);
  }
  const { from, to, ...rest } = parsed.data;

  try {
    const rows = await queryAuditLog({
      orgId: auth.session.orgId,
      ...rest,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });

    await recordAuditEvent({
      correlationId: auth.correlationId,
      orgId: auth.session.orgId,
      actorUserId: auth.session.sub,
      actorEmail: auth.session.email,
      action: "audit.read",
      resourceType: "audit_log",
      metadata: { filters: rest, count: rows.length },
      ip: auth.ip,
      userAgent: auth.userAgent,
    });

    return NextResponse.json({ events: rows });
  } catch (err) {
    if (err instanceof ApiError) return jsonError(err.status, err.code, err.message, auth.correlationId);
    return jsonError(500, "INTERNAL_ERROR", "Failed to query audit log.", auth.correlationId);
  }
}
