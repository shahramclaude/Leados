// Permission registry (Part 17 lineage).
//
// This is the ONLY place role -> permission mappings are defined. The
// internal API routes, the public API (Part 14), and the UI all import this
// module instead of hard-coding role checks. Keeping it in one file is what
// makes it possible to prove (tests/seams/permission-registry-routes.test.ts)
// that the registry actually covers the public routes.

export const PERMISSIONS = [
  "finding:read",
  "finding:write",
  "decision:write",
  "proposal:write",
  "proposal:approve",
  "agent_run:create",
  "agent_action:approve",
  "audit:read",
  "budget:read",
  "budget:manage",
  "admin:manage_members",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = "owner" | "admin" | "analyst" | "viewer";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    "finding:read",
    "finding:write",
    "decision:write",
    "proposal:write",
    "proposal:approve",
    "agent_run:create",
    "agent_action:approve",
    "audit:read",
    "budget:read",
    "budget:manage",
  ],
  analyst: [
    "finding:read",
    "finding:write",
    "decision:write",
    "proposal:write",
    "agent_run:create",
    "audit:read",
    "budget:read",
  ],
  viewer: ["finding:read", "audit:read", "budget:read"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Every route the public API exposes, declared alongside the permission it
 * requires. tests/seams/permission-registry-routes.test.ts asserts this list
 * is exhaustive against the actual route tree under src/app/api/public. */
export const PUBLIC_API_ROUTES: Record<string, Permission> = {
  "GET /api/public/v1/findings": "finding:read",
};
