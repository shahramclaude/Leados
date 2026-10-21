import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "@/lib/crypto";
import { checkLoginRateLimit, recordLoginAttempt } from "@/lib/rateLimit";
import { createSession, getClientIp } from "@/lib/session";
import { issueCsrfToken, verifyCsrf } from "@/lib/csrf";
import { recordAuditEvent } from "@/lib/audit";

// Login is intentionally registered as `public` (unauthenticated by
// definition) but still requires a valid CSRF token: the client must call
// GET /api/auth/csrf first. This stops a cross-site form POST from driving
// the login endpoint (login CSRF / session-fixation-via-forced-login) even
// though no session exists yet.
export const POST = secureRoute({
  method: "POST",
  path: "/api/auth/login",
  handler: async ({ request }) => {
    const csrfOk = await verifyCsrf(request);
    if (!csrfOk) return jsonError(403, "CSRF validation failed");

    const parsed = await readJson(request, loginSchema);
    if (!parsed.ok) return parsed.response;
    const { email, password } = parsed.data;

    const ip = await getClientIp();

    const rateLimit = await checkLoginRateLimit(email, ip);
    if (!rateLimit.allowed) {
      await recordAuditEvent({
        orgId: null,
        actorUserId: null,
        action: "auth.lockout",
        resourceType: "user",
        resourceId: null,
        reason: "rate limit or account lockout in effect",
        ip,
        metadata: { email },
      });
      return jsonError(429, "Too many attempts. Try again later.", {
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      });
    }

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    // Always run a hash verification, even for a non-existent user, against
    // a fixed dummy hash so response timing does not reveal account
    // existence (mitigates email enumeration via timing side channel).
    const DUMMY_HASH =
      "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    if (!user || !passwordOk || user.status !== "active") {
      await recordLoginAttempt(email, ip, false);
      await recordAuditEvent({
        orgId: user?.orgId ?? null,
        actorUserId: user?.id ?? null,
        action: "auth.login.failure",
        resourceType: "user",
        resourceId: user?.id ?? null,
        reason: !user ? "unknown email" : user.status !== "active" ? "account disabled" : "bad password",
        ip,
        metadata: { email },
      });
      return jsonError(401, "Invalid email or password");
    }

    await recordLoginAttempt(email, ip, true);

    const userAgent = request.headers.get("user-agent");
    const session = await createSession({
      userId: user.id,
      orgId: user.orgId,
      role: user.role,
      securityStamp: user.securityStamp,
      ip,
      userAgent,
    });
    // Rotate the CSRF token on privilege boundary crossing (anonymous ->
    // authenticated) so a pre-login token cannot be replayed post-login.
    await issueCsrfToken();

    await recordAuditEvent({
      orgId: user.orgId,
      actorUserId: user.id,
      actorRole: user.role,
      action: "auth.login.success",
      resourceType: "user",
      resourceId: user.id,
      ip,
      userAgent,
      metadata: {},
    });

    return NextResponse.json({
      user: { id: session.userId, orgId: session.orgId, role: session.role, email: user.email },
      mustChangePassword: user.mustChangePassword,
    });
  },
});
