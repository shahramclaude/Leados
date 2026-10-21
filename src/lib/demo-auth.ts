// Demo identity resolution.
//
// IMPORTANT — read before trusting this in any real deployment: LEADOS does
// not yet have real authentication (no password/OIDC/SSO flow). This module
// resolves "who is making this request" from a plain, unsigned cookie that
// names a seeded demo user. It exists so every other seam (tenancy,
// permissions, envelope attribution) has a real actor to attach to, but it is
// NOT a security boundary. See docs/RED-TEAM-2026.md SEC-1 (critical).

import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import type { Role } from "@/lib/permissions";

export const DEMO_USER_COOKIE = "leados_demo_user";
export const DEMO_ORG_COOKIE = "leados_demo_org";

export type SessionContext = {
  userId: string;
  userEmail: string;
  orgId: string;
  role: Role;
};

export async function getSessionContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const userId = store.get(DEMO_USER_COOKIE)?.value;
  const orgId = store.get(DEMO_ORG_COOKIE)?.value;
  if (!userId || !orgId) return null;

  const [row] = await db
    .select({ role: memberships.role, email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId)));

  if (!row) return null;
  return { userId, orgId, role: row.role as Role, userEmail: row.email };
}
