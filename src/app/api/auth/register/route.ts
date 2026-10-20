import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  ApiError,
  enforceRateLimit,
  getClientIp,
  getCorrelationId,
  jsonError,
  parseJsonBody,
} from "@/lib/apiUtils";
import { CSRF_COOKIE, CSRF_HEADER, csrfCookieOptions, generateCsrfToken, verifyCsrf } from "@/lib/csrf";
import { registerSchema } from "@/lib/validation";
import { assessPasswordStrength } from "@/lib/password";
import { AuthServiceError, createOrgAndAdmin, createSessionForUser } from "@/lib/authService";
import { recordAuditEvent } from "@/lib/audit";
import { sessionCookieOptions, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Public route (new tenant signup) — still CSRF-checked via double-submit
 * cookie (the browser must first GET /api/csrf) and tightly rate-limited
 * per IP to blunt automated account-farming / credential stuffing setup.
 */
export async function POST(req: NextRequest) {
  const correlationId = getCorrelationId(req);
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");

  const limited = enforceRateLimit(req, "auth:register", 5, 60 * 60 * 1000);
  if (limited) return limited;

  const cookieToken = req.cookies.get(CSRF_COOKIE)?.value;
  const headerToken = req.headers.get(CSRF_HEADER);
  if (!verifyCsrf(cookieToken, headerToken)) {
    return jsonError(403, "CSRF_REJECTED", "Missing or invalid CSRF token.", correlationId);
  }

  try {
    const body = await parseJsonBody(req, registerSchema);
    const strength = assessPasswordStrength(body.password);
    if (!strength.ok) {
      return jsonError(422, "WEAK_PASSWORD", strength.reason ?? "Password too weak.", correlationId);
    }

    const { org, user } = await createOrgAndAdmin(body.orgName, body.email, body.password);
    const { token, maxAgeSeconds } = await createSessionForUser(user, ip, userAgent);

    await recordAuditEvent({
      correlationId,
      orgId: org.id,
      actorUserId: user.id,
      actorEmail: user.email,
      action: "auth.register",
      resourceType: "organization",
      resourceId: org.id,
      ip,
      userAgent,
    });

    const res = NextResponse.json({
      user: { id: user.id, email: user.email, role: user.role, orgId: org.id },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAgeSeconds));
    res.cookies.set(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());
    return res;
  } catch (err) {
    if (err instanceof AuthServiceError) {
      return jsonError(409, err.code, err.message, correlationId);
    }
    if (err instanceof ApiError) {
      return jsonError(err.status, err.code, err.message, correlationId);
    }
    if (err instanceof ZodError) {
      return jsonError(422, "VALIDATION_ERROR", err.message, correlationId);
    }
    return jsonError(500, "INTERNAL_ERROR", "Registration failed.", correlationId);
  }
}
