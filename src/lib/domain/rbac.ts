// src/lib/domain/rbac.ts — pure RBAC matrix. No I/O, no Next.js imports, so
// it is testable without a database and shareable between server-side
// enforcement (src/lib/platform/authz.ts) and permission-aware UI.

import type { Permission, Role } from "./types";

export const ROLES: Role[] = ["admin", "executive", "hr", "manager", "contributor", "viewer"];

export const ALL_PERMISSIONS: Permission[] = [
  "findings:view",
  "findings:create",
  "findings:resolve",
  "settings:view",
  "settings:edit",
  "featureFlags:edit",
  "permissions:view",
  "onboarding:run",
  "push:manage",
];

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [...ALL_PERMISSIONS],
  executive: ["findings:view", "settings:view"],
  hr: ["findings:view", "findings:create", "findings:resolve", "settings:view"],
  manager: ["findings:view", "findings:create", "findings:resolve"],
  contributor: ["findings:view", "findings:create"],
  viewer: ["findings:view"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Human-readable i18n key per role, resolved through the message catalog — never a hard-coded label. */
export function roleLabelKey(role: Role): string {
  return `role.${role}`;
}

export function permissionLabelKey(permission: Permission): string {
  return `permission.${permission.replace(":", ".")}`;
}

export class ForbiddenError extends Error {
  constructor(public readonly permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}
