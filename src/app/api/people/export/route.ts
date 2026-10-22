import { type NextRequest } from "next/server";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { exportConsents, people } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { toCsv, recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

const CONSENT_VALIDITY_MS = 10 * 60 * 1000; // a consent grant covers one export action, within 10 minutes

// Export-consent flow (Part 19 Phase 2): rather than silently letting any
// "people:export"-permitted role download the full roster, the UI first
// calls POST /api/consent/export (which records a timestamped,
// audit-logged grant) and only then calls this endpoint. This makes "I
// exported the whole org's data" a conscious, logged act rather than a side
// effect of clicking a link, without blocking automation (a script can call
// both endpoints back to back; the point is the audit trail, not friction).
export const GET = secureRoute({
  method: "GET",
  path: "/api/people/export",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const [consent] = await db
      .select()
      .from(exportConsents)
      .where(
        and(
          eq(exportConsents.userId, s.userId),
          eq(exportConsents.scope, "people_export"),
          gte(exportConsents.grantedAt, new Date(Date.now() - CONSENT_VALIDITY_MS)),
        ),
      )
      .orderBy(desc(exportConsents.grantedAt))
      .limit(1);

    if (!consent) {
      return jsonError(
        428,
        "CONSENT_REQUIRED",
        "Explicit export consent is required first: POST /api/consent/export",
      );
    }

    const rows = await db
      .select()
      .from(people)
      .where(and(eq(people.orgId, s.orgId), isNull(people.deletedAt)));

    const csv = toCsv(rows.map((r) => ({ firstName: r.firstName, lastName: r.lastName, email: r.email ?? "" })));

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.export",
      resourceType: "people",
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { rowCount: rows.length, consentId: consent.id },
    });

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"people-export.csv\"",
        "x-content-type-options": "nosniff",
      },
    });
  },
});
