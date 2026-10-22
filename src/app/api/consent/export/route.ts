import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { exportConsents } from "@/db/schema";
import { clientIp, readJson, secureRoute } from "@/lib/apiUtils";
import { exportConsentSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

export const POST = secureRoute({
  method: "POST",
  path: "/api/consent/export",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const parsed = await readJson(request, exportConsentSchema);
    if (!parsed.ok) return parsed.response;

    const [consent] = await db
      .insert(exportConsents)
      .values({ orgId: s.orgId, userId: s.userId, scope: parsed.data.scope, ip: clientIp(request) })
      .returning();

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "people.export",
      resourceType: "export_consent",
      resourceId: consent.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      reason: "explicit consent granted before export",
      metadata: { scope: parsed.data.scope },
    });

    return NextResponse.json({ consent }, { status: 201 });
  },
});
