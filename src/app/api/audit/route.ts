import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import { jsonError, parseQuery, secureRoute } from "@/lib/apiUtils";
import { auditQuerySchema } from "@/lib/validation/schemas";
import { recordAuditEvent } from "@/lib/audit";

// The admin audit view is itself audited (`audit.read`) — "who looked at
// the audit log, when, and with which filters" is exactly the kind of
// question an investigator needs answered (see adversarial self-review #2
// in docs/SECURITY.md).
export const GET = secureRoute({
  method: "GET",
  path: "/api/audit",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsed = parseQuery(new URL(request.url), auditQuerySchema);
    if (!parsed.ok) return parsed.response;
    const { action, actorUserId, resourceType, from, to, limit, offset } = parsed.data;

    const conditions = [eq(auditLog.orgId, session.orgId)];
    if (action) conditions.push(eq(auditLog.action, action));
    if (actorUserId) conditions.push(eq(auditLog.actorUserId, actorUserId));
    if (resourceType) conditions.push(eq(auditLog.resourceType, resourceType));
    if (from) conditions.push(gte(auditLog.createdAt, new Date(from)));
    if (to) conditions.push(lte(auditLog.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.seq))
      .limit(limit)
      .offset(offset);

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "audit.read",
      resourceType: "audit_log",
      metadata: { filters: { action, actorUserId, resourceType, from, to }, resultCount: rows.length },
    });

    return NextResponse.json({ events: rows });
  },
});
