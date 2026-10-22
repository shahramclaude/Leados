import { NextResponse, type NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

export const GET = secureRoute({
  method: "GET",
  path: "/api/audit",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.orgId, s.orgId))
      .orderBy(desc(auditLog.seq))
      .limit(200);

    // Reading the audit log is itself an audited, sensitive action
    // (investigators' access to the trail must itself be traceable).
    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "audit.read",
      resourceType: "audit_log",
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });

    return NextResponse.json({ events: rows });
  },
});
