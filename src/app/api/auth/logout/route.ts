import { NextResponse } from "next/server";
import { secureRoute } from "@/lib/apiUtils";
import { destroySession } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";

export const POST = secureRoute({
  method: "POST",
  path: "/api/auth/logout",
  handler: async ({ session }) => {
    if (session) {
      await destroySession(session.sessionId);
      await recordAuditEvent({
        orgId: session.orgId,
        actorUserId: session.userId,
        actorRole: session.role,
        action: "auth.logout",
        resourceType: "user",
        resourceId: session.userId,
      });
    }
    return NextResponse.json({ ok: true });
  },
});
