import { NextRequest, NextResponse } from "next/server";
import {
  ApiError,
  enforceRateLimit,
  getClientIp,
  getCorrelationId,
  jsonError,
  parseJsonBody,
} from "@/lib/apiUtils";
import { CSRF_COOKIE, CSRF_HEADER, csrfCookieOptions, generateCsrfToken, verifyCsrf } from "@/lib/csrf";
import { loginSchema } from "@/lib/validation";
import { AuthServiceError, authenticateUser, createSessionForUser } from "@/lib/authService";
import { recordAuditEvent } from "@/lib/audit";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  // Dual rate limit: per-IP (blunts distributed guessing against one IP) is
  // intentionally tighter than typical traffic; account-level lockout in
  // authenticateUser() covers credential stuffing across many IPs.
  const limited = enforceRateLimit(req, "auth:login", 10, 60 * 1000);
  if (limited) return limited;

  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!verifyCsrf(cookieToken, headerToken)) {
    return jsonError(403, "CSRF_REJECTED", "Missing or invalid CSRF token.", correlationId);
  }

  try {
    const body = await parseJsonBody(req, loginSchema);
    const user = await authenticateUser(body.email, body.password);
    const { token, maxAgeSeconds } = await createSessionForUser(user, ip, userAgent);

    await recordAuditEvent({
      correlationId,
      orgId: user.orgId,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "auth.login.success",
      resourceType: "session",
      ip,
      userAgent,
    });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role, orgId: user.orgId },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAgeSeconds));
    res.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof AuthServiceError) {
      await recordAuditEvent({
        correlationId,
        orgId: null,
        actorUserId: null,
        actorEmail: null,
        action: err.code === "ACCOUNT_LOCKED" ? "auth.lockout" : "auth.login.failure",
        resourceType: "session",
        reason: err.code,
        ip,
        userAgent,
      });
      const status = err.code === "INVALID_CREDENTIALS" ? 401 : 423;
      return jsonError(status, err.code, err.message, correlationId);
    }
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, correlationId);
    }
    return jsonError(500, "INTERNAL_ERROR", "Login failed.", correlationId);
  }
}
