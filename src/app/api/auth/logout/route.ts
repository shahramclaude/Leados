import { NextRequest, NextResponse } from "next/server";
import { getCorrelationId, isAuthContext, requireAuth } from "@/lib/apiUtils";
import { SESSION_COOKIE } from "@/lib/session";
import { CSRF_COOKIE } from "@/lib/csrf";
import { revokeSession } from "@/lib/authService";
import { recordAuditEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const auth = await requireAuth(req);
  if (!isAuthContext(auth)) return auth;

  await revokeSession(auth.session.sid, "user_logout");
  await recordAuditEvent({
    correlationId,
    orgId: auth.session.orgId,
    actorUserId: auth.session.sub,
    actorEmail: auth.session.email,
    action: "auth.logout",
    resourceType: "session",
    resourceId: auth.session.sid,
    ip: auth.ip,
    userAgent: auth.userAgent,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(CSRF_COOKIE);
  return res;
}
