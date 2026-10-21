import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { jsonError, readJson, secureRoute } from "@/lib/apiUtils";
import { userInviteSchema } from "@/lib/validation/schemas";
import { hashPassword } from "@/lib/crypto";
import { canAssignRole } from "@/lib/authz/permissions";
import { recordAuditEvent } from "@/lib/audit";
import { getClientIp } from "@/lib/session";

export const GET = secureRoute({
  method: "GET",
  path: "/api/users",
  handler: async ({ session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.orgId, session.orgId));
    return NextResponse.json({ users: rows });
  },
});

// Creates/invites a user scoped to the caller's own org, and refuses to
// grant a role more privileged than the caller's own (vertical-escalation
// guard — see src/lib/authz/permissions.ts#canAssignRole). `users:manage`
// alone is not sufficient to mint a new owner from an admin account.
export const POST = secureRoute({
  method: "POST",
  path: "/api/users",
  handler: async ({ request, session }) => {
    if (!session) return jsonError(401, "Authentication required");
    const parsed = await readJson(request, userInviteSchema);
    if (!parsed.ok) return parsed.response;
    const { email, role, temporaryPassword } = parsed.data;

    if (!canAssignRole(session.role, role)) {
      return jsonError(403, "Cannot grant a role more privileged than your own");
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email)))
      .limit(1);
    if (existing) return jsonError(409, "A user with that email already exists");

    const passwordHash = await hashPassword(temporaryPassword);
    const [row] = await db
      .insert(users)
      .values({
        orgId: session.orgId,
        email,
        role,
        passwordHash,
        mustChangePassword: true,
        securityStamp: randomUUID(),
      })
      .returning({ id: users.id, email: users.email, role: users.role });

    await recordAuditEvent({
      orgId: session.orgId,
      actorUserId: session.userId,
      actorRole: session.role,
      action: "users.invite",
      resourceType: "user",
      resourceId: row.id,
      ip: await getClientIp(),
      metadata: { invitedRole: role },
    });

    return NextResponse.json({ user: row }, { status: 201 });
  },
});
