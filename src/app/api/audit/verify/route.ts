import { NextResponse, type NextRequest } from "next/server";
import { secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent, verifyAuditChain } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

export const GET = secureRoute({
  method: "GET",
  path: "/api/audit/verify",
  handler: async ({ request, session }: { request: NextRequest; session: SessionUser | null }) => {
    const s = session!;
    const result = await verifyAuditChain(s.orgId);

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "audit.verify",
      resourceType: "audit_log",
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { valid: result.valid, checked: result.checked },
    });

    return NextResponse.json(result, { status: result.valid ? 200 : 409 });
  },
});
