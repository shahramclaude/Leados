import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { isAuthContext, requireAuth } from "@/lib/apiUtils";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Admin-only: list active sessions across the org for incident response. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { permission: PERMISSIONS.SESSION_REVOKE });
  if (!isAuthContext(auth)) return auth;

  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      email: users.email,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(users.orgId, auth.session.orgId), isNull(sessions.revokedAt)));

  return NextResponse.json({ sessions: rows });
}
