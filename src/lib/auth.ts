import { cookies } from "next/headers";
import { getOrgById, getUserInOrg, listPermissionOverrides } from "@/db/repositories/orgs";
import { SESSION_COOKIE_NAME, decodeSession } from "@/lib/session";
import { hasPermission, type Permission, type Role } from "@/lib/permissions";

export type CurrentUser = {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: Role;
  managerOfTeamId: string | null;
  financeRead: boolean;
  locale: string | null;
};

/**
 * Loads the authenticated user fresh from the DB on every request (rather
 * than trusting cached claims in the cookie) so role/permission changes made
 * in the admin UI take effect immediately — no stale-privilege window.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE_NAME)?.value;
  const session = decodeSession(token);
  if (!session) return null;
  const user = await getUserInOrg(session.orgId, session.userId);
  if (!user) return null;
  return {
    id: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    managerOfTeamId: user.managerOfTeamId,
    financeRead: user.financeRead,
    locale: user.locale,
  };
}

export async function getCurrentOrg(orgId: string) {
  return getOrgById(orgId);
}

export class ForbiddenError extends Error {
  constructor(public permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}

export class UnauthenticatedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthenticatedError";
  }
}

/** Throws UnauthenticatedError/ForbiddenError — route handlers translate to 401/403. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthenticatedError();
  const overrides = await listPermissionOverrides(user.orgId);
  if (!hasPermission(user.role, permission, overrides)) {
    throw new ForbiddenError(permission);
  }
  return user;
}
