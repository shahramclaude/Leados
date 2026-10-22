import { NextResponse, type NextRequest } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, sessions, users } from "@/db/schema";
import { secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

// "What's stored about me" privacy dashboard (Part 19 Phase 2 / Part 09's
// contestation surface): a user's own profile row, their active sessions,
// and every audit event where they are either the actor or the subject of
// the action, in one place, so a data-subject-access question
// (docs/RUNBOOKS.md "Data subject request") can usually be answered by the
// user themselves without needing an admin or an engineer.
export const GET = secureRoute({
  method: "GET",
  path: "/api/privacy/me",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;

    const [profile] = await db
      .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, s.userId));

    const activeSessions = await db
      .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, s.userId)));

    const relatedAuditEvents = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.orgId, s.orgId), or(eq(auditLog.actorUserId, s.userId), eq(auditLog.resourceId, s.userId))))
      .limit(200);

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "privacy.self_read",
      resourceType: "privacy_dashboard",
      resourceId: s.userId,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    }).catch(() => {});

    return NextResponse.json({ profile, sessions: activeSessions, auditEvents: relatedAuditEvents });
  },
});
