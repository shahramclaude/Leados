import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { jsonError, secureRoute } from "@/lib/apiUtils";
import { recordAuditEvent } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

type Params = { id: string };

// A user may only revoke their OWN sessions — scoped by userId, never by a
// client-supplied org or user id, so this cannot be used to kick another
// user's session (that is the admin role-change path, which is intentional
// and separately audited).
export const DELETE = secureRoute<Params>({
  method: "DELETE",
  path: "/api/sessions/:id",
  handler: async ({ request, session, params }) => {
    const s = session as SessionUser;
    const [row] = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.id, params.id), eq(sessions.userId, s.userId)));
    if (!row) return jsonError(404, "NOT_FOUND", "Session not found");

    await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.id));

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "session.revoke",
      resourceType: "session",
      resourceId: row.id,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });

    return NextResponse.json({ ok: true });
  },
});
