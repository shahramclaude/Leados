import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { webhooks } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { webhookCreateSchema } from "@/lib/validation/schemas";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { randomToken } from "@/lib/crypto";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

export const GET = secureRoute({
  method: "GET",
  path: "/api/webhooks",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const rows = await db
      .select({ id: webhooks.id, url: webhooks.url, createdAt: webhooks.createdAt, disabledAt: webhooks.disabledAt })
      .from(webhooks)
      .where(eq(webhooks.orgId, session.orgId));
    // Secrets are never returned once set, even to admins of the same org.
    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "webhooks.list",
      resourceType: "webhook",
    });
    return NextResponse.json({ webhooks: rows });
  },
});

// SSRF boundary (Part 17-G): every webhook URL is validated against
// src/lib/ssrf.ts before being stored, blocking loopback/RFC1918/link-local
// targets (including DNS rebinding to those ranges) so an attacker cannot
// use this feature to make the server fetch its own metadata endpoint or
// internal services.
export const POST = secureRoute({
  method: "POST",
  path: "/api/webhooks",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsed = await readJson(request, webhookCreateSchema);
    if (!parsed.ok) return parsed.response;

    const ssrfCheck = await assertPublicHttpUrl(parsed.data.url);
    if (!ssrfCheck.ok) {
      return jsonError(422, `URL rejected: ${ssrfCheck.reason}`);
    }

    const secret = randomToken(32);
    const [row] = await db
      .insert(webhooks)
      .values({ orgId: session.orgId, url: parsed.data.url, secret, createdByUserId: session.userId })
      .returning({ id: webhooks.id, url: webhooks.url, createdAt: webhooks.createdAt });

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "webhooks.create",
      resourceType: "webhook",
      resourceId: row.id,
      ip: await getClientIp(),
    });

    // The signing secret is returned exactly once, at creation time, and
    // never again — same pattern as API keys.
    return NextResponse.json({ webhook: row, secret }, { status: 201 });
  },
});
