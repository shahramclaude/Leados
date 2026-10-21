import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { roleChangeSchema } from "@/lib/validation/schemas";
import { canAssignRole } from "@/lib/authz/permissions";
import { revokeAllSessionsForUser } from "@/lib/session";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

const paramsSchema = z.object({ id: z.string().uuid() });

// Privilege changes are the single most security-relevant write in the
// system: this route (a) refuses to let an actor grant a role above their
// own rank (vertical escalation guard), (b) is strictly org-scoped
// (horizontal guard — you can only manage users in your own org), (c)
// bumps the target's `securityStamp` so every one of their existing
// sessions is invalidated on the next request (Part 17-A "session rotation
// on privilege change"), and (d) is audited with a `reason` required.
export const PATCH = secureRoute<{ id: string }>({
  method: "PATCH",
  path: "/api/users/:id/role",
  handler: async ({ request, session, params }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) return jsonError(400, "Invalid id");

    const parsedBody = await readJson(request, roleChangeSchema);
    if (!parsedBody.ok) return parsedBody.response;
    const { role, reason } = parsedBody.data;

    if (!canAssignRole(session.role, role)) {
      return jsonError(403, "Cannot grant a role more privileged than your own");
    }

    const [target] = await db
      .select({ id: users.id, orgId: users.orgId, role: users.role })
      .from(users)
      .where(and(eq(users.id, parsedParams.data.id), eq(users.orgId, session.orgId)))
      .limit(1);
    if (!target) return jsonError(404, "Not found");

    const newSecurityStamp = randomUUID();
    await db
      .update(users)
      .set({ role, securityStamp: newSecurityStamp, updatedAt: new Date() })
      .where(eq(users.id, target.id));

    const revokedCount = await revokeAllSessionsForUser(target.id, `role changed ${target.role} -> ${role}`);

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "users.role_change",
      resourceType: "user",
      resourceId: target.id,
      reason,
      ip: await getClientIp(),
      metadata: { fromRole: target.role, toRole: role, sessionsRevoked: revokedCount },
    });

    return NextResponse.json({ ok: true, sessionsRevoked: revokedCount });
  },
});
