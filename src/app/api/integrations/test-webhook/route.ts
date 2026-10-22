import { NextResponse, type NextRequest } from "next/server";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { webhookUrlCheckSchema } from "@/lib/validation";
import { checkUrlForSsrf } from "@/lib/ssrf";
import { recordAuditEvent } from "@/lib/audit";
import { db } from "@/db";
import { securityEventLog } from "@/db/schema";
import type { SessionUser } from "@/lib/session";

// SSRF guard demo endpoint for the one URL-taking feature in this slice
// (a future "notify this webhook on import" integration). Deliberately does
// NOT perform the actual outbound fetch here — it validates the URL against
// src/lib/ssrf.ts and returns the verdict, so the guard itself is the thing
// under test (tests/security/ssrf.test.ts) independent of network
// availability in CI/this sandbox. A real "send webhook" code path must call
// `checkUrlForSsrf` with this same function immediately before any `fetch`,
// not just at registration time (a URL that was safe at registration can be
// repointed via DNS later — re-check on every use).
export const POST = secureRoute({
  method: "POST",
  path: "/api/integrations/test-webhook",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const parsed = await readJson(request, webhookUrlCheckSchema);
    if (!parsed.ok) return parsed.response;

    const result = await checkUrlForSsrf(parsed.data.url);

    if (!result.ok) {
      await db.insert(securityEventLog).values({ kind: "ssrf_blocked", detail: { url: parsed.data.url, reason: result.reason, userId: s.userId } });
      await recordAuditEvent({
        orgId: s.orgId,
        actorUserId: s.userId,
        actorEmail: s.email,
        actorRole: s.role,
        action: "security.ssrf_blocked",
        resourceType: "webhook_url",
        correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
        reason: result.reason,
      });
      return jsonError(422, "URL_REJECTED", "This URL is not allowed", { reason: result.reason });
    }

    return NextResponse.json({ ok: true });
  },
});
