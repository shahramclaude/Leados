import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * THE route-permission registry.
 *
 * Every API route handler in `src/app/api/**` MUST have a corresponding
 * entry here. `scripts/check-route-permissions.ts` (wired into `npm run
 * security:routes` and CI) statically scans the filesystem for route
 * modules + their exported HTTP methods and fails the build if it finds a
 * route/method pair with no registry entry, or a registry entry pointing at
 * a route that no longer exists. This makes "every route has an explicit,
 * reviewed permission decision" a structural property of the repo instead
 * of a convention someone can forget.
 */
export type AccessLevel = "PUBLIC" | "AUTH_ONLY" | Permission;

export interface RouteRegistryEntry {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Next.js app-router path, using `[param]` for dynamic segments. */
  path: string;
  access: AccessLevel;
  description: string;
}

export const ROUTE_PERMISSION_REGISTRY: RouteRegistryEntry[] = [
  { method: "GET", path: "/api/health", access: "PUBLIC", description: "Liveness/readiness probe." },
  { method: "GET", path: "/api/csrf", access: "PUBLIC", description: "Issue a CSRF token/cookie pair." },
  {
    method: "POST",
    path: "/api/auth/register",
    access: "PUBLIC",
    description: "Create the first admin for a new org. Rate-limited.",
  },
  {
    method: "POST",
    path: "/api/auth/login",
    access: "PUBLIC",
    description: "Password login. Rate-limited + account lockout.",
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    access: "AUTH_ONLY",
    description: "Revoke the current session.",
  },
  {
    method: "GET",
    path: "/api/auth/session",
    access: "PUBLIC",
    description: "Return the current session (or null) — never throws on unauthenticated.",
  },
  {
    method: "GET",
    path: "/api/people",
    access: PERMISSIONS.PEOPLE_READ,
    description: "List people scoped to the caller's org.",
  },
  {
    method: "POST",
    path: "/api/people",
    access: PERMISSIONS.PEOPLE_WRITE,
    description: "Create a person record in the caller's org.",
  },
  {
    method: "GET",
    path: "/api/people/export",
    access: PERMISSIONS.PEOPLE_EXPORT,
    description: "Export all people in the caller's org as CSV. Fully audited.",
  },
  {
    method: "GET",
    path: "/api/people/[id]",
    access: PERMISSIONS.PEOPLE_READ,
    description: "Read a single person, scoped by org — 404s (not 403s) across tenants.",
  },
  {
    method: "PATCH",
    path: "/api/people/[id]",
    access: PERMISSIONS.PEOPLE_WRITE,
    description: "Update a person, scoped by org.",
  },
  {
    method: "DELETE",
    path: "/api/people/[id]",
    access: PERMISSIONS.PEOPLE_DELETE,
    description: "Soft-delete a person, scoped by org.",
  },
  {
    method: "GET",
    path: "/api/audit",
    access: PERMISSIONS.AUDIT_READ,
    description: "Query the audit log, scoped to the caller's org (admin only).",
  },
  {
    method: "GET",
    path: "/api/audit/export",
    access: PERMISSIONS.AUDIT_EXPORT,
    description: "Export the audit log as CSV (admin only). Self-auditing.",
  },
  {
    method: "GET",
    path: "/api/audit/verify",
    access: PERMISSIONS.AUDIT_READ,
    description: "Recompute and verify the audit hash chain for the caller's org.",
  },
  {
    method: "GET",
    path: "/api/sessions",
    access: PERMISSIONS.SESSION_REVOKE,
    description: "List active sessions in the caller's org (admin only).",
  },
  {
    method: "POST",
    path: "/api/sessions/revoke",
    access: PERMISSIONS.SESSION_REVOKE,
    description: "Revoke a specific session — used for incident response.",
  },
];

export function findRegistryEntry(method: string, path: string): RouteRegistryEntry | undefined {
  return ROUTE_PERMISSION_REGISTRY.find((e) => e.method === method && e.path === path);
}
