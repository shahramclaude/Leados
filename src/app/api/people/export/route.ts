import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

function csvEscape(value: string): string {
  const needsQuoting = /[",\n]/.test(value);
  const escaped = value.replace(/"/g, '""');
  // Neutralise spreadsheet formula injection on export too, defence in
  // depth: data re-imported elsewhere should not execute as a formula.
  const safe = /^[=+\-@\t\r]/.test(escaped) ? `'${escaped}` : escaped;
  return needsQuoting ? `"${safe}"` : safe;
}

// Bulk export is one of the highest-value targets for an insider or a
// compromised account, so it is its own permission (`people:export`, not
// bundled into `people:read`) and its own heavily-annotated audit event —
// see docs/THREAT-MODEL.md "bulk export" and the anomaly-detection runbook
// in docs/SECURITY.md.
export const GET = secureRoute({
  method: "GET",
  path: "/api/people/export",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");

    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.orgId, session.orgId), isNull(people.deletedAt)));

    const header = ["fullName", "email", "phone", "notes", "createdAt"].join(",");
    const lines = rows.map((r) =>
      [r.fullName, r.email ?? "", r.phone ?? "", r.notes ?? "", r.createdAt.toISOString()]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
    const csv = [header, ...lines].join("\r\n");

    const { id: auditId } = await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "people.export",
      resourceType: "person",
      metadata: { rowCount: rows.length },
      ip: await getClientIp(),
    });

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="people-export.csv"`,
        "X-Audit-Event-Id": auditId,
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
});
