import { NextRequest, NextResponse } from "next/server";
import { isAuthContext, requireAuth } from "@/lib/apiUtils";
import { PERMISSIONS } from "@/lib/permissions";
import { queryAuditLog, recordAuditEvent, toCsv } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.AUDIT_EXPORT });
  if (!isAuthContext(auth)) return auth;

  const rows = await queryAuditLog({ orgId: auth.session.orgId, limit: 500 });
  const csv = toCsv(
    rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), metadata: JSON.stringify(r.metadata) })),
  );

  await recordAuditEvent({
    correlationId: auth.correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "audit.export",
    resourceType: "audit_log",
    metadata: { count: rows.length, format: "csv" },
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"audit-log-export.csv\"",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
