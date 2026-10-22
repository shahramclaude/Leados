import { NextResponse, type NextRequest } from "next/server";
import { clientIp, jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { loginSchema } from "@/lib/validation";
import { authenticateWithPassword } from "@/lib/authService";
import { setSessionCookie } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rateLimit";

const IP_LOGIN_LIMIT = 10;
const IP_LOGIN_WINDOW_MS = 5 * 60 * 1000;

export const POST = secureRoute({
  method: "POST",
  path: "/api/auth/login",
  handler: async ({ request }: { request: NextRequest }) => {
    const ip = clientIp(request) ?? "unknown";
    const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
    const userAgent = request.headers.get("user-agent");

    const rate = consumeRateLimit(`login:${ip}`, IP_LOGIN_LIMIT, IP_LOGIN_WINDOW_MS);
    if (!rate.allowed) {
      await recordAuditEvent({
        orgId: null,
        actorUserId: null,
        action: "security.rate_limited",
        resourceType: "login",
        correlationId,
        ip,
        userAgent,
        reason: "IP login rate limit exceeded",
      }).catch(() => {});
      return jsonError(429, "RATE_LIMITED", "Too many login attempts from this network. Try again later.");
    }

    const parsed = await readJson(request, loginSchema);
    if (!parsed.ok) return parsed.response;

    const result = await authenticateWithPassword(parsed.data.email, parsed.data.password, ip, userAgent);

    if (result.outcome === "locked") {
      await recordAuditEvent({
        orgId: null,
        actorUserId: null,
        actorEmail: parsed.data.email,
        action: "auth.login.locked",
        resourceType: "user",
        correlationId,
        ip,
        userAgent,
        reason: "account locked after repeated failed attempts",
      }).catch(() => {});
      return jsonError(423, "ACCOUNT_LOCKED", "Account temporarily locked due to repeated failed attempts", {
        retryAfterMs: result.retryAfterMs,
      });
    }

    if (result.outcome === "invalid_credentials") {
      await recordAuditEvent({
        orgId: null,
        actorUserId: null,
        actorEmail: parsed.data.email,
        action: "auth.login.failure",
        resourceType: "user",
        correlationId,
        ip,
        userAgent,
      }).catch(() => {});
      return jsonError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }

    await setSessionCookie(result.token);
    await recordAuditEvent({
      orgId: result.user.orgId,
      actorUserId: result.user.id,
      actorEmail: result.user.email,
      actorRole: result.user.role,
      action: "auth.login.success",
      resourceType: "user",
      resourceId: result.user.id,
      correlationId,
      ip,
      userAgent,
    });

    return NextResponse.json({ user: { id: result.user.id, email: result.user.email, role: result.user.role } });
  },
});
