import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { roleChangeSchema } from "@/lib/validation";
import { recordAuditEvent } from "@/lib/audit";
import { invalidateAllSessionsForUser } from "@/lib/session";
import type { SessionUser } from "@/lib/session";

type Params = { id: string };

// Session rotation on privilege change (Part 19 Phase 1-a): changing a
// user's role immediately bumps their `sessionVersion`, which invalidates
// every JWT minted under the old role on the user's next request (see
// src/lib/session.ts getSession()) — they do not get to keep acting under
// the old role for up to IDLE_TIMEOUT_MS just because their token hasn't
// expired yet. All of their existing session rows are also explicitly
// revoked so `/api/sessions` (device management) reflects the change too.
export const PATCH = secureRoute<Params>({
  method: "PATCH",
  path: "/api/admin/users/:id/role",
  handler: async ({ request, session, params }) => {
    const s = session as SessionUser;
    const parsed = await readJson(request, roleChangeSchema);
    if (!parsed.ok) return parsed.response;

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, params.id), eq(users.orgId, s.orgId)));
    if (!target) return jsonError(404, "NOT_FOUND", "User not found in your organization");

    if (target.id === s.userId && parsed.data.role !== "admin") {
      return jsonError(409, "CANNOT_SELF_DEMOTE", "You cannot remove your own admin access this way");
    }

    const previousRole = target.role;
    await db.update(users).set({ role: parsed.data.role }).where(eq(users.id, target.id));
    await invalidateAllSessionsForUser(target.id);

    await recordAuditEvent({
      orgId: s.orgId,
      actorUserId: s.userId,
      actorEmail: s.email,
      actorRole: s.role,
      action: "users.role_change",
      resourceType: "user",
      resourceId: target.id,
      reason: parsed.data.reason,
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
      metadata: { previousRole, newRole: parsed.data.role },
    });

    return NextResponse.json({ user: { id: target.id, role: parsed.data.role, previousRole } });
  },
});
