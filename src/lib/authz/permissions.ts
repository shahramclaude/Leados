// Plain-language permission model. Four roles, explicit permission set per
// role — no implicit "admin can do everything" shortcut, so every check is
// a table lookup, not a guess, and the "why can't I do this" UI copy
// (src/components/PermissionExplainer.tsx) can be generated from this same
// table instead of hand-maintained prose that drifts from the real rule.
export type Role = "admin" | "manager" | "member" | "viewer";

export type Permission =
  | "public"
  | "authenticated"
  | "people:read"
  | "people:write"
  | "people:delete"
  | "people:export"
  | "people:import"
  | "audit:read"
  | "audit:verify"
  | "users:role_change"
  | "settings:incident_banner";

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    "people:read",
    "people:write",
    "people:delete",
    "people:export",
    "people:import",
    "audit:read",
    "audit:verify",
    "users:role_change",
    "settings:incident_banner",
  ],
  manager: ["people:read", "people:write", "people:export", "people:import"],
  member: ["people:read"],
  viewer: ["people:read"],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  if (permission === "public" || permission === "authenticated") return true;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export interface PermissionExplanation {
  allowed: boolean;
  roleCanDo: Permission[];
  whoCanDoThis: Role[];
}

/** Powers the "your role can't do X — here's why and who can" UX
 * (Part 19 Phase 2). Never used for the actual enforcement decision (that is
 * always `roleHasPermission` inside `secureRoute`) — only to explain one
 * after the fact. */
export function explainPermission(role: Role, permission: Permission): PermissionExplanation {
  const allowed = roleHasPermission(role, permission);
  const whoCanDoThis = (Object.keys(ROLE_PERMISSIONS) as Role[]).filter((r) =>
    ROLE_PERMISSIONS[r].includes(permission),
  );
  return { allowed, roleCanDo: ROLE_PERMISSIONS[role] ?? [], whoCanDoThis };
}

export const ALL_ROLES: Role[] = ["admin", "manager", "member", "viewer"];
