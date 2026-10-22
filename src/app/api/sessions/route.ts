import { NextResponse, type NextRequest } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { secureRoute } from "@/lib/apiUtils";
import type { SessionUser } from "@/lib/session";

// Device/session management (Part 19 Phase 2): lets a user see every
// non-revoked session tied to their account, which is what they actually
// need to answer "is someone else logged into my account" — a plainer and
// more actionable surface than raw audit log rows.
export const GET = secureRoute({
  method: "GET",
  path: "/api/sessions",
  handler: async ({ session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const rows = await db
      .select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, ip: sessions.ip, userAgent: sessions.userAgent })
      .from(sessions)
      .where(and(eq(sessions.userId, s.userId), isNull(sessions.revokedAt)));
    return NextResponse.json({ sessions: rows.map((r) => ({ ...r, isCurrent: r.id === s.sessionId })) });
  },
});
