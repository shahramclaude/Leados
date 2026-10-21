// Capability registry (origin: Part 07) + role matrix (origin: Part 13).
//
// Every permission check in the codebase goes through `roleHasPermission()`
// so the mapping lives in exactly one place. Routes never hand-roll "if
// role === 'admin'" checks (grep for that pattern in CI if it reappears).
export const PERMISSIONS = [
  "people:read",
  "people:write",
  "people:export",
  "people:import",
  "users:read",
  "users:manage",
  "roles:manage",
  "webhooks:manage",
  "audit:read",
  "audit:export",
  "agent:run",
  "org:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type Role = "owner" | "admin" | "manager" | "member" | "viewer";

export const ROLES: Role[] = ["owner", "admin", "manager", "member", "viewer"];

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    "people:read",
    "people:write",
    "people:export",
    "people:import",
    "users:read",
    "users:manage",
    "roles:manage",
    "webhooks:manage",
    "audit:read",
    "audit:export",
    "agent:run",
  ],
  manager: [
    "people:read",
    "people:write",
    "people:export",
    "people:import",
    "users:read",
    "webhooks:manage",
    "audit:read",
    "agent:run",
  ],
  member: ["people:read", "people:write", "agent:run"],
  viewer: ["people:read"],
};

export function roleHasPermission(role: string, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role as Role];
  return perms ? perms.includes(permission) : false;
}

/**
 * Only owners/admins may change another user's role, and nobody may grant a
 * role higher than their own (vertical-privilege-escalation guard used by
 * /api/users/[id]/role in addition to the permission check).
 */
const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, manager: 2, admin: 3, owner: 4 };

export function canAssignRole(actingRole: string, targetRole: string): boolean {
  const acting = ROLE_RANK[actingRole as Role];
  const target = ROLE_RANK[targetRole as Role];
  if (acting === undefined || target === undefined) return false;
  if (!roleHasPermission(actingRole, "roles:manage")) return false;
  // Cannot grant a role more privileged than (or equal to owner unless you
  // are the owner) your own.
  return target <= acting;
}
