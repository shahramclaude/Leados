import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { isAuthContext, requireAuth } from "@/lib/apiUtils";
import { toCsv } from "@/lib/audit";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Exports are treated as a distinct, higher-risk action from a plain list:
 * separate permission (`people:export`), and every export is an audited
 * event recording exactly how many records left the system and who did it.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.PEOPLE_EXPORT });
  if (!isAuthContext(auth)) return auth;

  const rows = await db
    .select({
      id: people.id,
      firstName: people.firstName,
      lastName: people.lastName,
      email: people.email,
      phone: people.phone,
      createdAt: people.createdAt,
    })
    .from(people)
    .where(and(eq(people.orgId, auth.session.orgId), isNull(people.deletedAt)));

  const csv = toCsv(rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })));

  await recordAuditEvent({
    correlationId: auth.correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "people.export",
    resourceType: "person",
    metadata: { count: rows.length, format: "csv" },
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"people-export.csv\"",
      // Defense in depth against content sniffing of the downloaded file.
      "X-Content-Type-Options": "nosniff",
    },
  });
}
