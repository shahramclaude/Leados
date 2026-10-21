import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";

function csvEscape(value: string): string {
  const needsQuoting = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped;
  return needsQuoting ? `"${safe}"` : safe;
}

export const GET = secureRoute({
  method: "GET",
  path: "/api/audit/export",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");

    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, session.orgId)).orderBy(asc(auditLog.seq));

    const header = [
      "seq",
      "createdAt",
      "action",
      "resourceType",
      "resourceId",
      "actorUserId",
      "correlationId",
      "reason",
      "hash",
      "prevHash",
    ].join(",");
    const lines = rows.map((r) =>
      [r.seq, r.createdAt.toISOString(), r.action, r.resourceType, r.resourceId ?? "", r.actorUserId ?? "", r.correlationId, r.reason ?? "", r.hash, r.prevHash]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
    const csv = [header, ...lines].join("\r\n");

    const { id } = await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "audit.export",
      resourceType: "audit_log",
      metadata: { rowCount: rows.length },
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-export.csv"`,
        "X-Audit-Event-Id": id,
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
});
