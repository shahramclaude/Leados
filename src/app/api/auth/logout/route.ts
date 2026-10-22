import { NextResponse, type NextRequest } from "next/server";
import { secureRoute } from "@/lib/apiUtils";
import { clearSessionCookie, revokeSession, type SessionUser } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";

export const POST = secureRoute({
  method: "POST",
  path: "/api/auth/logout",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    if (session) {
      await revokeSession(session.sessionId);
      await recordAuditEvent({
        orgId: session.orgId,
        actorUserId: session.userId,
        actorEmail: session.email,
        actorRole: session.role,
        action: "auth.logout",
        resourceType: "session",
        resourceId: session.sessionId,
        correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      });
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  },
});
