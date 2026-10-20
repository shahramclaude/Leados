/**
 * Centralized RBAC model. Every permission check in the app resolves through
 * `roleHasPermission` so there is exactly one place that encodes "who can do
 * what" — no route hand-rolls its own authorization logic.
 */
export const ROLES = ["admin", "manager", "member"] as const;
export type UserRole = (typeof ROLES)[number];

export const PERMISSIONS = {
  PEOPLE_READ: "people:read",
  PEOPLE_WRITE: "people:write",
  PEOPLE_DELETE: "people:delete",
  PEOPLE_EXPORT: "people:export",
  AUDIT_READ: "audit:read",
  AUDIT_EXPORT: "audit:export",
  USER_MANAGE: "user:manage",
  SESSION_REVOKE: "session:revoke",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PEOPLE_WRITE,
    PERMISSIONS.PEOPLE_DELETE,
    PERMISSIONS.PEOPLE_EXPORT,
    PERMISSIONS.AUDIT_READ,
    PERMISSIONS.AUDIT_EXPORT,
    PERMISSIONS.USER_MANAGE,
    PERMISSIONS.SESSION_REVOKE,
  ],
  manager: [
    PERMISSIONS.PEOPLE_READ,
    PERMISSIONS.PEOPLE_WRITE,
    PERMISSIONS.PEOPLE_EXPORT,
  ],
  member: [PERMISSIONS.PEOPLE_READ],
};

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsForRole(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
