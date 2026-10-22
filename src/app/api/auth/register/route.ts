import { NextResponse, type NextRequest } from "next/server";
import { clientIp, jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { registerSchema } from "@/lib/validation";
import { createOrgAndAdmin, createSessionForUser } from "@/lib/authService";
import { setSessionCookie } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";
import { consumeRateLimit } from "@/lib/rateLimit";

const REGISTER_LIMIT = 10;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export const POST = secureRoute({
  method: "POST",
  path: "/api/auth/register",
  handler: async ({ request }: { request: NextRequest }) => {
    const ip = clientIp(request) ?? "unknown";
    const rate = consumeRateLimit(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS);
    if (!rate.allowed) {
      return jsonError(429, "RATE_LIMITED", "Too many registration attempts. Try again later.");
    }

    const parsed = await readJson(request, registerSchema);
    if (!parsed.ok) return parsed.response;

    const correlationId = request.headers.get("x-correlation-id") ?? crypto.randomUUID();
    try {
      const { org, user } = await createOrgAndAdmin(parsed.data.orgName, parsed.data.email, parsed.data.password);
      const { token } = await createSessionForUser(user, ip, request.headers.get("user-agent"));
      await setSessionCookie(token);
      await recordAuditEvent({
        orgId: org.id,
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "auth.register",
        resourceType: "organization",
        resourceId: org.id,
        correlationId,
        ip,
        userAgent: request.headers.get("user-agent"),
      });
      return NextResponse.json({ org: { id: org.id, name: org.name }, user: { id: user.id, email: user.email, role: user.role } }, { status: 201 });
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_ALREADY_REGISTERED") {
        return jsonError(409, "EMAIL_TAKEN", "An account with this email already exists");
      }
      throw err;
    }
  },
});
