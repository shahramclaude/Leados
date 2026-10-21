/**
 * Central permission registry (Section C). Roles map to a base permission
 * set; orgs may override individual (role, permission) pairs via
 * `role_permission_overrides` (audited). Scopes layer ABAC on top of RBAC:
 * a Manager only gets `subjects.read`/`subjects.write` for their own team
 * unless they also hold a wider scope.
 */
export const ROLES = ["admin", "executive", "hr", "manager", "contributor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "subjects.read",
  "subjects.write",
  "briefings.read",
  "briefings.write",
  "findings.read",
  "playbooks.read",
  "playbooks.write",
  "team.manage",
  "finance.read",
  "org.profile.manage",
  "featureFlags.manage",
  "permissions.manage",
  "users.manage",
  "audit.read",
  "onboarding.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const BASE_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...PERMISSIONS],
  executive: ["subjects.read", "briefings.read", "findings.read", "playbooks.read", "audit.read"],
  hr: [
    "subjects.read",
    "subjects.write",
    "briefings.read",
    "briefings.write",
    "findings.read",
    "playbooks.read",
    "playbooks.write",
    "users.manage",
  ],
  manager: ["subjects.read", "subjects.write", "briefings.read", "findings.read", "playbooks.read", "team.manage"],
  contributor: ["subjects.read", "findings.read", "playbooks.read"],
  viewer: ["subjects.read", "briefings.read", "findings.read", "playbooks.read"],
};

export type PermissionOverride = { role: string; permission: string; allowed: boolean };

/** Effective matrix = base matrix with org overrides applied on top. */
export function effectivePermissionMatrix(
  overrides: PermissionOverride[],
): Record<Role, Record<Permission, boolean>> {
  const matrix = {} as Record<Role, Record<Permission, boolean>>;
  for (const role of ROLES) {
    matrix[role] = {} as Record<Permission, boolean>;
    for (const permission of PERMISSIONS) {
      matrix[role][permission] = BASE_ROLE_PERMISSIONS[role].includes(permission);
    }
  }
  for (const override of overrides) {
    if ((ROLES as readonly string[]).includes(override.role) && (PERMISSIONS as readonly string[]).includes(override.permission)) {
      matrix[override.role as Role][override.permission as Permission] = override.allowed;
    }
  }
  return matrix;
}

export function hasPermission(
  role: Role,
  permission: Permission,
  overrides: PermissionOverride[] = [],
): boolean {
  const override = overrides.find((o) => o.role === role && o.permission === permission);
  if (override) return override.allowed;
  return BASE_ROLE_PERMISSIONS[role].includes(permission);
}

export type AbacScope = {
  managerOfTeamId?: string | null;
  financeRead?: boolean;
};

/**
 * Scoped check for subject-level actions: a Manager may only write subjects
 * on their own team unless they are Admin/HR (org-wide write).
 */
export function canActOnSubjectTeam(role: Role, scope: AbacScope, subjectTeamId: string | null): boolean {
  if (role === "admin" || role === "hr") return true;
  if (role === "manager") return !!scope.managerOfTeamId && scope.managerOfTeamId === subjectTeamId;
  return false;
}

export function reasonForDenied(permission: Permission): string {
  return `permission.denied.${permission}`;
}
